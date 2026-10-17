import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { deleteAccountBodySchema, loginBodySchema, registerBodySchema, updateMeBodySchema, type Profile } from "@fitness/shared";
import type { Config } from "../config.js";
import type { Db } from "../db/index.js";
import { profiles, type ProfileRow } from "../db/schema.js";
import { hashPassword, verifyAgainstDummy, verifyPassword } from "../auth/password.js";
import {
  SESSION_COOKIE,
  SESSION_TTL_MS,
  createSession,
  deleteSession,
  findSession,
} from "../auth/sessions.js";
import { HttpError } from "../http/errors.js";

export interface RateLimitOptions {
  max: number;
  timeWindow: string | number;
}

export interface AuthRouteDeps {
  db: Db;
  config: Config;
  rateLimits: { login: RateLimitOptions; register: RateLimitOptions };
}

// What the non-auth routes need: the database and config, to resolve the caller.
export type RouteDeps = Pick<AuthRouteDeps, "db" | "config">;

export function toProfileDto(row: ProfileRow): Profile {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    language: row.language,
    weightUnit: row.weightUnit,
  };
}

function setSessionCookie(reply: FastifyReply, token: string, secure: boolean): void {
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

// Resolves the logged-in profile or throws 401. Refreshes the cookie when the
// sliding expiry was extended, so browser and database agree on the lifetime.
export async function requireProfile(
  deps: Pick<AuthRouteDeps, "db" | "config">,
  request: FastifyRequest,
  reply: FastifyReply
): Promise<ProfileRow> {
  const token = request.cookies[SESSION_COOKIE];
  const found = token ? await findSession(deps.db, token) : null;
  if (!token || !found) throw new HttpError(401, "unauthorized");
  if (found.extendedUntil) setSessionCookie(reply, token, deps.config.NODE_ENV === "production");
  return found.profile;
}

export function registerAuthRoutes(app: FastifyInstance, deps: AuthRouteDeps): void {
  const { db, config, rateLimits } = deps;
  const secure = config.NODE_ENV === "production";

  app.post(
    "/api/v1/auth/register",
    { config: { rateLimit: rateLimits.register } },
    async (request, reply) => {
      const body = registerBodySchema.parse(request.body);
      const passwordHash = await hashPassword(body.password);

      const [row] = await db
        .insert(profiles)
        .values({
          email: body.email,
          passwordHash,
          displayName: body.displayName ?? null,
          language: body.language,
        })
        .onConflictDoNothing({ target: profiles.email })
        .returning();

      // Registration does reveal that an email is taken (the user needs to know);
      // login, below, never does.
      if (!row) throw new HttpError(409, "email_taken");

      const session = await createSession(db, row.id, request.headers["user-agent"]);
      setSessionCookie(reply, session.token, secure);
      return reply.code(201).send({ profile: toProfileDto(row) });
    }
  );

  app.post(
    "/api/v1/auth/login",
    { config: { rateLimit: rateLimits.login } },
    async (request, reply) => {
      const body = loginBodySchema.parse(request.body);
      const row = await db.query.profiles.findFirst({ where: eq(profiles.email, body.email) });

      let valid = false;
      if (row?.passwordHash) {
        valid = await verifyPassword(row.passwordHash, body.password);
      } else {
        await verifyAgainstDummy(body.password);
      }
      // One error for unknown email, no password set, and wrong password.
      if (!row || !valid) throw new HttpError(401, "invalid_credentials");

      const session = await createSession(db, row.id, request.headers["user-agent"]);
      setSessionCookie(reply, session.token, secure);
      return { profile: toProfileDto(row) };
    }
  );

  app.post("/api/v1/auth/logout", async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE];
    if (token) await deleteSession(db, token);
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return reply.code(204).send();
  });

  app.get("/api/v1/me", async (request, reply) => {
    const profile = await requireProfile(deps, request, reply);
    return { profile: toProfileDto(profile) };
  });

  // Permanently deletes the account and everything it owns. The foreign keys cascade
  // (sessions, plans, workouts, goals, custom exercises), so one statement is enough.
  // It checks a password, so it shares the login rate limit.
  app.delete("/api/v1/me", { config: { rateLimit: rateLimits.login } }, async (request, reply) => {
    const profile = await requireProfile(deps, request, reply);
    const body = deleteAccountBodySchema.parse(request.body);
    if (!profile.passwordHash || !(await verifyPassword(profile.passwordHash, body.password))) {
      throw new HttpError(403, "invalid_credentials");
    }
    await db.delete(profiles).where(eq(profiles.id, profile.id));
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return reply.code(204).send();
  });

  // Settings: language, weight unit, display name. Weights are stored in kg, so
  // changing the unit only changes how they are shown.
  app.patch("/api/v1/me", async (request, reply) => {
    const profile = await requireProfile(deps, request, reply);
    const body = updateMeBodySchema.parse(request.body);
    const [row] = await db
      .update(profiles)
      .set({
        ...(body.displayName !== undefined ? { displayName: body.displayName } : {}),
        ...(body.language !== undefined ? { language: body.language } : {}),
        ...(body.weightUnit !== undefined ? { weightUnit: body.weightUnit } : {}),
      })
      .where(eq(profiles.id, profile.id))
      .returning();
    return { profile: toProfileDto(row!) };
  });
}
