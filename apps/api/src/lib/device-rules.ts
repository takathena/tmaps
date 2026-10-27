import { isIP } from "node:net";
import { usesPonCapacity } from "./catalog-rules.ts";

/**
 * Konteks model + tipe yang dibutuhkan untuk memvalidasi penempatan perangkat.
 * Dipakai API dan unit test agar aturan IP/kapasitas tidak tersebar.
 */
import { isValidIpAddress } from "./ip-validation.ts";

export type DeviceModelCapacity = {
  typeName: string;
  category: string;
  requiresIp: boolean;
  portCapacity: number | null;
  ponCapacity: number | null;
};

export type DevicePlacementInput = {
  ipAddress: string | null;
  portUsed: number;
};

export type DeviceMonitoringInput = {
  enabled: boolean;
  intervalSeconds: number;
};

export type DeviceCapacityInfo = {
  usesPon: boolean;
  label: string;
  capacity: number | null;
};

export function deviceCapacityInfo(model: DeviceModelCapacity): DeviceCapacityInfo {
  const usesPon = usesPonCapacity({ name: model.typeName, category: model.category });

  return {
    usesPon,
    label: usesPon ? "PON" : "Port",
    capacity: usesPon ? model.ponCapacity : model.portCapacity,
  };
}

/**
 * Mengembalikan pesan kesalahan bila IP/port tidak sesuai aturan, atau null.
 * - IP wajib dan valid bila Device Type `requires_ip`.
 * - IP yang diisi (walau opsional) harus valid.
 * - `port_used` tidak boleh melebihi kapasitas model (port atau PON).
 */
export function devicePlacementError(
  model: DeviceModelCapacity,
  input: DevicePlacementInput,
): string | null {
  if (input.ipAddress !== null) {
    const trimmed = input.ipAddress.trim();
    if (trimmed.length === 0 || !isValidIpAddress(trimmed)) {
      return "IP address tidak valid. Hanya format IPv4 atau IPv6 yang diizinkan.";
    }
  } else if (model.requiresIp) {
    return "IP address wajib diisi untuk tipe perangkat ini.";
  }

  if (!Number.isInteger(input.portUsed) || input.portUsed < 0) {
    return "Port terpakai harus bilangan bulat dan tidak boleh negatif.";
  }

  const { label, capacity } = deviceCapacityInfo(model);

  if (capacity === null) {
    return "Kapasitas model belum diisi di katalog.";
  }

  if (input.portUsed > capacity) {
    return `${label} terpakai (${input.portUsed}) melebihi kapasitas model (${capacity}).`;
  }

  return null;
}

/**
 * Monitoring hanya masuk akal untuk perangkat yang punya IP. Perangkat pasif
 * seperti ODP/ODC tidak di-ping, jadi konfigurasi monitoring ditolak.
 */
export function deviceMonitoringError(
  model: DeviceModelCapacity,
  monitoring: DeviceMonitoringInput | null | undefined,
): string | null {
  if (!monitoring) return null;

  if (!model.requiresIp) {
    return "Monitoring hanya tersedia untuk tipe perangkat yang membutuhkan IP.";
  }

  return null;
}
