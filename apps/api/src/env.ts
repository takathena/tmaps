import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  API_PORT: z.coerce.number().int().positive().default(3000),
  CORS_ORIGIN: z.string().min(1).default("http://localhost:5173"),
  SESSION_TTL_HOURS: z.coerce.number().positive().default(168),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  // Kunci enkripsi secret 2FA (Keputusan #2). Harus base64 dari tepat 32 byte.
  TOTP_ENCRYPTION_KEY: z
    .string()
    .min(1, "TOTP_ENCRYPTION_KEY wajib diisi.")
    .refine(
      (value) => {
        try {
          return Buffer.from(value, "base64").length === 32;
        } catch {
          return false;
        }
      },
      "TOTP_ENCRYPTION_KEY harus base64 dari 32 byte (contoh: openssl rand -base64 32).",
    ),

  TWO_FA_PENDING_TTL_MINUTES: z.coerce.number().int().positive().default(5),
  TWO_FA_LOCK_MINUTES: z.coerce.number().int().positive().default(15),
  TWO_FA_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),

  // Keputusan #5: gambar disimpan di volume lokal, bukan object storage.
  // Di Docker Compose nilainya diarahkan ke /data/uploads (volume `uploads`).
  UPLOAD_DIR: z.string().trim().min(1).default("./storage/uploads"),
  MAX_UPLOAD_MB: z.coerce
    .number()
    .positive("MAX_UPLOAD_MB harus lebih dari 0.")
    .max(100, "MAX_UPLOAD_MB maksimal 100.")
    .default(5),
  
  // Monitoring (Fase 3)
  PING_TICK_SECONDS: z.coerce.number().positive().default(5),
  PING_TIMEOUT_MS: z.coerce.number().positive().default(2000),
  PING_CONCURRENCY: z.coerce.number().positive().default(10),
  PING_LOG_RETENTION_DAYS: z.coerce.number().positive().default(30),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const keys = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
  throw new Error(`Konfigurasi environment tidak valid: ${keys}. Periksa .env (lihat .env.example).`);
}

export const env = parsed.data;

export const corsOrigins = env.CORS_ORIGIN.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
