import { count, eq, or } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { db } from "../db/client.ts";
import {
  cables,
  deviceLogs,
  deviceModels,
  deviceTypes,
  devices,
  monitoringConfig,
} from "../db/schema.ts";
import {
  deviceMonitoringError,
  devicePlacementError,
  type DeviceModelCapacity,
  type DeviceMonitoringInput,
} from "../lib/device-rules.ts";
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

  return toDeviceDetail(row);
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
    })
    .from(devices)
    .innerJoin(deviceModels, eq(devices.deviceModelId, deviceModels.id))
    .innerJoin(deviceTypes, eq(deviceModels.deviceTypeId, deviceTypes.id))
    .orderBy(devices.name);

  return c.json({ devices: rows });
});

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

  await db.transaction(async (tx) => {
    await tx.insert(deviceLogs).values({
      deviceId: id,
      action: "delete",
      changedBy: user.email,
    });
    await tx.delete(devices).where(eq(devices.id, id));
  });

  return c.body(null, 204);
});

export default devicesRoutes;
