import { app } from "./app.ts";
import { env } from "./env.ts";

export default {
  port: env.API_PORT,
  fetch: app.fetch,
};
