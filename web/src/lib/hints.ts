import { formatNumber, kgToDisplay, type Hint, type WeightUnit } from "@fitness/shared";

// "62.5 kg × 10": what a hint asks for, in the person's unit.
export const hintShort = (hint: Hint, unit: WeightUnit): string =>
  `${formatNumber(kgToDisplay(hint.weightKg, unit))} ${unit} × ${hint.reps}`;
