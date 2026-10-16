# Fitness Tracker

A free, multi-user, mobile-first PWA for tracking a fitness journey: workout
plans, goals, and an in-workout helper (guided set logging, rest timer,
progressive overload hints). The second app in the suite on the owner's VPS,
live at `https://fitness.v1vpa.duckdns.org`.

This file supplements the project root [`../../CLAUDE.md`](../../CLAUDE.md) —
its tutor / co-designer / builder role, pacing rules and guardrails apply here
unchanged. Server-side facts (nginx, certificates, backups, `deploy.sh`) live in
[`../../infra/CLAUDE.md`](../../infra/CLAUDE.md).

## Source material

`handoff/` is the bundle exported from the design chat, kept exactly as given:
`handoff/docs/spec.md` (scope, data model, flows, API, roadmap),
`handoff/design/DESIGN.md` plus ten screen mockups, `handoff/seed/exercises-seed.json`
(62 exercises, English and Hebrew), and the original brief `handoff/CLAUDE.md`.
**Do not edit `handoff/`.** If the build needs a change to the spec or design, say
so and propose it; record accepted differences in "Deviations" below.

## Stack and layout

TypeScript end to end. npm workspaces:

- `shared/` — Zod schemas and types used by both sides (built with `tsc`).
- `api/` — Fastify 5, Zod validation, Drizzle ORM on PostgreSQL. Serves the built
  web app too (one container, one port, same origin, so no CORS).
- `web/` — Vite + React, react-router, react-i18next (English and Hebrew, RTL).

Auth: email + password (argon2id), opaque server-side session in an `HttpOnly`
cookie. Open sign-up, rate-limited auth routes.

## Deviations from handoff/docs/spec.md (decided with the owner)

- **`profiles`, not `users`.** Same pattern as diet-helper: the table holds this
  app's per-person data; `password_hash` is nullable so a future shared identity
  layer / Google OAuth needs no migration.
- **Opaque session cookie instead of JWT + rotating refresh token.** Same-origin
  first-party app: a random id in an `HttpOnly` cookie, stored hashed in
  `auth_sessions`, is simpler, revocable instantly, and equally secure. (The table
  is `auth_sessions` to avoid clashing with the spec's `workout_sessions`.)
- **Only identity tables in milestone 1.** Plans, exercises, workout sessions and
  goals arrive with the milestone that first reads them.

Everything else in the handoff brief stands as a working draft, open to being
re-argued like any other decision in this project.

## Contracts with the infra repo (do not break)

- Compose service for the database is named **`postgres`** and sets
  `POSTGRES_USER` / `POSTGRES_DB`: `infra/backup/pg-backup.sh` dumps through
  `docker compose exec postgres` using exactly those.
- `api` publishes **`127.0.0.1:3001`** only; nginx is the sole public listener.
- Migrations run **inside the production image**:
  `docker compose -f docker-compose.yml run --rm api node api/dist/db/migrate.js`.
  `deploy.sh` does not run them; it is a deliberate manual step.
- Production `.env` is created by hand on the server, never committed. Generate
  secrets with `openssl rand -hex` (URL-safe: a `/` in a database password breaks
  connection-string parsing).

## Working conventions

- Git: see `.claude/skills/git-workflow/SKILL.md` — feature branches, `npm test`
  green before asking to merge, explicit merge approval, no `Co-Authored-By`.
- Tests: the overload-hint function (milestone 5), authorization (a user must never
  read another user's data) and sync idempotency (milestone 4) are required. API
  tests run against a real Postgres (`fitness_test` database), not mocks.
- Mobile-first: 44 px minimum touch targets, large tap targets on the workout
  screen, no hover-only interactions. Logical CSS properties only (RTL from day one).
- Verify the production image, not just dev: native modules and pruned installs
  behave differently there (diet-helper's `sharp` bug).
- Dev: `docker compose up -d postgres` (published on `127.0.0.1:5433`), then
  `npm run dev` on the host. Do not containerize the dev servers.
- UI verification: Playwright is installed **globally** on the owner's machine
  (not a dependency of this repo; browsers are in the shared per-user cache).
  Drive the built app (`npm run build`, then `node api/dist/server.js` with a
  matching `ALLOWED_ORIGINS`) from a throwaway CommonJS script run as
  `NODE_PATH="$(npm root -g)" node script.cjs`, take mobile-size (390x844)
  screenshots and look at them. This caught a real RTL overflow and a sub-44px
  link in milestone 1 that type-checks and unit tests could not.

## Status

Milestone 1 (foundation) in progress. Roadmap: `handoff/docs/spec.md`, "Build
roadmap". Never in the app: social features, nutrition tracking, payments, AI coach
chat.
