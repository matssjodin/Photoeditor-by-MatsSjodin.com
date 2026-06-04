import { beforeEach, describe, expect, test } from "bun:test";
import { actions, getState } from "./store";
import type { RasterLayer } from "./types";

// The store is a module-level singleton; newDocument fully resets doc + history,
// giving each test a clean baseline.
beforeEach(() => {
  actions.newDocument(20, 20, "#000000");
});

function activeRaster() {
  return actions.activeRaster() as RasterLayer;
}

function pixel(layer: RasterLayer, x: number, y: number) {
  return Array.from(layer.canvas.getContext("2d")!.getImageData(x, y, 1, 1).data);
}

describe("document setup", () => {
  test("newDocument seeds a single active background layer", () => {
    const s = getState();
    expect(s.doc.layers).toHaveLength(1);
    expect(s.doc.activeLayerId).toBe(s.doc.layers[0].id);
    expect(s.doc.width).toBe(20);
    expect(s.historyIndex).toBe(-1);
  });
});

describe("layer operations", () => {
  test("addLayer appends and activates the new layer", () => {
    actions.addLayer("raster");
    const s = getState();
    expect(s.doc.layers).toHaveLength(2);
    expect(s.doc.activeLayerId).toBe(s.doc.layers[1].id);
  });

  test("addLayer('text') creates a text layer", () => {
    actions.addLayer("text");
    expect(actions.activeLayer()?.type).toBe("text");
  });

  test("deleteLayer removes it and reassigns the active layer", () => {
    actions.addLayer("raster");
    const id = getState().doc.activeLayerId!;
    actions.deleteLayer(id);
    const s = getState();
    expect(s.doc.layers).toHaveLength(1);
    expect(s.doc.activeLayerId).toBe(s.doc.layers[0].id);
  });

  test("duplicateLayer clones pixels into an independent canvas", () => {
    const src = activeRaster();
    src.canvas.getContext("2d")!.fillStyle = "#ff0000";
    src.canvas.getContext("2d")!.fillRect(0, 0, 20, 20);
    actions.duplicateLayer(src.id);
    const s = getState();
    expect(s.doc.layers).toHaveLength(2);
    const copy = s.doc.layers[1] as RasterLayer;
    expect(copy.id).not.toBe(src.id);
    expect(copy.canvas).not.toBe(src.canvas); // deep copy, not shared reference
    expect(pixel(copy, 5, 5)[0]).toBe(255);
  });

  test("reorderLayer moves a layer within the stack", () => {
    actions.addLayer("raster"); // layer index 1 (top), now active
    const topId = getState().doc.activeLayerId!;
    actions.reorderLayer(topId, -1); // move down
    expect(getState().doc.layers[0].id).toBe(topId);
  });
});

describe("history: structural undo/redo", () => {
  test("undo/redo round-trips an add-layer", () => {
    actions.addLayer("raster");
    expect(getState().doc.layers).toHaveLength(2);
    actions.undo();
    expect(getState().doc.layers).toHaveLength(1);
    actions.redo();
    expect(getState().doc.layers).toHaveLength(2);
  });

  test("resizeDocument is undoable", () => {
    actions.resizeDocument(40, 8);
    expect(getState().doc.width).toBe(40);
    expect(getState().doc.height).toBe(8);
    actions.undo();
    expect(getState().doc.width).toBe(20);
    expect(getState().doc.height).toBe(20);
  });

  test("a new edit drops the redo tail", () => {
    actions.addLayer("raster"); // 2 layers
    actions.addLayer("raster"); // 3 layers
    actions.undo(); // back to 2
    actions.addLayer("text"); // new branch — redo of the 3rd raster is gone
    actions.redo(); // should be a no-op
    const types = getState().doc.layers.map((l) => l.type);
    expect(types).toHaveLength(3);
    expect(types[2]).toBe("text");
  });
});

describe("history: raster pixel undo/redo", () => {
  test("recordRaster snapshots before/after and round-trips", () => {
    const layer = activeRaster();
    expect(pixel(layer, 5, 5)[0]).toBe(0); // black background

    actions.recordRaster("paint", layer.id, () => {
      const ctx = layer.canvas.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, 20, 20);
    });
    expect(pixel(activeRaster(), 5, 5)[0]).toBe(255);

    actions.undo();
    expect(pixel(activeRaster(), 5, 5)[0]).toBe(0);

    actions.redo();
    expect(pixel(activeRaster(), 5, 5)[0]).toBe(255);
  });
});

describe("history bounds", () => {
  test("undo with empty history is a safe no-op", () => {
    expect(() => actions.undo()).not.toThrow();
    expect(getState().doc.layers).toHaveLength(1);
  });

  test("redo at the tip is a safe no-op", () => {
    actions.addLayer("raster");
    expect(() => actions.redo()).not.toThrow();
    expect(getState().doc.layers).toHaveLength(2);
  });
});
