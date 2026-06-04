# Production-Readiness Audit — Lumen Image Editor

_Audited: 2026-06-04. Stack verified against source, not assumed._

## 0. What this project actually is

A **100% client-side, in-browser raster image editor** ("Lumen"). Photoshop-lite:
layers, brushes, selections (rect / lasso / magic wand / feather), non-destructive
adjustments, text, transforms, and PNG/JPEG/WebP export — all running on `<canvas>`
in the browser. **No backend, no database, no auth, no accounts, no persistence, no
network calls** beyond loading the app and Google Fonts. Images never leave the device.

- **Framework:** TanStack Start (React 19 full-stack) — used here only to SSR a single-page shell.
- **Build:** Vite 7, Tailwind v4 (CSS-first), shadcn/ui, Bun, TypeScript strict.
- **Deploy target:** Cloudflare Workers (Nitro preset, from `@lovable.dev/vite-tanstack-config`).
- **Routes:** one — `/` renders `<Editor>`.
- **Origin:** scaffolded by Lovable (`tanstack_start_ts_2026-05-29` template).

### Implication for this audit

Whole domains do **not apply** and are marked N/A with justification: server-side
auth/authz, SQL injection, DB indexing/N+1, CSRF, rate limiting, payment/checkout,
account/data deletion. The real surface area is: **client correctness, bundle/runtime
performance, accessibility, UX completeness, SEO/meta, build/CI/docs, and the thin SSR
edge layer.**

---

## Ground-truth diagnostics (run, not assumed)

| Check     | Command         | Result                                                                                         |
| --------- | --------------- | ---------------------------------------------------------------------------------------------- |
| Install   | `bun install`   | ✅ 481 packages                                                                                |
| Typecheck | `tsc --noEmit`  | ✅ clean                                                                                       |
| Lint      | `bun run lint`  | ❌ 278 problems (272 errors, 6 warnings) — 269 prettier-autofixable + 3 real `no-explicit-any` |
| Build     | `bun run build` | ✅ succeeds, with 1 CSS warning (see PERF-1)                                                   |
| Dep audit | `bun audit`     | ⚠️ 2 moderate vulns (both fixable)                                                             |
| Tests     | —               | ❌ none exist, no runner configured                                                            |

Build output: client `index` 350 KB (111 KB gz) + 139 KB chunk (46 KB gz), CSS 75 KB (12.5 KB gz).

---

## 1. Architecture

| Sev | Finding                                                                                                                                                                                                                                           | Fix owner        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| —   | **Clean separation.** Editor domain isolated in `src/editor/`; UI primitives in `components/ui/`; framework glue in `routes/`, `router.tsx`, `server.ts`, `start.ts`. Good boundaries.                                                            | —                |
| —   | **Store design is sound.** `useSyncExternalStore` + version-counter is a deliberate, correct choice given layers are mutable `<canvas>` objects that defeat referential-equality diffing. Documented in code.                                     | —                |
| Med | **ARCH-1: Type hole in history.** `store.ts` stashes doc size on history entries via `(entry as any).sizeBefore/sizeAfter` (lines ~412, 499) — defeats strict typing and trips `no-explicit-any`. Should be first-class fields on `HistoryEntry`. | **Fix directly** |
| Low | **ARCH-2: `config.server.ts` / `example.functions.ts` are unused stubs** from the template. Harmless but dead. Keep as documented examples or remove.                                                                                             | Propose          |
| Low | **ARCH-3: No env strategy** — none needed today (no secrets, no backend). `.dev.vars` is gitignored. Document "no env required" in README.                                                                                                        | Fix via docs     |

## 2. Security

| Sev | Finding                                                                                                                                                                                                                                                                                 | Fix owner        |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| —   | No auth, sessions, tokens, cookies, DB, or user input sent anywhere → **SQLi / CSRF / authz / injection are N/A.**                                                                                                                                                                      | —                |
| —   | `renderErrorPage()` is static HTML, no interpolation; no `dangerouslySetInnerHTML` anywhere → **no XSS sink.**                                                                                                                                                                          | —                |
| —   | No hardcoded secrets. `.gitignore` covers `.dev.vars`, `.env*`, `.wrangler`.                                                                                                                                                                                                            | —                |
| Med | **SEC-1: No security headers.** SSR responses ship no CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy. App is clickjackable and has no transport hardening. Add via request middleware (`start.ts`).                                                                | **Fix directly** |
| Med | **SEC-2: Dependency vulns (2 moderate).** (a) `@tanstack/start-server-core <1.167.30` — server-fn deserialization advisory (GHSA-9m65-766c-r333); (b) `brace-expansion` DoS (dev-only, via eslint/tseslint). Both fixable with `bun update`.                                            | **Fix directly** |
| Low | **SEC-3: Privacy leak via Google Fonts.** `@import url(fonts.googleapis.com…)` sends every visitor's IP/UA to Google — contradicts the "everything stays local / private" value prop. Recommend self-hosting fonts or dropping to system fonts. (Currently broken anyway — see PERF-1.) | Propose          |

## 3. Performance

| Sev  | Finding                                                                                                                                                                                                                                                                                                                                                                                              | Fix owner        |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| High | **PERF-1: Google Fonts `@import` is dropped at build.** Build warns: _"@import rules must precede all rules…"_. In `styles.css` the font `@import` sits after `@import "tailwindcss"`/`@source`/`@custom-variant`, so the bundler discards it. **Result: none of the 11 curated text-tool fonts actually load** (only system fonts render). Functional bug + perf. Fix import ordering or self-host. | **Fix directly** |
| Med  | **PERF-2: `recharts` shipped but unused.** `recharts` (~heavy) is imported only by `components/ui/chart.tsx`, which nothing in the app imports. Dead weight in the dependency tree. Remove `chart.tsx` + dep, or confirm it's wanted.                                                                                                                                                                | Propose (verify) |
| Med  | **PERF-3: `LayerThumb` regenerates a data URL every render** via `createElement('canvas')` + `drawImage` + `toDataURL()` on each store version bump, for every layer row. Should memoize per layer-version.                                                                                                                                                                                          | **Fix directly** |
| Low  | **PERF-4: Whole-stack recomposite on every `version` bump** (`EditorCanvas` composite effect keyed on `s.version, doc`). Fine at current scale; would need dirty-layer caching for very large docs / many layers.                                                                                                                                                                                    | Backlog          |
| Low  | **PERF-5: No `<link rel="preconnect">`/font-display tuning** (moot if fonts self-hosted/removed).                                                                                                                                                                                                                                                                                                    | Backlog          |

## 4. UX / UI

| Sev  | Finding                                                                                                                                                                                                                                                                                                                                                    | Fix owner                       |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| High | **UX-1: Advertised keyboard shortcuts don't exist.** Toolbar tooltips promise `Move (V)`, `Brush (B)`, `Eraser (E)`, `Wand (W)`, `Text (T)`, etc., but `EditorCanvas` only wires Space/⌘Z/⌘Y/⌘D/Esc/⌘0. Every single-letter tool shortcut is a lie. Either implement them (guarding against text-field focus) or strip the labels. Recommend implementing. | **Fix directly**                |
| Med  | **UX-2: `window.prompt()` for "New document" size** (TopBar) — janky, unstyled, blocks the thread, no validation feedback. Replace with a proper dialog (shadcn `dialog` already installed).                                                                                                                                                               | Propose                         |
| High | **UX-3: No mobile/touch support, and no fallback.** Fixed-width chrome (`w-14`, `w-72`), pointer-only interactions, `overflow:hidden` body. On a phone the editor is unusable and there's no message. `useIsMobile` exists but is unused by the app. Need at least a "desktop recommended" notice. (Product decision: is mobile in scope?)                 | **Ask**                         |
| Med  | **UX-4: Accessibility.** Icon-only buttons rely on `title` (not reliably announced by SR); no `aria-label`s, no focus-visible styling audit, canvas has no described role. Won't reach WCAG 2.1 AA for the chrome without aria labels + focus states.                                                                                                      | **Fix directly** (labels/focus) |
| Low  | **UX-5: Dead branch in hex color input** (`Toolbar` lines ~113–117): `if (valid) setTool(...); else setTool(...)` — both branches identical. Lets invalid hex through and is confusing dead logic.                                                                                                                                                         | **Fix directly**                |
| —    | Good: empty state (`Welcome`), drag-drop open, error boundary, zoom HUD, in-canvas text editing all present and coherent.                                                                                                                                                                                                                                  | —                               |

## 5. Business & Conversion

| Sev | Finding                                                                                                                                                                                                                                                                                                                | Fix owner        |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| —   | **No landing/marketing page, pricing, or checkout** — the root route _is_ the product. Conversion-funnel items largely N/A for a free local tool.                                                                                                                                                                      | —                |
| Med | **BIZ-1: SEO/meta is inconsistent & placeholder.** `__root.tsx` title is `"Lovable App"`, author `"Lovable"`, `twitter:site @Lovable`, and `og:image` points at a `*.lovable.app` preview screenshot URL. `index.tsx` overrides title to "Lumen". No `robots.txt`, no `sitemap.xml`, no canonical, no structured data. | **Fix directly** |
| Low | **BIZ-2: No analytics** (no events/funnels). Acceptable for a personal tool; note as optional.                                                                                                                                                                                                                         | Backlog          |
| Low | **BIZ-3: No legal/trust pages.** For a zero-data-collection local app, minimal need; a one-line privacy statement ("all processing is local, nothing is uploaded") would reinforce the value prop.                                                                                                                     | Propose          |

## 6. Code Quality & Testing

| Sev  | Finding                                                                                                                                                                                                                                                                                 | Fix owner        |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| High | **CQ-1: Lint is red — 272 errors.** 269 are prettier formatting (template code was never formatted); 3 are real `no-explicit-any` (ARCH-1). `bun run format` + the ARCH-1 fix clears it.                                                                                                | **Fix directly** |
| High | **CQ-2: Zero tests, no runner.** Core pure logic is eminently testable: `selection.ts` (mask math, wand flood-fill, combine modes), `buildFilterString`, and store history (undo/redo, structural vs raster). Add `bun:test` + tests for these critical paths.                          | **Fix directly** |
| Med  | **CQ-3: Dead code.** `components/ui/chart.tsx` (+`recharts`), `hooks/use-mobile.tsx` (only used by unused `ui/sidebar.tsx`), and ~40 unused shadcn primitives. The shadcn set is conventional to keep, but `chart`+`recharts` and `sidebar` are clearly unused heavy/irrelevant pieces. | Propose          |
| Med  | **CQ-4: No `typecheck` script.** `tsc --noEmit` isn't wired into package.json, so type errors can't gate CI easily. Add it.                                                                                                                                                             | **Fix directly** |
| Low  | **CQ-5: No structured logging / error tracking** beyond `console.error` + Lovable's `__lovableEvents` hook. Fine for client app; consider Sentry if this grows.                                                                                                                         | Backlog          |
| —    | Good: `strict: true`, meaningful comments on non-obvious canvas logic, error boundaries.                                                                                                                                                                                                | —                |

## 7. DevOps & Infrastructure

| Sev  | Finding                                                                                                                                           | Fix owner        |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| High | **OPS-1: No CI/CD.** No `.github/`. Nothing gates lint/typecheck/build/tests on push. Scaffold a GitHub Actions workflow (the repo is on GitHub). | **Fix directly** |
| Low  | **OPS-2: No error tracking/alerting** wired (Sentry etc.). Lovable hook exists. Backlog.                                                          | Backlog          |
| Low  | **OPS-3: Health-check / uptime** — for a static SSR worker, low value; CF provides edge availability. Backlog.                                    | Backlog          |
| —    | Backups/DB/scaling at 10× traffic: **N/A** — stateless static-ish SSR on Cloudflare edge scales horizontally by default.                          | —                |

## 8. Documentation

| Sev  | Finding                                                                                                                                                    | Fix owner                       |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| High | **DOC-1: No README.** Only `CLAUDE.md` (agent-facing) exists. Need a human README: overview, stack, setup, scripts, deploy, browser support, privacy note. | **Fix directly**                |
| Med  | **DOC-2: No `.env.example`** — currently no env is required; document that explicitly so future contributors aren't confused.                              | **Fix directly**                |
| Low  | **DOC-3: No CHANGELOG, no LICENSE.** Add a CHANGELOG; license is a product decision.                                                                       | Fix (changelog) / Ask (license) |

---

## Fix plan — execution order

**Batch A — safe mechanical fixes (no product input needed):**

1. CQ-1: `bun run format` (clears 269 lint errors).
2. ARCH-1: type history size fields; remove all `any` → clears remaining 3.
3. CQ-4: add `typecheck` script.
4. PERF-1: fix CSS `@import` ordering so fonts load (or self-host — see questions).
5. UX-5: fix dead hex-input branch.
6. SEC-2: `bun update` to clear both vulns; re-verify build.
7. Re-run lint+typecheck+build → must be green; commit.

**Batch B — essentials (low risk, high value):** 8. SEC-1: security headers middleware. 9. BIZ-1: fix meta/SEO, add `robots.txt`; de-Lovable the branding (pending name confirm). 10. UX-1: implement keyboard tool shortcuts (focus-guarded). 11. UX-4: aria-labels + focus-visible on icon buttons. 12. PERF-3: memoize `LayerThumb`. 13. CQ-2: `bun:test` + tests for `selection.ts`, `buildFilterString`, store history. 14. OPS-1: GitHub Actions CI (install → typecheck → lint → build → test). 15. DOC-1/2/3: README, `.env.example`, CHANGELOG.

**Batch C — needs product decisions (see questions):**

- UX-3: mobile scope (notice vs. responsive vs. ignore).
- PERF-2/CQ-3: remove `recharts`/`chart.tsx`/`sidebar`/unused primitives?
- SEC-3/PERF-1: self-host fonts vs. system-only vs. keep Google CDN?
- Branding/SEO: canonical product name, author, domain, social handle, og image.
- License.
- Future backend/persistence intent (affects how much infra to add).

---

## Resolution log

### Batch A — done (commit: chore/batch-a)

- **CQ-1 ✅** `bun run format` applied; **lint now 0 errors** (6 warnings remain, all
  `react-refresh/only-export-components` inside vendored `components/ui/*` — inherent to
  the shadcn pattern, non-blocking, configured as `warn`).
- **ARCH-1 ✅** Added `sizeBefore`/`sizeAfter` to `HistoryEntry`; removed all three
  `as any` casts in `store.ts`. Typecheck clean.
- **CQ-4 ✅** Added `typecheck` (`tsc --noEmit`) and `test` (`bun test`) scripts.
- **PERF-1 ✅** Removed the dropped CSS `@import`; fonts now load via `<link>` +
  preconnect in `__root.tsx`. **Build CSS warning is gone.**
- **UX-5 ✅** Replaced the dead-branch hex input with a `HexInput` draft-state component
  that only commits valid `#RRGGBB` and reverts invalid input on blur.
- **SEC-2 ⚠️ partial** `@tanstack/start-server-core` advisory **resolved** via
  `bun update` (the only prod-reachable one). The remaining `brace-expansion` advisory is
  **dev-only** (eslint/typescript-eslint → minimatch), **not in the shipped bundle**, and
  **not attacker-reachable** (lint only globs first-party code). A `^5.0.6` override was
  attempted but **breaks eslint** (older `minimatch` expects the legacy brace-expansion
  API), so it was reverted. **Accepted risk**, auto-resolves when eslint/tseslint bump
  minimatch upstream. `bun audit` for production deps: **clean**.

**Batch A verification:** lint ✅ 0 errors · typecheck ✅ · build ✅ clean · prod audit ✅.
