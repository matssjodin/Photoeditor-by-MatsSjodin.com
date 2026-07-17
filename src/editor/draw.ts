// Doc-space drawing helpers for the shape/gradient tools: geometry,
// shift-constraints, and clipping a drawing operation to the current
// selection (rect or mask) while compensating for the layer's offset.

import { makeCanvas, type RasterLayer, type Selection } from "./types";

export type ShapeKind = "rectangle" | "ellipse" | "line" | "arrow";

export interface ShapeStyle {
  kind: ShapeKind;
  fill: string | null; // null = no fill
  stroke: string | null; // null = no stroke
  strokeWidth: number;
}

/**
 * Apply the shift-constraint to a drag: squares/circles for boxes,
 * 45°-snapped direction for lines/arrows.
 */
export function constrainShape(
  kind: ShapeKind,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): { x1: number; y1: number } {
  const dx = x1 - x0;
  const dy = y1 - y0;
  if (kind === "rectangle" || kind === "ellipse") {
    const side = Math.max(Math.abs(dx), Math.abs(dy));
    return { x1: x0 + side * Math.sign(dx || 1), y1: y0 + side * Math.sign(dy || 1) };
  }
  const len = Math.hypot(dx, dy);
  const step = Math.PI / 4;
  const ang = Math.round(Math.atan2(dy, dx) / step) * step;
  return { x1: x0 + Math.cos(ang) * len, y1: y0 + Math.sin(ang) * len };
}

/** Draw a shape between two doc-space points with the given style. */
export function drawShape(
  ctx: CanvasRenderingContext2D,
  style: ShapeStyle,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
) {
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  if (style.kind === "rectangle" || style.kind === "ellipse") {
    const x = Math.min(x0, x1);
    const y = Math.min(y0, y1);
    const w = Math.abs(x1 - x0);
    const h = Math.abs(y1 - y0);
    ctx.beginPath();
    if (style.kind === "rectangle") {
      ctx.rect(x, y, w, h);
    } else {
      ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    }
    if (style.fill) {
      ctx.fillStyle = style.fill;
      ctx.fill();
    }
    if (style.stroke && style.strokeWidth > 0) {
      ctx.strokeStyle = style.stroke;
      ctx.lineWidth = style.strokeWidth;
      ctx.stroke();
    }
  } else {
    // Lines and arrows always stroke with the primary colour.
    const color = style.stroke ?? style.fill ?? "#000000";
    const lw = Math.max(1, style.strokeWidth);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = lw;
    if (style.kind === "arrow") {
      const ang = Math.atan2(y1 - y0, x1 - x0);
      const head = Math.max(10, lw * 3);
      // Shorten the shaft so it doesn't poke through the head.
      const sx = x1 - Math.cos(ang) * head * 0.8;
      const sy = y1 - Math.sin(ang) * head * 0.8;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(sx, sy);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x1 - Math.cos(ang - 0.42) * head, y1 - Math.sin(ang - 0.42) * head);
      ctx.lineTo(x1 - Math.cos(ang + 0.42) * head, y1 - Math.sin(ang + 0.42) * head);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }
  }
  ctx.restore();
}

export interface GradientStyle {
  kind: "linear" | "radial";
  from: string;
  to: string | null; // null = fade to transparent
}

/** Convert #rrggbb to rgba() with the given alpha; returns input if not hex. */
export function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/**
 * Fill the doc-space rect (0,0,w,h) with a gradient defined by the drag
 * from (x0,y0) to (x1,y1).
 */
export function drawGradient(
  ctx: CanvasRenderingContext2D,
  style: GradientStyle,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  w: number,
  h: number,
) {
  const to = style.to ?? hexToRgba(style.from, 0);
  const grad =
    style.kind === "linear"
      ? ctx.createLinearGradient(x0, y0, x1, y1)
      : ctx.createRadialGradient(x0, y0, 0, x0, y0, Math.hypot(x1 - x0, y1 - y0) || 1);
  grad.addColorStop(0, style.from);
  grad.addColorStop(1, to);
  ctx.save();
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/**
 * Run a doc-space drawing operation against a raster layer's canvas,
 * compensating for the layer's offset and clipping to the selection
 * (rectangular or mask-based). Rotation/scale are intentionally ignored,
 * matching the brush/fill tools.
 *
 * `opts.composite` sets the final compositing mode (e.g. "destination-out"
 * for erasing); `opts.target` redirects the draw onto another layer-aligned
 * canvas (the layer's mask) instead of its pixels.
 */
export function clippedLayerDraw(
  layer: RasterLayer,
  selection: Selection | null,
  draw: (ctx: CanvasRenderingContext2D) => void,
  opts: { composite?: GlobalCompositeOperation; target?: HTMLCanvasElement } = {},
) {
  const target = opts.target ?? layer.canvas;
  const composite = opts.composite ?? "source-over";
  if (selection?.mask) {
    const tmp = makeCanvas(target.width, target.height);
    const tctx = tmp.getContext("2d")!;
    tctx.translate(-layer.x, -layer.y);
    draw(tctx);
    tctx.setTransform(1, 0, 0, 1, 0, 0);
    tctx.globalCompositeOperation = "destination-in";
    tctx.drawImage(selection.mask, -layer.x, -layer.y);
    const ctx = target.getContext("2d")!;
    ctx.save();
    ctx.globalCompositeOperation = composite;
    ctx.drawImage(tmp, 0, 0);
    ctx.restore();
    return;
  }
  const ctx = target.getContext("2d")!;
  ctx.save();
  ctx.translate(-layer.x, -layer.y);
  if (selection) {
    ctx.beginPath();
    ctx.rect(selection.x, selection.y, selection.w, selection.h);
    ctx.clip();
  }
  ctx.globalCompositeOperation = composite;
  draw(ctx);
  ctx.restore();
}

/**
 * Stamp a soft brush dab at doc-space (x, y), clipped to the selection.
 * When `maskCanvas` is given the dab targets the layer's mask instead:
 * brushing reveals (paints opaque white), erasing hides (clears alpha).
 */
export function paintStamp(
  layer: RasterLayer,
  x: number,
  y: number,
  erase: boolean,
  tool: { brushSize: number; brushHardness: number; brushColor: string },
  selection: Selection | null,
  maskCanvas?: HTMLCanvasElement,
) {
  const r = tool.brushSize / 2;
  const paintColor = maskCanvas ? "#ffffff" : tool.brushColor;
  const color = erase ? "rgba(0,0,0,1)" : paintColor;
  clippedLayerDraw(
    layer,
    selection,
    (ctx) => {
      const grad = ctx.createRadialGradient(x, y, r * tool.brushHardness, x, y, r);
      grad.addColorStop(0, color);
      grad.addColorStop(1, erase ? "rgba(0,0,0,0)" : hexToRgba(paintColor, 0));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    },
    { composite: erase ? "destination-out" : "source-over", target: maskCanvas },
  );
}

/**
 * Stamp one clone-brush dab at doc-space (x, y), copying pixels from the
 * stroke-start snapshot (`source`, in layer space) shifted by the stroke's
 * source offset. Soft edge via a radial alpha falloff; clipped like the brush.
 */
export function cloneStamp(
  layer: RasterLayer,
  source: HTMLCanvasElement,
  x: number,
  y: number,
  offsetX: number,
  offsetY: number,
  tool: { brushSize: number; brushHardness: number },
  selection: Selection | null,
) {
  const r = tool.brushSize / 2;
  // The dab in layer space; the source shift is translation-invariant.
  const lx = x - layer.x;
  const ly = y - layer.y;
  const tmp = makeCanvas(layer.canvas.width, layer.canvas.height);
  const tctx = tmp.getContext("2d")!;
  // Shift the snapshot so the source pixel lands under the brush.
  tctx.drawImage(source, offsetX, offsetY);
  // Keep only a soft disc of it.
  const grad = tctx.createRadialGradient(lx, ly, r * tool.brushHardness, lx, ly, r);
  grad.addColorStop(0, "rgba(0,0,0,1)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  tctx.globalCompositeOperation = "destination-in";
  tctx.fillStyle = grad;
  tctx.beginPath();
  tctx.arc(lx, ly, r, 0, Math.PI * 2);
  tctx.fill();
  if (selection?.mask) {
    tctx.drawImage(selection.mask, -layer.x, -layer.y);
  }
  const ctx = layer.canvas.getContext("2d")!;
  ctx.save();
  if (selection && !selection.mask) {
    ctx.beginPath();
    ctx.rect(selection.x - layer.x, selection.y - layer.y, selection.w, selection.h);
    ctx.clip();
  }
  ctx.drawImage(tmp, 0, 0);
  ctx.restore();
}

/**
 * Flood-fill the layer from the doc-space seed (x, y) with `hex`, within
 * `tolerance` per channel, confined to the selection (doc space).
 */
export function floodFill(
  layer: RasterLayer,
  x: number,
  y: number,
  hex: string,
  selection: Selection | null,
  tolerance: number,
) {
  const canvas = layer.canvas;
  const ox = Math.round(layer.x);
  const oy = Math.round(layer.y);
  const sx = Math.floor(x) - ox;
  const sy = Math.floor(y) - oy;
  if (sx < 0 || sy < 0 || sx >= canvas.width || sy >= canvas.height) return;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = img.data;
  const w = canvas.width;
  const h = canvas.height;
  const i0 = (sy * w + sx) * 4;
  const target = [data[i0], data[i0 + 1], data[i0 + 2], data[i0 + 3]];
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  const rgb = m ? parseInt(m[1], 16) : 0;
  const fill = [(rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255, 255];
  if (target.every((v, i) => v === fill[i])) return;
  const tol = tolerance;

  // Pre-read the selection mask once (if any) for fast per-pixel lookup.
  // The mask is doc-sized; pixels are layer-space, so translate via ox/oy.
  let maskData: Uint8ClampedArray | null = null;
  let maskW = 0;
  let maskH = 0;
  if (selection?.mask) {
    maskW = selection.mask.width;
    maskH = selection.mask.height;
    maskData = selection.mask.getContext("2d")!.getImageData(0, 0, maskW, maskH).data;
  }
  const inSel = (px: number, py: number) => {
    if (!selection) return true;
    const dx = px + ox;
    const dy = py + oy;
    if (maskData) {
      if (dx < 0 || dy < 0 || dx >= maskW || dy >= maskH) return false;
      return maskData[(dy * maskW + dx) * 4 + 3] > 0;
    }
    return (
      dx >= selection.x &&
      dy >= selection.y &&
      dx < selection.x + selection.w &&
      dy < selection.y + selection.h
    );
  };

  // Track visited pixels so the walk terminates even when the fill colour is
  // itself within tolerance of the target (already-filled pixels re-match).
  const visited = new Uint8Array(w * h);
  const stack: number[] = [sx, sy];
  while (stack.length) {
    const py = stack.pop()!;
    const px = stack.pop()!;
    if (px < 0 || py < 0 || px >= w || py >= h) continue;
    const vi = py * w + px;
    if (visited[vi]) continue;
    visited[vi] = 1;
    if (!inSel(px, py)) continue;
    const idx = (py * w + px) * 4;
    if (
      Math.abs(data[idx] - target[0]) > tol ||
      Math.abs(data[idx + 1] - target[1]) > tol ||
      Math.abs(data[idx + 2] - target[2]) > tol ||
      Math.abs(data[idx + 3] - target[3]) > tol
    )
      continue;
    data[idx] = fill[0];
    data[idx + 1] = fill[1];
    data[idx + 2] = fill[2];
    data[idx + 3] = fill[3];
    stack.push(px + 1, py, px - 1, py, px, py + 1, px, py - 1);
  }
  ctx.putImageData(img, 0, 0);
}
