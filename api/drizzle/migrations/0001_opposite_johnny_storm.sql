CREATE TABLE "exercises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid,
	"slug" text NOT NULL,
	"name_en" text,
	"name_he" text,
	"muscle_group" text NOT NULL,
	"equipment" text NOT NULL,
	"is_timed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exercises_name_check" CHECK ("exercises"."name_en" is not null or "exercises"."name_he" is not null),
	CONSTRAINT "exercises_muscle_group_check" CHECK ("exercises"."muscle_group" in ('chest', 'back', 'lower back', 'shoulders', 'traps', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'calves', 'core', 'full body', 'cardio')),
	CONSTRAINT "exercises_equipment_check" CHECK ("exercises"."equipment" in ('barbell', 'dumbbell', 'cable', 'machine', 'bodyweight', 'other'))
);
--> statement-breakpoint
CREATE TABLE "plan_days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_exercises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_day_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"target_sets" integer NOT NULL,
	"target_reps" integer,
	"target_duration_seconds" integer,
	"rest_seconds" integer NOT NULL,
	"progression_mode" text NOT NULL,
	"failure_target_reps" integer,
	"sessions_to_confirm" integer NOT NULL,
	"weight_step_kg" numeric(6, 3),
	CONSTRAINT "plan_exercises_sets_check" CHECK ("plan_exercises"."target_sets" between 1 and 20),
	CONSTRAINT "plan_exercises_rest_check" CHECK ("plan_exercises"."rest_seconds" between 0 and 600),
	CONSTRAINT "plan_exercises_reps_check" CHECK ("plan_exercises"."target_reps" is null or "plan_exercises"."target_reps" between 1 and 100),
	CONSTRAINT "plan_exercises_duration_check" CHECK ("plan_exercises"."target_duration_seconds" is null or "plan_exercises"."target_duration_seconds" between 5 and 3600),
	CONSTRAINT "plan_exercises_reps_xor_duration_check" CHECK (("plan_exercises"."target_reps" is null) <> ("plan_exercises"."target_duration_seconds" is null)),
	CONSTRAINT "plan_exercises_mode_check" CHECK ("plan_exercises"."progression_mode" in ('target', 'failure')),
	CONSTRAINT "plan_exercises_failure_check" CHECK ("plan_exercises"."progression_mode" <> 'failure' or ("plan_exercises"."failure_target_reps" is not null and "plan_exercises"."target_reps" is not null and "plan_exercises"."failure_target_reps" > "plan_exercises"."target_reps")),
	CONSTRAINT "plan_exercises_confirm_check" CHECK ("plan_exercises"."sessions_to_confirm" between 1 and 10)
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"name" text NOT NULL,
	"notes" text,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_owner_id_profiles_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_days" ADD CONSTRAINT "plan_days_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_exercises" ADD CONSTRAINT "plan_exercises_plan_day_id_plan_days_id_fk" FOREIGN KEY ("plan_day_id") REFERENCES "public"."plan_days"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Hand-edited: DEFERRABLE INITIALLY DEFERRED (drizzle cannot express it). The check
-- "this exercise is still used by a plan" then runs at commit, after every cascade
-- has finished, so deleting a profile can remove its plans and its custom exercises
-- in one statement, while deleting an exercise a plan still uses is still refused.
-- A plain NO ACTION check ran too early and failed that cascade.
ALTER TABLE "plan_exercises" ADD CONSTRAINT "plan_exercises_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "exercises_global_slug_idx" ON "exercises" USING btree ("slug") WHERE "exercises"."owner_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "exercises_owner_slug_idx" ON "exercises" USING btree ("owner_id","slug") WHERE "exercises"."owner_id" is not null;--> statement-breakpoint
CREATE INDEX "exercises_owner_id_idx" ON "exercises" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "plan_days_plan_id_idx" ON "plan_days" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "plan_exercises_plan_day_id_idx" ON "plan_exercises" USING btree ("plan_day_id");--> statement-breakpoint
CREATE INDEX "plan_exercises_exercise_id_idx" ON "plan_exercises" USING btree ("exercise_id");--> statement-breakpoint
CREATE INDEX "plans_profile_id_idx" ON "plans" USING btree ("profile_id");--> statement-breakpoint
CREATE UNIQUE INDEX "plans_one_active_per_profile_idx" ON "plans" USING btree ("profile_id") WHERE "plans"."is_active";