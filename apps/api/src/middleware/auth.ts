import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { findSessionUser } from "../services/auth-service.ts";
import type { AppEnv } from "../types.ts";
import { clearSessionCookie, readSessionToken } from "../lib/auth-cookie.ts";

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const token = readSessionToken(c);

  if (!token) {
    throw new HTTPException(401, { message: "Sesi tidak ditemukan. Silakan login." });
  }

  const session = await findSessionUser(token);

  if (!session) {
    clearSessionCookie(c);
    throw new HTTPException(401, { message: "Sesi tidak valid atau sudah kedaluwarsa." });
  }

  c.set("user", session.user);
  c.set("sessionId", session.sessionId);

  await next();
});
