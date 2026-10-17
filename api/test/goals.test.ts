import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { defaultPlanExerciseConfig, type Exercise } from "@fitness/shared";
import { goals, profiles } from "../src/db/schema.js";
import { call, libraryExercise, makeTestApp, resetDb, signup, type TestApp } from "./helpers.js";

let t: TestApp;
let token: string;
let bench: Exercise;
let plank: Exercise;

beforeAll(async () => {
  t = await makeTestApp();
});
afterAll(async () => {
  await t.close();
});
beforeEach(async () => {
  await resetDb(t.db);
  token = await signup(t.app, "goals@example.com");
  bench = await libraryExercise(t.app, token, false);
  plank = await libraryExercise(t.app, token, true);
});

const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000).toISOString();

// Logs one finished workout with a single set of the exercise.
async function logSet(exercise: Exercise, set: { weightKg?: number; reps?: number; durationSeconds?: number }, opts: { finished?: boolean; skipped?: boolean } = {}) {
  const clientId = randomUUID();
  const timed = exercise.isTimed;
  const body = {
    clientId,
    planDayId: null,
    planDayName: null,
    startedAt: minutesAgo(60),
    endedAt: opts.finished === false ? null : minutesAgo(1),
    exercises: [
      {
        ...defaultPlanExerciseConfig(timed, "kg"),
        clientId: randomUUID(),
        exerciseId: exercise.id,
        position: 0,
        skipped: opts.skipped ?? false,
        sets: [
          {
            clientId: randomUUID(),
            setNumber: 1,
            weightKg: timed ? null : (set.weightKg ?? 0),
            reps: timed ? null : (set.reps ?? 10),
            durationSeconds: timed ? (set.durationSeconds ?? 30) : null,
            toFailure: false,
            completedAt: minutesAgo(10),
          },
        ],
      },
    ],
  };
  expect((await call(t.app, "PUT", `/api/v1/sessions/${clientId}`, token, body)).statusCode).toBe(200);
}

const create = (body: Record<string, unknown>, as = token) => call(t.app, "POST", "/api/v1/goals", as, body);
const list = async (as = token) => (await call(t.app, "GET", "/api/v1/goals", as)).json().goals;

describe("creating a goal", () => {
  it("starts from the current best, so progress begins at zero", async () => {
    await logSet(bench, { weightKg: 60, reps: 8 });
    await logSet(bench, { weightKg: 70, reps: 5 });
    const res = await create({ exerciseId: bench.id, metric: "weight", target: 100 });
    expect(res.statusCode).toBe(201);
    expect(res.json().goal).toMatchObject({ exerciseId: bench.id, metric: "weight", startValue: 70, targetValue: 100, best: 70 });
  });

  it("starts from zero when nothing has been logged", async () => {
    const res = await create({ exerciseId: plank.id, metric: "duration", target: 120 });
    expect(res.json().goal).toMatchObject({ startValue: 0, targetValue: 120, best: null });
  });

  it("measures reps and duration too", async () => {
    await logSet(bench, { weightKg: 50, reps: 12 });
    await logSet(plank, { durationSeconds: 45 });
    expect((await create({ exerciseId: bench.id, metric: "reps", target: 20 })).json().goal.startValue).toBe(12);
    expect((await create({ exerciseId: plank.id, metric: "duration", target: 90 })).json().goal.startValue).toBe(45);
  });

  it("ignores unfinished workouts and skipped exercises when finding the start", async () => {
    await logSet(bench, { weightKg: 200 }, { finished: false });
    await logSet(bench, { weightKg: 300 }, { skipped: true });
    await logSet(bench, { weightKg: 50 });
    expect((await create({ exerciseId: bench.id, metric: "weight", target: 80 })).json().goal.startValue).toBe(50);
  });

  it("refuses a metric that does not fit the exercise", async () => {
    expect((await create({ exerciseId: plank.id, metric: "weight", target: 50 })).json()).toEqual({ error: "metric_mismatch" });
    expect((await create({ exerciseId: bench.id, metric: "duration", target: 50 })).json()).toEqual({ error: "metric_mismatch" });
  });

  it("refuses an unknown exercise and bad bodies", async () => {
    expect((await create({ exerciseId: randomUUID(), metric: "weight", target: 50 })).json()).toEqual({ error: "unknown_exercise" });
    expect((await create({ exerciseId: bench.id, metric: "weight", target: -5 })).statusCode).toBe(400);
    expect((await create({ exerciseId: bench.id, metric: "speed", target: 5 })).statusCode).toBe(400);
  });

  it("refuses a target that is not above where the person already is", async () => {
    await logSet(bench, { weightKg: 80 });
    expect((await create({ exerciseId: bench.id, metric: "weight", target: 80 })).json()).toEqual({ error: "target_not_above_start" });
    expect((await create({ exerciseId: bench.id, metric: "weight", target: 70 })).statusCode).toBe(400);
  });

  it("one goal per exercise and metric", async () => {
    expect((await create({ exerciseId: bench.id, metric: "weight", target: 100 })).statusCode).toBe(201);
    const again = await create({ exerciseId: bench.id, metric: "weight", target: 120 });
    expect(again.statusCode).toBe(409);
    expect(again.json()).toEqual({ error: "goal_exists" });
    expect((await create({ exerciseId: bench.id, metric: "reps", target: 20 })).statusCode).toBe(201);
  });

  it("simultaneous creates leave exactly one goal", async () => {
    const results = await Promise.all(Array.from({ length: 6 }, () => create({ exerciseId: bench.id, metric: "weight", target: 100 })));
    expect(results.filter((r) => r.statusCode === 201)).toHaveLength(1);
    expect(results.filter((r) => r.statusCode === 409)).toHaveLength(5);
    expect(await list()).toHaveLength(1);
  });

  it("is capped per person", async () => {
    const all: Exercise[] = (await call(t.app, "GET", "/api/v1/exercises", token)).json().exercises;
    const repExercises = all.filter((e) => !e.isTimed);
    for (const exercise of repExercises.slice(0, 30)) {
      expect((await create({ exerciseId: exercise.id, metric: "reps", target: 5 })).statusCode).toBe(201);
    }
    const over = await create({ exerciseId: repExercises[30]!.id, metric: "reps", target: 5 });
    expect(over.statusCode).toBe(409);
    expect(over.json()).toEqual({ error: "limit_reached" });
  });
});

describe("reading and changing goals", () => {
  it("lists goals with the live best, which moves as workouts are logged", async () => {
    await create({ exerciseId: bench.id, metric: "weight", target: 100 });
    expect((await list())[0].best).toBeNull();
    await logSet(bench, { weightKg: 65 });
    expect((await list())[0]).toMatchObject({ startValue: 0, best: 65 });
    await logSet(bench, { weightKg: 70 }, { finished: false });
    expect((await list())[0].best).toBe(65);
  });

  it("lists newest first", async () => {
    await create({ exerciseId: bench.id, metric: "weight", target: 100 });
    await create({ exerciseId: plank.id, metric: "duration", target: 100 });
    expect((await list()).map((g: { metric: string }) => g.metric)).toEqual(["duration", "weight"]);
  });

  it("changes the target, but not to or below the start", async () => {
    await logSet(bench, { weightKg: 60 });
    const { goal } = (await create({ exerciseId: bench.id, metric: "weight", target: 100 })).json();
    const ok = await call(t.app, "PATCH", `/api/v1/goals/${goal.id}`, token, { target: 120 });
    expect(ok.json().goal).toMatchObject({ targetValue: 120, startValue: 60 });
    expect((await call(t.app, "PATCH", `/api/v1/goals/${goal.id}`, token, { target: 60 })).json()).toEqual({ error: "target_not_above_start" });
    expect((await call(t.app, "PATCH", `/api/v1/goals/${randomUUID()}`, token, { target: 120 })).statusCode).toBe(404);
  });

  it("deletes, and deleting again is fine", async () => {
    const { goal } = (await create({ exerciseId: bench.id, metric: "weight", target: 100 })).json();
    expect((await call(t.app, "DELETE", `/api/v1/goals/${goal.id}`, token)).statusCode).toBe(204);
    expect(await list()).toEqual([]);
    expect((await call(t.app, "DELETE", `/api/v1/goals/${goal.id}`, token)).statusCode).toBe(204);
  });

  it("removes a person's goals with their profile, even for a custom exercise", async () => {
    const custom = (await call(t.app, "POST", "/api/v1/exercises", token, { name: "Sled", muscleGroup: "quads", equipment: "other" })).json().exercise;
    await create({ exerciseId: custom.id, metric: "weight", target: 100 });
    await t.db.delete(profiles).where(eq(profiles.email, "goals@example.com"));
    expect(await t.db.select().from(goals)).toHaveLength(0);
  });
});
