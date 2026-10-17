import type { HistorySet, PlanExerciseConfig } from "@fitness/shared";

// A workout lives on the phone first (IndexedDB) and is pushed to the server as one
// document. Everything needed to keep going without a network is inside it: the
// exercise names, the configuration snapshot, what was done last time.

export interface LoggedSet {
  clientId: string;
  setNumber: number;
  weightKg: number | null;
  reps: number | null;
  durationSeconds: number | null;
  toFailure: boolean;
  completedAt: string;
}

export interface ExerciseInfo {
  exerciseId: string;
  nameEn: string | null;
  nameHe: string | null;
  isTimed: boolean;
}

export interface WorkoutExercise extends PlanExerciseConfig, ExerciseInfo {
  clientId: string;
  skipped: boolean;
  sets: LoggedSet[];
  // The sets done in the last finished workout, to prefill and to show "last time".
  previous: HistorySet[];
}

// Rest is stored as an end time, not a counter, so it survives a locked screen,
// a backgrounded tab and a reload.
export interface RestState {
  endsAt: number;
  totalSeconds: number;
}

export interface WorkoutDoc {
  clientId: string;
  profileId: string;
  // "discarded" is a tombstone: the server still has to be told, once it can be reached.
  status: "active" | "finished" | "discarded";
  planDayId: string | null;
  planDayName: string | null;
  startedAt: string;
  endedAt: string | null;
  exercises: WorkoutExercise[];
  rest: RestState | null;
  // Bumped on every change; sync only clears `dirty` if nothing changed while it ran.
  rev: number;
  dirty: boolean;
}

export interface Position {
  exerciseIndex: number;
  setIndex: number;
}

export interface SetValues {
  weightKg: number | null;
  reps: number | null;
  durationSeconds: number | null;
}
