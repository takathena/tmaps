import { describe, expect, it } from "bun:test";
import { deviceCapacityInfo, devicePlacementError, type DeviceModelCapacity } from "./device-rules.ts";

const olt: DeviceModelCapacity = {
  typeName: "OLT",
  category: "Active",
  requiresIp: true,
  portCapacity: null,
  ponCapacity: 16,
};

const router: DeviceModelCapacity = {
  typeName: "Router",
  category: "Active",
  requiresIp: true,
  portCapacity: 24,
  ponCapacity: null,
};

const odp: DeviceModelCapacity = {
  typeName: "ODP",
  category: "Passive",
  requiresIp: false,
  portCapacity: 8,
  ponCapacity: null,
};

describe("aturan penempatan perangkat", () => {
  it("memakai kapasitas PON untuk OLT dan port untuk tipe lain", () => {
    expect(deviceCapacityInfo(olt)).toEqual({ usesPon: true, label: "PON", capacity: 16 });
    expect(deviceCapacityInfo(router)).toEqual({
      usesPon: false,
      label: "Port",
      capacity: 24,
    });
  });

  it("mewajibkan IP valid bila device type requires_ip", () => {
    expect(devicePlacementError(olt, { ipAddress: null, portUsed: 0 })).toContain(
      "IP address wajib diisi",
    );
    expect(
      devicePlacementError(olt, { ipAddress: "10.10.0.1; ls", portUsed: 0 }),
    ).toContain("IP address tidak valid");
    expect(devicePlacementError(olt, { ipAddress: "10.10.0.1", portUsed: 0 })).toBeNull();
    expect(devicePlacementError(olt, { ipAddress: "2001:db8::1", portUsed: 0 })).toBeNull();
  });

  it("IP opsional untuk tipe pasif, tetapi tetap divalidasi bila diisi", () => {
    expect(devicePlacementError(odp, { ipAddress: null, portUsed: 4 })).toBeNull();
    expect(devicePlacementError(odp, { ipAddress: "bukan-ip", portUsed: 4 })).toContain(
      "IP address tidak valid",
    );
    expect(devicePlacementError(odp, { ipAddress: "192.168.1.10", portUsed: 4 })).toBeNull();
  });

  it("menolak port terpakai melebihi kapasitas model", () => {
    expect(devicePlacementError(router, { ipAddress: "10.0.0.2", portUsed: 24 })).toBeNull();
    expect(devicePlacementError(router, { ipAddress: "10.0.0.2", portUsed: 25 })).toContain(
      "Port terpakai (25) melebihi kapasitas model (24)",
    );
    expect(devicePlacementError(olt, { ipAddress: "10.0.0.3", portUsed: 17 })).toContain(
      "PON terpakai (17) melebihi kapasitas model (16)",
    );
  });

  it("menolak port negatif atau bukan bilangan bulat", () => {
    expect(devicePlacementError(router, { ipAddress: "10.0.0.2", portUsed: -1 })).toContain(
      "tidak boleh negatif",
    );
    expect(devicePlacementError(router, { ipAddress: "10.0.0.2", portUsed: 1.5 })).toContain(
      "bilangan bulat",
    );
  });

  it("menolak model tanpa kapasitas", () => {
    expect(
      devicePlacementError(
        { ...router, portCapacity: null },
        { ipAddress: "10.0.0.2", portUsed: 1 },
      ),
    ).toContain("Kapasitas model belum diisi");
  });
});
