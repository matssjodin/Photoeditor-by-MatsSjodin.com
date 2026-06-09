import { describe, expect, test } from "vitest";
import { clippedLayerDraw, constrainShape, drawShape } from "./draw";
import { makeCanvas, type RasterLayer } from "./types";
import { newRasterLayer, actions } from "./store";

function px(c: HTMLCanvasElement, x: number, y: number) {
  return Array.from(c.getContext("2d")!.getImageData(x, y, 1, 1).data);
}

describe("constrainShape", () => {
  test("rectangle constrains to a square", () => {
    expect(constrainShape("rectangle", 0, 0, 30, 10)).toEqual({ x1: 30, y1: 30 });
  });

  test("line snaps to 45° steps", () => {
    const r = constrainShape("line", 0, 0, 100, 8); // ~4.6° → snaps to 0°
    expect(r.y1).toBeCloseTo(0);
    expect(r.x1).toBeCloseTo(Math.hypot(100, 8));
  });
});

describe("drawShape", () => {
  test("filled rectangle paints inside, not outside", () => {
    const c = makeCanvas(40, 40);
    drawShape(
      c.getContext("2d")!,
      { kind: "rectangle", fill: "#ff0000", stroke: null, strokeWidth: 0 },
      5,
      5,
      20,
      20,
    );
    expect(px(c, 10, 10)).toEqual([255, 0, 0, 255]);
    expect(px(c, 30, 30)[3]).toBe(0);
  });

  test("ellipse fills center but not corners of its box", () => {
    const c = makeCanvas(40, 40);
    drawShape(
      c.getContext("2d")!,
      { kind: "ellipse", fill: "#00ff00", stroke: null, strokeWidth: 0 },
      0,
      0,
      40,
      40,
    );
    expect(px(c, 20, 20)[1]).toBe(255);
    expect(px(c, 2, 2)[3]).toBe(0); // box corner outside the ellipse
  });

  test("line strokes along its path", () => {
    const c = makeCanvas(40, 40);
    drawShape(
      c.getContext("2d")!,
      { kind: "line", fill: null, stroke: "#0000ff", strokeWidth: 4 },
      0,
      20,
      40,
      20,
    );
    expect(px(c, 20, 20)[2]).toBe(255);
    expect(px(c, 20, 5)[3]).toBe(0);
  });

  test("arrow paints a head at the end point", () => {
    const c = makeCanvas(60, 60);
    drawShape(
      c.getContext("2d")!,
      { kind: "arrow", fill: null, stroke: "#000000", strokeWidth: 4 },
      5,
      30,
      55,
      30,
    );
    expect(px(c, 53, 30)[3]).toBeGreaterThan(0); // head tip
    expect(px(c, 20, 30)[3]).toBeGreaterThan(0); // shaft
  });
});

describe("clippedLayerDraw", () => {
  test("compensates for the layer offset", () => {
    actions.newDocument(40, 40, "transparent");
    const layer = newRasterLayer("L") as RasterLayer;
    layer.x = 10;
    layer.y = 10;
    clippedLayerDraw(layer, null, (ctx) => {
      ctx.fillStyle = "#ff0000";
      ctx.fillRect(15, 15, 2, 2); // doc coords
    });
    expect(px(layer.canvas, 5, 5)[0]).toBe(255); // 15 - layer offset 10
  });

  test("rect selection clips drawing", () => {
    actions.newDocument(40, 40, "transparent");
    const layer = newRasterLayer("L") as RasterLayer;
    clippedLayerDraw(layer, { x: 0, y: 0, w: 10, h: 10 }, (ctx) => {
      ctx.fillStyle = "#ff0000";
      ctx.fillRect(0, 0, 40, 40);
    });
    expect(px(layer.canvas, 5, 5)[0]).toBe(255);
    expect(px(layer.canvas, 20, 20)[3]).toBe(0);
  });

  test("mask selection clips drawing", () => {
    actions.newDocument(40, 40, "transparent");
    const layer = newRasterLayer("L") as RasterLayer;
    const mask = makeCanvas(40, 40);
    const mctx = mask.getContext("2d")!;
    mctx.fillStyle = "#fff";
    mctx.fillRect(0, 0, 8, 8);
    clippedLayerDraw(layer, { x: 0, y: 0, w: 8, h: 8, mask }, (ctx) => {
      ctx.fillStyle = "#00ff00";
      ctx.fillRect(0, 0, 40, 40);
    });
    expect(px(layer.canvas, 4, 4)[1]).toBe(255);
    expect(px(layer.canvas, 20, 20)[3]).toBe(0);
  });
});
