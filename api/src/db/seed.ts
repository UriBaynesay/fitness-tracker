import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { equipmentSchema, muscleGroupSchema } from "@fitness/shared";
import type { Db } from "./index.js";
import { exercises } from "./schema.js";

const seedRowSchema = z.object({
  slug: z.string().min(1),
  name_en: z.string().min(1),
  name_he: z.string().min(1),
  muscle_group: muscleGroupSchema,
  equipment: equipmentSchema,
  is_timed: z.boolean(),
});
export type SeedExercise = z.infer<typeof seedRowSchema>;

// Resolved from this file so it is api/seed/exercises.json from both src/ (tsx) and
// dist/ (the production image). The file is a copy of the design handoff's list.
const seedPath = fileURLToPath(new URL("../../seed/exercises.json", import.meta.url));

// Validated on load: a typo in a muscle group fails here with a clear message
// instead of as a CHECK violation halfway through the insert.
export function loadSeed(): SeedExercise[] {
  return z.array(seedRowSchema).parse(JSON.parse(readFileSync(seedPath, "utf8")));
}

// Upsert by slug among the library rows (owner_id is null), so running it twice
// changes nothing and fixing a name later is "edit the JSON and redeploy". Users'
// own exercises are never touched. Never flip is_timed for an exercise that plans
// already use: their reps/seconds would no longer match.
export async function seedExercises(db: Db, rows: SeedExercise[] = loadSeed()): Promise<number> {
  await db
    .insert(exercises)
    .values(
      rows.map((row) => ({
        ownerId: null,
        slug: row.slug,
        nameEn: row.name_en,
        nameHe: row.name_he,
        muscleGroup: row.muscle_group,
        equipment: row.equipment,
        isTimed: row.is_timed,
      }))
    )
    .onConflictDoUpdate({
      target: exercises.slug,
      targetWhere: sql`${exercises.ownerId} is null`,
      set: {
        nameEn: sql`excluded.name_en`,
        nameHe: sql`excluded.name_he`,
        muscleGroup: sql`excluded.muscle_group`,
        equipment: sql`excluded.equipment`,
        isTimed: sql`excluded.is_timed`,
      },
    });
  return rows.length;
}
