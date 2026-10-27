import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { readUpload } from "../lib/uploads.ts";
import { requireAuth } from "../middleware/auth.ts";
import { requirePermission } from "../middleware/permission.ts";
import type { AppEnv } from "../types.ts";

const uploadsRoutes = new Hono<AppEnv>();

uploadsRoutes.use("*", requireAuth);

/**
 * Gambar disajikan lewat API agar tetap terlindungi sesi. Browser mengirim
 * cookie HttpOnly yang sama saat memuat <img>, jadi galeri tidak memerlukan
 * URL publik yang dapat diakses tanpa login.
 */
uploadsRoutes.get(
  "/:filename",
  requirePermission("devices", "read"),
  async (c) => {
    const filename = c.req.param("filename");
    const file = await readUpload(filename);

    if (!file) {
      throw new HTTPException(404, { message: "Gambar tidak ditemukan." });
    }

    return new Response(file.bytes, {
      headers: {
        "Content-Type": file.mime,
        "Content-Length": String(file.bytes.byteLength),
        "Cache-Control": "private, max-age=86400",
        "X-Content-Type-Options": "nosniff",
      },
    });
  },
);

export default uploadsRoutes;
