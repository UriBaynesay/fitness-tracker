import { z } from "zod";
import type { Language, WeightUnit } from "./auth.js";
import { defaultWeightStepKg } from "./units.js";

// ---- exercises -------------------------------------------------------------

export const MUSCLE_GROUPS = [
  "chest",
  "back",
  "lower back",
  "shoulders",
  "traps",
  "biceps",
  "triceps",
  "quads",
  "hamstrings",
  "glutes",
  "calves",
  "core",
  "full body",
  "cardio",
] as const;
export const EQUIPMENT = ["barbell", "dumbbell", "cable", "machine", "bodyweight", "other"] as const;

export const muscleGroupSchema = z.enum(MUSCLE_GROUPS);
export const equipmentSchema = z.enum(EQUIPMENT);
export type MuscleGroup = z.infer<typeof muscleGroupSchema>;
export type Equipment = z.infer<typeof equipmentSchema>;

export const exerciseSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  nameEn: z.string().nullable(),
  nameHe: z.string().nullable(),
  muscleGroup: muscleGroupSchema,
  equipment: equipmentSchema,
  isTimed: z.boolean(),
  // False for the seeded library, true for exercises the signed-in user created.
  isCustom: z.boolean(),
});
export type Exercise = z.infer<typeof exerciseSchema>;

// A name in the user's language, falling back to the other one (a missing
// translation should show something, never a blank row).
export function exerciseName(exercise: Pick<Exercise, "nameEn" | "nameHe">, language: Language): string {
  const preferred = language === "he" ? exercise.nameHe : exercise.nameEn;
  return preferred ?? exercise.nameEn ?? exercise.nameHe ?? "";
}

const nameSchema = z.string().trim().min(1).max(80);

export const createExerciseBodySchema = z.object({
  name: nameSchema,
  muscleGroup: muscleGroupSchema,
  equipment: equipmentSchema,
  isTimed: z.boolean().default(false),
});
export type CreateExerciseInput = z.input<typeof createExerciseBodySchema>;

// isTimed is deliberately not editable: plans already built on the exercise
// store reps or seconds depending on it.
export const updateExerciseBodySchema = z
  .object({
    name: nameSchema.optional(),
    muscleGroup: muscleGroupSchema.optional(),
    equipment: equipmentSchema.optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: "at least one field is required" });
export type UpdateExerciseInput = z.infer<typeof updateExerciseBodySchema>;

// ---- plan exercise configuration ------------------------------------------

export const PROGRESSION_MODES = ["target", "failure"] as const;
export const progressionModeSchema = z.enum(PROGRESSION_MODES);
export type ProgressionMode = z.infer<typeof progressionModeSchema>;

const planExerciseConfigBase = z.object({
  targetSets: z.number().int().min(1).max(20),
  targetReps: z.number().int().min(1).max(100).nullable(),
  targetDurationSeconds: z.number().int().min(5).max(3600).nullable(),
  restSeconds: z.number().int().min(0).max(600),
  progressionMode: progressionModeSchema,
  failureTargetReps: z.number().int().min(1).max(200).nullable(),
  sessionsToConfirm: z.number().int().min(1).max(10),
  weightStepKg: z.number().min(0.25).max(50).nullable(),
});
export type PlanExerciseConfig = z.infer<typeof planExerciseConfigBase>;
// The bare field set, for documents that carry a copy of the configuration (a
// workout snapshots it). Cross-field rules still go through planExerciseConfigFor.
export const planExerciseConfigFields = planExerciseConfigBase;

// Whether reps or seconds are required depends on the exercise, which is data the
// database can't see inside a CHECK constraint, so this one refinement is the single
// place that rule lives. The API runs it on every create and every merged update.
export function planExerciseConfigFor(isTimed: boolean) {
  return planExerciseConfigBase.superRefine((config, ctx) => {
    const issue = (path: keyof PlanExerciseConfig, message: string) =>
      ctx.addIssue({ code: "custom", path: [path], message });

    if (isTimed) {
      if (config.targetDurationSeconds === null) issue("targetDurationSeconds", "required for a timed exercise");
      if (config.targetReps !== null) issue("targetReps", "not used by a timed exercise");
      if (config.progressionMode !== "target") issue("progressionMode", "a timed exercise only supports 'target'");
      if (config.failureTargetReps !== null) issue("failureTargetReps", "not used by a timed exercise");
      if (config.weightStepKg !== null) issue("weightStepKg", "not used by a timed exercise");
      return;
    }

    if (config.targetReps === null) issue("targetReps", "required");
    if (config.targetDurationSeconds !== null) issue("targetDurationSeconds", "only for timed exercises");
    if (config.weightStepKg === null) issue("weightStepKg", "required");
    if (config.progressionMode === "failure") {
      if (config.failureTargetReps === null) {
        issue("failureTargetReps", "required in failure mode");
      } else if (config.targetReps !== null && config.failureTargetReps <= config.targetReps) {
        issue("failureTargetReps", "must be higher than the target reps");
      }
    } else if (config.failureTargetReps !== null) {
      issue("failureTargetReps", "only used in failure mode");
    }
  });
}

export function defaultPlanExerciseConfig(isTimed: boolean, unit: WeightUnit): PlanExerciseConfig {
  return {
    targetSets: 3,
    targetReps: isTimed ? null : 10,
    targetDurationSeconds: isTimed ? 30 : null,
    restSeconds: 90,
    progressionMode: "target",
    failureTargetReps: null,
    sessionsToConfirm: 2,
    weightStepKg: isTimed ? null : defaultWeightStepKg(unit),
  };
}

// Applies a partial update to the current configuration and tidies the fields that
// depend on the progression mode, so a client only has to send what changed:
// switching to "target" drops the failure goal, and switching to "failure" without
// one proposes the target reps + 5 (the mockup's 15 -> 20).
export function applyPlanExerciseUpdate(
  current: PlanExerciseConfig,
  patch: Partial<PlanExerciseConfig>
): PlanExerciseConfig {
  const merged = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) (merged as Record<string, unknown>)[key] = value;
  }
  if (merged.progressionMode === "target") {
    merged.failureTargetReps = null;
  } else if (merged.failureTargetReps === null && merged.targetReps !== null) {
    merged.failureTargetReps = merged.targetReps + 5;
  }
  return merged;
}

// ---- plans, days, plan exercises ------------------------------------------

export const planExerciseSchema = planExerciseConfigBase.extend({
  id: z.uuid(),
  planDayId: z.uuid(),
  position: z.number().int(),
  exercise: exerciseSchema,
});
export type PlanExercise = z.infer<typeof planExerciseSchema>;

export const planDaySchema = z.object({
  id: z.uuid(),
  planId: z.uuid(),
  name: z.string(),
  position: z.number().int(),
  exercises: z.array(planExerciseSchema),
});
export type PlanDay = z.infer<typeof planDaySchema>;

export const planSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  notes: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.string(),
  days: z.array(planDaySchema),
});
export type Plan = z.infer<typeof planSchema>;

export const planSummarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  isActive: z.boolean(),
  dayCount: z.number().int(),
  exerciseCount: z.number().int(),
});
export type PlanSummary = z.infer<typeof planSummarySchema>;

const atLeastOneField = { message: "at least one field is required" };

export const createPlanBodySchema = z.object({ name: nameSchema });

export const updatePlanBodySchema = z
  .object({
    name: nameSchema.optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, atLeastOneField);
export type UpdatePlanInput = z.infer<typeof updatePlanBodySchema>;

export const createDayBodySchema = z.object({ name: nameSchema });

export const updateDayBodySchema = z
  .object({ name: nameSchema.optional(), position: z.number().int().min(0).optional() })
  .refine((body) => Object.keys(body).length > 0, atLeastOneField);
export type UpdateDayInput = z.infer<typeof updateDayBodySchema>;

export const createPlanExerciseBodySchema = z.object({ exerciseId: z.uuid() });

export const updatePlanExerciseBodySchema = planExerciseConfigBase
  .partial()
  .extend({ position: z.number().int().min(0).optional() })
  .refine((body) => Object.keys(body).length > 0, atLeastOneField);
export type UpdatePlanExerciseInput = z.infer<typeof updatePlanExerciseBodySchema>;

export const idParamsSchema = z.object({ id: z.uuid() });

// The day Today should offer: the one after the most recently finished day, wrapping
// around, or the first day when there is no usable history (nothing finished yet, or
// that day has since been deleted). Pure, so Today can run it offline.
export function nextDayAfter<T extends { id: string }>(days: T[], lastFinishedDayId: string | null): T | null {
  if (days.length === 0) return null;
  const last = lastFinishedDayId === null ? -1 : days.findIndex((day) => day.id === lastFinishedDayId);
  return days[(last + 1) % days.length] ?? null;
}
