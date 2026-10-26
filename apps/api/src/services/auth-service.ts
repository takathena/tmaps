import { and, eq, gt, lt } from "drizzle-orm";
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

export function sessionExpiryDate(): Date {
  return new Date(Date.now() + env.SESSION_TTL_HOURS * 60 * 60 * 1000);
}

export async function issueSession(userId: string): Promise<IssuedSession> {
  const token = createSessionToken();
  const expiresAt = sessionExpiryDate();

  await db.insert(sessions).values({
    userId,
    token: hashSessionToken(token),
    expiresAt,
  });

  // Bersihkan sesi kedaluwarsa secara oportunistik.
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));

  return { token, expiresAt };
}

export async function findSessionUser(token: string): Promise<{ sessionId: string; user: AuthUser } | null> {
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
    .where(and(eq(sessions.token, hashSessionToken(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);

  if (!row) return null;

  return {
    sessionId: row.sessionId,
    user: {
      id: row.userId,
      email: row.email,
      twoFaEnabled: row.twoFaEnabled,
      role: {
        id: row.roleId,
        name: row.roleName,
        require2fa: row.requires2fa,
        permissions: (row.permissions ?? {}) as RolePermissions,
      },
    },
  };
}

export async function revokeSession(token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.token, hashSessionToken(token)));
}
