import { spawn } from "node:child_process";
import { eq, and, lte, sql } from "drizzle-orm";
import { db } from "../db/client.ts";
import { devices, pingLogs, monitoringConfig } from "../db/schema.ts";
import { env } from "../env.ts";

type PingTarget = {
  deviceId: string;
  ipAddress: string;
  intervalSeconds: number;
};

let tickInterval: ReturnType<typeof setInterval> | null = null;
let activePromises = new Set<Promise<void>>();

/**
 * Ping satu device, catat hasil ke ping_logs, update devices.status.
 */
async function pingDevice(target: PingTarget): Promise<void> {
  const startTime = Date.now();
  
  try {
    const result = await executePing(target.ipAddress, env.PING_TIMEOUT_MS);
    const latency = result.success ? Date.now() - startTime : null;
    const newStatus = result.success ? "active" : "offline";

    // Catat ke ping_logs
    await db.insert(pingLogs).values({
      deviceId: target.deviceId,
      checkedAt: new Date(),
      isUp: result.success,
      latencyMs: latency,
    });

    // Update status device jika berubah
    const [current] = await db
      .select({ status: devices.status })
      .from(devices)
      .where(eq(devices.id, target.deviceId))
      .limit(1);

    if (current && current.status !== newStatus) {
      await db
        .update(devices)
        .set({ status: newStatus })
        .where(eq(devices.id, target.deviceId));
    }

    // Update next_check_at
    await db
      .update(monitoringConfig)
      .set({
        nextCheckAt: new Date(Date.now() + target.intervalSeconds * 1000),
      })
      .where(eq(monitoringConfig.deviceId, target.deviceId));
  } catch (error) {
    console.error(`Ping failed for device ${target.deviceId}:`, error);
  }
}

/**
 * Eksekusi ping command dengan timeout.
 */
function executePing(ipAddress: string, timeoutMs: number): Promise<{ success: boolean }> {
  return new Promise((resolve) => {
    const child = spawn("ping", ["-c", "1", "-W", String(Math.ceil(timeoutMs / 1000)), ipAddress]);
    
    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        child.kill();
        resolve({ success: false });
      }
    }, timeoutMs);

    child.on("close", (code) => {
      clearTimeout(timeout);
      if (!resolved) {
        resolved = true;
        resolve({ success: code === 0 });
      }
    });

    child.on("error", () => {
      clearTimeout(timeout);
      if (!resolved) {
        resolved = true;
        resolve({ success: false });
      }
    });
  });
}

/**
 * Satu tick loop: ambil device yang perlu dicek, ping dengan concurrency limit.
 */
async function tick(): Promise<void> {
  try {
    // Ambil device yang monitoring enabled dan sudah waktunya dicek
    const targets = await db
      .select({
        deviceId: devices.id,
        ipAddress: devices.ipAddress,
        intervalSeconds: monitoringConfig.intervalSeconds,
      })
      .from(devices)
      .innerJoin(monitoringConfig, eq(devices.id, monitoringConfig.deviceId))
      .where(
        and(
          eq(monitoringConfig.enabled, true),
          lte(monitoringConfig.nextCheckAt, new Date())
        )
      );

    if (targets.length === 0) return;

    // Ping dengan concurrency limit
    const concurrency = env.PING_CONCURRENCY;
    for (let i = 0; i < targets.length; i += concurrency) {
      const batch = targets.slice(i, i + concurrency);
      const promises = batch.map((target) => {
        if (!target.ipAddress) return Promise.resolve();
        const promise = pingDevice(target as PingTarget);
        activePromises.add(promise);
        return promise.finally(() => activePromises.delete(promise));
      });
      await Promise.allSettled(promises);
    }
  } catch (error) {
    console.error("Tick error:", error);
  }
}

/**
 * Job cleanup ping_logs sesuai retensi.
 */
async function cleanupOldLogs(): Promise<void> {
  try {
    const cutoffDate = new Date(Date.now() - env.PING_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    
    const result = await db
      .delete(pingLogs)
      .where(lte(pingLogs.checkedAt, cutoffDate));

    console.log(`Cleanup: deleted old ping logs before ${cutoffDate.toISOString()}`);
  } catch (error) {
    console.error("Cleanup error:", error);
  }
}

/**
 * Start scheduler loop.
 */
export function startMonitoring(): void {
  if (tickInterval) {
    console.warn("Monitoring already started");
    return;
  }

  console.log(`Starting monitoring scheduler (tick every ${env.PING_TICK_SECONDS}s)`);
  
  // Tick pertama langsung
  void tick();
  
  // Loop tick
  tickInterval = setInterval(() => void tick(), env.PING_TICK_SECONDS * 1000);

  // Cleanup job setiap 1 jam
  setInterval(() => void cleanupOldLogs(), 60 * 60 * 1000);
}

/**
 * Stop scheduler (untuk testing atau graceful shutdown).
 */
export async function stopMonitoring(): Promise<void> {
  if (tickInterval) {
    clearInterval(tickInterval);
    tickInterval = null;
  }

  // Tunggu semua ping selesai
  await Promise.allSettled(Array.from(activePromises));
  console.log("Monitoring stopped");
}
