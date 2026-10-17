import type { Exercise, HistorySet, Plan, SessionSummary } from "@fitness/shared";
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

// The sets from each exercise's last finished workout, keyed by exercise id.
export async function loadHistory(profileId: string, exerciseIds: string[]): Promise<Map<string, HistorySet[]>> {
  const key = `${profileId}:history`;
  const stored = (await readCache<Record<string, HistorySet[]>>(key)) ?? {};
  const ids = [...new Set(exerciseIds)];
  try {
    for (let i = 0; i < ids.length; i += HISTORY_CHUNK) {
      const { history } = await api.exercises.history(ids.slice(i, i + HISTORY_CHUNK), 1);
      for (const entry of history) stored[entry.exerciseId] = entry.sessions[0]?.sets ?? [];
    }
    void writeCache(key, stored);
  } catch {
    // Offline: whatever was remembered last time is still a good "last time".
  }
  return new Map(ids.map((id) => [id, stored[id] ?? []]));
}
