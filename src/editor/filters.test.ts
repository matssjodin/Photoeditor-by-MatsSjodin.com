import { describe, expect, test } from "vitest";
import {
  addNoise,
  applyLevels,
  autoLevels,
  DEFAULT_LEVELS,
  pixelate,
  sharpen,
  vignette,
} from "./filters";

function solid(w: number, h: number, rgba: [number, number, number, number]): ImageData {
  const img = new ImageData(w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    img.data[i] = rgba[0];
    img.data[i + 1] = rgba[1];
    img.data[i + 2] = rgba[2];
    img.data[i + 3] = rgba[3];
  }
  return img;
}

function at(img: ImageData, x: number, y: number) {
  const i = (y * img.width + x) * 4;
  return Array.from(img.data.slice(i, i + 4));
}

describe("sharpen", () => {
  test("flat areas are unchanged", () => {
    const img = solid(8, 8, [100, 100, 100, 255]);
    sharpen(img, 80);
    expect(at(img, 4, 4)).toEqual([100, 100, 100, 255]);
  });

  test("edges gain contrast", () => {
    const img = solid(8, 8, [100, 100, 100, 255]);
    // Make the right half brighter.
    for (let y = 0; y < 8; y++)
      for (let x = 4; x < 8; x++) {
        const i = (y * 8 + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = 180;
      }
    sharpen(img, 100);
    expect(at(img, 3, 4)[0]).toBeLessThan(100); // dark side overshoots darker
    expect(at(img, 4, 4)[0]).toBeGreaterThan(180); // bright side overshoots brighter
  });
});

describe("vignette", () => {
  test("darkens corners more than the center", () => {
    const img = solid(40, 40, [200, 200, 200, 255]);
    vignette(img, 100);
    expect(at(img, 20, 20)[0]).toBe(200); // center untouched
    expect(at(img, 0, 0)[0]).toBeLessThan(130);
  });
});

describe("addNoise", () => {
  test("perturbs pixels deterministically with an injected rng", () => {
    const img = solid(4, 4, [100, 100, 100, 255]);
    addNoise(img, 50, () => 1); // n = +50 everywhere
    expect(at(img, 0, 0)[0]).toBe(150);
  });

  test("leaves fully transparent pixels alone", () => {
    const img = solid(4, 4, [0, 0, 0, 0]);
    addNoise(img, 100, () => 1);
    expect(at(img, 0, 0)).toEqual([0, 0, 0, 0]);
  });
});

describe("pixelate", () => {
  test("averages each block to one colour", () => {
    const img = solid(8, 8, [0, 0, 0, 255]);
    // top-left 4x4 block: half black, half white columns
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 2; x++) {
        const i = (y * 8 + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      }
    pixelate(img, 4);
    const v = at(img, 0, 0)[0];
    expect(v).toBe(at(img, 3, 3)[0]); // uniform within block
    expect(v).toBeGreaterThan(100);
    expect(v).toBeLessThan(160);
  });
});

describe("levels", () => {
  test("identity params leave pixels unchanged", () => {
    const img = solid(4, 4, [123, 45, 67, 255]);
    applyLevels(img, { ...DEFAULT_LEVELS });
    expect(at(img, 0, 0)).toEqual([123, 45, 67, 255]);
  });

  test("raising the black point clips shadows", () => {
    const img = solid(4, 4, [50, 50, 50, 255]);
    applyLevels(img, { black: 100, white: 255, gamma: 1 });
    expect(at(img, 0, 0)[0]).toBe(0);
  });

  test("gamma > 1 brightens midtones", () => {
    const img = solid(4, 4, [128, 128, 128, 255]);
    applyLevels(img, { black: 0, white: 255, gamma: 2 });
    expect(at(img, 0, 0)[0]).toBeGreaterThan(170);
  });

  test("autoLevels finds the histogram ends", () => {
    const img = new ImageData(16, 16);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = i % 8 === 0 ? 60 : 200; // two-tone image
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    const p = autoLevels(img);
    expect(p.black).toBeLessThanOrEqual(60);
    expect(p.white).toBeGreaterThanOrEqual(199);
    expect(p.black).toBeGreaterThan(40);
  });
});
