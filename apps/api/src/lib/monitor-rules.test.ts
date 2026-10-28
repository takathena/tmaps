import { describe, expect, test } from "bun:test";
import { shouldNotify, parsePingLatency, isValidIpAddress } from "./monitor-rules.ts";

describe("shouldNotify", () => {
  test("pengecekan pertama yang berhasil tidak membuat notifikasi", () => {
    expect(shouldNotify("unmonitored", "active")).toBe(false);
  });

  test("active ke offline selalu memberi notifikasi", () => {
    expect(shouldNotify("active", "offline")).toBe(true);
  });

  test("offline ke active memberi notifikasi (kembali online)", () => {
    expect(shouldNotify("offline", "active")).toBe(true);
  });

  test("status tidak berubah tidak memberi notifikasi", () => {
    expect(shouldNotify("offline", "offline")).toBe(false);
    expect(shouldNotify("active", "active")).toBe(false);
  });
});

describe("parsePingLatency", () => {
  test("membaca time= dari output ping", () => {
    const out = "64 bytes from 127.0.0.1: icmp_seq=1 ttl=64 time=0.052 ms";
    expect(parsePingLatency(out)).toBe(0);
  });

  test("latency dibulatkan", () => {
    const out = "time=12.7 ms";
    expect(parsePingLatency(out)).toBe(13);
  });

  test("mengembalikan null bila tidak ada time=", () => {
    expect(parsePingLatency("100% packet loss")).toBeNull();
  });
});

describe("isValidIpAddress", () => {
  test("IPv4 valid", () => {
    expect(isValidIpAddress("192.168.1.1")).toBe(true);
    expect(isValidIpAddress("10.0.0.0")).toBe(true);
    expect(isValidIpAddress("255.255.255.255")).toBe(true);
  });

  test("IPv4 tidak valid", () => {
    expect(isValidIpAddress("256.1.1.1")).toBe(false);
    expect(isValidIpAddress("192.168.1")).toBe(false);
    expect(isValidIpAddress("192.168.1.1.1")).toBe(false);
    expect(isValidIpAddress("abc.def.ghi.jkl")).toBe(false);
  });
});
