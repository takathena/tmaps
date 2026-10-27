import { ilike, or, eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/client.ts";
import { devices, deviceTypes, deviceModels, tags } from "../db/schema.ts";
import { requireAuth } from "../middleware/auth.ts";
import type { AppEnv } from "../types.ts";

const searchRoutes = new Hono<AppEnv>();

searchRoutes.use("*", requireAuth);

// GET /search?q=keyword
searchRoutes.get("/", async (c) => {
  const query = c.req.query("q")?.trim();
  
  if (!query || query.length < 2) {
    return c.json({ results: { devices: [], types: [], tags: [] } });
  }

  const searchPattern = `%${query}%`;

  // Search devices (name, IP, model, vendor)
  const deviceResults = await db
    .select({
      id: devices.id,
      name: devices.name,
      ipAddress: devices.ipAddress,
      latitude: devices.latitude,
      longitude: devices.longitude,
      typeName: deviceTypes.name,
      modelName: deviceModels.modelName,
      vendor: deviceModels.vendor,
    })
    .from(devices)
    .innerJoin(deviceModels, eq(devices.deviceModelId, deviceModels.id))
    .innerJoin(deviceTypes, eq(deviceModels.deviceTypeId, deviceTypes.id))
    .where(
      or(
        ilike(devices.name, searchPattern),
        ilike(devices.ipAddress, searchPattern),
        ilike(deviceModels.modelName, searchPattern),
        ilike(deviceModels.vendor, searchPattern)
      )
    )
    .limit(10);

  // Search device types
  const typeResults = await db
    .select({
      id: deviceTypes.id,
      name: deviceTypes.name,
      icon: deviceTypes.icon,
    })
    .from(deviceTypes)
    .where(ilike(deviceTypes.name, searchPattern))
    .limit(5);

  // Search tags
  const tagResults = await db
    .select({
      id: tags.id,
      name: tags.name,
    })
    .from(tags)
    .where(ilike(tags.name, searchPattern))
    .limit(5);

  return c.json({
    results: {
      devices: deviceResults,
      types: typeResults,
      tags: tagResults,
    },
  });
});

export default searchRoutes;
