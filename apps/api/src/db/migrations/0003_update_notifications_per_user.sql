-- Migrasi: Update notifications untuk status baca per user
-- Keputusan #6: Per user (setiap user punya status baca sendiri)

-- Hapus index lama
DROP INDEX IF EXISTS "notifications_is_read_created_idx";

-- Tambah kolom user_id
ALTER TABLE "notifications" ADD COLUMN "user_id" uuid;

-- Ganti is_read dengan read_at
ALTER TABLE "notifications" ADD COLUMN "read_at" timestamp with time zone;

-- Migrasi data lama: is_read = true -> read_at = created_at, is_read = false -> read_at = null
UPDATE "notifications" SET "read_at" = "created_at" WHERE "is_read" = true;

-- Hapus kolom is_read
ALTER TABLE "notifications" DROP COLUMN "is_read";

-- Set user_id NOT NULL (setelah data lama dibersihkan atau diisi)
-- CATATAN: Jika ada data notifikasi lama tanpa user, hapus dulu atau assign ke user tertentu
DELETE FROM "notifications" WHERE "user_id" IS NULL;

ALTER TABLE "notifications" ALTER COLUMN "user_id" SET NOT NULL;

-- Tambah foreign key ke users
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" 
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade;

-- Buat index baru
CREATE INDEX IF NOT EXISTS "notifications_user_id_idx" ON "notifications" ("user_id");
CREATE INDEX IF NOT EXISTS "notifications_user_read_created_idx" ON "notifications" ("user_id","read_at","created_at");
