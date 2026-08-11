# User docs + navigation reshuffle — design

> Status: **approved** (2026-08-11). Scope: user-facing documentation section, plus three
> navigation changes. Live-modules only — MyBase, MyCamp, MyAgents, MyClaw, Swap, Marketplace
> are disabled in `config/routeStatus.js` and are out of scope.

## Goals

1. **User docs** under `/Docs`, rebuilt professionally in the Soft design system, one page per
   live module, with diagrams (mermaid) and math (KaTeX), so a user can check every aspect of the app.
2. **Curators → a tab under Asks**, mirroring the existing Money/Paid merge.
3. **Hide B20 in the nav** but keep the `/b20` route reachable by URL.
4. **Update `/how` and `/re-definition`** to match the nav changes.

## Decisions (from the user)

- Docs layout: **hub + one page per module** (sidebar).
- Diagrams & math: **mermaid + KaTeX** (add libs).
- Scope: **all live modules + a Verify-onchain page**.
- Docs entry point: **footer link** (+ from `/how` and the Docs card in `/re-definition`); **not** in the top bar.

## Part 1 — Docs section

- `app/Docs/layout.tsx` — shared sidebar + content shell, Soft design, light/dark, matching `/how` and `/money`. Replaces the stale 2024 dark landing.
- `app/Docs/page.tsx` — Overview (what MySphere is, the core loop, links out). Keep the Whitepaper link.
- Module pages (each its own route): `getting-started`, `feed`, `asks`, `money`, `curators`, `startpad`, `b20`, `verify`.
- Rendering: `app/Docs/_components/DocArticle.tsx` wiring `react-markdown` + `remark-gfm` + `remark-math` + `rehype-katex`, plus `app/Docs/_components/MermaidBlock.tsx` (`'use client'`, dynamic mermaid, renders ```mermaid fences). Import `katex/dist/katex.min.css` once.
- Content shape per module page: **what it does** (plain) → **how to use it** (steps) → **flow diagram** (mermaid) → **the math / fees** (KaTeX, where it matters) → **verify onchain** (which tx/hash/contract, which explorer). Authored as markdown, grounded in the live code (survey each module while writing).
- New deps: `mermaid`, `katex`, `remark-math`, `rehype-katex`, `remark-gfm`.

## Part 2 — Curators → tab under Asks (mirror Money/Paid)

- Extract current client `app/asks/page.tsx` → `app/asks/AsksContent.tsx` (`'use client'`).
- `app/asks/page.tsx` becomes a **server** wrapper: reads `?tab`, renders a `TabPill` switch [Asks | Curators] + `<AsksContent/>` or `<CuratorsContent/>`. Tab-dependent metadata (curators metadata under `?tab=curators`).
- Extract current server `app/curators/page.tsx` render body → `app/curators/CuratorsContent.tsx` (stays server-rendered). `app/curators/page.tsx` → redirect (or the next.config redirect handles it).
- Add `next.config.js` redirect `/curators` → `/asks?tab=curators` (temporary, `permanent: false`), mirroring `/leaderboard` → `/money?tab=paid`.
- Remove the `Curators` entry from `Navigation.tsx`.

## Part 3 — Hide B20 in nav

- Remove `{ href: '/b20', label: 'B20' }` from `Navigation.tsx` `allNavLinks` (leave a commented restore note). Do **not** add `/b20` to `DISABLED_ROUTES` — the route must stay reachable by URL.

## Part 4 — How / Re-Definition

- `/how`: repoint `/curators` link → `/asks?tab=curators`; add a link to the full Docs.
- `/re-definition`: update the Docs / User-Guide card link and any Curators/B20 status lines.
- Footer: add a "Docs" link (find the shared footer).

## Verification

- `tsc`, `lint`, `build` green.
- Manual: `/asks` shows Asks|Curators tabs; `/curators` redirects; `/b20` reachable by URL but absent from nav; `/Docs` renders each module page with a diagram and a formula in both themes.
