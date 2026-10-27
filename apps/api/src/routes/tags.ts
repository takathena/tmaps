import { Hono } from "hono";
import { db } from "../db/client.ts";
import { tags } from "../db/schema.ts";
import { requireAuth } from "../middleware/auth.ts";
import type { AppEnv } from "../types.ts";

const tagsRoutes = new Hono<AppEnv>();

tagsRoutes.use("*", requireAuth);

// GET /tags - daftar semua tag
tagsRoutes.get("/", async (c) => {
  const rows = await db
    .select({
      id: tags.id,
      name: tags.name,
    })
    .from(tags)
    .orderBy(tags.name);

  return c.json({ tags: rows });
});

export default tagsRoutes;
