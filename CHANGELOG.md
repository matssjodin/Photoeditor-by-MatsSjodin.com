# Changelog

All notable changes to this project are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- **Delete/Backspace clears the selection**: with an active selection on an unlocked
  raster layer, Delete now erases the selected pixels (undoable) instead of deleting
  the layer; without a selection it still deletes the active layer.
- **Error feedback for file operations**: unreadable images, invalid `.lumen` project
  files, failed session restores and clipboard copy/paste errors now show a toast
  instead of failing silently (sonner `Toaster` is now mounted).
- Stricter `.lumen` validation on open/restore: document and layer dimensions are
  bounded (max 16384), layer entries are shape-checked, pixel data must be
  `data:image/*` URLs, and garbage numeric props fall back to sane defaults.
- Docker `HEALTHCHECK` for the runtime image and JSON-LD (`WebApplication`)
  structured data on the landing page.

- **Free transform**: scale (corner/edge handles, aspect-locked corners, Shift to free)
  and rotate (handle above the layer, Shift snaps to 15°) directly on the Move tool;
  layers now carry `scaleX/scaleY`. Move and transform drags are undoable.
- **Shape tool (U)**: rectangle, ellipse, line and arrow with fill/stroke options,
  live preview, Shift constraints (square/circle/45°), selection clipping, undo.
- **Gradient tool (D)**: linear/radial, foreground → end colour or fade-to-transparent,
  WYSIWYG drag preview, fills the layer or the current selection. Undoable.
- **Clone stamp (S)**: Alt-click to set the source (marked with a crosshair), then
  paint with a soft interpolated brush to retouch; one undo step per stroke.
- **Clipboard**: Ctrl/⌘+V pastes a clipboard image as a new centred layer;
  Ctrl/⌘+C copies the flattened selection (or whole document) as PNG to the OS
  clipboard; Ctrl/⌘+X also erases the selected pixels from the active layer.
- **Layer masks**: add (reveal-all or from the current selection), edit with
  brush (reveal) / eraser (hide), invert, apply, delete. Masks survive undo/redo,
  duplicate, rotate/flip, resize and crop, and are saved in project files.
- **Filters panel**: levels (black/white point + gamma with histogram Auto),
  sharpen, vignette, noise and pixelate — destructive but undoable pixel filters.
- **Project save/open**: download the full layered document as a single `.lumen`
  file (layers/masks as embedded PNGs) and restore it via Open or drag-drop.
- **Autosave**: the document is autosaved to IndexedDB (debounced) and a banner
  offers to restore the previous session on the next visit — still 100% local.
- **AI background removal**: one click on a raster layer cuts out the subject using
  MediaPipe selfie segmentation running in-browser (wasm, lazy-loaded ~16 MB model,
  GPU with CPU fallback). The image never leaves the device; undoable.

- **Resize image**: a new top-bar action opens a modal to scale the whole image (and all
  layers) to a new size — with an aspect-ratio lock (on by default) so proportions are
  kept, plus quick scale presets (25/50/100/200%). Undoable.
- **New image dialog**: a centered modal with width/height fields, size presets, and a
  background picker — solid colour, white/black, or **transparent** — replacing the old
  `window.prompt()` flow. `newDocument` now supports a transparent background.
- One-time site notice, now shown as a **centered modal** (was a bottom bar): discloses
  that editing is local (nothing uploaded), that only browser-local preferences are
  stored, and that cookieless analytics + error reporting may run; states the software is
  provided free, "as is", without warranties. Acknowledgement persists in `localStorage`.
- Linked the in-app "by MatsSjodin.com" wordmark to https://matssjodin.com.
- Social share image (`public/og-image.png`, 1200×630) wired into Open Graph and
  Twitter `summary_large_image` meta; regenerate with `bun run og`.
- Optional cookieless analytics (Plausible), off by default, enabled via
  `VITE_PLAUSIBLE_DOMAIN`; CSP updated to allow the provider.
- Cloudflare Workers deployment: `wrangler.toml` + `.github/workflows/deploy.yml`
  (manual or version-tag trigger), validated with `wrangler deploy --dry-run`.
- Canvas-backed unit tests for `selection.ts` (mask math, magic-wand flood fill) and
  the store's undo/redo history, via a `@napi-rs/canvas` test polyfill (34 tests total).

- Single-key keyboard shortcuts for every tool (V/M/L/W/B/E/G/I/T/C), guarded
  against text-field focus, matching the toolbar tooltips.
- Security headers on all SSR responses: Content-Security-Policy, HSTS,
  X-Frame-Options, X-Content-Type-Options, Referrer-Policy, COOP, Permissions-Policy.
- Accessibility: keyboard-visible focus rings and `aria-label`/`aria-pressed` on
  icon-only buttons (tools, layer visibility/lock, color swatches).
- "Best on a larger screen" notice for small/mobile viewports.
- SEO: canonical URL, consistent Open Graph/Twitter metadata, `theme-color`,
  `robots.txt`, and `sitemap.xml`.
- Project documentation: `README.md`, `.env.example`, `LICENSE`, this changelog,
  and a production-readiness `AUDIT.md`.
- Continuous integration (GitHub Actions): typecheck → lint → test → build.
- Unit tests (Bun) for the adjustment→CSS-filter mapping and id generation.
- `typecheck` and `test` npm scripts; `.gitattributes` for line-ending normalization.

### Fixed

- **Painting on moved or pasted layers landed in the wrong place.** Brush, eraser
  (including mask editing), flood fill, clone stamp and Cut operated in document
  coordinates directly on the layer canvas, ignoring the layer's x/y offset (the
  wand and shape/gradient tools already compensated). The pixel ops now live in
  `draw.ts` next to `clippedLayerDraw` and share its doc-space→layer-space handling.
- **Crop mangled offset/transformed layers.** Crop treated the doc-space selection
  as layer-canvas coordinates, keeping the wrong pixel region on moved/pasted
  layers. Crop is now a pure reposition: the document shrinks and layers shift, so
  pixels outside the crop survive (move a layer to reveal them) and rotated/scaled
  layers stay intact.
- **Resize stretched pasted layers.** Resizing the image forced every raster canvas
  to the full document size and ignored layer offsets; canvases and offsets now
  scale proportionally.
- **Flood fill could hang the tab** when the fill colour was within tolerance of the
  clicked colour (filled pixels re-matched forever); the walk now tracks visited
  pixels like the magic wand.
- Garbled characters (UTF-8 mojibake) in the zoom HUD (`Â·`/`Ã—`), the zoom-out
  button and the text-tool placeholder.
- Wheel zoom used React's passive `onWheel`, so `preventDefault()` was a no-op:
  Ctrl+wheel zoomed the whole page and Chrome logged warnings. The canvas now uses
  a native non-passive listener (interactive widgets still scroll normally).
- The eyedropper sampled `#000000` when clicking outside the document; it now does
  nothing there.
- `bakeAdjustments` duplicated the live-preview filter string by hand; it now calls
  the shared `buildFilterString`, so bake and preview can't drift.
- Patched the esbuild dev-server advisory (GHSA-g7r4-m6w7-qqqr) by updating vite to
  7.3.6 / esbuild 0.28.1 (tsx's nested esbuild likewise).
- **Text-tool fonts never loaded** — the Google Fonts CSS `@import` was dropped at
  build because it followed other at-rules. Fonts now load via `<link>` + preconnect
  in the document head.
- Hex color input had two identical (dead) branches and accepted invalid values; it
  now keeps a draft and only commits valid `#RRGGBB`.
- Removed all `as any` casts in the editor history store by typing document-size
  snapshots as first-class `HistoryEntry` fields.

### Changed

- Package renamed from the scaffold's `tanstack_start_ts` to
  `photoeditor-matssjodin-com`.
- **License: all-rights-reserved → Apache-2.0.** The project is now free to use, modify,
  and redistribute. Added a `NOTICE` file requiring redistributions to keep attribution to
  "Photo Editor by MatsSjodin.com" and a link to https://matssjodin.com (Apache-2.0 §4(d)),
  and set `"license": "Apache-2.0"` in `package.json`.
- **Clarified the Crop tool.** Selecting Crop no longer silently swaps to the rectangle
  tool. You now drag directly to mark the area to keep; the panel shows numbered steps and
  the live selection size, and a "Crop to selection" button (disabled until you mark an
  area) or **Enter** applies it.
- **Toolchain: Bun → npm.** Regenerated `package-lock.json`, moved scripts/CI to
  npm + Node 22, removed `bunfig.toml`. Tests migrated from `bun:test` to **Vitest**
  (`vitest.config.ts`); the `@napi-rs/canvas` polyfill now loads via Vitest `setupFiles`.
- **Deploy target: Cloudflare Workers → self-hosted Node server.** Build now uses the
  Nitro `node-server` preset (`.output/server/index.mjs`); added a multi-stage
  `Dockerfile` + `.dockerignore` for **Coolify** (or any container host). Verified by
  building and running the image end-to-end (SSR, security headers, and static assets).
- Rebranded from the Lovable template placeholder ("Lovable App" / "Lumen" /
  "Canvas Studio Pro") to **Photo Editor by MatsSjodin.com** across titles, meta,
  and the in-app wordmark.
- Removed the unused `recharts` dependency and the dead `chart`/`sidebar` components
  and `use-mobile` hook.

### Removed

- Cloudflare Workers config (`wrangler.toml`) and its deploy workflow, superseded by
  the Docker/Coolify Node-server deployment.
- Layer thumbnails are memoized, no longer regenerating a data URL on every render.
- Patched the `@tanstack/start-server-core` advisory (GHSA-9m65-766c-r333) and
  formatted the entire codebase with Prettier (lint: 272 errors → 0).
