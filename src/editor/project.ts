// Project persistence: serialize the whole document (layers as PNG data
// URLs + JSON metadata) into a single .lumen file the user can save and
// re-open, plus an IndexedDB autosave so a refresh doesn't lose work.
// Everything stays on the client — nothing is uploaded.

import {
  DEFAULT_ADJUSTMENTS,
  makeCanvas,
  type Adjustments,
  type BlendMode,
  type DocState,
  type Layer,
} from "./types";

export const PROJECT_EXTENSION = ".lumen";

interface SerializedBase {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  blendMode: BlendMode;
  adjustments: Adjustments;
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  flipX: boolean;
  flipY: boolean;
}

interface SerializedRaster extends SerializedBase {
  type: "raster";
  width: number;
  height: number;
  pixels: string; // PNG data URL
  mask?: string; // PNG data URL
}

interface SerializedText extends SerializedBase {
  type: "text";
  text: string;
  fontFamily: string;
  fontSize: number;
  color: string;
  bold: boolean;
  italic: boolean;
}

export type SerializedLayer = SerializedRaster | SerializedText;

export interface ProjectFile {
  app: "lumen";
  version: 1;
  savedAt: string;
  width: number;
  height: number;
  activeLayerId: string | null;
  layers: SerializedLayer[];
}

export function serializeDoc(doc: DocState): ProjectFile {
  return {
    app: "lumen",
    version: 1,
    savedAt: new Date().toISOString(),
    width: doc.width,
    height: doc.height,
    activeLayerId: doc.activeLayerId,
    layers: doc.layers.map((l) => serializeLayer(l)),
  };
}

function serializeLayer(l: Layer): SerializedLayer {
  const base: SerializedBase = {
    id: l.id,
    name: l.name,
    visible: l.visible,
    locked: l.locked,
    opacity: l.opacity,
    blendMode: l.blendMode,
    adjustments: { ...l.adjustments },
    x: l.x,
    y: l.y,
    rotation: l.rotation,
    scaleX: l.scaleX,
    scaleY: l.scaleY,
    flipX: l.flipX,
    flipY: l.flipY,
  };
  if (l.type === "raster") {
    return {
      ...base,
      type: "raster",
      width: l.canvas.width,
      height: l.canvas.height,
      pixels: l.canvas.toDataURL("image/png"),
      mask: l.mask ? l.mask.toDataURL("image/png") : undefined,
    };
  }
  return {
    ...base,
    type: "text",
    text: l.text,
    fontFamily: l.fontFamily,
    fontSize: l.fontSize,
    color: l.color,
    bold: l.bold,
    italic: l.italic,
  };
}

// Upper bound for document/layer dimensions on restore. Matches the practical
// canvas size limit of mainstream browsers and stops a malformed or hostile
// project file from requesting an absurd allocation.
const MAX_DIM = 16384;

function isDim(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 1 && v <= MAX_DIM;
}

function isImageDataUrl(v: unknown): v is string {
  return typeof v === "string" && v.startsWith("data:image/");
}

function isSerializedLayer(value: unknown): value is SerializedLayer {
  const s = value as SerializedLayer | null;
  if (!s || typeof s !== "object") return false;
  if (typeof s.id !== "string" || typeof s.name !== "string") return false;
  if (s.type === "raster") {
    return (
      isDim(s.width) &&
      isDim(s.height) &&
      isImageDataUrl(s.pixels) &&
      (s.mask === undefined || isImageDataUrl(s.mask))
    );
  }
  if (s.type === "text") {
    return (
      typeof s.text === "string" &&
      typeof s.fontFamily === "string" &&
      typeof s.color === "string" &&
      typeof s.fontSize === "number" &&
      Number.isFinite(s.fontSize)
    );
  }
  return false;
}

export function isProjectFile(data: unknown): data is ProjectFile {
  const d = data as ProjectFile | null;
  return (
    !!d &&
    d.app === "lumen" &&
    d.version === 1 &&
    isDim(d.width) &&
    isDim(d.height) &&
    Array.isArray(d.layers) &&
    d.layers.every(isSerializedLayer)
  );
}

type ImageLoader = (src: string) => Promise<CanvasImageSource & { width: number; height: number }>;

const browserImageLoader: ImageLoader = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img as HTMLImageElement & { width: number; height: number });
    img.onerror = () => reject(new Error("Failed to decode layer image"));
    img.src = src;
  });

/** Rebuild a DocState from a project file. */
export async function deserializeDoc(
  file: ProjectFile,
  loadImage: ImageLoader = browserImageLoader,
): Promise<DocState> {
  // Tolerate missing/garbage numeric props from hand-edited or truncated
  // files — fall back to sane defaults instead of NaN-poisoning transforms.
  const num = (v: unknown, fallback: number) =>
    typeof v === "number" && Number.isFinite(v) ? v : fallback;
  const layers: Layer[] = [];
  for (const s of file.layers) {
    const base = {
      id: s.id,
      name: s.name,
      visible: s.visible !== false,
      locked: s.locked === true,
      opacity: Math.min(1, Math.max(0, num(s.opacity, 1))),
      blendMode: s.blendMode,
      adjustments: { ...DEFAULT_ADJUSTMENTS, ...s.adjustments },
      x: num(s.x, 0),
      y: num(s.y, 0),
      rotation: num(s.rotation, 0),
      scaleX: num(s.scaleX, 1),
      scaleY: num(s.scaleY, 1),
      flipX: s.flipX === true,
      flipY: s.flipY === true,
    };
    if (s.type === "raster") {
      const canvas = makeCanvas(s.width, s.height);
      canvas.getContext("2d")!.drawImage(await loadImage(s.pixels), 0, 0);
      let mask: HTMLCanvasElement | undefined;
      if (s.mask) {
        mask = makeCanvas(s.width, s.height);
        mask.getContext("2d")!.drawImage(await loadImage(s.mask), 0, 0);
      }
      layers.push({ ...base, type: "raster", canvas, mask });
    } else {
      layers.push({
        ...base,
        type: "text",
        text: s.text,
        fontFamily: s.fontFamily,
        fontSize: s.fontSize,
        color: s.color,
        bold: s.bold,
        italic: s.italic,
      });
    }
  }
  const activeLayerId = layers.find((l) => l.id === file.activeLayerId)
    ? file.activeLayerId
    : (layers[layers.length - 1]?.id ?? null);
  return {
    width: file.width,
    height: file.height,
    layers,
    activeLayerId,
    selection: null,
  };
}

// ---------- IndexedDB autosave ----------

const DB_NAME = "lumen-editor";
const STORE = "autosave";
const KEY = "doc";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveAutosave(file: ProjectFile): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(file, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function loadAutosave(): Promise<ProjectFile | null> {
  const db = await openDb();
  const result = await new Promise<unknown>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(KEY);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return isProjectFile(result) ? result : null;
}

export async function clearAutosave(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

/** Trigger a download of the project as a single .lumen file. */
export function downloadProject(doc: DocState, filename = `project${PROJECT_EXTENSION}`) {
  const json = JSON.stringify(serializeDoc(doc));
  const blob = new Blob([json], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Parse a user-supplied file as a project; null if it isn't one. */
export async function readProjectFile(file: File): Promise<ProjectFile | null> {
  try {
    const data: unknown = JSON.parse(await file.text());
    return isProjectFile(data) ? data : null;
  } catch {
    return null;
  }
}
