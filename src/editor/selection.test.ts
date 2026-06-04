import { describe, expect, test } from "bun:test";
import { makeCanvas } from "./types";
import {
  combineMasks,
  featherMask,
  maskFromPolygon,
  maskFromWand,
  selectionContains,
  selectionFromMask,
} from "./selection";

/** Paint an opaque white rectangle onto a fresh doc-sized mask. */
function filledMask(docW: number, docH: number, x: number, y: number, w: number, h: number) {
  const c = makeCanvas(docW, docH);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x, y, w, h);
  return c;
}

function countOpaque(mask: HTMLCanvasElement) {
  const { width, height } = mask;
  const data = mask.getContext("2d")!.getImageData(0, 0, width, height).data;
  let n = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] > 0) n++;
  return n;
}

describe("selectionFromMask", () => {
  test("returns null for a fully transparent mask", () => {
    expect(selectionFromMask(makeCanvas(20, 20))).toBeNull();
  });

  test("computes the tight bounding box of opaque pixels", () => {
    const sel = selectionFromMask(filledMask(50, 40, 10, 8, 12, 6));
    expect(sel).not.toBeNull();
    expect(sel).toMatchObject({ x: 10, y: 8, w: 12, h: 6 });
  });
});

describe("maskFromPolygon", () => {
  test("rasterizes a triangle and reports sane bounds", () => {
    const mask = maskFromPolygon(100, 100, [
      { x: 10, y: 10 },
      { x: 90, y: 10 },
      { x: 10, y: 90 },
    ]);
    const sel = selectionFromMask(mask)!;
    // The right-angle triangle should hug the top-left corner of its bbox.
    expect(sel.x).toBeLessThanOrEqual(11);
    expect(sel.y).toBeLessThanOrEqual(11);
    expect(sel.w).toBeGreaterThan(70);
    expect(sel.h).toBeGreaterThan(70);
    // A triangle covers roughly half its bounding box — far less than a full fill.
    expect(countOpaque(mask)).toBeLessThan(sel.w * sel.h * 0.7);
  });

  test("degenerate polygons (<3 points) produce an empty mask", () => {
    expect(
      countOpaque(
        maskFromPolygon(50, 50, [
          { x: 1, y: 1 },
          { x: 2, y: 2 },
        ]),
      ),
    ).toBe(0);
  });
});

describe("combineMasks", () => {
  const base = () => filledMask(20, 10, 0, 0, 6, 10); // left 6 columns
  test("replace ignores the base and returns the new mask", () => {
    const add = filledMask(20, 10, 10, 0, 5, 10);
    const out = combineMasks(base(), add, "replace", 20, 10);
    expect(selectionFromMask(out)).toMatchObject({ x: 10, w: 5 });
  });

  test("add unions the two regions", () => {
    const add = filledMask(20, 10, 12, 0, 5, 10);
    const out = combineMasks(base(), add, "add", 20, 10);
    const sel = selectionFromMask(out)!;
    expect(sel.x).toBe(0);
    expect(sel.x + sel.w).toBe(17); // spans from base start to add end
  });

  test("subtract removes the overlap from the base", () => {
    const add = filledMask(20, 10, 4, 0, 6, 10); // overlaps columns 4..5 of base
    const out = combineMasks(base(), add, "subtract", 20, 10);
    const sel = selectionFromMask(out)!;
    // Base was columns 0..5; removing 4..9 leaves 0..3.
    expect(sel.x).toBe(0);
    expect(sel.x + sel.w).toBe(4);
  });

  test("with no base, any mode yields the new mask", () => {
    const add = filledMask(20, 10, 3, 0, 4, 10);
    const out = combineMasks(undefined, add, "add", 20, 10);
    expect(selectionFromMask(out)).toMatchObject({ x: 3, w: 4 });
  });
});

describe("maskFromWand", () => {
  // Source: red column at x=0, blue middle, red column at x=9 — two disjoint
  // red regions so contiguous vs. global flood fill differ.
  function source() {
    const c = makeCanvas(10, 10);
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#0000ff";
    ctx.fillRect(0, 0, 10, 10);
    ctx.fillStyle = "#ff0000";
    ctx.fillRect(0, 0, 1, 10);
    ctx.fillRect(9, 0, 1, 10);
    return c;
  }

  test("contiguous selects only the connected region under the seed", () => {
    const mask = maskFromWand(source(), 0, 5, 0, true, { x: 0, y: 0 }, 10, 10);
    expect(mask).not.toBeNull();
    expect(countOpaque(mask!)).toBe(10); // just the left column
    expect(selectionFromMask(mask!)).toMatchObject({ x: 0, w: 1, h: 10 });
  });

  test("non-contiguous selects every matching pixel in the layer", () => {
    const mask = maskFromWand(source(), 0, 5, 0, false, { x: 0, y: 0 }, 10, 10);
    expect(countOpaque(mask!)).toBe(20); // both red columns
    const sel = selectionFromMask(mask!)!;
    expect(sel.x).toBe(0);
    expect(sel.x + sel.w).toBe(10);
  });

  test("a seed outside the source bounds returns null", () => {
    expect(maskFromWand(source(), 99, 99, 0, true, { x: 0, y: 0 }, 10, 10)).toBeNull();
  });
});

describe("featherMask", () => {
  test("is a no-op for radius <= 0 and returns the same canvas", () => {
    const m = filledMask(10, 10, 0, 0, 10, 10);
    expect(featherMask(m, 0)).toBe(m);
  });
});

describe("selectionContains", () => {
  test("null selection contains everything", () => {
    expect(selectionContains(null, null, 5, 5, 10)).toBe(true);
  });

  test("rectangular selection respects its bounds (inclusive start, exclusive end)", () => {
    const sel = { x: 2, y: 2, w: 4, h: 4 };
    expect(selectionContains(sel, null, 2, 2, 10)).toBe(true);
    expect(selectionContains(sel, null, 5, 5, 10)).toBe(true);
    expect(selectionContains(sel, null, 6, 2, 10)).toBe(false); // x == x+w is outside
    expect(selectionContains(sel, null, 1, 2, 10)).toBe(false);
  });
});
