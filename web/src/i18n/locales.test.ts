import { describe, expect, it } from "vitest";
import en from "./locales/en.json";
import he from "./locales/he.json";

function keys(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) => keys(child, prefix ? `${prefix}.${key}` : key));
}

// Every string added to one language must exist in the other, or a Hebrew user
// silently sees English (or a raw key) on that screen.
describe("translations", () => {
  it("English and Hebrew define exactly the same keys", () => {
    expect(keys(he).sort()).toEqual(keys(en).sort());
  });

  it("uses the same interpolation placeholders in both languages", () => {
    const placeholders = (text: string) => (text.match(/{{\w+}}/g) ?? []).sort();
    const flat = (value: unknown, prefix = ""): [string, string][] =>
      typeof value === "string"
        ? [[prefix, value]]
        : Object.entries(value as object).flatMap(([k, v]) => flat(v, prefix ? `${prefix}.${k}` : k));
    const heByKey = new Map(flat(he));
    for (const [key, text] of flat(en)) {
      expect(placeholders(heByKey.get(key) ?? ""), key).toEqual(placeholders(text));
    }
  });
});
