# Client demo: staff property search walkthrough

**Date:** 2026-10-15 · **Demo date:** 2026-10-16 · **Branch:** `demo/client-walkthrough`
**Source:** "N3X7 Project Technical Specification" (example use case + Definition of Done)

## Goal

Give the client a clickable demo of the use case in the spec. A staff member logs in, searches for properties for sale in the TOD area, filters by frontage, saves a property and requests a contract from the agent.

The demo is a **hybrid**. The planning layers are real NSW data. Listings, frontage, auth, contract requests and AI replies are mocked on the front end. There is no backend.

## Non-goals

- Real CoreLogic/Cotality integration. The API fields are unverified, and the credentials in the spec must not be used or committed.
- Real auth, JWT, database, FastAPI or PostGIS.
- Phase 2 (NSW pattern-book sites, active TOD search).

## Key data finding (drives the script)

The NSW LMR MapServer (`spatialportalarcgis.dpie.nsw.gov.au/sarcgis/rest/services/LMR/LMR/MapServer`) only supports `export` (map images). `query` is disabled, so we cannot do point-in-polygon checks against it.

- **Glebe** is covered by layer 4 (Indicative LMR Housing Area). It has **no TOD area** (layers 2 and 3 are empty there).
- The nearest TOD areas, about 400 m radius, sit around **Marrickville station** (~151.1535, -33.914) and **Dulwich Hill station** (~151.141, -33.911).

The mock `tod` / `lmr` flags on each listing are hand-assigned to match the real layer imagery.

## Demo script (what the client sees)

1. Open the app → redirected to `/login` → sign in with the prefilled demo account.
2. Search "Glebe", turn on **In TOD area**. The result is 0 listings, with a notice: "Glebe has no TOD area under current NSW planning. Nearby suburbs with TOD areas: Marrickville, Dulwich Hill." Each suburb in the notice is a clickable chip.
3. Click **Marrickville**. The map flies there, the real TOD overlay is visible, and listings inside the TOD area show up.
4. Apply **Frontage ≥ 20 m** and **For sale now**. The list and markers narrow.
5. Open a property → **Save** → **Request contract** → form prefilled with agent details → submit. The status shows "Contract requested".
6. Go to **Saved** to see the property with its "Contract requested" badge.
7. Optional: ask the AI analyst about the property. The answer reflects TOD/LMR context.

## Design

### 1. Data (`lib/types.ts`, `lib/mock-data.ts`)

- `Property` gains:
  - `frontage: number` (metres)
  - `status: "for-sale" | "under-offer" | "sold"`
  - `tod: boolean`
  - `agent: { name: string; agency: string; phone: string; email: string }`

  Keep `lmr` and `todDistance`. The `email` values are fake (`@example.com`).
- Replace the Bondi listings with about 14 listings:
  - **Glebe:** about 6, all `lmr: true, tod: false`. Mix of frontages and statuses.
  - **Marrickville:** about 6. About 4 inside the TOD radius (`tod: true`), with frontages between 8 and 30 m and at least 2 that are for sale with ≥ 20 m frontage.
  - **Dulwich Hill:** about 2.

  Reuse the existing `public/property-*.png` images.
- Add a `suburbs` table with `{ name, center: [lat, lng], hasTod }` for Glebe, Marrickville and Dulwich Hill. It drives map fly-to and the "nearby TOD suburbs" suggestion.
- `MAP_CENTER` moves to Glebe.
- Remove the mock `planningZones` polygons for `lmr`/`tod`. Keep the `development`/`constraints` mock polygons, relocated near Glebe/Marrickville and labelled as modelled.
- Update `alerts`, `exampleSearches`, `suggestedPrompts` and `aiReply` to the Inner West context.

### 2. Real planning overlay (`components/property-map.tsx`)

- Add a Leaflet image overlay driven by the ArcGIS `export` endpoint. Re-request the image on `moveend`/`zoomend` for the current bounds, using `bboxSR=4326&imageSR=3857&format=png32&transparent=true` and `layers=show:<ids>`.
- Map toggles to layer ids: `lmr` → `4`, `tod` → `2,3`. Show both in one request when both are on. Opacity is about 0.55.
- **Fallback:** if the image fails to load (`onerror`), show a small "Live NSW layer unavailable" note in the legend. The demo keeps working without the overlay.
- Legend: add a source line under LMR/TOD that reads "Source: NSW DPHI (live)". Update the legend swatch colours to roughly match the ArcGIS rendering.

### 3. Search and filters (`lib/store.tsx`, `components/discovery-panel.tsx`, `components/search-bar.tsx`)

- The store gains `filters: { suburb: string | null; todOnly: boolean; minFrontage: number; forSaleOnly: boolean }`, plus `setFilters`. It also exposes a derived `filteredProperties`, so the map markers and the list stay in sync.
- Search bar: when the input matches a known suburb (case-insensitive), set `filters.suburb` and fly the map to that suburb. Natural-language queries still go to the AI analyst as today.
- Discovery panel:
  - The header shows the active suburb.
  - Filter controls: "In TOD area" toggle, "Frontage" select (Any / 10 / 15 / 20 / 25 m+), "For sale now" toggle.
  - The existing All / High Potential / LMR chips stay.
- **Empty state:** if `todOnly` is on and the active suburb has `hasTod: false`, show the notice. It has clickable chips for suburbs with `hasTod: true`, ordered by distance. A chip sets the suburb and flies the map there.
- Map markers use `filteredProperties` instead of all properties.
- The map fly-to needs a store signal (`flyTarget`) that `MapController` watches.

### 4. Save and request contract (`components/property-drawer.tsx`, `app/saved/page.tsx`)

- The drawer shows frontage, status and an agent card (name, agency, phone).
- Add a **Request contract** button. It opens a dialog (shadcn `dialog`, base-nova) with fields prefilled from the user and agent, plus an optional message.
- Submitting the dialog:
  - waits about 800 ms to simulate the request;
  - sets `contractRequests[id] = { requestedAt }` in the store;
  - auto-saves the property if it wasn't saved;
  - shows a "Contract requested from {agent}" confirmation.

  The button then reads "Contract requested ✓" and is disabled. No network call is made.
- Saved page: show a "Contract requested" badge with a relative time where applicable. Start with an empty saved list so the client sees the save flow happen live.

### 5. Login (`app/login/page.tsx`, `components/app-shell.tsx`, store)

- `/login` renders without the app shell sidebar/header. It is a centered card with email + password prefilled to a demo staff account (`demo@n3x7.bot`). The password is a non-secret demo value, kept in `lib/mock-data.ts`.
- Submitting sets `user` in the store and in `localStorage` (wrapped in try/catch), then routes to `/`.
- `AppShell` redirects to `/login` when there is no user, after a hydration check to avoid a flash. The top-header user menu gets **Sign out**.
- This is clearly demo auth. Any credentials are accepted.

### 6. Persistence

Saved IDs, contract requests and the user persist in `localStorage`, so a page refresh mid-demo doesn't lose state. Filters do not persist.

## Error handling

- ArcGIS image failure → legend note; everything else works.
- `localStorage` unavailable → in-memory state only.
- Unknown suburb search → falls through to the AI analyst behaviour (existing).

## Verification

- `pnpm exec tsc --noEmit` passes, and `pnpm build` passes.
- Walk the whole demo script on `pnpm dev` in a browser, including a hard refresh after step 5 (state persists) and sign out → redirect to login.
- Check the overlay at Glebe (LMR visible, no TOD) and Marrickville (TOD visible), and confirm the TOD-flagged markers sit inside the real TOD imagery.
- Check the layout at mobile width (existing responsive layout must not regress).

## Deployment

The work stays on `demo/client-walkthrough`. Merging to `main` auto-deploys via Vercel. Pushing or merging happens only with the user's explicit go-ahead.
