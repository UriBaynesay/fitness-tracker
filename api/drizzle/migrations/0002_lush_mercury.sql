CREATE TABLE "session_exercises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"skipped" boolean DEFAULT false NOT NULL,
	"target_sets" integer NOT NULL,
	"target_reps" integer,
	"target_duration_seconds" integer,
	"rest_seconds" integer NOT NULL,
	"progression_mode" text NOT NULL,
	"failure_target_reps" integer,
	"sessions_to_confirm" integer NOT NULL,
	"weight_step_kg" numeric(6, 3),
	CONSTRAINT "session_exercises_sets_check" CHECK ("session_exercises"."target_sets" between 1 and 20),
	CONSTRAINT "session_exercises_rest_check" CHECK ("session_exercises"."rest_seconds" between 0 and 600),
	CONSTRAINT "session_exercises_reps_check" CHECK ("session_exercises"."target_reps" is null or "session_exercises"."target_reps" between 1 and 100),
	CONSTRAINT "session_exercises_duration_check" CHECK ("session_exercises"."target_duration_seconds" is null or "session_exercises"."target_duration_seconds" between 5 and 3600),
	CONSTRAINT "session_exercises_reps_xor_duration_check" CHECK (("session_exercises"."target_reps" is null) <> ("session_exercises"."target_duration_seconds" is null)),
	CONSTRAINT "session_exercises_mode_check" CHECK ("session_exercises"."progression_mode" in ('target', 'failure')),
	CONSTRAINT "session_exercises_failure_check" CHECK ("session_exercises"."progression_mode" <> 'failure' or ("session_exercises"."failure_target_reps" is not null and "session_exercises"."target_reps" is not null and "session_exercises"."failure_target_reps" > "session_exercises"."target_reps")),
	CONSTRAINT "session_exercises_confirm_check" CHECK ("session_exercises"."sessions_to_confirm" between 1 and 10)
);
--> statement-breakpoint
CREATE TABLE "set_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_exercise_id" uuid NOT NULL,
	"set_number" integer NOT NULL,
	"weight_kg" numeric(7, 3),
	"reps" integer,
	"duration_seconds" integer,
	"to_failure" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "set_logs_number_check" CHECK ("set_logs"."set_number" between 1 and 40),
	CONSTRAINT "set_logs_weight_check" CHECK ("set_logs"."weight_kg" is null or "set_logs"."weight_kg" between 0 and 1000),
	CONSTRAINT "set_logs_reps_check" CHECK ("set_logs"."reps" is null or "set_logs"."reps" between 1 and 1000),
	CONSTRAINT "set_logs_duration_check" CHECK ("set_logs"."duration_seconds" is null or "set_logs"."duration_seconds" between 1 and 36000),
	CONSTRAINT "set_logs_reps_xor_duration_check" CHECK (("set_logs"."reps" is null) <> ("set_logs"."duration_seconds" is null))
);
--> statement-breakpoint
CREATE TABLE "workout_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"plan_day_id" uuid,
	"plan_day_name" text,
	"client_id" uuid NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"notes" text,
	CONSTRAINT "workout_sessions_end_check" CHECK ("workout_sessions"."ended_at" is null or "workout_sessions"."ended_at" >= "workout_sessions"."started_at")
);
--> statement-breakpoint
ALTER TABLE "session_exercises" ADD CONSTRAINT "session_exercises_session_id_workout_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."workout_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Hand-edited, for the same reason as plan_exercises (see 0001): DEFERRABLE INITIALLY
-- DEFERRED lets deleting a profile cascade through its workouts and its custom
-- exercises in one statement, while an exercise that a workout still uses cannot be
-- deleted on its own.
ALTER TABLE "session_exercises" ADD CONSTRAINT "session_exercises_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "set_logs" ADD CONSTRAINT "set_logs_session_exercise_id_session_exercises_id_fk" FOREIGN KEY ("session_exercise_id") REFERENCES "public"."session_exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_plan_day_id_plan_days_id_fk" FOREIGN KEY ("plan_day_id") REFERENCES "public"."plan_days"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "session_exercises_session_id_idx" ON "session_exercises" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "session_exercises_exercise_id_idx" ON "session_exercises" USING btree ("exercise_id");--> statement-breakpoint
CREATE UNIQUE INDEX "set_logs_exercise_set_idx" ON "set_logs" USING btree ("session_exercise_id","set_number");--> statement-breakpoint
CREATE UNIQUE INDEX "workout_sessions_profile_client_idx" ON "workout_sessions" USING btree ("profile_id","client_id");--> statement-breakpoint
CREATE INDEX "workout_sessions_profile_started_idx" ON "workout_sessions" USING btree ("profile_id","started_at" DESC NULLS LAST);