# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

N3X7.bot is an AI property intelligence UI prototype for Sydney investors and developers. It shows listings, an interactive planning map (LMR, TOD, development and constraint layers) and an AI analyst chat. Listings come from two sources the user switches between: **Demo** (`lib/mock-data.ts`) and **Live · Cotality** (the `api/` backend on AWS). The "AI" replies are still mocked in `lib/mock-data.ts`, and the NSW LMR/TOD map layers are live.

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
./deploy-prod.sh  # test, build and upload out/ to AWS Amplify production (needs the `n3x7` AWS profile)

cd api && pnpm test                     # API unit tests
./api/deploy-prod.sh                    # build and deploy the n3x7-api stack (Cognito, HTTP API, Lambda)
./api/smoke.sh                          # end-to-end check of the deployed API
./api/create-user.sh <email> "<name>"   # invite a staff user (Cognito emails a temporary password)
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
- **Static export.** `next.config.mjs` sets `output: 'export'` (with `trailingSlash: true`), so `pnpm build` writes plain files to `out/`. AWS Amplify serves that folder using `amplify.yml`. That means no API routes, middleware, server actions or `next/image` optimization (`images.unoptimized: true`). Anything that needs a server, such as a Cotality proxy, has to live outside this app. Property images are static files in `public/`.
- **Sign-in.** `AppShell` gates every page behind `/login`, which signs in to Cognito with SRP through `lib/auth.ts`. Users are admin-created with `api/create-user.sh` and set their own password at first sign-in. `.env` holds the public API URL and Cognito IDs (not secrets).
- **Demo flow.** The filters in `lib/search.ts` live in the store and drive both the list and the map markers. Contract requests are mocked in the store. Saved IDs, contract requests and the user persist through `lib/persist.ts`.
- **API (`api/`).** A separate pnpm package: a TypeScript Lambda behind an API Gateway HTTP API with a Cognito JWT authorizer, deployed as the `n3x7-api` CloudFormation stack (`api/template.yaml`). It serves `GET /listings` and `GET /listings/{id}/campaign`. Cotality credentials live only in Secrets Manager (`n3x7/cotality`). The sandbox has data for Blacktown, Quakers Hill and Seven Hills only, and its campaign data lags search, so some listings have no agent phone (404). There's no reserved concurrency because the account limit is 10; API Gateway throttling (10 rps) is the cap. The response shape is duplicated in `api/src/types.ts` and `lib/types.ts`, so keep them in sync. On the front end, `lib/live.ts` is the client, and the store's `dataSource` switches the Discover list and map between Demo and Live.
- **Live planning layers.** `components/planning-overlay.tsx` draws NSW LMR (layer 4) and TOD (layers 2 and 3) from the ArcGIS `export` endpoint built in `lib/arcgis.ts`, as two image overlays. That service has `query` disabled, so the `tod`/`lmr` flags on listings are hand-set in `lib/mock-data.ts`. Tests check them against `todAreas`. The NSW firewall returns 403 to a `HeadlessChrome` user agent, so headless browser checks need a normal Chrome user agent.
- **Basemap.** Esri Dark Gray Canvas (keyless, native zoom up to 16). CARTO basemaps now require an API key.
