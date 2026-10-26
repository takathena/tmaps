import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { db } from "../db/client.ts";
import { roles, users } from "../db/schema.ts";
import type { RolePermissions } from "../lib/permissions.ts";
import { clearSessionCookie, readSessionToken, setSessionCookie } from "../lib/auth-cookie.ts";
import { jsonBody } from "../lib/validation.ts";
import { requireAuth } from "../middleware/auth.ts";
import { issueSession, revokeSession } from "../services/auth-service.ts";
import type { AppEnv, AuthUser } from "../types.ts";

const loginSchema = z.object({
  email: z.string().trim().email("Format email tidak valid."),
  password: z.string().min(1, "Password wajib diisi."),
});

const authRoutes = new Hono<AppEnv>();

authRoutes.post("/login", jsonBody(loginSchema), async (c) => {
  const { email: rawEmail, password } = c.req.valid("json");
  const email = rawEmail.toLowerCase();

  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      passwordHash: users.passwordHash,
      twoFaEnabled: users.twoFaEnabled,
      roleId: roles.id,
      roleName: roles.name,
      requires2fa: roles.require2fa,
      permissions: roles.permissions,
    })
    .from(users)
    .innerJoin(roles, eq(users.roleId, roles.id))
    .where(eq(users.email, email))
    .limit(1);

  // Pesan sengaja sama untuk email tidak ditemukan maupun password salah.
  if (!row || !(await Bun.password.verify(password, row.passwordHash))) {
    throw new HTTPException(401, { message: "Email atau password salah." });
  }

  // Pemeriksaan 2FA ditambahkan pada langkah 1.5.
  const session = await issueSession(row.id);
  setSessionCookie(c, session.token, session.expiresAt);

  const user: AuthUser = {
    id: row.id,
    email: row.email,
    twoFaEnabled: row.twoFaEnabled,
    role: {
      id: row.roleId,
      name: row.roleName,
      require2fa: row.requires2fa,
      permissions: (row.permissions ?? {}) as RolePermissions,
    },
  };

  c.header("Cache-Control", "no-store");
  return c.json({ user });
});

authRoutes.post("/logout", async (c) => {
  const token = readSessionToken(c);

  if (token) {
    await revokeSession(token);
  }

  clearSessionCookie(c);
  return c.body(null, 204);
});

authRoutes.get("/me", requireAuth, (c) => {
  c.header("Cache-Control", "no-store");
  return c.json({ user: c.get("user") });
});

export default authRoutes;
