import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import type { Language, Plan, PlanDay, UpdatePlanExerciseInput } from "@fitness/shared";
import { ApiError, api } from "../api";
import { useAuth } from "../auth/AuthContext";
import { ConfirmButton } from "../components/ConfirmButton";
import { TextField } from "../components/fields";
import { ChevronEndIcon, ChevronStartIcon } from "../components/icons";
import { Screen } from "../components/Screen";
import { ExerciseCard } from "../plans/ExerciseCard";

export function PlanEditor() {
  const { planId = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { state } = useAuth();
  const unit = state.status === "authenticated" ? state.profile.weightUnit : "kg";
  const language = i18n.language as Language;

  const [plan, setPlan] = useState<Plan | null>(null);
  const [loadError, setLoadError] = useState<"not_found" | "generic" | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // True while a structural save is in flight. "Add day" waits for it, so a quick
  // double-tap can't add two days or name the second from out-of-date state.
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.plans
      .get(planId)
      .then(({ plan: loaded }) => !cancelled && setPlan(loaded))
      .catch((error) => !cancelled && setLoadError(error instanceof ApiError && error.status === 404 ? "not_found" : "generic"));
    return () => {
      cancelled = true;
    };
  }, [planId]);

  // The URL carries the selected day, so coming back from the exercise picker
  // lands on the same day.
  const selectedDay: PlanDay | null = plan?.days.find((day) => day.id === searchParams.get("day")) ?? plan?.days[0] ?? null;
  const selectDay = (id: string) => setSearchParams({ day: id }, { replace: true });
  const expanded = selectedDay?.exercises.find((e) => e.id === expandedId) ?? selectedDay?.exercises[0] ?? null;

  // Every structural endpoint answers with the whole updated plan. On failure the
  // banner shows and the promise rejects, so an autosaving field can revert itself.
  async function run(action: () => Promise<{ plan: Plan }>): Promise<Plan> {
    setSaveError(null);
    setBusy(true);
    try {
      const { plan: next } = await action();
      setPlan(next);
      return next;
    } catch (error) {
      setSaveError(error instanceof ApiError ? error.code : "generic");
      throw error;
    } finally {
      setBusy(false);
    }
  }
  const attempt = (action: () => Promise<{ plan: Plan }>) => run(action).catch(() => undefined);

  if (loadError) {
    return (
      <Screen nav>
        <p className="error" role="alert">
          {loadError === "not_found" ? t("errors.notFound") : t("errors.load")}
        </p>
        <Link to="/plans" className="btn btn-ghost">
          {t("nav.plans")}
        </Link>
      </Screen>
    );
  }
  if (!plan) return <p className="status">{t("loading")}</p>;

  async function addDay() {
    const next = await attempt(() => api.days.create(plan!.id, t("plan.defaultDayName", { n: plan!.days.length + 1 })));
    const created = next?.days[next.days.length - 1];
    if (created) selectDay(created.id);
  }

  async function moveDay(day: PlanDay, delta: -1 | 1) {
    await attempt(() => api.days.update(day.id, { position: day.position + delta }));
  }

  async function deleteDay(day: PlanDay) {
    const next = await attempt(() => api.days.remove(day.id));
    if (next?.days[0]) selectDay(next.days[Math.min(day.position, next.days.length - 1)]!.id);
  }

  const dayIndex = selectedDay ? plan.days.findIndex((d) => d.id === selectedDay.id) : -1;

  return (
    <Screen nav>
      <header className="plan-header">
        <div className="plan-kicker">
          <span className="label">{t("plan.label")}</span>
          {plan.isActive && <span className="pill">{t("plans.active")}</span>}
        </div>
        <h1 className="title" dir="auto">
          {plan.name}
        </h1>
      </header>

      {saveError && (
        <p className="error" role="alert">
          {t(`errors.${saveError}`, { defaultValue: t("errors.save") })}
        </p>
      )}

      <div className="chips" role="group" aria-label={t("plan.days")}>
        {plan.days.map((day) => (
          <button
            key={day.id}
            type="button"
            className="chip"
            aria-pressed={day.id === selectedDay?.id}
            onClick={() => selectDay(day.id)}
          >
            {day.name}
          </button>
        ))}
        <button type="button" className="chip chip-add" aria-label={t("plan.addDay")} disabled={busy} onClick={() => void addDay()}>
          +
        </button>
      </div>

      {!selectedDay && <p className="muted">{t("plan.noDays")}</p>}

      {selectedDay && (
        <>
          <section className="card form">
            <TextField
              label={t("plan.dayName")}
              value={selectedDay.name}
              onCommit={async (name) => void (await run(() => api.days.update(selectedDay.id, { name })))}
            />
            <div className="card-actions">
              <button
                type="button"
                className="icon-button"
                aria-label={t("plan.moveDayEarlier")}
                disabled={dayIndex <= 0}
                onClick={() => void moveDay(selectedDay, -1)}
              >
                <ChevronStartIcon />
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label={t("plan.moveDayLater")}
                disabled={dayIndex === plan.days.length - 1}
                onClick={() => void moveDay(selectedDay, 1)}
              >
                <ChevronEndIcon />
              </button>
              <ConfirmButton
                label={t("plan.deleteDay")}
                question={t("plan.confirmDeleteDay")}
                onConfirm={() => deleteDay(selectedDay)}
              />
            </div>
          </section>

          {selectedDay.exercises.length === 0 && <p className="muted">{t("plan.noExercises")}</p>}

          <div className="stack">
            {selectedDay.exercises.map((item, index) => (
              <ExerciseCard
                key={item.id}
                item={item}
                index={index}
                total={selectedDay.exercises.length}
                expanded={item.id === expanded?.id}
                unit={unit}
                language={language}
                onExpand={() => setExpandedId(item.id)}
                onChange={async (patch: UpdatePlanExerciseInput) => void (await run(() => api.planExercises.update(item.id, patch)))}
                onMove={async (delta) => void (await run(() => api.planExercises.update(item.id, { position: item.position + delta })))}
                onRemove={async () => void (await run(() => api.planExercises.remove(item.id)))}
              />
            ))}
          </div>

          <Link to={`/plans/${plan.id}/add-exercise?day=${selectedDay.id}`} className="btn btn-dashed">
            {t("plan.addExercise")}
          </Link>
        </>
      )}

      <details className="card options">
        <summary>{t("plan.options")}</summary>
        <div className="form">
          <TextField
            label={t("plan.rename")}
            value={plan.name}
            onCommit={async (name) => void (await run(() => api.plans.update(plan.id, { name })))}
          />
          {plan.isActive ? (
            <p className="muted">{t("plan.isActive")}</p>
          ) : (
            <button type="button" className="btn btn-primary" onClick={() => void attempt(() => api.plans.update(plan.id, { isActive: true }))}>
              {t("plan.makeActive")}
            </button>
          )}
          <ConfirmButton
            label={t("plan.deletePlan")}
            question={t("plan.confirmDeletePlan")}
            onConfirm={async () => {
              try {
                await api.plans.remove(plan.id);
                navigate("/plans", { replace: true });
              } catch {
                setSaveError("generic");
              }
            }}
          />
        </div>
      </details>
    </Screen>
  );
}
