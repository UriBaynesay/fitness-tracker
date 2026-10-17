import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import type { ExerciseHistory, HistorySet, SessionSummary } from "@fitness/shared";
import type { Db } from "../db/index.js";
import { exercises, sessionExercises, setLogs, workoutSessions, type WorkoutSessionRow } from "../db/schema.js";

export function toSessionSummary(row: WorkoutSessionRow): SessionSummary {
  return {
    id: row.id,
    clientId: row.clientId,
    planDayId: row.planDayId,
    planDayName: row.planDayName,
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt ? row.endedAt.toISOString() : null,
  };
}

// Finished workouts only: an in-progress one is not "history" yet.
export async function listFinishedSessions(
  db: Db,
  profileId: string,
  range: { from?: Date; to?: Date; limit: number }
): Promise<SessionSummary[]> {
  const rows = await db
    .select()
    .from(workoutSessions)
    .where(
      and(
        eq(workoutSessions.profileId, profileId),
        isNotNull(workoutSessions.endedAt),
        range.from ? gte(workoutSessions.startedAt, range.from) : undefined,
        range.to ? lte(workoutSessions.startedAt, range.to) : undefined
      )
    )
    .orderBy(desc(workoutSessions.startedAt))
    .limit(range.limit);
  return rows.map(toSessionSummary);
}

// For each requested exercise, the sets from its last `limit` finished workouts,
// newest first. Skipped exercises don't count: nothing was done. Exercises the
// caller can't see are silently absent from the answer.
export async function exerciseHistory(
  db: Db,
  profileId: string,
  exerciseIds: string[],
  limit: number
): Promise<ExerciseHistory[]> {
  if (exerciseIds.length === 0) return [];

  const visible = await db
    .select({ id: exercises.id })
    .from(exercises)
    .where(and(inArray(exercises.id, exerciseIds), or(isNull(exercises.ownerId), eq(exercises.ownerId, profileId))));
  const visibleIds = new Set(visible.map((row) => row.id));
  // Answer in the order asked, so callers can zip the result with their request.
  const allowed = [...new Set(exerciseIds)].filter((id) => visibleIds.has(id));
  if (allowed.length === 0) return [];

  const rows = await db
    .select({
      exerciseId: sessionExercises.exerciseId,
      sessionId: workoutSessions.id,
      startedAt: workoutSessions.startedAt,
      weightKg: setLogs.weightKg,
      reps: setLogs.reps,
      durationSeconds: setLogs.durationSeconds,
      toFailure: setLogs.toFailure,
    })
    .from(setLogs)
    .innerJoin(sessionExercises, eq(sessionExercises.id, setLogs.sessionExerciseId))
    .innerJoin(workoutSessions, eq(workoutSessions.id, sessionExercises.sessionId))
    .where(
      and(
        eq(workoutSessions.profileId, profileId),
        isNotNull(workoutSessions.endedAt),
        eq(sessionExercises.skipped, false),
        inArray(sessionExercises.exerciseId, allowed)
      )
    )
    .orderBy(desc(workoutSessions.startedAt), asc(setLogs.setNumber));

  const byExercise = new Map<string, { sessionId: string; startedAt: string; sets: HistorySet[] }[]>();
  for (const row of rows) {
    const sessions = byExercise.get(row.exerciseId) ?? [];
    let session = sessions.find((s) => s.sessionId === row.sessionId);
    if (!session) {
      if (sessions.length >= limit) continue;
      session = { sessionId: row.sessionId, startedAt: row.startedAt.toISOString(), sets: [] };
      sessions.push(session);
    }
    session.sets.push({
      weightKg: row.weightKg === null ? null : Number(row.weightKg),
      reps: row.reps,
      durationSeconds: row.durationSeconds,
      toFailure: row.toFailure,
    });
    byExercise.set(row.exerciseId, sessions);
  }

  return allowed.map((exerciseId) => ({
    exerciseId,
    sessions: (byExercise.get(exerciseId) ?? []).map(({ startedAt, sets }) => ({ startedAt, sets })),
  }));
}

// Exercises the person has actually done (finished workout, not skipped, at least one
// set), most recently trained first. Feeds the Progress screen's picker.
export async function trainedExerciseIds(db: Db, profileId: string): Promise<string[]> {
  const rows = await db
    .select({ exerciseId: sessionExercises.exerciseId, last: sql<string>`max(${workoutSessions.startedAt})` })
    .from(setLogs)
    .innerJoin(sessionExercises, eq(sessionExercises.id, setLogs.sessionExerciseId))
    .innerJoin(workoutSessions, eq(workoutSessions.id, sessionExercises.sessionId))
    .where(and(eq(workoutSessions.profileId, profileId), isNotNull(workoutSessions.endedAt), eq(sessionExercises.skipped, false)))
    .groupBy(sessionExercises.exerciseId)
    .orderBy(desc(sql`max(${workoutSessions.startedAt})`));
  return rows.map((row) => row.exerciseId);
}
