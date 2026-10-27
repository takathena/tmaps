import { ilike, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db/client.ts";
import { devices, deviceTypes, deviceModels, tags, deviceTags } from "../db/schema.ts";
import { jsonBody } from "../lib/validation.ts";
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
    .innerJoin(deviceTypes, sql`${devices.deviceTypeId} = ${deviceTypes.id}`)
    .innerJoin(deviceModels, sql`${devices.deviceModelId} = ${deviceModels.id}`)
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
