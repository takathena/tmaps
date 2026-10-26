import type { CablePathPoint } from "../db/schema.ts";

const EARTH_RADIUS_METERS = 6_371_008.8;

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

/** Jarak geodesik (haversine) antara dua titik, dalam meter. */
export function distanceMeters(from: CablePathPoint, to: CablePathPoint): number {
  const deltaLat = toRadians(to.lat - from.lat);
  const deltaLng = toRadians(to.lng - from.lng);
  const latFrom = toRadians(from.lat);
  const latTo = toRadians(to.lat);

  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(latFrom) * Math.cos(latTo) * Math.sin(deltaLng / 2) ** 2;

  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(a));
}

/** Panjang total jalur kabel, dijumlahkan per segmen. */
export function pathLengthMeters(path: CablePathPoint[]): number {
  let total = 0;

  for (let index = 1; index < path.length; index += 1) {
    const previous = path[index - 1];
    const current = path[index];
    if (!previous || !current) continue;
    total += distanceMeters(previous, current);
  }

  return total;
}

/** Simpan panjang dengan presisi sentimeter. */
export function roundLengthMeters(length: number): number {
  return Math.round(length * 100) / 100;
}

export function cableCoreError(coreUsed: number, coreCapacity: number): string | null {
  if (coreUsed > coreCapacity) {
    return `Core terpakai (${coreUsed}) melebihi kapasitas kabel (${coreCapacity}).`;
  }

  return null;
}
