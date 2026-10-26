import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { env } from "../env.ts";

const VERSION = "v1";
const AAD = Buffer.from("tmaps:totp-secret:v1");

const masterKey = Buffer.from(env.TOTP_ENCRYPTION_KEY, "base64");
const encryptionKey = Buffer.from(
  hkdfSync("sha256", masterKey, Buffer.alloc(0), "tmaps:totp:aes-256-gcm:v1", 32),
);

/**
 * Enkripsi AES-256-GCM. Format: v1.<iv>.<tag>.<ciphertext> (base64url).
 */
export function encryptTotpSecret(secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);
  cipher.setAAD(AAD);

  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(
    ".",
  );
}

export function decryptTotpSecret(payload: string): string {
  const [version, ivPart, tagPart, ciphertextPart] = payload.split(".");

  if (version !== VERSION || !ivPart || !tagPart || !ciphertextPart) {
    throw new Error("Format secret 2FA terenkripsi tidak dikenal.");
  }

  const decipher = createDecipheriv("aes-256-gcm", encryptionKey, Buffer.from(ivPart, "base64url"));
  decipher.setAAD(AAD);
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextPart, "base64url")),
    decipher.final(),
  ]);

  return plaintext.toString("utf8");
}
