import { formatNumber, kgToDisplay, type HistorySet, type WeightUnit } from "@fitness/shared";

export const clock = (totalSeconds: number): string => {
  const seconds = Math.max(0, Math.ceil(totalSeconds));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};

export const weightText = (kg: number | null, unit: WeightUnit): string =>
  `${formatNumber(kgToDisplay(kg ?? 0, unit))} ${unit}`;

// "60 × 8" for a set of reps, "45 s" for a held one. The unit is shown once by the caller.
export function setText(set: Pick<HistorySet, "weightKg" | "reps" | "durationSeconds">, unit: WeightUnit): string {
  if (set.durationSeconds !== null) return `${set.durationSeconds} s`;
  return `${formatNumber(kgToDisplay(set.weightKg ?? 0, unit))} × ${set.reps ?? 0}`;
}

export const volumeText = (kg: number, unit: WeightUnit): string =>
  `${Math.round(unit === "kg" ? kg : kgToDisplay(kg, unit)).toLocaleString()} ${unit}`;
