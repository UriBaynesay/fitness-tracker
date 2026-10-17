import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { useAuth } from "../auth/AuthContext";
import { ExercisePicker } from "../components/ExercisePicker";
import { loadHistory } from "../session/data";
import { newId } from "../session/ids";
import { addExercise } from "../session/logic";
import { useWorkout } from "../session/WorkoutContext";

// Adds an exercise to the workout in progress: the same picker as the plan builder.
export function WorkoutAddExercise() {
  const { t } = useTranslation();
  const { state } = useAuth();
  const { active, ready, update } = useWorkout();
  const navigate = useNavigate();
  if (state.status !== "authenticated") return null;
  const { id: profileId, weightUnit } = state.profile;

  return (
    <ExercisePicker
      backTo="/workout"
      contextLabel={active?.planDayName ? t("workout.addingTo", { day: active.planDayName }) : t("workout.addingToFree")}
      confirmLabel={(name) => t("addExercise.add", { name })}
      idleLabel={t("addExercise.addDisabled")}
      canConfirm={ready && active !== null}
      onConfirm={async (exercise) => {
        const previous = (await loadHistory(profileId, [exercise.id])).get(exercise.id) ?? [];
        update((doc) =>
          addExercise(
            doc,
            { exerciseId: exercise.id, nameEn: exercise.nameEn, nameHe: exercise.nameHe, isTimed: exercise.isTimed },
            { unit: weightUnit, newId, previous }
          )
        );
        navigate("/workout");
      }}
    />
  );
}
