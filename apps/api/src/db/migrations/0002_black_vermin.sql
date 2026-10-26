ALTER TABLE "device_logs" DROP CONSTRAINT "device_logs_device_id_devices_id_fk";
--> statement-breakpoint
ALTER TABLE "device_logs" ALTER COLUMN "device_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "device_logs" ADD CONSTRAINT "device_logs_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;