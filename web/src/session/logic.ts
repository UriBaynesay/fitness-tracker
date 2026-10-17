import {
  MAX_SESSION_EXERCISES,
  MAX_SETS_PER_EXERCISE,
  defaultPlanExerciseConfig,
  hintValues,
  overloadHint,
  type HistorySet,
  type PlanDay,
  type PlanExerciseConfig,
  type SyncSession,
  type WeightUnit,
} from "@fitness/shared";
import type { ExerciseInfo, Position, SetValues, WorkoutDoc, WorkoutExercise } from "./types";

// Pure functions over the workout document. No React, no storage, no clock: the
// current time and new ids are passed in, which is what makes them easy to test.
// Every function returns a new document and leaves its input alone.

export type NewId = () => string;

const touch = (doc: WorkoutDoc, changes: Partial<WorkoutDoc>): WorkoutDoc => ({
  ...doc,
  ...changes,
  rev: doc.rev + 1,
  dirty: true,
});

const configOf = (config: PlanExerciseConfig): PlanExerciseConfig => ({
  targetSets: config.targetSets,
  targetReps: config.targetReps,
  targetDurationSeconds: config.targetDurationSeconds,
  restSeconds: config.restSeconds,
  progressionMode: config.progressionMode,
  failureTargetReps: config.failureTargetReps,
  sessionsToConfirm: config.sessionsToConfirm,
  weightStepKg: config.weightStepKg,
});

interface StartContext {
  profileId: string;
  now: Date;
  newId: NewId;
  // The last few finished workouts' sets per exercise id, newest first.
  history: Map<string, HistorySet[][]>;
}

export function startFromDay(day: PlanDay, context: StartContext): WorkoutDoc {
  const exercises: WorkoutExercise[] = [...day.exercises]
    .sort((a, b) => a.position - b.position)
    .map((item) => {
      const recent = context.history.get(item.exercise.id) ?? [];
      return {
        ...configOf(item),
        clientId: context.newId(),
        exerciseId: item.exercise.id,
        nameEn: item.exercise.nameEn,
        nameHe: item.exercise.nameHe,
        isTimed: item.exercise.isTimed,
        skipped: false,
        sets: [],
        previous: recent[0] ?? [],
        recent,
        hint: overloadHint(item, recent),
      };
    });
  return blank(context, day.id, day.name, exercises);
}

// A workout with no plan behind it: exercises are added as the person goes.
export function startEmpty(context: Omit<StartContext, "history">): WorkoutDoc {
  return blank(context, null, null, []);
}

function blank(
  context: { profileId: string; now: Date; newId: NewId },
  planDayId: string | null,
  planDayName: string | null,
  exercises: WorkoutExercise[]
): WorkoutDoc {
  return {
    clientId: context.newId(),
    profileId: context.profileId,
    status: "active",
    planDayId,
    planDayName,
    startedAt: context.now.toISOString(),
    endedAt: null,
    exercises,
    rest: null,
    rev: 1,
    dirty: true,
  };
}

// ---- where the person is ----------------------------------------------------

export const isExerciseDone = (exercise: WorkoutExercise): boolean =>
  exercise.skipped || exercise.sets.length >= exercise.targetSets;

// The first exercise that still has sets to do, and which set is next. null when
// everything is done or skipped.
export function currentPosition(doc: WorkoutDoc): Position | null {
  const exerciseIndex = doc.exercises.findIndex((exercise) => !isExerciseDone(exercise));
  if (exerciseIndex === -1) return null;
  return { exerciseIndex, setIndex: doc.exercises[exerciseIndex]!.sets.length };
}

export function nextExerciseAfter(doc: WorkoutDoc, exerciseIndex: number): WorkoutExercise | null {
  return doc.exercises.slice(exerciseIndex + 1).find((exercise) => !isExerciseDone(exercise)) ?? null;
}

export function totalSets(doc: WorkoutDoc): { done: number; planned: number } {
  let done = 0;
  let planned = 0;
  for (const exercise of doc.exercises) {
    done += exercise.sets.length;
    if (!exercise.skipped) planned += Math.max(exercise.targetSets, exercise.sets.length);
  }
  return { done, planned };
}

// ---- prefill ----------------------------------------------------------------

// What the steppers should show for a set. With an overload hint: its weight and reps
// (the weight follows what was actually lifted once a set is done). Otherwise the set
// just done in this workout, else the same set number last time, else the plan's
// target. Weight has no target, so a brand-new exercise starts at 0 and the person
// types their first weight.
export function prefill(exercise: WorkoutExercise, setIndex: number): SetValues {
  if (exercise.isTimed) {
    const lastDone = exercise.sets.at(-1);
    const before = exercise.previous[setIndex] ?? exercise.previous.at(-1);
    return {
      weightKg: null,
      reps: null,
      durationSeconds: lastDone?.durationSeconds ?? before?.durationSeconds ?? exercise.targetDurationSeconds ?? 30,
    };
  }
  const lastDone = exercise.sets.at(-1);
  if (exercise.hint && exercise.targetReps !== null) {
    const suggested = hintValues(exercise.hint, setIndex, { targetReps: exercise.targetReps, targetSets: exercise.targetSets });
    return { weightKg: lastDone?.weightKg ?? suggested.weightKg, reps: suggested.reps, durationSeconds: null };
  }
  const before = exercise.previous[setIndex] ?? exercise.previous.at(-1);
  return {
    weightKg: lastDone?.weightKg ?? before?.weightKg ?? 0,
    reps: lastDone?.reps ?? before?.reps ?? exercise.targetReps ?? 10,
    durationSeconds: null,
  };
}

// ---- changes ----------------------------------------------------------------

export function completeSet(
  doc: WorkoutDoc,
  exerciseIndex: number,
  values: SetValues,
  context: { now: Date; newId: NewId }
): WorkoutDoc {
  const exercise = doc.exercises[exerciseIndex];
  if (!exercise || exercise.skipped || exercise.sets.length >= MAX_SETS_PER_EXERCISE) return doc;

  const set = {
    clientId: context.newId(),
    setNumber: exercise.sets.length + 1,
    weightKg: exercise.isTimed ? null : values.weightKg,
    reps: exercise.isTimed ? null : values.reps,
    durationSeconds: exercise.isTimed ? values.durationSeconds : null,
    // Only the last set of a "to failure" exercise is taken to failure.
    toFailure: exercise.progressionMode === "failure" && exercise.sets.length + 1 === exercise.targetSets,
    completedAt: context.now.toISOString(),
  };
  const exercises = doc.exercises.map((item, index) => (index === exerciseIndex ? { ...item, sets: [...item.sets, set] } : item));
  const next = { ...doc, exercises };

  // No rest after the very last set of the workout: there is nothing to rest for.
  const rest =
    currentPosition(next) === null
      ? null
      : { endsAt: context.now.getTime() + exercise.restSeconds * 1000, totalSeconds: exercise.restSeconds };
  return touch(doc, { exercises, rest: rest && rest.totalSeconds > 0 ? rest : null });
}

export function undoLastSet(doc: WorkoutDoc, exerciseIndex: number): WorkoutDoc {
  const exercise = doc.exercises[exerciseIndex];
  if (!exercise || exercise.sets.length === 0) return doc;
  const exercises = doc.exercises.map((item, index) => (index === exerciseIndex ? { ...item, sets: item.sets.slice(0, -1) } : item));
  return touch(doc, { exercises, rest: null });
}

export function adjustRest(doc: WorkoutDoc, deltaSeconds: number, now: Date): WorkoutDoc {
  if (!doc.rest) return doc;
  const endsAt = Math.max(now.getTime(), doc.rest.endsAt + deltaSeconds * 1000);
  return touch(doc, { rest: { endsAt, totalSeconds: Math.max(1, doc.rest.totalSeconds + deltaSeconds) } });
}

export function endRest(doc: WorkoutDoc): WorkoutDoc {
  return doc.rest ? touch(doc, { rest: null }) : doc;
}

export function setSkipped(doc: WorkoutDoc, exerciseIndex: number, skipped: boolean): WorkoutDoc {
  const exercise = doc.exercises[exerciseIndex];
  if (!exercise || exercise.skipped === skipped) return doc;
  const exercises = doc.exercises.map((item, index) => (index === exerciseIndex ? { ...item, skipped } : item));
  return touch(doc, { exercises, rest: null });
}

export function moveExercise(doc: WorkoutDoc, exerciseIndex: number, delta: -1 | 1): WorkoutDoc {
  const target = exerciseIndex + delta;
  if (target < 0 || target >= doc.exercises.length) return doc;
  const exercises = [...doc.exercises];
  [exercises[exerciseIndex], exercises[target]] = [exercises[target]!, exercises[exerciseIndex]!];
  return touch(doc, { exercises });
}

export function canAddExercise(doc: WorkoutDoc): boolean {
  return doc.exercises.length < MAX_SESSION_EXERCISES;
}

export function addExercise(
  doc: WorkoutDoc,
  info: ExerciseInfo,
  context: { unit: WeightUnit; newId: NewId; recent: HistorySet[][] }
): WorkoutDoc {
  if (!canAddExercise(doc)) return doc;
  const config = defaultPlanExerciseConfig(info.isTimed, context.unit);
  const added: WorkoutExercise = {
    ...config,
    ...info,
    clientId: context.newId(),
    skipped: false,
    sets: [],
    previous: context.recent[0] ?? [],
    recent: context.recent,
    hint: overloadHint(config, context.recent),
  };
  return touch(doc, { exercises: [...doc.exercises, added], rest: null });
}

// Finishing leaves nothing "pending": an exercise with no logged sets counts as skipped.
export function finish(doc: WorkoutDoc, now: Date): WorkoutDoc {
  const exercises = doc.exercises.map((exercise) =>
    exercise.sets.length === 0 ? { ...exercise, skipped: true } : exercise
  );
  return touch(doc, { exercises, status: "finished", endedAt: now.toISOString(), rest: null });
}

export function discard(doc: WorkoutDoc): WorkoutDoc {
  return touch(doc, { status: "discarded", exercises: [], rest: null });
}

// ---- reading ----------------------------------------------------------------

export interface WorkoutSummary {
  volumeKg: number;
  setsDone: number;
  exercisesDone: number;
  exercisesSkipped: number;
  durationSeconds: number;
}

export function summarize(doc: WorkoutDoc): WorkoutSummary {
  let volumeKg = 0;
  let setsDone = 0;
  for (const exercise of doc.exercises) {
    for (const set of exercise.sets) {
      setsDone += 1;
      if (set.weightKg !== null && set.reps !== null) volumeKg += set.weightKg * set.reps;
    }
  }
  const end = doc.endedAt ? Date.parse(doc.endedAt) : Date.now();
  return {
    volumeKg,
    setsDone,
    exercisesDone: doc.exercises.filter((exercise) => !exercise.skipped && exercise.sets.length > 0).length,
    exercisesSkipped: doc.exercises.filter((exercise) => exercise.skipped).length,
    durationSeconds: Math.max(0, Math.round((end - Date.parse(doc.startedAt)) / 1000)),
  };
}

// The shape the server accepts (see shared/sessions.ts). Order in the array is the
// position, so reordering needs no extra bookkeeping.
export function toSyncDocument(doc: WorkoutDoc): SyncSession {
  return {
    clientId: doc.clientId,
    planDayId: doc.planDayId,
    planDayName: doc.planDayName,
    startedAt: doc.startedAt,
    endedAt: doc.endedAt,
    exercises: doc.exercises.map((exercise, position) => ({
      ...configOf(exercise),
      clientId: exercise.clientId,
      exerciseId: exercise.exerciseId,
      position,
      skipped: exercise.skipped,
      sets: exercise.sets,
    })),
  };
}
