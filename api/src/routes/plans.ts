import type { FastifyInstance } from "fastify";
import { and, asc, eq } from "drizzle-orm";
import {
  MAX_DAYS_PER_PLAN,
  MAX_EXERCISES_PER_DAY,
  MAX_PLANS_PER_PROFILE,
  applyPlanExerciseUpdate,
  createDayBodySchema,
  createPlanBodySchema,
  createPlanExerciseBodySchema,
  defaultPlanExerciseConfig,
  idParamsSchema,
  planExerciseConfigFor,
  updateDayBodySchema,
  updatePlanBodySchema,
  updatePlanExerciseBodySchema,
  type PlanExerciseConfig,
} from "@fitness/shared";
import { planDays, planExercises, plans, type PlanExerciseRow } from "../db/schema.js";
import { HttpError } from "../http/errors.js";
import {
  getOwnedDay,
  getOwnedPlan,
  getOwnedPlanExercise,
  getVisibleExercise,
} from "../plans/ownership.js";
import { moveItem, writeDayPositions, writeExercisePositions } from "../plans/positions.js";
import { listPlanSummaries, loadPlan } from "../plans/queries.js";
import { requireProfile, type RouteDeps } from "./auth.js";

function rowToConfig(row: PlanExerciseRow): PlanExerciseConfig {
  return {
    targetSets: row.targetSets,
    targetReps: row.targetReps,
    targetDurationSeconds: row.targetDurationSeconds,
    restSeconds: row.restSeconds,
    progressionMode: row.progressionMode,
    failureTargetReps: row.failureTargetReps,
    sessionsToConfirm: row.sessionsToConfirm,
    weightStepKg: row.weightStepKg === null ? null : Number(row.weightStepKg),
  };
}

function configToColumns(config: PlanExerciseConfig) {
  return {
    ...config,
    // numeric columns take strings.
    weightStepKg: config.weightStepKg === null ? null : String(config.weightStepKg),
  };
}

// drizzle wraps the driver's error and keeps the original on `cause`.
function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: string; cause?: { code?: string } } | null)?.code;
  const causeCode = (error as { cause?: { code?: string } } | null)?.cause?.code;
  return code === "23505" || causeCode === "23505";
}

export function registerPlanRoutes(app: FastifyInstance, deps: RouteDeps): void {
  const { db } = deps;

  // ---- plans ---------------------------------------------------------------

  app.get("/api/v1/plans", async (request, reply) => {
    const profile = await requireProfile(deps, request, reply);
    return { plans: await listPlanSummaries(db, profile.id) };
  });

  app.post("/api/v1/plans", async (request, reply) => {
    const profile = await requireProfile(deps, request, reply);
    const body = createPlanBodySchema.parse(request.body);

    if ((await db.$count(plans, eq(plans.profileId, profile.id))) >= MAX_PLANS_PER_PROFILE) {
      throw new HttpError(409, "limit_reached");
    }

    // A user's first plan becomes the active one automatically. Two simultaneous
    // creates could both try to claim it; the database's one-active-plan index
    // rejects the second, which then simply isn't active.
    const hasActive = (await db.$count(plans, and(eq(plans.profileId, profile.id), eq(plans.isActive, true)))) > 0;
    let row;
    try {
      [row] = await db.insert(plans).values({ profileId: profile.id, name: body.name, isActive: !hasActive }).returning();
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      [row] = await db.insert(plans).values({ profileId: profile.id, name: body.name, isActive: false }).returning();
    }
    return reply.code(201).send({ plan: await loadPlan(db, row!.id) });
  });

  app.get("/api/v1/plans/:id", async (request, reply) => {
    const profile = await requireProfile(deps, request, reply);
    const { id } = idParamsSchema.parse(request.params);
    await getOwnedPlan(db, profile.id, id);
    return { plan: await loadPlan(db, id) };
  });

  app.patch("/api/v1/plans/:id", async (request, reply) => {
    const profile = await requireProfile(deps, request, reply);
    const { id } = idParamsSchema.parse(request.params);
    await getOwnedPlan(db, profile.id, id);
    const body = updatePlanBodySchema.parse(request.body);

    await db.transaction(async (tx) => {
      // Making a plan active first clears whichever one was active, atomically.
      if (body.isActive === true) {
        await tx
          .update(plans)
          .set({ isActive: false })
          .where(and(eq(plans.profileId, profile.id), eq(plans.isActive, true)));
      }
      await tx
        .update(plans)
        .set({
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.notes !== undefined ? { notes: body.notes } : {}),
          ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
        })
        .where(eq(plans.id, id));
    });
    return { plan: await loadPlan(db, id) };
  });

  // Deleting the active plan leaves no plan active; the user picks the next one.
  app.delete("/api/v1/plans/:id", async (request, reply) => {
    const profile = await requireProfile(deps, request, reply);
    const { id } = idParamsSchema.parse(request.params);
    await getOwnedPlan(db, profile.id, id);
    await db.delete(plans).where(eq(plans.id, id));
    return reply.code(204).send();
  });

  // ---- days ----------------------------------------------------------------

  app.post("/api/v1/plans/:id/days", async (request, reply) => {
    const profile = await requireProfile(deps, request, reply);
    const { id } = idParamsSchema.parse(request.params);
    await getOwnedPlan(db, profile.id, id);
    const body = createDayBodySchema.parse(request.body);

    // The new day's position is "how many there are now". Two requests arriving
    // together would both read the same count, so the plan row is locked for the
    // length of the transaction: concurrent additions to one plan take turns.
    await db.transaction(async (tx) => {
      await tx.select({ id: plans.id }).from(plans).where(eq(plans.id, id)).for("update");
      const count = await tx.$count(planDays, eq(planDays.planId, id));
      if (count >= MAX_DAYS_PER_PLAN) throw new HttpError(409, "limit_reached");
      await tx.insert(planDays).values({ planId: id, name: body.name, position: count });
    });
    return reply.code(201).send({ plan: await loadPlan(db, id) });
  });

  app.patch("/api/v1/plan-days/:id", async (request, reply) => {
    const profile = await requireProfile(deps, request, reply);
    const { id } = idParamsSchema.parse(request.params);
    const day = await getOwnedDay(db, profile.id, id);
    const body = updateDayBodySchema.parse(request.body);

    await db.transaction(async (tx) => {
      if (body.name !== undefined) {
        await tx.update(planDays).set({ name: body.name }).where(eq(planDays.id, id));
      }
      if (body.position !== undefined) {
        const siblings = await tx
          .select({ id: planDays.id })
          .from(planDays)
          .where(eq(planDays.planId, day.planId))
          .orderBy(asc(planDays.position));
        await writeDayPositions(tx, moveItem(siblings.map((s) => s.id), id, body.position));
      }
    });
    return { plan: await loadPlan(db, day.planId) };
  });

  app.delete("/api/v1/plan-days/:id", async (request, reply) => {
    const profile = await requireProfile(deps, request, reply);
    const { id } = idParamsSchema.parse(request.params);
    const day = await getOwnedDay(db, profile.id, id);

    await db.transaction(async (tx) => {
      await tx.delete(planDays).where(eq(planDays.id, id));
      const siblings = await tx
        .select({ id: planDays.id })
        .from(planDays)
        .where(eq(planDays.planId, day.planId))
        .orderBy(asc(planDays.position));
      await writeDayPositions(tx, siblings.map((s) => s.id));
    });
    return { plan: await loadPlan(db, day.planId) };
  });

  // ---- exercises inside a day ---------------------------------------------

  app.post("/api/v1/plan-days/:id/exercises", async (request, reply) => {
    const profile = await requireProfile(deps, request, reply);
    const { id } = idParamsSchema.parse(request.params);
    const day = await getOwnedDay(db, profile.id, id);
    const body = createPlanExerciseBodySchema.parse(request.body);
    // The library, or the caller's own: someone else's custom exercise is a 404.
    const exercise = await getVisibleExercise(db, profile.id, body.exerciseId);

    const config = planExerciseConfigFor(exercise.isTimed).parse(
      defaultPlanExerciseConfig(exercise.isTimed, profile.weightUnit)
    );
    // Same reason as adding a day: lock the day so simultaneous additions queue up
    // instead of reading the same count and landing on the same position.
    await db.transaction(async (tx) => {
      await tx.select({ id: planDays.id }).from(planDays).where(eq(planDays.id, id)).for("update");
      const count = await tx.$count(planExercises, eq(planExercises.planDayId, id));
      if (count >= MAX_EXERCISES_PER_DAY) throw new HttpError(409, "limit_reached");
      await tx.insert(planExercises).values({
        planDayId: id,
        exerciseId: exercise.id,
        position: count,
        ...configToColumns(config),
      });
    });
    return reply.code(201).send({ plan: await loadPlan(db, day.planId) });
  });

  app.patch("/api/v1/plan-exercises/:id", async (request, reply) => {
    const profile = await requireProfile(deps, request, reply);
    const { id } = idParamsSchema.parse(request.params);
    const { planExercise, exercise, day } = await getOwnedPlanExercise(db, profile.id, id);
    const body = updatePlanExerciseBodySchema.parse(request.body);

    // Merge the change into the stored values and validate the whole result, so a
    // field can't be edited into a combination the plan can't hold (for example a
    // failure goal at or below the target reps).
    const { position, ...patch } = body;
    const config = planExerciseConfigFor(exercise.isTimed).parse(
      applyPlanExerciseUpdate(rowToConfig(planExercise), patch)
    );

    await db.transaction(async (tx) => {
      await tx.update(planExercises).set(configToColumns(config)).where(eq(planExercises.id, id));
      if (position !== undefined) {
        const siblings = await tx
          .select({ id: planExercises.id })
          .from(planExercises)
          .where(eq(planExercises.planDayId, day.id))
          .orderBy(asc(planExercises.position));
        await writeExercisePositions(tx, moveItem(siblings.map((s) => s.id), id, position));
      }
    });
    return { plan: await loadPlan(db, day.planId) };
  });

  app.delete("/api/v1/plan-exercises/:id", async (request, reply) => {
    const profile = await requireProfile(deps, request, reply);
    const { id } = idParamsSchema.parse(request.params);
    const { day } = await getOwnedPlanExercise(db, profile.id, id);

    await db.transaction(async (tx) => {
      await tx.delete(planExercises).where(eq(planExercises.id, id));
      const siblings = await tx
        .select({ id: planExercises.id })
        .from(planExercises)
        .where(eq(planExercises.planDayId, day.id))
        .orderBy(asc(planExercises.position));
      await writeExercisePositions(tx, siblings.map((s) => s.id));
    });
    return { plan: await loadPlan(db, day.planId) };
  });
}
