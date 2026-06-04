# Changelog

All notable changes to this project are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Dismissible site notice banner: discloses that editing is local (nothing uploaded),
  that only browser-local preferences are stored, and that cookieless analytics + error
  reporting may run; states the software is provided free, "as is", without warranties.
  Acknowledgement persists in `localStorage`.
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

- **Text-tool fonts never loaded** — the Google Fonts CSS `@import` was dropped at
  build because it followed other at-rules. Fonts now load via `<link>` + preconnect
  in the document head.
- Hex color input had two identical (dead) branches and accepted invalid values; it
  now keeps a draft and only commits valid `#RRGGBB`.
- Removed all `as any` casts in the editor history store by typing document-size
  snapshots as first-class `HistoryEntry` fields.

### Changed

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
