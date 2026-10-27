import { eq, desc } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/client.ts";
import { notifications } from "../db/schema.ts";
import { requireAuth } from "../middleware/auth.ts";
import type { AppEnv } from "../types.ts";

const notificationRoutes = new Hono<AppEnv>();

notificationRoutes.use("*", requireAuth);

// GET /notifications - daftar notifikasi global
notificationRoutes.get("/", async (c) => {
  const items = await db
    .select()
    .from(notifications)
    .orderBy(desc(notifications.createdAt))
    .limit(100);

  return c.json({ notifications: items });
});

// GET /notifications/unread-count
notificationRoutes.get("/unread-count", async (c) => {
  const unread = await db
    .select()
    .from(notifications)
    .where(eq(notifications.isRead, false));

  return c.json({ count: unread.length });
});

// POST /notifications/:id/read
notificationRoutes.post("/:id/read", async (c) => {
  const id = c.req.param("id");

  const [item] = await db
    .select()
    .from(notifications)
    .where(eq(notifications.id, id))
    .limit(1);

  if (!item) {
    return c.json({ error: "Notifikasi tidak ditemukan." }, 404);
  }

  if (item.isRead) {
    return c.json({ notification: item });
  }

  const [updated] = await db
    .update(notifications)
    .set({ isRead: true })
    .where(eq(notifications.id, id))
    .returning();

  return c.json({ notification: updated });
});

// POST /notifications/mark-all-read
notificationRoutes.post("/mark-all-read", async (c) => {
  await db
    .update(notifications)
    .set({ isRead: true })
    .where(eq(notifications.isRead, false));

  return c.json({ success: true });
});

export default notificationRoutes;
