import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { defaultPlanExerciseConfig } from "@fitness/shared";
import { authSessions, exercises, goals, planExercises, plans, profiles, setLogs, workoutSessions } from "../src/db/schema.js";
import { PASSWORD, call, libraryExercise, makeTestApp, me, planWithDay, resetDb, signup, type TestApp } from "./helpers.js";

let t: TestApp;

beforeAll(async () => {
  t = await makeTestApp();
});
afterAll(async () => {
  await t.close();
});
beforeEach(async () => {
  await resetDb(t.db);
});

const remove = (token: string | undefined, password: unknown) => call(t.app, "DELETE", "/api/v1/me", token, { password });

// Gives an account a bit of everything: plan, custom exercise used by a plan, a workout, a goal.
async function populate(token: string) {
  const lib = await libraryExercise(t.app, token, false);
  const custom = (await call(t.app, "POST", "/api/v1/exercises", token, { name: "Sled", muscleGroup: "quads", equipment: "other" })).json().exercise;
  const { dayId } = await planWithDay(t.app, token);
  await call(t.app, "POST", `/api/v1/plan-days/${dayId}/exercises`, token, { exerciseId: custom.id });
  const clientId = randomUUID();
  const now = Date.now();
  await call(t.app, "PUT", `/api/v1/sessions/${clientId}`, token, {
    clientId,
    planDayId: dayId,
    planDayName: "Day 1",
    startedAt: new Date(now - 3_600_000).toISOString(),
    endedAt: new Date(now).toISOString(),
    exercises: [
      {
        ...defaultPlanExerciseConfig(false, "kg"),
        clientId: randomUUID(),
        exerciseId: custom.id,
        position: 0,
        skipped: false,
        sets: [{ clientId: randomUUID(), setNumber: 1, weightKg: 50, reps: 10, durationSeconds: null, toFailure: false, completedAt: new Date(now - 60_000).toISOString() }],
      },
    ],
  });
  await call(t.app, "POST", "/api/v1/goals", token, { exerciseId: lib.id, metric: "weight", target: 100 });
  await call(t.app, "POST", "/api/v1/goals", token, { exerciseId: custom.id, metric: "weight", target: 200 });
}

describe("DELETE /me", () => {
  it("removes the account and everything it owns, in one go", async () => {
    const token = await signup(t.app, "leaving@example.com");
    await populate(token);

    const res = await remove(token, PASSWORD);
    expect(res.statusCode).toBe(204);

    for (const table of [profiles, plans, planExercises, workoutSessions, setLogs, goals, authSessions]) {
      expect(await t.db.select().from(table)).toHaveLength(0);
    }
    expect(await t.db.select().from(exercises).where(eq(exercises.slug, "sled"))).toHaveLength(0);
  });

  it("ends the session: the cookie no longer works and is cleared", async () => {
    const token = await signup(t.app, "leaving@example.com");
    const res = await remove(token, PASSWORD);
    expect(String(res.headers["set-cookie"])).toMatch(/sid=;/);
    expect((await me(t.app, token)).statusCode).toBe(401);
  });

  it("leaves other people and the shared library alone", async () => {
    const leaving = await signup(t.app, "leaving@example.com");
    const staying = await signup(t.app, "staying@example.com");
    await populate(leaving);
    await populate(staying);
    const libraryBefore = (await t.db.select().from(exercises)).filter((e) => e.ownerId === null).length;

    await remove(leaving, PASSWORD);

    expect((await me(t.app, staying)).statusCode).toBe(200);
    expect((await call(t.app, "GET", "/api/v1/goals", staying)).json().goals).toHaveLength(2);
    expect((await call(t.app, "GET", "/api/v1/sessions", staying)).json().sessions).toHaveLength(1);
    expect((await t.db.select().from(exercises)).filter((e) => e.ownerId === null)).toHaveLength(libraryBefore);
  });

  it("frees the email for a new account", async () => {
    const token = await signup(t.app, "again@example.com");
    await remove(token, PASSWORD);
    expect(await signup(t.app, "again@example.com")).toBeTruthy();
  });

  it("refuses a wrong password and deletes nothing", async () => {
    const token = await signup(t.app, "stays@example.com");
    await populate(token);
    const res = await remove(token, "not the password at all");
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: "invalid_credentials" });
    expect((await me(t.app, token)).statusCode).toBe(200);
    expect(await t.db.select().from(goals)).toHaveLength(2);
  });

  it("needs a password in the body and a signed-in user", async () => {
    const token = await signup(t.app, "x@example.com");
    expect((await call(t.app, "DELETE", "/api/v1/me", token, {})).statusCode).toBe(400);
    expect((await remove(undefined, PASSWORD)).statusCode).toBe(401);
  });

  it("is rate limited like login, since it checks passwords", async () => {
    const limited = await makeTestApp({
      rateLimits: { login: { max: 2, timeWindow: "1 minute" }, register: { max: 100, timeWindow: "1 minute" } },
    });
    try {
      const token = await signup(limited.app, "limited@example.com");
      const attempt = () => call(limited.app, "DELETE", "/api/v1/me", token, { password: "wrong password here" });
      expect((await attempt()).statusCode).toBe(403);
      expect((await attempt()).statusCode).toBe(403);
      expect((await attempt()).statusCode).toBe(429);
    } finally {
      await limited.close();
    }
  });
});
