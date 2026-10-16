import { sql } from "drizzle-orm";
import { check, customType, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// Case-insensitive text: "A@x.com" and "a@x.com" are the same account. Needs the
// citext extension, which the first migration creates.
const citext = customType<{ data: string }>({
  dataType() {
    return "citext";
  },
});

export const profiles = pgTable(
  "profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: citext("email").notNull().unique(),
    // Nullable on purpose: room for an account with no password of its own
    // (Google OAuth later). Login treats a null hash like a wrong password.
    passwordHash: text("password_hash"),
    displayName: text("display_name"),
    weightUnit: text("weight_unit", { enum: ["kg", "lb"] }).notNull().default("kg"),
    language: text("language", { enum: ["en", "he"] }).notNull().default("en"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("profiles_weight_unit_check", sql`${t.weightUnit} in ('kg', 'lb')`),
    check("profiles_language_check", sql`${t.language} in ('en', 'he')`),
  ]
);

// Named auth_sessions to stay distinct from the spec's workout_sessions.
export const authSessions = pgTable(
  "auth_sessions",
  {
    // sha256 of the cookie value: a leaked database does not leak live sessions.
    tokenHash: text("token_hash").primaryKey(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    userAgent: text("user_agent"),
  },
  (t) => [
    index("auth_sessions_profile_id_idx").on(t.profileId),
    index("auth_sessions_expires_at_idx").on(t.expiresAt),
  ]
);

export type ProfileRow = typeof profiles.$inferSelect;
