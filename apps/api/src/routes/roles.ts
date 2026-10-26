import { Hono } from "hono";
import { db } from "../db/client.ts";
import { roles } from "../db/schema.ts";
import { requireAuth } from "../middleware/auth.ts";
import { requirePermission } from "../middleware/permission.ts";
import type { AppEnv } from "../types.ts";

const rolesRoutes = new Hono<AppEnv>();

rolesRoutes.use("*", requireAuth);

rolesRoutes.get("/", requirePermission("roles", "read"), async (c) => {
  const rows = await db
    .select({
      id: roles.id,
      name: roles.name,
      require2fa: roles.require2fa,
      permissions: roles.permissions,
    })
    .from(roles)
    .orderBy(roles.name);

  return c.json({ roles: rows });
});

export default rolesRoutes;
