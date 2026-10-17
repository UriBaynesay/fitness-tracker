import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { exerciseName, type Language } from "@fitness/shared";
import { useAuth } from "../auth/AuthContext";
import { Screen } from "../components/Screen";
import { clock, setText, volumeText } from "../lib/format";
import { summarize } from "../session/logic";
import { getWorkout } from "../session/store";
import type { WorkoutDoc } from "../session/types";

// Read from the device, not the server: it is there the instant the workout ends,
// with or without a connection.
export function WorkoutSummary() {
  const { clientId = "" } = useParams();
  const { t, i18n } = useTranslation();
  const { state } = useAuth();
  const language = i18n.language as Language;
  const [doc, setDoc] = useState<WorkoutDoc | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    void getWorkout(clientId).then((found) => !cancelled && setDoc(found ?? null));
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  if (state.status !== "authenticated" || doc === undefined) return <p className="status">{t("loading")}</p>;
  const unit = state.profile.weightUnit;

  if (doc === null || doc.profileId !== state.profile.id || doc.status !== "finished") {
    return (
      <Screen>
        <p className="muted">{t("errors.notFound")}</p>
        <Link to="/" className="btn btn-primary">
          {t("workout.done")}
        </Link>
      </Screen>
    );
  }

  const summary = summarize(doc);
  const stats: [string, string][] = [
    [t("summary.volume"), volumeText(summary.volumeKg, unit)],
    [t("summary.sets"), String(summary.setsDone)],
    [t("summary.time"), clock(summary.durationSeconds)],
    [t("summary.exercises"), t("summary.exercisesValue", { done: summary.exercisesDone, skipped: summary.exercisesSkipped })],
  ];

  return (
    <Screen>
      <header className="stack">
        <span className="label">{t("summary.kicker")}</span>
        <h1 className="title" dir="auto">
          {doc.planDayName ?? t("workout.freeWorkout")}
        </h1>
      </header>

      <dl className="stats">
        {stats.map(([label, value]) => (
          <div className="stat" key={label}>
            <dt className="label">{label}</dt>
            <dd dir="auto">{value}</dd>
          </div>
        ))}
      </dl>

      <ul className="list">
        {doc.exercises.map((exercise) => (
          <li key={exercise.clientId} className="card stack">
            <strong dir="auto">{exerciseName(exercise, language)}</strong>
            {exercise.skipped || exercise.sets.length === 0 ? (
              <span className="muted-small">{t("workout.skipped")}</span>
            ) : (
              <span className="muted-small" dir="ltr">
                {exercise.sets.map((set) => setText(set, unit)).join(" · ")}
                {exercise.isTimed ? "" : ` ${unit}`}
              </span>
            )}
          </li>
        ))}
      </ul>

      <Link to="/" className="btn btn-primary">
        {t("workout.done")}
      </Link>
    </Screen>
  );
}
