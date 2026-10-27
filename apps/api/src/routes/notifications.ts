import { eq, and, isNull, desc } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/client.ts";
import { notifications } from "../db/schema.ts";
import { requireAuth } from "../middleware/auth.ts";
import type { AppEnv } from "../types.ts";

const notificationRoutes = new Hono<AppEnv>();

notificationRoutes.use("*", requireAuth);

// GET /notifications - daftar notifikasi user
notificationRoutes.get("/", async (c) => {
  const user = c.get("user")!;

  const items = await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, user.id))
    .orderBy(desc(notifications.createdAt))
    .limit(100);

  return c.json({ notifications: items });
});

// GET /notifications/unread-count
notificationRoutes.get("/unread-count", async (c) => {
  const user = c.get("user")!;

  const unread = await db
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, user.id),
        isNull(notifications.readAt)
      )
    );

  return c.json({ count: unread.length });
});

// POST /notifications/:id/read
notificationRoutes.post("/:id/read", async (c) => {
  const id = c.req.param("id");
  const user = c.get("user")!;

  const [item] = await db
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.id, id),
        eq(notifications.userId, user.id)
      )
    )
    .limit(1);

  if (!item) {
    return c.json({ error: "Notifikasi tidak ditemukan." }, 404);
  }

  if (item.readAt) {
    return c.json({ notification: item });
  }

  const [updated] = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(eq(notifications.id, id))
    .returning();

  return c.json({ notification: updated });
});

// POST /notifications/mark-all-read
notificationRoutes.post("/mark-all-read", async (c) => {
  const user = c.get("user")!;

  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.userId, user.id),
        isNull(notifications.readAt)
      )
    );

  return c.json({ success: true });
});

export default notificationRoutes;
