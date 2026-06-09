import { describe, expect, test } from "vitest";
import { localToDoc, rotateDrag, scaleDrag, type TransformProps } from "./transform";

const base: TransformProps = {
  x: 100,
  y: 50,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  flipX: false,
  flipY: false,
};
const size = { w: 200, h: 100 };

describe("localToDoc", () => {
  test("identity transform translates only", () => {
    expect(localToDoc(base, { x: 10, y: 20 })).toEqual({ x: 110, y: 70 });
  });

  test("scale multiplies local coords", () => {
    const p = localToDoc({ ...base, scaleX: 2, scaleY: 0.5 }, { x: 10, y: 20 });
    expect(p.x).toBeCloseTo(120);
    expect(p.y).toBeCloseTo(60);
  });

  test("90° rotation maps +x onto +y", () => {
    const p = localToDoc({ ...base, rotation: 90 }, { x: 10, y: 0 });
    expect(p.x).toBeCloseTo(100);
    expect(p.y).toBeCloseTo(60);
  });

  test("flipX mirrors the x axis", () => {
    const p = localToDoc({ ...base, flipX: true }, { x: 10, y: 0 });
    expect(p.x).toBeCloseTo(90);
  });
});

describe("scaleDrag", () => {
  test("dragging the se corner outward scales up uniformly", () => {
    // se handle at doc (300, 150); drag to double distance from nw anchor (100, 50)
    const next = scaleDrag(base, size, "se", { x: 500, y: 250 }, true);
    expect(next.scaleX).toBeCloseTo(2);
    expect(next.scaleY).toBeCloseTo(2);
    // nw anchor must not move
    const a = localToDoc(next, { x: 0, y: 0 });
    expect(a.x).toBeCloseTo(100);
    expect(a.y).toBeCloseTo(50);
  });

  test("non-uniform corner drag scales each axis independently", () => {
    const next = scaleDrag(base, size, "se", { x: 500, y: 100 }, false);
    expect(next.scaleX).toBeCloseTo(2);
    expect(next.scaleY).toBeCloseTo(0.5);
  });

  test("edge drag only changes one axis and keeps the opposite edge fixed", () => {
    const next = scaleDrag(base, size, "e", { x: 400, y: 999 }, false);
    expect(next.scaleX).toBeCloseTo(1.5);
    expect(next.scaleY).toBeCloseTo(1);
    const a = localToDoc(next, { x: 0, y: size.h / 2 }); // w anchor
    expect(a.x).toBeCloseTo(100);
    expect(a.y).toBeCloseTo(100);
  });

  test("dragging across the anchor flips the layer", () => {
    const next = scaleDrag(base, size, "e", { x: 0, y: 100 }, false);
    expect(next.flipX).toBe(true);
    expect(next.scaleX).toBeCloseTo(0.5);
  });

  test("works under rotation: anchor stays fixed", () => {
    const start = { ...base, rotation: 37 };
    const anchorBefore = localToDoc(start, { x: 0, y: 0 });
    const next = scaleDrag(start, size, "se", { x: 600, y: 400 }, true);
    const anchorAfter = localToDoc(next, { x: 0, y: 0 });
    expect(anchorAfter.x).toBeCloseTo(anchorBefore.x);
    expect(anchorAfter.y).toBeCloseTo(anchorBefore.y);
  });
});

describe("rotateDrag", () => {
  test("pointer straight right of center yields 90°", () => {
    const center = localToDoc(base, { x: size.w / 2, y: size.h / 2 });
    const next = rotateDrag(base, size, { x: center.x + 100, y: center.y }, false);
    expect(next.rotation).toBeCloseTo(90);
    // center stays fixed
    const c = localToDoc(next, { x: size.w / 2, y: size.h / 2 });
    expect(c.x).toBeCloseTo(center.x);
    expect(c.y).toBeCloseTo(center.y);
  });

  test("snap rounds to 15° steps", () => {
    const center = localToDoc(base, { x: size.w / 2, y: size.h / 2 });
    const next = rotateDrag(
      base,
      size,
      { x: center.x + 100, y: center.y - 8 }, // ~85.4°
      true,
    );
    expect(next.rotation).toBeCloseTo(90);
  });
});
