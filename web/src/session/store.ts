import Dexie, { type Table } from "dexie";
import type { WorkoutDoc } from "./types";

// IndexedDB through Dexie. Two small tables:
//  - workouts: every workout this device has recorded and not yet confirmed as
//    synced (plus the one in progress), keyed by the id the phone generated.
//  - cache: the last answer of a few read-only requests (today's plan, the exercise
//    library), so the screens that start a workout still open without a network.

export interface CacheEntry {
  key: string;
  value: unknown;
  savedAt: number;
}

class FitnessDatabase extends Dexie {
  workouts!: Table<WorkoutDoc, string>;
  cache!: Table<CacheEntry, string>;

  constructor(name = "fitness") {
    super(name);
    this.version(1).stores({
      // profileId is indexed because two people can use one browser.
      workouts: "clientId, profileId, status",
      cache: "key",
    });
  }
}

export const database = new FitnessDatabase();

export async function saveWorkout(doc: WorkoutDoc): Promise<void> {
  await database.workouts.put(doc);
}

export function getWorkout(clientId: string): Promise<WorkoutDoc | undefined> {
  return database.workouts.get(clientId);
}

export async function getActiveWorkout(profileId: string): Promise<WorkoutDoc | undefined> {
  return database.workouts.where({ profileId, status: "active" }).first();
}

export function listWorkouts(profileId: string): Promise<WorkoutDoc[]> {
  return database.workouts.where({ profileId }).toArray();
}

export async function listDirtyWorkouts(profileId: string): Promise<WorkoutDoc[]> {
  return (await listWorkouts(profileId)).filter((doc) => doc.dirty);
}

export async function removeWorkout(clientId: string): Promise<void> {
  await database.workouts.delete(clientId);
}

// Marks a document as synced, but only if nothing changed while the upload was in
// flight: otherwise the newer edits would be silently considered uploaded.
export async function markSynced(clientId: string, rev: number): Promise<void> {
  await database.transaction("rw", database.workouts, async () => {
    const current = await database.workouts.get(clientId);
    if (current && current.rev === rev) await database.workouts.put({ ...current, dirty: false });
  });
}

// A finished workout that has reached the server is only kept locally for the summary
// screen and the rotation; once it is old, it can go.
export async function forgetOldSyncedWorkouts(profileId: string, olderThan: Date): Promise<void> {
  const docs = await listWorkouts(profileId);
  const stale = docs.filter((doc) => doc.status === "finished" && !doc.dirty && Date.parse(doc.endedAt ?? doc.startedAt) < olderThan.getTime());
  await database.workouts.bulkDelete(stale.map((doc) => doc.clientId));
}

export async function writeCache(key: string, value: unknown): Promise<void> {
  await database.cache.put({ key, value, savedAt: Date.now() });
}

export async function readCache<T>(key: string): Promise<T | undefined> {
  return (await database.cache.get(key))?.value as T | undefined;
}
