import { describe, expect, it } from "bun:test";
import {
  cableCoreError,
  distanceMeters,
  pathLengthMeters,
  roundLengthMeters,
} from "./cable-rules.ts";

describe("aturan kabel", () => {
  it("menghitung jarak geodesik mendekati nilai nyata", () => {
    // Satu derajat di ekuator sekitar 111,2 km.
    const length = distanceMeters({ lat: 0, lng: 0 }, { lat: 0, lng: 1 });

    expect(length).toBeGreaterThan(111_000);
    expect(length).toBeLessThan(111_400);
  });

  it("menjumlahkan panjang tiap segmen", () => {
    const path = [
      { lat: -6.2, lng: 106.8 },
      { lat: -6.205, lng: 106.805 },
      { lat: -6.21, lng: 106.81 },
    ];

    expect(pathLengthMeters(path)).toBeCloseTo(
      distanceMeters(path[0]!, path[1]!) + distanceMeters(path[1]!, path[2]!),
      6,
    );
    expect(pathLengthMeters(path)).toBeGreaterThan(
      pathLengthMeters([path[0]!, path[2]!]),
    );
  });

  it("mengembalikan nol untuk jalur kurang dari dua titik", () => {
    expect(pathLengthMeters([])).toBe(0);
    expect(pathLengthMeters([{ lat: 1, lng: 2 }])).toBe(0);
  });

  it("membulatkan panjang ke sentimeter", () => {
    expect(roundLengthMeters(123.456)).toBe(123.46);
  });

  it("menolak core terpakai melebihi kapasitas", () => {
    expect(cableCoreError(24, 24)).toBeNull();
    expect(cableCoreError(25, 24)).toContain("melebihi kapasitas kabel (24)");
  });
});
