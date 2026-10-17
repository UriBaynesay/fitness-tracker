import { and, eq, isNull, or } from "drizzle-orm";
import type { Db } from "../db/index.js";
import {
  exercises,
  planDays,
  planExercises,
  plans,
  type ExerciseRow,
  type PlanDayRow,
  type PlanExerciseRow,
  type PlanRow,
} from "../db/schema.js";
import { HttpError } from "../http/errors.js";

// Every lookup of a user-owned row goes through one of these functions, and every
// one of them answers "not found" (404) both for ids that don't exist and for ids
// that belong to someone else. A 403 would confirm that the id exists. Routes
// never query these tables by id alone, which is what the authorization tests pin.
const notFound = () => new HttpError(404, "not_found");

export async function getOwnedPlan(db: Db, profileId: string, planId: string): Promise<PlanRow> {
  const [row] = await db
    .select()
    .from(plans)
    .where(and(eq(plans.id, planId), eq(plans.profileId, profileId)))
    .limit(1);
  if (!row) throw notFound();
  return row;
}

export async function getOwnedDay(db: Db, profileId: string, dayId: string): Promise<PlanDayRow> {
  const [row] = await db
    .select({ day: planDays })
    .from(planDays)
    .innerJoin(plans, eq(plans.id, planDays.planId))
    .where(and(eq(planDays.id, dayId), eq(plans.profileId, profileId)))
    .limit(1);
  if (!row) throw notFound();
  return row.day;
}

export interface OwnedPlanExercise {
  planExercise: PlanExerciseRow;
  exercise: ExerciseRow;
  day: PlanDayRow;
}

export async function getOwnedPlanExercise(
  db: Db,
  profileId: string,
  planExerciseId: string
): Promise<OwnedPlanExercise> {
  const [row] = await db
    .select({ planExercise: planExercises, exercise: exercises, day: planDays })
    .from(planExercises)
    .innerJoin(planDays, eq(planDays.id, planExercises.planDayId))
    .innerJoin(plans, eq(plans.id, planDays.planId))
    .innerJoin(exercises, eq(exercises.id, planExercises.exerciseId))
    .where(and(eq(planExercises.id, planExerciseId), eq(plans.profileId, profileId)))
    .limit(1);
  if (!row) throw notFound();
  return row;
}

// An exercise the caller may use in a plan: the shared library or their own.
export async function getVisibleExercise(db: Db, profileId: string, exerciseId: string): Promise<ExerciseRow> {
  const [row] = await db
    .select()
    .from(exercises)
    .where(and(eq(exercises.id, exerciseId), or(isNull(exercises.ownerId), eq(exercises.ownerId, profileId))))
    .limit(1);
  if (!row) throw notFound();
  return row;
}

// An exercise the caller may edit: only their own, never the library's.
export async function getOwnedExercise(db: Db, profileId: string, exerciseId: string): Promise<ExerciseRow> {
  const [row] = await db
    .select()
    .from(exercises)
    .where(and(eq(exercises.id, exerciseId), eq(exercises.ownerId, profileId)))
    .limit(1);
  if (!row) throw notFound();
  return row;
}
