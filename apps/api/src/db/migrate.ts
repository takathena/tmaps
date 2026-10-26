import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";
import path from "node:path";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL belum diatur. Salin .env.example menjadi .env lalu isi nilainya.");
}

const client = new Client({ connectionString });

try {
  await client.connect();
  console.log("Memastikan extension PostGIS tersedia...");
  await client.query("CREATE EXTENSION IF NOT EXISTS postgis");
  console.log("Menjalankan migrasi...");
  await migrate(drizzle(client), {
    migrationsFolder: path.join(import.meta.dir, "migrations"),
  });
  console.log("Migrasi selesai.");
} finally {
  await client.end();
}
