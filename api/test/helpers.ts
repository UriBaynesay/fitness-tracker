import type { FastifyInstance } from "fastify";
import type { Exercise } from "@fitness/shared";
import { buildApp, DEFAULT_RATE_LIMITS } from "../src/app.js";
import type { Config } from "../src/config.js";
import { createDb, type Db } from "../src/db/index.js";
import { profiles } from "../src/db/schema.js";
import type { RateLimitOptions } from "../src/routes/auth.js";

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://fitness:changeme@localhost:5433/fitness_test";

export const ORIGIN = "http://localhost:5173";

export const PASSWORD = "correct horse battery staple";

export interface TestApp {
  app: FastifyInstance;
  db: Db;
  close: () => Promise<void>;
}

export async function makeTestApp(
  overrides: {
    nodeEnv?: Config["NODE_ENV"];
    rateLimits?: { login: RateLimitOptions; register: RateLimitOptions };
  } = {}
): Promise<TestApp> {
  const { db, pool } = createDb(TEST_DATABASE_URL);
  const config: Config = {
    NODE_ENV: overrides.nodeEnv ?? "test",
    HOST: "127.0.0.1",
    PORT: 0,
    DATABASE_URL: TEST_DATABASE_URL,
    ALLOWED_ORIGINS: [ORIGIN],
    TRUST_PROXY: false,
    LOG_LEVEL: "silent",
  };
  const app = await buildApp({
    config,
    db,
    webDist: null,
    // Effectively unlimited unless a test is about the limiter itself.
    rateLimits: overrides.rateLimits ?? {
      login: { max: 10_000, timeWindow: "1 minute" },
      register: { max: 10_000, timeWindow: "1 minute" },
    },
  });
  await app.ready();
  return {
    app,
    db,
    close: async () => {
      await app.close();
      await pool.end();
    },
  };
}

// Deleting profiles cascades to sessions, plans, days, plan exercises and custom
// exercises. TRUNCATE ... CASCADE would also empty the seeded exercise library
// (its owner_id column references profiles), which every test relies on.
export async function resetDb(db: Db): Promise<void> {
  await db.delete(profiles);
}

export function post(app: FastifyInstance, url: string, payload?: unknown, headers: Record<string, string> = {}) {
  return app.inject({
    method: "POST",
    url,
    payload: payload as object | undefined,
    headers: { origin: ORIGIN, ...headers },
  });
}

// "sid=abc; Path=/; HttpOnly" -> "abc"
export function sessionToken(res: { headers: Record<string, unknown> }): string | undefined {
  const raw = res.headers["set-cookie"];
  const first = Array.isArray(raw) ? raw.find((c) => String(c).startsWith("sid=")) : raw;
  const match = /^sid=([^;]*)/.exec(String(first ?? ""));
  return match?.[1] || undefined;
}

export function rawSetCookie(res: { headers: Record<string, unknown> }): string {
  const raw = res.headers["set-cookie"];
  return String(Array.isArray(raw) ? raw[0] : (raw ?? ""));
}

export async function register(app: FastifyInstance, email: string, extra: Record<string, unknown> = {}) {
  const res = await post(app, "/api/v1/auth/register", { email, password: PASSWORD, ...extra });
  return { res, token: sessionToken(res) };
}

export function me(app: FastifyInstance, token?: string) {
  return app.inject({
    method: "GET",
    url: "/api/v1/me",
    headers: token ? { cookie: `sid=${token}` } : {},
  });
}

// Any request as a signed-in user. Non-GET requests carry the Origin header the
// CSRF guard requires, exactly as a browser would send it.
export function call(
  app: FastifyInstance,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  url: string,
  token?: string,
  payload?: unknown
) {
  return app.inject({
    method,
    url,
    payload: payload as object | undefined,
    headers: {
      ...(token ? { cookie: `sid=${token}` } : {}),
      ...(method === "GET" ? {} : { origin: ORIGIN }),
    },
  });
}

export async function signup(app: FastifyInstance, email: string, extra: Record<string, unknown> = {}): Promise<string> {
  const { token } = await register(app, email, extra);
  if (!token) throw new Error(`could not register ${email}`);
  return token;
}

export async function listExercises(app: FastifyInstance, token: string): Promise<Exercise[]> {
  return (await call(app, "GET", "/api/v1/exercises", token)).json().exercises;
}

// A seeded exercise by kind: a rep-based one or a timed one.
export async function libraryExercise(app: FastifyInstance, token: string, timed = false): Promise<Exercise> {
  const found = (await listExercises(app, token)).find((e) => !e.isCustom && e.isTimed === timed);
  if (!found) throw new Error("seeded library is empty");
  return found;
}

// A plan with one day, ready for exercises.
export async function planWithDay(app: FastifyInstance, token: string, planName = "Plan", dayName = "Day 1") {
  const plan = (await call(app, "POST", "/api/v1/plans", token, { name: planName })).json().plan;
  const withDay = (await call(app, "POST", `/api/v1/plans/${plan.id}/days`, token, { name: dayName })).json().plan;
  return { planId: plan.id as string, dayId: withDay.days[0].id as string };
}

export { DEFAULT_RATE_LIMITS };
