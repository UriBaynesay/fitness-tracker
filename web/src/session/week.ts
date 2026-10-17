// The Sunday-first week strip on the Today screen, and "which day was last".

export interface WeekSession {
  clientId: string;
  planDayId: string | null;
  planDayName: string | null;
  startedAt: string;
}

export interface WeekDay {
  date: Date;
  isToday: boolean;
  // Names of the plan days finished on this date (usually 0 or 1).
  planDayNames: string[];
  trained: boolean;
}

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

// Local dates, Sunday to Saturday, of the week containing `now`.
export function buildWeek(sessions: WeekSession[], now: Date): WeekDay[] {
  const today = startOfDay(now);
  const sunday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay());
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate() + i);
    const done = sessions.filter((session) => sameDay(new Date(session.startedAt), date));
    return {
      date,
      isToday: sameDay(date, today),
      planDayNames: done.flatMap((session) => (session.planDayName ? [session.planDayName] : [])),
      trained: done.length > 0,
    };
  });
}

// The plan day finished most recently, among the days of the current plan, so the
// rotation carries on from there. null when none of them has been done.
export function lastFinishedDayId(sessions: WeekSession[], dayIds: string[]): string | null {
  const known = new Set(dayIds);
  const latest = sessions
    .filter((session) => session.planDayId !== null && known.has(session.planDayId))
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))[0];
  return latest?.planDayId ?? null;
}

// Server and device can both know a workout; the client id says it is one workout.
export function mergeSessions(...lists: WeekSession[][]): WeekSession[] {
  const byId = new Map<string, WeekSession>();
  for (const list of lists) for (const session of list) byId.set(session.clientId, session);
  return [...byId.values()];
}
