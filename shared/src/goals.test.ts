import { describe, expect, it } from "vitest";
import { createGoalBodySchema, goalProgress, metricAllowed, metricsForExercise, updateGoalBodySchema } from "./goals";

describe("which metric fits which exercise", () => {
  it("duration only for timed exercises, weight and reps only for the rest", () => {
    expect(metricsForExercise(true)).toEqual(["duration"]);
    expect(metricsForExercise(false)).toEqual(["weight", "reps"]);
    expect(metricAllowed("duration", false)).toBe(false);
    expect(metricAllowed("weight", true)).toBe(false);
  });
});

describe("goal progress", () => {
  it("is measured from the start value toward the target", () => {
    expect(goalProgress(60, 100, 80)).toEqual({ fraction: 0.5, percent: 50, reached: false });
  });

  it("starts at 0 % with no logged value or with the start value", () => {
    expect(goalProgress(60, 100, null).percent).toBe(0);
    expect(goalProgress(60, 100, 60).percent).toBe(0);
  });

  it("never goes below 0 % when the best is under the start", () => {
    expect(goalProgress(60, 100, 40)).toEqual({ fraction: 0, percent: 0, reached: false });
  });

  it("is reached at the target and stays at 100 % beyond it", () => {
    expect(goalProgress(60, 100, 100)).toEqual({ fraction: 1, percent: 100, reached: true });
    expect(goalProgress(60, 100, 120)).toEqual({ fraction: 1, percent: 100, reached: true });
  });

  it("rounds the percent", () => {
    expect(goalProgress(0, 3, 1).percent).toBe(33);
  });
});

describe("goal bodies", () => {
  const exerciseId = "00000000-0000-4000-8000-000000000001";

  it("accepts a valid goal and rejects a bad one", () => {
    expect(createGoalBodySchema.safeParse({ exerciseId, metric: "weight", target: 100 }).success).toBe(true);
    expect(createGoalBodySchema.safeParse({ exerciseId, metric: "speed", target: 100 }).success).toBe(false);
    expect(createGoalBodySchema.safeParse({ exerciseId, metric: "reps", target: 0 }).success).toBe(false);
    expect(createGoalBodySchema.safeParse({ exerciseId: "x", metric: "reps", target: 5 }).success).toBe(false);
  });

  it("an update carries only the target", () => {
    expect(updateGoalBodySchema.safeParse({ target: 120 }).success).toBe(true);
    expect(updateGoalBodySchema.safeParse({}).success).toBe(false);
  });
});
