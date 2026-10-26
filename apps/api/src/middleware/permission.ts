import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { hasPermission, type PermissionAction, type PermissionResource } from "../lib/permissions.ts";
import type { AppEnv } from "../types.ts";

export function requirePermission(resource: PermissionResource, action: PermissionAction) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const user = c.get("user");

    if (!user) {
      throw new HTTPException(401, { message: "Sesi tidak ditemukan. Silakan login." });
    }

    if (!hasPermission(user.role.permissions, resource, action)) {
      throw new HTTPException(403, {
        message: `Anda tidak memiliki izin ${action} pada ${resource}.`,
      });
    }

    await next();
  });
}
