import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type { Goal, GoalMetric } from "@fitness/shared";
import type { Db } from "../db/index.js";
import { goals, sessionExercises, setLogs, workoutSessions, type GoalRow } from "../db/schema.js";

interface Bests {
  weight: number | null;
  reps: number | null;
  duration: number | null;
}

const toNumber = (value: string | number | null): number | null => (value === null ? null : Number(value));

// The best logged value per metric for each exercise, over the caller's finished,
// non-skipped sets. One grouped query, however many goals there are.
export async function bestsByExercise(db: Db, profileId: string, exerciseIds: string[]): Promise<Map<string, Bests>> {
  const result = new Map<string, Bests>();
  if (exerciseIds.length === 0) return result;
  const rows = await db
    .select({
      exerciseId: sessionExercises.exerciseId,
      weight: sql<string | null>`max(${setLogs.weightKg})`,
      reps: sql<number | null>`max(${setLogs.reps})`,
      duration: sql<number | null>`max(${setLogs.durationSeconds})`,
    })
    .from(setLogs)
    .innerJoin(sessionExercises, eq(sessionExercises.id, setLogs.sessionExerciseId))
    .innerJoin(workoutSessions, eq(workoutSessions.id, sessionExercises.sessionId))
    .where(
      and(
        eq(workoutSessions.profileId, profileId),
        isNotNull(workoutSessions.endedAt),
        eq(sessionExercises.skipped, false),
        inArray(sessionExercises.exerciseId, exerciseIds)
      )
    )
    .groupBy(sessionExercises.exerciseId);
  for (const row of rows) {
    result.set(row.exerciseId, { weight: toNumber(row.weight), reps: toNumber(row.reps), duration: toNumber(row.duration) });
  }
  return result;
}

// The person's best for one metric of one exercise right now (a new goal's start value).
export async function currentBest(db: Db, profileId: string, exerciseId: string, metric: GoalMetric): Promise<number> {
  const bests = (await bestsByExercise(db, profileId, [exerciseId])).get(exerciseId);
  return bests?.[metric] ?? 0;
}

export function toGoal(row: GoalRow, bests: Map<string, Bests>): Goal {
  return {
    id: row.id,
    exerciseId: row.exerciseId,
    metric: row.metric as GoalMetric,
    startValue: Number(row.startValue),
    targetValue: Number(row.targetValue),
    best: bests.get(row.exerciseId)?.[row.metric as GoalMetric] ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listGoals(db: Db, profileId: string): Promise<Goal[]> {
  const rows = await db.select().from(goals).where(eq(goals.profileId, profileId)).orderBy(desc(goals.createdAt));
  const bests = await bestsByExercise(db, profileId, [...new Set(rows.map((row) => row.exerciseId))]);
  return rows.map((row) => toGoal(row, bests));
}
