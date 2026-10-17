import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { api } from "../api";
import { ExercisePicker } from "../components/ExercisePicker";

// Adds an exercise to one day of a plan.
export function AddExercise() {
  const { planId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const dayId = searchParams.get("day") ?? "";
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [dayName, setDayName] = useState<string | null>(null);

  // Only to say which day the exercise is being added to.
  useEffect(() => {
    let cancelled = false;
    api.plans
      .get(planId)
      .then(({ plan }) => !cancelled && setDayName(plan.days.find((day) => day.id === dayId)?.name ?? null))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [planId, dayId]);

  const backTo = `/plans/${planId}${dayId ? `?day=${dayId}` : ""}`;

  return (
    <ExercisePicker
      backTo={backTo}
      contextLabel={dayName ? t("addExercise.addingTo", { day: dayName }) : null}
      confirmLabel={(name) => t("addExercise.add", { name })}
      idleLabel={t("addExercise.addDisabled")}
      canConfirm={dayId !== ""}
      onConfirm={async (exercise) => {
        await api.planExercises.create(dayId, exercise.id);
        navigate(backTo);
      }}
    />
  );
}
