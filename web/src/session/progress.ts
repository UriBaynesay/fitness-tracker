import {
  bestDuration,
  bestReps,
  bestWeight,
  estimatedOneRepMax,
  kgToDisplay,
  type ExerciseHistory,
  type WeightUnit,
} from "@fitness/shared";

export type Metric = "weight" | "reps" | "oneRm" | "duration";

export const metricsFor = (isTimed: boolean): Metric[] => (isTimed ? ["duration"] : ["weight", "reps", "oneRm"]);

export interface SeriesPoint {
  startedAt: string;
  value: number;
}

const round1 = (value: number) => Math.round(value * 10) / 10;

// One point per workout (oldest first, as a chart reads): the best value of that
// workout. Weights are shown in the person's unit. Workouts with nothing to measure
// (for example weight on a bodyweight-only exercise) are left out.
export function buildSeries(sessions: ExerciseHistory["sessions"], metric: Metric, unit: WeightUnit): SeriesPoint[] {
  const points: SeriesPoint[] = [];
  for (const session of [...sessions].reverse()) {
    const raw =
      metric === "weight"
        ? bestWeight(session.sets)
        : metric === "reps"
          ? bestReps(session.sets)
          : metric === "duration"
            ? bestDuration(session.sets)
            : estimatedOneRepMax(session.sets);
    if (raw === null) continue;
    const value = metric === "weight" || metric === "oneRm" ? round1(kgToDisplay(raw, unit)) : raw;
    points.push({ startedAt: session.startedAt, value });
  }
  return points;
}
