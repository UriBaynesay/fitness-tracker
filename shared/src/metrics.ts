import type { HistorySet } from "./sessions.js";

// What a person did in one workout for one exercise, reduced to a single number.
// Used by the Progress chart now and by goals later, so "best" means the same
// thing everywhere.

type SetLike = Pick<HistorySet, "weightKg" | "reps" | "durationSeconds">;

function max(values: (number | null)[]): number | null {
  const present = values.filter((value): value is number => value !== null);
  return present.length === 0 ? null : Math.max(...present);
}

export const bestWeight = (sets: SetLike[]): number | null => max(sets.map((set) => set.weightKg));

export const bestReps = (sets: SetLike[]): number | null => max(sets.map((set) => set.reps));

export const bestDuration = (sets: SetLike[]): number | null => max(sets.map((set) => set.durationSeconds));

// Epley's estimate of the heaviest single rep: weight x (1 + reps / 30). It lets a
// 60 kg x 10 and an 70 kg x 5 be compared. Sets without a weight cannot be estimated.
export function estimatedOneRepMax(sets: SetLike[]): number | null {
  return max(
    sets.map((set) =>
      set.weightKg !== null && set.weightKg > 0 && set.reps !== null ? set.weightKg * (1 + set.reps / 30) : null
    )
  );
}
