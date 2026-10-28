import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/client.ts";

const healthRoutes = new Hono();

healthRoutes.get("/", async (c) => {
  try {
    await db.execute(sql`SELECT 1`);
    return c.json({
      status: "ok",
      db: "up",
      timestamp: new Date().toISOString(),
    });
  } catch {
    return c.json(
      {
        status: "error",
        db: "down",
        timestamp: new Date().toISOString(),
      },
      503,
    );
  }
});

export default healthRoutes;
