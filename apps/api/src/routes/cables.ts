import { eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { db } from "../db/client.ts";
import { cableTypes, cables, devices, type CablePathPoint } from "../db/schema.ts";
import {
  cableCoreError,
  pathLengthMeters,
  roundLengthMeters,
} from "../lib/cable-rules.ts";
import { jsonBody } from "../lib/validation.ts";
import { requireAuth } from "../middleware/auth.ts";
import { requirePermission } from "../middleware/permission.ts";
import type { AppEnv } from "../types.ts";

// ---------------------------------------------------------------------------
// Skema input
// ---------------------------------------------------------------------------

const pathPointSchema = z.object({
  lat: z
    .number()
    .min(-90, "Latitude titik kabel minimal -90.")
    .max(90, "Latitude titik kabel maksimal 90."),
  lng: z
    .number()
    .min(-180, "Longitude titik kabel minimal -180.")
    .max(180, "Longitude titik kabel maksimal 180."),
});

const pathSchema = z
  .array(pathPointSchema)
  .min(2, "Path kabel minimal berisi 2 titik.")
  .max(200, "Path kabel maksimal 200 titik.");

const lengthSchema = z
  .number()
  .positive("Panjang kabel harus lebih dari 0.")
  .max(10_000_000, "Panjang kabel terlalu besar.");

const coreUsedSchema = z
  .number()
  .int("Core terpakai harus bilangan bulat.")
  .min(1, "Core terpakai minimal 1.")
  .max(100_000, "Core terpakai terlalu besar.");

const cableFields = {
  cableTypeId: z.string().uuid("cableTypeId harus UUID yang valid."),
  deviceFromId: z.string().uuid("deviceFromId harus UUID yang valid."),
  deviceToId: z.string().uuid("deviceToId harus UUID yang valid."),
  path: pathSchema,
  length: lengthSchema.optional(),
  coreUsed: coreUsedSchema,
};

const createCableSchema = z.object(cableFields);

const updateCableSchema = z
  .object(cableFields)
  .partial()
  .refine((value) => Object.keys(value).length > 0, "Tidak ada perubahan yang dikirim.");

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

const fromDevices = alias(devices, "cable_from_device");
const toDevices = alias(devices, "cable_to_device");

function uuidParam(value: string | undefined, label: string): string {
  if (!value || !z.string().uuid().safeParse(value).success) {
    throw new HTTPException(404, { message: `${label} tidak ditemukan.` });
  }
  return value;
}

async function findCableType(id: string) {
  const [row] = await db.select().from(cableTypes).where(eq(cableTypes.id, id)).limit(1);

  if (!row) {
    throw new HTTPException(404, { message: "Cable type tidak ditemukan." });
  }

  return row;
}

async function assertEndpoints(fromId: string, toId: string): Promise<void> {
  if (fromId === toId) {
    throw new HTTPException(400, {
      message: "Perangkat asal dan tujuan kabel harus berbeda.",
    });
  }

  const rows = await db
    .select({ id: devices.id })
    .from(devices)
    .where(inArray(devices.id, [fromId, toId]));

  if (rows.length !== 2) {
    throw new HTTPException(404, {
      message: "Perangkat asal atau tujuan kabel tidak ditemukan.",
    });
  }
}

function assertCore(coreUsed: number, coreCapacity: number): void {
  const message = cableCoreError(coreUsed, coreCapacity);
  if (message) {
    throw new HTTPException(400, { message });
  }
}

type CableRow = {
  id: string;
  cableTypeId: string;
  deviceFromId: string;
  deviceToId: string;
  path: CablePathPoint[];
  length: number;
  coreUsed: number;
  createdAt: Date;
  updatedAt: Date;
  typeVendor: string;
  typeModelName: string;
  typeColor: string;
  coreCapacity: number;
  fromName: string;
  toName: string;
};

const cableSelection = {
  id: cables.id,
  cableTypeId: cables.cableTypeId,
  deviceFromId: cables.deviceFromId,
  deviceToId: cables.deviceToId,
  path: cables.path,
  length: cables.length,
  coreUsed: cables.coreUsed,
  createdAt: cables.createdAt,
  updatedAt: cables.updatedAt,
  typeVendor: cableTypes.vendor,
  typeModelName: cableTypes.modelName,
  typeColor: cableTypes.color,
  coreCapacity: cableTypes.coreCapacity,
  fromName: fromDevices.name,
  toName: toDevices.name,
};

function toCable(row: CableRow) {
  return {
    id: row.id,
    cableTypeId: row.cableTypeId,
    deviceFromId: row.deviceFromId,
    deviceToId: row.deviceToId,
    path: row.path,
    length: row.length,
    coreUsed: row.coreUsed,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    cableType: {
      id: row.cableTypeId,
      vendor: row.typeVendor,
      modelName: row.typeModelName,
      color: row.typeColor,
      coreCapacity: row.coreCapacity,
    },
    deviceFrom: { id: row.deviceFromId, name: row.fromName },
    deviceTo: { id: row.deviceToId, name: row.toName },
  };
}

function baseCableQuery() {
  return db
    .select(cableSelection)
    .from(cables)
    .innerJoin(cableTypes, eq(cables.cableTypeId, cableTypes.id))
    .innerJoin(fromDevices, eq(cables.deviceFromId, fromDevices.id))
    .innerJoin(toDevices, eq(cables.deviceToId, toDevices.id));
}

async function findCableDetail(id: string) {
  const [row] = await baseCableQuery().where(eq(cables.id, id)).limit(1);
  return row ? toCable(row) : null;
}

async function findCableRow(id: string) {
  const [row] = await db.select().from(cables).where(eq(cables.id, id)).limit(1);
  return row ?? null;
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

const cablesRoutes = new Hono<AppEnv>();

cablesRoutes.use("*", requireAuth);

cablesRoutes.get("/", requirePermission("cables", "read"), async (c) => {
  const rows = await baseCableQuery().orderBy(cables.createdAt);
  return c.json({ cables: rows.map(toCable) });
});

cablesRoutes.get("/:id", requirePermission("cables", "read"), async (c) => {
  const id = uuidParam(c.req.param("id"), "Kabel");
  const cable = await findCableDetail(id);

  if (!cable) {
    throw new HTTPException(404, { message: "Kabel tidak ditemukan." });
  }

  return c.json({ cable });
});

cablesRoutes.post(
  "/",
  requirePermission("cables", "write"),
  jsonBody(createCableSchema),
  async (c) => {
    const data = c.req.valid("json");
    const type = await findCableType(data.cableTypeId);
    await assertEndpoints(data.deviceFromId, data.deviceToId);
    assertCore(data.coreUsed, type.coreCapacity);

    const length = roundLengthMeters(
      data.length ?? pathLengthMeters(data.path),
    );

    const [created] = await db
      .insert(cables)
      .values({
        cableTypeId: data.cableTypeId,
        deviceFromId: data.deviceFromId,
        deviceToId: data.deviceToId,
        path: data.path,
        length,
        coreUsed: data.coreUsed,
      })
      .returning({ id: cables.id });

    if (!created) {
      throw new HTTPException(500, { message: "Gagal menyimpan kabel." });
    }

    return c.json({ cable: await findCableDetail(created.id) }, 201);
  },
);

cablesRoutes.patch(
  "/:id",
  requirePermission("cables", "write"),
  jsonBody(updateCableSchema),
  async (c) => {
    const id = uuidParam(c.req.param("id"), "Kabel");
    const data = c.req.valid("json");
    const existing = await findCableRow(id);

    if (!existing) {
      throw new HTTPException(404, { message: "Kabel tidak ditemukan." });
    }

    const cableTypeId = data.cableTypeId ?? existing.cableTypeId;
    const deviceFromId = data.deviceFromId ?? existing.deviceFromId;
    const deviceToId = data.deviceToId ?? existing.deviceToId;
    const path = data.path ?? existing.path;
    const coreUsed = data.coreUsed ?? existing.coreUsed;

    const type = await findCableType(cableTypeId);
    await assertEndpoints(deviceFromId, deviceToId);
    assertCore(coreUsed, type.coreCapacity);

    const length =
      data.length !== undefined
        ? roundLengthMeters(data.length)
        : data.path !== undefined
          ? roundLengthMeters(pathLengthMeters(path))
          : existing.length;

    await db
      .update(cables)
      .set({
        cableTypeId,
        deviceFromId,
        deviceToId,
        path,
        length,
        coreUsed,
        updatedAt: new Date(),
      })
      .where(eq(cables.id, id));

    return c.json({ cable: await findCableDetail(id) });
  },
);

cablesRoutes.delete("/:id", requirePermission("cables", "delete"), async (c) => {
  const id = uuidParam(c.req.param("id"), "Kabel");
  const existing = await findCableRow(id);

  if (!existing) {
    throw new HTTPException(404, { message: "Kabel tidak ditemukan." });
  }

  await db.delete(cables).where(eq(cables.id, id));
  return c.body(null, 204);
});

export default cablesRoutes;
