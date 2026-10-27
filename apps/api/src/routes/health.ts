import { eq, desc, and, sql } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/client.ts";
import { devices, pingLogs } from "../db/schema.ts";

const healthRoutes = new Hono();

healthRoutes.get("/", async (c) => {
  try {
    await db.execute(sql`SELECT 1`);
    return c.json({
      status: "ok",
      db: "up",
      timestamp: new Date().toISOString(),
    });
  } catch {
    return c.json(
      {
        status: "error",
        db: "down",
        timestamp: new Date().toISOString(),
      },
      503,
    );
  }
});

// GET /health/status - status real-time semua device
healthRoutes.get("/status", async (c) => {
  const allDevices = await db
    .select({
      id: devices.id,
      status: devices.status,
    })
    .from(devices);

  // Ambil ping terakhir per device (untuk device yang dimonitor)
  const deviceIds = allDevices.map((d) => d.id);
  const latestPings = await Promise.all(
    deviceIds.map(async (deviceId) => {
      const [latest] = await db
        .select({
          isUp: pingLogs.isUp,
          latencyMs: pingLogs.latencyMs,
          checkedAt: pingLogs.checkedAt,
        })
        .from(pingLogs)
        .where(eq(pingLogs.deviceId, deviceId))
        .orderBy(desc(pingLogs.checkedAt))
        .limit(1);

      return { deviceId, ping: latest };
    }),
  );

  const pingMap = new Map(latestPings.map((p) => [p.deviceId, p.ping]));

  const result = allDevices.map((device) => {
    const ping = pingMap.get(device.id);
    return {
      id: device.id,
      status: device.status,
      monitoringEnabled: !!ping,
      isUp: ping?.isUp ?? null,
      latencyMs: ping?.latencyMs ?? null,
      checkedAt: ping?.checkedAt?.toISOString() ?? null,
    };
  });

  return c.json({
    status: "ok",
    devices: result,
    timestamp: new Date().toISOString(),
  });
});

export default healthRoutes;
