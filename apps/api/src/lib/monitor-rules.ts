export type DeviceStatus = "active" | "offline" | "unmonitored";

/**
 * Menentukan apakah perubahan status perlu membuat notifikasi.
 * Pengecekan pertama (unmonitored → active) tidak membuat notifikasi.
 */
export function shouldNotify(previous: DeviceStatus, next: DeviceStatus): boolean {
  if (previous === next) return false;
  // Pengecekan pertama yang berhasil bukan "kembali online"
  if (previous === "unmonitored" && next === "active") return false;
  return true;
}

/**
 * Parse latency dari output ping (time=X.X ms).
 * Return null jika tidak ada.
 */
export function parsePingLatency(stdout: string): number | null {
  const match = stdout.match(/time=([\d.]+)\s*ms/);
  return match ? Math.round(Number(match[1])) : null;
}

/**
 * Validasi IP address sederhana (IPv4).
 */
export function isValidIpAddress(ip: string): boolean {
  const parts = ip.split(".");
  if (parts.length !== 4) return false;
  return parts.every((part) => {
    const num = Number(part);
    return Number.isInteger(num) && num >= 0 && num <= 255;
  });
}
