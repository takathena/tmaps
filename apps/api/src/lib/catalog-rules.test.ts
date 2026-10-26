import { describe, expect, it } from "bun:test";
import { capacityValidationError, usesPonCapacity } from "./catalog-rules.ts";

describe("aturan kapasitas katalog", () => {
  it("mengenali OLT dari nama atau kategori", () => {
    expect(usesPonCapacity({ name: "OLT", category: "Active" })).toBe(true);
    expect(usesPonCapacity({ name: "ZTE C320", category: "olt" })).toBe(true);
    expect(usesPonCapacity({ name: "OLT ZTE", category: "Optical" })).toBe(true);
    expect(usesPonCapacity({ name: "Perangkat", category: "Optical Line Terminal" })).toBe(true);
    expect(usesPonCapacity({ name: "Router", category: "Active" })).toBe(false);
    expect(usesPonCapacity({ name: "ODP", category: "Passive" })).toBe(false);
  });

  it("OLT wajib memakai PON capacity saja", () => {
    const olt = { name: "OLT", category: "Active" };

    expect(capacityValidationError(olt, null, 16)).toBeNull();
    expect(capacityValidationError(olt, 8, 16)).toContain("port capacity harus kosong");
    expect(capacityValidationError(olt, null, null)).toContain("PON capacity wajib diisi");
  });

  it("tipe non-OLT wajib memakai port capacity saja", () => {
    const router = { name: "Router", category: "Active" };

    expect(capacityValidationError(router, 24, null)).toBeNull();
    expect(capacityValidationError(router, 24, 8)).toContain("PON capacity harus kosong");
    expect(capacityValidationError(router, null, null)).toContain("Port capacity wajib diisi");
  });

  it("menolak kapasitas negatif atau bukan bilangan bulat", () => {
    const router = { name: "Router", category: "Active" };

    expect(capacityValidationError(router, -1, null)).toContain("tidak boleh negatif");
    expect(capacityValidationError(router, 2.5, null)).toContain("bilangan bulat");
    expect(capacityValidationError({ name: "OLT", category: "Active" }, null, -2)).toContain(
      "tidak boleh negatif",
    );
  });
});
