import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MAX_SESSION_EXERCISES, defaultPlanExerciseConfig, type Exercise } from "@fitness/shared";
import { exercises, profiles } from "../src/db/schema.js";
import { call, libraryExercise, makeTestApp, planWithDay, resetDb, signup, type TestApp } from "./helpers.js";

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
  token = await signup(t.app, "lifter@example.com");
  bench = await libraryExercise(t.app, token, false);
  plank = await libraryExercise(t.app, token, true);
});

const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000).toISOString();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function entry(exercise: Exercise, position: number, sets = 2, overrides: Record<string, unknown> = {}): any {
  return {
    ...defaultPlanExerciseConfig(exercise.isTimed, "kg"),
    clientId: randomUUID(),
    exerciseId: exercise.id,
    position,
    skipped: false,
    sets: Array.from({ length: sets }, (_, i) =>
      exercise.isTimed
        ? { clientId: randomUUID(), setNumber: i + 1, weightKg: null, reps: null, durationSeconds: 30, toFailure: false, completedAt: minutesAgo(10 - i) }
        : { clientId: randomUUID(), setNumber: i + 1, weightKg: 80 + i, reps: 8, durationSeconds: null, toFailure: false, completedAt: minutesAgo(10 - i) }
    ),
    ...overrides,
  };
}

function doc(exerciseEntries: unknown[], overrides: Record<string, unknown> = {}) {
  const clientId = (overrides.clientId as string | undefined) ?? randomUUID();
  return { clientId, planDayId: null, planDayName: "Push", startedAt: minutesAgo(60), endedAt: minutesAgo(1), exercises: exerciseEntries, ...overrides };
}

const put = (as: string | undefined, body: { clientId: string } & Record<string, unknown>) =>
  call(t.app, "PUT", `/api/v1/sessions/${body.clientId}`, as, body);
const list = async (as = token, query = "") => (await call(t.app, "GET", `/api/v1/sessions${query}`, as)).json().sessions;
const history = async (ids: string[], limit = 3, as = token) =>
  (await call(t.app, "GET", `/api/v1/exercises/history?ids=${ids.join(",")}&limit=${limit}`, as)).json().history;
const count = async (table: string) =>
  ((await t.db.execute(sql.raw(`select count(*)::int as n from ${table}`))).rows[0] as { n: number }).n;

describe("uploading a workout", () => {
  it("stores a finished workout and shows it in the list and the history", async () => {
    const session = doc([entry(bench, 0, 3), entry(plank, 1, 2)]);
    const res = await put(token, session);
    expect(res.statusCode).toBe(200);
    expect(res.json().session).toMatchObject({ clientId: session.clientId, planDayName: "Push", planDayId: null });
    expect(res.json().session.endedAt).toBeTruthy();

    const sessions = await list();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].clientId).toBe(session.clientId);

    const [benchHistory, plankHistory] = await history([bench.id, plank.id]);
    expect(benchHistory.sessions).toHaveLength(1);
    expect(benchHistory.sessions[0].sets.map((s: { weightKg: number; reps: number }) => [s.weightKg, s.reps])).toEqual([[80, 8], [81, 8], [82, 8]]);
    expect(plankHistory.sessions[0].sets[0]).toMatchObject({ weightKg: null, reps: null, durationSeconds: 30 });
  });

  it("uploading the same workout again changes nothing (safe to retry)", async () => {
    const session = doc([entry(bench, 0, 3)]);
    await put(token, session);
    await put(token, session);
    await put(token, session);
    expect(await count("workout_sessions")).toBe(1);
    expect(await count("session_exercises")).toBe(1);
    expect(await count("set_logs")).toBe(3);
  });

  it("an updated upload replaces the exercises and sets", async () => {
    const clientId = randomUUID();
    await put(token, doc([entry(bench, 0, 3), entry(plank, 1, 2)], { clientId, endedAt: null }));
    expect(await count("set_logs")).toBe(5);

    await put(token, doc([entry(bench, 0, 1)], { clientId, endedAt: minutesAgo(1) }));
    expect(await count("workout_sessions")).toBe(1);
    expect(await count("session_exercises")).toBe(1);
    expect(await count("set_logs")).toBe(1);
    expect((await list())[0].endedAt).toBeTruthy();
  });

  it("eight simultaneous uploads of one workout leave exactly one workout", async () => {
    const session = doc([entry(bench, 0, 4)]);
    const results = await Promise.all(Array.from({ length: 8 }, () => put(token, session)));
    expect(results.map((r) => r.statusCode)).toEqual(Array(8).fill(200));
    expect(await count("workout_sessions")).toBe(1);
    expect(await count("session_exercises")).toBe(1);
    expect(await count("set_logs")).toBe(4);
  });

  it("an in-progress workout is stored but is not history until it finishes", async () => {
    const clientId = randomUUID();
    await put(token, doc([entry(bench, 0, 2)], { clientId, endedAt: null }));
    expect(await count("workout_sessions")).toBe(1);
    expect(await list()).toEqual([]);
    expect((await history([bench.id]))[0].sessions).toEqual([]);

    await put(token, doc([entry(bench, 0, 2)], { clientId, endedAt: minutesAgo(1) }));
    expect(await list()).toHaveLength(1);
    expect((await history([bench.id]))[0].sessions).toHaveLength(1);
  });

  it("discarding removes the workout, and discarding again is not an error", async () => {
    const session = doc([entry(bench, 0, 2)]);
    await put(token, session);
    expect((await call(t.app, "DELETE", `/api/v1/sessions/${session.clientId}`, token)).statusCode).toBe(204);
    expect(await count("workout_sessions")).toBe(0);
    expect(await count("set_logs")).toBe(0);
    expect((await call(t.app, "DELETE", `/api/v1/sessions/${session.clientId}`, token)).statusCode).toBe(204);
  });

  it("an ad-hoc workout with no plan day and no exercises yet is fine", async () => {
    expect((await put(token, doc([], { endedAt: null }))).statusCode).toBe(200);
  });
});

describe("what an upload must satisfy", () => {
  it("the id in the URL must match the id in the document", async () => {
    const session = doc([entry(bench, 0, 1)]);
    const res = await call(t.app, "PUT", `/api/v1/sessions/${randomUUID()}`, token, session);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "client_id_mismatch" });
  });

  it("rejects an exercise that does not exist", async () => {
    const res = await put(token, doc([entry({ ...bench, id: randomUUID() }, 0, 1)]));
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "unknown_exercise" });
    expect(await count("workout_sessions")).toBe(0);
  });

  it("rejects sets that don't fit the exercise: seconds on a rep exercise and reps on a timed one", async () => {
    const secondsOnBench = entry(bench, 0, 1);
    secondsOnBench.sets = [{ ...secondsOnBench.sets[0]!, reps: null, durationSeconds: 30, weightKg: null }];
    expect((await put(token, doc([secondsOnBench]))).json()).toEqual({ error: "set_mismatch" });

    const repsOnPlank = entry(plank, 0, 1);
    repsOnPlank.sets = [{ ...repsOnPlank.sets[0]!, reps: 8, durationSeconds: null }];
    expect((await put(token, doc([repsOnPlank]))).json()).toEqual({ error: "set_mismatch" });
    expect(await count("workout_sessions")).toBe(0);
  });

  it("rejects a configuration snapshot the plan rules would refuse", async () => {
    const bad = entry(bench, 0, 1, { progressionMode: "failure", failureTargetReps: 5, targetReps: 10 });
    const res = await put(token, doc([bad]));
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("validation_error");
  });

  it("rejects malformed documents and too many exercises", async () => {
    expect((await put(token, { ...doc([]), startedAt: "yesterday" })).statusCode).toBe(400);
    expect((await put(token, doc([], { endedAt: minutesAgo(120) }))).statusCode).toBe(400);
    const tooMany = Array.from({ length: MAX_SESSION_EXERCISES + 1 }, (_, i) => entry(bench, i, 1));
    expect((await put(token, doc(tooMany))).statusCode).toBe(400);
  });

  it("keeps the plan day link and its name; the name survives deleting the plan", async () => {
    const { planId, dayId } = await planWithDay(t.app, token, "My plan", "Push day");
    const session = doc([entry(bench, 0, 1)], { planDayId: dayId, planDayName: "Push day" });
    expect((await put(token, session)).json().session).toMatchObject({ planDayId: dayId, planDayName: "Push day" });

    await call(t.app, "DELETE", `/api/v1/plans/${planId}`, token);
    const [after] = await list();
    expect(after).toMatchObject({ planDayId: null, planDayName: "Push day" });
  });

  it("stores another user's plan day as no day, without an error that would confirm it exists", async () => {
    const other = await signup(t.app, "other@example.com");
    const { dayId } = await planWithDay(t.app, other);
    const res = await put(token, doc([entry(bench, 0, 1)], { planDayId: dayId }));
    expect(res.statusCode).toBe(200);
    expect(res.json().session.planDayId).toBeNull();
  });
});

describe("listing finished workouts", () => {
  it("newest first, filterable by date, limited", async () => {
    const old = doc([entry(bench, 0, 1)], { startedAt: minutesAgo(60 * 24 * 10), endedAt: minutesAgo(60 * 24 * 10 - 30) });
    const mid = doc([entry(bench, 0, 1)], { startedAt: minutesAgo(60 * 24 * 3), endedAt: minutesAgo(60 * 24 * 3 - 30) });
    const recent = doc([entry(bench, 0, 1)]);
    for (const s of [old, mid, recent]) await put(token, s);

    expect((await list()).map((s: { clientId: string }) => s.clientId)).toEqual([recent.clientId, mid.clientId, old.clientId]);
    const since = encodeURIComponent(minutesAgo(60 * 24 * 5));
    expect((await list(token, `?from=${since}`)).map((s: { clientId: string }) => s.clientId)).toEqual([recent.clientId, mid.clientId]);
    expect(await list(token, "?limit=1")).toHaveLength(1);
    expect((await call(t.app, "GET", "/api/v1/sessions?from=not-a-date", token)).statusCode).toBe(400);
  });
});

describe("exercise history", () => {
  it("returns the last N finished workouts newest first, and skips skipped exercises", async () => {
    const days = [5, 4, 3, 2].map((d) => ({ startedAt: minutesAgo(60 * 24 * d), endedAt: minutesAgo(60 * 24 * d - 30) }));
    const sessions = days.map((when, i) => doc([entry(bench, 0, 1, { sets: [{ ...entry(bench, 0, 1).sets[0]!, weightKg: 60 + i * 5 }] })], when));
    for (const s of sessions) await put(token, s);
    await put(token, doc([entry(bench, 0, 2, { skipped: true })]));

    const [result] = await history([bench.id], 3);
    expect(result.sessions.map((s: { sets: { weightKg: number }[] }) => s.sets[0]!.weightKg)).toEqual([75, 70, 65]);

    const [one] = await history([bench.id], 1);
    expect(one.sessions).toHaveLength(1);
  });

  it("answers for several exercises at once, including ones with no history", async () => {
    await put(token, doc([entry(bench, 0, 2)]));
    const result = await history([bench.id, plank.id]);
    expect(result.find((r: { exerciseId: string }) => r.exerciseId === bench.id).sessions).toHaveLength(1);
    expect(result.find((r: { exerciseId: string }) => r.exerciseId === plank.id).sessions).toEqual([]);
  });

  it("validates the query", async () => {
    expect((await call(t.app, "GET", "/api/v1/exercises/history", token)).statusCode).toBe(400);
    expect((await call(t.app, "GET", "/api/v1/exercises/history?ids=nope", token)).statusCode).toBe(400);
    const tooMany = Array.from({ length: 31 }, () => randomUUID()).join(",");
    expect((await call(t.app, "GET", `/api/v1/exercises/history?ids=${tooMany}`, token)).statusCode).toBe(400);
    expect((await call(t.app, "GET", `/api/v1/exercises/history?ids=${bench.id}&limit=11`, token)).statusCode).toBe(400);
  });
});

describe("one exercise's history", () => {
  const one = async (id: string, query = "", as = token) => call(t.app, "GET", `/api/v1/exercises/${id}/history${query}`, as);

  it("lists finished workouts newest first, with limit", async () => {
    for (const d of [4, 3, 2]) {
      await put(token, doc([entry(bench, 0, 1, { sets: [{ ...entry(bench, 0, 1).sets[0], weightKg: 50 + d }] })], { startedAt: minutesAgo(60 * 24 * d), endedAt: minutesAgo(60 * 24 * d - 30) }));
    }
    await put(token, doc([entry(bench, 0, 2)], { endedAt: null }));
    const res = await one(bench.id);
    expect(res.statusCode).toBe(200);
    expect(res.json().history.exerciseId).toBe(bench.id);
    expect(res.json().history.sessions.map((s: { sets: { weightKg: number }[] }) => s.sets[0]!.weightKg)).toEqual([52, 53, 54]);
    expect((await one(bench.id, "?limit=2")).json().history.sessions).toHaveLength(2);
  });

  it("is empty for an exercise with no history", async () => {
    expect((await one(plank.id)).json().history.sessions).toEqual([]);
  });

  it("validates the id and the limit", async () => {
    expect((await one("nope")).statusCode).toBe(400);
    expect((await one(bench.id, "?limit=201")).statusCode).toBe(400);
    expect((await one(randomUUID())).statusCode).toBe(404);
  });
});

describe("trained exercises", () => {
  const trained = async (as = token) => (await call(t.app, "GET", "/api/v1/exercises/trained", as)).json().exerciseIds;

  it("lists each exercise once, most recently trained first, ignoring skipped and unfinished", async () => {
    await put(token, doc([entry(bench, 0, 2), entry(plank, 1, 2)], { startedAt: minutesAgo(60 * 24 * 3), endedAt: minutesAgo(60 * 24 * 3 - 30) }));
    await put(token, doc([entry(plank, 0, 2)], { startedAt: minutesAgo(60 * 24), endedAt: minutesAgo(60 * 24 - 30) }));
    expect(await trained()).toEqual([plank.id, bench.id]);

    const third = await libraryExercise(t.app, token, false).then(async () => (await call(t.app, "GET", "/api/v1/exercises", token)).json().exercises.find((e: Exercise) => !e.isTimed && e.id !== bench.id));
    await put(token, doc([entry(third, 0, 2, { skipped: true })]));
    await put(token, doc([entry(third, 0, 2)], { endedAt: null }));
    expect(await trained()).toEqual([plank.id, bench.id]);
  });

  it("is empty for someone who has not trained", async () => {
    expect(await trained(await signup(t.app, "new@example.com"))).toEqual([]);
  });
});

describe("deleting a profile", () => {
  it("removes its workouts and custom exercises even when a workout uses one", async () => {
    const custom = (await call(t.app, "POST", "/api/v1/exercises", token, { name: "Sled", muscleGroup: "quads", equipment: "other" })).json().exercise;
    await put(token, doc([entry(custom, 0, 2)]));

    await t.db.delete(profiles).where(eq(profiles.email, "lifter@example.com"));
    expect(await count("workout_sessions")).toBe(0);
    expect(await count("set_logs")).toBe(0);
    expect(await t.db.select().from(exercises).where(eq(exercises.id, custom.id))).toHaveLength(0);
  });

  it("an exercise that a workout used cannot be deleted on its own", async () => {
    const custom = (await call(t.app, "POST", "/api/v1/exercises", token, { name: "Sled", muscleGroup: "quads", equipment: "other" })).json().exercise;
    await put(token, doc([entry(custom, 0, 1)]));
    await expect(t.db.delete(exercises).where(eq(exercises.id, custom.id))).rejects.toThrow();
  });
});
