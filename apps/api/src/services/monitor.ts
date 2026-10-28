import { spawn } from "node:child_process";
import { eq, and, lte, sql } from "drizzle-orm";
import { db } from "../db/client.ts";
import { devices, pingLogs, monitoringConfig, notifications } from "../db/schema.ts";
import { env } from "../env.ts";
import { shouldNotify, parsePingLatency, isValidIpAddress } from "../lib/monitor-rules.ts";

type PingTarget = {
  deviceId: string;
  ipAddress: string;
  intervalSeconds: number;
  consecutiveFailures: number;
};

let tickInterval: ReturnType<typeof setInterval> | null = null;
let cleanupInterval: ReturnType<typeof setInterval> | null = null;
let tickRunning = false;

/**
 * Ping satu device, catat hasil ke ping_logs, update devices.status dengan threshold.
 */
async function pingDevice(target: PingTarget): Promise<void> {
  // Validasi IP sebelum spawn
  if (!target.ipAddress || !isValidIpAddress(target.ipAddress)) {
    console.error(`IP tidak valid untuk device ${target.deviceId}, pengecekan dilewati.`);
    return;
  }

  // Klaim: update next_check_at dulu sebelum ping dimulai
  // Tick berikutnya tidak akan mengambil device ini lagi
  try {
    await db
      .update(monitoringConfig)
      .set({ nextCheckAt: new Date(Date.now() + target.intervalSeconds * 1000) })
      .where(eq(monitoringConfig.deviceId, target.deviceId));
  } catch (error) {
    console.error(`Gagal mengklaim device ${target.deviceId}:`, error);
    return;
  }

  try {
    const result = await executePing(target.ipAddress, env.PING_TIMEOUT_MS);
    const latency = result.latencyMs;

    // Catat ke ping_logs
    await db.insert(pingLogs).values({
      deviceId: target.deviceId,
      checkedAt: new Date(),
      isUp: result.success,
      latencyMs: latency,
    });

    // Hitung consecutive failures
    let newConsecutiveFailures = result.success ? 0 : target.consecutiveFailures + 1;

    // Ambil status device saat ini
    const [current] = await db
      .select({ status: devices.status, name: devices.name })
      .from(devices)
      .where(eq(devices.id, target.deviceId))
      .limit(1);

    if (!current) return;

    // Tentukan status baru berdasarkan threshold
    let newStatus = current.status;
    if (result.success) {
      newStatus = "active";
    } else if (newConsecutiveFailures >= env.PING_FAIL_THRESHOLD) {
      newStatus = "offline";
    }

    // Update monitoring config dengan consecutive failures
    await db
      .update(monitoringConfig)
      .set({ consecutiveFailures: newConsecutiveFailures })
      .where(eq(monitoringConfig.deviceId, target.deviceId));

    // Update status device jika berubah + notifikasi
    if (current.status !== newStatus) {
      await db
        .update(devices)
        .set({ status: newStatus })
        .where(eq(devices.id, target.deviceId));

      // Notifikasi hanya untuk perubahan nyata
      if (shouldNotify(current.status, newStatus)) {
        const statusLabel = newStatus === "active" ? "kembali online" : "offline";
        const message = `${current.name} ${statusLabel}`;

        await db.insert(notifications).values({
          deviceId: target.deviceId,
          isUp: newStatus === "active",
          message,
        });
      }
    }
  } catch (error) {
    console.error(`Ping failed for device ${target.deviceId}:`, error);
    // Error tetap harus update next_check_at (sudah di-claim di atas)
  }
}

/**
 * Eksekusi ping command dengan timeout, ambil latency dari output.
 */
function executePing(
  ipAddress: string,
  timeoutMs: number,
): Promise<{ success: boolean; latencyMs: number | null }> {
  return new Promise((resolve) => {
    const deadlineSec = String(Math.max(1, Math.ceil(timeoutMs / 1000)));
    // "--" memisahkan opsi dari target: IP tidak pernah diperlakukan sebagai opsi
    const child = spawn("ping", ["-c", "1", "-W", deadlineSec, "--", ipAddress], {
      stdio: ["ignore", "pipe", "ignore"],
    });

    let stdout = "";
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const finish = (value: { success: boolean; latencyMs: number | null }) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(value);
    };

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    // Batas JS sedikit lebih longgar dari -W agar balasan di detik terakhir tidak terpotong
    timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish({ success: false, latencyMs: null });
    }, timeoutMs + 500);

    child.on("close", (code) => {
      const success = code === 0;
      const latencyMs = success ? parsePingLatency(stdout) : null;
      finish({ success, latencyMs });
    });

    child.on("error", () => finish({ success: false, latencyMs: null }));
  });
}

/**
 * Satu tick loop: ambil device yang perlu dicek, ping dengan concurrency limit.
 */
async function tick(): Promise<void> {
  // Guard: jangan jalankan tick baru selama tick sebelumnya masih berjalan
  if (tickRunning) return;
  tickRunning = true;

  try {
    // Ambil device yang monitoring enabled dan sudah waktunya dicek
    const targets = await db
      .select({
        deviceId: devices.id,
        ipAddress: devices.ipAddress,
        intervalSeconds: monitoringConfig.intervalSeconds,
        consecutiveFailures: monitoringConfig.consecutiveFailures,
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
        return pingDevice(target as PingTarget);
      });
      await Promise.allSettled(promises);
    }
  } catch (error) {
    console.error("Tick error:", error);
  } finally {
    tickRunning = false;
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

    console.log(`Cleanup: deleted ping logs before ${cutoffDate.toISOString()}`);
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
  cleanupInterval = setInterval(() => void cleanupOldLogs(), 60 * 60 * 1000);
}

/**
 * Stop scheduler (untuk testing atau graceful shutdown).
 */
export async function stopMonitoring(): Promise<void> {
  if (tickInterval) {
    clearInterval(tickInterval);
    tickInterval = null;
  }

  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }

  console.log("Monitoring stopped");
}
