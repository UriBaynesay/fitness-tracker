import { eq } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { planDays, planExercises } from "../db/schema.js";

export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

// Pure: the order of ids after moving one of them to newIndex. The index is
// clamped, so "move to position 99" means "to the end" instead of an error.
export function moveItem(ids: string[], id: string, newIndex: number): string[] {
  if (!ids.includes(id)) return ids;
  const rest = ids.filter((existing) => existing !== id);
  const target = Math.max(0, Math.min(newIndex, rest.length));
  return [...rest.slice(0, target), id, ...rest.slice(target)];
}

// Positions are 0-based and contiguous. Writing every sibling's index keeps that
// true after a move or a delete, inside the caller's transaction.
export async function writeDayPositions(tx: Tx, orderedIds: string[]): Promise<void> {
  for (const [index, id] of orderedIds.entries()) {
    await tx.update(planDays).set({ position: index }).where(eq(planDays.id, id));
  }
}

export async function writeExercisePositions(tx: Tx, orderedIds: string[]): Promise<void> {
  for (const [index, id] of orderedIds.entries()) {
    await tx.update(planExercises).set({ position: index }).where(eq(planExercises.id, id));
  }
}
