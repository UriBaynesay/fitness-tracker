import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { exerciseName, nextDayAfter, overloadHint, type HistorySet, type Language, type PlanDay } from "@fitness/shared";
import { useAuth } from "../auth/AuthContext";
import { UserIcon } from "../components/icons";
import { Screen } from "../components/Screen";
import { hintShort } from "../lib/hints";
import { setText } from "../lib/format";
import { loadHistory, loadToday, type TodayData } from "../session/data";
import { newId } from "../session/ids";
import { startEmpty, startFromDay, totalSets } from "../session/logic";
import { listWorkouts } from "../session/store";
import { buildWeek, lastFinishedDayId, mergeSessions, type WeekSession } from "../session/week";
import { useWorkout } from "../session/WorkoutContext";
import type { WorkoutDoc } from "../session/types";
import { useDocumentTitle } from "../lib/title";

const PREVIEW_EXERCISES = 3;

// Today: the workout in progress to resume, or the next day of the active plan to
// start, this week at a glance, and last time's numbers next to the plan's targets.
export function Home() {
  const { t, i18n } = useTranslation();
  useDocumentTitle(t("home.title"));
  const { state } = useAuth();
  const { active, ready, begin } = useWorkout();
  const navigate = useNavigate();
  const language = i18n.language;

  const [data, setData] = useState<TodayData | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [local, setLocal] = useState<WorkoutDoc[]>([]);
  const [chosenDayId, setChosenDayId] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [history, setHistory] = useState<Map<string, HistorySet[][]>>(new Map());
  const [starting, setStarting] = useState(false);

  const profileId = state.status === "authenticated" ? state.profile.id : null;

  useEffect(() => {
    if (!profileId) return;
    let cancelled = false;
    Promise.all([loadToday(profileId), listWorkouts(profileId)])
      .then(([today, docs]) => {
        if (cancelled) return;
        setData(today);
        setLocal(docs);
      })
      .catch(() => !cancelled && setLoadFailed(true));
    return () => {
      cancelled = true;
    };
  }, [profileId]);

  const plan = data?.plan ?? null;
  const days = plan?.days ?? [];

  // What the server knows plus what only this phone knows yet (a workout finished
  // offline a minute ago), so the rotation and the week are right either way.
  const sessions = useMemo<WeekSession[]>(
    () =>
      mergeSessions(
        data?.sessions ?? [],
        local.filter((doc) => doc.status === "finished"),
      ),
    [data, local]
  );

  const suggested = useMemo(
    () => nextDayAfter(days, lastFinishedDayId(sessions, days.map((day) => day.id))),
    [days, sessions]
  );
  const day: PlanDay | null = days.find((candidate) => candidate.id === chosenDayId) ?? suggested;

  const exerciseIds = day?.exercises.map((item) => item.exercise.id).join(",") ?? "";
  useEffect(() => {
    if (!profileId || exerciseIds === "") return;
    let cancelled = false;
    void loadHistory(profileId, exerciseIds.split(",")).then((found) => !cancelled && setHistory(found));
    return () => {
      cancelled = true;
    };
  }, [profileId, exerciseIds]);

  const week = useMemo(() => buildWeek(sessions, new Date()), [sessions]);

  if (state.status !== "authenticated") return null;
  const unit = state.profile.weightUnit;
  const dateText = new Intl.DateTimeFormat(language, { weekday: "long", day: "numeric", month: "long" }).format(new Date());
  const weekdayNarrow = new Intl.DateTimeFormat(language, { weekday: "narrow" });
  const weekdayLong = new Intl.DateTimeFormat(language, { weekday: "long" });

  async function startWorkout(from: PlanDay | null) {
    if (!profileId || starting) return;
    setStarting(true);
    const now = new Date();
    await begin(from ? startFromDay(from, { profileId, now, newId, history }) : startEmpty({ profileId, now, newId }));
    navigate("/workout");
  }

  const planned = (item: PlanDay["exercises"][number]) =>
    item.exercise.isTimed
      ? t("home.targetTimed", { sets: item.targetSets, seconds: item.targetDurationSeconds })
      : t("home.target", { sets: item.targetSets, reps: item.targetReps });

  let card;
  if (!ready || (!data && !loadFailed)) {
    card = <p className="status">{t("loading")}</p>;
  } else if (active) {
    const { done, planned: plannedSets } = totalSets(active);
    card = (
      <section className="card stack" aria-labelledby="resume-title">
        <span className="label">{t("home.inProgress")}</span>
        <h2 className="section-title" id="resume-title" dir="auto">
          {active.planDayName ?? t("workout.freeWorkout")}
        </h2>
        <p className="muted">{t("home.progress", { done, total: plannedSets })}</p>
        <Link to="/workout" className="btn btn-primary">
          {t("home.resume")}
        </Link>
      </section>
    );
  } else if (loadFailed) {
    card = (
      <>
        <p className="error" role="alert">
          {t("errors.load")}
        </p>
        <button type="button" className="btn btn-ghost" disabled={starting} onClick={() => void startWorkout(null)}>
          {t("home.startEmpty")}
        </button>
      </>
    );
  } else if (!plan || !day) {
    card = (
      <section className="card stack">
        <h2 className="section-title">{plan ? t("home.noDays") : t("home.noPlan")}</h2>
        <p className="muted">{t("home.noPlanBody")}</p>
        <Link to="/plans" className="btn btn-ghost">
          {t("home.openPlans")}
        </Link>
        <button type="button" className="btn btn-primary" disabled={starting} onClick={() => void startWorkout(null)}>
          {t("home.startEmpty")}
        </button>
      </section>
    );
  } else {
    const shown = day.exercises.slice(0, PREVIEW_EXERCISES);
    card = (
      <section className="card stack" aria-labelledby="day-title">
        <span className="label" dir="auto">
          {plan.name}
        </span>
        <h2 className="section-title day-title" id="day-title" dir="auto">
          {day.name}
        </h2>
        {day.exercises.length === 0 ? (
          <p className="muted">{t("home.dayEmpty")}</p>
        ) : (
          <ul className="preview">
            {shown.map((item) => (
              <li key={item.id}>
                <span dir="auto">{exerciseName(item.exercise, language as Language)}</span>
                <span className="muted-small">{planned(item)}</span>
              </li>
            ))}
            {day.exercises.length > shown.length && (
              <li className="muted-small">{t("home.more", { count: day.exercises.length - shown.length })}</li>
            )}
          </ul>
        )}
        {days.length > 1 && (
          <>
            <button type="button" className="btn btn-ghost" aria-expanded={choosing} onClick={() => setChoosing(!choosing)}>
              {t("home.chooseDay")}
            </button>
            {choosing && (
              <div className="chips" role="group" aria-label={t("home.chooseDay")}>
                {days.map((candidate) => (
                  <button
                    key={candidate.id}
                    type="button"
                    className="chip"
                    aria-pressed={candidate.id === day.id}
                    onClick={() => {
                      setChosenDayId(candidate.id);
                      setChoosing(false);
                    }}
                  >
                    <bdi>{candidate.name}</bdi>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
        <button type="button" className="btn btn-primary" disabled={starting || day.exercises.length === 0} onClick={() => void startWorkout(day)}>
          {t("home.start")}
        </button>
        <button type="button" className="btn btn-dashed" disabled={starting} onClick={() => void startWorkout(null)}>
          {t("home.startEmpty")}
        </button>
      </section>
    );
  }

  return (
    <Screen nav>
      <header className="screen-header">
        <div className="stack">
          <span className="label">{dateText}</span>
          <h1 className="title">{t("home.title")}</h1>
        </div>
        <Link to="/settings" className="icon-button" aria-label={t("settings.open")}>
          <UserIcon />
        </Link>
      </header>

      {data?.offline && <p className="notice">{t("home.offline")}</p>}
      {card}

      <section className="stack" aria-labelledby="week-title">
        <h2 className="label" id="week-title">
          {t("home.thisWeek")}
        </h2>
        <ol className="week">
          {week.map((entry) => (
            <li key={entry.date.toISOString()} className="week-day" aria-current={entry.isToday ? "date" : undefined}>
              <span className="week-letter">{weekdayNarrow.format(entry.date)}</span>
              <span
                className={entry.trained ? "week-dot week-dot-done" : entry.isToday ? "week-dot week-dot-today" : "week-dot"}
                role="img"
                aria-label={`${weekdayLong.format(entry.date)}: ${entry.trained ? t("home.trained") : t("home.rest")}`}
              >
                {entry.date.getDate()}
              </span>
              <span className="week-name" dir="auto">
                {entry.planDayNames[0] ?? ""}
              </span>
            </li>
          ))}
        </ol>
      </section>

      {!active && plan && day && day.exercises.length > 0 && (
        <section className="stack" aria-labelledby="targets-title">
          <h2 className="label" id="targets-title">
            {t("home.targets")}
          </h2>
          <ul className="list">
            {day.exercises.map((item) => {
              const recent = history.get(item.exercise.id) ?? [];
              const last = recent[0] ?? [];
              const hint = overloadHint(item, recent);
              return (
                <li key={item.id} className="card stack target-row">
                  <strong dir="auto">{exerciseName(item.exercise, language as Language)}</strong>
                  <span className="muted-small">
                    {t("home.planned")}: {planned(item)}
                  </span>
                  <span className="muted-small" dir="auto">
                    {t("home.last")}:{" "}
                    {last.length === 0 ? (
                      t("home.noHistory")
                    ) : (
                      <bdi dir="ltr">
                        {last.map((set) => setText(set, unit)).join(" · ")}
                        {item.exercise.isTimed ? "" : ` ${unit}`}
                      </bdi>
                    )}
                  </span>
                  {hint && (
                    <span className="hint-line" dir="auto">
                      {t("hint.try")}: <bdi dir="ltr">{hintShort(hint, unit)}</bdi>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </Screen>
  );
}
