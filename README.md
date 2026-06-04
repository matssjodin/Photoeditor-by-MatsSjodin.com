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

| Area        | Choice                                                              |
| ----------- | ------------------------------------------------------------------- |
| Framework   | [TanStack Start](https://tanstack.com/start) (React 19, SSR shell)  |
| Build       | Vite 7                                                              |
| Styling     | Tailwind CSS v4 (CSS-first) + [shadcn/ui](https://ui.shadcn.com)    |
| Language    | TypeScript (strict)                                                 |
| Runtime/PM  | [Bun](https://bun.sh)                                               |
| Deploy      | Cloudflare Workers (Nitro, via `@lovable.dev/vite-tanstack-config`) |
| Editor core | Custom `<canvas>` engine + `useSyncExternalStore` global store      |

The image editor itself is plain Canvas 2D — no WebGL or third-party image library.

## Getting started

Prerequisites: **[Bun](https://bun.sh) ≥ 1.3**.

```bash
bun install        # install dependencies
bun run dev        # start the dev server (http://localhost:3000)
```

### Scripts

| Script              | What it does                              |
| ------------------- | ----------------------------------------- |
| `bun run dev`       | Vite dev server with HMR                  |
| `bun run build`     | Production build (client + SSR via Nitro) |
| `bun run preview`   | Preview the production build              |
| `bun run typecheck` | `tsc --noEmit`                            |
| `bun run lint`      | ESLint (Prettier-integrated)              |
| `bun run format`    | Prettier write                            |
| `bun test`          | Unit tests (Bun test runner)              |

## Environment variables

**None are required.** The app has no backend, secrets, or external services beyond the
Google Fonts CDN. See [`.env.example`](./.env.example). If you add server logic later,
follow the patterns in `src/lib/config.server.ts` (server-only `*.server.ts` modules) and
expose only `VITE_`-prefixed values to the client.

## Deployment

The build targets **Cloudflare Workers**: `dist/server/server.js` is the SSR worker and
`dist/client/` holds the static assets (served by Workers Assets, falling through to the
worker for SSR routes). Config lives in [`wrangler.toml`](./wrangler.toml).

```bash
bun run build                  # outputs dist/client + dist/server
bunx wrangler deploy --dry-run # validate the config without deploying
bunx wrangler deploy           # deploy (needs a Cloudflare account_id + auth)
```

**Automated deploys** run via `.github/workflows/deploy.yml` on a manual trigger or a
version tag (`git tag v1.0.0 && git push --tags`). Add these repository secrets first:

| Secret | Purpose |
| ------ | ------- |
| `CLOUDFLARE_API_TOKEN`  | Token with the "Edit Cloudflare Workers" permission |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account id                          |

After the first deploy, point `photoeditor.matssjodin.com` at the worker (Workers & Pages →
the worker → Settings → Domains & Routes).

Security headers (CSP, HSTS, X-Frame-Options, etc.) are applied in `src/start.ts` request
middleware. CI runs typecheck → lint → test → build on every push/PR
(`.github/workflows/ci.yml`).

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
public/            # robots.txt, sitemap.xml
```

See [`CLAUDE.md`](./CLAUDE.md) for a deeper architecture tour.

## Browser support

Modern evergreen browsers (Chromium, Firefox, Safari) with Canvas 2D and CSS `filter`
support. Not supported on legacy browsers or small mobile screens.

## License

© MatsSjodin.com. **All rights reserved.** This source is published for reference only;
see [`LICENSE`](./LICENSE). No permission is granted to copy, modify, redistribute, or use
it without prior written consent.
