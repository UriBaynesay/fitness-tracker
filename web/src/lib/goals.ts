import { displayToKg, formatNumber, kgToDisplay, type GoalMetric, type WeightUnit } from "@fitness/shared";

// Goals are stored in kg, reps and seconds. People read and type weights in their own unit.
const isWeight = (metric: GoalMetric) => metric === "weight";

export const toDisplayValue = (metric: GoalMetric, stored: number, unit: WeightUnit): number =>
  isWeight(metric) ? kgToDisplay(stored, unit) : stored;

export const toStoredValue = (metric: GoalMetric, typed: number, unit: WeightUnit): number =>
  isWeight(metric) ? displayToKg(typed, unit) : typed;

export function valueText(metric: GoalMetric, stored: number, unit: WeightUnit): string {
  const value = formatNumber(toDisplayValue(metric, stored, unit));
  return metric === "weight" ? `${value} ${unit}` : metric === "duration" ? `${value} s` : value;
}
