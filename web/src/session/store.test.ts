import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api";
import { completeSet, discard, finish, startEmpty } from "./logic";
import { database, getActiveWorkout, getWorkout, listDirtyWorkouts, markSynced, readCache, saveWorkout, writeCache } from "./store";
import { syncPending } from "./sync";

const put = vi.fn();
const remove = vi.fn();
vi.mock("../api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api")>()),
  api: { sessions: { put: (...args: unknown[]) => put(...args), remove: (...args: unknown[]) => remove(...args) } },
}));

let n = 0;
const newId = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
const workout = (profileId = "p1") => startEmpty({ profileId, now: new Date("2026-10-17T10:00:00Z"), newId });

beforeEach(async () => {
  put.mockReset().mockResolvedValue({});
  remove.mockReset().mockResolvedValue(undefined);
  await database.workouts.clear();
  await database.cache.clear();
});

describe("local storage", () => {
  it("a workout in progress survives a reload: it is found again exactly as saved", async () => {
    const doc = workout();
    await saveWorkout(doc);
    expect(await getActiveWorkout("p1")).toEqual(doc);
  });

  it("only the signed-in person's workout is the active one", async () => {
    await saveWorkout(workout("p1"));
    expect(await getActiveWorkout("p2")).toBeUndefined();
  });

  it("a finished workout is no longer the active one but is still readable", async () => {
    const doc = finish(workout(), new Date("2026-10-17T11:00:00Z"));
    await saveWorkout(doc);
    expect(await getActiveWorkout("p1")).toBeUndefined();
    expect((await getWorkout(doc.clientId))?.status).toBe("finished");
  });

  it("only clears dirty if nothing changed during the upload", async () => {
    const doc = workout();
    await saveWorkout(doc);
    await saveWorkout({ ...doc, rev: doc.rev + 1 });
    await markSynced(doc.clientId, doc.rev);
    expect((await getWorkout(doc.clientId))?.dirty).toBe(true);
    await markSynced(doc.clientId, doc.rev + 1);
    expect((await getWorkout(doc.clientId))?.dirty).toBe(false);
  });

  it("caches a value by key", async () => {
    await writeCache("p1:today", { a: 1 });
    expect(await readCache("p1:today")).toEqual({ a: 1 });
    expect(await readCache("nope")).toBeUndefined();
  });
});

describe("syncing", () => {
  it("uploads dirty workouts and then stops considering them dirty", async () => {
    const doc = workout();
    await saveWorkout(doc);
    await syncPending("p1");
    expect(put).toHaveBeenCalledTimes(1);
    expect(put.mock.calls[0]![0]).toMatchObject({ clientId: doc.clientId, endedAt: null });
    expect(await listDirtyWorkouts("p1")).toEqual([]);
    await syncPending("p1");
    expect(put).toHaveBeenCalledTimes(1);
  });

  it("keeps the workout dirty when the network is down, and the next attempt delivers it", async () => {
    const doc = workout();
    await saveWorkout(doc);
    put.mockRejectedValueOnce(new ApiError(0, "network"));
    await syncPending("p1");
    expect(await listDirtyWorkouts("p1")).toHaveLength(1);
    await syncPending("p1");
    expect(await listDirtyWorkouts("p1")).toHaveLength(0);
  });

  it("does not lose edits made while an upload is in flight", async () => {
    const doc = workout();
    await saveWorkout(doc);
    put.mockImplementationOnce(async () => {
      await saveWorkout(completeSetIntoExercise(doc));
      return {};
    });
    await syncPending("p1");
    // The upload carried the old revision, so the newer edit is still pending.
    expect(put).toHaveBeenCalledTimes(1);
    expect(await listDirtyWorkouts("p1")).toHaveLength(1);
    await syncPending("p1");
    expect(put).toHaveBeenCalledTimes(2);
    expect(await listDirtyWorkouts("p1")).toHaveLength(0);
  });

  it("a discarded workout is deleted on the server and then forgotten locally", async () => {
    const doc = discard(workout());
    await saveWorkout(doc);
    await syncPending("p1");
    expect(remove).toHaveBeenCalledWith(doc.clientId);
    expect(await getWorkout(doc.clientId)).toBeUndefined();
  });

  it("a discard made offline waits for the connection", async () => {
    const doc = discard(workout());
    await saveWorkout(doc);
    remove.mockRejectedValueOnce(new ApiError(0, "network"));
    await syncPending("p1");
    expect(await getWorkout(doc.clientId)).toBeDefined();
    await syncPending("p1");
    expect(await getWorkout(doc.clientId)).toBeUndefined();
  });

  it("one workout the server refuses does not block the others", async () => {
    const bad = workout();
    const good = workout();
    await saveWorkout(bad);
    await saveWorkout(good);
    put.mockImplementation(async (body: { clientId: string }) => {
      if (body.clientId === bad.clientId) throw new ApiError(400, "validation_error");
      return {};
    });
    await syncPending("p1");
    expect((await listDirtyWorkouts("p1")).map((d) => d.clientId)).toEqual([bad.clientId]);
  });

  it("only syncs the signed-in person's workouts", async () => {
    await saveWorkout(workout("p2"));
    await syncPending("p1");
    expect(put).not.toHaveBeenCalled();
  });
});

// A change to the same workout, as the app would make while an upload is running.
function completeSetIntoExercise(doc: ReturnType<typeof workout>) {
  const withExercise = {
    ...doc,
    exercises: [
      {
        clientId: newId(), exerciseId: newId(), nameEn: "X", nameHe: null, isTimed: false, skipped: false, previous: [], sets: [],
        targetSets: 3, targetReps: 10, targetDurationSeconds: null, restSeconds: 90, progressionMode: "target" as const,
        failureTargetReps: null, sessionsToConfirm: 2, weightStepKg: 2.5,
      },
    ],
  };
  return completeSet(withExercise, 0, { weightKg: 50, reps: 10, durationSeconds: null }, { now: new Date(), newId });
}
