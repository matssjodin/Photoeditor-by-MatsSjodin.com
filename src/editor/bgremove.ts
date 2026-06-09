// One-click background removal using MediaPipe's selfie segmentation,
// running entirely in the browser (WebAssembly, optionally GPU-delegated).
// The ~16 MB model and wasm runtime are lazy-loaded on first use from
// jsDelivr / Google's model CDN — the user's image never leaves the client.
//
// NOTE: the CSP in src/start.ts explicitly allows these two origins (and
// 'wasm-unsafe-eval'); update it if you change the URLs below.

import type { ImageSegmenter } from "@mediapipe/tasks-vision";
import { makeCanvas } from "./types";

// Keep the version in sync with package.json so the CDN wasm matches the JS API.
const WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite";

let segmenterPromise: Promise<ImageSegmenter> | null = null;

async function getSegmenter(): Promise<ImageSegmenter> {
  if (!segmenterPromise) {
    segmenterPromise = (async () => {
      const vision = await import("@mediapipe/tasks-vision");
      const fileset = await vision.FilesetResolver.forVisionTasks(WASM_BASE);
      const make = (delegate: "GPU" | "CPU") =>
        vision.ImageSegmenter.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate },
          runningMode: "IMAGE",
          outputConfidenceMasks: true,
          outputCategoryMask: false,
        });
      try {
        return await make("GPU");
      } catch {
        return await make("CPU");
      }
    })();
    // Allow a retry after a failed download instead of caching the rejection.
    segmenterPromise.catch(() => {
      segmenterPromise = null;
    });
  }
  return segmenterPromise;
}

/**
 * Compute a soft alpha mask (person = opaque) for the given canvas.
 * Returned canvas has the same dimensions as the input.
 */
export async function computeSubjectMask(canvas: HTMLCanvasElement): Promise<HTMLCanvasElement> {
  const segmenter = await getSegmenter();
  const result = segmenter.segment(canvas);
  try {
    const confidence = result.confidenceMasks?.[0];
    if (!confidence) throw new Error("Segmentation produced no mask");
    const data = confidence.getAsFloat32Array();
    const mw = confidence.width;
    const mh = confidence.height;
    const small = makeCanvas(mw, mh);
    const img = small.getContext("2d")!.createImageData(mw, mh);
    for (let i = 0; i < data.length; i++) {
      img.data[i * 4 + 3] = Math.round(Math.min(1, Math.max(0, data[i])) * 255);
    }
    small.getContext("2d")!.putImageData(img, 0, 0);
    // Scale to the layer size in case the model output differs.
    const out = makeCanvas(canvas.width, canvas.height);
    out.getContext("2d")!.drawImage(small, 0, 0, canvas.width, canvas.height);
    return out;
  } finally {
    result.close();
  }
}
