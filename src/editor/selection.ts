// Selection utilities: build masks for lasso (polygon) and magic wand
// (colour-based) selections, combine them, and expose a clipping helper
// used by paint and fill operations so edits are confined to the
// currently selected pixels.

import { makeCanvas, type Selection } from "./types";

/** Create an empty mask canvas the size of the document. */
export function makeMask(w: number, h: number): HTMLCanvasElement {
  return makeCanvas(w, h);
}

/**
 * Apply a gaussian feather to a mask, producing soft alpha falloff at the
 * borders. Returns the same canvas for chaining (mutated in place).
 */
export function featherMask(mask: HTMLCanvasElement, radius: number): HTMLCanvasElement {
  if (radius <= 0) return mask;
  const tmp = makeCanvas(mask.width, mask.height);
  const tctx = tmp.getContext("2d")!;
  tctx.filter = `blur(${radius}px)`;
  tctx.drawImage(mask, 0, 0);
  const mctx = mask.getContext("2d")!;
  mctx.clearRect(0, 0, mask.width, mask.height);
  mctx.drawImage(tmp, 0, 0);
  return mask;
}

/** Build a Selection from a mask canvas by computing its non-zero bounds. */
export function selectionFromMask(mask: HTMLCanvasElement): Selection | null {
  const w = mask.width;
  const h = mask.height;
  const ctx = mask.getContext("2d")!;
  const data = ctx.getImageData(0, 0, w, h).data;
  let minX = w,
    minY = h,
    maxX = -1,
    maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 0) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1, mask };
}

/** Rasterise a polygon (in doc coords) into an alpha mask canvas. */
export function maskFromPolygon(
  docW: number,
  docH: number,
  points: { x: number; y: number }[],
): HTMLCanvasElement {
  const c = makeMask(docW, docH);
  if (points.length < 3) return c;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.closePath();
  ctx.fill("evenodd");
  return c;
}

/**
 * Magic wand: build a mask containing every pixel in `source` within
 * `tolerance` of the colour at (x, y). If `contiguous`, only the
 * flood-filled region connected to the seed is included.
 */
export function maskFromWand(
  source: HTMLCanvasElement,
  x: number,
  y: number,
  tolerance: number,
  contiguous: boolean,
  layerOffset: { x: number; y: number },
  docW: number,
  docH: number,
): HTMLCanvasElement | null {
  const sx = Math.floor(x - layerOffset.x);
  const sy = Math.floor(y - layerOffset.y);
  if (sx < 0 || sy < 0 || sx >= source.width || sy >= source.height) return null;
  const src = source.getContext("2d")!.getImageData(0, 0, source.width, source.height);
  const sd = src.data;
  const sw = source.width;
  const sh = source.height;
  const i0 = (sy * sw + sx) * 4;
  const tr = sd[i0],
    tg = sd[i0 + 1],
    tb = sd[i0 + 2],
    ta = sd[i0 + 3];
  const tol = tolerance;

  const out = makeMask(docW, docH);
  const octx = out.getContext("2d")!;
  const mask = octx.getImageData(0, 0, docW, docH);
  const md = mask.data;
  const ox = Math.round(layerOffset.x);
  const oy = Math.round(layerOffset.y);

  const matches = (idx: number) =>
    Math.abs(sd[idx] - tr) <= tol &&
    Math.abs(sd[idx + 1] - tg) <= tol &&
    Math.abs(sd[idx + 2] - tb) <= tol &&
    Math.abs(sd[idx + 3] - ta) <= tol;

  const setMask = (px: number, py: number) => {
    const dx = px + ox;
    const dy = py + oy;
    if (dx < 0 || dy < 0 || dx >= docW || dy >= docH) return;
    md[(dy * docW + dx) * 4 + 3] = 255;
  };

  if (contiguous) {
    const visited = new Uint8Array(sw * sh);
    const stack: number[] = [sx, sy];
    while (stack.length) {
      const py = stack.pop()!;
      const px = stack.pop()!;
      if (px < 0 || py < 0 || px >= sw || py >= sh) continue;
      const vi = py * sw + px;
      if (visited[vi]) continue;
      visited[vi] = 1;
      if (!matches(vi * 4)) continue;
      setMask(px, py);
      stack.push(px + 1, py, px - 1, py, px, py + 1, px, py - 1);
    }
  } else {
    for (let py = 0; py < sh; py++) {
      for (let px = 0; px < sw; px++) {
        if (matches((py * sw + px) * 4)) setMask(px, py);
      }
    }
  }

  octx.putImageData(mask, 0, 0);
  return out;
}

/** Combine an existing selection mask with a new one. */
export function combineMasks(
  base: HTMLCanvasElement | undefined,
  add: HTMLCanvasElement,
  mode: "replace" | "add" | "subtract",
  docW: number,
  docH: number,
): HTMLCanvasElement {
  if (mode === "replace" || !base) return add;
  const out = makeMask(docW, docH);
  const ctx = out.getContext("2d")!;
  ctx.drawImage(base, 0, 0);
  if (mode === "add") {
    ctx.globalCompositeOperation = "source-over";
    ctx.drawImage(add, 0, 0);
  } else {
    ctx.globalCompositeOperation = "destination-out";
    ctx.drawImage(add, 0, 0);
  }
  return out;
}

/** Returns true if the pixel at (x,y) is inside the selection. */
export function selectionContains(
  sel: Selection | null,
  data: Uint8ClampedArray | null,
  x: number,
  y: number,
  docW: number,
): boolean {
  if (!sel) return true;
  if (sel.mask && data) return data[(y * docW + x) * 4 + 3] > 0;
  return x >= sel.x && y >= sel.y && x < sel.x + sel.w && y < sel.y + sel.h;
}
