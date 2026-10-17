import { describe, expect, it } from "vitest";
import { syncSessionSchema, type PlanDay, type PlanExercise } from "@fitness/shared";
import {
  addExercise,
  adjustRest,
  completeSet,
  currentPosition,
  discard,
  endRest,
  finish,
  moveExercise,
  nextExerciseAfter,
  prefill,
  setSkipped,
  startEmpty,
  startFromDay,
  summarize,
  toSyncDocument,
  totalSets,
  undoLastSet,
} from "./logic";

let counter = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`;
const T0 = new Date("2026-10-17T10:00:00.000Z");
const at = (seconds: number) => new Date(T0.getTime() + seconds * 1000);

function planExercise(position: number, overrides: Partial<PlanExercise> & { timed?: boolean } = {}): PlanExercise {
  const timed = overrides.timed ?? false;
  return {
    id: uuid(),
    planDayId: "d0000000-0000-4000-8000-000000000001",
    position,
    targetSets: 3,
    targetReps: timed ? null : 10,
    targetDurationSeconds: timed ? 30 : null,
    restSeconds: 90,
    progressionMode: "target",
    failureTargetReps: null,
    sessionsToConfirm: 2,
    weightStepKg: timed ? null : 2.5,
    exercise: {
      id: uuid(),
      slug: `ex-${position}`,
      nameEn: `Exercise ${position}`,
      nameHe: null,
      muscleGroup: "chest",
      equipment: "barbell",
      isTimed: timed,
      isCustom: false,
    },
    ...overrides,
  };
}

function day(exercises: PlanExercise[]): PlanDay {
  return { id: "d0000000-0000-4000-8000-000000000001", planId: uuid(), name: "Push", position: 0, exercises };
}

const start = (exercises: PlanExercise[], history = new Map()) =>
  startFromDay(day(exercises), { profileId: "p", now: T0, newId: uuid, history });

const reps = (weightKg: number, count: number) => ({ weightKg, reps: count, durationSeconds: null });
const ctx = (seconds: number) => ({ now: at(seconds), newId: uuid });

describe("starting", () => {
  it("copies the plan day in order, with the configuration, names and last time's sets", () => {
    const a = planExercise(1);
    const b = planExercise(0);
    const previous = [{ weightKg: 60, reps: 8, durationSeconds: null, toFailure: false }];
    const doc = start([a, b], new Map([[a.exercise.id, [previous]]]));
    expect(doc.exercises.map((e) => e.exerciseId)).toEqual([b.exercise.id, a.exercise.id]);
    expect(doc.exercises[1]).toMatchObject({ targetSets: 3, restSeconds: 90, nameEn: "Exercise 1", previous, sets: [] });
    expect(doc).toMatchObject({ status: "active", planDayName: "Push", endedAt: null, rest: null, dirty: true });
  });

  it("an empty workout has no day and no exercises", () => {
    const doc = startEmpty({ profileId: "p", now: T0, newId: uuid });
    expect(doc).toMatchObject({ planDayId: null, planDayName: null, exercises: [] });
    expect(currentPosition(doc)).toBeNull();
  });
});

describe("progress through a workout", () => {
  it("moves to the next set, then the next exercise, then to done", () => {
    let doc = start([planExercise(0, { targetSets: 2 }), planExercise(1, { targetSets: 1 })]);
    expect(currentPosition(doc)).toEqual({ exerciseIndex: 0, setIndex: 0 });
    doc = completeSet(doc, 0, reps(50, 10), ctx(10));
    expect(currentPosition(doc)).toEqual({ exerciseIndex: 0, setIndex: 1 });
    doc = completeSet(doc, 0, reps(50, 10), ctx(100));
    expect(currentPosition(doc)).toEqual({ exerciseIndex: 1, setIndex: 0 });
    doc = completeSet(doc, 1, reps(30, 12), ctx(200));
    expect(currentPosition(doc)).toBeNull();
    expect(totalSets(doc)).toEqual({ done: 3, planned: 3 });
  });

  it("skipped exercises are passed over and don't count as planned", () => {
    let doc = start([planExercise(0), planExercise(1)]);
    doc = setSkipped(doc, 0, true);
    expect(currentPosition(doc)?.exerciseIndex).toBe(1);
    expect(totalSets(doc).planned).toBe(3);
    doc = setSkipped(doc, 0, false);
    expect(currentPosition(doc)?.exerciseIndex).toBe(0);
  });

  it("knows what is up next", () => {
    const doc = start([planExercise(0), planExercise(1), planExercise(2)]);
    expect(nextExerciseAfter(doc, 0)?.nameEn).toBe("Exercise 1");
    expect(nextExerciseAfter(doc, 2)).toBeNull();
  });
});

describe("completing a set", () => {
  it("records the set, numbers it and starts the rest from the exercise's rest time", () => {
    const doc = completeSet(start([planExercise(0)]), 0, reps(60, 8), ctx(30));
    expect(doc.exercises[0]!.sets[0]).toMatchObject({ setNumber: 1, weightKg: 60, reps: 8, durationSeconds: null, toFailure: false });
    expect(doc.rest).toEqual({ endsAt: at(30).getTime() + 90_000, totalSeconds: 90 });
    expect(doc.rev).toBe(2);
    expect(doc.dirty).toBe(true);
  });

  it("does not rest after the very last set of the workout", () => {
    let doc = start([planExercise(0, { targetSets: 1 })]);
    doc = completeSet(doc, 0, reps(60, 8), ctx(30));
    expect(doc.rest).toBeNull();
  });

  it("does not rest when the exercise has rest 0", () => {
    const doc = completeSet(start([planExercise(0, { restSeconds: 0 })]), 0, reps(60, 8), ctx(30));
    expect(doc.rest).toBeNull();
  });

  it("marks only the final set of a failure-mode exercise as to-failure", () => {
    let doc = start([planExercise(0, { progressionMode: "failure", failureTargetReps: 15, targetSets: 2 })]);
    doc = completeSet(doc, 0, reps(40, 10), ctx(1));
    doc = completeSet(doc, 0, reps(40, 14), ctx(2));
    expect(doc.exercises[0]!.sets.map((s) => s.toFailure)).toEqual([false, true]);
  });

  it("logs seconds for a timed exercise and never weight or reps", () => {
    const doc = completeSet(start([planExercise(0, { timed: true })]), 0, { weightKg: 5, reps: 5, durationSeconds: 45 }, ctx(5));
    expect(doc.exercises[0]!.sets[0]).toMatchObject({ weightKg: null, reps: null, durationSeconds: 45 });
  });

  it("ignores a skipped exercise and an unknown one, without changing the document", () => {
    const skipped = setSkipped(start([planExercise(0)]), 0, true);
    expect(completeSet(skipped, 0, reps(1, 1), ctx(1))).toBe(skipped);
    expect(completeSet(skipped, 7, reps(1, 1), ctx(1))).toBe(skipped);
  });

  it("does not change its input", () => {
    const before = start([planExercise(0)]);
    const snapshot = JSON.stringify(before);
    completeSet(before, 0, reps(60, 8), ctx(30));
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it("undo removes the last set and cancels the rest", () => {
    let doc = completeSet(start([planExercise(0)]), 0, reps(60, 8), ctx(30));
    doc = completeSet(doc, 0, reps(60, 7), ctx(130));
    doc = undoLastSet(doc, 0);
    expect(doc.exercises[0]!.sets).toHaveLength(1);
    expect(doc.rest).toBeNull();
    expect(undoLastSet(start([planExercise(0)]), 0).exercises[0]!.sets).toEqual([]);
  });
});

describe("rest", () => {
  const resting = () => completeSet(start([planExercise(0)]), 0, reps(60, 8), ctx(0));

  it("adjusts by 15 seconds either way and never into the past", () => {
    expect(adjustRest(resting(), 15, at(0)).rest!.endsAt).toBe(at(105).getTime());
    expect(adjustRest(resting(), -15, at(0)).rest!.endsAt).toBe(at(75).getTime());
    expect(adjustRest(resting(), -15, at(80)).rest!.endsAt).toBe(at(80).getTime());
  });

  it("ends", () => {
    expect(endRest(resting()).rest).toBeNull();
  });
});

describe("prefill", () => {
  const previous = [
    { weightKg: 60, reps: 8, durationSeconds: null, toFailure: false },
    { weightKg: 62.5, reps: 7, durationSeconds: null, toFailure: false },
  ];

  it("starts from the plan's target reps and a zero weight for a brand-new exercise", () => {
    expect(prefill(start([planExercise(0)]).exercises[0]!, 0)).toEqual({ weightKg: 0, reps: 10, durationSeconds: null });
  });

  it("uses the same set number from last time", () => {
    const exercise = start([planExercise(0)], new Map()).exercises[0]!;
    const withHistory = { ...exercise, previous };
    expect(prefill(withHistory, 0)).toMatchObject({ weightKg: 60, reps: 8 });
    expect(prefill(withHistory, 1)).toMatchObject({ weightKg: 62.5, reps: 7 });
    expect(prefill(withHistory, 2)).toMatchObject({ weightKg: 62.5, reps: 7 });
  });

  it("prefers the set just done in this workout", () => {
    const exercise = { ...start([planExercise(0)]).exercises[0]!, previous };
    let doc = start([planExercise(0)]);
    doc = { ...doc, exercises: [exercise] };
    doc = completeSet(doc, 0, reps(65, 6), ctx(1));
    expect(prefill(doc.exercises[0]!, 1)).toMatchObject({ weightKg: 65, reps: 6 });
  });

  it("uses the target seconds for a timed exercise", () => {
    expect(prefill(start([planExercise(0, { timed: true })]).exercises[0]!, 0)).toEqual({ weightKg: null, reps: null, durationSeconds: 30 });
  });
});

describe("overload hint", () => {
  const sets = (weightKg: number, ...reps: number[]) => reps.map((r) => ({ weightKg, reps: r, durationSeconds: null, toFailure: false }));

  it("is worked out when the workout starts, from the last sessions", () => {
    const a = planExercise(0, { targetSets: 3 });
    const doc = start([a], new Map([[a.exercise.id, [sets(60, 10, 10, 10)]]]));
    expect(doc.exercises[0]!.hint).toEqual({ kind: "addWeight", weightKg: 62.5, reps: 10, setNumber: null });
    expect(doc.exercises[0]!.recent).toHaveLength(1);
  });

  it("is null without history", () => {
    expect(start([planExercise(0)]).exercises[0]!.hint).toBeNull();
  });

  it("fills the steppers: new weight everywhere, the extra rep only on the weakest set", () => {
    const a = planExercise(0, { targetSets: 3 });
    const exercise = start([a], new Map([[a.exercise.id, [sets(60, 10, 8, 10)]]])).exercises[0]!;
    expect([0, 1, 2].map((i) => prefill(exercise, i))).toEqual([
      { weightKg: 60, reps: 10, durationSeconds: null },
      { weightKg: 60, reps: 9, durationSeconds: null },
      { weightKg: 60, reps: 10, durationSeconds: null },
    ]);
  });

  it("the weight follows what was actually lifted once a set is done", () => {
    const a = planExercise(0, { targetSets: 3 });
    let doc = start([a], new Map([[a.exercise.id, [sets(60, 10, 10, 10)]]]));
    expect(prefill(doc.exercises[0]!, 0).weightKg).toBe(62.5);
    doc = completeSet(doc, 0, reps(60, 9), ctx(1));
    expect(prefill(doc.exercises[0]!, 1)).toMatchObject({ weightKg: 60, reps: 10 });
  });

  it("an added exercise gets a hint from its history too", () => {
    const doc = addExercise(
      startEmpty({ profileId: "p", now: T0, newId: uuid }),
      { exerciseId: uuid(), nameEn: "Curl", nameHe: null, isTimed: false },
      { unit: "kg", newId: uuid, recent: [sets(20, 10, 10, 10)] }
    );
    expect(doc.exercises[0]!.hint).toMatchObject({ kind: "addWeight", weightKg: 22.5 });
    expect(doc.exercises[0]!.previous).toHaveLength(3);
  });
});

describe("changing the workout", () => {
  it("moves exercises and stops at the ends", () => {
    const doc = start([planExercise(0), planExercise(1), planExercise(2)]);
    expect(moveExercise(doc, 0, 1).exercises.map((e) => e.nameEn)).toEqual(["Exercise 1", "Exercise 0", "Exercise 2"]);
    expect(moveExercise(doc, 0, -1)).toBe(doc);
    expect(moveExercise(doc, 2, 1)).toBe(doc);
  });

  it("adds an exercise with the default configuration for the user's unit", () => {
    const doc = addExercise(
      startEmpty({ profileId: "p", now: T0, newId: uuid }),
      { exerciseId: uuid(), nameEn: "Curl", nameHe: null, isTimed: false },
      { unit: "lb", newId: uuid, recent: [] }
    );
    expect(doc.exercises).toHaveLength(1);
    expect(doc.exercises[0]).toMatchObject({ targetSets: 3, targetReps: 10, restSeconds: 90, skipped: false, sets: [] });
    expect(doc.exercises[0]!.weightStepKg).toBeCloseTo(2.268, 3);
  });

  it("refuses to add past the limit", () => {
    let doc = startEmpty({ profileId: "p", now: T0, newId: uuid });
    for (let i = 0; i < 31; i++) {
      doc = addExercise(doc, { exerciseId: uuid(), nameEn: "X", nameHe: null, isTimed: false }, { unit: "kg", newId: uuid, recent: [] });
    }
    expect(doc.exercises).toHaveLength(30);
  });
});

describe("finishing", () => {
  it("ends the workout, clears rest, and counts exercises with no sets as skipped", () => {
    let doc = start([planExercise(0), planExercise(1)]);
    doc = completeSet(doc, 0, reps(50, 10), ctx(10));
    doc = finish(doc, at(600));
    expect(doc).toMatchObject({ status: "finished", endedAt: at(600).toISOString(), rest: null });
    expect(doc.exercises.map((e) => e.skipped)).toEqual([false, true]);
  });

  it("summarizes volume, sets, exercises and duration", () => {
    let doc = start([planExercise(0, { targetSets: 2 }), planExercise(1, { timed: true }), planExercise(2)]);
    doc = completeSet(doc, 0, reps(50, 10), ctx(10));
    doc = completeSet(doc, 0, reps(52.5, 8), ctx(100));
    doc = completeSet(doc, 1, { weightKg: null, reps: null, durationSeconds: 40 }, ctx(200));
    doc = finish(doc, at(1800));
    expect(summarize(doc)).toEqual({ volumeKg: 50 * 10 + 52.5 * 8, setsDone: 3, exercisesDone: 2, exercisesSkipped: 1, durationSeconds: 1800 });
  });

  it("discarding leaves a tombstone with nothing in it", () => {
    const doc = discard(completeSet(start([planExercise(0)]), 0, reps(1, 1), ctx(1)));
    expect(doc).toMatchObject({ status: "discarded", exercises: [], rest: null, dirty: true });
  });
});

describe("what is sent to the server", () => {
  it("is a document the server's own schema accepts, in exercise order", () => {
    let doc = start([planExercise(0), planExercise(1, { timed: true })]);
    doc = completeSet(doc, 0, reps(50, 10), ctx(10));
    doc = completeSet(doc, 1, { weightKg: null, reps: null, durationSeconds: 30 }, ctx(20));
    doc = moveExercise(doc, 1, -1);
    const sent = toSyncDocument(finish(doc, at(900)));
    expect(syncSessionSchema.safeParse(sent).success).toBe(true);
    expect(sent.exercises.map((e) => e.position)).toEqual([0, 1]);
    expect(sent.exercises[0]!.exerciseId).toBe(doc.exercises[0]!.exerciseId);
  });

  it("an in-progress workout is accepted too", () => {
    expect(syncSessionSchema.safeParse(toSyncDocument(start([planExercise(0)]))).success).toBe(true);
  });
});
