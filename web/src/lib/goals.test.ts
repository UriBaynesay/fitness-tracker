import { describe, expect, it } from "vitest";
import { toDisplayValue, toStoredValue, valueText } from "./goals";

describe("goal values", () => {
  it("weights convert between the person's unit and kg; reps and seconds pass through", () => {
    expect(toStoredValue("weight", 100, "kg")).toBe(100);
    expect(toStoredValue("weight", 225, "lb")).toBeCloseTo(102.058, 3);
    expect(toDisplayValue("weight", 102.058, "lb")).toBe(225);
    expect(toStoredValue("reps", 20, "lb")).toBe(20);
    expect(toStoredValue("duration", 90, "lb")).toBe(90);
  });

  it("a typed pound target survives a round trip", () => {
    expect(toDisplayValue("weight", toStoredValue("weight", 135, "lb"), "lb")).toBe(135);
  });

  it("formats with the right unit", () => {
    expect(valueText("weight", 62.5, "kg")).toBe("62.5 kg");
    expect(valueText("duration", 90, "kg")).toBe("90 s");
    expect(valueText("reps", 12, "kg")).toBe("12");
  });
});
