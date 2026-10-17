import { z } from "zod";
import { MAX_SESSION_EXERCISES, MAX_SETS_PER_EXERCISE } from "./limits.js";
import { planExerciseConfigFields } from "./plans.js";

// A workout is recorded on the phone first and pushed to the server as one document:
// the session, its exercises (with a snapshot of the plan configuration at the time)
// and the sets that were logged. Every id inside is generated on the device, so
// sending the same document twice is harmless: the server upserts by client id.

const timestamp = z.iso.datetime({ offset: true });

export const syncSetSchema = z
  .object({
    clientId: z.uuid(),
    setNumber: z.number().int().min(1).max(MAX_SETS_PER_EXERCISE),
    weightKg: z.number().min(0).max(1000).nullable(),
    reps: z.number().int().min(1).max(1000).nullable(),
    durationSeconds: z.number().int().min(1).max(36_000).nullable(),
    toFailure: z.boolean(),
    completedAt: timestamp,
  })
  // A set is counted in reps or held for seconds, never both and never neither.
  .refine((set) => (set.reps === null) !== (set.durationSeconds === null), {
    message: "a set has either reps or a duration",
    path: ["reps"],
  });
export type SyncSet = z.infer<typeof syncSetSchema>;

export const syncExerciseSchema = planExerciseConfigFields.extend({
  clientId: z.uuid(),
  exerciseId: z.uuid(),
  position: z.number().int().min(0).max(MAX_SESSION_EXERCISES),
  skipped: z.boolean(),
  sets: z.array(syncSetSchema).max(MAX_SETS_PER_EXERCISE),
});
export type SyncExercise = z.infer<typeof syncExerciseSchema>;

export const syncSessionSchema = z
  .object({
    clientId: z.uuid(),
    planDayId: z.uuid().nullable(),
    // The day's name when the workout started, so history keeps its label even if the
    // day is renamed or deleted later.
    planDayName: z.string().trim().min(1).max(80).nullable(),
    startedAt: timestamp,
    // null while the workout is still in progress.
    endedAt: timestamp.nullable(),
    exercises: z.array(syncExerciseSchema).max(MAX_SESSION_EXERCISES),
  })
  .refine((session) => session.endedAt === null || Date.parse(session.endedAt) >= Date.parse(session.startedAt), {
    message: "a workout cannot end before it starts",
    path: ["endedAt"],
  })
  .superRefine((session, ctx) => {
    session.exercises.forEach((exercise, index) => {
      const numbers = exercise.sets.map((set) => set.setNumber);
      if (new Set(numbers).size !== numbers.length) {
        ctx.addIssue({ code: "custom", path: ["exercises", index, "sets"], message: "duplicate set numbers" });
      }
    });
  });
export type SyncSession = z.infer<typeof syncSessionSchema>;

export const sessionSummarySchema = z.object({
  id: z.uuid(),
  clientId: z.uuid(),
  planDayId: z.uuid().nullable(),
  planDayName: z.string().nullable(),
  startedAt: z.string(),
  endedAt: z.string().nullable(),
});
export type SessionSummary = z.infer<typeof sessionSummarySchema>;

// The sets a person did for one exercise in one past workout, as the overload hint
// and the "last time" lines read them.
export const historySetSchema = z.object({
  weightKg: z.number().nullable(),
  reps: z.number().int().nullable(),
  durationSeconds: z.number().int().nullable(),
  toFailure: z.boolean(),
});
export type HistorySet = z.infer<typeof historySetSchema>;

export const exerciseHistorySchema = z.object({
  exerciseId: z.uuid(),
  sessions: z.array(z.object({ startedAt: z.string(), sets: z.array(historySetSchema) })),
});
export type ExerciseHistory = z.infer<typeof exerciseHistorySchema>;
