import { describe, expect, it } from "vitest";
import {
  applyPlanExerciseUpdate,
  createExerciseBodySchema,
  defaultPlanExerciseConfig,
  exerciseName,
  planExerciseConfigFor,
  updatePlanExerciseBodySchema,
} from "./plans.js";

const repConfig = () => defaultPlanExerciseConfig(false, "kg");
const timedConfig = () => defaultPlanExerciseConfig(true, "kg");

function issuePaths(result: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) {
  return result.error?.issues.map((i) => String(i.path[0])) ?? [];
}

describe("plan exercise configuration rules", () => {
  it("accepts the defaults for both kinds of exercise", () => {
    expect(planExerciseConfigFor(false).safeParse(repConfig()).success).toBe(true);
    expect(planExerciseConfigFor(true).safeParse(timedConfig()).success).toBe(true);
  });

  it("gives a lb user a 5 lb default step, stored as kg", () => {
    expect(defaultPlanExerciseConfig(false, "lb").weightStepKg).toBe(2.268);
  });

  it("rep exercises need reps and must not carry a duration", () => {
    const noReps = planExerciseConfigFor(false).safeParse({ ...repConfig(), targetReps: null });
    expect(issuePaths(noReps)).toContain("targetReps");
    const withDuration = planExerciseConfigFor(false).safeParse({ ...repConfig(), targetDurationSeconds: 30 });
    expect(issuePaths(withDuration)).toContain("targetDurationSeconds");
  });

  it("timed exercises need seconds and cannot use reps, failure mode or a weight step", () => {
    expect(issuePaths(planExerciseConfigFor(true).safeParse({ ...timedConfig(), targetDurationSeconds: null }))).toContain("targetDurationSeconds");
    expect(issuePaths(planExerciseConfigFor(true).safeParse({ ...timedConfig(), targetReps: 10 }))).toContain("targetReps");
    expect(issuePaths(planExerciseConfigFor(true).safeParse({ ...timedConfig(), progressionMode: "failure", failureTargetReps: 20 }))).toContain("progressionMode");
    expect(issuePaths(planExerciseConfigFor(true).safeParse({ ...timedConfig(), weightStepKg: 2.5 }))).toContain("weightStepKg");
  });

  it("failure mode needs a failure goal higher than the target reps", () => {
    const base = { ...repConfig(), targetReps: 15, progressionMode: "failure" as const };
    expect(planExerciseConfigFor(false).safeParse({ ...base, failureTargetReps: 20 }).success).toBe(true);
    expect(issuePaths(planExerciseConfigFor(false).safeParse({ ...base, failureTargetReps: null }))).toContain("failureTargetReps");
    expect(issuePaths(planExerciseConfigFor(false).safeParse({ ...base, failureTargetReps: 15 }))).toContain("failureTargetReps");
    expect(issuePaths(planExerciseConfigFor(false).safeParse({ ...base, failureTargetReps: 10 }))).toContain("failureTargetReps");
  });

  it("target mode must not keep a stale failure goal", () => {
    const result = planExerciseConfigFor(false).safeParse({ ...repConfig(), failureTargetReps: 20 });
    expect(issuePaths(result)).toContain("failureTargetReps");
  });

  it("enforces numeric ranges", () => {
    expect(planExerciseConfigFor(false).safeParse({ ...repConfig(), targetSets: 0 }).success).toBe(false);
    expect(planExerciseConfigFor(false).safeParse({ ...repConfig(), targetSets: 21 }).success).toBe(false);
    expect(planExerciseConfigFor(false).safeParse({ ...repConfig(), restSeconds: 601 }).success).toBe(false);
    expect(planExerciseConfigFor(false).safeParse({ ...repConfig(), weightStepKg: 0 }).success).toBe(false);
    expect(planExerciseConfigFor(false).safeParse({ ...repConfig(), targetReps: 2.5 }).success).toBe(false);
  });
});

describe("applying a partial update", () => {
  it("changes only what was sent", () => {
    const updated = applyPlanExerciseUpdate(repConfig(), { targetSets: 5 });
    expect(updated).toEqual({ ...repConfig(), targetSets: 5 });
  });

  it("proposes a failure goal of target reps + 5 when switching to failure mode", () => {
    const updated = applyPlanExerciseUpdate({ ...repConfig(), targetReps: 15 }, { progressionMode: "failure" });
    expect(updated.progressionMode).toBe("failure");
    expect(updated.failureTargetReps).toBe(20);
    expect(planExerciseConfigFor(false).safeParse(updated).success).toBe(true);
  });

  it("keeps an explicit failure goal when one is sent", () => {
    const updated = applyPlanExerciseUpdate(repConfig(), { progressionMode: "failure", failureTargetReps: 25 });
    expect(updated.failureTargetReps).toBe(25);
  });

  it("drops the failure goal when switching back to target mode", () => {
    const inFailure = { ...repConfig(), targetReps: 15, progressionMode: "failure" as const, failureTargetReps: 20 };
    const updated = applyPlanExerciseUpdate(inFailure, { progressionMode: "target" });
    expect(updated.failureTargetReps).toBeNull();
    expect(planExerciseConfigFor(false).safeParse(updated).success).toBe(true);
  });

  it("ignores undefined values but honours explicit nulls", () => {
    expect(applyPlanExerciseUpdate(repConfig(), { restSeconds: undefined }).restSeconds).toBe(90);
    expect(applyPlanExerciseUpdate(timedConfig(), { targetReps: null }).targetReps).toBeNull();
  });
});

describe("request bodies", () => {
  it("an update must change something", () => {
    expect(updatePlanExerciseBodySchema.safeParse({}).success).toBe(false);
    expect(updatePlanExerciseBodySchema.safeParse({ targetSets: 5 }).success).toBe(true);
    expect(updatePlanExerciseBodySchema.safeParse({ position: 0 }).success).toBe(true);
  });

  it("a custom exercise trims its name and defaults to not timed", () => {
    const parsed = createExerciseBodySchema.parse({ name: "  Sled push  ", muscleGroup: "quads", equipment: "other" });
    expect(parsed).toEqual({ name: "Sled push", muscleGroup: "quads", equipment: "other", isTimed: false });
    expect(createExerciseBodySchema.safeParse({ name: "   ", muscleGroup: "quads", equipment: "other" }).success).toBe(false);
    expect(createExerciseBodySchema.safeParse({ name: "x", muscleGroup: "toes", equipment: "other" }).success).toBe(false);
  });
});

describe("exerciseName", () => {
  it("prefers the user's language and falls back to the other", () => {
    expect(exerciseName({ nameEn: "Squat", nameHe: "סקוואט" }, "he")).toBe("סקוואט");
    expect(exerciseName({ nameEn: "Squat", nameHe: "סקוואט" }, "en")).toBe("Squat");
    expect(exerciseName({ nameEn: "Squat", nameHe: null }, "he")).toBe("Squat");
    expect(exerciseName({ nameEn: null, nameHe: "סקוואט" }, "en")).toBe("סקוואט");
  });
});
