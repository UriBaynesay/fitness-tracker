import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { clock } from "../lib/format";
import { restOverAlert } from "./alerts";
import type { RestState } from "./types";

const RADIUS = 92;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
// A rest that ended while the screen was off should not beep minutes later.
const ALERT_WINDOW_MS = 5000;

function useNow(active: boolean, intervalMs = 250): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    // Browsers pause timers in a background tab; catch up the moment it is visible.
    const onVisible = () => setNow(Date.now());
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [active, intervalMs]);
  return now;
}

interface RestViewProps {
  rest: RestState;
  // What the next set will be, e.g. "Bench press · set 2 of 3".
  nextLabel: string;
  nextDetail: string;
  onAdjust: (deltaSeconds: number) => void;
  onEnd: () => void;
}

// The countdown is computed from an end timestamp each tick, never decremented, so a
// locked screen, a throttled tab or a reload cannot make it drift.
export function RestView({ rest, nextLabel, nextDetail, onAdjust, onEnd }: RestViewProps) {
  const { t } = useTranslation();
  const now = useNow(true);
  const remainingMs = rest.endsAt - now;
  const expired = remainingMs <= 0;
  const alerted = useRef<number | null>(null);

  // One alert per rest, when it ends, and only if it ended just now.
  useEffect(() => {
    if (!expired || alerted.current === rest.endsAt) return;
    alerted.current = rest.endsAt;
    if (now - rest.endsAt < ALERT_WINDOW_MS) restOverAlert();
  }, [expired, now, rest.endsAt]);

  const fraction = expired ? 0 : Math.min(1, remainingMs / 1000 / rest.totalSeconds);

  return (
    <section className="rest" aria-labelledby="rest-title">
      <p className="label" id="rest-title">
        {expired ? t("workout.restOver") : t("workout.rest")}
      </p>
      <div className="rest-ring">
        <svg viewBox="0 0 200 200" aria-hidden="true">
          <circle className="rest-ring-track" cx="100" cy="100" r={RADIUS} />
          <circle
            className="rest-ring-progress"
            cx="100"
            cy="100"
            r={RADIUS}
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
          />
        </svg>
        <span className="rest-time" role="timer" aria-live="off" dir="ltr">
          {clock(remainingMs / 1000)}
        </span>
      </div>
      <div className="rest-adjust">
        <button type="button" className="btn btn-ghost" onClick={() => onAdjust(-15)}>
          {t("workout.minus15")}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => onAdjust(15)}>
          {t("workout.plus15")}
        </button>
      </div>
      <div className="card rest-next">
        <span className="label">{t("workout.next")}</span>
        <strong dir="auto">{nextLabel}</strong>
        <span className="muted-small" dir="auto">
          {nextDetail}
        </span>
      </div>
      <button type="button" className={expired ? "btn btn-primary" : "btn btn-ghost"} onClick={onEnd}>
        {expired ? t("workout.startNextSet") : t("workout.skipRest")}
      </button>
    </section>
  );
}
