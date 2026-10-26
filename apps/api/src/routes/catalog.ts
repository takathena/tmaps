import { count, eq } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { db } from "../db/client.ts";
import { cableTypes, cables, deviceModels, deviceTypes, devices } from "../db/schema.ts";
import { capacityValidationError, usesPonCapacity } from "../lib/catalog-rules.ts";
import { jsonBody, queryParams } from "../lib/validation.ts";
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

const optionalUrl = z
  .union([z.string().trim().max(2048, "URL maksimal 2048 karakter."), z.null()])
  .transform((value) => (value && value.length > 0 ? value : null))
  .refine(
    (value) => value === null || /^https?:\/\//i.test(value),
    "URL harus diawali http:// atau https://.",
  )
  .optional();

const capacity = z
  .number()
  .int("Kapasitas harus bilangan bulat.")
  .min(0, "Kapasitas tidak boleh negatif.")
  .max(100_000, "Kapasitas terlalu besar.")
  .nullish();

const deviceTypeFields = {
  name: text("Nama device type", 80),
  category: text("Kategori", 80),
  requiresIp: z.boolean(),
  icon: text("Icon", 50),
};

const createDeviceTypeSchema = z.object({
  ...deviceTypeFields,
  requiresIp: deviceTypeFields.requiresIp.default(false),
});

const updateDeviceTypeSchema = z
  .object(deviceTypeFields)
  .partial()
  .refine((value) => Object.keys(value).length > 0, "Tidak ada perubahan yang dikirim.");

const deviceModelFields = {
  deviceTypeId: z.string().uuid("deviceTypeId harus UUID yang valid."),
  vendor: text("Vendor", 80),
  modelName: text("Nama model", 120),
  portCapacity: capacity,
  ponCapacity: capacity,
  productUrl: optionalUrl,
  referenceImageUrl: optionalUrl,
};

const createDeviceModelSchema = z.object(deviceModelFields);

const updateDeviceModelSchema = z
  .object(deviceModelFields)
  .partial()
  .refine((value) => Object.keys(value).length > 0, "Tidak ada perubahan yang dikirim.");

const cableTypeFields = {
  vendor: text("Vendor", 80),
  modelName: text("Nama model", 120),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Warna kabel harus format hex #RRGGBB."),
  coreCapacity: z
    .number()
    .int("Core capacity harus bilangan bulat.")
    .positive("Core capacity harus lebih dari 0.")
    .max(100_000, "Core capacity terlalu besar."),
  productUrl: optionalUrl,
};

const createCableTypeSchema = z.object(cableTypeFields);

const updateCableTypeSchema = z
  .object(cableTypeFields)
  .partial()
  .refine((value) => Object.keys(value).length > 0, "Tidak ada perubahan yang dikirim.");

const modelListQuerySchema = z.object({
  deviceTypeId: z.string().uuid("deviceTypeId harus UUID yang valid.").optional(),
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

async function findDeviceType(id: string) {
  const [row] = await db.select().from(deviceTypes).where(eq(deviceTypes.id, id)).limit(1);

  if (!row) {
    throw new HTTPException(404, { message: "Device type tidak ditemukan." });
  }

  return row;
}

function assertCapacity(
  type: { name: string; category: string },
  portCapacity: number | null | undefined,
  ponCapacity: number | null | undefined,
): void {
  const message = capacityValidationError(type, portCapacity, ponCapacity);
  if (message) {
    throw new HTTPException(400, { message });
  }
}

async function ensureDeviceTypeNameAvailable(name: string, excludeId?: string): Promise<void> {
  const [existing] = await db
    .select({ id: deviceTypes.id })
    .from(deviceTypes)
    .where(eq(deviceTypes.name, name))
    .limit(1);

  if (existing && existing.id !== excludeId) {
    throw new HTTPException(409, { message: "Nama device type sudah dipakai." });
  }
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

const catalogRoutes = new Hono<AppEnv>();

catalogRoutes.use("*", requireAuth);

// --- Device Type -----------------------------------------------------------

catalogRoutes.get("/device-types", requirePermission("catalog", "read"), async (c) => {
  const rows = await db.select().from(deviceTypes).orderBy(deviceTypes.name);
  return c.json({ deviceTypes: rows });
});

catalogRoutes.post(
  "/device-types",
  requirePermission("catalog", "write"),
  jsonBody(createDeviceTypeSchema),
  async (c) => {
    const data = c.req.valid("json");
    await ensureDeviceTypeNameAvailable(data.name);

    const [created] = await db.insert(deviceTypes).values(data).returning();
    return c.json({ deviceType: created }, 201);
  },
);

catalogRoutes.patch(
  "/device-types/:id",
  requirePermission("catalog", "write"),
  jsonBody(updateDeviceTypeSchema),
  async (c) => {
    const id = uuidParam(c.req.param("id"), "Device type");
    const existing = await findDeviceType(id);
    const data = c.req.valid("json");

    const nextName = data.name ?? existing.name;
    const nextCategory = data.category ?? existing.category;

    if (data.name !== undefined) {
      await ensureDeviceTypeNameAvailable(data.name, id);
    }

    const wasPon = usesPonCapacity(existing);
    const willBePon = usesPonCapacity({ name: nextName, category: nextCategory });

    if (wasPon !== willBePon) {
      const [usage] = await db
        .select({ value: count() })
        .from(deviceModels)
        .where(eq(deviceModels.deviceTypeId, id));

      if (Number(usage?.value ?? 0) > 0) {
        throw new HTTPException(409, {
          message:
            "Jenis kapasitas device type tidak bisa diubah karena sudah memiliki model. Ubah atau hapus model terlebih dahulu.",
        });
      }
    }

    const [updated] = await db
      .update(deviceTypes)
      .set({
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.category !== undefined ? { category: data.category } : {}),
        ...(data.requiresIp !== undefined ? { requiresIp: data.requiresIp } : {}),
        ...(data.icon !== undefined ? { icon: data.icon } : {}),
        updatedAt: new Date(),
      })
      .where(eq(deviceTypes.id, id))
      .returning();

    return c.json({ deviceType: updated });
  },
);

catalogRoutes.delete(
  "/device-types/:id",
  requirePermission("catalog", "delete"),
  async (c) => {
    const id = uuidParam(c.req.param("id"), "Device type");
    await findDeviceType(id);

    const [modelsUsage] = await db
      .select({ value: count() })
      .from(deviceModels)
      .where(eq(deviceModels.deviceTypeId, id));
    const usedByModels = Number(modelsUsage?.value ?? 0);

    if (usedByModels > 0) {
      throw new HTTPException(409, {
        message: `Device type masih dipakai oleh ${usedByModels} model. Hapus model tersebut terlebih dahulu.`,
      });
    }

    await db.delete(deviceTypes).where(eq(deviceTypes.id, id));
    return c.body(null, 204);
  },
);

// --- Device Model ----------------------------------------------------------

catalogRoutes.get(
  "/device-models",
  requirePermission("catalog", "read"),
  queryParams(modelListQuerySchema),
  async (c) => {
    const { deviceTypeId } = c.req.valid("query");

    const rows = await db
      .select()
      .from(deviceModels)
      .where(deviceTypeId ? eq(deviceModels.deviceTypeId, deviceTypeId) : undefined)
      .orderBy(deviceModels.vendor, deviceModels.modelName);

    return c.json({ deviceModels: rows });
  },
);

catalogRoutes.post(
  "/device-models",
  requirePermission("catalog", "write"),
  jsonBody(createDeviceModelSchema),
  async (c) => {
    const data = c.req.valid("json");
    const type = await findDeviceType(data.deviceTypeId);

    assertCapacity(type, data.portCapacity, data.ponCapacity);

    const [created] = await db
      .insert(deviceModels)
      .values({
        deviceTypeId: data.deviceTypeId,
        vendor: data.vendor,
        modelName: data.modelName,
        portCapacity: data.portCapacity ?? null,
        ponCapacity: data.ponCapacity ?? null,
        productUrl: data.productUrl ?? null,
        referenceImageUrl: data.referenceImageUrl ?? null,
      })
      .returning();

    return c.json({ deviceModel: created }, 201);
  },
);

catalogRoutes.patch(
  "/device-models/:id",
  requirePermission("catalog", "write"),
  jsonBody(updateDeviceModelSchema),
  async (c) => {
    const id = uuidParam(c.req.param("id"), "Device model");
    const data = c.req.valid("json");

    const [existing] = await db
      .select()
      .from(deviceModels)
      .where(eq(deviceModels.id, id))
      .limit(1);

    if (!existing) {
      throw new HTTPException(404, { message: "Device model tidak ditemukan." });
    }

    const typeId = data.deviceTypeId ?? existing.deviceTypeId;
    const type = await findDeviceType(typeId);
    const portCapacity =
      data.portCapacity === undefined ? existing.portCapacity : data.portCapacity;
    const ponCapacity =
      data.ponCapacity === undefined ? existing.ponCapacity : data.ponCapacity;

    assertCapacity(type, portCapacity, ponCapacity);

    const [updated] = await db
      .update(deviceModels)
      .set({
        ...(data.deviceTypeId !== undefined ? { deviceTypeId: data.deviceTypeId } : {}),
        ...(data.vendor !== undefined ? { vendor: data.vendor } : {}),
        ...(data.modelName !== undefined ? { modelName: data.modelName } : {}),
        ...(data.portCapacity !== undefined ? { portCapacity: data.portCapacity } : {}),
        ...(data.ponCapacity !== undefined ? { ponCapacity: data.ponCapacity } : {}),
        ...(data.productUrl !== undefined ? { productUrl: data.productUrl } : {}),
        ...(data.referenceImageUrl !== undefined
          ? { referenceImageUrl: data.referenceImageUrl }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(deviceModels.id, id))
      .returning();

    return c.json({ deviceModel: updated });
  },
);

catalogRoutes.delete(
  "/device-models/:id",
  requirePermission("catalog", "delete"),
  async (c) => {
    const id = uuidParam(c.req.param("id"), "Device model");

    const [existing] = await db
      .select({ id: deviceModels.id })
      .from(deviceModels)
      .where(eq(deviceModels.id, id))
      .limit(1);

    if (!existing) {
      throw new HTTPException(404, { message: "Device model tidak ditemukan." });
    }

    const [devicesUsage] = await db
      .select({ value: count() })
      .from(devices)
      .where(eq(devices.deviceModelId, id));
    const usedByDevices = Number(devicesUsage?.value ?? 0);

    if (usedByDevices > 0) {
      throw new HTTPException(409, {
        message: `Device model masih dipakai oleh ${usedByDevices} perangkat. Hapus perangkat tersebut terlebih dahulu.`,
      });
    }

    await db.delete(deviceModels).where(eq(deviceModels.id, id));
    return c.body(null, 204);
  },
);

// --- Cable Type ------------------------------------------------------------

catalogRoutes.get("/cable-types", requirePermission("catalog", "read"), async (c) => {
  const rows = await db.select().from(cableTypes).orderBy(cableTypes.vendor, cableTypes.modelName);
  return c.json({ cableTypes: rows });
});

catalogRoutes.post(
  "/cable-types",
  requirePermission("catalog", "write"),
  jsonBody(createCableTypeSchema),
  async (c) => {
    const data = c.req.valid("json");

    const [created] = await db
      .insert(cableTypes)
      .values({
        vendor: data.vendor,
        modelName: data.modelName,
        color: data.color.toLowerCase(),
        coreCapacity: data.coreCapacity,
        productUrl: data.productUrl ?? null,
      })
      .returning();

    return c.json({ cableType: created }, 201);
  },
);

catalogRoutes.patch(
  "/cable-types/:id",
  requirePermission("catalog", "write"),
  jsonBody(updateCableTypeSchema),
  async (c) => {
    const id = uuidParam(c.req.param("id"), "Cable type");
    const data = c.req.valid("json");

    const [existing] = await db
      .select({ id: cableTypes.id })
      .from(cableTypes)
      .where(eq(cableTypes.id, id))
      .limit(1);

    if (!existing) {
      throw new HTTPException(404, { message: "Cable type tidak ditemukan." });
    }

    const [updated] = await db
      .update(cableTypes)
      .set({
        ...(data.vendor !== undefined ? { vendor: data.vendor } : {}),
        ...(data.modelName !== undefined ? { modelName: data.modelName } : {}),
        ...(data.color !== undefined ? { color: data.color.toLowerCase() } : {}),
        ...(data.coreCapacity !== undefined ? { coreCapacity: data.coreCapacity } : {}),
        ...(data.productUrl !== undefined ? { productUrl: data.productUrl } : {}),
        updatedAt: new Date(),
      })
      .where(eq(cableTypes.id, id))
      .returning();

    return c.json({ cableType: updated });
  },
);

catalogRoutes.delete(
  "/cable-types/:id",
  requirePermission("catalog", "delete"),
  async (c) => {
    const id = uuidParam(c.req.param("id"), "Cable type");

    const [existing] = await db
      .select({ id: cableTypes.id })
      .from(cableTypes)
      .where(eq(cableTypes.id, id))
      .limit(1);

    if (!existing) {
      throw new HTTPException(404, { message: "Cable type tidak ditemukan." });
    }

    const [cablesUsage] = await db
      .select({ value: count() })
      .from(cables)
      .where(eq(cables.cableTypeId, id));
    const usedByCables = Number(cablesUsage?.value ?? 0);

    if (usedByCables > 0) {
      throw new HTTPException(409, {
        message: `Cable type masih dipakai oleh ${usedByCables} kabel. Hapus kabel tersebut terlebih dahulu.`,
      });
    }

    await db.delete(cableTypes).where(eq(cableTypes.id, id));
    return c.body(null, 204);
  },
);

export default catalogRoutes;
