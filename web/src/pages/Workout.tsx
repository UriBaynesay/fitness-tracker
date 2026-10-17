import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { displayToKg, exerciseName, kgToDisplay, type Language, type WeightUnit } from "@fitness/shared";
import { useAuth } from "../auth/AuthContext";
import { ConfirmButton } from "../components/ConfirmButton";
import { ChevronDownIcon, ChevronUpIcon } from "../components/icons";
import { Screen } from "../components/Screen";
import { Stepper } from "../components/Stepper";
import { setText } from "../lib/format";
import { primeAudio, useWakeLock } from "../session/alerts";
import { newId } from "../session/ids";
import {
  adjustRest,
  canAddExercise,
  completeSet,
  currentPosition,
  discard,
  endRest,
  finish,
  isExerciseDone,
  moveExercise,
  nextExerciseAfter,
  prefill,
  setSkipped,
  totalSets,
  undoLastSet,
} from "../session/logic";
import { RestView } from "../session/RestView";
import type { WorkoutDoc, WorkoutExercise } from "../session/types";
import { useWorkout } from "../session/WorkoutContext";

interface Draft {
  key: string;
  weight: number;
  reps: number;
  seconds: number;
}

// What the steppers start at for a given set, in the person's own unit.
function freshDraft(exercise: WorkoutExercise, setIndex: number, unit: WeightUnit): Draft {
  const values = prefill(exercise, setIndex);
  return {
    key: `${exercise.clientId}:${setIndex}`,
    weight: kgToDisplay(values.weightKg ?? 0, unit),
    reps: values.reps ?? 10,
    seconds: values.durationSeconds ?? 30,
  };
}

export function Workout() {
  const { t, i18n } = useTranslation();
  const { state } = useAuth();
  const { active, ready, update, whenSaved } = useWorkout();
  const navigate = useNavigate();
  const language = i18n.language as Language;
  const leaving = useRef(false);

  const [panel, setPanel] = useState<"work" | "overview">("work");
  const [sheet, setSheet] = useState(false);
  const [edited, setEdited] = useState<Draft | null>(null);

  useWakeLock(active !== null);
  // A rest is over the moment the workout changes shape under it.
  useEffect(() => setSheet(false), [active?.rev]);

  if (state.status !== "authenticated") return null;
  if (!ready) return <p className="status">{t("loading")}</p>;
  if (!active) return leaving.current ? null : <Navigate to="/" replace />;

  const unit = state.profile.weightUnit;
  const position = currentPosition(active);
  const exercise = position ? active.exercises[position.exerciseIndex]! : null;
  const total = active.exercises.length;
  const progress = total === 0 ? 0 : position ? position.exerciseIndex + 1 : total;

  function leaveTo(path: string) {
    leaving.current = true;
    navigate(path, { replace: true });
  }
  async function finishWorkout(doc: WorkoutDoc) {
    // The summary reads the finished workout back from IndexedDB, so wait for the save.
    leaving.current = true;
    update((current) => finish(current, new Date()));
    await whenSaved();
    leaveTo(`/workout/summary/${doc.clientId}`);
  }

  const header = (
    <header className="workout-header">
      <button type="button" className="btn btn-ghost btn-small" onClick={() => setSheet(true)}>
        {t("workout.exit")}
      </button>
      <span className="muted-small" dir="auto">
        {active.planDayName ?? t("workout.freeWorkout")}
      </span>
      <button
        type="button"
        className="btn btn-ghost btn-small position"
        aria-label={t("workout.overview")}
        aria-expanded={panel === "overview"}
        onClick={() => setPanel(panel === "overview" ? "work" : "overview")}
      >
        {t("workout.progress", { current: progress, total })}
      </button>
    </header>
  );

  const exitSheet = sheet && (
    <div className="sheet-backdrop">
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
        <h2 className="section-title" id="sheet-title">
          {t("workout.sheetTitle")}
        </h2>
        <button type="button" className="btn btn-primary" autoFocus onClick={() => setSheet(false)}>
          {t("workout.keepGoing")}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => void finishWorkout(active)}>
          {t("workout.finishNow")}
        </button>
        <ConfirmButton
          label={t("workout.discard")}
          question={t("workout.discardQuestion")}
          className="btn btn-danger"
          onConfirm={() => {
            update(discard);
            leaveTo("/");
          }}
        />
      </div>
    </div>
  );

  if (panel === "overview") {
    return (
      <Screen>
        {header}
        <h1 className="title">{t("workout.overview")}</h1>
        <ul className="list">
          {active.exercises.map((item, index) => {
            const done = isExerciseDone(item);
            const status = item.skipped
              ? t("workout.skipped")
              : t("workout.setsStatus", { done: item.sets.length, total: item.targetSets });
            return (
              <li key={item.clientId} className={position?.exerciseIndex === index ? "overview-row overview-current" : "overview-row"}>
                <div className="list-row-main">
                  <span className="list-row-title" dir="auto">
                    {exerciseName(item, language)}
                  </span>
                  <span className="muted-small">
                    {status}
                    {done && !item.skipped ? ` · ${t("workout.done")}` : ""}
                  </span>
                </div>
                <div className="overview-actions">
                  <button type="button" className="icon-button" aria-label={t("plan.moveUp")} disabled={index === 0} onClick={() => update((doc) => moveExercise(doc, index, -1))}>
                    <ChevronUpIcon />
                  </button>
                  <button type="button" className="icon-button" aria-label={t("plan.moveDown")} disabled={index === total - 1} onClick={() => update((doc) => moveExercise(doc, index, 1))}>
                    <ChevronDownIcon />
                  </button>
                  <button type="button" className="btn btn-ghost btn-small" onClick={() => update((doc) => setSkipped(doc, index, !item.skipped))}>
                    {item.skipped ? t("workout.unskip") : t("workout.skip")}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
        {canAddExercise(active) && (
          <Link to="/workout/add-exercise" className="btn btn-dashed">
            {t("workout.addExercise")}
          </Link>
        )}
        <button type="button" className="btn btn-primary" onClick={() => setPanel("work")}>
          {t("workout.backToWorkout")}
        </button>
        {exitSheet}
      </Screen>
    );
  }

  if (active.rest) {
    const upcoming = exercise && position ? { exercise, setIndex: position.setIndex } : null;
    const values = upcoming ? prefill(upcoming.exercise, upcoming.setIndex) : null;
    return (
      <Screen>
        {header}
        <RestView
          rest={active.rest}
          nextLabel={upcoming ? exerciseName(upcoming.exercise, language) : t("workout.allDone")}
          nextDetail={
            upcoming && values
              ? `${t("workout.setOf", { n: upcoming.setIndex + 1, total: Math.max(upcoming.exercise.targetSets, upcoming.setIndex + 1) })} · ${setText(values, unit)}${values.durationSeconds === null ? ` ${unit}` : ""}`
              : ""
          }
          onAdjust={(delta) => update((doc) => adjustRest(doc, delta, new Date()))}
          onEnd={() => update(endRest)}
        />
        {exitSheet}
      </Screen>
    );
  }

  // Nothing left to do (or nothing added yet).
  if (!exercise || !position) {
    return (
      <Screen>
        {header}
        {total === 0 ? (
          <section className="card stack">
            <h1 className="section-title">{t("workout.emptyTitle")}</h1>
            <p className="muted">{t("workout.emptyBody")}</p>
          </section>
        ) : (
          <section className="card stack">
            <h1 className="section-title">{t("workout.allDone")}</h1>
            <SetsSummary doc={active} />
          </section>
        )}
        {canAddExercise(active) && (
          <Link to="/workout/add-exercise" className="btn btn-dashed">
            {t("workout.addExercise")}
          </Link>
        )}
        {total > 0 && (
          <button type="button" className="btn btn-primary" onClick={() => void finishWorkout(active)}>
            {t("workout.finish")}
          </button>
        )}
        {exitSheet}
      </Screen>
    );
  }

  const draft = edited?.key === `${exercise.clientId}:${position.setIndex}` ? edited : freshDraft(exercise, position.setIndex, unit);
  const patch = (changes: Partial<Draft>) => setEdited({ ...draft, ...changes });
  const upNext = nextExerciseAfter(active, position.exerciseIndex);
  const lastSet = position.setIndex + 1 >= exercise.targetSets;
  const stepKg = exercise.weightStepKg ?? 2.5;
  const rows = Math.max(exercise.targetSets, exercise.sets.length + 1);

  function onComplete() {
    primeAudio();
    update((doc) =>
      completeSet(
        doc,
        position!.exerciseIndex,
        {
          weightKg: displayToKg(draft.weight, unit),
          reps: draft.reps,
          durationSeconds: draft.seconds,
        },
        { now: new Date(), newId }
      )
    );
  }

  return (
    <Screen>
      {header}
      <section className="stack">
        <h1 className="title workout-title" dir="auto">
          {exerciseName(exercise, language)}
        </h1>
        <p className="muted">
          {exercise.isTimed
            ? t("workout.targetTimed", { sets: exercise.targetSets, seconds: exercise.targetDurationSeconds })
            : t("workout.target", { sets: exercise.targetSets, reps: exercise.targetReps })}
          {" · "}
          {t("workout.restInfo", { seconds: exercise.restSeconds })}
        </p>
        {exercise.previous.length > 0 && (
          <p className="muted-small">
            {t("workout.lastTime", {
              sets: exercise.previous.map((set) => setText(set, unit)).join(" · "),
            })}
            {exercise.isTimed ? "" : ` ${unit}`}
          </p>
        )}
      </section>

      <ol className="set-rows" aria-label={t("workout.sets")}>
        {Array.from({ length: rows }, (_, index) => {
          const done = exercise.sets[index];
          const current = index === position.setIndex;
          return (
            <li key={index} className={done ? "set-row set-row-done" : current ? "set-row set-row-active" : "set-row"} aria-current={current ? "step" : undefined}>
              <span className="set-row-number">{t("workout.setLabel", { n: index + 1 })}</span>
              <span className="set-row-value" dir="ltr">
                {done ? setText(done, unit) : current ? setText(
                  exercise.isTimed
                    ? { weightKg: null, reps: null, durationSeconds: draft.seconds }
                    : { weightKg: displayToKg(draft.weight, unit), reps: draft.reps, durationSeconds: null },
                  unit
                ) : "–"}
              </span>
              {done && <span className="accent" aria-label={t("workout.done")}>✓</span>}
              {current && exercise.progressionMode === "failure" && lastSet && <span className="tag">{t("workout.toFailure")}</span>}
            </li>
          );
        })}
      </ol>

      <div className="steppers">
        {exercise.isTimed ? (
          <Stepper label={t("workout.seconds")} value={draft.seconds} step={5} min={1} max={3600} onChange={(seconds) => patch({ seconds })} />
        ) : (
          <>
            <Stepper
              label={t("workout.weight")}
              unit={t(`settings.${unit}`)}
              value={draft.weight}
              step={Math.max(0.25, kgToDisplay(stepKg, unit))}
              min={0}
              max={1000}
              onChange={(weight) => patch({ weight })}
            />
            <Stepper label={t("workout.reps")} value={draft.reps} step={1} min={1} max={1000} onChange={(reps) => patch({ reps })} />
          </>
        )}
      </div>

      <button type="button" className="btn btn-primary btn-large" onClick={onComplete}>
        {t("workout.completeSet", { n: position.setIndex + 1 })}
      </button>
      {exercise.sets.length > 0 && (
        <button type="button" className="btn btn-ghost" onClick={() => update((doc) => undoLastSet(doc, position.exerciseIndex))}>
          {t("workout.undo")}
        </button>
      )}
      <p className="muted-small up-next">
        {upNext ? t("workout.upNext", { name: exerciseName(upNext, language) }) : t("workout.lastExercise")}
      </p>
      {exitSheet}
    </Screen>
  );
}

function SetsSummary({ doc }: { doc: WorkoutDoc }) {
  const { t } = useTranslation();
  const { done } = totalSets(doc);
  return <p className="muted">{t("workout.setsLogged", { count: done })}</p>;
}
