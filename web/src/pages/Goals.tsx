import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  MUSCLE_GROUPS,
  exerciseName,
  goalProgress,
  metricsForExercise,
  type Exercise,
  type Goal,
  type GoalMetric,
  type Language,
} from "@fitness/shared";
import { ApiError, api } from "../api";
import { useAuth } from "../auth/AuthContext";
import { ConfirmButton } from "../components/ConfirmButton";
import { CheckIcon } from "../components/icons";
import { Screen } from "../components/Screen";
import { toDisplayValue, toStoredValue, valueText } from "../lib/goals";
import { muscleGroupKey } from "../lib/labels";
import { loadGoals, loadLibrary, rememberGoals } from "../session/data";

export function Goals() {
  const { t, i18n } = useTranslation();
  const { state } = useAuth();
  const language = i18n.language as Language;
  const profileId = state.status === "authenticated" ? state.profile.id : null;
  const unit = state.status === "authenticated" ? state.profile.weightUnit : "kg";

  const [goals, setGoals] = useState<Goal[] | null>(null);
  const [library, setLibrary] = useState<Exercise[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [exerciseId, setExerciseId] = useState("");
  const [metric, setMetric] = useState<GoalMetric>("weight");
  const [target, setTarget] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState("");

  useEffect(() => {
    if (!profileId) return;
    let cancelled = false;
    Promise.all([loadGoals(profileId), loadLibrary(profileId)])
      .then(([found, exercises]) => {
        if (cancelled) return;
        setGoals(found);
        setLibrary(exercises);
      })
      .catch(() => !cancelled && setLoadFailed(true));
    return () => {
      cancelled = true;
    };
  }, [profileId]);

  const byId = new Map(library.map((exercise) => [exercise.id, exercise]));
  const chosen = byId.get(exerciseId) ?? null;
  const metrics = metricsForExercise(chosen?.isTimed ?? false);
  const activeMetric = metrics.includes(metric) ? metric : metrics[0]!;

  // Every successful change updates the screen and the copy kept for offline use.
  function commit(next: Goal[]) {
    setGoals(next);
    if (profileId) void rememberGoals(profileId, next).catch(() => undefined);
  }

  function fail(caught: unknown) {
    setError(caught instanceof ApiError ? caught.code : "generic");
  }

  // Typed text -> a positive number, or null.
  const parse = (text: string): number | null => {
    const value = Number(text.trim().replace(",", "."));
    return text.trim() !== "" && Number.isFinite(value) && value > 0 ? value : null;
  };

  async function onAdd(event: FormEvent) {
    event.preventDefault();
    const typed = parse(target);
    if (!chosen || typed === null) return;
    setError(null);
    try {
      const { goal } = await api.goals.create({ exerciseId: chosen.id, metric: activeMetric, target: toStoredValue(activeMetric, typed, unit) });
      commit([goal, ...(goals ?? [])]);
      setAdding(false);
      setTarget("");
      setExerciseId("");
    } catch (caught) {
      fail(caught);
    }
  }

  async function onSaveTarget(goal: Goal) {
    const typed = parse(editTarget);
    if (typed === null) return;
    setError(null);
    try {
      const { goal: updated } = await api.goals.update(goal.id, { target: toStoredValue(goal.metric, typed, unit) });
      commit((goals ?? []).map((item) => (item.id === goal.id ? updated : item)));
      setEditingId(null);
    } catch (caught) {
      fail(caught);
    }
  }

  async function onRemove(goal: Goal) {
    setError(null);
    try {
      await api.goals.remove(goal.id);
      commit((goals ?? []).filter((item) => item.id !== goal.id));
    } catch (caught) {
      fail(caught);
    }
  }

  const targetUnit = (m: GoalMetric) => (m === "weight" ? unit : m === "duration" ? t("goals.seconds") : t("goals.reps"));

  return (
    <Screen nav>
      <header className="screen-header">
        <h1 className="title">{t("goals.title")}</h1>
      </header>

      {loadFailed && (
        <p className="error" role="alert">
          {t("errors.load")}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {t(`goals.errors.${error}`, { defaultValue: t("errors.save") })}
        </p>
      )}
      {goals === null && !loadFailed && <p className="status">{t("loading")}</p>}
      {goals?.length === 0 && !adding && <p className="muted">{t("goals.empty")}</p>}

      <ul className="list">
        {goals?.map((goal) => {
          const exercise = byId.get(goal.exerciseId);
          const progress = goalProgress(goal.startValue, goal.targetValue, goal.best);
          const editing = editingId === goal.id;
          return (
            <li key={goal.id} className="card stack goal-card" aria-label={exercise ? exerciseName(exercise, language) : undefined}>
              <div className="goal-head">
                <strong dir="auto">{exercise ? exerciseName(exercise, language) : ""}</strong>
                <span className="tag">{t(`goals.metric.${goal.metric}`)}</span>
              </div>
              <div className="goal-numbers">
                <span>
                  <span className="label">{t("goals.best")}</span>
                  <bdi className="goal-value" dir="ltr">
                    {goal.best === null ? "–" : valueText(goal.metric, goal.best, unit)}
                  </bdi>
                </span>
                <span>
                  <span className="label">{t("goals.goal")}</span>
                  <bdi className="goal-value" dir="ltr">
                    {valueText(goal.metric, goal.targetValue, unit)}
                  </bdi>
                </span>
              </div>
              <div
                className="bar"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress.percent}
                aria-label={t("goals.progress")}
              >
                <div className="bar-fill" style={{ inlineSize: `${progress.percent}%` }} />
              </div>
              <div className="goal-foot muted-small">
                <span>
                  {t("goals.start")}: <bdi dir="ltr">{valueText(goal.metric, goal.startValue, unit)}</bdi>
                </span>
                <span className={progress.reached ? "accent goal-done" : undefined}>
                  {progress.reached && <CheckIcon />}
                  {progress.reached ? t("goals.reached") : `${progress.percent}%`}
                </span>
              </div>

              {editing ? (
                <form
                  className="stack"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void onSaveTarget(goal);
                  }}
                >
                  <label className="field">
                    <span className="label">
                      {t("goals.newTarget")} ({targetUnit(goal.metric)})
                    </span>
                    <input className="input" type="text" inputMode="decimal" dir="ltr" autoFocus value={editTarget} onChange={(e) => setEditTarget(e.target.value)} />
                  </label>
                  <button className="btn btn-primary" type="submit" disabled={parse(editTarget) === null}>
                    {t("goals.save")}
                  </button>
                  <button className="btn btn-ghost" type="button" onClick={() => setEditingId(null)}>
                    {t("common.cancel")}
                  </button>
                </form>
              ) : (
                <div className="goal-actions">
                  <button
                    type="button"
                    className="btn btn-ghost btn-small"
                    onClick={() => {
                      setEditingId(goal.id);
                      setEditTarget(String(toDisplayValue(goal.metric, goal.targetValue, unit)));
                    }}
                  >
                    {t("goals.edit")}
                  </button>
                  <ConfirmButton label={t("goals.delete")} question={t("goals.confirmDelete")} className="btn btn-ghost btn-small" onConfirm={() => onRemove(goal)} />
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {adding ? (
        <form className="card form" onSubmit={onAdd}>
          <h2 className="section-title">{t("goals.newTitle")}</h2>
          <label className="field">
            <span className="label">{t("goals.exercise")}</span>
            <select className="input" value={exerciseId} onChange={(event) => setExerciseId(event.target.value)}>
              <option value="">{t("goals.chooseExercise")}</option>
              {MUSCLE_GROUPS.map((group) => {
                const inGroup = library.filter((exercise) => exercise.muscleGroup === group);
                if (inGroup.length === 0) return null;
                return (
                  <optgroup key={group} label={t(muscleGroupKey(group))}>
                    {inGroup
                      .sort((a, b) => exerciseName(a, language).localeCompare(exerciseName(b, language), language))
                      .map((exercise) => (
                        <option key={exercise.id} value={exercise.id}>
                          {exerciseName(exercise, language)}
                        </option>
                      ))}
                  </optgroup>
                );
              })}
            </select>
          </label>
          {chosen && metrics.length > 1 && (
            <div className="segmented" role="group" aria-label={t("goals.measure")}>
              {metrics.map((candidate) => (
                <button key={candidate} type="button" className="segmented-option" aria-pressed={activeMetric === candidate} onClick={() => setMetric(candidate)}>
                  {t(`goals.metric.${candidate}`)}
                </button>
              ))}
            </div>
          )}
          <label className="field">
            <span className="label">
              {t("goals.target")} ({targetUnit(activeMetric)})
            </span>
            <input className="input" type="text" inputMode="decimal" dir="ltr" value={target} onChange={(event) => setTarget(event.target.value)} />
          </label>
          <button className="btn btn-primary" type="submit" disabled={!chosen || parse(target) === null}>
            {t("goals.create")}
          </button>
          <button className="btn btn-ghost" type="button" onClick={() => setAdding(false)}>
            {t("common.cancel")}
          </button>
        </form>
      ) : (
        <button type="button" className="btn btn-dashed" onClick={() => setAdding(true)}>
          {t("goals.add")}
        </button>
      )}
    </Screen>
  );
}
