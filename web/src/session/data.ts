import type { Exercise, ExerciseHistory, HistorySet, Plan, SessionSummary } from "@fitness/shared";
import { api } from "../api";
import { readCache, writeCache } from "./store";

// Read-only data the Today screen and the exercise picker need, each remembered on
// the device after a successful load so they still open without a connection.

export async function loadLibrary(profileId: string): Promise<Exercise[]> {
  const key = `${profileId}:library`;
  try {
    const { exercises } = await api.exercises.list();
    void writeCache(key, exercises);
    return exercises;
  } catch (error) {
    const cached = await readCache<Exercise[]>(key);
    if (cached) return cached;
    throw error;
  }
}

export interface TodayData {
  plan: Plan | null;
  sessions: SessionSummary[];
  // true when this came from the device because the server could not be reached.
  offline: boolean;
}

export async function loadToday(profileId: string): Promise<TodayData> {
  const key = `${profileId}:today`;
  try {
    const [{ plans }, { sessions }] = await Promise.all([api.plans.list(), api.sessions.list(100)]);
    const active = plans.find((plan) => plan.isActive);
    const plan = active ? (await api.plans.get(active.id)).plan : null;
    const data = { plan, sessions };
    void writeCache(key, data);
    return { ...data, offline: false };
  } catch (error) {
    const cached = await readCache<Omit<TodayData, "offline">>(key);
    if (cached) return { ...cached, offline: true };
    throw error;
  }
}

const HISTORY_CHUNK = 30;

const HISTORY_SESSIONS = 3;

// The sets from each exercise's last few finished workouts (newest first), keyed by
// exercise id: "last time" and the overload hint both read this.
export async function loadHistory(profileId: string, exerciseIds: string[]): Promise<Map<string, HistorySet[][]>> {
  const key = `${profileId}:history3`;
  const stored = (await readCache<Record<string, HistorySet[][]>>(key)) ?? {};
  const ids = [...new Set(exerciseIds)];
  try {
    for (let i = 0; i < ids.length; i += HISTORY_CHUNK) {
      const { history } = await api.exercises.history(ids.slice(i, i + HISTORY_CHUNK), HISTORY_SESSIONS);
      for (const entry of history) stored[entry.exerciseId] = entry.sessions.map((session) => session.sets);
    }
    void writeCache(key, stored);
  } catch {
    // Offline: whatever was remembered last time is still a good "last time".
  }
  return new Map(ids.map((id) => [id, stored[id] ?? []]));
}

// Progress screen: which exercises have history, and one exercise's workouts.
async function withCache<T>(key: string, load: () => Promise<T>): Promise<T> {
  try {
    const value = await load();
    void writeCache(key, value);
    return value;
  } catch (error) {
    const cached = await readCache<T>(key);
    if (cached !== undefined) return cached;
    throw error;
  }
}

export const loadTrained = (profileId: string) =>
  withCache(`${profileId}:trained`, async () => (await api.exercises.trained()).exerciseIds);

export const loadProgress = (profileId: string, exerciseId: string) =>
  withCache<ExerciseHistory["sessions"]>(`${profileId}:progress:${exerciseId}`, async () => (await api.exercises.historyOf(exerciseId)).history.sessions);
