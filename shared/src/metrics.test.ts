import { describe, expect, it } from "vitest";
import { bestDuration, bestReps, bestWeight, estimatedOneRepMax } from "./metrics";

const set = (weightKg: number | null, reps: number | null, durationSeconds: number | null = null) => ({ weightKg, reps, durationSeconds });

describe("best of a workout", () => {
  const sets = [set(60, 10), set(65, 6), set(55, 12)];

  it("heaviest weight, most reps in a set", () => {
    expect(bestWeight(sets)).toBe(65);
    expect(bestReps(sets)).toBe(12);
  });

  it("longest hold", () => {
    expect(bestDuration([set(null, null, 30), set(null, null, 45)])).toBe(45);
  });

  it("is null when there is nothing to measure", () => {
    expect(bestWeight([])).toBeNull();
    expect(bestReps([set(null, null, 30)])).toBeNull();
    expect(bestDuration([set(60, 10)])).toBeNull();
  });
});

describe("estimated one-rep max", () => {
  it("uses Epley: weight x (1 + reps / 30), taking the best set", () => {
    expect(estimatedOneRepMax([set(60, 10)])).toBeCloseTo(80, 5);
    expect(estimatedOneRepMax([set(60, 10), set(70, 5)])).toBeCloseTo(81.6667, 3);
  });

  it("ignores sets with no weight, and is null when none count", () => {
    expect(estimatedOneRepMax([set(0, 20), set(null, 10)])).toBeNull();
  });
});
