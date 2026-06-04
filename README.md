# Photo Editor by MatsSjodin.com

A fast, **private, fully client-side** image editor that runs entirely in the browser.
Layers, selections, non-destructive adjustments, brushes, text, transforms, and
PNG/JPEG/WebP export — all processed locally. **Your images never leave your device:**
there is no backend, no upload, no account, and no tracking of your files.

🔗 **Live:** https://photoeditor.matssjodin.com

---

## Features

- **Layers** — raster + text layers, reorder, opacity, 12 blend modes, lock/hide, duplicate.
- **Selections** — rectangular, freehand lasso, magic wand (contiguous/global, tolerance),
  feathering, and add/subtract/replace modes. Paint and fill respect the active selection.
- **Non-destructive adjustments** — brightness, contrast, saturation, exposure, hue, blur,
  grayscale, sepia, invert. Preview live, then "Apply" to bake into pixels.
- **Tools** — move, brush, eraser, paint-bucket flood fill, eyedropper, text, crop, plus
  rotate/flip. Every tool has a single-key shortcut (hover a tool to see it).
- **Canvas** — pan (space-drag / middle mouse), wheel zoom, fit/100%, transparency checkerboard.
- **Import/Export** — drag-drop or open an image; export to PNG, JPEG, or WebP.
- **Undo/redo** — full history for both pixel and structural edits (⌘/Ctrl+Z, ⇧+Z / Ctrl+Y).

> Desktop-focused: the editor needs a tablet/desktop-sized screen and a mouse or trackpad.
> Small screens show a "best on a larger screen" notice.

## Tech stack

| Area        | Choice                                                             |
| ----------- | ------------------------------------------------------------------ |
| Framework   | [TanStack Start](https://tanstack.com/start) (React 19, SSR shell) |
| Build       | Vite 7                                                             |
| Styling     | Tailwind CSS v4 (CSS-first) + [shadcn/ui](https://ui.shadcn.com)   |
| Language    | TypeScript (strict)                                                |
| Runtime/PM  | Node.js 22 + npm                                                   |
| Tests       | [Vitest](https://vitest.dev) (+ `@napi-rs/canvas` polyfill)        |
| Deploy      | Node server (Nitro `node-server`) in Docker — e.g. Coolify         |
| Editor core | Custom `<canvas>` engine + `useSyncExternalStore` global store     |

The image editor itself is plain Canvas 2D — no WebGL or third-party image library.

## Getting started

Prerequisites: **Node.js ≥ 22** and npm.

```bash
npm install        # install dependencies
npm run dev        # start the dev server (http://localhost:8080)
```

### Scripts

| Script              | What it does                                 |
| ------------------- | -------------------------------------------- |
| `npm run dev`       | Vite dev server with HMR                     |
| `npm run build`     | Production build → `.output/` (client + SSR) |
| `npm start`         | Run the built server (`.output/server`)      |
| `npm run preview`   | Preview the production build                 |
| `npm run typecheck` | `tsc --noEmit`                               |
| `npm run lint`      | ESLint (Prettier-integrated)                 |
| `npm run format`    | Prettier write                               |
| `npm test`          | Unit tests (Vitest)                          |
| `npm run og`        | Regenerate the social share image            |

## Environment variables

**None are required.** The app has no backend or secrets. One optional variable enables
privacy-friendly analytics; see [`.env.example`](./.env.example):

| Variable                | Effect                                                                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_PLAUSIBLE_DOMAIN` | When set, injects the cookieless [Plausible](https://plausible.io) script for page-view analytics. Unset = no analytics, no third-party call (default). |

If you add server logic later, follow the patterns in `src/lib/config.server.ts`
(server-only `*.server.ts` modules) and expose only `VITE_`-prefixed values to the client.

## Deployment

The build produces a **standalone Node server** via Nitro's `node-server` preset:
`npm run build` → `.output/`, then `node .output/server/index.mjs` (alias: `npm start`),
which listens on `PORT` (default 3000). A multi-stage [`Dockerfile`](./Dockerfile) packages
it for any container host.

### Coolify

1. **New Resource → Application**, source = this Git repository.
2. Build pack: **Dockerfile** (the repo's `Dockerfile` is detected automatically).
3. Set the **port to `3000`** (Coolify maps it to the public domain).
4. Attach the domain `photoeditor.matssjodin.com` and let Coolify provision TLS.
5. _(Optional)_ enable analytics by adding a **build-time** variable
   `VITE_PLAUSIBLE_DOMAIN=photoeditor.matssjodin.com` (Vite inlines it at build, so it must
   be a build arg/variable, not just runtime).
6. Deploy. Coolify rebuilds the image and runs the container on each push.

Test the exact production image locally:

```bash
docker build -t photo-editor .
docker run --rm -p 3000:3000 photo-editor
# → http://localhost:3000
```

Security headers (CSP, HSTS, X-Frame-Options, etc.) are applied in `src/start.ts` request
middleware and travel with the SSR responses regardless of host. CI runs typecheck → lint →
test → build on every push/PR (`.github/workflows/ci.yml`).

## Project structure

```
src/
  editor/          # the image editor (store, canvas, tools, panels)
    store.ts       # global state (useSyncExternalStore) + history/undo
    types.ts       # document/layer/selection model + filter helpers
    EditorCanvas.tsx  # compositing + pointer/keyboard interaction
    selection.ts   # lasso/wand/feather mask math
    Toolbar / RightPanels / TopBar  # UI chrome
  routes/          # TanStack file-based routes (`/` renders the editor)
  components/ui/   # shadcn/ui primitives
  lib/             # SSR error wrappers, server config stubs
public/            # robots.txt, sitemap.xml, og-image.png
scripts/           # build-time tooling (OG image generation)
test/              # test setup (canvas polyfill)
Dockerfile         # multi-stage Node server image (for Coolify / any container host)
```

See [`CLAUDE.md`](./CLAUDE.md) for a deeper architecture tour.

## Browser support

Modern evergreen browsers (Chromium, Firefox, Safari) with Canvas 2D and CSS `filter`
support. Not supported on legacy browsers or small mobile screens.

## License

Licensed under the **[Apache License 2.0](./LICENSE)** © 2026 Mats Sjödin. You're free to
use, modify, and redistribute it, including commercially.

If you redistribute this project or a derivative, please keep the attribution from the
[`NOTICE`](./NOTICE) file — namely a credit to **Photo Editor by MatsSjodin.com** and a link
back to **https://matssjodin.com** (Apache-2.0 §4(d)). The app already shows this link in its
top bar; keeping it there is the easiest way to comply. Thanks for the credit! 🙏
