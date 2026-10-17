import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MAX_DAYS_PER_PLAN, MAX_EXERCISES_PER_DAY, MAX_PLANS_PER_PROFILE } from "@fitness/shared";
import { plans } from "../src/db/schema.js";
import { call, libraryExercise, makeTestApp, planWithDay, resetDb, signup, type TestApp } from "./helpers.js";

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
  token = await signup(t.app, "planner@example.com");
});

const rowCount = async (table: "plan_days" | "plan_exercises") =>
  ((await t.db.execute(sql.raw(`select count(*)::int as n from ${table}`))).rows[0] as { n: number }).n;

const createPlan = (name: string) => call(t.app, "POST", "/api/v1/plans", token, { name });
const getPlan = async (id: string) => (await call(t.app, "GET", `/api/v1/plans/${id}`, token)).json().plan;

describe("plans", () => {
  it("creates a plan; the first one becomes active, later ones do not", async () => {
    const first = await createPlan("  Push / Pull / Legs  ");
    expect(first.statusCode).toBe(201);
    expect(first.json().plan).toMatchObject({ name: "Push / Pull / Legs", isActive: true, days: [], notes: null });

    const second = await createPlan("Upper / Lower");
    expect(second.json().plan.isActive).toBe(false);
  });

  it("rejects an empty name", async () => {
    const res = await createPlan("   ");
    expect(res.statusCode).toBe(400);
    expect(res.json().issues[0].path).toBe("name");
  });

  it("lists summaries with day and exercise counts, the active plan first", async () => {
    await createPlan("A");
    const b = (await createPlan("B")).json().plan;
    await call(t.app, "PATCH", `/api/v1/plans/${b.id}`, token, { isActive: true });
    const { dayId } = await planWithDay(t.app, token, "C");
    const ex = await libraryExercise(t.app, token);
    await call(t.app, "POST", `/api/v1/plan-days/${dayId}/exercises`, token, { exerciseId: ex.id });
    await call(t.app, "POST", `/api/v1/plan-days/${dayId}/exercises`, token, { exerciseId: ex.id });

    const list = (await call(t.app, "GET", "/api/v1/plans", token)).json().plans;
    expect(list.map((p: { name: string }) => p.name)).toEqual(["B", "A", "C"]);
    expect(list[0].isActive).toBe(true);
    expect(list[2]).toMatchObject({ dayCount: 1, exerciseCount: 2 });
    expect(list[1]).toMatchObject({ dayCount: 0, exerciseCount: 0 });
  });

  it("renames, edits notes, and moves the active flag atomically", async () => {
    const a = (await createPlan("A")).json().plan;
    const b = (await createPlan("B")).json().plan;

    const renamed = await call(t.app, "PATCH", `/api/v1/plans/${b.id}`, token, { name: "B2", notes: "heavy block" });
    expect(renamed.json().plan).toMatchObject({ name: "B2", notes: "heavy block", isActive: false });

    const activated = await call(t.app, "PATCH", `/api/v1/plans/${b.id}`, token, { isActive: true });
    expect(activated.json().plan.isActive).toBe(true);
    expect((await getPlan(a.id)).isActive).toBe(false);

    const deactivated = await call(t.app, "PATCH", `/api/v1/plans/${b.id}`, token, { isActive: false });
    expect(deactivated.json().plan.isActive).toBe(false);

    expect((await call(t.app, "PATCH", `/api/v1/plans/${a.id}`, token, {})).statusCode).toBe(400);
  });

  it("the database refuses a second active plan for the same profile", async () => {
    const a = (await createPlan("A")).json().plan;
    const b = (await createPlan("B")).json().plan;
    await expect(
      t.db.execute(sql`update ${plans} set is_active = true where id in (${a.id}, ${b.id})`)
    ).rejects.toThrow();
  });

  it("deleting a plan removes its days and exercises; deleting the active plan leaves none active", async () => {
    const { planId, dayId } = await planWithDay(t.app, token);
    const other = (await createPlan("Other")).json().plan;
    const ex = await libraryExercise(t.app, token);
    await call(t.app, "POST", `/api/v1/plan-days/${dayId}/exercises`, token, { exerciseId: ex.id });

    expect((await call(t.app, "DELETE", `/api/v1/plans/${planId}`, token)).statusCode).toBe(204);
    expect((await call(t.app, "GET", `/api/v1/plans/${planId}`, token)).statusCode).toBe(404);
    expect([await rowCount("plan_days"), await rowCount("plan_exercises")]).toEqual([0, 0]);

    const list = (await call(t.app, "GET", "/api/v1/plans", token)).json().plans;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: other.id, isActive: false });
  });

  it("caps the number of plans per profile", async () => {
    for (let i = 0; i < MAX_PLANS_PER_PROFILE; i++) {
      expect((await createPlan(`Plan ${i}`)).statusCode).toBe(201);
    }
    const over = await createPlan("One too many");
    expect(over.statusCode).toBe(409);
    expect(over.json()).toEqual({ error: "limit_reached" });
  });

  it("rejects a malformed id with 400, not a server error", async () => {
    expect((await call(t.app, "GET", "/api/v1/plans/not-a-uuid", token)).statusCode).toBe(400);
  });
});

describe("days", () => {
  it("adds days in order, renames, moves and deletes with contiguous positions", async () => {
    const plan = (await createPlan("PPL")).json().plan;
    for (const name of ["Push", "Pull", "Legs"]) {
      expect((await call(t.app, "POST", `/api/v1/plans/${plan.id}/days`, token, { name })).statusCode).toBe(201);
    }
    let days = (await getPlan(plan.id)).days;
    expect(days.map((d: { name: string; position: number }) => [d.name, d.position])).toEqual([["Push", 0], ["Pull", 1], ["Legs", 2]]);

    const legs = days[2].id;
    const moved = await call(t.app, "PATCH", `/api/v1/plan-days/${legs}`, token, { position: 0, name: "Legs!" });
    days = moved.json().plan.days;
    expect(days.map((d: { name: string; position: number }) => [d.name, d.position])).toEqual([["Legs!", 0], ["Push", 1], ["Pull", 2]]);

    const del = await call(t.app, "DELETE", `/api/v1/plan-days/${days[1].id}`, token);
    expect(del.json().plan.days.map((d: { name: string; position: number }) => [d.name, d.position])).toEqual([["Legs!", 0], ["Pull", 1]]);
  });

  it("simultaneous additions get distinct, contiguous positions (no lost or duplicated slot)", async () => {
    const plan = (await createPlan("Race")).json().plan;
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) => call(t.app, "POST", `/api/v1/plans/${plan.id}/days`, token, { name: `Day ${i + 1}` }))
    );
    expect(results.map((r) => r.statusCode)).toEqual(Array(8).fill(201));

    const days = (await getPlan(plan.id)).days;
    expect(days.map((d: { position: number }) => d.position)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(new Set(days.map((d: { id: string }) => d.id)).size).toBe(8);
  });

  it("caps days per plan", async () => {
    const plan = (await createPlan("Big")).json().plan;
    for (let i = 0; i < MAX_DAYS_PER_PLAN; i++) {
      await call(t.app, "POST", `/api/v1/plans/${plan.id}/days`, token, { name: `D${i}` });
    }
    const over = await call(t.app, "POST", `/api/v1/plans/${plan.id}/days`, token, { name: "extra" });
    expect(over.statusCode).toBe(409);
  });
});

describe("plan exercises", () => {
  it("adds a rep exercise with sensible defaults, in kg", async () => {
    const { dayId } = await planWithDay(t.app, token);
    const ex = await libraryExercise(t.app, token, false);
    const res = await call(t.app, "POST", `/api/v1/plan-days/${dayId}/exercises`, token, { exerciseId: ex.id });
    expect(res.statusCode).toBe(201);
    const added = res.json().plan.days[0].exercises[0];
    expect(added).toMatchObject({
      position: 0,
      targetSets: 3,
      targetReps: 10,
      targetDurationSeconds: null,
      restSeconds: 90,
      progressionMode: "target",
      failureTargetReps: null,
      sessionsToConfirm: 2,
      weightStepKg: 2.5,
    });
    expect(added.exercise.id).toBe(ex.id);
  });

  it("adds a timed exercise with seconds and no reps, weight step or failure mode", async () => {
    const { dayId } = await planWithDay(t.app, token);
    const ex = await libraryExercise(t.app, token, true);
    const added = (await call(t.app, "POST", `/api/v1/plan-days/${dayId}/exercises`, token, { exerciseId: ex.id })).json().plan.days[0].exercises[0];
    expect(added).toMatchObject({ targetReps: null, targetDurationSeconds: 30, weightStepKg: null, progressionMode: "target" });
  });

  it("uses a 5 lb default step (2.268 kg) for a user on pounds", async () => {
    await call(t.app, "PATCH", "/api/v1/me", token, { weightUnit: "lb" });
    const { dayId } = await planWithDay(t.app, token);
    const ex = await libraryExercise(t.app, token, false);
    const added = (await call(t.app, "POST", `/api/v1/plan-days/${dayId}/exercises`, token, { exerciseId: ex.id })).json().plan.days[0].exercises[0];
    expect(added.weightStepKg).toBe(2.268);
  });

  it("edits individual fields and keeps the rest", async () => {
    const { dayId } = await planWithDay(t.app, token);
    const ex = await libraryExercise(t.app, token, false);
    const id = (await call(t.app, "POST", `/api/v1/plan-days/${dayId}/exercises`, token, { exerciseId: ex.id })).json().plan.days[0].exercises[0].id;

    const res = await call(t.app, "PATCH", `/api/v1/plan-exercises/${id}`, token, { targetSets: 4, targetReps: 8, restSeconds: 120, weightStepKg: 1.25 });
    expect(res.statusCode).toBe(200);
    expect(res.json().plan.days[0].exercises[0]).toMatchObject({ targetSets: 4, targetReps: 8, restSeconds: 120, weightStepKg: 1.25, progressionMode: "target" });
  });

  it("failure mode: proposes target + 5, accepts an explicit goal, and is cleared when switching back", async () => {
    const { dayId } = await planWithDay(t.app, token);
    const ex = await libraryExercise(t.app, token, false);
    const id = (await call(t.app, "POST", `/api/v1/plan-days/${dayId}/exercises`, token, { exerciseId: ex.id })).json().plan.days[0].exercises[0].id;
    await call(t.app, "PATCH", `/api/v1/plan-exercises/${id}`, token, { targetReps: 15 });

    const failure = (await call(t.app, "PATCH", `/api/v1/plan-exercises/${id}`, token, { progressionMode: "failure" })).json().plan.days[0].exercises[0];
    expect(failure).toMatchObject({ progressionMode: "failure", targetReps: 15, failureTargetReps: 20 });

    const custom = (await call(t.app, "PATCH", `/api/v1/plan-exercises/${id}`, token, { failureTargetReps: 24, sessionsToConfirm: 3 })).json().plan.days[0].exercises[0];
    expect(custom).toMatchObject({ failureTargetReps: 24, sessionsToConfirm: 3 });

    const back = (await call(t.app, "PATCH", `/api/v1/plan-exercises/${id}`, token, { progressionMode: "target" })).json().plan.days[0].exercises[0];
    expect(back).toMatchObject({ progressionMode: "target", failureTargetReps: null });
  });

  it("refuses combinations the plan cannot hold", async () => {
    const { dayId } = await planWithDay(t.app, token);
    const rep = await libraryExercise(t.app, token, false);
    const timed = await libraryExercise(t.app, token, true);
    const repId = (await call(t.app, "POST", `/api/v1/plan-days/${dayId}/exercises`, token, { exerciseId: rep.id })).json().plan.days[0].exercises[0].id;
    const timedId = (await call(t.app, "POST", `/api/v1/plan-days/${dayId}/exercises`, token, { exerciseId: timed.id })).json().plan.days[0].exercises[1].id;

    // Raising target reps past an existing failure goal.
    await call(t.app, "PATCH", `/api/v1/plan-exercises/${repId}`, token, { targetReps: 15, progressionMode: "failure", failureTargetReps: 20 });
    const tooHigh = await call(t.app, "PATCH", `/api/v1/plan-exercises/${repId}`, token, { targetReps: 25 });
    expect(tooHigh.statusCode).toBe(400);
    expect(tooHigh.json().issues[0].path).toBe("failureTargetReps");

    // A timed exercise cannot have reps, a failure mode or a weight step.
    for (const bad of [{ targetReps: 10 }, { progressionMode: "failure" }, { weightStepKg: 2.5 }]) {
      const res = await call(t.app, "PATCH", `/api/v1/plan-exercises/${timedId}`, token, bad);
      expect(res.statusCode, JSON.stringify(bad)).toBe(400);
    }

    // Plain range checks, and an empty update.
    expect((await call(t.app, "PATCH", `/api/v1/plan-exercises/${repId}`, token, { targetSets: 0 })).statusCode).toBe(400);
    expect((await call(t.app, "PATCH", `/api/v1/plan-exercises/${repId}`, token, {})).statusCode).toBe(400);

    // The rejected edits changed nothing.
    const stored = (await call(t.app, "GET", `/api/v1/plans/${(await call(t.app, "GET", "/api/v1/plans", token)).json().plans[0].id}`, token)).json().plan.days[0].exercises;
    expect(stored[0]).toMatchObject({ targetReps: 15, failureTargetReps: 20 });
    expect(stored[1]).toMatchObject({ targetReps: null, targetDurationSeconds: 30 });
  });

  it("reorders within a day, and delete keeps positions contiguous", async () => {
    const { planId, dayId } = await planWithDay(t.app, token);
    const ex = await libraryExercise(t.app, token, false);
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const plan = (await call(t.app, "POST", `/api/v1/plan-days/${dayId}/exercises`, token, { exerciseId: ex.id })).json().plan;
      ids.push(plan.days[0].exercises[i].id);
    }

    const moved = (await call(t.app, "PATCH", `/api/v1/plan-exercises/${ids[2]}`, token, { position: 0 })).json().plan.days[0].exercises;
    expect(moved.map((e: { id: string; position: number }) => [e.id, e.position])).toEqual([[ids[2], 0], [ids[0], 1], [ids[1], 2]]);

    const after = (await call(t.app, "DELETE", `/api/v1/plan-exercises/${ids[0]}`, token)).json().plan.days[0].exercises;
    expect(after.map((e: { id: string; position: number }) => [e.id, e.position])).toEqual([[ids[2], 0], [ids[1], 1]]);
    expect((await getPlan(planId)).days[0].exercises).toHaveLength(2);
  });

  it("simultaneous exercise additions to one day get distinct, contiguous positions", async () => {
    const { planId, dayId } = await planWithDay(t.app, token);
    const ex = await libraryExercise(t.app, token, false);
    const results = await Promise.all(
      Array.from({ length: 8 }, () => call(t.app, "POST", `/api/v1/plan-days/${dayId}/exercises`, token, { exerciseId: ex.id }))
    );
    expect(results.map((r) => r.statusCode)).toEqual(Array(8).fill(201));
    const added = (await getPlan(planId)).days[0].exercises;
    expect(added.map((e: { position: number }) => e.position)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it("caps exercises per day", async () => {
    const { dayId } = await planWithDay(t.app, token);
    const ex = await libraryExercise(t.app, token, false);
    for (let i = 0; i < MAX_EXERCISES_PER_DAY; i++) {
      await call(t.app, "POST", `/api/v1/plan-days/${dayId}/exercises`, token, { exerciseId: ex.id });
    }
    expect((await call(t.app, "POST", `/api/v1/plan-days/${dayId}/exercises`, token, { exerciseId: ex.id })).statusCode).toBe(409);
  });

  it("rejects an unknown exercise id with 404", async () => {
    const { dayId } = await planWithDay(t.app, token);
    const res = await call(t.app, "POST", `/api/v1/plan-days/${dayId}/exercises`, token, { exerciseId: "00000000-0000-4000-8000-000000000000" });
    expect(res.statusCode).toBe(404);
  });
});
