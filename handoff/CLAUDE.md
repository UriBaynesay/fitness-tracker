# Fitness Tracker: project brief for Claude Code

A free, multi-user, mobile-first PWA for tracking a fitness journey: workout plans, goals, and an in-workout helper (guided set logging, rest timer, progressive overload hints). Hosted on the owner's own VPS next to other apps.

Read in this order: `docs/spec.md` (decisions, data model, flows, API), `design/DESIGN.md` (look and screens), then the screen files in `design/screens/`. The exercise seed data is `seed/exercises-seed.json`.

## Decisions already made (do not re-ask)

- Stack: TypeScript end to end. Frontend React + Vite as an installable PWA. Local data in IndexedDB via Dexie. API on Node.js with Fastify and Zod. PostgreSQL with Drizzle or Prisma (pick one and say why). Auth by email and password, argon2id, 15-minute access token plus rotating refresh token in an httpOnly secure SameSite cookie.
- Sign-up is open: anyone with the app URL can register. No invite codes. Rate-limit auth routes.
- Languages: English and Hebrew per user, with right-to-left layout for Hebrew. Use logical CSS properties and translation files from the first screen. Exercise names have `name_en` and `name_he`.
- Offline first: every set is written locally first and synced later. Sync is idempotent by `(user_id, client_id)`.
- Weights are stored in kg and converted for display (kg or lb per user).
- Goals target one exercise and one metric (weight, reps or duration). There are no body weight goals.
- Progression is configured per plan exercise: mode 1 "hit the target" (single target reps, add weight when all sets reach it) and mode 2 "last set to failure" (target reps for earlier sets, a failure goal for the last set, weight goes up after the goal is reached in N sessions in a row). The hint rule is one pure function with unit tests.
- No elapsed workout timer. Only the rest timer.
- Never in the app: social features, nutrition tracking, payments, AI coach chat. Later, not v1: body weight tracking, wearable sync.

## Working style

- The owner is an experienced developer (Zoho and Deluge background) who is learning backend engineering through this project. Explain non-obvious backend decisions briefly as you go, and prefer simple, well-known patterns.
- Work milestone by milestone from the roadmap at the end of `docs/spec.md`. Start in plan mode: propose the repo layout, the Postgres schema and migrations, and the deployment approach for the VPS, then wait for approval before writing code.
- Milestone 1 (foundation) includes: repo and tooling, schema and migrations, register and login, a protected route, deploy to the VPS behind a reverse proxy with HTTPS, and a nightly Postgres backup.
- Write tests for: the overload hint function, authorization (a user must not be able to read another user's data), and sync idempotency.
- Do not edit `design/screens/` or `docs/`. If the build needs a change to the design or spec, say so and propose the change.
- Mobile-first: minimum touch target 44 px, large tap targets for the workout screen, no hover-only interactions.

## Open details to confirm with the owner when you reach them

- Whether the VPS already runs Docker, and which reverse proxy it uses (Caddy or Nginx).
- Domain or subdomain for the app.
- ORM choice if the owner has a preference.
