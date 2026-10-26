CREATE TYPE "public"."session_purpose" AS ENUM('session', '2fa_setup', '2fa_login');--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "purpose" "session_purpose" DEFAULT 'session' NOT NULL;