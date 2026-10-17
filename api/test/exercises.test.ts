import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MAX_CUSTOM_EXERCISES_PER_PROFILE } from "@fitness/shared";
import { call, listExercises, makeTestApp, planWithDay, resetDb, signup, type TestApp } from "./helpers.js";

let t: TestApp;
let token: string;

beforeAll(async () => {
  t = await makeTestApp();
});
afterAll(async () => {
  await t.close();
});
beforeEach(async () => {
  await resetDb(t.db);
  token = await signup(t.app, "lifter@example.com");
});

const create = (body: Record<string, unknown>) => call(t.app, "POST", "/api/v1/exercises", token, body);
const sled = { name: "Sled push", muscleGroup: "quads", equipment: "other" };

describe("exercise library", () => {
  it("lists the 62 seeded exercises, in both languages, none marked custom", async () => {
    const list = await listExercises(t.app, token);
    expect(list).toHaveLength(62);
    expect(list.every((e) => !e.isCustom && e.nameEn && e.nameHe)).toBe(true);
    expect(list.filter((e) => e.isTimed)).toHaveLength(9);
    expect(list.find((e) => e.slug === "barbell-bench-press")).toMatchObject({
      nameEn: "Barbell Bench Press",
      nameHe: "דחיקת חזה במוט",
      muscleGroup: "chest",
      equipment: "barbell",
    });
  });
});

describe("custom exercises", () => {
  it("creates one with a single name shown in both languages, and lists it as custom", async () => {
    const res = await create(sled);
    expect(res.statusCode).toBe(201);
    expect(res.json().exercise).toMatchObject({
      nameEn: "Sled push",
      nameHe: "Sled push",
      muscleGroup: "quads",
      equipment: "other",
      isTimed: false,
      isCustom: true,
    });
    expect(res.json().exercise.slug).toMatch(/^custom-/);

    const list = await listExercises(t.app, token);
    expect(list).toHaveLength(63);
    expect(list.filter((e) => e.isCustom)).toHaveLength(1);
  });

  it("can be timed, and can then be used in a plan with seconds", async () => {
    const ex = (await create({ ...sled, name: "Wall sit", isTimed: true })).json().exercise;
    expect(ex.isTimed).toBe(true);
    const { dayId } = await planWithDay(t.app, token);
    const added = (await call(t.app, "POST", `/api/v1/plan-days/${dayId}/exercises`, token, { exerciseId: ex.id })).json().plan.days[0].exercises[0];
    expect(added).toMatchObject({ targetReps: null, targetDurationSeconds: 30 });
  });

  it("validates the name and the muscle group / equipment values", async () => {
    expect((await create({ ...sled, name: "   " })).statusCode).toBe(400);
    expect((await create({ ...sled, name: "x".repeat(81) })).statusCode).toBe(400);
    expect((await create({ ...sled, muscleGroup: "toes" })).statusCode).toBe(400);
    expect((await create({ ...sled, equipment: "jetpack" })).statusCode).toBe(400);
  });

  it("renames and re-categorises its own exercise; isTimed cannot be changed", async () => {
    const ex = (await create(sled)).json().exercise;
    const res = await call(t.app, "PATCH", `/api/v1/exercises/${ex.id}`, token, { name: "Prowler push", muscleGroup: "glutes", equipment: "machine" });
    expect(res.statusCode).toBe(200);
    expect(res.json().exercise).toMatchObject({ nameEn: "Prowler push", nameHe: "Prowler push", muscleGroup: "glutes", equipment: "machine", isTimed: false });

    const timedAttempt = await call(t.app, "PATCH", `/api/v1/exercises/${ex.id}`, token, { isTimed: true });
    expect(timedAttempt.statusCode).toBe(400);
    expect((await listExercises(t.app, token)).find((e) => e.id === ex.id)?.isTimed).toBe(false);
  });

  it("cannot edit a library exercise: it is a plain 404", async () => {
    const library = (await listExercises(t.app, token)).find((e) => !e.isCustom)!;
    const res = await call(t.app, "PATCH", `/api/v1/exercises/${library.id}`, token, { name: "Hacked" });
    expect(res.statusCode).toBe(404);
    expect((await listExercises(t.app, token)).find((e) => e.id === library.id)?.nameEn).toBe(library.nameEn);
  });

  it("caps custom exercises per profile", async () => {
    for (let i = 0; i < MAX_CUSTOM_EXERCISES_PER_PROFILE; i++) {
      expect((await create({ ...sled, name: `Custom ${i}` })).statusCode).toBe(201);
    }
    const over = await create({ ...sled, name: "One too many" });
    expect(over.statusCode).toBe(409);
    expect(over.json()).toEqual({ error: "limit_reached" });
  });

  it("an exercise used in a plan keeps working after it is renamed", async () => {
    const ex = (await create(sled)).json().exercise;
    const { dayId } = await planWithDay(t.app, token);
    await call(t.app, "POST", `/api/v1/plan-days/${dayId}/exercises`, token, { exerciseId: ex.id });
    await call(t.app, "PATCH", `/api/v1/exercises/${ex.id}`, token, { name: "Renamed" });
    const plan = (await call(t.app, "GET", "/api/v1/plans", token)).json().plans[0];
    const full = (await call(t.app, "GET", `/api/v1/plans/${plan.id}`, token)).json().plan;
    expect(full.days[0].exercises[0].exercise.nameEn).toBe("Renamed");
  });
});
