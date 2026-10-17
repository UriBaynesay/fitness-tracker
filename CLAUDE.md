# Fitness Tracker

A free, multi-user, mobile-first PWA for tracking a fitness journey: workout
plans, goals, and an in-workout helper (guided set logging, rest timer,
progressive overload hints). The second app in the suite on the owner's VPS,
live at `https://fitness.v1vpa.duckdns.org`.

This file supplements the project root [`../../CLAUDE.md`](../../CLAUDE.md) —
its tutor / co-designer / builder role, pacing rules and guardrails apply here
unchanged. Server-side facts (nginx, certificates, `deploy.sh`) live in
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
- **Timed exercises store seconds.** `plan_exercises.target_duration_seconds`
  (spec has only `target_reps`): a timed exercise has seconds and no reps, weight
  step or failure mode; a rep exercise has reps and no seconds. One shared Zod
  refinement (`planExerciseConfigFor` in `shared/`) enforces it, since a CHECK can't
  see `exercises.is_timed`.
- **Plans autosave through small endpoints** (`/plan-days/:id`, `/plan-exercises/:id`,
  each answering with the whole plan) instead of the spec's one nested payload; the
  mockups have no Save button.
- **A custom exercise has one name**, written to both language columns.
- **Minimal Settings in milestone 2** (language, weight unit, name; the spec has the
  screen in milestone 7, account deletion still waits for it).
- **No nightly database backup.** The handoff lists one in milestone 1; the owner
  does not want database backups for any app. Do not add or propose them.

Everything else in the handoff brief stands as a working draft, open to being
re-argued like any other decision in this project.

## Contracts with the infra repo (do not break)

- `api` publishes **`127.0.0.1:3001`** only; nginx is the sole public listener.
- Migrations run **inside the production image**:
  `docker compose -f docker-compose.yml run --rm api node api/dist/db/migrate.js`.
  It also seeds the exercise library (idempotent upsert by slug from
  `api/seed/exercises.json`, a copy of the handoff list), so it is safe on every
  deploy. `deploy.sh` does not run it; it is a deliberate manual step.
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

- Ordered children (days in a plan, exercises in a day) get their position under a
  row lock (`SELECT ... FOR UPDATE` on the parent) so simultaneous additions can't
  collide; keep that for any new ordered collection. Another user's id is always a
  404, never a 403 (`api/src/plans/ownership.ts` is the only way to look rows up).
- The exercise -> plan_exercise foreign key is `DEFERRABLE INITIALLY DEFERRED`
  (hand-edited into migration 0001; drizzle can't express it) so deleting a profile
  can cascade through plans and custom exercises in one statement.

## Status

Milestone 1 (foundation) is live. Milestone 2 (exercise library and plan builder)
is merged, undeployed. Milestone 3 (live workout) is built on `feature/m3-workout`:
local-first (workout lives in IndexedDB via Dexie, pushed through the idempotent
`PUT /api/v1/sessions/:clientId`; sync retries on change, start-up, `online`),
Today screen with plan rotation and week strip, guided set logging, rest timer from
an end timestamp, resume after reload, skip/reorder/add mid-workout, summary. Device
alert settings (sound, vibration, keep screen on) are per device in localStorage.
Milestone 4 (PWA) is built on `feature/m4-pwa`: vite-plugin-pwa/Workbox precaches the
whole build and answers navigations with index.html (never `/api`; API data is cached by
the app itself in IndexedDB), installable manifest + icons (`web/public`, rendered from
`icon.svg`), cold start offline keeps the last profile (`auth/offline.ts`), failed uploads
retry with backoff (5 s, 30 s, 2 min, 5 min), storage persistence is requested when a
workout starts.
Milestone 5 (hints and progress) is built on `feature/m5-hints`: the overload rule is one
pure function (`shared/src/hints.ts`, deload / add weight / one more rep / failure-set
rules; "failure goal reached in N sessions" counts only sessions at the same weight, our
assumption), computed once when a workout starts from the last 3 sessions and used to
prefill the steppers (after a set the weight follows what was actually lifted). Progress
screen (`/progress`, lazy-loaded Recharts chart, Weight / Reps / Est. 1RM / Duration, recent
workouts) reads `GET /exercises/:id/history` and `GET /exercises/trained`; hint numbers
are isolated left-to-right inside Hebrew sentences.
Milestone 6 (goals) is built on `feature/m6-goals`: `goals` table (migration 0003, deferrable
exercise FK), one goal per exercise + metric, start value captured from the person's best at
creation, no deadline and no stored status (progress is derived on read, `shared/src/goals.ts`),
`GET/POST/PATCH/DELETE /goals` (best computed server-side), Goals tab; changes need a
connection, the list is cached on the device for offline reading.
The owner deploys once, after the whole app is finished (no per-milestone deploys).
See `git log`. Roadmap: `handoff/docs/spec.md`, "Build
roadmap". Never in the app: social features, nutrition tracking, payments, AI coach
chat.
