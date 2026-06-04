/**
 * Generates the social share image at public/og-image.png (1200x630).
 *
 * Run with:  bun run scripts/generate-og.ts
 *
 * This is one-time tooling — the PNG is committed and served statically, so CI
 * never regenerates it. Uses @napi-rs/canvas (a dev dependency) and a system
 * font registered from a few common locations.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";

const W = 1200;
const H = 630;

// Register a bold + regular system font under stable family names.
function registerFirst(family: string, candidates: string[]): boolean {
  for (const p of candidates) {
    if (existsSync(p) && GlobalFonts.registerFromPath(p, family)) return true;
  }
  return false;
}
const hasBold = registerFirst("OG-Bold", [
  "C:/Windows/Fonts/segoeuib.ttf",
  "C:/Windows/Fonts/arialbd.ttf",
  "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
]);
const hasReg = registerFirst("OG-Regular", [
  "C:/Windows/Fonts/segoeui.ttf",
  "C:/Windows/Fonts/arial.ttf",
  "/System/Library/Fonts/Supplemental/Arial.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
]);
const BOLD = hasBold ? "OG-Bold" : "sans-serif";
const REG = hasReg ? "OG-Regular" : "sans-serif";

const canvas = createCanvas(W, H);
const ctx = canvas.getContext("2d");

// Background — matches the app's dark theme.
const bg = ctx.createLinearGradient(0, 0, W, H);
bg.addColorStop(0, "#141418");
bg.addColorStop(1, "#1d1d26");
ctx.fillStyle = bg;
ctx.fillRect(0, 0, W, H);

// Accent: three offset rounded "layers" in the brand blue (a nod to the layer stack).
const accent = "#5aa2ff";
ctx.save();
ctx.translate(880, 150);
const tints = ["rgba(90,162,255,0.25)", "rgba(90,162,255,0.45)", "rgba(90,162,255,0.95)"];
tints.forEach((color, i) => {
  const o = (tints.length - 1 - i) * 34;
  ctx.fillStyle = color;
  roundRect(ctx, o, o, 190, 250, 18);
  ctx.fill();
});
ctx.restore();

// Title + subtitle + tagline.
ctx.fillStyle = "#f4f5f7";
ctx.font = `700 88px ${BOLD}`;
ctx.fillText("Photo Editor", 90, 250);

ctx.fillStyle = accent;
ctx.font = `700 40px ${BOLD}`;
ctx.fillText("by MatsSjodin.com", 92, 312);

ctx.fillStyle = "#a6a7ad";
ctx.font = `400 32px ${REG}`;
ctx.fillText("Private, in-browser image editing —", 92, 396);
ctx.fillText("layers, selections, adjustments, and text.", 92, 440);

ctx.fillStyle = "#6f7077";
ctx.font = `400 26px ${REG}`;
ctx.fillText("Nothing is uploaded. Everything stays on your device.", 92, 540);

const out = resolve(import.meta.dirname, "../public/og-image.png");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, canvas.toBuffer("image/png"));
console.log(`Wrote ${out} (fonts: bold=${hasBold}, regular=${hasReg})`);

function roundRect(
  c: ReturnType<typeof createCanvas>["getContext"] extends (k: "2d") => infer R ? R : never,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
