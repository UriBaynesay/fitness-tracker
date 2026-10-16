# Fitness Tracker: Data Model & Architecture

Last updated: 2026-10-16

## Scope & decisions

The MVP is a free, multi-user, mobile-first PWA where a person builds workout plans, runs them in a guided session at the gym, and sees progress against goals.

| Decision | Choice |
| --- | --- |
| Audience | Multi-user, free, personal accounts (no billing, no teams) |
| Platform | Mobile-first installable PWA; desktop works but is secondary |
| In-workout helper | Guided set/rep logging, auto rest timers, progressive overload hints |
| Data ownership | Each user sees only their own data (row-level scoping by `user_id`) |
| Connectivity | Must work with a weak or lost gym connection: log offline, sync later |

**MVP features**

- Open sign-up (anyone with the app URL can register) and login
- Language per user: English or Hebrew, chosen in settings; Hebrew switches the whole layout to right-to-left
- Exercise library (seeded, plus user-created exercises)
- Workout plans: a plan has days, a day has ordered exercises with target sets, reps and rest
- Live workout session: step through exercises, log weight and reps per set, rest timer between sets
- Overload hint per exercise, based on the last sessions
- Goals (a target weight, reps or duration per exercise) with a progress view
- History: past sessions and per-exercise charts

**Never part of the app:** social features, nutrition tracking, payments, AI coach chat.

**Planned for later (not in v1):** body weight tracking and wearable sync.

There is deliberately no elapsed-workout timer. Only the rest timer matters.

## Architecture

Every set is saved on the phone first and synced to the server later, so a weak gym signal never blocks a workout.

Diagram in words: on the phone (installable PWA) the screens talk to the workout logic (rest timer, overload hint); both read and write the local database (IndexedDB, works offline); a sync queue (service worker, retries) pushes batches to the server. On the server the API (auth, validation, sync endpoint) is the only writer to Postgres, the source of truth.

The local database is the first stop for every write; the sync queue pushes batches to the API whenever a connection exists.

| Layer | Proposed choice | Why |
| --- | --- | --- |
| Frontend | React + Vite, TypeScript, installable PWA (manifest + service worker) | Fast to build, strong offline tooling |
| Local data | IndexedDB through Dexie | Offline logging and the sync queue |
| API | Node.js + TypeScript, Fastify, Zod validation | One language end to end, small framework, good for learning backend fundamentals |
| Database | PostgreSQL with a migration tool (Drizzle or Prisma) | Relational data with real constraints |
| Auth | Email and password, short-lived JWT plus refresh cookie | No third-party dependency |
| Hosting | Your own VPS, deployed alongside your other apps, with daily database backups | Cheap to run a free app |
| Charts | A light chart library (Recharts or uPlot) | Per-exercise progress and goal views |

Because hosting is a self-managed VPS: plan a nightly Postgres dump and a reverse proxy (Caddy or Nginx) with automatic HTTPS certificates as part of the foundation milestone.

## Data model

Postgres with 9 tables in three groups: planning (what you intend to do), logging (what you did), and goals. Every user-owned table carries `user_id`; all IDs are UUIDs; timestamps are `timestamptz`.

**Planning**

| Table | Key fields | Notes |
| --- | --- | --- |
| `users` | id, email, password_hash, display_name, weight_unit (kg/lb), language (en/he), created_at | Unit preference applies to all display; store weights in kg |
| `exercises` | id, owner_id (null = global), slug, name_en, name_he, muscle_group, equipment, is_timed | Seeded from a 62-exercise list with English and Hebrew names (`seed/exercises-seed.json`); users add their own |
| `plans` | id, user_id, name, notes, is_active, created_at | One user can keep several, one active |
| `plan_days` | id, plan_id, name, position | e.g. Push, Pull, Legs |
| `plan_exercises` | id, plan_day_id, exercise_id, position, target_sets, target_reps, rest_seconds, progression_mode, failure_target_reps (mode 2 only), sessions_to_confirm, weight_step_kg | Target reps and progression_mode drive the overload hint; both are set per exercise in the plan |

**Logging**

| Table | Key fields | Notes |
| --- | --- | --- |
| `workout_sessions` | id, user_id, plan_day_id (nullable), started_at, ended_at, client_id, notes | `client_id` makes offline sync idempotent; null plan_day = ad-hoc workout |
| `session_exercises` | id, session_id, exercise_id, position | Snapshot of what was actually done, so editing a plan never rewrites history |
| `set_logs` | id, session_exercise_id, set_number, weight_kg, reps, duration_seconds (nullable), rpe (nullable), is_warmup, to_failure, completed_at | The core table; most rows by far |

**Goals**

| Table | Key fields | Notes |
| --- | --- | --- |
| `goals` | id, user_id, exercise_id, metric, target_value, start_value, deadline, status | metric: weight, reps or duration; progress = best logged value for that exercise |

**Relationships:** a user has many plans, sessions and goals. A plan has many days, a day has many plan exercises. A session has many session exercises, each with many set logs.

**Indexes to add from day one:** `set_logs(session_exercise_id)`, `workout_sessions(user_id, started_at desc)`, `session_exercises(exercise_id)` for history lookups, and a unique index on `workout_sessions(user_id, client_id)` for offline sync.

**Design choices worth knowing**

- Plans are templates and sessions are records. A session copies exercises from the plan when it starts, so later plan edits do not change past workouts.
- Estimated 1RM is computed on read (Epley: weight × (1 + reps / 30)), not stored, so the formula can change without a migration.
- Weights are always stored in kg and converted for display.

## Key flows

**In-workout session (the core screen)**

1. User taps Start on a plan day. The app creates a local `workout_sessions` row with a fresh `client_id` and copies the day's exercises into `session_exercises`.
2. The screen shows one exercise at a time: target sets and reps, last session's numbers, and the overload hint.
3. Inputs are pre-filled with the hint (weight and reps). The user performs the set, corrects the numbers to what they actually did (− / + buttons), and taps Complete Set, which writes a `set_logs` row locally.
4. Completing a set starts the rest timer using the exercise's `rest_seconds`. It survives screen lock by storing the end timestamp, not a counter, and fires a vibration and sound when done.
5. After the last set the app advances to the next exercise. The user can skip, reorder or add an exercise on the fly.
6. Finish sets `ended_at`, shows a summary (volume, new records), and queues the session for sync.

**Progressive overload hint**

Each exercise in a plan has its own progression mode, chosen when building the plan. The hint is computed on the client from the last 3 sessions of that exercise, using its target reps and `weight_step_kg` (default 2.5 kg, configurable per exercise).

**Mode 1: hit the target.** The last set is not taken to failure; every set stops at the planned point.

- When all working sets reach the target reps, suggest adding weight and keeping the same target.
- If any set falls short of the target, suggest the same weight and one more rep on the weakest set.

**Mode 2: last set to failure.** The exercise has its normal target (for example 4×15) plus a failure target for the last set (for example 20 reps, stored as `failure_target_reps`). Earlier sets use the planned reps; the last set goes to failure and is logged with `to_failure`.

- When the failure set reaches the failure target in 2 sessions in a row (`sessions_to_confirm`, default 2), suggest adding weight and starting the cycle again at the normal target (4×15).
- Otherwise suggest the same weight and beating last time's reps on the failure set.

**Both modes**

- If the weakest set stays 2 or more reps below the target in 2 sessions in a row, suggest a deload of about 10%.
- With no history, show no hint and use the plan's targets.

The rule lives in one pure function with unit tests, so the rule can change without touching the UI.

**Offline sync**

The client writes to IndexedDB first and pushes a queue of changes when online. The server upserts by `(user_id, client_id)`, so retries are safe. The server wins on conflicts for plans; sessions are append-only from one device, so conflicts are rare.

**Goals**

- Each goal targets one exercise and one metric: weight, reps or duration (duration for timed exercises).
- Progress = the best logged value for that exercise (heaviest weight, most reps in a set, longest hold), measured from `start_value` toward `target_value`.

Goals are recalculated on read, not stored, so they stay correct when old sessions are edited.

## API and security

A JSON REST API under `/api/v1`. Every route except sign-up and login requires authentication, and every query filters by the authenticated `user_id`.

| Area | Endpoints |
| --- | --- |
| Auth | `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout` |
| Exercises | `GET /exercises`, `POST /exercises`, `PATCH /exercises/:id` (own only) |
| Plans | `GET/POST /plans`, `GET/PATCH/DELETE /plans/:id`, nested days and exercises in the same payload |
| Sessions | `POST /sessions/sync` (batch upsert by client_id), `GET /sessions`, `GET /sessions/:id` |
| History | `GET /exercises/:id/history` (recent sets, used by the overload hint and charts) |
| Goals | `GET/POST /goals`, `PATCH/DELETE /goals/:id`, `GET /goals/progress` |

**Security baseline**

- Passwords hashed with argon2id; never logged.
- Short-lived access token (15 minutes) plus a rotating refresh token in an httpOnly, secure, SameSite cookie.
- Authorization check on every resource: the row's `user_id` must match the token. Add automated tests that try to read another user's data.
- Input validation with a schema library (Zod) on every request body.
- Rate limiting on auth routes; HTTPS only; CORS limited to the app's origin.
- Account deletion endpoint that removes all of a user's rows (needed for a public multi-user app).

Because sign-up is open to anyone with the URL, rate limiting on register and login matters from day one.

## Build roadmap

Build the logging loop first, because everything else (hints, goals, charts) reads from it.

1. **Foundation:** repo, Postgres schema and migrations, auth, deploy to the VPS (reverse proxy, HTTPS, nightly backups). Done when a user can register, log in and hit a protected route in production.
2. **Plans and exercises:** exercise library seed, plan builder screens (including per-exercise progression mode and the Add exercise picker). Done when a user can create a 3-day plan.
3. **Live session:** guided logging, rest timer, finish summary, online only. Done when you can complete a real workout on your phone.
4. **Offline and PWA:** manifest, service worker, IndexedDB queue, sync endpoint. Done when a full workout logged in airplane mode syncs correctly afterwards.
5. **Overload hints and history:** hint function with tests, per-exercise charts.
6. **Goals:** per-exercise targets, progress view.
7. **Polish and launch:** account deletion, rate limits, error tracking, accessibility pass, Hebrew/RTL review.

All earlier open questions are settled: TypeScript end to end, own VPS, open sign-up, English and Hebrew per user, seed list written (62 exercises).
