import { describe, expect, it } from "vitest";
import { hintValues, overloadHint, type HintConfig } from "./hints";
import type { HistorySet } from "./sessions";

const target: HintConfig = { targetReps: 10, progressionMode: "target", failureTargetReps: null, sessionsToConfirm: 2, weightStepKg: 2.5 };
const failure: HintConfig = { targetReps: 15, progressionMode: "failure", failureTargetReps: 20, sessionsToConfirm: 2, weightStepKg: 2.5 };

const set = (weightKg: number, reps: number, toFailure = false): HistorySet => ({ weightKg, reps, durationSeconds: null, toFailure });
// A workout: the same weight for every set, one reps value per set.
const workout = (weightKg: number, ...reps: number[]) => reps.map((r) => set(weightKg, r));

describe("no hint", () => {
  it("without history", () => {
    expect(overloadHint(target, [])).toBeNull();
    expect(overloadHint(target, [[]])).toBeNull();
  });

  it("for a timed exercise", () => {
    const timed: HintConfig = { ...target, targetReps: null, weightStepKg: null };
    expect(overloadHint(timed, [[{ weightKg: null, reps: null, durationSeconds: 30, toFailure: false }]])).toBeNull();
  });
});

describe("hit the target", () => {
  it("adds weight when every set reached the target, and keeps the target reps", () => {
    expect(overloadHint(target, [workout(60, 10, 10, 10)])).toEqual({ kind: "addWeight", weightKg: 62.5, reps: 10, setNumber: null });
  });

  it("counts beating the target as hitting it", () => {
    expect(overloadHint(target, [workout(60, 12, 10, 11)])?.kind).toBe("addWeight");
  });

  it("otherwise keeps the weight and asks for one more rep on the weakest set", () => {
    expect(overloadHint(target, [workout(60, 10, 8, 9)])).toEqual({ kind: "moreReps", weightKg: 60, reps: 9, setNumber: 2 });
  });

  it("the first of equally weak sets is the one named", () => {
    expect(overloadHint(target, [workout(60, 9, 9, 10)])?.setNumber).toBe(1);
  });

  it("uses the heaviest weight of the last workout", () => {
    expect(overloadHint(target, [[set(60, 10), set(65, 10)]])?.weightKg).toBe(67.5);
  });

  it("only the last workout decides, not older ones", () => {
    expect(overloadHint(target, [workout(60, 10, 10, 10), workout(55, 6, 6, 6)])?.kind).toBe("addWeight");
  });

  it("handles a bodyweight exercise (weight 0)", () => {
    expect(overloadHint(target, [workout(0, 10, 10)])).toEqual({ kind: "addWeight", weightKg: 2.5, reps: 10, setNumber: null });
  });
});

describe("last set to failure", () => {
  const session = (weight: number, failureReps: number) => [set(weight, 15), set(weight, 15), set(weight, 15), set(weight, failureReps, true)];

  it("asks to beat last time's failure reps while the goal is not reached", () => {
    expect(overloadHint(failure, [session(50, 17)])).toEqual({ kind: "beatFailure", weightKg: 50, reps: 18, setNumber: null });
  });

  it("one session at the goal is not enough when two are needed", () => {
    expect(overloadHint(failure, [session(50, 20), session(50, 17)])?.kind).toBe("beatFailure");
  });

  it("adds weight after the goal is reached in two sessions in a row, and restarts at the normal target", () => {
    expect(overloadHint(failure, [session(50, 21), session(50, 20)])).toEqual({ kind: "addWeight", weightKg: 52.5, reps: 15, setNumber: null });
  });

  it("a session below the goal between them breaks the streak", () => {
    expect(overloadHint(failure, [session(50, 20), session(50, 18), session(50, 20)])?.kind).toBe("beatFailure");
  });

  it("a weight increase restarts the count", () => {
    expect(overloadHint(failure, [session(52.5, 20), session(50, 20)])?.kind).toBe("beatFailure");
  });

  it("respects the configured number of sessions", () => {
    const one: HintConfig = { ...failure, sessionsToConfirm: 1 };
    expect(overloadHint(one, [session(50, 20)])?.kind).toBe("addWeight");
    const three: HintConfig = { ...failure, sessionsToConfirm: 3 };
    expect(overloadHint(three, [session(50, 20), session(50, 20)])?.kind).toBe("beatFailure");
    expect(overloadHint(three, [session(50, 20), session(50, 20), session(50, 20)])?.kind).toBe("addWeight");
  });
});

describe("deload", () => {
  it("after a set two or more reps short in two workouts in a row: 90% of the weight, rounded to the step", () => {
    expect(overloadHint(target, [workout(60, 10, 8, 10), workout(60, 7, 10, 10)])).toEqual({ kind: "deload", weightKg: 55, reps: 10, setNumber: null });
  });

  it("not after one workout", () => {
    expect(overloadHint(target, [workout(60, 10, 8, 10)])?.kind).toBe("moreReps");
  });

  it("not when the short set is just one rep short", () => {
    expect(overloadHint(target, [workout(60, 9, 10, 10), workout(60, 8, 10, 10)])?.kind).toBe("moreReps");
  });

  it("not when only one of the two workouts was well short", () => {
    expect(overloadHint(target, [workout(60, 10, 10, 10), workout(60, 6, 10, 10)])?.kind).toBe("addWeight");
  });

  it("takes priority over adding weight", () => {
    expect(overloadHint(target, [workout(60, 10, 10, 8), workout(60, 10, 10, 8)])?.kind).toBe("deload");
  });

  it("in failure mode it looks at the ordinary sets, not the failure set", () => {
    const shortFailure = [set(50, 15), set(50, 15), set(50, 15), set(50, 8, true)];
    expect(overloadHint(failure, [shortFailure, shortFailure])?.kind).toBe("beatFailure");
    const shortWorking = [set(50, 12), set(50, 15), set(50, 15), set(50, 18, true)];
    expect(overloadHint(failure, [shortWorking, shortWorking])?.kind).toBe("deload");
  });

  it("never for a bodyweight exercise", () => {
    expect(overloadHint(target, [workout(0, 6, 6), workout(0, 6, 6)])?.kind).toBe("moreReps");
  });
});

describe("hintValues", () => {
  const context = { targetReps: 10, targetSets: 3 };

  it("fills the weight everywhere and the target reps for ordinary sets", () => {
    const hint = overloadHint(target, [workout(60, 10, 10, 10)])!;
    expect([0, 1, 2].map((i) => hintValues(hint, i, context))).toEqual(Array(3).fill({ weightKg: 62.5, reps: 10 }));
  });

  it("puts the extra rep only on the weakest set", () => {
    const hint = overloadHint(target, [workout(60, 10, 8, 10)])!;
    expect([0, 1, 2].map((i) => hintValues(hint, i, context).reps)).toEqual([10, 9, 10]);
  });

  it("puts the beat-last-time reps only on the last set", () => {
    const hint = { kind: "beatFailure" as const, weightKg: 50, reps: 18, setNumber: null };
    expect([0, 1, 2].map((i) => hintValues(hint, i, { targetReps: 15, targetSets: 3 }).reps)).toEqual([15, 15, 18]);
  });
});
