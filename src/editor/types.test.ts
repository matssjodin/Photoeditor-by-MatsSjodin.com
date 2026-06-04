import { describe, expect, test } from "vitest";
import { buildFilterString, DEFAULT_ADJUSTMENTS, uid, type Adjustments } from "./types";

const adj = (over: Partial<Adjustments> = {}): Adjustments => ({
  ...DEFAULT_ADJUSTMENTS,
  ...over,
});

describe("buildFilterString", () => {
  test("neutral adjustments produce identity-ish filters and omit optional ones", () => {
    const out = buildFilterString(DEFAULT_ADJUSTMENTS);
    // Always-present multiplicative/rotational filters at their neutral values.
    expect(out).toContain("brightness(1)");
    expect(out).toContain("contrast(1)");
    expect(out).toContain("saturate(1)");
    expect(out).toContain("hue-rotate(0deg)");
    // Zero-valued optional filters must be omitted entirely (not "blur(0px)" etc).
    expect(out).not.toContain("blur(");
    expect(out).not.toContain("grayscale(");
    expect(out).not.toContain("sepia(");
    expect(out).not.toContain("invert(");
  });

  test("brightness and exposure both feed the brightness() filter additively", () => {
    // brightness = 1 + brightness/100 + exposure/100
    expect(buildFilterString(adj({ brightness: 50 }))).toContain("brightness(1.5)");
    expect(buildFilterString(adj({ exposure: 25 }))).toContain("brightness(1.25)");
    expect(buildFilterString(adj({ brightness: 50, exposure: 50 }))).toContain("brightness(2)");
    // Negative values darken below 1.
    expect(buildFilterString(adj({ brightness: -100 }))).toContain("brightness(0)");
  });

  test("contrast and saturation map from -100..100 onto 0..2", () => {
    expect(buildFilterString(adj({ contrast: 100 }))).toContain("contrast(2)");
    expect(buildFilterString(adj({ contrast: -100 }))).toContain("contrast(0)");
    expect(buildFilterString(adj({ saturation: -50 }))).toContain("saturate(0.5)");
  });

  test("hue rotation passes through in degrees, including negatives", () => {
    expect(buildFilterString(adj({ hue: 180 }))).toContain("hue-rotate(180deg)");
    expect(buildFilterString(adj({ hue: -90 }))).toContain("hue-rotate(-90deg)");
  });

  test("optional filters appear with units only when positive", () => {
    expect(buildFilterString(adj({ blur: 4 }))).toContain("blur(4px)");
    expect(buildFilterString(adj({ grayscale: 100 }))).toContain("grayscale(100%)");
    expect(buildFilterString(adj({ sepia: 60 }))).toContain("sepia(60%)");
    expect(buildFilterString(adj({ invert: 100 }))).toContain("invert(100%)");
  });

  test("filters are space-joined with no empty segments", () => {
    const out = buildFilterString(adj({ blur: 2, grayscale: 50 }));
    expect(out).not.toContain("  "); // no double spaces from omitted segments
    expect(out.trim()).toBe(out);
  });
});

describe("uid", () => {
  test("returns a non-empty alphanumeric id", () => {
    const id = uid();
    expect(id).toMatch(/^[0-9a-z]+$/);
    expect(id.length).toBeGreaterThan(0);
  });

  test("is highly unlikely to collide across many calls", () => {
    const ids = new Set(Array.from({ length: 5000 }, () => uid()));
    // Allow a tiny collision margin but flag a broken generator.
    expect(ids.size).toBeGreaterThan(4990);
  });
});
