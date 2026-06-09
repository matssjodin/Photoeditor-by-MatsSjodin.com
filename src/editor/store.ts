// Lightweight global store using useSyncExternalStore.
// Layers are mutable (canvases), so we bump a version number to trigger renders.

import { useSyncExternalStore } from "react";
import {
  DEFAULT_ADJUSTMENTS,
  type Adjustments,
  type DocState,
  type Layer,
  type RasterLayer,
  type Selection,
  type TextLayer,
  type ToolId,
  makeCanvas,
  uid,
} from "./types";

interface ToolState {
  tool: ToolId;
  brushSize: number;
  brushHardness: number; // 0..1
  brushColor: string;
  secondaryColor: string;
  fontSize: number;
  fontFamily: string;
  // Selection options
  tolerance: number; // 0..255 — magic wand / fill colour tolerance
  wandContiguous: boolean; // limit wand to contiguous pixels
  selectionMode: "replace" | "add" | "subtract";
  feather: number; // px — gaussian feather applied to new selections
  // Shape tool
  shapeKind: "rectangle" | "ellipse" | "line" | "arrow";
  shapeFill: boolean; // fill with the primary colour
  shapeStroke: boolean; // outline with the secondary colour
  shapeStrokeWidth: number;
  // Gradient tool
  gradientKind: "linear" | "radial";
  gradientToTransparent: boolean; // fade to transparent instead of the secondary colour
}

interface HistoryEntry {
  label: string;
  // For raster ops we store a snapshot of the affected layer's bitmap.
  // For structural ops (add/delete/reorder) we store the whole layer list snapshot.
  // For props ops (move/transform) we store shallow before/after layer props.
  kind: "raster" | "structural" | "props";
  layerId?: string;
  before?: ImageData;
  after?: ImageData;
  // Mask snapshots accompany raster entries when the layer has a mask, so
  // rotate/flip/undo keep pixels and mask aligned.
  maskBefore?: ImageData;
  maskAfter?: ImageData;
  propsBefore?: Partial<Layer>;
  propsAfter?: Partial<Layer>;
  layersBefore?: Layer[];
  layersAfter?: Layer[];
  selectionBefore?: Selection | null;
  selectionAfter?: Selection | null;
  // Document dimensions before/after structural ops (resize, crop).
  sizeBefore?: { w: number; h: number };
  sizeAfter?: { w: number; h: number };
}

interface State {
  doc: DocState;
  tool: ToolState;
  history: HistoryEntry[];
  historyIndex: number; // index of last applied entry; -1 = none
  version: number;
}

const listeners = new Set<() => void>();

const initialDoc: DocState = {
  width: 1200,
  height: 800,
  layers: [],
  activeLayerId: null,
  selection: null,
};

const state: State = {
  doc: initialDoc,
  tool: {
    tool: "brush",
    brushSize: 24,
    brushHardness: 0.8,
    brushColor: "#7cc4ff",
    secondaryColor: "#ffffff",
    fontSize: 64,
    fontFamily: "Inter, system-ui, sans-serif",
    tolerance: 32,
    wandContiguous: true,
    selectionMode: "replace",
    feather: 0,
    shapeKind: "rectangle",
    shapeFill: true,
    shapeStroke: false,
    shapeStrokeWidth: 4,
    gradientKind: "linear",
    gradientToTransparent: false,
  },
  history: [],
  historyIndex: -1,
  version: 0,
};

function emit() {
  state.version++;
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function snapshot() {
  return state.version;
}

export function useEditor() {
  useSyncExternalStore(subscribe, snapshot, snapshot);
  return state;
}

export function getState() {
  return state;
}

// ---------- Layer helpers ----------

export function newRasterLayer(name = "Layer", fill?: string): RasterLayer {
  const canvas = makeCanvas(state.doc.width, state.doc.height);
  if (fill) {
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  return {
    id: uid(),
    type: "raster",
    name,
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: "source-over",
    adjustments: { ...DEFAULT_ADJUSTMENTS },
    x: 0,
    y: 0,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    flipX: false,
    flipY: false,
    canvas,
  };
}

export function newTextLayer(text = "Hello"): TextLayer {
  return {
    id: uid(),
    type: "text",
    name: text.slice(0, 16),
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: "source-over",
    adjustments: { ...DEFAULT_ADJUSTMENTS },
    x: state.doc.width / 2,
    y: state.doc.height / 2,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    flipX: false,
    flipY: false,
    text,
    fontFamily: state.tool.fontFamily,
    fontSize: state.tool.fontSize,
    color: state.tool.brushColor,
    bold: false,
    italic: false,
  };
}

export const actions = {
  // ---------- Document ----------
  // `background` may be a CSS colour or "transparent" (or null) for an empty,
  // transparent background layer.
  newDocument(width: number, height: number, background: string | null = "#ffffff") {
    state.doc = {
      width,
      height,
      layers: [],
      activeLayerId: null,
      selection: null,
    };
    state.history = [];
    state.historyIndex = -1;
    const transparent = !background || background === "transparent";
    const bg = newRasterLayer("Background", transparent ? undefined : background);
    state.doc.layers.push(bg);
    state.doc.activeLayerId = bg.id;
    emit();
  },

  loadImage(img: HTMLImageElement) {
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    state.doc = {
      width: w,
      height: h,
      layers: [],
      activeLayerId: null,
      selection: null,
    };
    const layer = newRasterLayer(img.src.split("/").pop()?.slice(0, 16) || "Image");
    const ctx = layer.canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    state.doc.layers.push(layer);
    state.doc.activeLayerId = layer.id;
    state.history = [];
    state.historyIndex = -1;
    emit();
  },

  // ---------- Tool ----------
  setTool(t: Partial<ToolState>) {
    state.tool = { ...state.tool, ...t };
    emit();
  },

  // ---------- Layers ----------
  addLayer(kind: "raster" | "text" = "raster") {
    const layer =
      kind === "text"
        ? newTextLayer("Text")
        : newRasterLayer("Layer " + (state.doc.layers.length + 1));
    this._structural("Add layer", () => {
      state.doc.layers.push(layer);
      state.doc.activeLayerId = layer.id;
    });
  },

  deleteLayer(id: string) {
    this._structural("Delete layer", () => {
      state.doc.layers = state.doc.layers.filter((l) => l.id !== id);
      if (state.doc.activeLayerId === id) {
        state.doc.activeLayerId = state.doc.layers[state.doc.layers.length - 1]?.id ?? null;
      }
    });
  },

  duplicateLayer(id: string) {
    this._structural("Duplicate layer", () => {
      const idx = state.doc.layers.findIndex((l) => l.id === id);
      if (idx < 0) return;
      const src = state.doc.layers[idx];
      let copy: Layer;
      if (src.type === "raster") {
        const c = makeCanvas(src.canvas.width, src.canvas.height);
        c.getContext("2d")!.drawImage(src.canvas, 0, 0);
        copy = { ...src, id: uid(), name: src.name + " copy", canvas: c, mask: cloneMask(src) };
      } else {
        copy = { ...src, id: uid(), name: src.name + " copy" };
      }
      state.doc.layers.splice(idx + 1, 0, copy);
      state.doc.activeLayerId = copy.id;
    });
  },

  reorderLayer(id: string, dir: -1 | 1) {
    this._structural("Reorder layer", () => {
      const idx = state.doc.layers.findIndex((l) => l.id === id);
      if (idx < 0) return;
      const target = idx + dir;
      if (target < 0 || target >= state.doc.layers.length) return;
      const [l] = state.doc.layers.splice(idx, 1);
      state.doc.layers.splice(target, 0, l);
    });
  },

  setActiveLayer(id: string) {
    state.doc.activeLayerId = id;
    emit();
  },

  updateLayer(id: string, patch: Partial<Layer>) {
    const l = state.doc.layers.find((x) => x.id === id);
    if (!l) return;
    Object.assign(l, patch);
    emit();
  },

  updateAdjustments(id: string, patch: Partial<Adjustments>) {
    const l = state.doc.layers.find((x) => x.id === id);
    if (!l) return;
    l.adjustments = { ...l.adjustments, ...patch };
    emit();
  },

  // ---------- Selection ----------
  setSelection(sel: Selection | null) {
    state.doc.selection = sel;
    emit();
  },

  // ---------- Transforms on active raster layer ----------
  rotateActive(deg: 90 | -90 | 180) {
    const l = this.activeRaster();
    if (!l) return;
    const rotate = (canvas: HTMLCanvasElement) => {
      const w = canvas.width;
      const h = canvas.height;
      const nw = deg === 180 ? w : h;
      const nh = deg === 180 ? h : w;
      const out = makeCanvas(nw, nh);
      const ctx = out.getContext("2d")!;
      ctx.translate(nw / 2, nh / 2);
      ctx.rotate((deg * Math.PI) / 180);
      ctx.drawImage(canvas, -w / 2, -h / 2);
      canvas.width = nw;
      canvas.height = nh;
      canvas.getContext("2d")!.drawImage(out, 0, 0);
    };
    this.recordRaster("Rotate", l.id, () => {
      rotate(l.canvas);
      if (l.mask) rotate(l.mask);
    });
  },

  flipActive(axis: "x" | "y") {
    const l = this.activeRaster();
    if (!l) return;
    const flip = (canvas: HTMLCanvasElement) => {
      const out = makeCanvas(canvas.width, canvas.height);
      const ctx = out.getContext("2d")!;
      ctx.translate(axis === "x" ? canvas.width : 0, axis === "y" ? canvas.height : 0);
      ctx.scale(axis === "x" ? -1 : 1, axis === "y" ? -1 : 1);
      ctx.drawImage(canvas, 0, 0);
      canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);
      canvas.getContext("2d")!.drawImage(out, 0, 0);
    };
    this.recordRaster("Flip", l.id, () => {
      flip(l.canvas);
      if (l.mask) flip(l.mask);
    });
  },

  resizeDocument(w: number, h: number) {
    this._structural("Resize document", () => {
      const sx = w / state.doc.width;
      const sy = h / state.doc.height;
      state.doc.layers.forEach((l) => {
        if (l.type === "raster") {
          const out = makeCanvas(w, h);
          out.getContext("2d")!.drawImage(l.canvas, 0, 0, w, h);
          l.canvas = out;
          if (l.mask) {
            const m = makeCanvas(w, h);
            m.getContext("2d")!.drawImage(l.mask, 0, 0, w, h);
            l.mask = m;
          }
        } else {
          l.x *= sx;
          l.y *= sy;
          l.fontSize *= (sx + sy) / 2;
        }
      });
      state.doc.width = w;
      state.doc.height = h;
      state.doc.selection = null;
    });
  },

  cropToSelection() {
    const sel = state.doc.selection;
    if (!sel) return;
    this._structural("Crop", () => {
      const { x, y, w, h } = sel;
      state.doc.layers.forEach((l) => {
        if (l.type === "raster") {
          const out = makeCanvas(w, h);
          out.getContext("2d")!.drawImage(l.canvas, -x, -y);
          l.canvas = out;
          if (l.mask) {
            const m = makeCanvas(w, h);
            m.getContext("2d")!.drawImage(l.mask, -x, -y);
            l.mask = m;
          }
        } else {
          l.x -= x;
          l.y -= y;
        }
      });
      state.doc.width = w;
      state.doc.height = h;
      state.doc.selection = null;
    });
  },

  // ---------- Adjustments: bake into active raster ----------
  bakeAdjustments(id: string) {
    const l = state.doc.layers.find((x) => x.id === id);
    if (!l || l.type !== "raster") return;
    const a = l.adjustments;
    if (
      a.brightness === 0 &&
      a.contrast === 0 &&
      a.saturation === 0 &&
      a.exposure === 0 &&
      a.hue === 0 &&
      a.blur === 0 &&
      a.grayscale === 0 &&
      a.sepia === 0 &&
      a.invert === 0
    )
      return;
    this.recordRaster("Apply adjustments", id, () => {
      const out = makeCanvas(l.canvas.width, l.canvas.height);
      const ctx = out.getContext("2d")!;
      // CSS-style filter is supported on canvas in modern browsers.
      // We construct the same string as buildFilterString.
      const filter = [
        `brightness(${1 + a.brightness / 100 + a.exposure / 100})`,
        `contrast(${1 + a.contrast / 100})`,
        `saturate(${1 + a.saturation / 100})`,
        `hue-rotate(${a.hue}deg)`,
        a.blur > 0 ? `blur(${a.blur}px)` : "",
        a.grayscale > 0 ? `grayscale(${a.grayscale}%)` : "",
        a.sepia > 0 ? `sepia(${a.sepia}%)` : "",
        a.invert > 0 ? `invert(${a.invert}%)` : "",
      ]
        .filter(Boolean)
        .join(" ");
      ctx.filter = filter;
      ctx.drawImage(l.canvas, 0, 0);
      l.canvas.getContext("2d")!.clearRect(0, 0, l.canvas.width, l.canvas.height);
      l.canvas.getContext("2d")!.drawImage(out, 0, 0);
      l.adjustments = { ...DEFAULT_ADJUSTMENTS };
    });
  },

  // ---------- Helpers ----------
  activeLayer(): Layer | null {
    return state.doc.layers.find((l) => l.id === state.doc.activeLayerId) ?? null;
  },
  activeRaster(): RasterLayer | null {
    const l = this.activeLayer();
    return l && l.type === "raster" && !l.locked ? l : null;
  },

  // ---------- History ----------
  /** Record a structural change (layer add/remove/reorder/resize/crop). */
  _structural(label: string, mutate: () => void) {
    const layersBefore = cloneLayers(state.doc.layers);
    const selectionBefore = state.doc.selection;
    const wBefore = state.doc.width;
    const hBefore = state.doc.height;
    mutate();
    const entry: HistoryEntry = {
      kind: "structural",
      label,
      layersBefore,
      layersAfter: cloneLayers(state.doc.layers),
      selectionBefore,
      selectionAfter: state.doc.selection,
      sizeBefore: { w: wBefore, h: hBefore },
      sizeAfter: { w: state.doc.width, h: state.doc.height },
    };
    pushHistory(entry);
    emit();
  },

  /** Wrap a raster-pixel mutation with before/after snapshots. */
  recordRaster(label: string, layerId: string, mutate: () => void) {
    const l = state.doc.layers.find((x) => x.id === layerId);
    if (!l || l.type !== "raster") return;
    const before = snapshotCanvas(l.canvas);
    const maskBefore = l.mask ? snapshotCanvas(l.mask) : undefined;
    mutate();
    const updated = state.doc.layers.find((x) => x.id === layerId) as RasterLayer;
    const after = snapshotCanvas(updated.canvas);
    const maskAfter = updated.mask ? snapshotCanvas(updated.mask) : undefined;
    pushHistory({ kind: "raster", label, layerId, before, after, maskBefore, maskAfter });
    emit();
  },

  /**
   * Record a change to a layer's lightweight props (position, rotation,
   * scale, flips). The caller applies the change; this just stores the
   * before/after patches so undo/redo can replay them.
   */
  recordProps(label: string, layerId: string, before: Partial<Layer>, after: Partial<Layer>) {
    const keys = Object.keys(before) as (keyof Layer)[];
    const l = state.doc.layers.find((x) => x.id === layerId);
    if (!l || keys.every((k) => before[k] === after[k])) return;
    pushHistory({ kind: "props", label, layerId, propsBefore: before, propsAfter: after });
    emit();
  },

  /** For continuous painting strokes: call beginStroke before, endStroke after. */
  beginStroke(layerId: string, target: "pixels" | "mask" = "pixels") {
    const l = state.doc.layers.find((x) => x.id === layerId);
    if (!l || l.type !== "raster") return;
    const canvas = target === "mask" ? l.mask : l.canvas;
    if (!canvas) return;
    pendingStroke = { layerId, target, before: snapshotCanvas(canvas) };
  },
  endStroke(label = "Paint") {
    if (!pendingStroke) return;
    const l = state.doc.layers.find((x) => x.id === pendingStroke!.layerId) as
      | RasterLayer
      | undefined;
    const canvas = pendingStroke.target === "mask" ? l?.mask : l?.canvas;
    if (!l || !canvas) {
      pendingStroke = null;
      return;
    }
    const after = snapshotCanvas(canvas);
    pushHistory(
      pendingStroke.target === "mask"
        ? {
            kind: "raster",
            label,
            layerId: pendingStroke.layerId,
            maskBefore: pendingStroke.before,
            maskAfter: after,
          }
        : {
            kind: "raster",
            label,
            layerId: pendingStroke.layerId,
            before: pendingStroke.before,
            after,
          },
    );
    pendingStroke = null;
    emit();
  },

  undo() {
    if (state.historyIndex < 0) return;
    const e = state.history[state.historyIndex];
    applyHistory(e, "before");
    state.historyIndex--;
    emit();
  },
  redo() {
    if (state.historyIndex >= state.history.length - 1) return;
    state.historyIndex++;
    const e = state.history[state.historyIndex];
    applyHistory(e, "after");
    emit();
  },
};

let pendingStroke: { layerId: string; target: "pixels" | "mask"; before: ImageData } | null = null;

function snapshotCanvas(c: HTMLCanvasElement): ImageData {
  return c.getContext("2d")!.getImageData(0, 0, c.width, c.height);
}

function cloneLayers(layers: Layer[]): Layer[] {
  return layers.map((l) => {
    if (l.type === "raster") {
      const c = makeCanvas(l.canvas.width, l.canvas.height);
      c.getContext("2d")!.drawImage(l.canvas, 0, 0);
      return { ...l, canvas: c, mask: cloneMask(l), adjustments: { ...l.adjustments } };
    }
    return { ...l, adjustments: { ...l.adjustments } };
  });
}

function cloneMask(l: RasterLayer): HTMLCanvasElement | undefined {
  if (!l.mask) return undefined;
  const m = makeCanvas(l.mask.width, l.mask.height);
  m.getContext("2d")!.drawImage(l.mask, 0, 0);
  return m;
}

function applyHistory(e: HistoryEntry, which: "before" | "after") {
  if (e.kind === "raster" && e.layerId) {
    const l = state.doc.layers.find((x) => x.id === e.layerId) as RasterLayer | undefined;
    if (!l) return;
    const data = which === "before" ? e.before : e.after;
    if (data) {
      if (l.canvas.width !== data.width || l.canvas.height !== data.height) {
        l.canvas.width = data.width;
        l.canvas.height = data.height;
      }
      l.canvas.getContext("2d")!.putImageData(data, 0, 0);
    }
    const maskData = which === "before" ? e.maskBefore : e.maskAfter;
    if (maskData && l.mask) {
      if (l.mask.width !== maskData.width || l.mask.height !== maskData.height) {
        l.mask.width = maskData.width;
        l.mask.height = maskData.height;
      }
      l.mask.getContext("2d")!.putImageData(maskData, 0, 0);
    }
  } else if (e.kind === "props" && e.layerId) {
    const l = state.doc.layers.find((x) => x.id === e.layerId);
    if (!l) return;
    Object.assign(l, which === "before" ? e.propsBefore : e.propsAfter);
  } else if (e.kind === "structural") {
    const layers = which === "before" ? e.layersBefore! : e.layersAfter!;
    state.doc.layers = cloneLayers(layers);
    state.doc.selection = (which === "before" ? e.selectionBefore : e.selectionAfter) ?? null;
    const size = which === "before" ? e.sizeBefore : e.sizeAfter;
    if (size) {
      state.doc.width = size.w;
      state.doc.height = size.h;
    }
    if (!state.doc.layers.find((l) => l.id === state.doc.activeLayerId)) {
      state.doc.activeLayerId = state.doc.layers[state.doc.layers.length - 1]?.id ?? null;
    }
  }
}

function pushHistory(e: HistoryEntry) {
  // Drop redo tail
  state.history = state.history.slice(0, state.historyIndex + 1);
  state.history.push(e);
  // Cap history to ~30 entries to bound memory.
  if (state.history.length > 30) state.history.shift();
  state.historyIndex = state.history.length - 1;
}
