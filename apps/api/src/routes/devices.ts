import { and, count, desc, eq, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { db } from "../db/client.ts";
import {
  cables,
  deviceImages,
  deviceLogs,
  deviceModels,
  deviceTags,
  deviceTypes,
  devices,
  monitoringConfig,
  tags,
} from "../db/schema.ts";
import { env } from "../env.ts";
import { deviceMonitoringError, devicePlacementError, type DeviceModelCapacity, type DeviceMonitoringInput } from "../lib/device-rules.ts";
import { detectImageKind } from "../lib/image-rules.ts";
import { maxUploadBytes, removeUpload, removeUploadByUrl, storeUpload } from "../lib/uploads.ts";
import { jsonBody } from "../lib/validation.ts";
import { requireAuth } from "../middleware/auth.ts";
import { requirePermission } from "../middleware/permission.ts";
import type { AppEnv } from "../types.ts";

// ---------------------------------------------------------------------------
// Skema input
// ---------------------------------------------------------------------------

const text = (label: string, max: number) =>
  z
    .string()
    .trim()
    .min(1, `${label} wajib diisi.`)
    .max(max, `${label} maksimal ${max} karakter.`);

const optionalText = (label: string, max: number) =>
  z
    .union([z.string().trim().max(max, `${label} maksimal ${max} karakter.`), z.null()])
    .transform((value) => (value && value.length > 0 ? value : null))
    .optional();

const optionalIp = z
  .union([z.string().trim().max(45, "IP address maksimal 45 karakter."), z.null()])
  .transform((value) => (value && value.length > 0 ? value : null))
  .optional();

const statusSchema = z.enum(["active", "offline", "unmonitored"], {
  message: "Status perangkat tidak valid.",
});

const monitoringSchema = z.object({
  enabled: z.boolean(),
  intervalSeconds: z
    .number()
    .int("Interval monitoring harus bilangan bulat.")
    .min(5, "Interval monitoring minimal 5 detik.")
    .max(86_400, "Interval monitoring maksimal 86.400 detik."),
});

const deviceFields = {
  name: text("Nama perangkat", 120),
  deviceModelId: z.string().uuid("deviceModelId harus UUID yang valid."),
  ipAddress: optionalIp,
  latitude: z
    .number()
    .min(-90, "Latitude minimal -90.")
    .max(90, "Latitude maksimal 90."),
  longitude: z
    .number()
    .min(-180, "Longitude minimal -180.")
    .max(180, "Longitude maksimal 180."),
  parentId: z.union([z.string().uuid("parentId harus UUID yang valid."), z.null()]).optional(),
  portUsed: z
    .number()
    .int("Port terpakai harus bilangan bulat.")
    .min(0, "Port terpakai tidak boleh negatif.")
    .max(100_000, "Port terpakai terlalu besar."),
  description: optionalText("Deskripsi", 2000),
  status: statusSchema,
  installedAt: z.coerce.date({ message: "Tanggal instalasi tidak valid." }).optional(),
  monitoring: monitoringSchema.optional(),
};

const createDeviceSchema = z.object({
  ...deviceFields,
  portUsed: deviceFields.portUsed.default(0),
  status: deviceFields.status.default("unmonitored"),
});

const updateDeviceSchema = z
  .object(deviceFields)
  .partial()
  .refine((value) => Object.keys(value).length > 0, "Tidak ada perubahan yang dikirim.");

const tagSchema = z.object({
  name: text("Nama tag", 40),
});

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function uuidParam(value: string | undefined, label: string): string {
  if (!value || !z.string().uuid().safeParse(value).success) {
    throw new HTTPException(404, { message: `${label} tidak ditemukan.` });
  }
  return value;
}

type ModelContext = DeviceModelCapacity & {
  id: string;
  vendor: string;
  modelName: string;
  productUrl: string | null;
  referenceImageUrl: string | null;
  deviceTypeId: string;
  icon: string;
};

async function findModelContext(id: string): Promise<ModelContext> {
  const [row] = await db
    .select({
      id: deviceModels.id,
      vendor: deviceModels.vendor,
      modelName: deviceModels.modelName,
      portCapacity: deviceModels.portCapacity,
      ponCapacity: deviceModels.ponCapacity,
      productUrl: deviceModels.productUrl,
      referenceImageUrl: deviceModels.referenceImageUrl,
      deviceTypeId: deviceTypes.id,
      typeName: deviceTypes.name,
      category: deviceTypes.category,
      requiresIp: deviceTypes.requiresIp,
      icon: deviceTypes.icon,
    })
    .from(deviceModels)
    .innerJoin(deviceTypes, eq(deviceModels.deviceTypeId, deviceTypes.id))
    .where(eq(deviceModels.id, id))
    .limit(1);

  if (!row) {
    throw new HTTPException(404, { message: "Device model tidak ditemukan." });
  }

  return row;
}

function assertPlacement(
  model: DeviceModelCapacity,
  ipAddress: string | null,
  portUsed: number,
): void {
  const message = devicePlacementError(model, { ipAddress, portUsed });
  if (message) {
    throw new HTTPException(400, { message });
  }
}

function assertMonitoring(
  model: DeviceModelCapacity,
  monitoring: DeviceMonitoringInput | undefined,
): void {
  const message = deviceMonitoringError(model, monitoring);
  if (message) {
    throw new HTTPException(400, { message });
  }
}

async function assertParent(parentId: string | null, deviceId?: string): Promise<void> {
  if (parentId === null) return;

  if (parentId === deviceId) {
    throw new HTTPException(400, {
      message: "Perangkat tidak bisa menjadi induk dirinya sendiri.",
    });
  }

  const [parent] = await db
    .select({ id: devices.id })
    .from(devices)
    .where(eq(devices.id, parentId))
    .limit(1);

  if (!parent) {
    throw new HTTPException(404, { message: "Perangkat induk tidak ditemukan." });
  }
}

type DeviceDetailRow = {
  id: string;
  name: string;
  deviceModelId: string;
  ipAddress: string | null;
  latitude: number;
  longitude: number;
  parentId: string | null;
  portUsed: number;
  description: string | null;
  status: "active" | "offline" | "unmonitored";
  installedAt: Date;
  createdAt: Date;
  updatedAt: Date;
  modelVendor: string;
  modelName: string;
  portCapacity: number | null;
  ponCapacity: number | null;
  productUrl: string | null;
  referenceImageUrl: string | null;
  typeId: string;
  typeName: string;
  typeCategory: string;
  requiresIp: boolean;
  icon: string;
  monitoringEnabled: boolean | null;
  monitoringIntervalSeconds: number | null;
};

function toDeviceDetail(row: DeviceDetailRow) {
  return {
    id: row.id,
    name: row.name,
    deviceModelId: row.deviceModelId,
    ipAddress: row.ipAddress,
    latitude: row.latitude,
    longitude: row.longitude,
    parentId: row.parentId,
    portUsed: row.portUsed,
    description: row.description,
    status: row.status,
    installedAt: row.installedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deviceModel: {
      id: row.deviceModelId,
      vendor: row.modelVendor,
      modelName: row.modelName,
      portCapacity: row.portCapacity,
      ponCapacity: row.ponCapacity,
      productUrl: row.productUrl,
      referenceImageUrl: row.referenceImageUrl,
    },
    deviceType: {
      id: row.typeId,
      name: row.typeName,
      category: row.typeCategory,
      requiresIp: row.requiresIp,
      icon: row.icon,
    },
    monitoring:
      row.monitoringEnabled === null
        ? null
        : {
            enabled: row.monitoringEnabled,
            intervalSeconds: row.monitoringIntervalSeconds ?? 60,
          },
  };
}

async function findDeviceDetail(id: string) {
  const [row] = await db
    .select({
      id: devices.id,
      name: devices.name,
      deviceModelId: devices.deviceModelId,
      ipAddress: devices.ipAddress,
      latitude: devices.latitude,
      longitude: devices.longitude,
      parentId: devices.parentId,
      portUsed: devices.portUsed,
      description: devices.description,
      status: devices.status,
      installedAt: devices.installedAt,
      createdAt: devices.createdAt,
      updatedAt: devices.updatedAt,
      modelVendor: deviceModels.vendor,
      modelName: deviceModels.modelName,
      portCapacity: deviceModels.portCapacity,
      ponCapacity: deviceModels.ponCapacity,
      productUrl: deviceModels.productUrl,
      referenceImageUrl: deviceModels.referenceImageUrl,
      typeId: deviceTypes.id,
      typeName: deviceTypes.name,
      typeCategory: deviceTypes.category,
      requiresIp: deviceTypes.requiresIp,
      icon: deviceTypes.icon,
      monitoringEnabled: monitoringConfig.enabled,
      monitoringIntervalSeconds: monitoringConfig.intervalSeconds,
    })
    .from(devices)
    .innerJoin(deviceModels, eq(devices.deviceModelId, deviceModels.id))
    .innerJoin(deviceTypes, eq(deviceModels.deviceTypeId, deviceTypes.id))
    .leftJoin(monitoringConfig, eq(monitoringConfig.deviceId, devices.id))
    .where(eq(devices.id, id))
    .limit(1);

  if (!row) {
    throw new HTTPException(404, { message: "Perangkat tidak ditemukan." });
  }

  return {
    ...toDeviceDetail(row),
    tags: await findDeviceTags(id),
    images: await findDeviceImages(id),
  };
}

async function findDeviceTags(deviceId: string) {
  return db
    .select({ id: tags.id, name: tags.name })
    .from(deviceTags)
    .innerJoin(tags, eq(deviceTags.tagId, tags.id))
    .where(eq(deviceTags.deviceId, deviceId))
    .orderBy(tags.name);
}

async function findDeviceImages(deviceId: string) {
  return db
    .select({
      id: deviceImages.id,
      imageUrl: deviceImages.imageUrl,
      caption: deviceImages.caption,
      uploadedAt: deviceImages.uploadedAt,
    })
    .from(deviceImages)
    .where(eq(deviceImages.deviceId, deviceId))
    .orderBy(desc(deviceImages.uploadedAt), desc(deviceImages.id));
}

async function assertDeviceExists(id: string): Promise<void> {
  const [existing] = await db
    .select({ id: devices.id })
    .from(devices)
    .where(eq(devices.id, id))
    .limit(1);

  if (!existing) {
    throw new HTTPException(404, { message: "Perangkat tidak ditemukan." });
  }
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

const devicesRoutes = new Hono<AppEnv>();

devicesRoutes.use("*", requireAuth);

/** Daftar ringan untuk marker peta. */
devicesRoutes.get("/", requirePermission("devices", "read"), async (c) => {
  const rows = await db
    .select({
      id: devices.id,
      name: devices.name,
      latitude: devices.latitude,
      longitude: devices.longitude,
      status: devices.status,
      deviceTypeId: deviceTypes.id,
      typeName: deviceTypes.name,
      icon: deviceTypes.icon,
      tagIds: sql<string[]>`COALESCE(array_agg(DISTINCT ${deviceTags.tagId}) FILTER (WHERE ${deviceTags.tagId} IS NOT NULL), '{}')`,
    })
    .from(devices)
    .innerJoin(deviceModels, eq(devices.deviceModelId, deviceModels.id))
    .innerJoin(deviceTypes, eq(deviceModels.deviceTypeId, deviceTypes.id))
    .leftJoin(deviceTags, eq(devices.id, deviceTags.deviceId))
    .groupBy(devices.id, deviceTypes.id)
    .orderBy(devices.name);

  return c.json({ devices: rows });
});

devicesRoutes.get("/:id/logs", requirePermission("devices", "read"), async (c) => {
  const id = uuidParam(c.req.param("id"), "Perangkat");
  await assertDeviceExists(id);

  const rows = await db
    .select({
      id: deviceLogs.id,
      action: deviceLogs.action,
      changedBy: deviceLogs.changedBy,
      createdAt: deviceLogs.createdAt,
    })
    .from(deviceLogs)
    .where(eq(deviceLogs.deviceId, id))
    .orderBy(desc(deviceLogs.createdAt))
    .limit(50);

  return c.json({ logs: rows });
});

devicesRoutes.post(
  "/:id/tags",
  requirePermission("devices", "write"),
  jsonBody(tagSchema),
  async (c) => {
    const id = uuidParam(c.req.param("id"), "Perangkat");
    const data = c.req.valid("json");
    const user = c.get("user");

    await assertDeviceExists(id);

    await db.transaction(async (tx) => {
      // Tag dicocokkan tanpa membedakan huruf besar/kecil, sesuai unique
      // index lower(name) di database. Nama asli tag pertama dipertahankan.
      const [existing] = await tx
        .select({ id: tags.id })
        .from(tags)
        .where(sql`lower(${tags.name}) = lower(${data.name})`)
        .limit(1);

      let tagId = existing?.id;

      if (!tagId) {
        const [created] = await tx
          .insert(tags)
          .values({ name: data.name })
          .onConflictDoNothing()
          .returning({ id: tags.id });

        tagId = created?.id;

        if (!tagId) {
          // Bisa terjadi bila dua request membuat tag yang sama bersamaan.
          const [fallback] = await tx
            .select({ id: tags.id })
            .from(tags)
            .where(sql`lower(${tags.name}) = lower(${data.name})`)
            .limit(1);
          tagId = fallback?.id;
        }
      }

      if (!tagId) {
        throw new HTTPException(500, { message: "Gagal menyimpan tag." });
      }

      const attached = await tx
        .insert(deviceTags)
        .values({ deviceId: id, tagId })
        .onConflictDoNothing()
        .returning({ tagId: deviceTags.tagId });

      if (attached.length > 0) {
        await tx.insert(deviceLogs).values({
          deviceId: id,
          action: "update",
          changedBy: user.email,
        });
      }
    });

    return c.json({ tags: await findDeviceTags(id) });
  },
);

devicesRoutes.delete(
  "/:id/tags/:tagId",
  requirePermission("devices", "write"),
  async (c) => {
    const id = uuidParam(c.req.param("id"), "Perangkat");
    const tagId = uuidParam(c.req.param("tagId"), "Tag");
    const user = c.get("user");

    await assertDeviceExists(id);

    await db.transaction(async (tx) => {
      const removed = await tx
        .delete(deviceTags)
        .where(and(eq(deviceTags.deviceId, id), eq(deviceTags.tagId, tagId)))
        .returning({ tagId: deviceTags.tagId });

      if (removed.length > 0) {
        await tx.insert(deviceLogs).values({
          deviceId: id,
          action: "update",
          changedBy: user.email,
        });
      }
    });

    return c.json({ tags: await findDeviceTags(id) });
  },
);

devicesRoutes.post(
  "/:id/images",
  requirePermission("devices", "write"),
  async (c) => {
    const id = uuidParam(c.req.param("id"), "Perangkat");
    await assertDeviceExists(id);

    const tooLargeMessage = `Ukuran file maksimal ${env.MAX_UPLOAD_MB} MB.`;
    const contentLength = Number(c.req.header("content-length") ?? "0");

    if (
      Number.isFinite(contentLength) &&
      contentLength > maxUploadBytes + 1024 * 1024
    ) {
      throw new HTTPException(413, { message: tooLargeMessage });
    }

    let body: Record<string, unknown>;
    try {
      body = await c.req.parseBody();
    } catch {
      throw new HTTPException(400, {
        message: "Body upload tidak valid. Kirim file sebagai multipart/form-data.",
      });
    }

    const file = body.file;
    if (!(file instanceof File)) {
      throw new HTTPException(400, { message: "File gambar wajib diunggah." });
    }

    if (file.size === 0) {
      throw new HTTPException(400, { message: "File gambar kosong." });
    }

    if (file.size > maxUploadBytes) {
      throw new HTTPException(413, { message: tooLargeMessage });
    }

    const captionValue = body.caption;
    if (captionValue !== undefined && typeof captionValue !== "string") {
      throw new HTTPException(400, { message: "Caption tidak valid." });
    }

    const caption = (captionValue ?? "").trim();
    if (caption.length > 200) {
      throw new HTTPException(400, {
        message: "Caption maksimal 200 karakter.",
      });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const kind = detectImageKind(bytes);

    if (!kind) {
      throw new HTTPException(400, {
        message: "File harus berupa gambar JPG, PNG, WebP, atau GIF.",
      });
    }

    const filename = await storeUpload(bytes, kind);
    const imageUrl = `/uploads/${filename}`;
    const user = c.get("user");

    let image: {
      id: string;
      imageUrl: string;
      caption: string | null;
      uploadedAt: Date;
    };

    try {
      image = await db.transaction(async (tx) => {
        const [created] = await tx
          .insert(deviceImages)
          .values({
            deviceId: id,
            imageUrl,
            caption: caption.length > 0 ? caption : null,
          })
          .returning({
            id: deviceImages.id,
            imageUrl: deviceImages.imageUrl,
            caption: deviceImages.caption,
            uploadedAt: deviceImages.uploadedAt,
          });

        if (!created) {
          throw new HTTPException(500, { message: "Gagal menyimpan gambar." });
        }

        await tx.insert(deviceLogs).values({
          deviceId: id,
          action: "update",
          changedBy: user.email,
        });

        return created;
      });
    } catch (error) {
      // Jangan tinggalkan file yatim bila record database gagal dibuat.
      await removeUpload(filename);
      throw error;
    }

    return c.json({ image, images: await findDeviceImages(id) }, 201);
  },
);

devicesRoutes.get("/:id", requirePermission("devices", "read"), async (c) => {
  const id = uuidParam(c.req.param("id"), "Perangkat");
  return c.json({ device: await findDeviceDetail(id) });
});

devicesRoutes.post(
  "/",
  requirePermission("devices", "write"),
  jsonBody(createDeviceSchema),
  async (c) => {
    const data = c.req.valid("json");
    const user = c.get("user");

    const model = await findModelContext(data.deviceModelId);
    assertPlacement(model, data.ipAddress ?? null, data.portUsed);
    assertMonitoring(model, data.monitoring);
    await assertParent(data.parentId ?? null);

    let createdId = "";

    await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(devices)
        .values({
          name: data.name,
          deviceModelId: data.deviceModelId,
          ipAddress: data.ipAddress ?? null,
          latitude: data.latitude,
          longitude: data.longitude,
          parentId: data.parentId ?? null,
          portUsed: data.portUsed,
          description: data.description ?? null,
          status: data.status,
          ...(data.installedAt ? { installedAt: data.installedAt } : {}),
        })
        .returning({ id: devices.id });

      if (!created) {
        throw new HTTPException(500, { message: "Gagal menyimpan perangkat." });
      }

      createdId = created.id;

      await tx.insert(deviceLogs).values({
        deviceId: created.id,
        action: "create",
        changedBy: user.email,
      });

      if (data.monitoring) {
        await tx.insert(monitoringConfig).values({
          deviceId: created.id,
          enabled: data.monitoring.enabled,
          intervalSeconds: data.monitoring.intervalSeconds,
          nextCheckAt: new Date(),
        });
      }
    });

    return c.json({ device: await findDeviceDetail(createdId) }, 201);
  },
);

devicesRoutes.patch(
  "/:id",
  requirePermission("devices", "write"),
  jsonBody(updateDeviceSchema),
  async (c) => {
    const id = uuidParam(c.req.param("id"), "Perangkat");
    const data = c.req.valid("json");
    const user = c.get("user");

    const [existing] = await db
      .select({
        id: devices.id,
        deviceModelId: devices.deviceModelId,
        ipAddress: devices.ipAddress,
        portUsed: devices.portUsed,
        latitude: devices.latitude,
        longitude: devices.longitude,
      })
      .from(devices)
      .where(eq(devices.id, id))
      .limit(1);

    if (!existing) {
      throw new HTTPException(404, { message: "Perangkat tidak ditemukan." });
    }

    const model = await findModelContext(data.deviceModelId ?? existing.deviceModelId);
    const nextIp = data.ipAddress === undefined ? existing.ipAddress : data.ipAddress;
    const nextPortUsed = data.portUsed ?? existing.portUsed;
    const nextLatitude = data.latitude ?? existing.latitude;
    const nextLongitude = data.longitude ?? existing.longitude;
    const moved = data.latitude !== undefined || data.longitude !== undefined;

    assertPlacement(model, nextIp, nextPortUsed);
    assertMonitoring(model, data.monitoring);

    if (data.parentId !== undefined) {
      await assertParent(data.parentId, id);
    }

    const patch: Partial<typeof devices.$inferInsert> = { updatedAt: new Date() };
    if (data.name !== undefined) patch.name = data.name;
    if (data.deviceModelId !== undefined) patch.deviceModelId = data.deviceModelId;
    if (data.ipAddress !== undefined) patch.ipAddress = data.ipAddress;
    if (data.latitude !== undefined) patch.latitude = data.latitude;
    if (data.longitude !== undefined) patch.longitude = data.longitude;
    if (data.parentId !== undefined) patch.parentId = data.parentId;
    if (data.portUsed !== undefined) patch.portUsed = data.portUsed;
    if (data.description !== undefined) patch.description = data.description;
    if (data.status !== undefined) patch.status = data.status;
    if (data.installedAt !== undefined) patch.installedAt = data.installedAt;

    await db.transaction(async (tx) => {
      await tx.update(devices).set(patch).where(eq(devices.id, id));
      await tx.insert(deviceLogs).values({
        deviceId: id,
        action: "update",
        changedBy: user.email,
      });

      if (data.monitoring) {
        const now = new Date();
        await tx
          .insert(monitoringConfig)
          .values({
            deviceId: id,
            enabled: data.monitoring.enabled,
            intervalSeconds: data.monitoring.intervalSeconds,
            nextCheckAt: now,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: monitoringConfig.deviceId,
            set: {
              enabled: data.monitoring.enabled,
              intervalSeconds: data.monitoring.intervalSeconds,
              nextCheckAt: now,
              updatedAt: now,
            },
          });
      } else if (!model.requiresIp) {
        // Model bisa diganti lewat API. Jangan tinggalkan konfigurasi
        // monitoring lama pada perangkat pasif yang tidak bisa di-ping.
        await tx.delete(monitoringConfig).where(eq(monitoringConfig.deviceId, id));
      }

      if (moved) {
        // Saat device dipindahkan, kabel yang terhubung perlu diupdate panjangnya.
        // Path tidak diubah - user harus manually edit/redraw cable kalau mau adjust jalur.
        const connected = await tx
          .select({
            id: cables.id,
            path: cables.path,
          })
          .from(cables)
          .where(or(eq(cables.deviceFromId, id), eq(cables.deviceToId, id)));

        for (const cable of connected) {
          // Recalculate length dari path yang ada (tidak ubah path)
          const { pathLengthMeters, roundLengthMeters } = await import("../lib/cable-rules.ts");
          const newLength = roundLengthMeters(pathLengthMeters(cable.path));

          await tx
            .update(cables)
            .set({ length: newLength, updatedAt: new Date() })
            .where(eq(cables.id, cable.id));
        }
      }
    });

    return c.json({ device: await findDeviceDetail(id) });
  },
);

devicesRoutes.delete("/:id", requirePermission("devices", "delete"), async (c) => {
  const id = uuidParam(c.req.param("id"), "Perangkat");
  const user = c.get("user");

  const [existing] = await db
    .select({ id: devices.id })
    .from(devices)
    .where(eq(devices.id, id))
    .limit(1);

  if (!existing) {
    throw new HTTPException(404, { message: "Perangkat tidak ditemukan." });
  }

  const [cableUsage] = await db
    .select({ value: count() })
    .from(cables)
    .where(or(eq(cables.deviceFromId, id), eq(cables.deviceToId, id)));
  const usedByCables = Number(cableUsage?.value ?? 0);

  if (usedByCables > 0) {
    throw new HTTPException(409, {
      message: `Perangkat masih dipakai oleh ${usedByCables} kabel. Hapus kabel tersebut terlebih dahulu.`,
    });
  }

  // Simpan URL sebelum baris device_images ikut terhapus lewat cascade,
  // supaya file di volume lokal tidak tertinggal sebagai sampah.
  const imageRows = await db
    .select({ imageUrl: deviceImages.imageUrl })
    .from(deviceImages)
    .where(eq(deviceImages.deviceId, id));

  await db.transaction(async (tx) => {
    await tx.insert(deviceLogs).values({
      deviceId: id,
      action: "delete",
      changedBy: user.email,
    });
    await tx.delete(devices).where(eq(devices.id, id));
  });

  for (const image of imageRows) {
    await removeUploadByUrl(image.imageUrl);
  }

  return c.body(null, 204);
});

export default devicesRoutes;
