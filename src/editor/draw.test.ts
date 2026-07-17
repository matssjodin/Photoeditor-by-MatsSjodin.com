import { describe, expect, test } from "vitest";
import {
  clippedLayerDraw,
  cloneStamp,
  constrainShape,
  drawShape,
  floodFill,
  paintStamp,
} from "./draw";
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

describe("drawGradient", () => {
  test("linear gradient runs from start to end colour", async () => {
    const { drawGradient } = await import("./draw");
    const c = makeCanvas(40, 10);
    drawGradient(
      c.getContext("2d")!,
      { kind: "linear", from: "#ff0000", to: "#0000ff" },
      0,
      5,
      40,
      5,
      40,
      10,
    );
    expect(px(c, 1, 5)[0]).toBeGreaterThan(200); // red end
    expect(px(c, 38, 5)[2]).toBeGreaterThan(200); // blue end
  });

  test("fade to transparent ends with zero alpha", async () => {
    const { drawGradient } = await import("./draw");
    const c = makeCanvas(40, 10);
    drawGradient(
      c.getContext("2d")!,
      { kind: "linear", from: "#ff0000", to: null },
      0,
      5,
      40,
      5,
      40,
      10,
    );
    expect(px(c, 1, 5)[3]).toBeGreaterThan(200);
    expect(px(c, 39, 5)[3]).toBeLessThan(30);
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

  test("destination-out composite erases instead of painting", () => {
    actions.newDocument(40, 40, "transparent");
    const layer = newRasterLayer("L", "#ff0000") as RasterLayer;
    clippedLayerDraw(
      layer,
      null,
      (ctx) => {
        ctx.fillStyle = "rgba(0,0,0,1)";
        ctx.fillRect(0, 0, 10, 10);
      },
      { composite: "destination-out" },
    );
    expect(px(layer.canvas, 5, 5)[3]).toBe(0);
    expect(px(layer.canvas, 20, 20)[3]).toBe(255);
  });
});

describe("paintStamp", () => {
  const tool = { brushSize: 10, brushHardness: 0.5, brushColor: "#ff0000" };

  test("paints at the doc-space position on an offset layer", () => {
    actions.newDocument(40, 40, "transparent");
    const layer = newRasterLayer("L") as RasterLayer;
    layer.x = 10;
    layer.y = 10;
    paintStamp(layer, 20, 20, false, tool, null);
    expect(px(layer.canvas, 10, 10)[0]).toBe(255); // doc (20,20) → layer (10,10)
    expect(px(layer.canvas, 20, 20)[3]).toBe(0); // old (buggy) location untouched
  });

  test("erases at the doc-space position on an offset layer", () => {
    actions.newDocument(40, 40, "transparent");
    const layer = newRasterLayer("L", "#00ff00") as RasterLayer;
    layer.x = 10;
    layer.y = 10;
    paintStamp(layer, 20, 20, true, tool, null);
    expect(px(layer.canvas, 10, 10)[3]).toBe(0);
    expect(px(layer.canvas, 30, 30)[3]).toBe(255);
  });

  test("targets the layer mask when given one", () => {
    actions.newDocument(40, 40, "transparent");
    const layer = newRasterLayer("L", "#00ff00") as RasterLayer;
    layer.x = 10;
    layer.mask = makeCanvas(40, 40);
    paintStamp(layer, 20, 10, false, tool, null, layer.mask);
    expect(px(layer.mask, 10, 10)[3]).toBe(255); // mask revealed, offset-compensated
    expect(px(layer.canvas, 10, 10)[1]).toBe(255); // pixels untouched
  });
});

describe("cloneStamp", () => {
  test("copies from the stroke source offset in layer space", () => {
    actions.newDocument(40, 40, "transparent");
    const layer = newRasterLayer("L") as RasterLayer;
    layer.x = 10;
    layer.y = 10;
    const ctx = layer.canvas.getContext("2d")!;
    ctx.fillStyle = "#ff0000";
    ctx.fillRect(0, 0, 4, 4); // source patch at layer (0..4)
    const source = makeCanvas(40, 40);
    source.getContext("2d")!.drawImage(layer.canvas, 0, 0);
    // Clone source picked at doc (12,12) = layer (2,2); dab at doc (30,30).
    cloneStamp(layer, source, 30, 30, 18, 18, { brushSize: 10, brushHardness: 0.5 }, null);
    expect(px(layer.canvas, 20, 20)[0]).toBe(255); // patch cloned to layer (20,20)
  });
});

describe("floodFill", () => {
  test("fills in layer space from a doc-space seed", () => {
    actions.newDocument(40, 40, "transparent");
    const layer = newRasterLayer("L") as RasterLayer;
    layer.x = 10;
    layer.y = 10;
    const ctx = layer.canvas.getContext("2d")!;
    ctx.fillStyle = "#ff0000";
    ctx.fillRect(0, 0, 10, 10);
    floodFill(layer, 12, 12, "#00ff00", null, 0); // doc (12,12) = layer (2,2)
    expect(px(layer.canvas, 5, 5)).toEqual([0, 255, 0, 255]);
    expect(px(layer.canvas, 15, 15)[3]).toBe(0); // outside the region untouched
  });

  test("respects a doc-space rect selection on an offset layer", () => {
    actions.newDocument(40, 40, "transparent");
    const layer = newRasterLayer("L", "#ff0000") as RasterLayer;
    layer.x = 10;
    layer.y = 10;
    floodFill(layer, 20, 20, "#0000ff", { x: 15, y: 15, w: 10, h: 10 }, 0);
    expect(px(layer.canvas, 8, 8)[2]).toBe(255); // doc (18,18) inside selection
    expect(px(layer.canvas, 2, 2)[2]).toBe(0); // doc (12,12) outside selection
  });

  test("terminates when the fill colour is within tolerance of the target", () => {
    actions.newDocument(20, 20, "transparent");
    const layer = newRasterLayer("L", "#000000") as RasterLayer;
    floodFill(layer, 5, 5, "#101010", null, 32);
    expect(px(layer.canvas, 0, 0)[0]).toBe(16);
  });
});
