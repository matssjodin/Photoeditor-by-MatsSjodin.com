// Destructive pixel filters that CSS canvas filters can't express:
// unsharp-mask sharpen, vignette, film grain, pixelate, and levels.
// All operate on an ImageData in place (and return it) so they're easy to
// unit-test and to wrap in recordRaster for undo.

export interface LevelsParams {
  black: number; // 0..254 — input black point
  white: number; // 1..255 — input white point
  gamma: number; // 0.1..5 — midtone, 1 = unchanged, >1 brightens
}

export const DEFAULT_LEVELS: LevelsParams = { black: 0, white: 255, gamma: 1 };

/** Sharpen via a 3×3 unsharp kernel. amount 0..100. */
export function sharpen(img: ImageData, amount: number): ImageData {
  const k = Math.max(0, Math.min(100, amount)) / 100; // 0..1
  if (k === 0) return img;
  const { width: w, height: h, data } = img;
  const src = new Uint8ClampedArray(data); // copy to read from
  const center = 1 + 4 * k;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const up = y > 0 ? i - w * 4 : i;
      const dn = y < h - 1 ? i + w * 4 : i;
      const lf = x > 0 ? i - 4 : i;
      const rt = x < w - 1 ? i + 4 : i;
      for (let c = 0; c < 3; c++) {
        data[i + c] =
          src[i + c] * center - k * (src[up + c] + src[dn + c] + src[lf + c] + src[rt + c]);
      }
    }
  }
  return img;
}

/** Darken towards the corners. amount 0..100. */
export function vignette(img: ImageData, amount: number): ImageData {
  const a = Math.max(0, Math.min(100, amount)) / 100;
  if (a === 0) return img;
  const { width: w, height: h, data } = img;
  const cx = w / 2;
  const cy = h / 2;
  const maxDist = Math.hypot(cx, cy) || 1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = Math.hypot(x - cx, y - cy) / maxDist;
      const t = Math.max(0, Math.min(1, (d - 0.4) / 0.6));
      const f = 1 - a * t * t;
      const i = (y * w + x) * 4;
      data[i] *= f;
      data[i + 1] *= f;
      data[i + 2] *= f;
    }
  }
  return img;
}

/** Add monochrome film grain. amount 0..100. */
export function addNoise(img: ImageData, amount: number, rand: () => number = Math.random) {
  const a = Math.max(0, Math.min(100, amount));
  if (a === 0) return img;
  const { data } = img;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue; // keep fully transparent pixels clean
    const n = (rand() * 2 - 1) * a;
    data[i] += n;
    data[i + 1] += n;
    data[i + 2] += n;
  }
  return img;
}

/** Average colour per block. size ≥ 2 (block edge in px). */
export function pixelate(img: ImageData, size: number): ImageData {
  const s = Math.max(2, Math.round(size));
  const { width: w, height: h, data } = img;
  for (let by = 0; by < h; by += s) {
    for (let bx = 0; bx < w; bx += s) {
      let r = 0,
        g = 0,
        b = 0,
        a = 0,
        n = 0;
      const yMax = Math.min(by + s, h);
      const xMax = Math.min(bx + s, w);
      for (let y = by; y < yMax; y++) {
        for (let x = bx; x < xMax; x++) {
          const i = (y * w + x) * 4;
          r += data[i];
          g += data[i + 1];
          b += data[i + 2];
          a += data[i + 3];
          n++;
        }
      }
      r /= n;
      g /= n;
      b /= n;
      a /= n;
      for (let y = by; y < yMax; y++) {
        for (let x = bx; x < xMax; x++) {
          const i = (y * w + x) * 4;
          data[i] = r;
          data[i + 1] = g;
          data[i + 2] = b;
          data[i + 3] = a;
        }
      }
    }
  }
  return img;
}

/** Remap tonal range: input black/white points plus a midtone gamma. */
export function applyLevels(img: ImageData, params: LevelsParams): ImageData {
  const black = Math.max(0, Math.min(254, params.black));
  const white = Math.max(black + 1, Math.min(255, params.white));
  const gamma = Math.max(0.1, Math.min(5, params.gamma));
  const inv = 1 / gamma;
  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) {
    const t = Math.max(0, Math.min(1, (v - black) / (white - black)));
    lut[v] = Math.round(255 * Math.pow(t, inv));
  }
  const { data } = img;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = lut[data[i]];
    data[i + 1] = lut[data[i + 1]];
    data[i + 2] = lut[data[i + 2]];
  }
  return img;
}

/**
 * Suggest levels from the image histogram: clip 0.5% of pixels at each end
 * (ignoring fully transparent pixels), gamma untouched.
 */
export function autoLevels(img: ImageData): LevelsParams {
  const hist = new Uint32Array(256);
  const { data } = img;
  let total = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    // Rec. 601 luma approximation.
    const v = (data[i] * 77 + data[i + 1] * 151 + data[i + 2] * 28) >> 8;
    hist[v]++;
    total++;
  }
  if (total === 0) return { ...DEFAULT_LEVELS };
  const clip = total * 0.005;
  let black = 0;
  let acc = 0;
  while (black < 254 && acc + hist[black] <= clip) acc += hist[black++];
  let white = 255;
  acc = 0;
  while (white > black + 1 && acc + hist[white] <= clip) acc += hist[white--];
  return { black, white, gamma: 1 };
}
