import { eq } from "drizzle-orm";
import { Hono } from "hono";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { db } from "../db/client.ts";
import { users } from "../db/schema.ts";
import { env } from "../env.ts";
import {
  clearPendingCookie,
  clearSessionCookie,
  readPendingToken,
  readSessionToken,
  setPendingCookie,
  setSessionCookie,
} from "../lib/auth-cookie.ts";
import { decryptTotpSecret, encryptTotpSecret } from "../lib/crypto.ts";
import { isRateLimited, resetLimit } from "../lib/rate-limiter.ts";
import { jsonBody } from "../lib/validation.ts";
import { requireAuth } from "../middleware/auth.ts";
import {
  deletePendingSessionsForUser,
  deleteSessionById,
  enableTwoFa,
  findPendingSession,
  findUserByEmail,
  issuePendingSession,
  issueSession,
  recordTwoFaFailure,
  remainingLockMinutes,
  resetTwoFaFailures,
  revokeSession,
  toAuthUser,
  type PendingPurpose,
} from "../services/auth-service.ts";
import { buildTotpSetup, generateTotpSecret, verifyTotpCode } from "../services/totp-service.ts";
import type { AppEnv } from "../types.ts";

const loginSchema = z.object({
  email: z.string().trim().email("Format email tidak valid."),
  password: z.string().min(1, "Password wajib diisi."),
});

const totpSchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/, "Kode 2FA harus 6 digit."),
});

const authRoutes = new Hono<AppEnv>();

authRoutes.post("/login", jsonBody(loginSchema), async (c) => {
  const { email: rawEmail, password } = c.req.valid("json");
  const email = rawEmail.toLowerCase();

  // Rate limit per IP
  const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || c.req.header("x-real-ip") || "unknown";
  const loginKey = `login:${ip}`;
  
  if (isRateLimited(loginKey, env.RATE_LIMIT_LOGIN_MAX, env.RATE_LIMIT_LOGIN_WINDOW_MINUTES * 60 * 1000)) {
    throw new HTTPException(429, { 
      message: `Terlalu banyak percobaan login. Coba lagi dalam ${env.RATE_LIMIT_LOGIN_WINDOW_MINUTES} menit.` 
    });
  }

  const user = await findUserByEmail(email);

  // Pesan sengaja sama untuk email tidak ditemukan maupun password salah.
  if (!user || !(await Bun.password.verify(password, user.passwordHash))) {
    throw new HTTPException(401, { message: "Email atau password salah." });
  }

  c.header("Cache-Control", "no-store");

  if (user.role.require2fa) {
    if (user.twoFaLockedUntil && user.twoFaLockedUntil > new Date()) {
      throw new HTTPException(423, {
        message: `Akun terkunci sementara setelah percobaan 2FA gagal. Coba lagi dalam ${remainingLockMinutes(user.twoFaLockedUntil)} menit.`,
      });
    }

    // Lock sudah lewat: mulai hitungan percobaan dari awal.
    if (user.twoFaLockedUntil) {
      await resetTwoFaFailures(user.id);
      user.twoFaLockedUntil = null;
      user.twoFaFailedAttempts = 0;
    }

    const needsSetup = !user.twoFaEnabled || !user.twoFaSecret;
    const pending = await issuePendingSession(user.id, needsSetup ? "2fa_setup" : "2fa_login");
    setPendingCookie(c, pending.token, pending.expiresAt);

    return c.json({ status: needsSetup ? "2fa_setup_required" : "2fa_required" });
  }

  // Login sukses tanpa 2FA: reset rate limit
  resetLimit(loginKey);

  const session = await issueSession(user.id);
  setSessionCookie(c, session.token, session.expiresAt);

  return c.json({ status: "authenticated", user: toAuthUser(user) });
});

authRoutes.post("/logout", async (c) => {
  const token = readSessionToken(c);
  const pendingToken = readPendingToken(c);

  if (token) await revokeSession(token);
  if (pendingToken) await revokeSession(pendingToken);

  clearSessionCookie(c);
  clearPendingCookie(c);

  return c.body(null, 204);
});

authRoutes.get("/me", requireAuth, (c) => {
  c.header("Cache-Control", "no-store");
  return c.json({ user: c.get("user") });
});

authRoutes.post("/2fa/setup", async (c) => {
  const pending = await requirePending(c, "2fa_setup");

  if (pending.twoFaEnabled && pending.twoFaSecret) {
    clearPendingCookie(c);
    throw new HTTPException(409, { message: "2FA sudah aktif untuk akun ini." });
  }

  let secretBase32: string;

  if (pending.twoFaSecret) {
    try {
      secretBase32 = decryptTotpSecret(pending.twoFaSecret);
    } catch (error) {
      // Kunci enkripsi berubah atau payload rusak. Karena 2FA belum aktif,
      // aman membuat secret baru. Jangan pernah mencatat secret ke log.
      console.error(
        "[2fa] secret lama tidak dapat didekripsi, membuat secret baru:",
        error instanceof Error ? error.message : error,
      );
      secretBase32 = generateTotpSecret();
      await db
        .update(users)
        .set({
          twoFaSecret: encryptTotpSecret(secretBase32),
          twoFaEnabled: false,
          updatedAt: new Date(),
        })
        .where(eq(users.id, pending.userId));
    }
  } else {
    secretBase32 = generateTotpSecret();
    await db
      .update(users)
      .set({
        twoFaSecret: encryptTotpSecret(secretBase32),
        twoFaEnabled: false,
        updatedAt: new Date(),
      })
      .where(eq(users.id, pending.userId));
  }

  const setup = await buildTotpSetup(secretBase32, pending.email);

  c.header("Cache-Control", "no-store");
  return c.json({ setup });
});

authRoutes.post("/2fa/setup/verify", jsonBody(totpSchema), async (c) => {
  const { code } = c.req.valid("json");
  const pending = await requirePending(c, "2fa_setup");

  if (!pending.twoFaSecret) {
    throw new HTTPException(400, {
      message: "Setup 2FA belum dimulai. Muat ulang halaman setup lalu coba lagi.",
    });
  }

  if (!verifyTotpCode(pending.twoFaSecret, pending.email, code)) {
    throw new HTTPException(401, {
      message: "Kode 2FA salah. Periksa waktu perangkat Anda lalu coba lagi.",
    });
  }

  await enableTwoFa(pending.userId);
  await deleteSessionById(pending.sessionId);
  clearPendingCookie(c);

  const session = await issueSession(pending.userId);
  setSessionCookie(c, session.token, session.expiresAt);

  c.header("Cache-Control", "no-store");
  return c.json({
    status: "authenticated",
    user: toAuthUser({
      id: pending.userId,
      email: pending.email,
      twoFaEnabled: true,
      role: pending.role,
    }),
  });
});

authRoutes.post("/2fa/verify", jsonBody(totpSchema), async (c) => {
  const { code } = c.req.valid("json");
  const pending = await requirePending(c, "2fa_login");

  // Rate limit per IP untuk TOTP
  const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || c.req.header("x-real-ip") || "unknown";
  const totpKey = `totp:${ip}`;
  
  if (isRateLimited(totpKey, env.RATE_LIMIT_TOTP_MAX, env.RATE_LIMIT_TOTP_WINDOW_MINUTES * 60 * 1000)) {
    throw new HTTPException(429, { 
      message: `Terlalu banyak percobaan kode 2FA. Coba lagi dalam ${env.RATE_LIMIT_TOTP_WINDOW_MINUTES} menit.` 
    });
  }

  if (!pending.twoFaEnabled || !pending.twoFaSecret) {
    throw new HTTPException(400, {
      message: "2FA belum aktif untuk akun ini. Silakan login ulang untuk setup.",
    });
  }

  if (pending.twoFaLockedUntil && pending.twoFaLockedUntil > new Date()) {
    await deletePendingSessionsForUser(pending.userId);
    clearPendingCookie(c);
    throw new HTTPException(423, {
      message: `Akun terkunci sementara setelah percobaan 2FA gagal. Coba lagi dalam ${remainingLockMinutes(pending.twoFaLockedUntil)} menit.`,
    });
  }

  if (!verifyTotpCode(pending.twoFaSecret, pending.email, code)) {
    const failure = await recordTwoFaFailure(pending.userId, pending.twoFaFailedAttempts);

    if (failure.lockedUntil) {
      await deletePendingSessionsForUser(pending.userId);
      clearPendingCookie(c);
      throw new HTTPException(423, {
        message: `Kode 2FA salah ${env.TWO_FA_MAX_ATTEMPTS} kali. Akun terkunci sementara selama ${env.TWO_FA_LOCK_MINUTES} menit.`,
      });
    }

    const remaining = env.TWO_FA_MAX_ATTEMPTS - failure.attempts;
    throw new HTTPException(401, {
      message: `Kode 2FA salah. Sisa percobaan: ${remaining}.`,
    });
  }

  // TOTP sukses: reset rate limit dan 2FA failures
  resetLimit(totpKey);
  await resetTwoFaFailures(pending.userId);
  await deleteSessionById(pending.sessionId);
  clearPendingCookie(c);

  const session = await issueSession(pending.userId);
  setSessionCookie(c, session.token, session.expiresAt);

  c.header("Cache-Control", "no-store");
  return c.json({
    status: "authenticated",
    user: toAuthUser({
      id: pending.userId,
      email: pending.email,
      twoFaEnabled: true,
      role: pending.role,
    }),
  });
});

async function requirePending(c: Context<AppEnv>, purpose: PendingPurpose) {
  const token = readPendingToken(c);

  if (!token) {
    throw new HTTPException(401, {
      message: "Sesi verifikasi 2FA tidak ditemukan. Silakan login lagi.",
    });
  }

  const pending = await findPendingSession(token, purpose);

  if (!pending) {
    clearPendingCookie(c);
    throw new HTTPException(401, {
      message: "Sesi verifikasi 2FA tidak valid atau sudah kedaluwarsa. Silakan login lagi.",
    });
  }

  return pending;
}

export default authRoutes;
