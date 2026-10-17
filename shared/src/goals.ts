import { z } from "zod";

// A goal: one exercise, one metric, a target. Progress is measured from the value
// the person had when they set the goal (start) toward the target, using their best
// logged value. Status is never stored: it is worked out from the sessions on read.

export const GOAL_METRICS = ["weight", "reps", "duration"] as const;
export const goalMetricSchema = z.enum(GOAL_METRICS);
export type GoalMetric = z.infer<typeof goalMetricSchema>;

// Duration is for timed exercises, weight and reps for the rest.
export function metricAllowed(metric: GoalMetric, isTimed: boolean): boolean {
  return isTimed ? metric === "duration" : metric !== "duration";
}

export const metricsForExercise = (isTimed: boolean): GoalMetric[] => GOAL_METRICS.filter((m) => metricAllowed(m, isTimed));

// Weights are kg (up to 1000), reps up to 1000, durations up to 10 hours of seconds.
const targetSchema = z.number().positive().max(36_000);

export const createGoalBodySchema = z.object({
  exerciseId: z.uuid(),
  metric: goalMetricSchema,
  target: targetSchema,
});
export type CreateGoalInput = z.infer<typeof createGoalBodySchema>;

export const updateGoalBodySchema = z.object({ target: targetSchema });
export type UpdateGoalInput = z.infer<typeof updateGoalBodySchema>;

export const goalSchema = z.object({
  id: z.uuid(),
  exerciseId: z.uuid(),
  metric: goalMetricSchema,
  startValue: z.number(),
  targetValue: z.number(),
  // The best logged value for the exercise's metric, or null if none yet.
  best: z.number().nullable(),
  createdAt: z.string(),
});
export type Goal = z.infer<typeof goalSchema>;

export interface GoalProgress {
  fraction: number;
  percent: number;
  reached: boolean;
}

export function goalProgress(start: number, target: number, best: number | null): GoalProgress {
  const value = best ?? start;
  const reached = value >= target;
  const fraction = reached ? 1 : Math.min(1, Math.max(0, (value - start) / (target - start)));
  return { fraction, percent: Math.round(fraction * 100), reached };
}
