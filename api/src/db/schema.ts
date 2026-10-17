import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { EQUIPMENT, GOAL_METRICS, MUSCLE_GROUPS, PROGRESSION_MODES } from "@fitness/shared";

// Renders ['a', 'b'] as 'a', 'b' for a CHECK ... IN (...). The lists are constants
// from the shared package, so one source of truth feeds the API, the UI and the DB.
const inList = (values: readonly string[]) => sql.raw(values.map((v) => `'${v}'`).join(", "));

// Case-insensitive text: "A@x.com" and "a@x.com" are the same account. Needs the
// citext extension, which the first migration creates.
const citext = customType<{ data: string }>({
  dataType() {
    return "citext";
  },
});

export const profiles = pgTable(
  "profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: citext("email").notNull().unique(),
    // Nullable on purpose: room for an account with no password of its own
    // (Google OAuth later). Login treats a null hash like a wrong password.
    passwordHash: text("password_hash"),
    displayName: text("display_name"),
    weightUnit: text("weight_unit", { enum: ["kg", "lb"] }).notNull().default("kg"),
    language: text("language", { enum: ["en", "he"] }).notNull().default("en"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("profiles_weight_unit_check", sql`${t.weightUnit} in ('kg', 'lb')`),
    check("profiles_language_check", sql`${t.language} in ('en', 'he')`),
  ]
);

// Named auth_sessions to stay distinct from the spec's workout_sessions.
export const authSessions = pgTable(
  "auth_sessions",
  {
    // sha256 of the cookie value: a leaked database does not leak live sessions.
    tokenHash: text("token_hash").primaryKey(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    userAgent: text("user_agent"),
  },
  (t) => [
    index("auth_sessions_profile_id_idx").on(t.profileId),
    index("auth_sessions_expires_at_idx").on(t.expiresAt),
  ]
);

export type ProfileRow = typeof profiles.$inferSelect;

// ---- exercise library ------------------------------------------------------

export const exercises = pgTable(
  "exercises",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // null = part of the seeded library; set = created by that profile.
    ownerId: uuid("owner_id").references(() => profiles.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    nameEn: text("name_en"),
    nameHe: text("name_he"),
    muscleGroup: text("muscle_group", { enum: MUSCLE_GROUPS }).notNull(),
    equipment: text("equipment", { enum: EQUIPMENT }).notNull(),
    isTimed: boolean("is_timed").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The seed upserts by slug, so seeded slugs must be unique among themselves;
    // a user's own slugs only need to be unique within that user.
    uniqueIndex("exercises_global_slug_idx").on(t.slug).where(sql`${t.ownerId} is null`),
    uniqueIndex("exercises_owner_slug_idx").on(t.ownerId, t.slug).where(sql`${t.ownerId} is not null`),
    index("exercises_owner_id_idx").on(t.ownerId),
    check("exercises_name_check", sql`${t.nameEn} is not null or ${t.nameHe} is not null`),
    check("exercises_muscle_group_check", sql`${t.muscleGroup} in (${inList(MUSCLE_GROUPS)})`),
    check("exercises_equipment_check", sql`${t.equipment} in (${inList(EQUIPMENT)})`),
  ]
);

export type ExerciseRow = typeof exercises.$inferSelect;

// ---- plans -----------------------------------------------------------------

export const plans = pgTable(
  "plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    notes: text("notes"),
    isActive: boolean("is_active").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("plans_profile_id_idx").on(t.profileId),
    // A profile can keep many plans but at most one active one; the database
    // enforces it, so no race between two requests can produce two.
    uniqueIndex("plans_one_active_per_profile_idx").on(t.profileId).where(sql`${t.isActive}`),
  ]
);

export type PlanRow = typeof plans.$inferSelect;

export const planDays = pgTable(
  "plan_days",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // 0-based and contiguous, renumbered in a transaction. Deliberately not unique:
    // a unique constraint makes swapping two rows awkward.
    position: integer("position").notNull(),
  },
  (t) => [index("plan_days_plan_id_idx").on(t.planId)]
);

export type PlanDayRow = typeof planDays.$inferSelect;

export const planExercises = pgTable(
  "plan_exercises",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    planDayId: uuid("plan_day_id")
      .notNull()
      .references(() => planDays.id, { onDelete: "cascade" }),
    // Refuses to delete an exercise that a plan still uses. The migration makes this
    // constraint DEFERRABLE INITIALLY DEFERRED (drizzle cannot express that, so it is
    // hand-edited into 0001): checked at commit, after every cascade has finished.
    // Deleting a profile cascades through its plans and its custom exercises in one
    // statement, and a plain NO ACTION check ran before that chain completed.
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id),
    position: integer("position").notNull(),
    targetSets: integer("target_sets").notNull(),
    // Exactly one of reps / duration is set, depending on the exercise (see CHECK).
    targetReps: integer("target_reps"),
    targetDurationSeconds: integer("target_duration_seconds"),
    restSeconds: integer("rest_seconds").notNull(),
    progressionMode: text("progression_mode", { enum: PROGRESSION_MODES }).notNull(),
    failureTargetReps: integer("failure_target_reps"),
    sessionsToConfirm: integer("sessions_to_confirm").notNull(),
    // numeric comes back from node-postgres as a string; the API converts it.
    weightStepKg: numeric("weight_step_kg", { precision: 6, scale: 3 }),
  },
  (t) => [
    index("plan_exercises_plan_day_id_idx").on(t.planDayId),
    index("plan_exercises_exercise_id_idx").on(t.exerciseId),
    check("plan_exercises_sets_check", sql`${t.targetSets} between 1 and 20`),
    check("plan_exercises_rest_check", sql`${t.restSeconds} between 0 and 600`),
    check("plan_exercises_reps_check", sql`${t.targetReps} is null or ${t.targetReps} between 1 and 100`),
    check(
      "plan_exercises_duration_check",
      sql`${t.targetDurationSeconds} is null or ${t.targetDurationSeconds} between 5 and 3600`
    ),
    check(
      "plan_exercises_reps_xor_duration_check",
      sql`(${t.targetReps} is null) <> (${t.targetDurationSeconds} is null)`
    ),
    check("plan_exercises_mode_check", sql`${t.progressionMode} in (${inList(PROGRESSION_MODES)})`),
    check(
      "plan_exercises_failure_check",
      sql`${t.progressionMode} <> 'failure' or (${t.failureTargetReps} is not null and ${t.targetReps} is not null and ${t.failureTargetReps} > ${t.targetReps})`
    ),
    check("plan_exercises_confirm_check", sql`${t.sessionsToConfirm} between 1 and 10`),
  ]
);

export type PlanExerciseRow = typeof planExercises.$inferSelect;

// ---- workouts --------------------------------------------------------------

export const workoutSessions = pgTable(
  "workout_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    // null for an ad-hoc workout, or once the plan day it came from is deleted:
    // history must outlive the plan, so SET NULL rather than CASCADE.
    planDayId: uuid("plan_day_id").references(() => planDays.id, { onDelete: "set null" }),
    // The day's name when the workout started, so history keeps its label.
    planDayName: text("plan_day_name"),
    // Generated on the phone. A retry of the same upload finds this row instead of
    // creating a second workout.
    clientId: uuid("client_id").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    // null while the workout is in progress.
    endedAt: timestamp("ended_at", { withTimezone: true }),
    notes: text("notes"),
  },
  (t) => [
    uniqueIndex("workout_sessions_profile_client_idx").on(t.profileId, t.clientId),
    index("workout_sessions_profile_started_idx").on(t.profileId, t.startedAt.desc()),
    check("workout_sessions_end_check", sql`${t.endedAt} is null or ${t.endedAt} >= ${t.startedAt}`),
  ]
);

export type WorkoutSessionRow = typeof workoutSessions.$inferSelect;

export const sessionExercises = pgTable(
  "session_exercises",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => workoutSessions.id, { onDelete: "cascade" }),
    // Same deferred check as plan_exercises (hand-edited into the migration).
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id),
    position: integer("position").notNull(),
    skipped: boolean("skipped").notNull().default(false),
    // A snapshot of the plan configuration at the time of the workout, so editing
    // the plan later can never change how an old workout reads.
    targetSets: integer("target_sets").notNull(),
    targetReps: integer("target_reps"),
    targetDurationSeconds: integer("target_duration_seconds"),
    restSeconds: integer("rest_seconds").notNull(),
    progressionMode: text("progression_mode", { enum: PROGRESSION_MODES }).notNull(),
    failureTargetReps: integer("failure_target_reps"),
    sessionsToConfirm: integer("sessions_to_confirm").notNull(),
    weightStepKg: numeric("weight_step_kg", { precision: 6, scale: 3 }),
  },
  (t) => [
    index("session_exercises_session_id_idx").on(t.sessionId),
    index("session_exercises_exercise_id_idx").on(t.exerciseId),
    check("session_exercises_sets_check", sql`${t.targetSets} between 1 and 20`),
    check("session_exercises_rest_check", sql`${t.restSeconds} between 0 and 600`),
    check("session_exercises_reps_check", sql`${t.targetReps} is null or ${t.targetReps} between 1 and 100`),
    check(
      "session_exercises_duration_check",
      sql`${t.targetDurationSeconds} is null or ${t.targetDurationSeconds} between 5 and 3600`
    ),
    check(
      "session_exercises_reps_xor_duration_check",
      sql`(${t.targetReps} is null) <> (${t.targetDurationSeconds} is null)`
    ),
    check("session_exercises_mode_check", sql`${t.progressionMode} in (${inList(PROGRESSION_MODES)})`),
    check(
      "session_exercises_failure_check",
      sql`${t.progressionMode} <> 'failure' or (${t.failureTargetReps} is not null and ${t.targetReps} is not null and ${t.failureTargetReps} > ${t.targetReps})`
    ),
    check("session_exercises_confirm_check", sql`${t.sessionsToConfirm} between 1 and 10`),
  ]
);

export const setLogs = pgTable(
  "set_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionExerciseId: uuid("session_exercise_id")
      .notNull()
      .references(() => sessionExercises.id, { onDelete: "cascade" }),
    setNumber: integer("set_number").notNull(),
    weightKg: numeric("weight_kg", { precision: 7, scale: 3 }),
    reps: integer("reps"),
    durationSeconds: integer("duration_seconds"),
    toFailure: boolean("to_failure").notNull().default(false),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex("set_logs_exercise_set_idx").on(t.sessionExerciseId, t.setNumber),
    check("set_logs_number_check", sql`${t.setNumber} between 1 and 40`),
    check("set_logs_weight_check", sql`${t.weightKg} is null or ${t.weightKg} between 0 and 1000`),
    check("set_logs_reps_check", sql`${t.reps} is null or ${t.reps} between 1 and 1000`),
    check("set_logs_duration_check", sql`${t.durationSeconds} is null or ${t.durationSeconds} between 1 and 36000`),
    check("set_logs_reps_xor_duration_check", sql`(${t.reps} is null) <> (${t.durationSeconds} is null)`),
  ]
);

// ---- goals -----------------------------------------------------------------

export const goals = pgTable(
  "goals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    // Same deferred check as plan_exercises (hand-edited into the migration).
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id),
    metric: text("metric").notNull(),
    // Weights in kg, durations in seconds, reps as a count. No status column: whether
    // a goal is reached is worked out from the sessions every time it is read.
    startValue: numeric("start_value", { precision: 8, scale: 3 }).notNull(),
    targetValue: numeric("target_value", { precision: 8, scale: 3 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("goals_profile_exercise_metric_idx").on(t.profileId, t.exerciseId, t.metric),
    check("goals_metric_check", sql`${t.metric} in (${inList(GOAL_METRICS)})`),
    check("goals_values_check", sql`${t.startValue} >= 0 and ${t.targetValue} > ${t.startValue}`),
  ]
);

export type GoalRow = typeof goals.$inferSelect;
