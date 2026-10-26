CREATE TYPE "public"."device_status" AS ENUM('active', 'offline', 'unmonitored');--> statement-breakpoint
CREATE TABLE "cable_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor" text NOT NULL,
	"model_name" text NOT NULL,
	"color" text NOT NULL,
	"core_capacity" integer NOT NULL,
	"product_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cable_types_core_capacity_positive" CHECK ("cable_types"."core_capacity" > 0)
);
--> statement-breakpoint
CREATE TABLE "cables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cable_type_id" uuid NOT NULL,
	"device_from_id" uuid NOT NULL,
	"device_to_id" uuid NOT NULL,
	"path" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"length" double precision DEFAULT 0 NOT NULL,
	"core_used" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cables_length_non_negative" CHECK ("cables"."length" >= 0),
	CONSTRAINT "cables_core_used_non_negative" CHECK ("cables"."core_used" >= 0)
);
--> statement-breakpoint
CREATE TABLE "device_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" uuid NOT NULL,
	"image_url" text NOT NULL,
	"caption" text,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "device_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" uuid NOT NULL,
	"action" text NOT NULL,
	"changed_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "device_models" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_type_id" uuid NOT NULL,
	"vendor" text NOT NULL,
	"model_name" text NOT NULL,
	"port_capacity" integer,
	"pon_capacity" integer,
	"product_url" text,
	"reference_image_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "device_models_port_capacity_non_negative" CHECK ("device_models"."port_capacity" IS NULL OR "device_models"."port_capacity" >= 0),
	CONSTRAINT "device_models_pon_capacity_non_negative" CHECK ("device_models"."pon_capacity" IS NULL OR "device_models"."pon_capacity" >= 0)
);
--> statement-breakpoint
CREATE TABLE "device_tags" (
	"device_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "device_tags_device_id_tag_id_pk" PRIMARY KEY("device_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "device_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"requires_ip" boolean DEFAULT false NOT NULL,
	"icon" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "device_types_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"device_model_id" uuid NOT NULL,
	"ip_address" text,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"parent_id" uuid,
	"port_used" integer DEFAULT 0 NOT NULL,
	"description" text,
	"status" "device_status" DEFAULT 'unmonitored' NOT NULL,
	"installed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "devices_latitude_range" CHECK ("devices"."latitude" BETWEEN -90 AND 90),
	CONSTRAINT "devices_longitude_range" CHECK ("devices"."longitude" BETWEEN -180 AND 180),
	CONSTRAINT "devices_port_used_non_negative" CHECK ("devices"."port_used" >= 0)
);
--> statement-breakpoint
CREATE TABLE "monitoring_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" uuid NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"interval_seconds" integer DEFAULT 60 NOT NULL,
	"next_check_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "monitoring_config_device_id_unique" UNIQUE("device_id"),
	CONSTRAINT "monitoring_config_interval_positive" CHECK ("monitoring_config"."interval_seconds" > 0)
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" uuid NOT NULL,
	"is_up" boolean NOT NULL,
	"message" text NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ping_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" uuid NOT NULL,
	"is_up" boolean NOT NULL,
	"latency_ms" integer,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ping_logs_latency_non_negative" CHECK ("ping_logs"."latency_ms" IS NULL OR "ping_logs"."latency_ms" >= 0)
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"require_2fa" boolean DEFAULT false NOT NULL,
	"permissions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roles_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role_id" uuid NOT NULL,
	"two_fa_secret" text,
	"two_fa_enabled" boolean DEFAULT false NOT NULL,
	"two_fa_failed_attempts" integer DEFAULT 0 NOT NULL,
	"two_fa_locked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_two_fa_failed_attempts_non_negative" CHECK ("users"."two_fa_failed_attempts" >= 0)
);
--> statement-breakpoint
ALTER TABLE "cables" ADD CONSTRAINT "cables_cable_type_id_cable_types_id_fk" FOREIGN KEY ("cable_type_id") REFERENCES "public"."cable_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cables" ADD CONSTRAINT "cables_device_from_id_devices_id_fk" FOREIGN KEY ("device_from_id") REFERENCES "public"."devices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cables" ADD CONSTRAINT "cables_device_to_id_devices_id_fk" FOREIGN KEY ("device_to_id") REFERENCES "public"."devices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_images" ADD CONSTRAINT "device_images_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_logs" ADD CONSTRAINT "device_logs_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_models" ADD CONSTRAINT "device_models_device_type_id_device_types_id_fk" FOREIGN KEY ("device_type_id") REFERENCES "public"."device_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_tags" ADD CONSTRAINT "device_tags_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_tags" ADD CONSTRAINT "device_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_device_model_id_device_models_id_fk" FOREIGN KEY ("device_model_id") REFERENCES "public"."device_models"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_parent_id_devices_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monitoring_config" ADD CONSTRAINT "monitoring_config_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ping_logs" ADD CONSTRAINT "ping_logs_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cable_types_vendor_model_idx" ON "cable_types" USING btree ("vendor","model_name");--> statement-breakpoint
CREATE INDEX "cables_cable_type_id_idx" ON "cables" USING btree ("cable_type_id");--> statement-breakpoint
CREATE INDEX "cables_device_from_id_idx" ON "cables" USING btree ("device_from_id");--> statement-breakpoint
CREATE INDEX "cables_device_to_id_idx" ON "cables" USING btree ("device_to_id");--> statement-breakpoint
CREATE INDEX "device_images_device_id_idx" ON "device_images" USING btree ("device_id");--> statement-breakpoint
CREATE INDEX "device_logs_device_created_idx" ON "device_logs" USING btree ("device_id","created_at");--> statement-breakpoint
CREATE INDEX "device_models_device_type_id_idx" ON "device_models" USING btree ("device_type_id");--> statement-breakpoint
CREATE INDEX "device_models_vendor_model_idx" ON "device_models" USING btree ("vendor","model_name");--> statement-breakpoint
CREATE INDEX "device_tags_tag_id_idx" ON "device_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "devices_device_model_id_idx" ON "devices" USING btree ("device_model_id");--> statement-breakpoint
CREATE INDEX "devices_parent_id_idx" ON "devices" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "devices_name_idx" ON "devices" USING btree ("name");--> statement-breakpoint
CREATE INDEX "devices_status_idx" ON "devices" USING btree ("status");--> statement-breakpoint
CREATE INDEX "monitoring_config_due_idx" ON "monitoring_config" USING btree ("enabled","next_check_at");--> statement-breakpoint
CREATE INDEX "notifications_device_id_idx" ON "notifications" USING btree ("device_id");--> statement-breakpoint
CREATE INDEX "notifications_is_read_created_idx" ON "notifications" USING btree ("is_read","created_at");--> statement-breakpoint
CREATE INDEX "ping_logs_device_checked_idx" ON "ping_logs" USING btree ("device_id","checked_at");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_name_lower_uniq" ON "tags" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "users_role_id_idx" ON "users" USING btree ("role_id");