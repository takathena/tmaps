import { eq, desc } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { db } from "../db/client.ts";
import { devices, monitoringConfig, pingLogs } from "../db/schema.ts";
import { sql } from "drizzle-orm";
import { jsonBody } from "../lib/validation.ts";
import { requireAuth } from "../middleware/auth.ts";
import { requirePermission } from "../middleware/permission.ts";
import type { AppEnv } from "../types.ts";

const monitoringRoutes = new Hono<AppEnv>();

monitoringRoutes.use("*", requireAuth);

// GET /devices/:id/monitoring
monitoringRoutes.get("/devices/:id/monitoring", requirePermission("monitoring", "read"), async (c) => {
  const id = c.req.param("id");
  
  const [config] = await db
    .select()
    .from(monitoringConfig)
    .where(eq(monitoringConfig.deviceId, id))
    .limit(1);

  if (!config) {
    throw new HTTPException(404, { message: "Device tidak ditemukan atau monitoring belum diaktifkan." });
  }

  return c.json({ monitoring: config });
});

// PUT /devices/:id/monitoring
const updateMonitoringSchema = z.object({
  enabled: z.boolean(),
  intervalSeconds: z.number().int().min(5).max(86400).optional(),
});

monitoringRoutes.put(
  "/devices/:id/monitoring",
  requirePermission("monitoring", "write"),
  jsonBody(updateMonitoringSchema),
  async (c) => {
    const id = c.req.param("id");
    const data = c.req.valid("json");

    // Cek device exist dan requiresIp
    const [device] = await db
      .select({ id: devices.id, ipAddress: devices.ipAddress })
      .from(devices)
      .where(eq(devices.id, id))
      .limit(1);

    if (!device) {
      throw new HTTPException(404, { message: "Device tidak ditemukan." });
    }

    if (!device.ipAddress) {
      throw new HTTPException(400, { message: "Device tidak memiliki IP address, tidak bisa dimonitor." });
    }

    // Upsert monitoring config
    const existing = await db
      .select()
      .from(monitoringConfig)
      .where(eq(monitoringConfig.deviceId, id))
      .limit(1);

    if (existing.length > 0) {
      const [updated] = await db
        .update(monitoringConfig)
        .set({
          enabled: data.enabled,
          ...(data.intervalSeconds !== undefined ? { intervalSeconds: data.intervalSeconds } : {}),
          nextCheckAt: data.enabled ? new Date() : (existing[0]?.nextCheckAt ?? new Date()),
          consecutiveFailures: 0, // Reset saat toggle monitoring
        })
        .where(eq(monitoringConfig.deviceId, id))
        .returning();

      // Jika monitoring dimatikan, status kembali unmonitored
      if (!data.enabled) {
        await db.update(devices).set({ status: "unmonitored" }).where(eq(devices.id, id));
      }

      return c.json({ monitoring: updated });
    } else {
      const [created] = await db
        .insert(monitoringConfig)
        .values({
          deviceId: id,
          enabled: data.enabled,
          intervalSeconds: data.intervalSeconds ?? 60,
          nextCheckAt: new Date(),
        })
        .returning();

      return c.json({ monitoring: created }, 201);
    }
  }
);

// GET /devices/:id/ping-logs
monitoringRoutes.get("/devices/:id/ping-logs", requirePermission("monitoring", "read"), async (c) => {
  const id = c.req.param("id");
  const limit = Math.min(Number(c.req.query("limit")) || 100, 500);

  const logs = await db
    .select()
    .from(pingLogs)
    .where(eq(pingLogs.deviceId, id))
    .orderBy(desc(pingLogs.checkedAt))
    .limit(limit);

  return c.json({ logs });
});

// GET /monitoring/status - status real-time semua device (1 query dengan LATERAL)
monitoringRoutes.get("/status", requirePermission("monitoring", "read"), async (c) => {
  const result = await db.execute<{
    id: string;
    status: string;
    monitoring_enabled: boolean;
    is_up: boolean | null;
    latency_ms: number | null;
    checked_at: string | null;
  }>(sql`
    SELECT 
      d.id,
      d.status,
      COALESCE(mc.enabled, false) AS monitoring_enabled,
      pl.is_up,
      pl.latency_ms,
      pl.checked_at
    FROM devices d
    LEFT JOIN monitoring_config mc ON mc.device_id = d.id
    LEFT JOIN LATERAL (
      SELECT p.is_up, p.latency_ms, p.checked_at
      FROM ping_logs p
      WHERE p.device_id = d.id
      ORDER BY p.checked_at DESC
      LIMIT 1
    ) pl ON true
  `);

  return c.json({
    status: "ok",
    devices: result.rows.map((row) => ({
      id: row.id,
      status: row.status,
      monitoringEnabled: row.monitoring_enabled,
      isUp: row.is_up,
      latencyMs: row.latency_ms,
      checkedAt: row.checked_at,
    })),
    timestamp: new Date().toISOString(),
  });
});

export default monitoringRoutes;
