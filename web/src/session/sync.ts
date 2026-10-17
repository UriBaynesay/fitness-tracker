import { ApiError, api } from "../api";
import { toSyncDocument } from "./logic";
import { listDirtyWorkouts, markSynced, removeWorkout } from "./store";

// Pushes every workout with unsent changes to the server. The upload is idempotent
// (PUT by client id), so this can run as often as it likes: after each change, when
// the app starts, when the browser reports it is back online. Failures are silent and
// simply retried by the next trigger. A status indicator and backoff are milestone 4.

let running: Promise<void> | null = null;
let again = false;

export function syncPending(profileId: string): Promise<void> {
  // One run at a time. A request that arrives mid-run asks for one more pass, so
  // edits made during an upload are not forgotten.
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    try {
      do {
        again = false;
        await pushAll(profileId);
      } while (again);
    } finally {
      running = null;
    }
  })();
  return running;
}

async function pushAll(profileId: string): Promise<void> {
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
      // Offline, signed out, rate limited or a server hiccup: stop and try again later.
      if (error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 401 && error.status !== 429) {
        // The server will never accept this document as it is. Retrying forever would
        // block the rest, so skip it; it stays on the device.
        continue;
      }
      return;
    }
  }
}
