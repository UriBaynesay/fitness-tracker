import { describe, expect, it } from "vitest";
import { defaultWeightStepKg, displayToKg, formatNumber, kgToDisplay } from "./units.js";

describe("weight units", () => {
  it("shows kg unchanged and rounds to a quarter kilo", () => {
    expect(kgToDisplay(2.5, "kg")).toBe(2.5);
    expect(kgToDisplay(1.25, "kg")).toBe(1.25);
    expect(kgToDisplay(2.6, "kg")).toBe(2.5);
  });

  it("converts kg to pounds and rounds to half a pound", () => {
    expect(kgToDisplay(2.268, "lb")).toBe(5);
    expect(kgToDisplay(1, "lb")).toBe(2);
    expect(kgToDisplay(100, "lb")).toBe(220.5);
  });

  it("stores what the user typed in kg with 3 decimals", () => {
    expect(displayToKg(2.5, "kg")).toBe(2.5);
    expect(displayToKg(5, "lb")).toBe(2.268);
    expect(displayToKg(45, "lb")).toBe(20.412);
  });

  it("round-trips the values a person actually enters", () => {
    for (const lb of [2.5, 5, 10, 25, 45]) {
      expect(kgToDisplay(displayToKg(lb, "lb"), "lb")).toBe(lb);
    }
    for (const kg of [0.25, 1.25, 2.5, 5, 20]) {
      expect(kgToDisplay(displayToKg(kg, "kg"), "kg")).toBe(kg);
    }
  });

  it("defaults the weight step to 2.5 kg or 5 lb depending on the unit", () => {
    expect(defaultWeightStepKg("kg")).toBe(2.5);
    expect(defaultWeightStepKg("lb")).toBe(2.268);
    expect(kgToDisplay(defaultWeightStepKg("lb"), "lb")).toBe(5);
  });

  it("formats numbers without trailing zeros", () => {
    expect(formatNumber(2.5)).toBe("2.5");
    expect(formatNumber(5)).toBe("5");
    expect(formatNumber(1.25)).toBe("1.25");
    expect(formatNumber(220.5)).toBe("220.5");
  });
});
