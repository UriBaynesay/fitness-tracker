import { describe, expect, it } from "vitest";
import { buildSeries, metricsFor } from "./progress";

const set = (weightKg: number | null, reps: number | null, durationSeconds: number | null = null) => ({ weightKg, reps, durationSeconds, toFailure: false });
// Newest first, as the server returns it.
const sessions = [
  { startedAt: "2026-10-15T10:00:00Z", sets: [set(65, 6), set(60, 10)] },
  { startedAt: "2026-10-08T10:00:00Z", sets: [set(60, 8)] },
];

describe("progress series", () => {
  it("runs oldest to newest, one best value per workout", () => {
    expect(buildSeries(sessions, "weight", "kg")).toEqual([
      { startedAt: "2026-10-08T10:00:00Z", value: 60 },
      { startedAt: "2026-10-15T10:00:00Z", value: 65 },
    ]);
    expect(buildSeries(sessions, "reps", "kg").map((p) => p.value)).toEqual([8, 10]);
  });

  it("estimates the one-rep max (Epley) to one decimal", () => {
    expect(buildSeries(sessions, "oneRm", "kg").map((p) => p.value)).toEqual([76, 80]);
  });

  it("converts weights to the person's unit", () => {
    expect(buildSeries(sessions, "weight", "lb").map((p) => p.value)).toEqual([132.5, 143.5]);
  });

  it("charts the longest hold for a timed exercise", () => {
    const timed = [{ startedAt: "2026-10-15T10:00:00Z", sets: [set(null, null, 30), set(null, null, 45)] }];
    expect(buildSeries(timed, "duration", "kg")).toEqual([{ startedAt: "2026-10-15T10:00:00Z", value: 45 }]);
  });

  it("leaves out workouts with nothing to measure", () => {
    expect(buildSeries([{ startedAt: "2026-10-15T10:00:00Z", sets: [set(null, 12)] }], "weight", "kg")).toEqual([]);
  });

  it("offers duration only for timed exercises", () => {
    expect(metricsFor(true)).toEqual(["duration"]);
    expect(metricsFor(false)).toEqual(["weight", "reps", "oneRm"]);
  });
});
