import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { db } from "../db/client.ts";
import { roles } from "../db/schema.ts";
import { jsonBody } from "../lib/validation.ts";
import { requireAuth } from "../middleware/auth.ts";
import { requirePermission } from "../middleware/permission.ts";
import type { AppEnv } from "../types.ts";

const updateRoleSchema = z.object({
  require2fa: z.boolean(),
});

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

rolesRoutes.patch(
  "/:id",
  requirePermission("roles", "write"),
  jsonBody(updateRoleSchema),
  async (c) => {
    const roleId = c.req.param("id");

    if (!z.string().uuid().safeParse(roleId).success) {
      throw new HTTPException(404, { message: "Role tidak ditemukan." });
    }

    const [updated] = await db
      .update(roles)
      .set({ require2fa: c.req.valid("json").require2fa, updatedAt: new Date() })
      .where(eq(roles.id, roleId))
      .returning({
        id: roles.id,
        name: roles.name,
        require2fa: roles.require2fa,
        permissions: roles.permissions,
      });

    if (!updated) {
      throw new HTTPException(404, { message: "Role tidak ditemukan." });
    }

    return c.json({ role: updated });
  },
);

export default rolesRoutes;
