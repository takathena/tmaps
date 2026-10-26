import { and, eq, gt, inArray, lt } from "drizzle-orm";
import { db } from "../db/client.ts";
import { roles, sessions, users } from "../db/schema.ts";
import { env } from "../env.ts";
import type { RolePermissions } from "../lib/permissions.ts";
import { createSessionToken, hashSessionToken } from "../lib/session.ts";
import type { AuthUser } from "../types.ts";

export type IssuedSession = {
  token: string;
  expiresAt: Date;
};

export type PendingPurpose = "2fa_setup" | "2fa_login";

export type LoginUser = {
  id: string;
  email: string;
  passwordHash: string;
  twoFaEnabled: boolean;
  twoFaSecret: string | null;
  twoFaFailedAttempts: number;
  twoFaLockedUntil: Date | null;
  role: AuthUser["role"];
};

export type PendingSessionData = {
  sessionId: string;
  userId: string;
  email: string;
  twoFaEnabled: boolean;
  twoFaSecret: string | null;
  twoFaFailedAttempts: number;
  twoFaLockedUntil: Date | null;
  role: AuthUser["role"];
};

export function toAuthUser(input: {
  id: string;
  email: string;
  twoFaEnabled: boolean;
  role: AuthUser["role"];
}): AuthUser {
  return {
    id: input.id,
    email: input.email,
    twoFaEnabled: input.twoFaEnabled,
    role: input.role,
  };
}

export function sessionExpiryDate(): Date {
  return new Date(Date.now() + env.SESSION_TTL_HOURS * 60 * 60 * 1000);
}

export function pendingExpiryDate(): Date {
  return new Date(Date.now() + env.TWO_FA_PENDING_TTL_MINUTES * 60 * 1000);
}

export async function findUserByEmail(email: string): Promise<LoginUser | null> {
  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      passwordHash: users.passwordHash,
      twoFaEnabled: users.twoFaEnabled,
      twoFaSecret: users.twoFaSecret,
      twoFaFailedAttempts: users.twoFaFailedAttempts,
      twoFaLockedUntil: users.twoFaLockedUntil,
      roleId: roles.id,
      roleName: roles.name,
      requires2fa: roles.require2fa,
      permissions: roles.permissions,
    })
    .from(users)
    .innerJoin(roles, eq(users.roleId, roles.id))
    .where(eq(users.email, email))
    .limit(1);

  if (!row) return null;

  return {
    id: row.id,
    email: row.email,
    passwordHash: row.passwordHash,
    twoFaEnabled: row.twoFaEnabled,
    twoFaSecret: row.twoFaSecret,
    twoFaFailedAttempts: row.twoFaFailedAttempts,
    twoFaLockedUntil: row.twoFaLockedUntil,
    role: {
      id: row.roleId,
      name: row.roleName,
      require2fa: row.requires2fa,
      permissions: (row.permissions ?? {}) as RolePermissions,
    },
  };
}

export async function issueSession(userId: string): Promise<IssuedSession> {
  const token = createSessionToken();
  const expiresAt = sessionExpiryDate();

  await db.insert(sessions).values({
    userId,
    token: hashSessionToken(token),
    purpose: "session",
    expiresAt,
  });

  // Bersihkan sesi kedaluwarsa secara oportunistik.
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));

  return { token, expiresAt };
}

export async function issuePendingSession(
  userId: string,
  purpose: PendingPurpose,
): Promise<IssuedSession> {
  // Hanya satu sesi sementara per user agar QR/percobaan lama tidak menumpuk.
  await deletePendingSessionsForUser(userId);

  const token = createSessionToken();
  const expiresAt = pendingExpiryDate();

  await db.insert(sessions).values({
    userId,
    token: hashSessionToken(token),
    purpose,
    expiresAt,
  });

  return { token, expiresAt };
}

export async function findSessionUser(
  token: string,
): Promise<{ sessionId: string; user: AuthUser } | null> {
  const [row] = await db
    .select({
      sessionId: sessions.id,
      userId: users.id,
      email: users.email,
      twoFaEnabled: users.twoFaEnabled,
      roleId: roles.id,
      roleName: roles.name,
      requires2fa: roles.require2fa,
      permissions: roles.permissions,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .innerJoin(roles, eq(users.roleId, roles.id))
    .where(
      and(
        eq(sessions.token, hashSessionToken(token)),
        eq(sessions.purpose, "session"),
        gt(sessions.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!row) return null;

  return {
    sessionId: row.sessionId,
    user: toAuthUser({
      id: row.userId,
      email: row.email,
      twoFaEnabled: row.twoFaEnabled,
      role: {
        id: row.roleId,
        name: row.roleName,
        require2fa: row.requires2fa,
        permissions: (row.permissions ?? {}) as RolePermissions,
      },
    }),
  };
}

export async function findPendingSession(
  token: string,
  purpose: PendingPurpose,
): Promise<PendingSessionData | null> {
  const [row] = await db
    .select({
      sessionId: sessions.id,
      userId: users.id,
      email: users.email,
      twoFaEnabled: users.twoFaEnabled,
      twoFaSecret: users.twoFaSecret,
      twoFaFailedAttempts: users.twoFaFailedAttempts,
      twoFaLockedUntil: users.twoFaLockedUntil,
      roleId: roles.id,
      roleName: roles.name,
      requires2fa: roles.require2fa,
      permissions: roles.permissions,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .innerJoin(roles, eq(users.roleId, roles.id))
    .where(
      and(
        eq(sessions.token, hashSessionToken(token)),
        eq(sessions.purpose, purpose),
        gt(sessions.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!row) return null;

  return {
    sessionId: row.sessionId,
    userId: row.userId,
    email: row.email,
    twoFaEnabled: row.twoFaEnabled,
    twoFaSecret: row.twoFaSecret,
    twoFaFailedAttempts: row.twoFaFailedAttempts,
    twoFaLockedUntil: row.twoFaLockedUntil,
    role: {
      id: row.roleId,
      name: row.roleName,
      require2fa: row.requires2fa,
      permissions: (row.permissions ?? {}) as RolePermissions,
    },
  };
}

export async function revokeSession(token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.token, hashSessionToken(token)));
}

export async function deleteSessionById(sessionId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}

export async function deletePendingSessionsForUser(userId: string): Promise<void> {
  await db
    .delete(sessions)
    .where(and(eq(sessions.userId, userId), inArray(sessions.purpose, ["2fa_setup", "2fa_login"])));
}

export async function resetTwoFaFailures(userId: string): Promise<void> {
  await db
    .update(users)
    .set({ twoFaFailedAttempts: 0, twoFaLockedUntil: null, updatedAt: new Date() })
    .where(eq(users.id, userId));
}

export async function recordTwoFaFailure(
  userId: string,
  currentAttempts: number,
): Promise<{ attempts: number; lockedUntil: Date | null }> {
  const attempts = currentAttempts + 1;

  if (attempts >= env.TWO_FA_MAX_ATTEMPTS) {
    const lockedUntil = new Date(Date.now() + env.TWO_FA_LOCK_MINUTES * 60 * 1000);
    await db
      .update(users)
      .set({ twoFaFailedAttempts: attempts, twoFaLockedUntil: lockedUntil, updatedAt: new Date() })
      .where(eq(users.id, userId));
    return { attempts, lockedUntil };
  }

  await db
    .update(users)
    .set({ twoFaFailedAttempts: attempts, twoFaLockedUntil: null, updatedAt: new Date() })
    .where(eq(users.id, userId));
  return { attempts, lockedUntil: null };
}

export async function enableTwoFa(userId: string): Promise<void> {
  await db
    .update(users)
    .set({
      twoFaEnabled: true,
      twoFaFailedAttempts: 0,
      twoFaLockedUntil: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
}

export function remainingLockMinutes(lockedUntil: Date): number {
  return Math.max(1, Math.ceil((lockedUntil.getTime() - Date.now()) / 60000));
}
