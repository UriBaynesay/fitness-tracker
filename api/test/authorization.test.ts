import { eq, isNull } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { exercises, profiles } from "../src/db/schema.js";
import { call, libraryExercise, makeTestApp, planWithDay, resetDb, signup, type TestApp } from "./helpers.js";

// The handoff's hard requirement: a user must never be able to read or change
// another user's data. Every route that takes an id is tried with someone else's,
// and each attempt must be an indistinguishable 404 that changes nothing.

let t: TestApp;
let alice: string;
let bob: string;
let ids: { planId: string; dayId: string; planExerciseId: string; customExerciseId: string };

beforeAll(async () => {
  t = await makeTestApp();
});
afterAll(async () => {
  await t.close();
});

beforeEach(async () => {
  await resetDb(t.db);
  alice = await signup(t.app, "alice@example.com");
  bob = await signup(t.app, "bob@example.com");

  const { planId, dayId } = await planWithDay(t.app, alice, "Alice plan", "Alice day");
  const lib = await libraryExercise(t.app, alice, false);
  const custom = (await call(t.app, "POST", "/api/v1/exercises", alice, { name: "Alice move", muscleGroup: "core", equipment: "other" })).json().exercise;
  await call(t.app, "POST", `/api/v1/plan-days/${dayId}/exercises`, alice, { exerciseId: lib.id });
  const withCustom = (await call(t.app, "POST", `/api/v1/plan-days/${dayId}/exercises`, alice, { exerciseId: custom.id })).json().plan;
  ids = { planId, dayId, planExerciseId: withCustom.days[0].exercises[0].id, customExerciseId: custom.id };
});

const aliceSnapshot = async () => (await call(t.app, "GET", `/api/v1/plans/${ids.planId}`, alice)).json();
const aliceExercises = async () => (await call(t.app, "GET", "/api/v1/exercises", alice)).json();
const zeroId = "00000000-0000-4000-8000-000000000000";

describe("a user cannot reach another user's plans", () => {
  const attempts: [string, "GET" | "PATCH" | "DELETE" | "POST", () => string, unknown?][] = [
    ["read a plan", "GET", () => `/api/v1/plans/${ids.planId}`],
    ["rename a plan", "PATCH", () => `/api/v1/plans/${ids.planId}`, { name: "Hijacked" }],
    ["activate a plan", "PATCH", () => `/api/v1/plans/${ids.planId}`, { isActive: true }],
    ["delete a plan", "DELETE", () => `/api/v1/plans/${ids.planId}`],
    ["add a day to a plan", "POST", () => `/api/v1/plans/${ids.planId}/days`, { name: "Injected" }],
    ["rename a day", "PATCH", () => `/api/v1/plan-days/${ids.dayId}`, { name: "Hijacked" }],
    ["move a day", "PATCH", () => `/api/v1/plan-days/${ids.dayId}`, { position: 0 }],
    ["delete a day", "DELETE", () => `/api/v1/plan-days/${ids.dayId}`],
    ["add an exercise to a day", "POST", () => `/api/v1/plan-days/${ids.dayId}/exercises`, { exerciseId: "LIBRARY" }],
    ["edit a plan exercise", "PATCH", () => `/api/v1/plan-exercises/${ids.planExerciseId}`, { targetSets: 9 }],
    ["delete a plan exercise", "DELETE", () => `/api/v1/plan-exercises/${ids.planExerciseId}`],
  ];

  it.each(attempts)("cannot %s: 404, and Alice's plan is untouched", async (_name, method, url, payload) => {
    const lib = await libraryExercise(t.app, bob, false);
    const body = JSON.parse(JSON.stringify(payload ?? null)?.replace("LIBRARY", lib.id) ?? "null") ?? undefined;
    const before = await aliceSnapshot();

    const res = await call(t.app, method, url(), bob, body);
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "not_found" });

    expect(await aliceSnapshot()).toEqual(before);
  });

  it("answers exactly the same for an id that never existed (existence is not revealed)", async () => {
    const realButForeign = await call(t.app, "GET", `/api/v1/plans/${ids.planId}`, bob);
    const neverExisted = await call(t.app, "GET", `/api/v1/plans/${zeroId}`, bob);
    expect(realButForeign.statusCode).toBe(neverExisted.statusCode);
    expect(realButForeign.body).toBe(neverExisted.body);
  });

  it("never shows another user's plans in a list, and activating one's own does not touch the other's", async () => {
    const bobsPlan = (await call(t.app, "POST", "/api/v1/plans", bob, { name: "Bob plan" })).json().plan;
    const bobList = (await call(t.app, "GET", "/api/v1/plans", bob)).json().plans;
    expect(bobList.map((p: { id: string }) => p.id)).toEqual([bobsPlan.id]);

    const aliceList = (await call(t.app, "GET", "/api/v1/plans", alice)).json().plans;
    expect(aliceList.map((p: { id: string }) => p.id)).toEqual([ids.planId]);
    expect(aliceList[0].isActive).toBe(true);
    expect(bobList[0].isActive).toBe(true);
  });
});

describe("a user cannot reach another user's custom exercises", () => {
  it("does not see them in the library list", async () => {
    const bobsList = (await call(t.app, "GET", "/api/v1/exercises", bob)).json().exercises;
    expect(bobsList).toHaveLength(62);
    expect(bobsList.some((e: { id: string }) => e.id === ids.customExerciseId)).toBe(false);
    expect((await aliceExercises()).exercises).toHaveLength(63);
  });

  it("cannot rename one", async () => {
    const before = await aliceExercises();
    const res = await call(t.app, "PATCH", `/api/v1/exercises/${ids.customExerciseId}`, bob, { name: "Hijacked" });
    expect(res.statusCode).toBe(404);
    expect(await aliceExercises()).toEqual(before);
  });

  it("cannot put one into a plan of their own", async () => {
    const { dayId } = await planWithDay(t.app, bob);
    const res = await call(t.app, "POST", `/api/v1/plan-days/${dayId}/exercises`, bob, { exerciseId: ids.customExerciseId });
    expect(res.statusCode).toBe(404);
    const bobsPlan = (await call(t.app, "GET", "/api/v1/plans", bob)).json().plans[0];
    expect(bobsPlan.exerciseCount).toBe(0);
  });
});

describe("a user who is not signed in", () => {
  const routes: ["GET" | "POST" | "PATCH" | "DELETE", () => string][] = [
    ["GET", () => "/api/v1/exercises"],
    ["POST", () => "/api/v1/exercises"],
    ["PATCH", () => `/api/v1/exercises/${ids.customExerciseId}`],
    ["GET", () => "/api/v1/plans"],
    ["POST", () => "/api/v1/plans"],
    ["GET", () => `/api/v1/plans/${ids.planId}`],
    ["PATCH", () => `/api/v1/plans/${ids.planId}`],
    ["DELETE", () => `/api/v1/plans/${ids.planId}`],
    ["POST", () => `/api/v1/plans/${ids.planId}/days`],
    ["PATCH", () => `/api/v1/plan-days/${ids.dayId}`],
    ["DELETE", () => `/api/v1/plan-days/${ids.dayId}`],
    ["POST", () => `/api/v1/plan-days/${ids.dayId}/exercises`],
    ["PATCH", () => `/api/v1/plan-exercises/${ids.planExerciseId}`],
    ["DELETE", () => `/api/v1/plan-exercises/${ids.planExerciseId}`],
    ["PATCH", () => "/api/v1/me"],
  ];

  it.each(routes)("gets 401 from %s %s", async (method, url) => {
    const before = await aliceSnapshot();
    const res = await call(t.app, method, url(), undefined, method === "GET" ? undefined : {});
    expect(res.statusCode).toBe(401);
    expect(await aliceSnapshot()).toEqual(before);
  });
});

describe("deleting a profile", () => {
  it("removes that profile's plans and custom exercises, even when a plan uses a custom exercise", async () => {
    // Alice's plan contains her own custom exercise. The exercise -> plan_exercise
    // reference must not block the cascade from deleting Alice herself.
    const bobsPlan = (await call(t.app, "POST", "/api/v1/plans", bob, { name: "Bob plan" })).json().plan;

    await t.db.delete(profiles).where(eq(profiles.email, "alice@example.com"));

    expect((await t.db.select().from(exercises).where(eq(exercises.id, ids.customExerciseId)))).toHaveLength(0);
    expect((await call(t.app, "GET", `/api/v1/plans/${bobsPlan.id}`, bob)).statusCode).toBe(200);
    expect(await t.db.select().from(exercises).where(isNull(exercises.ownerId))).toHaveLength(62);
  });

  it("is refused for a custom exercise that is still in a plan (the exercise itself cannot be deleted from under it)", async () => {
    await expect(t.db.delete(exercises).where(eq(exercises.id, ids.customExerciseId))).rejects.toThrow();
  });
});
