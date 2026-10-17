import { describe, expect, it } from "vitest";
import { MAX_SESSION_EXERCISES, MAX_SETS_PER_EXERCISE } from "./limits.js";
import { defaultPlanExerciseConfig } from "./plans.js";
import { syncSessionSchema, syncSetSchema } from "./sessions.js";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const set = (n: number, overrides: Record<string, unknown> = {}) => ({
  clientId: uuid(100 + n),
  setNumber: n,
  weightKg: 80,
  reps: 8,
  durationSeconds: null,
  toFailure: false,
  completedAt: "2026-10-18T08:00:00.000Z",
  ...overrides,
});

const exercise = (n: number, sets = [set(1)]) => ({
  ...defaultPlanExerciseConfig(false, "kg"),
  clientId: uuid(n),
  exerciseId: uuid(500 + n),
  position: n - 1,
  skipped: false,
  sets,
});

const session = (overrides: Record<string, unknown> = {}) => ({
  clientId: uuid(1),
  planDayId: uuid(2),
  planDayName: "Push",
  startedAt: "2026-10-18T07:30:00.000Z",
  endedAt: "2026-10-18T08:30:00.000Z",
  exercises: [exercise(1)],
  ...overrides,
});

describe("sync set", () => {
  it("is counted in reps or held for seconds, never both and never neither", () => {
    expect(syncSetSchema.safeParse(set(1)).success).toBe(true);
    expect(syncSetSchema.safeParse(set(1, { reps: null, durationSeconds: 45, weightKg: null })).success).toBe(true);
    expect(syncSetSchema.safeParse(set(1, { durationSeconds: 45 })).success).toBe(false);
    expect(syncSetSchema.safeParse(set(1, { reps: null })).success).toBe(false);
  });

  it("enforces ranges", () => {
    expect(syncSetSchema.safeParse(set(1, { reps: 0 })).success).toBe(false);
    expect(syncSetSchema.safeParse(set(1, { weightKg: -1 })).success).toBe(false);
    expect(syncSetSchema.safeParse(set(MAX_SETS_PER_EXERCISE + 1)).success).toBe(false);
    expect(syncSetSchema.safeParse(set(1, { completedAt: "yesterday" })).success).toBe(false);
  });
});

describe("sync session", () => {
  it("accepts a finished and an in-progress workout", () => {
    expect(syncSessionSchema.safeParse(session()).success).toBe(true);
    expect(syncSessionSchema.safeParse(session({ endedAt: null })).success).toBe(true);
  });

  it("accepts an ad-hoc workout with no plan day", () => {
    expect(syncSessionSchema.safeParse(session({ planDayId: null, planDayName: null })).success).toBe(true);
  });

  it("rejects a workout that ends before it starts", () => {
    const result = syncSessionSchema.safeParse(session({ endedAt: "2026-10-18T07:00:00.000Z" }));
    expect(result.success).toBe(false);
  });

  it("rejects duplicate set numbers inside one exercise", () => {
    const result = syncSessionSchema.safeParse(session({ exercises: [exercise(1, [set(1), set(1, { clientId: uuid(999) })])] }));
    expect(result.success).toBe(false);
  });

  it("caps the number of exercises", () => {
    const many = Array.from({ length: MAX_SESSION_EXERCISES + 1 }, (_, i) => exercise(i + 1));
    expect(syncSessionSchema.safeParse(session({ exercises: many })).success).toBe(false);
  });

  it("requires client-generated uuids", () => {
    expect(syncSessionSchema.safeParse(session({ clientId: "not-a-uuid" })).success).toBe(false);
  });
});
