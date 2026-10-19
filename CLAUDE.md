# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

N3X7.bot is an AI property intelligence UI prototype for Sydney investors and developers. It shows listings, an interactive planning map (LMR, TOD, development and constraint layers) and an AI analyst chat. It is a **front-end-only prototype**: there is no backend, API or database. Listings and the "AI" replies come from `lib/mock-data.ts`; only the NSW LMR/TOD map layers are live.

The repo is linked to a v0.app project. v0 pushes commits straight to this repo, and every merge to `main` auto-deploys on Vercel. Expect v0-generated commits, and keep changes in a shape v0 can keep editing (plain files, no unusual build tooling).

## Commands

The package manager is pnpm (`pnpm-lock.yaml`).

```bash
pnpm install
pnpm dev      # http://localhost:3000
pnpm build
pnpm start
pnpm lint     # runs `eslint .`, but eslint is not a dependency and there is no config, so this fails as-is
pnpm test     # node --test over lib/**/*.test.ts (Node 24 native TS)
```

Tests use Node's built-in runner on the pure `lib/` modules. Run one file with `node --test lib/search.test.ts`. Modules imported by tests must only use `import type` for local types, and runtime imports need a `.ts` extension. `next.config.mjs` sets `typescript.ignoreBuildErrors: true`, so `pnpm build` does **not** catch type errors. Type-check explicitly with `pnpm exec tsc --noEmit`.

## Architecture

- **Next.js 16 App Router + React 19, TypeScript, Tailwind v4.** The `@/*` path alias maps to the repo root.
- **Single global client store.** `lib/store.tsx` holds one React Context (`N3X7Provider` / `useN3X7()`) with all app state: saved IDs, the selected property and drawer state, map layer toggles, the search query, chat messages and the AI context. `app/layout.tsx` wraps everything in `N3X7Provider` and `AppShell`, so any component can call `useN3X7()`. The session, saved IDs and contract requests persist in localStorage. Everything else resets on reload.
- **Layout.** `components/app-shell.tsx` renders the `Sidebar`, `TopHeader` and the page content, plus one global `PropertyDrawer` that opens through `openProperty(id)` from anywhere. The pages are `app/page.tsx` (Discover: map + discovery list), `map`, `analyst`, `saved`, `alerts` and `settings`. They are thin, mostly composing components from `components/`.
- **Mock data layer.** `lib/mock-data.ts` exports `properties` (Glebe, Marrickville and Dulwich Hill listings), `suburbs`, `todAreas`, `planningZones` (the modelled development/constraint polygons), `layerMeta`, `alerts`, `suggestedPrompts`, `DEMO_USER`, `MAP_CENTER` (Glebe) and `aiReply(question)`, a keyword-matching stub that `askAi` calls after a simulated delay. Domain types are in `lib/types.ts`. Formatting helpers and the opportunity/type style maps are in `lib/format.ts`.
- **Map (Leaflet).** `components/property-map.tsx` uses `react-leaflet` and must load client-side only: `components/map-panel.tsx` imports it through `next/dynamic` with `ssr: false`. Keep that pattern for any new Leaflet code. Markers are custom `L.divIcon` SVGs colored by score. Layer colors are hard-coded hex values in `property-map.tsx`. The Leaflet CSS import and its dark-theme overrides are in `app/globals.css`.
- **UI primitives.** `components/ui/*` are shadcn components using the `base-nova` style, which is built on `@base-ui/react`, not Radix (see `components.json`). Add new ones with `pnpm dlx shadcn@latest add <name>`. Icons come from `lucide-react`. Use `cn()` from `lib/utils.ts` to merge classes.
- **Theming.** The app is dark-only (`viewport.colorScheme: 'dark'`). Design tokens are CSS variables in `app/globals.css`, mapped into Tailwind through `@theme inline`. There is no `tailwind.config` file.
- `images.unoptimized: true` is set. Property images are static files in `public/`.
- **Demo flow.** `AppShell` gates every page behind a demo login at `/login`, backed by localStorage (any credentials work). The filters in `lib/search.ts` live in the store and drive both the list and the map markers. Contract requests are mocked in the store. Saved IDs, contract requests and the user persist through `lib/persist.ts`.
- **Live planning layers.** `components/planning-overlay.tsx` draws NSW LMR (layer 4) and TOD (layers 2 and 3) from the ArcGIS `export` endpoint built in `lib/arcgis.ts`, as two image overlays. That service has `query` disabled, so the `tod`/`lmr` flags on listings are hand-set in `lib/mock-data.ts`. Tests check them against `todAreas`. The NSW firewall returns 403 to a `HeadlessChrome` user agent, so headless browser checks need a normal Chrome user agent.
- **Basemap.** Esri Dark Gray Canvas (keyless, native zoom up to 16). CARTO basemaps now require an API key.
