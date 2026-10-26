import { Secret, TOTP } from "otpauth";
import QRCode from "qrcode";
import { decryptTotpSecret } from "../lib/crypto.ts";

const ISSUER = "TMaps";
const DIGITS = 6;
const PERIOD_SECONDS = 30;
const VALIDATION_WINDOW = 1;

export function generateTotpSecret(): string {
  return new Secret({ size: 20 }).base32;
}

function buildTotp(secretBase32: string, email: string): TOTP {
  return new TOTP({
    issuer: ISSUER,
    label: email,
    issuerInLabel: true,
    secret: Secret.fromBase32(secretBase32),
    algorithm: "SHA1",
    digits: DIGITS,
    period: PERIOD_SECONDS,
  });
}

export type TotpSetup = {
  secret: string;
  otpauthUrl: string;
  qrCodeDataUrl: string;
};

export async function buildTotpSetup(secretBase32: string, email: string): Promise<TotpSetup> {
  const totp = buildTotp(secretBase32, email);
  const otpauthUrl = totp.toString();
  const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 240,
  });

  return { secret: secretBase32, otpauthUrl, qrCodeDataUrl };
}

export function verifyTotpCode(encryptedSecret: string, email: string, code: string): boolean {
  const secretBase32 = decryptTotpSecret(encryptedSecret);
  const delta = buildTotp(secretBase32, email).validate({
    token: code,
    window: VALIDATION_WINDOW,
  });

  return delta !== null;
}
