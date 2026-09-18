// Core types for the image editor.

export type ToolId =
  | "move"
  | "select-rect"
  | "lasso"
  | "wand"
  | "brush"
  | "eraser"
  | "fill"
  | "shape"
  | "gradient"
  | "clone"
  | "text"
  | "crop"
  | "eyedropper";

export type BlendMode =
  | "source-over"
  | "multiply"
  | "screen"
  | "overlay"
  | "darken"
  | "lighten"
  | "color-dodge"
  | "color-burn"
  | "soft-light"
  | "hard-light"
  | "difference"
  | "exclusion";

export interface Adjustments {
  brightness: number; // -100..100
  contrast: number; // -100..100
  saturation: number; // -100..100
  exposure: number; // -100..100
  hue: number; // -180..180
  blur: number; // 0..20
  grayscale: number; // 0..100
  sepia: number; // 0..100
  invert: number; // 0..100
}

export const DEFAULT_ADJUSTMENTS: Adjustments = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  exposure: 0,
  hue: 0,
  blur: 0,
  grayscale: 0,
  sepia: 0,
  invert: 0,
};

export interface BaseLayer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number; // 0..1
  blendMode: BlendMode;
  adjustments: Adjustments;
  // Transform relative to document origin
  x: number;
  y: number;
  rotation: number; // degrees
  scaleX: number; // 1 = natural size; always positive (flips carry the sign)
  scaleY: number;
  flipX: boolean;
  flipY: boolean;
}

export interface RasterLayer extends BaseLayer {
  type: "raster";
  // Off-screen canvas storing the pixels for this layer
  canvas: HTMLCanvasElement;
  // Optional layer mask, same size as `canvas`. Alpha > 0 = visible.
  // Compositing applies it via destination-in; pixels stay intact until
  // the mask is applied (baked) or deleted.
  mask?: HTMLCanvasElement;
}

export interface TextLayer extends BaseLayer {
  type: "text";
  text: string;
  fontFamily: string;
  fontSize: number;
  color: string;
  bold: boolean;
  italic: boolean;
}

export type Layer = RasterLayer | TextLayer;

export interface Selection {
  // Bounding box of the selection in document space.
  x: number;
  y: number;
  w: number;
  h: number;
  // Optional pixel mask (doc-sized) describing non-rectangular shapes
  // (lasso, magic wand). Alpha > 0 = inside selection.
  // When absent the selection is the full bounding rectangle.
  mask?: HTMLCanvasElement;
}

export interface DocState {
  width: number;
  height: number;
  layers: Layer[];
  activeLayerId: string | null;
  selection: Selection | null;
}

export function buildFilterString(a: Adjustments): string {
  // Map our 0-based ranges into CSS filter values.
  const brightness = Math.max(0, 1 + a.brightness / 100 + a.exposure / 100);
  const contrast = 1 + a.contrast / 100;
  const saturate = 1 + a.saturation / 100;
  return [
    `brightness(${brightness})`,
    `contrast(${contrast})`,
    `saturate(${saturate})`,
    `hue-rotate(${a.hue}deg)`,
    a.blur > 0 ? `blur(${a.blur}px)` : "",
    a.grayscale > 0 ? `grayscale(${a.grayscale}%)` : "",
    a.sepia > 0 ? `sepia(${a.sepia}%)` : "",
    a.invert > 0 ? `invert(${a.invert}%)` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}
