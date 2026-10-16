import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { buildApp, DEFAULT_RATE_LIMITS } from "../src/app.js";
import type { Config } from "../src/config.js";
import { createDb, type Db } from "../src/db/index.js";
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

export async function resetDb(db: Db): Promise<void> {
  await db.execute(sql`truncate table auth_sessions, profiles restart identity cascade`);
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

export { DEFAULT_RATE_LIMITS };
