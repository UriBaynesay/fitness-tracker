import type { FastifyInstance } from "fastify";
import { and, eq, isNull, or } from "drizzle-orm";
import {
  MAX_GOALS_PER_PROFILE,
  createGoalBodySchema,
  idParamsSchema,
  metricAllowed,
  updateGoalBodySchema,
} from "@fitness/shared";
import { exercises, goals } from "../db/schema.js";
import { HttpError } from "../http/errors.js";
import { bestsByExercise, currentBest, listGoals, toGoal } from "../goals/queries.js";
import { requireProfile, type RouteDeps } from "./auth.js";

export function registerGoalRoutes(app: FastifyInstance, deps: RouteDeps): void {
  const { db } = deps;

  // Goals with their best logged value; progress itself is worked out by the client.
  app.get("/api/v1/goals", async (request, reply) => {
    const profile = await requireProfile(deps, request, reply);
    return { goals: await listGoals(db, profile.id) };
  });

  app.post("/api/v1/goals", async (request, reply) => {
    const profile = await requireProfile(deps, request, reply);
    const body = createGoalBodySchema.parse(request.body);

    const [exercise] = await db
      .select()
      .from(exercises)
      .where(and(eq(exercises.id, body.exerciseId), or(isNull(exercises.ownerId), eq(exercises.ownerId, profile.id))))
      .limit(1);
    if (!exercise) throw new HttpError(400, "unknown_exercise");
    if (!metricAllowed(body.metric, exercise.isTimed)) throw new HttpError(400, "metric_mismatch");

    if ((await db.$count(goals, eq(goals.profileId, profile.id))) >= MAX_GOALS_PER_PROFILE) {
      throw new HttpError(409, "limit_reached");
    }
    const [existing] = await db
      .select({ id: goals.id })
      .from(goals)
      .where(and(eq(goals.profileId, profile.id), eq(goals.exerciseId, exercise.id), eq(goals.metric, body.metric)))
      .limit(1);
    if (existing) throw new HttpError(409, "goal_exists");

    // Progress starts at 0 % from wherever the person is today.
    const start = await currentBest(db, profile.id, exercise.id, body.metric);
    if (body.target <= start) throw new HttpError(400, "target_not_above_start");

    // The unique index settles a race between two simultaneous creates.
    const inserted = await db
      .insert(goals)
      .values({
        profileId: profile.id,
        exerciseId: exercise.id,
        metric: body.metric,
        startValue: String(start),
        targetValue: String(body.target),
      })
      .onConflictDoNothing()
      .returning();
    const row = inserted[0];
    if (!row) throw new HttpError(409, "goal_exists");
    return reply.code(201).send({ goal: toGoal(row, await bestsByExercise(db, profile.id, [exercise.id])) });
  });

  app.patch("/api/v1/goals/:id", async (request, reply) => {
    const profile = await requireProfile(deps, request, reply);
    const { id } = idParamsSchema.parse(request.params);
    const body = updateGoalBodySchema.parse(request.body);

    const [current] = await db.select().from(goals).where(and(eq(goals.id, id), eq(goals.profileId, profile.id))).limit(1);
    if (!current) throw new HttpError(404, "not_found");
    if (body.target <= Number(current.startValue)) throw new HttpError(400, "target_not_above_start");

    const [row] = await db
      .update(goals)
      .set({ targetValue: String(body.target) })
      .where(and(eq(goals.id, id), eq(goals.profileId, profile.id)))
      .returning();
    return { goal: toGoal(row!, await bestsByExercise(db, profile.id, [row!.exerciseId])) };
  });

  // Deleting what is already gone is not an error, same as discarding a workout.
  app.delete("/api/v1/goals/:id", async (request, reply) => {
    const profile = await requireProfile(deps, request, reply);
    const { id } = idParamsSchema.parse(request.params);
    await db.delete(goals).where(and(eq(goals.id, id), eq(goals.profileId, profile.id)));
    return reply.code(204).send();
  });
}
