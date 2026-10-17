CREATE TABLE "goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"metric" text NOT NULL,
	"start_value" numeric(8, 3) NOT NULL,
	"target_value" numeric(8, 3) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "goals_metric_check" CHECK ("goals"."metric" in ('weight', 'reps', 'duration')),
	CONSTRAINT "goals_values_check" CHECK ("goals"."start_value" >= 0 and "goals"."target_value" > "goals"."start_value")
);
--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Hand-edited like session_exercises (see 0002): DEFERRABLE INITIALLY DEFERRED so deleting a
-- profile cascades through its goals and custom exercises in one statement.
ALTER TABLE "goals" ADD CONSTRAINT "goals_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
CREATE UNIQUE INDEX "goals_profile_exercise_metric_idx" ON "goals" USING btree ("profile_id","exercise_id","metric");