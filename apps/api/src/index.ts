import { Hono } from "hono";

const app = new Hono();

app.get("/health", (c) => c.json({ status: "ok" }));

export default {
  port: Number(process.env.API_PORT ?? 3000),
  fetch: app.fetch,
};
