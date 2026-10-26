import { Hono } from "hono";
import { pool } from "../db/client.ts";

const health = new Hono();

health.get("/", async (c) => {
  try {
    const { rows } = await pool.query("SELECT 1 AS ok");
    const dbUp = rows[0]?.ok === 1;

    if (!dbUp) {
      return c.json({ status: "error", db: "down", timestamp: new Date().toISOString() }, 503);
    }

    return c.json({ status: "ok", db: "up", timestamp: new Date().toISOString() });
  } catch (error) {
    console.error("[health] koneksi DB gagal:", error instanceof Error ? error.message : error);
    return c.json({ status: "error", db: "down", timestamp: new Date().toISOString() }, 503);
  }
});

export default health;
