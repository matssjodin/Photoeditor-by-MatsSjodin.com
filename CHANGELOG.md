# Changelog

All notable changes to this project are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

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

- Rebranded from the Lovable template placeholder ("Lovable App" / "Lumen" /
  "Canvas Studio Pro") to **Photo Editor by MatsSjodin.com** across titles, meta,
  and the in-app wordmark.
- Layer thumbnails are memoized, no longer regenerating a data URL on every render.
- Patched the `@tanstack/start-server-core` advisory (GHSA-9m65-766c-r333) and
  formatted the entire codebase with Prettier (lint: 272 errors → 0).
