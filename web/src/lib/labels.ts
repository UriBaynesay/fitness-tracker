import type { Equipment, MuscleGroup } from "@fitness/shared";

// Translation keys for the seed's enumerations. "lower back" has a space, which is
// awkward in a JSON key, so the locale files use "lower_back".
export const muscleGroupKey = (group: MuscleGroup) => `muscleGroup.${group.replace(" ", "_")}`;
export const equipmentKey = (equipment: Equipment) => `equipment.${equipment}`;
