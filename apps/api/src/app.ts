import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { corsOrigins } from "./env.ts";
import { errorHandler, notFoundHandler } from "./lib/error-handler.ts";
import { cleanupExpired as cleanupRateLimits } from "./lib/rate-limiter.ts";
import authRoutes from "./routes/auth.ts";
import catalogRoutes from "./routes/catalog.ts";
import cablesRoutes from "./routes/cables.ts";
import devicesRoutes from "./routes/devices.ts";
import health from "./routes/health.ts";
import monitoringRoutes from "./routes/monitoring.ts";
import notificationRoutes from "./routes/notifications.ts";
import rolesRoutes from "./routes/roles.ts";
import searchRoutes from "./routes/search.ts";
import tagsRoutes from "./routes/tags.ts";
import uploadsRoutes from "./routes/uploads.ts";
import type { AppEnv } from "./types.ts";
import { startMonitoring } from "./services/monitor.ts";

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
app.route("/devices", devicesRoutes);
app.route("/cables", cablesRoutes);
app.route("/uploads", uploadsRoutes);
app.route("/notifications", notificationRoutes);
app.route("/search", searchRoutes);
app.route("/tags", tagsRoutes);
app.route("/", monitoringRoutes);

// Start monitoring scheduler
startMonitoring();

// Cleanup rate limiter expired entries tiap 10 menit
setInterval(() => cleanupRateLimits(), 10 * 60 * 1000);

export default app;
