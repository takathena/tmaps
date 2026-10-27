DROP INDEX "notifications_is_read_created_idx";--> statement-breakpoint
CREATE INDEX "notifications_read_created_idx" ON "notifications" USING btree ("is_read","created_at");