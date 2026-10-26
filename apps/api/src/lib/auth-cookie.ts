import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { env } from "../env.ts";
import { SESSION_COOKIE } from "./session.ts";

export function readSessionToken(c: Context): string | null {
  const cookieToken = getCookie(c, SESSION_COOKIE);
  if (cookieToken) return cookieToken;

  const authorization = c.req.header("Authorization");
  if (authorization?.startsWith("Bearer ")) {
    const token = authorization.slice("Bearer ".length).trim();
    return token.length > 0 ? token : null;
  }

  return null;
}

export function setSessionCookie(c: Context, token: string, expiresAt: Date): void {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "Lax",
    path: "/",
    expires: expiresAt,
  });
}

export function clearSessionCookie(c: Context): void {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
}
