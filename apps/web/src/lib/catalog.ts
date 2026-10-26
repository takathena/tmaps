import type { DeviceType } from "./api";

/**
 * Aturan yang sama dengan API: OLT memakai PON capacity, tipe lain memakai
 * port capacity. Dipakai untuk label form agar pengguna tidak salah isi.
 */
export function usesPonCapacity(type: Pick<DeviceType, "name" | "category">): boolean {
  const label = `${type.name} ${type.category}`;
  return /\bolt\b/i.test(label) || /optical\s+line\s+terminal/i.test(label);
}

export function capacityLabel(type: Pick<DeviceType, "name" | "category">): string {
  return usesPonCapacity(type) ? "PON capacity" : "Port capacity";
}
