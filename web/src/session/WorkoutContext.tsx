import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAuth } from "../auth/AuthContext";
import { forgetOldSyncedWorkouts, getActiveWorkout, saveWorkout } from "./store";
import { syncPending } from "./sync";
import type { WorkoutDoc } from "./types";

interface WorkoutContextValue {
  // false until IndexedDB has been read, so a screen doesn't flash "no workout".
  ready: boolean;
  active: WorkoutDoc | null;
  begin: (doc: WorkoutDoc) => Promise<void>;
  // Applies a pure change to the workout in progress, saves it, and pushes it.
  update: (change: (doc: WorkoutDoc) => WorkoutDoc) => void;
  // Resolves once every change made so far is in IndexedDB (before reading it back).
  whenSaved: () => Promise<void>;
}

const WorkoutContext = createContext<WorkoutContextValue | null>(null);

const KEEP_SYNCED_DAYS = 60;

export function WorkoutProvider({ children }: { children: ReactNode }) {
  const { state } = useAuth();
  const profileId = state.status === "authenticated" ? state.profile.id : null;
  const [active, setActive] = useState<WorkoutDoc | null>(null);
  const [ready, setReady] = useState(false);
  // The newest document, readable synchronously so two taps in a row both apply.
  const latest = useRef<WorkoutDoc | null>(null);
  // Saves run strictly in order, so an older write can never land after a newer one.
  const writes = useRef<Promise<unknown>>(Promise.resolve());

  const push = useCallback(() => {
    if (profileId) void syncPending(profileId);
  }, [profileId]);

  const persist = useCallback(
    (doc: WorkoutDoc) => {
      writes.current = writes.current.then(() => saveWorkout(doc)).then(push, push);
    },
    [push]
  );

  // Load the workout in progress (if any) as soon as we know who is signed in, and
  // send anything left over from an earlier session.
  useEffect(() => {
    latest.current = null;
    setActive(null);
    setReady(false);
    if (!profileId) return;
    let cancelled = false;
    void (async () => {
      const doc = (await getActiveWorkout(profileId)) ?? null;
      if (cancelled) return;
      latest.current = doc;
      setActive(doc);
      setReady(true);
      push();
      void forgetOldSyncedWorkouts(profileId, new Date(Date.now() - KEEP_SYNCED_DAYS * 86_400_000));
    })();
    return () => {
      cancelled = true;
    };
  }, [profileId, push]);

  // Retry whenever the connection or the app comes back.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") push();
    };
    window.addEventListener("online", push);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", push);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [push]);

  const begin = useCallback(
    async (doc: WorkoutDoc) => {
      latest.current = doc;
      setActive(doc);
      persist(doc);
      // The unsynced workout is the only copy until it uploads, so ask the browser not
      // to evict this site's storage under disk pressure. Best effort: it may refuse.
      void navigator.storage?.persist?.().catch(() => undefined);
      await writes.current;
    },
    [persist]
  );

  const update = useCallback(
    (change: (doc: WorkoutDoc) => WorkoutDoc) => {
      const current = latest.current;
      if (!current) return;
      const next = change(current);
      if (next === current) return;
      persist(next);
      // A finished or discarded workout is no longer "the active one".
      latest.current = next.status === "active" ? next : null;
      setActive(latest.current);
    },
    [persist]
  );

  const whenSaved = useCallback(async () => {
    await writes.current;
  }, []);

  const value = useMemo(() => ({ ready, active, begin, update, whenSaved }), [ready, active, begin, update, whenSaved]);
  return <WorkoutContext.Provider value={value}>{children}</WorkoutContext.Provider>;
}

export function useWorkout(): WorkoutContextValue {
  const value = useContext(WorkoutContext);
  if (!value) throw new Error("useWorkout must be used inside WorkoutProvider");
  return value;
}
