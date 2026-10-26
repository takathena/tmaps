import { createHash, randomBytes } from "node:crypto";

export const SESSION_COOKIE = "tmaps_session";

export function createSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Token mentah hanya dikirim ke client lewat cookie HttpOnly.
 * Yang disimpan di DB adalah hash SHA-256 agar bocornya DB tidak langsung
 * membocorkan sesi yang masih aktif.
 */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
