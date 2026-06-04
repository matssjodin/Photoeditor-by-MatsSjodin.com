// Test-only DOM canvas polyfill.
//
// The editor's pixel logic (src/editor/selection.ts, store.ts) is built on real
// <canvas> APIs: document.createElement("canvas"), 2D contexts, ImageData,
// drawImage, getImageData/putImageData, gradients, flood fills. Bun's test
// runtime has no DOM, so we map those calls onto @napi-rs/canvas (a Skia-backed
// implementation) to exercise the genuine algorithms instead of mocks.
import { Canvas, ImageData as NapiImageData } from "@napi-rs/canvas";

// makeCanvas() does `document.createElement("canvas")` then sets width/height.
// @napi-rs Canvas takes dimensions in its constructor and supports resizing via
// the width/height setters, so a 1x1 placeholder that callers then resize works.
const documentPolyfill = {
  createElement(tagName: string) {
    if (tagName.toLowerCase() === "canvas") return new Canvas(1, 1);
    throw new Error(`test canvas polyfill: unsupported element <${tagName}>`);
  },
};

const g = globalThis as Record<string, unknown>;
if (typeof g.document === "undefined") g.document = documentPolyfill;
if (typeof g.ImageData === "undefined") g.ImageData = NapiImageData;
if (typeof g.HTMLCanvasElement === "undefined") g.HTMLCanvasElement = Canvas;
