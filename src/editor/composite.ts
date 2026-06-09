// Shared layer compositing used by the display canvas, export, eyedropper
// sampling, and clipboard copy — one implementation so they can't drift.

import { buildFilterString, makeCanvas, type DocState, type Layer } from "./types";

/** Apply a layer's transform (translate → rotate → scale incl. flips). */
export function applyLayerTransform(ctx: CanvasRenderingContext2D, layer: Layer) {
  ctx.translate(layer.x, layer.y);
  if (layer.rotation) ctx.rotate((layer.rotation * Math.PI) / 180);
  const kx = layer.scaleX * (layer.flipX ? -1 : 1);
  const ky = layer.scaleY * (layer.flipY ? -1 : 1);
  if (kx !== 1 || ky !== 1) ctx.scale(kx, ky);
}

/** Draw a layer's content at its transform. Caller manages save/restore. */
export function drawLayerContent(ctx: CanvasRenderingContext2D, layer: Layer) {
  applyLayerTransform(ctx, layer);
  if (layer.type === "raster") {
    if (layer.mask) {
      // Mask via destination-in on a temp canvas so layer pixels stay intact.
      const tmp = makeCanvas(layer.canvas.width, layer.canvas.height);
      const tctx = tmp.getContext("2d")!;
      tctx.drawImage(layer.canvas, 0, 0);
      tctx.globalCompositeOperation = "destination-in";
      tctx.drawImage(layer.mask, 0, 0);
      ctx.drawImage(tmp, 0, 0);
    } else {
      ctx.drawImage(layer.canvas, 0, 0);
    }
  } else {
    ctx.fillStyle = layer.color;
    const weight = layer.bold ? "700" : "400";
    const style = layer.italic ? "italic" : "normal";
    ctx.font = `${style} ${weight} ${layer.fontSize}px ${layer.fontFamily}`;
    ctx.textBaseline = "top";
    layer.text.split("\n").forEach((line, i) => {
      ctx.fillText(line, 0, i * layer.fontSize * 1.2);
    });
  }
}

/** Draw a layer with its opacity, blend mode and live adjustments. */
export function drawLayer(ctx: CanvasRenderingContext2D, layer: Layer) {
  ctx.save();
  ctx.globalAlpha = layer.opacity;
  ctx.globalCompositeOperation = layer.blendMode;
  ctx.filter = buildFilterString(layer.adjustments);
  drawLayerContent(ctx, layer);
  ctx.restore();
}

/** Flatten all visible layers into a new canvas (export, sampling, copy). */
export function compositeDoc(
  doc: DocState,
  opts: { background?: string; skipLayerId?: string | null } = {},
): HTMLCanvasElement {
  const out = makeCanvas(doc.width, doc.height);
  const ctx = out.getContext("2d")!;
  if (opts.background) {
    ctx.fillStyle = opts.background;
    ctx.fillRect(0, 0, out.width, out.height);
  }
  for (const layer of doc.layers) {
    if (!layer.visible) continue;
    if (opts.skipLayerId && layer.id === opts.skipLayerId) continue;
    drawLayer(ctx, layer);
  }
  return out;
}

/** Approximate untransformed size of a layer in its local space. */
export function layerSizeOf(layer: Layer): { w: number; h: number } {
  if (layer.type === "raster") return { w: layer.canvas.width, h: layer.canvas.height };
  const lines = layer.text.split("\n");
  const ctx = makeCanvas(1, 1).getContext("2d")!;
  const weight = layer.bold ? "700" : "400";
  const style = layer.italic ? "italic" : "normal";
  ctx.font = `${style} ${weight} ${layer.fontSize}px ${layer.fontFamily}`;
  let w = 0;
  for (const line of lines) w = Math.max(w, ctx.measureText(line).width);
  return { w: Math.max(w, 1), h: Math.max(lines.length * layer.fontSize * 1.2, 1) };
}
