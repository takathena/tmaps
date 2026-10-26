import type { CablePathPoint } from "./api";

const EARTH_RADIUS_METERS = 6_371_008.8;

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

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

/** Nilai untuk input angka: satu angka di belakang koma. */
export function lengthInputValue(meters: number): string {
  return String(Math.round(meters * 10) / 10);
}

export function formatLength(meters: number): string {
  return `${new Intl.NumberFormat("id-ID", {
    maximumFractionDigits: 1,
  }).format(meters)} m`;
}
