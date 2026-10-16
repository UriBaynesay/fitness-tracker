import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { authSessions, profiles, type ProfileRow } from "../db/schema.js";

export const SESSION_COOKIE = "sid";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
// Sliding expiry, but written at most once a day so reads stay reads.
const TOUCH_AFTER_MS = 24 * 60 * 60 * 1000;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(
  db: Db,
  profileId: string,
  userAgent: string | undefined
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);

  // Opportunistic cleanup: no scheduler needed at this scale.
  await db.delete(authSessions).where(lt(authSessions.expiresAt, now));
  await db.insert(authSessions).values({
    tokenHash: hashToken(token),
    profileId,
    createdAt: now,
    lastUsedAt: now,
    expiresAt,
    userAgent: userAgent?.slice(0, 300) ?? null,
  });

  return { token, expiresAt };
}

export interface SessionLookup {
  profile: ProfileRow;
  // Set when the sliding expiry was extended, so the caller can refresh the cookie.
  extendedUntil: Date | null;
}

export async function findSession(db: Db, token: string): Promise<SessionLookup | null> {
  const now = new Date();
  const [row] = await db
    .select({ session: authSessions, profile: profiles })
    .from(authSessions)
    .innerJoin(profiles, eq(profiles.id, authSessions.profileId))
    .where(and(eq(authSessions.tokenHash, hashToken(token)), gt(authSessions.expiresAt, now)))
    .limit(1);

  if (!row) return null;

  let extendedUntil: Date | null = null;
  if (now.getTime() - row.session.lastUsedAt.getTime() > TOUCH_AFTER_MS) {
    extendedUntil = new Date(now.getTime() + SESSION_TTL_MS);
    await db
      .update(authSessions)
      .set({ lastUsedAt: now, expiresAt: extendedUntil })
      .where(eq(authSessions.tokenHash, row.session.tokenHash));
  }

  return { profile: row.profile, extendedUntil };
}

export async function deleteSession(db: Db, token: string): Promise<void> {
  await db.delete(authSessions).where(eq(authSessions.tokenHash, hashToken(token)));
}
