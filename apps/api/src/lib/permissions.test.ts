import { describe, expect, it } from "bun:test";
import {
  ADMIN_PERMISSIONS,
  TEKNISI_PERMISSIONS,
  VIEWER_PERMISSIONS,
  hasPermission,
} from "./permissions.ts";

describe("permission resource + action", () => {
  it("Admin boleh semua resource/action", () => {
    expect(hasPermission(ADMIN_PERMISSIONS, "catalog", "delete")).toBe(true);
    expect(hasPermission(ADMIN_PERMISSIONS, "roles", "write")).toBe(true);
  });

  it("Teknisi boleh ubah perangkat/kabel tetapi tidak katalog/user/role", () => {
    expect(hasPermission(TEKNISI_PERMISSIONS, "devices", "write")).toBe(true);
    expect(hasPermission(TEKNISI_PERMISSIONS, "cables", "delete")).toBe(true);
    expect(hasPermission(TEKNISI_PERMISSIONS, "catalog", "read")).toBe(true);
    expect(hasPermission(TEKNISI_PERMISSIONS, "catalog", "write")).toBe(false);
    expect(hasPermission(TEKNISI_PERMISSIONS, "users", "read")).toBe(false);
    expect(hasPermission(TEKNISI_PERMISSIONS, "roles", "read")).toBe(false);
  });

  it("Viewer hanya boleh membaca", () => {
    expect(hasPermission(VIEWER_PERMISSIONS, "devices", "read")).toBe(true);
    expect(hasPermission(VIEWER_PERMISSIONS, "devices", "write")).toBe(false);
    expect(hasPermission(VIEWER_PERMISSIONS, "catalog", "delete")).toBe(false);
  });

  it("permission yang tidak ada dianggap ditolak", () => {
    expect(hasPermission({}, "devices", "read")).toBe(false);
    expect(hasPermission(null, "devices", "read")).toBe(false);
  });
});
