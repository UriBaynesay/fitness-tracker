import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { Exercise, Plan, PlanExercise, PlanSummary } from "@fitness/shared";
import type { Db } from "../db/index.js";
import {
  exercises,
  planDays,
  planExercises,
  plans,
  type ExerciseRow,
  type PlanExerciseRow,
} from "../db/schema.js";
import { HttpError } from "../http/errors.js";

export function toExerciseDto(row: ExerciseRow): Exercise {
  return {
    id: row.id,
    slug: row.slug,
    nameEn: row.nameEn,
    nameHe: row.nameHe,
    muscleGroup: row.muscleGroup,
    equipment: row.equipment,
    isTimed: row.isTimed,
    isCustom: row.ownerId !== null,
  };
}

export function toPlanExerciseDto(row: PlanExerciseRow, exercise: ExerciseRow): PlanExercise {
  return {
    id: row.id,
    planDayId: row.planDayId,
    position: row.position,
    targetSets: row.targetSets,
    targetReps: row.targetReps,
    targetDurationSeconds: row.targetDurationSeconds,
    restSeconds: row.restSeconds,
    progressionMode: row.progressionMode,
    failureTargetReps: row.failureTargetReps,
    sessionsToConfirm: row.sessionsToConfirm,
    // numeric(6,3) arrives from node-postgres as a string.
    weightStepKg: row.weightStepKg === null ? null : Number(row.weightStepKg),
    exercise: toExerciseDto(exercise),
  };
}

// The whole plan, days and exercises in order, in three queries. Callers have already
// proven ownership (plans/ownership.ts); this only shapes the response.
export async function loadPlan(db: Db, planId: string): Promise<Plan> {
  const [plan] = await db.select().from(plans).where(eq(plans.id, planId)).limit(1);
  if (!plan) throw new HttpError(404, "not_found");

  const days = await db
    .select()
    .from(planDays)
    .where(eq(planDays.planId, planId))
    // id is a deterministic tie-break: equal positions must never reorder between reads.
    .orderBy(asc(planDays.position), asc(planDays.id));

  const rows =
    days.length === 0
      ? []
      : await db
          .select({ planExercise: planExercises, exercise: exercises })
          .from(planExercises)
          .innerJoin(exercises, eq(exercises.id, planExercises.exerciseId))
          .where(
            inArray(
              planExercises.planDayId,
              days.map((day) => day.id)
            )
          )
          .orderBy(asc(planExercises.position), asc(planExercises.id));

  return {
    id: plan.id,
    name: plan.name,
    notes: plan.notes,
    isActive: plan.isActive,
    createdAt: plan.createdAt.toISOString(),
    days: days.map((day) => ({
      id: day.id,
      planId: day.planId,
      name: day.name,
      position: day.position,
      exercises: rows
        .filter((row) => row.planExercise.planDayId === day.id)
        .map((row) => toPlanExerciseDto(row.planExercise, row.exercise)),
    })),
  };
}

export async function listPlanSummaries(db: Db, profileId: string): Promise<PlanSummary[]> {
  return db
    .select({
      id: plans.id,
      name: plans.name,
      isActive: plans.isActive,
      dayCount: sql<number>`count(distinct ${planDays.id})::int`,
      exerciseCount: sql<number>`count(${planExercises.id})::int`,
    })
    .from(plans)
    .leftJoin(planDays, eq(planDays.planId, plans.id))
    .leftJoin(planExercises, eq(planExercises.planDayId, planDays.id))
    .where(eq(plans.profileId, profileId))
    .groupBy(plans.id)
    .orderBy(desc(plans.isActive), asc(plans.createdAt));
}
