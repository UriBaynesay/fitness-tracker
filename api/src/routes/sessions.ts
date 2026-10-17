import type { FastifyInstance } from "fastify";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { planExerciseConfigFor, syncSessionSchema, type SyncExercise } from "@fitness/shared";
import { exercises, planDays, plans, sessionExercises, setLogs, workoutSessions } from "../db/schema.js";
import { HttpError } from "../http/errors.js";
import { exerciseHistory, listFinishedSessions, toSessionSummary } from "../sessions/queries.js";
import { requireProfile, type RouteDeps } from "./auth.js";

// A whole workout is at most 30 exercises x 40 sets, comfortably under this.
const SYNC_BODY_LIMIT = 256 * 1024;

const clientIdParams = z.object({ clientId: z.uuid() });

const listQuery = z.object({
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

const historyQuery = z.object({
  ids: z
    .string()
    .transform((value) => value.split(",").filter(Boolean))
    .pipe(z.array(z.uuid()).min(1).max(30)),
  limit: z.coerce.number().int().min(1).max(10).default(3),
});

// The configuration fields of one exercise, as the plan-exercise rules expect them.
function configOf(exercise: SyncExercise) {
  return {
    targetSets: exercise.targetSets,
    targetReps: exercise.targetReps,
    targetDurationSeconds: exercise.targetDurationSeconds,
    restSeconds: exercise.restSeconds,
    progressionMode: exercise.progressionMode,
    failureTargetReps: exercise.failureTargetReps,
    sessionsToConfirm: exercise.sessionsToConfirm,
    weightStepKg: exercise.weightStepKg,
  };
}

export function registerSessionRoutes(app: FastifyInstance, deps: RouteDeps): void {
  const { db } = deps;

  // Idempotent upsert of one whole workout, addressed by the id the phone generated.
  // Sending the same document again changes nothing; sending an updated one replaces
  // the exercises and sets. So a flaky connection can retry blindly.
  app.put("/api/v1/sessions/:clientId", { bodyLimit: SYNC_BODY_LIMIT }, async (request, reply) => {
    const profile = await requireProfile(deps, request, reply);
    const { clientId } = clientIdParams.parse(request.params);
    const doc = syncSessionSchema.parse(request.body);
    if (doc.clientId !== clientId) throw new HttpError(400, "client_id_mismatch");

    // Every exercise must be one the caller may use: the library or their own.
    const exerciseIds = [...new Set(doc.exercises.map((e) => e.exerciseId))];
    const known =
      exerciseIds.length === 0
        ? []
        : await db
            .select()
            .from(exercises)
            .where(and(inArray(exercises.id, exerciseIds), or(isNull(exercises.ownerId), eq(exercises.ownerId, profile.id))));
    if (known.length !== exerciseIds.length) throw new HttpError(400, "unknown_exercise");
    const exerciseById = new Map(known.map((row) => [row.id, row]));

    // The configuration snapshot and every set must fit the exercise (reps or seconds).
    for (const exercise of doc.exercises) {
      const isTimed = exerciseById.get(exercise.exerciseId)!.isTimed;
      planExerciseConfigFor(isTimed).parse(configOf(exercise));
      for (const set of exercise.sets) {
        if (isTimed ? set.durationSeconds === null : set.reps === null) throw new HttpError(400, "set_mismatch");
      }
    }

    // A plan day that isn't the caller's is stored as "no day": no error that would
    // confirm it exists, and no link into someone else's plan.
    let planDayId: string | null = null;
    if (doc.planDayId) {
      const [day] = await db
        .select({ id: planDays.id })
        .from(planDays)
        .innerJoin(plans, eq(plans.id, planDays.planId))
        .where(and(eq(planDays.id, doc.planDayId), eq(plans.profileId, profile.id)))
        .limit(1);
      planDayId = day?.id ?? null;
    }

    const session = await db.transaction(async (tx) => {
      // ON CONFLICT takes the row lock, so two simultaneous uploads of the same
      // workout queue up instead of interleaving their child rows.
      const [row] = await tx
        .insert(workoutSessions)
        .values({
          profileId: profile.id,
          clientId,
          planDayId,
          planDayName: doc.planDayName,
          startedAt: new Date(doc.startedAt),
          endedAt: doc.endedAt ? new Date(doc.endedAt) : null,
        })
        .onConflictDoUpdate({
          target: [workoutSessions.profileId, workoutSessions.clientId],
          set: {
            planDayId,
            planDayName: doc.planDayName,
            startedAt: new Date(doc.startedAt),
            endedAt: doc.endedAt ? new Date(doc.endedAt) : null,
          },
        })
        .returning();

      // The document is the truth: replace whatever the previous upload had.
      await tx.delete(sessionExercises).where(eq(sessionExercises.sessionId, row!.id));
      for (const exercise of doc.exercises) {
        const [created] = await tx
          .insert(sessionExercises)
          .values({
            sessionId: row!.id,
            exerciseId: exercise.exerciseId,
            position: exercise.position,
            skipped: exercise.skipped,
            ...configOf(exercise),
            weightStepKg: exercise.weightStepKg === null ? null : String(exercise.weightStepKg),
          })
          .returning({ id: sessionExercises.id });
        if (exercise.sets.length > 0) {
          await tx.insert(setLogs).values(
            exercise.sets.map((set) => ({
              sessionExerciseId: created!.id,
              setNumber: set.setNumber,
              weightKg: set.weightKg === null ? null : String(set.weightKg),
              reps: set.reps,
              durationSeconds: set.durationSeconds,
              toFailure: set.toFailure,
              completedAt: new Date(set.completedAt),
            }))
          );
        }
      }
      return row!;
    });

    return { session: toSessionSummary(session) };
  });

  // Discarding a workout. Always 204: deleting what is already gone is not an error,
  // and it lets the phone retry without caring whether the first attempt landed.
  app.delete("/api/v1/sessions/:clientId", async (request, reply) => {
    const profile = await requireProfile(deps, request, reply);
    const { clientId } = clientIdParams.parse(request.params);
    await db
      .delete(workoutSessions)
      .where(and(eq(workoutSessions.profileId, profile.id), eq(workoutSessions.clientId, clientId)));
    return reply.code(204).send();
  });

  app.get("/api/v1/sessions", async (request, reply) => {
    const profile = await requireProfile(deps, request, reply);
    const query = listQuery.parse(request.query);
    const sessions = await listFinishedSessions(db, profile.id, {
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      limit: query.limit,
    });
    return { sessions };
  });

  app.get("/api/v1/exercises/history", async (request, reply) => {
    const profile = await requireProfile(deps, request, reply);
    const query = historyQuery.parse(request.query);
    return { history: await exerciseHistory(db, profile.id, query.ids, query.limit) };
  });
}
