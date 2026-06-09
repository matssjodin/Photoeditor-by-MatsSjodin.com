// Free-transform math. A layer maps local → document space via
// translate(x, y) ∘ rotate(rotation) ∘ scale(±scaleX, ±scaleY) (flips carry
// the sign). These helpers convert between the two spaces and compute the
// scale/rotation updates for handle drags, keeping the drag anchor fixed.

export interface TransformProps {
  x: number;
  y: number;
  rotation: number; // degrees
  scaleX: number;
  scaleY: number;
  flipX: boolean;
  flipY: boolean;
}

export interface Point {
  x: number;
  y: number;
}

export type HandleId = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "rotate";

/** Local-space position (in units of layer size) for each scale handle. */
export const HANDLE_UNITS: Record<Exclude<HandleId, "rotate">, Point> = {
  nw: { x: 0, y: 0 },
  n: { x: 0.5, y: 0 },
  ne: { x: 1, y: 0 },
  e: { x: 1, y: 0.5 },
  se: { x: 1, y: 1 },
  s: { x: 0.5, y: 1 },
  sw: { x: 0, y: 1 },
  w: { x: 0, y: 0.5 },
};

const OPPOSITE: Record<Exclude<HandleId, "rotate">, Exclude<HandleId, "rotate">> = {
  nw: "se",
  n: "s",
  ne: "sw",
  e: "w",
  se: "nw",
  s: "n",
  sw: "ne",
  w: "e",
};

export function oppositeHandle(h: Exclude<HandleId, "rotate">): Exclude<HandleId, "rotate"> {
  return OPPOSITE[h];
}

function signedScale(t: TransformProps): { kx: number; ky: number } {
  return {
    kx: t.scaleX * (t.flipX ? -1 : 1),
    ky: t.scaleY * (t.flipY ? -1 : 1),
  };
}

/** Map a point from layer-local space to document space. */
export function localToDoc(t: TransformProps, p: Point): Point {
  const { kx, ky } = signedScale(t);
  const rad = (t.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const sx = p.x * kx;
  const sy = p.y * ky;
  return { x: t.x + sx * cos - sy * sin, y: t.y + sx * sin + sy * cos };
}

/** Rotate a doc-space vector into the layer's rotated frame (scale kept). */
export function docVecToRotated(rotationDeg: number, v: Point): Point {
  const rad = (-rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { x: v.x * cos - v.y * sin, y: v.x * sin + v.y * cos };
}

const MIN_SCALE = 0.01;

/**
 * Compute the layer props for dragging a scale handle to `pointer` (doc
 * space). The opposite handle stays fixed. `uniform` preserves the start
 * aspect ratio (default for corner handles).
 */
export function scaleDrag(
  start: TransformProps,
  size: { w: number; h: number },
  handle: Exclude<HandleId, "rotate">,
  pointer: Point,
  uniform: boolean,
): TransformProps {
  const hu = HANDLE_UNITS[handle];
  const au = HANDLE_UNITS[oppositeHandle(handle)];
  const handleLocal = { x: hu.x * size.w, y: hu.y * size.h };
  const anchorLocal = { x: au.x * size.w, y: au.y * size.h };
  const anchorDoc = localToDoc(start, anchorLocal);

  const { kx: k0x, ky: k0y } = signedScale(start);
  const v = docVecToRotated(start.rotation, {
    x: pointer.x - anchorDoc.x,
    y: pointer.y - anchorDoc.y,
  });
  const dx = handleLocal.x - anchorLocal.x;
  const dy = handleLocal.y - anchorLocal.y;
  let kx = dx !== 0 ? v.x / dx : k0x;
  let ky = dy !== 0 ? v.y / dy : k0y;

  if (uniform && dx !== 0 && dy !== 0) {
    const f = Math.max(Math.abs(kx / k0x), Math.abs(ky / k0y));
    kx = Math.sign(kx || k0x) * Math.abs(k0x) * f;
    ky = Math.sign(ky || k0y) * Math.abs(k0y) * f;
  }
  if (Math.abs(kx) < MIN_SCALE) kx = MIN_SCALE * Math.sign(kx || 1);
  if (Math.abs(ky) < MIN_SCALE) ky = MIN_SCALE * Math.sign(ky || 1);

  const next: TransformProps = {
    ...start,
    scaleX: Math.abs(kx),
    scaleY: Math.abs(ky),
    flipX: kx < 0,
    flipY: ky < 0,
  };
  // Re-anchor: move the origin so the anchor stays where it was.
  const a = localToDoc({ ...next, x: 0, y: 0 }, anchorLocal);
  next.x = anchorDoc.x - a.x;
  next.y = anchorDoc.y - a.y;
  return next;
}

/**
 * Compute the layer props for dragging the rotate handle to `pointer`.
 * The layer's center stays fixed. `snap` rounds to 15° steps.
 */
export function rotateDrag(
  start: TransformProps,
  size: { w: number; h: number },
  pointer: Point,
  snap: boolean,
): TransformProps {
  const centerDoc = localToDoc(start, { x: size.w / 2, y: size.h / 2 });
  let deg = (Math.atan2(pointer.y - centerDoc.y, pointer.x - centerDoc.x) * 180) / Math.PI + 90;
  if (snap) deg = Math.round(deg / 15) * 15;
  // Normalise to (-180, 180] for tidy display.
  deg = ((((deg + 180) % 360) + 360) % 360) - 180;
  const next: TransformProps = { ...start, rotation: deg };
  const c = localToDoc({ ...next, x: 0, y: 0 }, { x: size.w / 2, y: size.h / 2 });
  next.x = centerDoc.x - c.x;
  next.y = centerDoc.y - c.y;
  return next;
}
