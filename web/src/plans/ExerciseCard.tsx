import { useTranslation } from "react-i18next";
import {
  displayToKg,
  exerciseName,
  kgToDisplay,
  type Language,
  type PlanExercise,
  type UpdatePlanExerciseInput,
  type WeightUnit,
} from "@fitness/shared";
import { ConfirmButton } from "../components/ConfirmButton";
import { NumberField } from "../components/fields";
import { ChevronDownIcon, ChevronUpIcon } from "../components/icons";

interface ExerciseCardProps {
  item: PlanExercise;
  index: number;
  total: number;
  expanded: boolean;
  unit: WeightUnit;
  language: Language;
  onExpand: () => void;
  onChange: (patch: UpdatePlanExerciseInput) => Promise<void>;
  onMove: (delta: -1 | 1) => Promise<void>;
  onRemove: () => Promise<void>;
}

// Weight step limits shown in the user's unit (stored in kg: 0.25 to 50).
const STEP_LIMITS = { kg: { min: 0.25, max: 50 }, lb: { min: 0.5, max: 110 } } as const;

export function ExerciseCard({
  item,
  index,
  total,
  expanded,
  unit,
  language,
  onExpand,
  onChange,
  onMove,
  onRemove,
}: ExerciseCardProps) {
  const { t } = useTranslation();
  const name = exerciseName(item.exercise, language);
  const timed = item.targetDurationSeconds !== null;
  const failure = item.progressionMode === "failure";
  const position = t("plan.position", { index: index + 1, total });

  if (!expanded) {
    const summary = timed
      ? t("plan.summaryTimed", { sets: item.targetSets, seconds: item.targetDurationSeconds, rest: item.restSeconds })
      : failure
        ? t("plan.summaryFailure", {
            sets: item.targetSets,
            reps: item.targetReps,
            rest: item.restSeconds,
            goal: item.failureTargetReps,
            sessions: item.sessionsToConfirm,
          })
        : t("plan.summaryReps", {
            sets: item.targetSets,
            reps: item.targetReps,
            rest: item.restSeconds,
            mode: t("plan.hitTarget"),
          });
    return (
      <button type="button" className="list-row list-row-button" onClick={onExpand}>
        <span className="list-row-main">
          <span className="list-row-title" dir="auto">
            {name}
          </span>
          <span className="muted-small">{summary}</span>
        </span>
        <span className="muted-small position">{position}</span>
      </button>
    );
  }

  const reps = item.targetReps ?? 0;
  const goal = item.failureTargetReps ?? reps + 1;
  const stepLimits = STEP_LIMITS[unit];

  return (
    <section className="card card-selected" aria-label={name}>
      <div className="card-head">
        <h2 className="exercise-name" dir="auto">
          {name}
        </h2>
        <span className="muted-small position">{position}</span>
      </div>

      <div className="field-grid">
        <NumberField label={t("plan.sets")} value={item.targetSets} min={1} max={20} onCommit={(v) => onChange({ targetSets: v })} />
        {timed ? (
          <NumberField
            label={t("plan.targetTime")}
            value={item.targetDurationSeconds ?? 0}
            min={5}
            max={3600}
            onCommit={(v) => onChange({ targetDurationSeconds: v })}
          />
        ) : (
          <NumberField label={t("plan.targetReps")} value={reps} min={1} max={100} onCommit={(v) => onChange({ targetReps: v })} />
        )}
        <NumberField label={t("plan.rest")} value={item.restSeconds} min={0} max={600} onCommit={(v) => onChange({ restSeconds: v })} />
        {!timed && (
          <NumberField
            label={t("plan.weightStep", { unit })}
            value={kgToDisplay(item.weightStepKg ?? 0, unit)}
            min={stepLimits.min}
            max={stepLimits.max}
            integer={false}
            onCommit={(v) => onChange({ weightStepKg: displayToKg(v, unit) })}
          />
        )}
      </div>

      {timed ? (
        <p className="hint">{t("plan.hintTimed", { seconds: item.targetDurationSeconds })}</p>
      ) : (
        <div className="field">
          <span className="field-label">{t("plan.progression")}</span>
          <div className="segmented segmented-full" role="group" aria-label={t("plan.progression")}>
            <button
              type="button"
              className="segmented-option"
              aria-pressed={!failure}
              onClick={() => void (failure ? onChange({ progressionMode: "target" }).catch(() => undefined) : undefined)}
            >
              {t("plan.hitTarget")}
            </button>
            <button
              type="button"
              className="segmented-option"
              aria-pressed={failure}
              onClick={() => void (failure ? undefined : onChange({ progressionMode: "failure" }).catch(() => undefined))}
            >
              {t("plan.lastSetToFailure")}
            </button>
          </div>
          {failure ? (
            <>
              <div className="field-grid">
                <NumberField
                  label={t("plan.failureGoal")}
                  value={goal}
                  min={reps + 1}
                  max={200}
                  onCommit={(v) => onChange({ failureTargetReps: v })}
                />
                <NumberField
                  label={t("plan.confirmOver")}
                  value={item.sessionsToConfirm}
                  min={1}
                  max={10}
                  onCommit={(v) => onChange({ sessionsToConfirm: v })}
                />
              </div>
              <p className="hint">
                {t("plan.hintFailure", {
                  earlier: Math.max(item.targetSets - 1, 1),
                  reps,
                  goal,
                  sessions: item.sessionsToConfirm,
                  sets: item.targetSets,
                })}
              </p>
            </>
          ) : (
            <p className="hint">{t("plan.hintTarget", { reps })}</p>
          )}
        </div>
      )}

      <div className="card-actions">
        <button
          type="button"
          className="icon-button"
          aria-label={t("plan.moveUp")}
          disabled={index === 0}
          onClick={() => void onMove(-1).catch(() => undefined)}
        >
          <ChevronUpIcon />
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label={t("plan.moveDown")}
          disabled={index === total - 1}
          onClick={() => void onMove(1).catch(() => undefined)}
        >
          <ChevronDownIcon />
        </button>
        <ConfirmButton label={t("plan.remove")} question={t("plan.confirmRemove")} onConfirm={() => onRemove().catch(() => undefined)} />
      </div>
    </section>
  );
}
