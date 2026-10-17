import { ApiError, api } from "../api";
import { toSyncDocument } from "./logic";
import { listDirtyWorkouts, markSynced, removeWorkout } from "./store";

// Pushes every workout with unsent changes to the server. The upload is idempotent
// (PUT by client id), so this can run as often as it likes. It runs after each change,
// when the app starts, and when the browser says it is back online or visible again
// (see WorkoutContext). If an attempt fails for a reason that may pass (no signal, a
// server hiccup), it also retries by itself with growing delays, so a workout
// finished in a basement gym reaches the server without anyone touching the app.

const RETRY_DELAYS_MS = [5_000, 30_000, 120_000, 300_000];

// attempt 0 is the first retry. The last delay repeats forever.
export function retryDelayMs(attempt: number): number {
  return RETRY_DELAYS_MS[Math.min(Math.max(0, attempt), RETRY_DELAYS_MS.length - 1)]!;
}

type Outcome = "done" | "retry" | "stop";

let running: Promise<void> | null = null;
let again = false;
let attempt = 0;
let timer: ReturnType<typeof setTimeout> | null = null;

function clearRetry(): void {
  if (timer !== null) clearTimeout(timer);
  timer = null;
}

// A trigger from the app (a change, reconnecting, coming back to the app): try now,
// and forget how long we had been backing off.
export function syncPending(profileId: string): Promise<void> {
  attempt = 0;
  clearRetry();
  return run(profileId);
}

function run(profileId: string): Promise<void> {
  // One run at a time. A request that arrives mid-run asks for one more pass, so
  // edits made during an upload are not forgotten.
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    try {
      let outcome: Outcome;
      do {
        again = false;
        outcome = await pushAll(profileId);
      } while (again);
      if (outcome === "retry") scheduleRetry(profileId);
      else attempt = 0;
    } finally {
      running = null;
    }
  })();
  return running;
}

function scheduleRetry(profileId: string): void {
  clearRetry();
  timer = setTimeout(() => {
    timer = null;
    attempt += 1;
    void run(profileId);
  }, retryDelayMs(attempt));
}

async function pushAll(profileId: string): Promise<Outcome> {
  let outcome: Outcome = "done";
  for (const doc of await listDirtyWorkouts(profileId)) {
    try {
      if (doc.status === "discarded") {
        await api.sessions.remove(doc.clientId);
        await removeWorkout(doc.clientId);
      } else {
        await api.sessions.put(toSyncDocument(doc));
        await markSynced(doc.clientId, doc.rev);
      }
    } catch (error) {
      if (!(error instanceof ApiError)) return "retry";
      // Signed out: nothing to retry until they sign in again (that triggers a sync).
      if (error.status === 401) return "stop";
      // Offline, rate limited or a server error: may pass, so stop and back off.
      if (error.status === 0 || error.status === 429 || error.status >= 500) return "retry";
      // The server will never accept this document as it is. Skip it so it does not
      // block the rest; it stays on the device.
      outcome = "done";
    }
  }
  return outcome;
}
