-- Hand-added: drizzle-kit does not track extensions, and profiles.email is citext.
-- Lives here (not in a container init script) so it works on any database, not
-- just a fresh Docker volume.
CREATE EXTENSION IF NOT EXISTS citext;--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" "citext" NOT NULL,
	"password_hash" text,
	"display_name" text,
	"weight_unit" text DEFAULT 'kg' NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_email_unique" UNIQUE("email"),
	CONSTRAINT "profiles_weight_unit_check" CHECK ("profiles"."weight_unit" in ('kg', 'lb')),
	CONSTRAINT "profiles_language_check" CHECK ("profiles"."language" in ('en', 'he'))
);
--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_sessions_profile_id_idx" ON "auth_sessions" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "auth_sessions_expires_at_idx" ON "auth_sessions" USING btree ("expires_at");