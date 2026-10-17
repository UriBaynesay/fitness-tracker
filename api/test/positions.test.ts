import { describe, expect, it } from "vitest";
import { moveItem } from "../src/plans/positions.js";

describe("moveItem", () => {
  const ids = ["a", "b", "c", "d"];

  it("moves an item up and down", () => {
    expect(moveItem(ids, "c", 0)).toEqual(["c", "a", "b", "d"]);
    expect(moveItem(ids, "a", 2)).toEqual(["b", "c", "a", "d"]);
    expect(moveItem(ids, "b", 1)).toEqual(ids);
  });

  it("clamps an out-of-range index instead of failing", () => {
    expect(moveItem(ids, "a", 99)).toEqual(["b", "c", "d", "a"]);
    expect(moveItem(ids, "d", -5)).toEqual(["d", "a", "b", "c"]);
  });

  it("leaves the order alone for an unknown id and never mutates the input", () => {
    expect(moveItem(ids, "zzz", 1)).toEqual(ids);
    moveItem(ids, "a", 3);
    expect(ids).toEqual(["a", "b", "c", "d"]);
  });
});
