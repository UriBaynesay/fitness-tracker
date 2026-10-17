import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { call, makeTestApp, resetDb, signup, type TestApp } from "./helpers.js";

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
  token = await signup(t.app, "settings@example.com", { displayName: "Dana" });
});

const patch = (body: unknown) => call(t.app, "PATCH", "/api/v1/me", token, body);

describe("PATCH /me (settings)", () => {
  it("changes language and weight unit and returns the updated profile", async () => {
    const res = await patch({ language: "he", weightUnit: "lb" });
    expect(res.statusCode).toBe(200);
    expect(res.json().profile).toMatchObject({ language: "he", weightUnit: "lb", displayName: "Dana" });

    const me = (await call(t.app, "GET", "/api/v1/me", token)).json().profile;
    expect(me).toMatchObject({ language: "he", weightUnit: "lb" });
  });

  it("changes the display name and clears it with null", async () => {
    expect((await patch({ displayName: "  Dani  " })).json().profile.displayName).toBe("Dani");
    expect((await patch({ displayName: null })).json().profile.displayName).toBeNull();
  });

  it("rejects empty updates and unsupported values", async () => {
    expect((await patch({})).statusCode).toBe(400);
    expect((await patch({ language: "fr" })).statusCode).toBe(400);
    expect((await patch({ weightUnit: "stone" })).statusCode).toBe(400);
    expect((await patch({ displayName: "   " })).statusCode).toBe(400);
  });

  it("cannot change the email or password through this route", async () => {
    await patch({ language: "he", email: "other@example.com", passwordHash: "x" });
    const me = (await call(t.app, "GET", "/api/v1/me", token)).json().profile;
    expect(me.email).toBe("settings@example.com");
  });

  it("changing the unit does not rewrite stored weights, only how they are shown", async () => {
    const { planId } = await (async () => {
      const plan = (await call(t.app, "POST", "/api/v1/plans", token, { name: "P" })).json().plan;
      const day = (await call(t.app, "POST", `/api/v1/plans/${plan.id}/days`, token, { name: "D" })).json().plan.days[0];
      const ex = (await call(t.app, "GET", "/api/v1/exercises", token)).json().exercises.find((e: { isTimed: boolean }) => !e.isTimed);
      await call(t.app, "POST", `/api/v1/plan-days/${day.id}/exercises`, token, { exerciseId: ex.id });
      return { planId: plan.id as string };
    })();
    const kgStep = (await call(t.app, "GET", `/api/v1/plans/${planId}`, token)).json().plan.days[0].exercises[0].weightStepKg;
    await patch({ weightUnit: "lb" });
    const afterStep = (await call(t.app, "GET", `/api/v1/plans/${planId}`, token)).json().plan.days[0].exercises[0].weightStepKg;
    expect(afterStep).toBe(kgStep);
  });
});
