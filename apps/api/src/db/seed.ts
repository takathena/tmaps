import { eq } from "drizzle-orm";
import { db, pool } from "./client.ts";
import {
  ADMIN_PERMISSIONS,
  TEKNISI_PERMISSIONS,
  VIEWER_PERMISSIONS,
  type RolePermissions,
} from "../lib/permissions.ts";
import { roles, users } from "./schema.ts";

type RoleSeed = {
  name: string;
  require2fa: boolean;
  permissions: RolePermissions;
};

const roleSeeds: RoleSeed[] = [
  { name: "Admin", require2fa: true, permissions: ADMIN_PERMISSIONS },
  { name: "Teknisi", require2fa: false, permissions: TEKNISI_PERMISSIONS },
  { name: "Viewer", require2fa: false, permissions: VIEWER_PERMISSIONS },
];

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
    const [existing] = await db.select().from(roles).where(eq(roles.name, roleSeed.name)).limit(1);

    if (!existing) {
      const [created] = await db.insert(roles).values(roleSeed).returning({ id: roles.id, name: roles.name });
      if (roleSeed.name === "Admin") adminRoleId = created?.id;
      continue;
    }

    // Jangan menimpa permission yang sudah diubah admin. Isi hanya bila masih kosong
    // (mis. role hasil seed lama sebelum Keputusan #4 dijawab).
    if (Object.keys(existing.permissions ?? {}).length === 0) {
      await db.update(roles).set({ permissions: roleSeed.permissions }).where(eq(roles.id, existing.id));
    }

    if (roleSeed.name === "Admin") adminRoleId = existing.id;
  }

  if (!adminRoleId) {
    throw new Error("Role Admin tidak ditemukan setelah seed.");
  }

  const [existingAdmin] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, adminEmail))
    .limit(1);

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
