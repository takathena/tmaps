import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

/**
 * Struktur permission belum diputuskan (Keputusan Terbuka #4).
 * Tipe sengaja longgar sampai bentuk final disepakati di langkah 1.4.
 */
export type RolePermissions = Record<string, unknown>;

export type CablePathPoint = {
  lat: number;
  lng: number;
};

export const deviceStatusEnum = pgEnum("device_status", ["active", "offline", "unmonitored"]);

// ---------------------------------------------------------------------------
// Auth & RBAC
// ---------------------------------------------------------------------------

export const roles = pgTable("roles", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  require2fa: boolean("require_2fa").notNull().default(false),
  permissions: jsonb("permissions")
    .$type<RolePermissions>()
    .notNull()
    .default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "restrict" }),
    twoFaSecret: text("two_fa_secret"),
    twoFaEnabled: boolean("two_fa_enabled").notNull().default(false),
    // Diperlukan flow #4: kunci sementara setelah 5 kali kode TOTP salah.
    twoFaFailedAttempts: integer("two_fa_failed_attempts").notNull().default(0),
    twoFaLockedUntil: timestamp("two_fa_locked_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("users_role_id_idx").on(table.roleId),
    check("users_two_fa_failed_attempts_non_negative", sql`${table.twoFaFailedAttempts} >= 0`),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("sessions_user_id_idx").on(table.userId),
    index("sessions_expires_at_idx").on(table.expiresAt),
  ],
);

// ---------------------------------------------------------------------------
// Katalog
// ---------------------------------------------------------------------------

export const deviceTypes = pgTable("device_types", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  category: text("category").notNull(),
  requiresIp: boolean("requires_ip").notNull().default(false),
  icon: text("icon").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const deviceModels = pgTable(
  "device_models",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    deviceTypeId: uuid("device_type_id")
      .notNull()
      .references(() => deviceTypes.id, { onDelete: "restrict" }),
    vendor: text("vendor").notNull(),
    modelName: text("model_name").notNull(),
    portCapacity: integer("port_capacity"),
    ponCapacity: integer("pon_capacity"),
    productUrl: text("product_url"),
    referenceImageUrl: text("reference_image_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("device_models_device_type_id_idx").on(table.deviceTypeId),
    index("device_models_vendor_model_idx").on(table.vendor, table.modelName),
    check(
      "device_models_port_capacity_non_negative",
      sql`${table.portCapacity} IS NULL OR ${table.portCapacity} >= 0`,
    ),
    check(
      "device_models_pon_capacity_non_negative",
      sql`${table.ponCapacity} IS NULL OR ${table.ponCapacity} >= 0`,
    ),
  ],
);

export const cableTypes = pgTable(
  "cable_types",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    vendor: text("vendor").notNull(),
    modelName: text("model_name").notNull(),
    color: text("color").notNull(),
    coreCapacity: integer("core_capacity").notNull(),
    productUrl: text("product_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("cable_types_vendor_model_idx").on(table.vendor, table.modelName),
    check("cable_types_core_capacity_positive", sql`${table.coreCapacity} > 0`),
  ],
);

// ---------------------------------------------------------------------------
// Perangkat & kabel
// ---------------------------------------------------------------------------

export const devices = pgTable(
  "devices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    deviceModelId: uuid("device_model_id")
      .notNull()
      .references(() => deviceModels.id, { onDelete: "restrict" }),
    ipAddress: text("ip_address"),
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),
    parentId: uuid("parent_id").references((): AnyPgColumn => devices.id, {
      onDelete: "set null",
    }),
    portUsed: integer("port_used").notNull().default(0),
    description: text("description"),
    status: deviceStatusEnum("status").notNull().default("unmonitored"),
    installedAt: timestamp("installed_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("devices_device_model_id_idx").on(table.deviceModelId),
    index("devices_parent_id_idx").on(table.parentId),
    index("devices_name_idx").on(table.name),
    index("devices_status_idx").on(table.status),
    check("devices_latitude_range", sql`${table.latitude} BETWEEN -90 AND 90`),
    check("devices_longitude_range", sql`${table.longitude} BETWEEN -180 AND 180`),
    check("devices_port_used_non_negative", sql`${table.portUsed} >= 0`),
  ],
);

export const deviceImages = pgTable(
  "device_images",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    deviceId: uuid("device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "cascade" }),
    imageUrl: text("image_url").notNull(),
    caption: text("caption"),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("device_images_device_id_idx").on(table.deviceId)],
);

export const cables = pgTable(
  "cables",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cableTypeId: uuid("cable_type_id")
      .notNull()
      .references(() => cableTypes.id, { onDelete: "restrict" }),
    deviceFromId: uuid("device_from_id")
      .notNull()
      .references(() => devices.id, { onDelete: "restrict" }),
    deviceToId: uuid("device_to_id")
      .notNull()
      .references(() => devices.id, { onDelete: "restrict" }),
    path: jsonb("path")
      .$type<CablePathPoint[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    length: doublePrecision("length").notNull().default(0),
    coreUsed: integer("core_used").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("cables_cable_type_id_idx").on(table.cableTypeId),
    index("cables_device_from_id_idx").on(table.deviceFromId),
    index("cables_device_to_id_idx").on(table.deviceToId),
    check("cables_length_non_negative", sql`${table.length} >= 0`),
    check("cables_core_used_non_negative", sql`${table.coreUsed} >= 0`),
  ],
);

// ---------------------------------------------------------------------------
// Monitoring
// ---------------------------------------------------------------------------

export const monitoringConfig = pgTable(
  "monitoring_config",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    deviceId: uuid("device_id")
      .notNull()
      .unique()
      .references(() => devices.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").notNull().default(false),
    intervalSeconds: integer("interval_seconds").notNull().default(60),
    nextCheckAt: timestamp("next_check_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("monitoring_config_due_idx").on(table.enabled, table.nextCheckAt),
    check("monitoring_config_interval_positive", sql`${table.intervalSeconds} > 0`),
  ],
);

export const pingLogs = pgTable(
  "ping_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    deviceId: uuid("device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "cascade" }),
    isUp: boolean("is_up").notNull(),
    latencyMs: integer("latency_ms"),
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("ping_logs_device_checked_idx").on(table.deviceId, table.checkedAt),
    check("ping_logs_latency_non_negative", sql`${table.latencyMs} IS NULL OR ${table.latencyMs} >= 0`),
  ],
);

export const deviceLogs = pgTable(
  "device_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    deviceId: uuid("device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "cascade" }),
    action: text("action").notNull(),
    changedBy: text("changed_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("device_logs_device_created_idx").on(table.deviceId, table.createdAt)],
);

// ---------------------------------------------------------------------------
// Tag & notifikasi
// ---------------------------------------------------------------------------

export const tags = pgTable(
  "tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("tags_name_lower_uniq").on(sql`lower(${table.name})`)],
);

export const deviceTags = pgTable(
  "device_tags",
  {
    deviceId: uuid("device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.deviceId, table.tagId] }),
    index("device_tags_tag_id_idx").on(table.tagId),
  ],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    deviceId: uuid("device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "cascade" }),
    isUp: boolean("is_up").notNull(),
    message: text("message").notNull(),
    isRead: boolean("is_read").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("notifications_device_id_idx").on(table.deviceId),
    index("notifications_is_read_created_idx").on(table.isRead, table.createdAt),
  ],
);

export type Role = typeof roles.$inferSelect;
export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type DeviceType = typeof deviceTypes.$inferSelect;
export type DeviceModel = typeof deviceModels.$inferSelect;
export type Device = typeof devices.$inferSelect;
export type CableType = typeof cableTypes.$inferSelect;
export type Cable = typeof cables.$inferSelect;
export type MonitoringConfig = typeof monitoringConfig.$inferSelect;
export type PingLog = typeof pingLogs.$inferSelect;
export type DeviceLog = typeof deviceLogs.$inferSelect;
export type Tag = typeof tags.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
