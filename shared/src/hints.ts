import type { ProgressionMode } from "./plans.js";
import type { HistorySet } from "./sessions.js";

// The progressive overload hint: what to try this time, from the last few workouts.
// One pure function, so the rule can change without touching any screen.
// Weights are kg throughout; screens convert for display.

export interface HintConfig {
  targetReps: number | null;
  progressionMode: ProgressionMode;
  failureTargetReps: number | null;
  sessionsToConfirm: number;
  weightStepKg: number | null;
}

export type HintKind = "addWeight" | "moreReps" | "beatFailure" | "deload";

export interface Hint {
  kind: HintKind;
  weightKg: number;
  reps: number;
  // The one set the `reps` figure is meant for (moreReps only). null: the figure
  // is the target for the ordinary sets, and for beatFailure it is the last set's.
  setNumber: number | null;
}

const DELOAD_FACTOR = 0.9;
const DELOAD_SHORTFALL = 2;
const DELOAD_SESSIONS = 2;

const round3 = (value: number) => Math.round(value * 1000) / 1000;
const roundToStep = (value: number, step: number) => round3(Math.round(value / step) * step);

const topWeight = (sets: HistorySet[]) => Math.max(0, ...sets.map((set) => set.weightKg ?? 0));

// `sessions` are the last finished workouts of this exercise, newest first.
export function overloadHint(config: HintConfig, sessions: HistorySet[][]): Hint | null {
  const { targetReps, weightStepKg } = config;
  const last = sessions[0];
  // Timed exercises (no reps) and exercises never done have no hint.
  if (!last || last.length === 0 || targetReps === null || weightStepKg === null) return null;
  if (last.some((set) => set.reps === null)) return null;

  const failureMode = config.progressionMode === "failure" && config.failureTargetReps !== null;
  // In failure mode the last set is the failure set; it is judged on its own.
  const workingSets = (sets: HistorySet[]) => (failureMode && sets.length > 1 ? sets.slice(0, -1) : failureMode ? [] : sets);
  const weight = topWeight(last);

  // Well short of the target twice in a row: the weight is too heavy, ease off.
  const recent = sessions.slice(0, DELOAD_SESSIONS);
  if (
    weight > 0 &&
    recent.length === DELOAD_SESSIONS &&
    recent.every((sets) => workingSets(sets).some((set) => (set.reps ?? 0) <= targetReps - DELOAD_SHORTFALL))
  ) {
    return { kind: "deload", weightKg: roundToStep(weight * DELOAD_FACTOR, weightStepKg), reps: targetReps, setNumber: null };
  }

  if (failureMode) {
    const goal = config.failureTargetReps!;
    const failureSet = last[last.length - 1]!;
    const failureWeight = failureSet.weightKg ?? 0;
    // How many workouts in a row (newest first) the failure set reached the goal at
    // this same weight. A heavier weight starts the count again.
    let streak = 0;
    for (const sets of sessions) {
      const set = sets[sets.length - 1];
      if (!set || (set.weightKg ?? 0) !== failureWeight || (set.reps ?? 0) < goal) break;
      streak += 1;
    }
    if (streak >= config.sessionsToConfirm) {
      return { kind: "addWeight", weightKg: round3(failureWeight + weightStepKg), reps: targetReps, setNumber: null };
    }
    return { kind: "beatFailure", weightKg: failureWeight, reps: (failureSet.reps ?? 0) + 1, setNumber: null };
  }

  if (last.every((set) => (set.reps ?? 0) >= targetReps)) {
    return { kind: "addWeight", weightKg: round3(weight + weightStepKg), reps: targetReps, setNumber: null };
  }
  let weakest = 0;
  last.forEach((set, index) => {
    if ((set.reps ?? 0) < (last[weakest]!.reps ?? 0)) weakest = index;
  });
  return { kind: "moreReps", weightKg: weight, reps: (last[weakest]!.reps ?? 0) + 1, setNumber: weakest + 1 };
}

// The weight and reps to put in the steppers for one set (0-based `setIndex`).
export function hintValues(
  hint: Hint,
  setIndex: number,
  context: { targetReps: number; targetSets: number }
): { weightKg: number; reps: number } {
  const setNumber = setIndex + 1;
  const special =
    hint.kind === "moreReps" ? hint.setNumber === setNumber : hint.kind === "beatFailure" ? setNumber >= context.targetSets : false;
  return { weightKg: hint.weightKg, reps: special ? hint.reps : context.targetReps };
}
