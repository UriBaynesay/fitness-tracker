import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { asc, eq, isNull, or } from "drizzle-orm";
import {
  MAX_CUSTOM_EXERCISES_PER_PROFILE,
  createExerciseBodySchema,
  idParamsSchema,
  updateExerciseBodySchema,
} from "@fitness/shared";
import { exercises } from "../db/schema.js";
import { HttpError } from "../http/errors.js";
import { getOwnedExercise } from "../plans/ownership.js";
import { toExerciseDto } from "../plans/queries.js";
import { requireProfile, type RouteDeps } from "./auth.js";

export function registerExerciseRoutes(app: FastifyInstance, deps: RouteDeps): void {
  const { db } = deps;

  // The shared library plus the caller's own exercises, never anyone else's.
  app.get("/api/v1/exercises", async (request, reply) => {
    const profile = await requireProfile(deps, request, reply);
    const rows = await db
      .select()
      .from(exercises)
      .where(or(isNull(exercises.ownerId), eq(exercises.ownerId, profile.id)))
      .orderBy(asc(exercises.slug));
    return { exercises: rows.map(toExerciseDto) };
  });

  app.post("/api/v1/exercises", async (request, reply) => {
    const profile = await requireProfile(deps, request, reply);
    const body = createExerciseBodySchema.parse(request.body);

    const owned = await db.$count(exercises, eq(exercises.ownerId, profile.id));
    if (owned >= MAX_CUSTOM_EXERCISES_PER_PROFILE) throw new HttpError(409, "limit_reached");

    // A custom exercise has one name, written to both language columns so it reads
    // the same whichever language the user switches to. The slug is only an
    // identity for the seed's upserts, so an opaque one is fine here.
    const [row] = await db
      .insert(exercises)
      .values({
        ownerId: profile.id,
        slug: `custom-${randomUUID().slice(0, 8)}`,
        nameEn: body.name,
        nameHe: body.name,
        muscleGroup: body.muscleGroup,
        equipment: body.equipment,
        isTimed: body.isTimed,
      })
      .returning();
    return reply.code(201).send({ exercise: toExerciseDto(row!) });
  });

  app.patch("/api/v1/exercises/:id", async (request, reply) => {
    const profile = await requireProfile(deps, request, reply);
    const { id } = idParamsSchema.parse(request.params);
    // Library exercises and other people's are both a plain 404.
    await getOwnedExercise(db, profile.id, id);
    const body = updateExerciseBodySchema.parse(request.body);

    const [row] = await db
      .update(exercises)
      .set({
        ...(body.name !== undefined ? { nameEn: body.name, nameHe: body.name } : {}),
        ...(body.muscleGroup !== undefined ? { muscleGroup: body.muscleGroup } : {}),
        ...(body.equipment !== undefined ? { equipment: body.equipment } : {}),
      })
      .where(eq(exercises.id, id))
      .returning();
    return { exercise: toExerciseDto(row!) };
  });
}
