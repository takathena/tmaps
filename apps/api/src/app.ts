import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { corsOrigins } from "./env.ts";
import { errorHandler, notFoundHandler } from "./lib/error-handler.ts";
import authRoutes from "./routes/auth.ts";
import catalogRoutes from "./routes/catalog.ts";
import health from "./routes/health.ts";
import rolesRoutes from "./routes/roles.ts";
import type { AppEnv } from "./types.ts";

export const app = new Hono<AppEnv>();

app.onError(errorHandler);
app.notFound(notFoundHandler);

app.use("*", logger());
app.use(
  "*",
  cors({
    origin: (origin) => {
      if (!origin) {
        return corsOrigins[0] ?? "http://localhost:5173";
      }
      return corsOrigins.includes(origin) ? origin : (corsOrigins[0] ?? "http://localhost:5173");
    },
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-Session-Token"],
    credentials: true,
    maxAge: 86400,
  }),
);

app.route("/health", health);
app.route("/auth", authRoutes);
app.route("/roles", rolesRoutes);
app.route("/catalog", catalogRoutes);

export default app;
