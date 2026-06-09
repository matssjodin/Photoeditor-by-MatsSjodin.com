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
 */
export function clippedLayerDraw(
  layer: RasterLayer,
  selection: Selection | null,
  draw: (ctx: CanvasRenderingContext2D) => void,
) {
  if (selection?.mask) {
    const tmp = makeCanvas(layer.canvas.width, layer.canvas.height);
    const tctx = tmp.getContext("2d")!;
    tctx.translate(-layer.x, -layer.y);
    draw(tctx);
    tctx.setTransform(1, 0, 0, 1, 0, 0);
    tctx.globalCompositeOperation = "destination-in";
    tctx.drawImage(selection.mask, -layer.x, -layer.y);
    layer.canvas.getContext("2d")!.drawImage(tmp, 0, 0);
    return;
  }
  const ctx = layer.canvas.getContext("2d")!;
  ctx.save();
  ctx.translate(-layer.x, -layer.y);
  if (selection) {
    ctx.beginPath();
    ctx.rect(selection.x, selection.y, selection.w, selection.h);
    ctx.clip();
  }
  draw(ctx);
  ctx.restore();
}
