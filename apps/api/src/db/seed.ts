import { eq } from "drizzle-orm";
import { db, pool } from "./client.ts";
import { roles, users, type RolePermissions } from "./schema.ts";

/**
 * Permission final mengikuti Keputusan Terbuka #4 dan akan diisi pada langkah 1.4.
 * Seed sengaja tidak mengarang struktur permission sebelum diputuskan user.
 */
const EMPTY_PERMISSIONS: RolePermissions = {};

const roleSeeds = [
  { name: "Admin", require2fa: true, permissions: EMPTY_PERMISSIONS },
  { name: "Teknisi", require2fa: false, permissions: EMPTY_PERMISSIONS },
  { name: "Viewer", require2fa: false, permissions: EMPTY_PERMISSIONS },
] as const;

async function seed() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    throw new Error(
      "SEED_ADMIN_EMAIL dan SEED_ADMIN_PASSWORD wajib diisi di .env sebelum menjalankan seed.",
    );
  }

  if (adminPassword.length < 12) {
    throw new Error("SEED_ADMIN_PASSWORD minimal 12 karakter.");
  }

  let adminRoleId: string | undefined;

  for (const roleSeed of roleSeeds) {
    await db.insert(roles).values(roleSeed).onConflictDoNothing({ target: roles.name });

    const [role] = await db.select().from(roles).where(eq(roles.name, roleSeed.name)).limit(1);
    if (!role) {
      throw new Error(`Role ${roleSeed.name} gagal dibuat.`);
    }

    if (roleSeed.name === "Admin") {
      adminRoleId = role.id;
    }
  }

  if (!adminRoleId) {
    throw new Error("Role Admin tidak ditemukan setelah seed.");
  }

  const [existingAdmin] = await db.select({ id: users.id }).from(users).where(eq(users.email, adminEmail)).limit(1);

  if (existingAdmin) {
    console.log(`User admin ${adminEmail} sudah ada, seed tidak mengubah data.`);
  } else {
    const passwordHash = await Bun.password.hash(adminPassword);
    await db.insert(users).values({
      email: adminEmail,
      passwordHash,
      roleId: adminRoleId,
    });
    console.log(`User admin ${adminEmail} dibuat.`);
  }

  console.log("Seed selesai (idempoten).");
}

try {
  await seed();
} catch (error) {
  console.error("Seed gagal:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
