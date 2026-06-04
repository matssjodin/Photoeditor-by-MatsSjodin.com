# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single-page, **fully client-side image editor** ("Lumen", aka Canvas Studio Pro) — Photoshop-lite in the browser. Layers, brushes, selections, adjustments, text, and PNG/JPEG/WebP export all run on `<canvas>` in the user's browser. There is **no backend, database, or persistence** — images never leave the client. The TanStack Start server layer exists only to SSR the shell and is otherwise unused for editor logic.

Scaffolded by **Lovable**. The stack is TanStack Start (React 19 full-stack framework) + Vite 7 + Tailwind v4 + shadcn/ui, with Bun as the package manager/runtime.

**Repository:** `git@github.com:matssjodin/photoeditor.matssjodin.com.git` (default branch `main`).

## Commands

Use **npm** (`package-lock.json`). Node.js ≥ 22.

```bash
npm install            # install deps
npm run dev            # vite dev server (port 8080, set by the Lovable preset)
npm run build          # production build → .output/ (vite + nitro node-server)
npm start              # run the built server: node .output/server/index.mjs
npm run preview        # preview production build
npm run typecheck      # tsc --noEmit
npm run lint           # eslint .
npm run format         # prettier --write .
npm test               # Vitest (*.test.ts)
```

Full green-bar check before committing: `npm run typecheck && npm run lint && npm test && npm run build`. Tests run under **Vitest** with a `@napi-rs/canvas` polyfill (`test/setup.ts`, wired via `vitest.config.ts`), so the real canvas algorithms are exercised — `selection.ts` mask math and store undo/redo are covered, not just pure helpers.

## Editor architecture (the core of the app)

Everything important lives in `src/editor/`. The rest of `src/` is framework boilerplate.

- **`store.ts` — custom global store, not Redux/Zustand.** A single module-level `state` object exposed via `useSyncExternalStore`. Because layer pixels live in mutable `HTMLCanvasElement`s, the store does **not** rely on referential immutability — instead `emit()` bumps `state.version` to force re-renders. Always mutate through the `actions` object and let it call `emit()`; never mutate `state` from components directly. `useEditor()` subscribes a component; `getState()` reads without subscribing.

- **`types.ts` — the document model.** A `DocState` holds an ordered `Layer[]` (bottom→top), `activeLayerId`, and an optional `Selection`. A `Layer` is either a `RasterLayer` (pixels in an off-screen `canvas`) or a `TextLayer`. Every layer carries transform (`x,y,rotation,flipX,flipY`), `opacity`, `blendMode`, and live `Adjustments`.

- **Adjustments are non-destructive until baked.** `Adjustments` (brightness/contrast/saturation/hue/blur/etc.) render live via CSS `ctx.filter` (see `buildFilterString`). They only become permanent pixels when `actions.bakeAdjustments(id)` is called. Keep the filter string in `buildFilterString` and the bake logic in `store.ts` in sync — they intentionally produce the same output.

- **`EditorCanvas.tsx` — the interactive stage.** Composites all visible layers into one display canvas on every `version` change, draws the selection overlay separately, and handles all pointer/keyboard/wheel input (pan, zoom, paint, select, move, lasso, in-canvas text editing). Tools dispatch off `tool.tool`. Pixel ops (brush stamping, flood fill, eyedropper) are plain functions at the bottom of this file.

- **`selection.ts` — mask-based selections.** Non-rectangular selections (lasso, magic wand, feathered) are stored as a doc-sized alpha-mask `canvas` on `Selection.mask`; a plain rect selection has no mask. Paint/fill clip to the mask via `destination-in`. Masks combine with `replace`/`add`/`subtract` modes.

- **History (`store.ts`).** Two entry kinds: `raster` stores before/after `ImageData` snapshots of one layer; `structural` snapshots the whole layer list (for add/delete/reorder/resize/crop). Continuous brush strokes use `beginStroke`/`endStroke` to capture one snapshot per stroke. History is capped at 30 entries. Undo/redo replay snapshots.

- **UI shell:** `Editor.tsx` (layout + drag-drop file open), `TopBar.tsx` (new/open/export/undo), `Toolbar.tsx` (tool selection), `RightPanels.tsx` (layers, adjustments, tool options), `fonts.ts` (text font list).

When adding a feature: a new **tool** = add to `ToolId` in `types.ts`, a button in `Toolbar.tsx`, options in `RightPanels.tsx`, and a handler branch in `EditorCanvas.tsx`'s pointer logic. A new **document mutation** = an action in `store.ts` wrapped in `recordRaster`/`_structural` so undo works.

## TanStack Start conventions

- **File-based routing** in `src/routes/` — see `src/routes/README.md` for the full table. `routeTree.gen.ts` is auto-generated; never edit by hand. `__root.tsx` is the app shell (keep `<Outlet />`). This is **not** Next.js/Remix — do not create `src/pages/`, `app/layout.tsx`, or use RSC.

- **`vite.config.ts` wraps `@lovable.dev/vite-tanstack-config`.** That preset already includes `tanstackStart`, `viteReact`, `tailwindcss`, `tsConfigPaths`, `nitro`, the `@` path alias, dedupe, and error-logging plugins. **Do not re-add these plugins manually** — duplicates break the build. Pass extra config through `defineConfig({ vite: { ... } })`. We override the Nitro target to `node-server` (`nitro: { preset: "node-server" }`) so the build is a standalone Node server (`.output/server/index.mjs`) for Docker/Coolify; the preset's default is Cloudflare Workers, and it force-ignores the override only inside the Lovable sandbox (`LOVABLE_SANDBOX=1` / `DEV_SERVER__PROJECT_PATH` set).

- **Deployment:** `npm run build` → `.output/`; runs as `node .output/server/index.mjs` (port `PORT`, default 3000). The multi-stage `Dockerfile` packages this for Coolify or any container host. `VITE_PLAUSIBLE_DOMAIN` is a **build-time** var (Vite inlines it) — pass it as a Docker `--build-arg`, not just a runtime env.

- **Server logic** (if ever needed) uses `createServerFn` (see `src/lib/api/example.functions.ts`), not Supabase Edge Functions. Server-only code goes in `*.server.ts` files (the `server-only` npm package is blocked by ESLint). Read `process.env` **inside** handlers, not at module scope (the `config.server.ts` comment explains why on edge targets). `VITE_`-prefixed vars are public and reach the client; never put secrets there.

- `src/server.ts` and `src/start.ts` are custom SSR error wrappers (catch h3-swallowed 500s, render `error-page.ts`). `start.ts` also adds the **security-headers request middleware** (CSP, HSTS, X-Frame-Options, etc.) — the CSP there must be updated if you add new external origins (e.g. analytics, a new font/CDN host) or it will silently block them. `src/lib/lovable-error-reporting.ts` / `error-capture.ts` are Lovable's error telemetry — leave them in place.

## Styling

- **Tailwind v4** (CSS-first config in `src/styles.css`, no `tailwind.config.js`). Theme tokens are CSS variables (`--color-canvas-bg`, `--color-panel`, `--color-toolbar`, plus shadcn semantic tokens like `bg-background`, `text-muted-foreground`).
- **shadcn/ui** ("new-york" style) primitives in `src/components/ui/`. Aliases (`components.json`): `@/components`, `@/components/ui`, `@/lib`, `@/hooks`, `@/lib/utils` (`cn` helper). Icons: `lucide-react`.
- Prettier: 100-col, double quotes, semicolons, trailing commas (`.prettierrc`).
