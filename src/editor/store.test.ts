import { beforeEach, describe, expect, test } from "vitest";
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

  test("addImageLayer centres the image and is undoable", () => {
    const img = document.createElement("canvas") as HTMLCanvasElement;
    img.width = 10;
    img.height = 10;
    const ictx = img.getContext("2d")!;
    ictx.fillStyle = "#ff0000";
    ictx.fillRect(0, 0, 10, 10);
    actions.addImageLayer(img, 10, 10, "Pasted");
    const s = getState();
    expect(s.doc.layers).toHaveLength(2);
    const layer = s.doc.layers[1] as RasterLayer;
    expect(layer.name).toBe("Pasted");
    expect(layer.canvas.width).toBe(10);
    expect(layer.x).toBe(5); // (20 - 10) / 2
    expect(pixel(layer, 5, 5)[0]).toBe(255);
    actions.undo();
    expect(getState().doc.layers).toHaveLength(1);
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

describe("history: props undo/redo", () => {
  test("recordProps round-trips a move/transform", () => {
    const layer = activeRaster();
    layer.x = 10;
    layer.scaleX = 2;
    actions.recordProps(
      "Transform",
      layer.id,
      { x: 0, scaleX: 1 },
      { x: layer.x, scaleX: layer.scaleX },
    );
    actions.undo();
    expect(activeRaster().x).toBe(0);
    expect(activeRaster().scaleX).toBe(1);
    actions.redo();
    expect(activeRaster().x).toBe(10);
    expect(activeRaster().scaleX).toBe(2);
  });

  test("recordProps with no change adds no history entry", () => {
    const layer = activeRaster();
    const len = getState().history.length;
    actions.recordProps("Move", layer.id, { x: 0, y: 0 }, { x: 0, y: 0 });
    expect(getState().history.length).toBe(len);
  });
});

describe("layer masks", () => {
  function maskAlpha(l: RasterLayer, x: number, y: number) {
    return l.mask!.getContext("2d")!.getImageData(x, y, 1, 1).data[3];
  }

  test("addLayerMask without selection reveals everything", () => {
    const l = activeRaster();
    actions.addLayerMask(l.id);
    expect(l.mask).toBeDefined();
    expect(maskAlpha(l, 5, 5)).toBe(255);
  });

  test("addLayerMask from a rect selection only reveals the selection", () => {
    const l = activeRaster();
    actions.setSelection({ x: 0, y: 0, w: 5, h: 5 });
    actions.addLayerMask(l.id);
    expect(maskAlpha(l, 2, 2)).toBe(255);
    expect(maskAlpha(l, 10, 10)).toBe(0);
    expect(getState().doc.selection).toBeNull();
  });

  test("invertLayerMask flips visibility and is undoable", () => {
    const l = activeRaster();
    actions.setSelection({ x: 0, y: 0, w: 5, h: 5 });
    actions.addLayerMask(l.id);
    actions.invertLayerMask(l.id);
    expect(maskAlpha(l, 2, 2)).toBe(0);
    expect(maskAlpha(l, 10, 10)).toBe(255);
    actions.undo();
    expect(maskAlpha(l, 2, 2)).toBe(255);
  });

  test("applyLayerMask bakes alpha and removes the mask", () => {
    const l = activeRaster(); // black, fully opaque
    actions.setSelection({ x: 0, y: 0, w: 5, h: 5 });
    actions.addLayerMask(l.id);
    actions.applyLayerMask(l.id);
    const layer = activeRaster();
    expect(layer.mask).toBeUndefined();
    expect(pixel(layer, 2, 2)[3]).toBe(255); // kept
    expect(pixel(layer, 10, 10)[3]).toBe(0); // masked away
    actions.undo(); // structural undo restores the mask + pixels
    expect(activeRaster().mask).toBeDefined();
    expect(pixel(activeRaster(), 10, 10)[3]).toBe(255);
  });

  test("deleteLayerMask removes it without touching pixels", () => {
    const l = activeRaster();
    actions.addLayerMask(l.id);
    actions.deleteLayerMask(l.id);
    expect(activeRaster().mask).toBeUndefined();
    expect(pixel(activeRaster(), 5, 5)[3]).toBe(255);
  });

  test("duplicateLayer deep-copies the mask", () => {
    const l = activeRaster();
    actions.addLayerMask(l.id);
    actions.duplicateLayer(l.id);
    const copy = getState().doc.layers[1] as RasterLayer;
    expect(copy.mask).toBeDefined();
    expect(copy.mask).not.toBe(l.mask);
  });
});

describe("crop and resize with offset layers", () => {
  function addRedPastedLayer(size = 10) {
    const img = document.createElement("canvas") as HTMLCanvasElement;
    img.width = size;
    img.height = size;
    const ictx = img.getContext("2d")!;
    ictx.fillStyle = "#ff0000";
    ictx.fillRect(0, 0, size, size);
    actions.addImageLayer(img, size, size, "Pasted");
    return getState().doc.layers[1] as RasterLayer;
  }

  test("cropToSelection shifts every layer by the selection origin", () => {
    const pasted = addRedPastedLayer(); // 10×10 at (5,5)
    actions.setSelection({ x: 5, y: 5, w: 10, h: 10 });
    actions.cropToSelection();
    const s = getState();
    expect(s.doc.width).toBe(10);
    expect(s.doc.height).toBe(10);
    expect(pasted.x).toBe(0); // was 5, shifted by -5
    expect(s.doc.layers[0].x).toBe(-5); // background keeps its pixels, shifted
    expect(pixel(pasted, 5, 5)[0]).toBe(255); // pixels untouched
    actions.undo();
    expect(getState().doc.width).toBe(20);
    expect((getState().doc.layers[1] as RasterLayer).x).toBe(5);
  });

  test("resizeDocument scales layer offsets and canvas sizes proportionally", () => {
    addRedPastedLayer(); // 10×10 at (5,5) in a 20×20 doc
    actions.resizeDocument(40, 40);
    const resized = getState().doc.layers[1] as RasterLayer;
    expect(resized.canvas.width).toBe(20); // scaled ×2, not stretched to 40
    expect(resized.canvas.height).toBe(20);
    expect(resized.x).toBe(10);
    expect(resized.y).toBe(10);
    expect(pixel(resized, 10, 10)[0]).toBe(255);
    // Background layer (doc-sized) still fills the new document.
    const bg = getState().doc.layers[0] as RasterLayer;
    expect(bg.canvas.width).toBe(40);
    actions.undo();
    expect((getState().doc.layers[1] as RasterLayer).canvas.width).toBe(10);
  });

  test("eraseSelection clears doc-space pixels on an offset layer", () => {
    const pasted = addRedPastedLayer(); // active, 10×10 at (5,5)
    actions.setSelection({ x: 5, y: 5, w: 2, h: 2 });
    expect(actions.eraseSelection()).toBe(true);
    expect(pixel(pasted, 0, 0)[3]).toBe(0); // doc (5,5) = layer (0,0)
    expect(pixel(pasted, 5, 5)[3]).toBe(255);
    actions.undo();
    expect(pixel(activeRaster(), 0, 0)[3]).toBe(255);
  });

  test("eraseSelection is a no-op without a selection", () => {
    expect(actions.eraseSelection()).toBe(false);
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
