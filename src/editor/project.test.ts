import { beforeEach, describe, expect, test } from "vitest";
import { loadImage } from "@napi-rs/canvas";
import { actions, getState } from "./store";
import { deserializeDoc, isProjectFile, serializeDoc } from "./project";
import type { RasterLayer, TextLayer } from "./types";

// Decode data URLs through @napi-rs/canvas so the round trip exercises real
// PNG encode/decode without a DOM Image element.
const napiLoader = async (src: string) => {
  const b64 = src.split(",")[1];
  const img = await loadImage(Buffer.from(b64, "base64"));
  return img as unknown as CanvasImageSource & { width: number; height: number };
};

beforeEach(() => {
  actions.newDocument(20, 20, "#ff0000");
});

describe("project serialization", () => {
  test("serializeDoc captures document and layer metadata", () => {
    const l = actions.activeRaster() as RasterLayer;
    l.x = 3;
    l.scaleX = 2;
    l.rotation = 45;
    actions.addLayer("text");
    const file = serializeDoc(getState().doc);
    expect(isProjectFile(file)).toBe(true);
    expect(file.width).toBe(20);
    expect(file.layers).toHaveLength(2);
    expect(file.layers[0].type).toBe("raster");
    expect(file.layers[0].x).toBe(3);
    expect(file.layers[0].scaleX).toBe(2);
    expect(file.layers[0].rotation).toBe(45);
    expect((file.layers[0] as { pixels: string }).pixels.startsWith("data:image/png")).toBe(true);
  });

  test("round trip restores pixels, masks and text layers", async () => {
    const l = actions.activeRaster() as RasterLayer;
    actions.setSelection({ x: 0, y: 0, w: 5, h: 5 });
    actions.addLayerMask(l.id);
    actions.addLayer("text");
    const text = actions.activeLayer() as TextLayer;
    text.text = "Hello";
    text.fontSize = 33;

    const json = JSON.stringify(serializeDoc(getState().doc));
    const parsed: unknown = JSON.parse(json);
    expect(isProjectFile(parsed)).toBe(true);
    if (!isProjectFile(parsed)) return;

    const doc = await deserializeDoc(parsed, napiLoader);
    expect(doc.width).toBe(20);
    expect(doc.layers).toHaveLength(2);

    const raster = doc.layers[0] as RasterLayer;
    expect(raster.type).toBe("raster");
    const px = raster.canvas.getContext("2d")!.getImageData(10, 10, 1, 1).data;
    expect(px[0]).toBe(255); // red background survived
    expect(raster.mask).toBeDefined();
    const maskIn = raster.mask!.getContext("2d")!.getImageData(2, 2, 1, 1).data[3];
    const maskOut = raster.mask!.getContext("2d")!.getImageData(10, 10, 1, 1).data[3];
    expect(maskIn).toBe(255);
    expect(maskOut).toBe(0);

    const t = doc.layers[1] as TextLayer;
    expect(t.type).toBe("text");
    expect(t.text).toBe("Hello");
    expect(t.fontSize).toBe(33);
  });

  test("isProjectFile rejects arbitrary JSON", () => {
    expect(isProjectFile({ foo: 1 })).toBe(false);
    expect(isProjectFile(null)).toBe(false);
    expect(isProjectFile({ app: "lumen", version: 2, width: 1, height: 1, layers: [] })).toBe(
      false,
    );
  });

  test("isProjectFile rejects absurd dimensions and malformed layers", () => {
    const good = serializeDoc(getState().doc);
    expect(isProjectFile(good)).toBe(true);
    expect(isProjectFile({ ...good, width: 1e9 })).toBe(false);
    expect(isProjectFile({ ...good, height: 0 })).toBe(false);
    expect(isProjectFile({ ...good, width: NaN })).toBe(false);
    expect(isProjectFile({ ...good, layers: [{ type: "raster" }] })).toBe(false);
    expect(isProjectFile({ ...good, layers: [...good.layers, { type: "evil" }] })).toBe(false);
    const hugeLayer = { ...good.layers[0], width: 1e9 };
    expect(isProjectFile({ ...good, layers: [hugeLayer] })).toBe(false);
    const scriptPixels = { ...good.layers[0], pixels: "javascript:alert(1)" };
    expect(isProjectFile({ ...good, layers: [scriptPixels] })).toBe(false);
  });

  test("deserializeDoc defaults garbage numeric props instead of NaN-poisoning", async () => {
    const file = serializeDoc(getState().doc);
    const layer = file.layers[0] as unknown as Record<string, unknown>;
    layer.x = "nope";
    layer.opacity = 99;
    layer.rotation = null;
    const doc = await deserializeDoc(file, napiLoader);
    expect(doc.layers[0].x).toBe(0);
    expect(doc.layers[0].opacity).toBe(1);
    expect(doc.layers[0].rotation).toBe(0);
  });
});
