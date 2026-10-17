import type { WeightUnit } from "./auth.js";

const LB_PER_KG = 2.2046226218;

// Weights are always stored in kg and converted only for display, so switching a
// user's unit never rewrites data. Display values are rounded to something a person
// would actually type (quarter kilo, half pound); storage keeps 3 decimals so a
// round trip like 5 lb -> 2.268 kg -> 5 lb is stable.
const DISPLAY_STEP: Record<WeightUnit, number> = { kg: 0.25, lb: 0.5 };

function roundToStep(value: number, step: number): number {
  return Math.round(value / step) * step;
}

export function kgToDisplay(kg: number, unit: WeightUnit): number {
  return roundToStep(unit === "kg" ? kg : kg * LB_PER_KG, DISPLAY_STEP[unit]);
}

export function displayToKg(value: number, unit: WeightUnit): number {
  const kg = unit === "kg" ? value : value / LB_PER_KG;
  return Math.round(kg * 1000) / 1000;
}

export const DEFAULT_WEIGHT_STEP: Record<WeightUnit, number> = { kg: 2.5, lb: 5 };

export function defaultWeightStepKg(unit: WeightUnit): number {
  return displayToKg(DEFAULT_WEIGHT_STEP[unit], unit);
}

// 2.5 -> "2.5", 5 -> "5", 1.25 -> "1.25": no trailing zeros.
export function formatNumber(value: number): string {
  return String(Number(value.toFixed(2)));
}
