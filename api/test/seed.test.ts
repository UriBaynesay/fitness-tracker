import { and, eq, isNull } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { exercises } from "../src/db/schema.js";
import { loadSeed, seedExercises } from "../src/db/seed.js";
import { call, makeTestApp, resetDb, signup, type TestApp } from "./helpers.js";

let t: TestApp;
const library = () => t.db.select().from(exercises).where(isNull(exercises.ownerId));

beforeAll(async () => {
  t = await makeTestApp();
});
afterAll(async () => {
  await t.close();
});
beforeEach(async () => {
  await resetDb(t.db);
});
afterEach(async () => {
  // Tests below edit library rows; put the real seed back for everyone else.
  await seedExercises(t.db);
});

describe("exercise seed", () => {
  it("loads the full validated library: 62 unique exercises, both languages", () => {
    const rows = loadSeed();
    expect(rows).toHaveLength(62);
    expect(new Set(rows.map((r) => r.slug)).size).toBe(62);
    expect(rows.every((r) => r.name_en && r.name_he)).toBe(true);
    expect(rows.filter((r) => r.is_timed)).toHaveLength(9);
  });

  it("is idempotent: running it again changes nothing and keeps the same ids", async () => {
    const before = await library();
    expect(before).toHaveLength(62);
    await seedExercises(t.db);
    await seedExercises(t.db);
    const after = await library();
    expect(after).toHaveLength(62);
    expect(new Set(after.map((r) => r.id))).toEqual(new Set(before.map((r) => r.id)));
  });

  it("syncs a changed name by slug without creating a duplicate", async () => {
    const rows = loadSeed();
    rows[0] = { ...rows[0]!, name_en: "Renamed In The Seed", name_he: "שם חדש" };
    await seedExercises(t.db, rows);

    const [row] = await t.db.select().from(exercises).where(and(isNull(exercises.ownerId), eq(exercises.slug, rows[0]!.slug)));
    expect(row?.nameEn).toBe("Renamed In The Seed");
    expect(row?.nameHe).toBe("שם חדש");
    expect(await library()).toHaveLength(62);
  });

  it("never touches a user's own exercises, even one that reuses a library slug", async () => {
    const token = await signup(t.app, "owner@example.com");
    const slug = loadSeed()[0]!.slug;
    const created = await call(t.app, "POST", "/api/v1/exercises", token, { name: "Mine", muscleGroup: "chest", equipment: "other" });
    expect(created.statusCode).toBe(201);
    // Same slug as a library row, but owned: allowed, and the seed must leave it alone.
    await t.db.update(exercises).set({ slug }).where(eq(exercises.id, created.json().exercise.id));

    await seedExercises(t.db);

    const [mine] = await t.db.select().from(exercises).where(eq(exercises.id, created.json().exercise.id));
    expect(mine?.nameEn).toBe("Mine");
    expect(mine?.ownerId).not.toBeNull();
    expect(await library()).toHaveLength(62);
  });
});
