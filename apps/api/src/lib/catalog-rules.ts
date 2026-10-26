/**
 * Aturan katalog perangkat.
 *
 * Flow #5: kapasitas mengikuti jenis Device Type.
 * - OLT memakai `pon_capacity`.
 * - Router, Switch, ODP, ODC, dan tipe lain memakai `port_capacity`.
 *
 * Jenis OLT dikenali dari nama atau kategori yang memuat kata "OLT"
 * (mis. "OLT", "OLT ZTE", "Optical Line Terminal").
 */
export type DeviceTypeCapacityInfo = {
  name: string;
  category: string;
};

export function usesPonCapacity(type: DeviceTypeCapacityInfo): boolean {
  const label = `${type.name} ${type.category}`;
  return /\bolt\b/i.test(label) || /optical\s+line\s+terminal/i.test(label);
}

/**
 * Mengembalikan pesan kesalahan bila kombinasi kapasitas tidak sesuai tipe,
 * atau null bila valid. Nilai `null` berarti kapasitas tidak diisi.
 */
export function capacityValidationError(
  type: DeviceTypeCapacityInfo,
  portCapacity: number | null | undefined,
  ponCapacity: number | null | undefined,
): string | null {
  if (portCapacity != null && (!Number.isInteger(portCapacity) || portCapacity < 0)) {
    return "Port capacity harus bilangan bulat dan tidak boleh negatif.";
  }

  if (ponCapacity != null && (!Number.isInteger(ponCapacity) || ponCapacity < 0)) {
    return "PON capacity harus bilangan bulat dan tidak boleh negatif.";
  }

  if (usesPonCapacity(type)) {
    if (portCapacity != null) {
      return "Device type OLT memakai PON capacity; port capacity harus kosong.";
    }
    if (ponCapacity == null) {
      return "PON capacity wajib diisi untuk device type OLT.";
    }
    return null;
  }

  if (ponCapacity != null) {
    return "Device type ini memakai port capacity; PON capacity harus kosong.";
  }
  if (portCapacity == null) {
    return "Port capacity wajib diisi untuk device type ini.";
  }

  return null;
}
