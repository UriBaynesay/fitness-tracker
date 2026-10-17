import { describe, expect, it } from "vitest";
import { buildWeek, lastFinishedDayId, mergeSessions } from "./week";

const session = (clientId: string, startedAt: string, planDayId: string | null = null, planDayName: string | null = null) => ({
  clientId,
  planDayId,
  planDayName,
  startedAt,
});

describe("week strip", () => {
  // Saturday 17 October 2026, local time.
  const now = new Date(2026, 9, 17, 12);

  it("runs Sunday to Saturday around today", () => {
    const week = buildWeek([], now);
    expect(week.map((d) => d.date.getDate())).toEqual([11, 12, 13, 14, 15, 16, 17]);
    expect(week.map((d) => d.date.getDay())).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(week.filter((d) => d.isToday).map((d) => d.date.getDate())).toEqual([17]);
  });

  it("marks the days with a workout and keeps the plan day name", () => {
    const week = buildWeek([session("a", new Date(2026, 9, 12, 18).toISOString(), "d1", "Push")], now);
    expect(week[1]).toMatchObject({ trained: true, planDayNames: ["Push"] });
    expect(week.filter((d) => d.trained)).toHaveLength(1);
  });

  it("ignores workouts from other weeks", () => {
    const week = buildWeek([session("a", new Date(2026, 9, 3, 18).toISOString())], now);
    expect(week.some((d) => d.trained)).toBe(false);
  });

  it("works across a month boundary", () => {
    const week = buildWeek([], new Date(2026, 10, 2, 9));
    expect(week.map((d) => `${d.date.getMonth()}-${d.date.getDate()}`)).toEqual(["10-1", "10-2", "10-3", "10-4", "10-5", "10-6", "10-7"]);
  });
});

describe("rotation input", () => {
  it("is the day of the most recent workout that belongs to this plan", () => {
    const sessions = [
      session("a", "2026-10-10T10:00:00Z", "d1"),
      session("b", "2026-10-14T10:00:00Z", "d2"),
      session("c", "2026-10-16T10:00:00Z", "other-plan-day"),
      session("d", "2026-10-17T10:00:00Z", null),
    ];
    expect(lastFinishedDayId(sessions, ["d1", "d2", "d3"])).toBe("d2");
    expect(lastFinishedDayId(sessions, ["x"])).toBeNull();
    expect(lastFinishedDayId([], ["d1"])).toBeNull();
  });

  it("merging counts one workout once, preferring the later list", () => {
    const merged = mergeSessions([session("a", "2026-10-10T10:00:00Z")], [session("a", "2026-10-10T10:00:00Z", "d1"), session("b", "2026-10-11T10:00:00Z")]);
    expect(merged).toHaveLength(2);
    expect(merged.find((s) => s.clientId === "a")?.planDayId).toBe("d1");
  });
});
