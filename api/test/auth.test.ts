import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { authSessions, profiles } from "../src/db/schema.js";
import {
  ORIGIN,
  PASSWORD,
  me,
  makeTestApp,
  post,
  rawSetCookie,
  register,
  resetDb,
  sessionToken,
  type TestApp,
} from "./helpers.js";

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

describe("register", () => {
  it("creates a profile, starts a session and returns the profile without secrets", async () => {
    const { res, token } = await register(t.app, "Ada@Example.com", { displayName: "Ada", language: "he" });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({
      profile: {
        id: expect.any(String),
        email: "ada@example.com",
        displayName: "Ada",
        language: "he",
        weightUnit: "kg",
      },
    });
    expect(JSON.stringify(res.json())).not.toContain("password");
    expect(token).toBeTruthy();
    expect((await me(t.app, token)).json().profile.email).toBe("ada@example.com");
  });

  it("stores an argon2id hash, never the password, and only a hash of the session token", async () => {
    const { token } = await register(t.app, "hash@example.com");
    const [profile] = await t.db.select().from(profiles);
    expect(profile?.passwordHash).toMatch(/^\$argon2id\$/);
    expect(profile?.passwordHash).not.toContain(PASSWORD);

    const [session] = await t.db.select().from(authSessions);
    expect(session?.tokenHash).toBe(createHash("sha256").update(token!).digest("hex"));
    expect(session?.tokenHash).not.toBe(token);
  });

  it("sets an HttpOnly, SameSite=Lax cookie, and Secure only in production", async () => {
    const dev = rawSetCookie((await register(t.app, "dev@example.com")).res);
    expect(dev).toContain("HttpOnly");
    expect(dev).toContain("SameSite=Lax");
    expect(dev).toContain("Path=/");
    expect(dev).not.toContain("Secure");

    const prod = await makeTestApp({ nodeEnv: "production" });
    try {
      const cookie = rawSetCookie((await register(prod.app, "prod@example.com")).res);
      expect(cookie).toContain("Secure");
      expect(cookie).toContain("HttpOnly");
    } finally {
      await prod.close();
    }
  });

  it("treats emails case-insensitively when checking for duplicates", async () => {
    expect((await register(t.app, "dup@example.com")).res.statusCode).toBe(201);
    const second = await register(t.app, "DUP@Example.COM");
    expect(second.res.statusCode).toBe(409);
    expect(second.res.json()).toEqual({ error: "email_taken" });
    expect(second.token).toBeUndefined();
  });

  it("rejects short passwords and malformed emails with field-level issues", async () => {
    const short = await post(t.app, "/api/v1/auth/register", { email: "a@example.com", password: "short" });
    expect(short.statusCode).toBe(400);
    expect(short.json().error).toBe("validation_error");
    expect(short.json().issues[0].path).toBe("password");

    const badEmail = await post(t.app, "/api/v1/auth/register", { email: "not-an-email", password: PASSWORD });
    expect(badEmail.statusCode).toBe(400);
    expect(badEmail.json().issues[0].path).toBe("email");
  });
});

describe("login", () => {
  it("logs in with the right password and starts a new session", async () => {
    await register(t.app, "login@example.com");
    const res = await post(t.app, "/api/v1/auth/login", { email: "LOGIN@example.com", password: PASSWORD });
    expect(res.statusCode).toBe(200);
    const token = sessionToken(res);
    expect(token).toBeTruthy();
    expect((await me(t.app, token)).statusCode).toBe(200);
  });

  it("gives the identical response for a wrong password and an unknown email", async () => {
    await register(t.app, "real@example.com");
    const wrongPassword = await post(t.app, "/api/v1/auth/login", { email: "real@example.com", password: "wrong-password-1" });
    const unknownEmail = await post(t.app, "/api/v1/auth/login", { email: "ghost@example.com", password: "wrong-password-1" });

    expect(wrongPassword.statusCode).toBe(401);
    expect(unknownEmail.statusCode).toBe(401);
    expect(wrongPassword.body).toBe(unknownEmail.body);
    expect(wrongPassword.json()).toEqual({ error: "invalid_credentials" });
    expect(sessionToken(wrongPassword)).toBeUndefined();
    expect(sessionToken(unknownEmail)).toBeUndefined();
  });

  it("treats an account with no password (future OAuth-only) like a wrong password", async () => {
    await t.db.insert(profiles).values({ email: "oauth@example.com", passwordHash: null });
    const res = await post(t.app, "/api/v1/auth/login", { email: "oauth@example.com", password: PASSWORD });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "invalid_credentials" });
  });
});

describe("protected route and sessions", () => {
  it("rejects requests with no cookie, a garbage cookie, or a tampered token", async () => {
    const { token } = await register(t.app, "guard@example.com");
    expect((await me(t.app)).statusCode).toBe(401);
    expect((await me(t.app, "garbage")).statusCode).toBe(401);
    expect((await me(t.app, token + "x")).statusCode).toBe(401);
    expect((await me(t.app, token)).statusCode).toBe(200);
  });

  it("each user's cookie returns only that user's own profile", async () => {
    const a = await register(t.app, "a@example.com", { displayName: "Alice" });
    const b = await register(t.app, "b@example.com", { displayName: "Bob" });

    const asA = (await me(t.app, a.token)).json().profile;
    const asB = (await me(t.app, b.token)).json().profile;
    expect(asA.email).toBe("a@example.com");
    expect(asB.email).toBe("b@example.com");
    expect(asA.id).not.toBe(asB.id);
    expect(JSON.stringify(asA)).not.toContain("b@example.com");
  });

  it("rejects an expired session", async () => {
    const { token } = await register(t.app, "expired@example.com");
    await t.db.update(authSessions).set({ expiresAt: new Date(Date.now() - 1000) });
    expect((await me(t.app, token)).statusCode).toBe(401);
  });

  it("logout deletes the session server-side, so a copied cookie stops working", async () => {
    const { token } = await register(t.app, "out@example.com");
    const res = await post(t.app, "/api/v1/auth/logout", undefined, { cookie: `sid=${token}` });
    expect(res.statusCode).toBe(204);
    expect(rawSetCookie(res)).toContain("sid=;");
    expect(await t.db.select().from(authSessions)).toHaveLength(0);
    expect((await me(t.app, token)).statusCode).toBe(401);
  });

  it("logout without a session is a harmless no-op", async () => {
    expect((await post(t.app, "/api/v1/auth/logout")).statusCode).toBe(204);
  });

  it("extends the sliding expiry at most once a day and refreshes the cookie", async () => {
    const { token } = await register(t.app, "slide@example.com");
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    await t.db.update(authSessions).set({ lastUsedAt: twoDaysAgo, expiresAt: new Date(Date.now() + 60_000) });

    const res = await me(t.app, token);
    expect(res.statusCode).toBe(200);
    expect(sessionToken(res)).toBe(token);

    const [session] = await t.db.select().from(authSessions);
    expect(session!.expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * 24 * 60 * 60 * 1000);

    // Used again right away: no second write, no new cookie.
    const again = await me(t.app, token);
    expect(sessionToken(again)).toBeUndefined();
  });

  it("deleting a profile removes its sessions", async () => {
    await register(t.app, "gone@example.com");
    await t.db.delete(profiles).where(eq(profiles.email, "gone@example.com"));
    const result = await t.db.execute(sql`select count(*)::int as count from auth_sessions`);
    expect((result.rows as { count: number }[])[0]?.count).toBe(0);
  });
});

describe("request guards", () => {
  it("rejects state-changing requests from a foreign or missing Origin", async () => {
    const foreign = await post(t.app, "/api/v1/auth/login", { email: "a@example.com", password: PASSWORD }, { origin: "https://evil.example" });
    expect(foreign.statusCode).toBe(403);
    expect(foreign.json()).toEqual({ error: "forbidden_origin" });

    const missing = await t.app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email: "a@example.com", password: PASSWORD } });
    expect(missing.statusCode).toBe(403);
  });

  it("allows GET without an Origin and serves health", async () => {
    const res = await t.app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("accepts only JSON bodies", async () => {
    const res = await t.app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: "email=a%40example.com&password=x",
      headers: { origin: ORIGIN, "content-type": "application/x-www-form-urlencoded" },
    });
    expect(res.statusCode).toBe(415);
    const plain = await t.app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: "hello",
      headers: { origin: ORIGIN, "content-type": "text/plain" },
    });
    expect(plain.statusCode).toBe(415);
  });
});

describe("rate limiting", () => {
  it("returns 429 after the configured number of login attempts", async () => {
    const limited = await makeTestApp({
      rateLimits: {
        login: { max: 3, timeWindow: "1 minute" },
        register: { max: 2, timeWindow: "1 minute" },
      },
    });
    try {
      const attempt = () => post(limited.app, "/api/v1/auth/login", { email: "x@example.com", password: "wrong-password-1" });
      expect((await attempt()).statusCode).toBe(401);
      expect((await attempt()).statusCode).toBe(401);
      expect((await attempt()).statusCode).toBe(401);
      const blocked = await attempt();
      expect(blocked.statusCode).toBe(429);
      expect(blocked.json()).toEqual({ error: "rate_limited" });

      const reg = () => post(limited.app, "/api/v1/auth/register", { email: `r${Math.random()}@example.com`, password: PASSWORD });
      expect((await reg()).statusCode).toBe(201);
      expect((await reg()).statusCode).toBe(201);
      expect((await reg()).statusCode).toBe(429);
    } finally {
      await limited.close();
    }
  });
});
