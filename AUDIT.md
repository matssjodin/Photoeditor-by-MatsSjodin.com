# Production-Readiness Audit — 2026-07-17

Third audit pass (previous rounds: initial audit `341f47c`…`5d1989e`, feature round
`768ae2b`…`ce86d25`). Baseline at start of this pass: **typecheck ✓ · lint ✓ (5 benign
shadcn fast-refresh warnings) · 78/78 tests ✓ · build ✓ · npm audit: 1 low**.

## Domain applicability matrix

| Domain                 | Applies?  | Notes                                                                                                                      |
| ---------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------- |
| Architecture           | Yes       | Client-side canvas editor + SSR shell (TanStack Start). Sound; no changes needed.                                          |
| Security               | Partially | No auth/DB/API. Surface = CSP/headers (done), dep advisories, hostile `.lumen` files, git-history secrets (scanned: none). |
| Data layer             | **N/A**   | No database. Client persistence = IndexedDB autosave + `.lumen` files (covered under Reliability).                         |
| API design             | **N/A**   | No API exposed; server layer only SSRs the shell.                                                                          |
| Performance            | Yes       | Canvas pipeline, bundle. Acceptable; no hot-path issues found.                                                             |
| Reliability            | Yes       | Error boundaries/SSR wrappers exist; gaps in file-open feedback and `.lumen` validation.                                   |
| UX / UI                | Yes       | Core product surface. Several real bugs found (below).                                                                     |
| Business & conversion  | Partially | Free tool, no payments. SEO/OG/analytics/legal notice already in place.                                                    |
| Code quality & testing | Yes       | Strict TS, Vitest w/ real canvas. Gaps closed with new regression tests.                                                   |
| DevOps & infra         | Yes       | CI + Docker + Coolify already in place; minor hardening only.                                                              |
| Documentation          | Yes       | README/CHANGELOG/CLAUDE.md current; updated for this round's changes.                                                      |

## Findings

### HIGH

- **H1 — Pixel tools ignore layer offset.** `paintStamp` (brush/eraser, incl. mask
  editing), `floodFill`, `cloneStamp`, and Ctrl+X "cut" all operate in **document**
  coordinates directly on the layer canvas, without compensating for the layer's
  `x/y`. Painting/filling/cloning on any moved or pasted layer lands in the wrong
  place (offset by the layer position). `floodFill` additionally indexes the
  doc-sized selection mask with the layer-canvas width. Magic wand and
  shape/gradient (`clippedLayerDraw`) already compensate — the fix mirrors them
  (translation-only; rotation/scale intentionally ignored, matching existing policy).
  **Status: FIXED** (+ regression tests).

- **H2 — Crop breaks offset layers.** `cropToSelection` treated the doc-space
  selection as layer-canvas coordinates, so raster layers with non-zero `x/y`
  (pasted/moved layers) kept the wrong pixel region. Fixed by making crop a pure
  reposition: the document shrinks and every layer shifts by `(-sel.x, -sel.y)`;
  pixels are no longer destroyed (also preserves rotated/scaled layers correctly).
  Behavior change documented in CHANGELOG. **Status: FIXED** (+ tests).

- **H3 — Resize breaks offset/pasted layers.** `resizeDocument` stretched _every_
  raster canvas to the full new document size and ignored layer `x/y`, destroying
  the aspect ratio and position of any layer whose canvas isn't document-sized.
  Fixed: each raster canvas scales by `(sx, sy)` and `x/y` scale like text layers.
  **Status: FIXED** (+ tests).

### MEDIUM

- **M1 — Mojibake in the UI.** `EditorCanvas.tsx` contained UTF-8 double-encoded
  characters, three of them user-visible: the HUD (`100% Â· 1200Ã—800px`), the
  zoom-out button (`âˆ’`), and the text-tool placeholder (`Type your textâ€¦`), plus
  four comments. **Status: FIXED.**
- **M2 — Wheel zoom relied on a no-op `preventDefault`.** React attaches `wheel`
  listeners passively, so `e.preventDefault()` in the synthetic handler does
  nothing (console warnings; Ctrl+wheel zooms the whole page instead of the
  canvas). Replaced with a native non-passive listener. **Status: FIXED.**
- **M3 — Delete always deleted the layer.** With an active selection, users expect
  Delete/Backspace to clear the selected pixels (Photoshop behavior). Now: active
  selection + unlocked raster layer → clears the selected pixels (undoable);
  otherwise deletes the active layer as before. Behavior change documented.
  **Status: FIXED.**
- **M4 — Silent file-open/copy failures.** Invalid `.lumen`/image files failed with
  no feedback (and leaked an object URL); clipboard copy errors were swallowed.
  Mounted the (already-installed, previously unused) sonner `Toaster` and surfaced
  errors; object URLs now revoked on error. **Status: FIXED.**
- **M5 — Shallow `.lumen` validation.** A malformed or hostile project file could
  request absurd canvas allocations or throw deep inside restore. `isProjectFile`
  now bounds width/height (1–16384) and validates per-layer shape/types; restore
  clamps layer canvas sizes. **Status: FIXED** (+ tests).
- **M6 — Dependency advisory.** esbuild ≤0.28.0 (dev-server arbitrary file read on
  Windows, GHSA-g7r4-m6w7-qqqr, low, dev-only) via vite/tsx. Fixed via lockfile
  bump; lockfile validated against npm 10 (`node:22` Docker `npm ci --dry-run`).
  **Status: FIXED.**

### LOW

- **L1 — Eyedropper out of bounds** sampled `#000000` outside the document; now a
  no-op. **FIXED.**
- **L2 — `bakeAdjustments` duplicated `buildFilterString`** (kept-in-sync-by-hand);
  now calls the shared function. **FIXED.**
- **L3 — Scaffold package name** `tanstack_start_ts` → `photoeditor-matssjodin-com`.
  **FIXED.**
- **L4 — Dockerfile had no `HEALTHCHECK`**; added (busybox wget against `/`).
  **FIXED.**
- **L5 — No structured data**; added JSON-LD `WebApplication` snippet. **FIXED.**
- **L6 — In-range dep updates available** (Radix, TanStack, eslint 9.x, etc.).
  Deliberately deferred to keep this round's diff reviewable; majors available for
  eslint 10 / @vitejs/plugin-react 6 / @types/node 26 need their own pass. **BACKLOG.**
- **L7 — 5 eslint `react-refresh/only-export-components` warnings** in shadcn
  boilerplate (`button/form/navigation-menu/toggle`). Cosmetic, standard shadcn
  pattern. **ACCEPTED.**

## Verified non-findings

- Secrets: none hardcoded; git history scanned clean; `.gitignore` covers env files.
- Security headers/CSP: present and in sync with external origins (fonts, Plausible,
  MediaPipe CDN); HSTS, COOP, XFO, Referrer-Policy, Permissions-Policy set.
- Error handling: SSR 500 wrapper + router error/notFound components + Lovable
  telemetry in place; autosave failures deliberately non-fatal.
- Reproducible build: `npm ci` + committed lockfile + multi-stage Docker (non-root
  runtime user); CI runs typecheck → lint → test → build on push/PR.
- Privacy: no uploads, no cookies, opt-in cookieless analytics, one-time notice.
- License compliance: Apache-2.0 + NOTICE; deps are MIT/ISC/Apache-family.

## Remaining backlog (prioritized)

1. **MEDIUM** — In-range dependency refresh (`npm update`) + majors (eslint 10,
   @vitejs/plugin-react 6, @types/node 26) in a dedicated PR with full green-bar. ~1h.
2. **LOW** — Undo/redo (Ctrl+Z) fires globally even when a panel input is focused,
   overriding native text-field undo. Debatable UX; revisit with user input. ~30m.
3. **LOW** — E2E smoke test (Playwright) for open → paint → export. ~2h.
4. **LOW** — Layer thumbnails could move to `requestIdleCallback` if layer counts
   grow; no observed jank today. Skip until measured.
