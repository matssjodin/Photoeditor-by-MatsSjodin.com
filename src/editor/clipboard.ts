// OS-clipboard integration. Paste (Ctrl+V) turns a clipboard image into a
// new layer; Copy/Cut (Ctrl+C/X) put a PNG of the flattened selection (or
// the whole document) on the clipboard. Cut additionally erases the
// selected pixels from the active raster layer.

import { actions, getState } from "./store";
import { compositeDoc } from "./composite";
import { makeCanvas } from "./types";

/** Paste an image blob from the clipboard as a new centred layer. */
export async function pasteBlobAsLayer(blob: Blob): Promise<void> {
  const bmp = await createImageBitmap(blob);
  actions.addImageLayer(bmp, bmp.width, bmp.height, "Pasted");
  bmp.close();
}

/** Extract the image blob from a paste event, if any. */
export function imageFromClipboardEvent(e: ClipboardEvent): Blob | null {
  const items = e.clipboardData?.items;
  if (!items) return null;
  for (const item of items) {
    if (item.type.startsWith("image/")) return item.getAsFile();
  }
  return null;
}

/**
 * Copy the flattened, visible pixels of the current selection (or the whole
 * document when nothing is selected) to the OS clipboard as a PNG.
 * With `cut`, also erase the selected pixels from the active raster layer.
 */
export async function copyToClipboard(cut: boolean): Promise<boolean> {
  const { doc } = getState();
  if (doc.layers.length === 0) return false;
  const sel = doc.selection;
  const flat = compositeDoc(doc);

  let region: HTMLCanvasElement = flat;
  if (sel) {
    const w = Math.max(1, Math.round(sel.w));
    const h = Math.max(1, Math.round(sel.h));
    region = makeCanvas(w, h);
    const ctx = region.getContext("2d")!;
    ctx.drawImage(flat, -Math.round(sel.x), -Math.round(sel.y));
    if (sel.mask) {
      ctx.globalCompositeOperation = "destination-in";
      ctx.drawImage(sel.mask, -Math.round(sel.x), -Math.round(sel.y));
    }
  }

  const blob = await new Promise<Blob | null>((resolve) =>
    region.toBlob((b) => resolve(b), "image/png"),
  );
  if (!blob) return false;
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);

  if (cut && sel) {
    actions.eraseSelection("Cut");
  }
  return true;
}
