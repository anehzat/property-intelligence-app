# Client Demo Walkthrough Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the existing N3X7 front-end prototype into a clickable client demo of the spec's staff use case: login → suburb + TOD + frontage search → save → request contract. The demo shows live NSW planning layers.

**Architecture:** Everything stays client-side in the existing Next.js app. Pure logic goes in small, node-testable modules under `lib/` (`search.ts`, `arcgis.ts`, `persist.ts`, `format.ts`). `lib/store.tsx` remains the single React Context and gains filters, fly-to, auth, contract requests and localStorage persistence. The real NSW LMR/TOD layers are drawn as a Leaflet `ImageOverlay` from the ArcGIS `export` endpoint.

**Tech Stack:** Next.js 16 / React 19 / TypeScript, Tailwind v4, shadcn (base-nova) UI, react-leaflet 5, Node 24 built-in test runner (`node --test`, native TS type stripping).

**Spec:** `docs/superpowers/specs/2026-10-15-client-demo-design.md`

## Global Constraints

- Demo date is 2026-10-16. Work on branch `demo/client-walkthrough`. Never push or merge without the user's explicit go-ahead.
- Never use or commit the CoreLogic credentials or API keys from the source .docx.
- No backend and no new runtime dependencies. Listings, auth, contract requests and AI replies are mocked.
- ArcGIS service: `https://spatialportalarcgis.dpie.nsw.gov.au/sarcgis/rest/services/LMR/LMR/MapServer`. Only `export` works (`query` is disabled). Layer ids: `lmr` → `4`; `tod` → `2,3`.
- Glebe has no TOD area. TOD areas (~400 m radius) are at Marrickville station (~-33.914, 151.1535) and Dulwich Hill station (~-33.911, 151.141).
- Frontage threshold for the demo is 20 m. Frontage options are Any / 10 / 15 / 20 / 25 m+.
- Demo account: `demo@n3x7.bot`. Any credentials are accepted.
- Agent contact details are fictional: `@example.com` emails, and phone numbers from the 0491 570 xxx fiction range.
- Modules under `lib/` that tests import must use `import type` for type-only imports. Any runtime import between them must carry the `.ts` extension, or Node can't resolve it. `lib/search.ts`, `lib/arcgis.ts`, `lib/persist.ts`, `lib/format.ts` and `lib/mock-data.ts` must therefore have **no runtime imports of other local modules**.
- `pnpm build` ignores type errors. Always run `pnpm exec tsc --noEmit` as well.
- Deviation from spec §4: the contract form is an **inline panel inside the property drawer**, not a separate dialog. This avoids a modal nested in the Sheet and avoids adding a shadcn component the night before the demo.

## Review Focus

1. A suburb typed in any case or inside a sentence ("properties for sale in GLEBE in the TOD area") should set the filters and not route to the AI analyst. Pinned by `parseSearch` tests in Task 1.
2. Filters that yield zero results for a reason other than TOD (e.g. Glebe + 25 m frontage) should show the generic "No listings match" state with Clear filters, not the TOD notice. Pinned by `showsNoTodNotice` tests in Task 1.
3. NSW ArcGIS unreachable (offline, or the service is down mid-demo): the map, markers and filters must keep working, and the legend should say the live layer is unavailable. Pinned by a manual check in Task 5, step 6.
4. Hard refresh mid-demo (after saving and requesting a contract): the user should stay signed in, saved and contract state should survive, and there should be no flash of the login page. Pinned by `persist` tests in Task 3 and a manual check in Task 8.
5. Opening a **sold** listing: Request contract should be disabled with a clear label. Pinned by a manual check in Task 6, step 5.

---

### Task 1: Test harness, domain types, search logic

**Files:**
- Modify: `package.json` (scripts)
- Modify: `tsconfig.json` (compilerOptions)
- Modify: `lib/types.ts`
- Create: `lib/search.ts`
- Test: `lib/search.test.ts`

**Interfaces:**
- Produces:
  - types `ListingStatus`, `Agent`, `Suburb`, `TodArea`, `DemoUser`, `ContractRequest`
  - `Property` fields `frontage: number`, `status: ListingStatus`, `tod: boolean`, `agent: Agent`
  - `lib/search.ts` exports:
    - `Filters`, `defaultFilters`, `frontageOptions: number[]`
    - `filterProperties(list: Property[], f: Filters): Property[]`
    - `distanceMeters(a: [number, number], b: [number, number]): number`
    - `nearbyTodSuburbs(from: string, all: Suburb[]): Suburb[]`
    - `showsNoTodNotice(f: Filters, all: Suburb[]): boolean`
    - `parseSearch(query: string, all: Suburb[]): Partial<Filters> | null`

- [ ] **Step 1: Add the test script and TS-extension imports**

In `package.json` `scripts`, add after `"lint"`:

```json
    "lint": "eslint .",
    "test": "node --test \"lib/**/*.test.ts\""
```

In `tsconfig.json` `compilerOptions`, add after `"noEmit": true,`:

```json
    "allowImportingTsExtensions": true,
```

- [ ] **Step 2: Extend the domain types**

In `lib/types.ts`, replace the `Property` interface with the following, and append the new types at the end of the file:

```ts
export type ListingStatus = "for-sale" | "under-offer" | "sold"

export interface Agent {
  name: string
  agency: string
  phone: string
  email: string
}

export interface Property {
  id: string
  address: string
  suburb: string
  state: string
  price: number
  type: PropertyType
  beds: number
  baths: number
  parking: number
  landSize: number
  /** Street frontage in metres; 0 when not applicable (e.g. apartments). */
  frontage: number
  status: ListingStatus
  score: number
  opportunity: Opportunity
  lat: number
  lng: number
  lmr: boolean
  /** Inside a NSW TOD area (hand-assigned to match the live NSW layer). */
  tod: boolean
  /** Distance to the nearest station / light rail stop, metres. */
  todDistance: number
  developmentPotential: "High" | "Medium" | "Low"
  insights: string[]
  breakdown: ScoreBreakdown
  image: string
  gallery: string[]
  agent: Agent
  savedDate?: string
  aiSummary?: string
}
```

```ts
export interface Suburb {
  name: string
  center: [number, number]
  hasTod: boolean
}

export interface TodArea {
  id: string
  name: string
  center: [number, number]
  radiusM: number
}

export interface DemoUser {
  email: string
  name: string
  role: string
}

export interface ContractRequest {
  requestedAt: string
  message: string
}
```

- [ ] **Step 3: Write the failing tests**

Create `lib/search.test.ts`:

```ts
import { test } from "node:test"
import assert from "node:assert/strict"
import type { Property, Suburb } from "./types"
import {
  defaultFilters,
  distanceMeters,
  filterProperties,
  nearbyTodSuburbs,
  parseSearch,
  showsNoTodNotice,
} from "./search.ts"

const suburbs: Suburb[] = [
  { name: "Glebe", center: [-33.8795, 151.185], hasTod: false },
  { name: "Marrickville", center: [-33.911, 151.155], hasTod: true },
  { name: "Dulwich Hill", center: [-33.907, 151.139], hasTod: true },
]

function prop(over: Partial<Property>): Property {
  return {
    id: "x", address: "1 Test St", suburb: "Marrickville", state: "NSW",
    price: 1, type: "house", beds: 1, baths: 1, parking: 0, landSize: 0,
    frontage: 20, status: "for-sale", score: 80, opportunity: "MODERATE",
    lat: 0, lng: 0, lmr: true, tod: true, todDistance: 100,
    developmentPotential: "Medium", insights: [],
    breakdown: { planningOpportunity: 0, marketDemand: 0, transportAccess: 0, riskScore: 0 },
    image: "", gallery: [],
    agent: { name: "A", agency: "B", phone: "", email: "" },
    ...over,
  }
}

test("filterProperties applies every active filter", () => {
  const list = [
    prop({ id: "a" }),
    prop({ id: "b", tod: false }),
    prop({ id: "c", frontage: 12 }),
    prop({ id: "d", status: "sold" }),
    prop({ id: "e", suburb: "Glebe" }),
  ]
  const f = { suburb: "Marrickville", todOnly: true, minFrontage: 20, forSaleOnly: true }
  assert.deepEqual(filterProperties(list, f).map((p) => p.id), ["a"])
  assert.equal(filterProperties(list, defaultFilters).length, 5)
})

test("distanceMeters is roughly right for ~1km", () => {
  const d = distanceMeters([-33.9, 151.15], [-33.909, 151.15])
  assert.ok(d > 980 && d < 1020, `got ${d}`)
})

test("nearbyTodSuburbs excludes origin and non-TOD, nearest first", () => {
  assert.deepEqual(
    nearbyTodSuburbs("Glebe", suburbs).map((s) => s.name),
    ["Marrickville", "Dulwich Hill"],
  )
  assert.deepEqual(nearbyTodSuburbs("Nowhere", suburbs), [])
})

test("showsNoTodNotice only for TOD filter on a suburb without TOD", () => {
  const glebe = { ...defaultFilters, suburb: "Glebe" }
  assert.equal(showsNoTodNotice({ ...glebe, todOnly: true }, suburbs), true)
  assert.equal(showsNoTodNotice({ ...glebe, todOnly: false, minFrontage: 25 }, suburbs), false)
  assert.equal(showsNoTodNotice({ ...defaultFilters, suburb: "Marrickville", todOnly: true }, suburbs), false)
  assert.equal(showsNoTodNotice({ ...defaultFilters, todOnly: true }, suburbs), false)
})

test("parseSearch reads the client's sentence", () => {
  assert.deepEqual(
    parseSearch("I want to find all properties for sale in GLEBE that are in the TOD area.", suburbs),
    { suburb: "Glebe", todOnly: true, forSaleOnly: true },
  )
})

test("parseSearch handles multi-word suburbs and frontage phrasings", () => {
  assert.deepEqual(parseSearch("dulwich hill", suburbs), { suburb: "Dulwich Hill" })
  assert.deepEqual(parseSearch("Marrickville 20m frontage", suburbs), {
    suburb: "Marrickville",
    minFrontage: 20,
  })
  assert.deepEqual(parseSearch("marrickville frontage of at least 25 m", suburbs), {
    suburb: "Marrickville",
    minFrontage: 25,
  })
})

test("parseSearch returns null without a known suburb", () => {
  assert.equal(parseSearch("Find properties with LMR potential", suburbs), null)
  assert.equal(parseSearch("Bondi", suburbs), null)
})
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `pnpm test`
Expected: FAIL, because `Cannot find module '.../lib/search.ts'`.

- [ ] **Step 5: Implement `lib/search.ts`**

```ts
import type { Property, Suburb } from "./types"

export interface Filters {
  suburb: string | null
  todOnly: boolean
  minFrontage: number
  forSaleOnly: boolean
}

export const defaultFilters: Filters = {
  suburb: null,
  todOnly: false,
  minFrontage: 0,
  forSaleOnly: false,
}

export const frontageOptions = [0, 10, 15, 20, 25]

export function filterProperties(list: Property[], f: Filters): Property[] {
  return list.filter(
    (p) =>
      (!f.suburb || p.suburb === f.suburb) &&
      (!f.todOnly || p.tod) &&
      (f.minFrontage <= 0 || p.frontage >= f.minFrontage) &&
      (!f.forSaleOnly || p.status === "for-sale"),
  )
}

export function distanceMeters(a: [number, number], b: [number, number]): number {
  const R = 6_371_000
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(b[0] - a[0])
  const dLng = rad(b[1] - a[1])
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export function nearbyTodSuburbs(from: string, all: Suburb[]): Suburb[] {
  const origin = all.find((s) => s.name === from)
  if (!origin) return []
  return all
    .filter((s) => s.hasTod && s.name !== from)
    .sort(
      (x, y) =>
        distanceMeters(origin.center, x.center) -
        distanceMeters(origin.center, y.center),
    )
}

export function showsNoTodNotice(f: Filters, all: Suburb[]): boolean {
  if (!f.todOnly || !f.suburb) return false
  return all.find((s) => s.name === f.suburb)?.hasTod === false
}

/** Turns a free-text search into filters. Returns null when no known suburb is named. */
export function parseSearch(query: string, all: Suburb[]): Partial<Filters> | null {
  const q = query.toLowerCase()
  const suburb = all.find((s) => new RegExp(`\\b${s.name.toLowerCase()}\\b`).test(q))
  if (!suburb) return null
  const patch: Partial<Filters> = { suburb: suburb.name }
  if (/\btod\b|transport[- ]oriented/.test(q)) patch.todOnly = true
  if (/for sale|available/.test(q)) patch.forSaleOnly = true
  const m = q.match(/(\d+)\s*m\b[^.]*frontage|frontage[^\d]{0,20}(\d+)\s*m\b/)
  if (m) patch.minFrontage = Number(m[1] ?? m[2])
  return patch
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm test`
Expected: all 7 tests in `search.test.ts` PASS.

`pnpm exec tsc --noEmit` is expected to FAIL at this point, because `lib/mock-data.ts` lacks the new `Property` fields. Task 2 fixes this. Do not commit a broken type state: go straight on to Task 2 and commit both tasks together at the end of Task 2.

---

### Task 2: Inner West mock data + format helpers

**Files:**
- Modify: `lib/mock-data.ts` (rewrite `MAP_CENTER`, `properties`, `planningZones`, `layerMeta` descriptions, `suggestedPrompts`, `exampleSearches`, `alerts`, `aiReply`; add `suburbs`, `todAreas`, `DEMO_USER`)
- Modify: `lib/format.ts` (add `statusLabel`, `formatRelative`)
- Test: `lib/mock-data.test.ts`, `lib/format.test.ts`

**Interfaces:**
- Consumes: the types from Task 1, and `filterProperties` / `distanceMeters` from `lib/search.ts` (tests only).
- Produces:
  - `suburbs: Suburb[]`, `todAreas: TodArea[]`
  - `DEMO_USER: { email: string; password: string; name: string; role: string }`
  - `MAP_CENTER` (Glebe)
  - 14 listings with ids `g1`–`g6`, `m1`–`m6`, `d1`–`d2`
  - `statusLabel: Record<ListingStatus, string>`
  - `formatRelative(iso: string, now?: number): string`

- [ ] **Step 1: Write the failing tests**

Create `lib/mock-data.test.ts`:

```ts
import { test } from "node:test"
import assert from "node:assert/strict"
import { properties, suburbs, todAreas } from "./mock-data.ts"
import { distanceMeters, filterProperties } from "./search.ts"

test("14 listings with unique ids across the three demo suburbs", () => {
  assert.equal(properties.length, 14)
  assert.equal(new Set(properties.map((p) => p.id)).size, 14)
  const names = new Set(suburbs.map((s) => s.name))
  for (const p of properties) assert.ok(names.has(p.suburb), p.suburb)
})

test("Glebe listings are LMR but never TOD (matches live NSW data)", () => {
  const glebe = properties.filter((p) => p.suburb === "Glebe")
  assert.equal(glebe.length, 6)
  assert.ok(glebe.every((p) => p.lmr && !p.tod))
})

test("tod flags agree with TOD area geometry (clear margin either side)", () => {
  for (const p of properties) {
    const d = Math.min(...todAreas.map((a) => distanceMeters([p.lat, p.lng], a.center)))
    if (p.tod) assert.ok(d <= 300, `${p.id} flagged TOD but ${Math.round(d)}m away`)
    else assert.ok(d >= 500, `${p.id} not TOD but only ${Math.round(d)}m away`)
  }
})

test("demo funnel: Marrickville + TOD + 20m + for sale leaves at least 2", () => {
  const hits = filterProperties(properties, {
    suburb: "Marrickville",
    todOnly: true,
    minFrontage: 20,
    forSaleOnly: true,
  })
  assert.ok(hits.length >= 2, `only ${hits.length}`)
})

test("Glebe + TOD yields nothing", () => {
  assert.equal(
    filterProperties(properties, { suburb: "Glebe", todOnly: true, minFrontage: 0, forSaleOnly: false }).length,
    0,
  )
})
```

Create `lib/format.test.ts`:

```ts
import { test } from "node:test"
import assert from "node:assert/strict"
import { formatRelative, statusLabel } from "./format.ts"

test("formatRelative buckets", () => {
  const now = Date.parse("2026-10-16T10:00:00Z")
  const ago = (ms: number) => new Date(now - ms).toISOString()
  assert.equal(formatRelative(ago(10_000), now), "just now")
  assert.equal(formatRelative(ago(5 * 60_000), now), "5 min ago")
  assert.equal(formatRelative(ago(3 * 3_600_000), now), "3 h ago")
  assert.equal(formatRelative(ago(26 * 3_600_000), now), "1 day ago")
  assert.equal(formatRelative(ago(-60_000), now), "just now")
})

test("statusLabel covers every status", () => {
  assert.deepEqual(statusLabel, {
    "for-sale": "For sale",
    "under-offer": "Under offer",
    sold: "Sold",
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test`
Expected: FAIL. `suburbs`/`todAreas` are undefined, `formatRelative` is not exported, and the counts are wrong.

- [ ] **Step 3: Add the format helpers**

In `lib/format.ts`, change the import line to `import type { ListingStatus, Opportunity, PropertyType } from "./types"` and append:

```ts
export const statusLabel: Record<ListingStatus, string> = {
  "for-sale": "For sale",
  "under-offer": "Under offer",
  sold: "Sold",
}

export function formatRelative(iso: string, now: number = Date.now()): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000))
  if (s < 60) return "just now"
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.round(h / 24)
  return `${d} day${d === 1 ? "" : "s"} ago`
}
```

- [ ] **Step 4: Rewrite the data in `lib/mock-data.ts`**

Replace everything from the top of the file through the end of the `planningZones` array with the following. Keep the `LayerMeta` interface. Then replace `layerMeta`, `suggestedPrompts`, `exampleSearches`, `alerts` and `aiReply` with the versions after it.

```ts
import type {
  Agent,
  AlertItem,
  PlanningZone,
  Property,
  Suburb,
  TodArea,
} from "./types"

// Demo opens on Glebe (inner west Sydney)
export const MAP_CENTER: [number, number] = [-33.8795, 151.185]

export const DEMO_USER = {
  email: "demo@n3x7.bot",
  password: "n3x7-demo",
  name: "Sam Taylor",
  role: "Acquisitions Analyst",
}

export const suburbs: Suburb[] = [
  { name: "Glebe", center: [-33.8795, 151.185], hasTod: false },
  { name: "Marrickville", center: [-33.911, 151.155], hasTod: true },
  { name: "Dulwich Hill", center: [-33.907, 151.139], hasTod: true },
]

// Approximations of the live NSW "TOD Area" polygons, used to keep mock flags honest.
export const todAreas: TodArea[] = [
  { id: "tod-marrickville", name: "Marrickville Station TOD", center: [-33.914, 151.1535], radiusM: 400 },
  { id: "tod-dulwich", name: "Dulwich Hill Station TOD", center: [-33.911, 151.141], radiusM: 400 },
]

const agents: Record<string, Agent> = {
  olivia: { name: "Olivia Chen", agency: "Parkside Residential", phone: "0491 570 006", email: "olivia.chen@example.com" },
  james: { name: "James Romano", agency: "Inner West Property Co.", phone: "0491 570 156", email: "james.romano@example.com" },
  priya: { name: "Priya Shah", agency: "Greenway Estate Agents", phone: "0491 570 157", email: "priya.shah@example.com" },
}

type Seed = Omit<Property, "state" | "opportunity" | "gallery" | "developmentPotential">

function listing(s: Seed): Property {
  return {
    ...s,
    state: "NSW",
    opportunity:
      s.score >= 85 ? "HIGH POTENTIAL" : s.score >= 78 ? "MODERATE" : s.score >= 70 ? "EMERGING" : "STABLE",
    developmentPotential:
      s.breakdown.planningOpportunity >= 85 ? "High" : s.breakdown.planningOpportunity >= 70 ? "Medium" : "Low",
    gallery: [s.image, "/property-interior-living.png", "/property-backyard.png"],
  }
}

export const properties: Property[] = [
  // Glebe: inside the Indicative LMR Housing Area, no TOD area
  listing({
    id: "g1", address: "142 Glebe Point Road", suburb: "Glebe", price: 2450000, type: "house",
    beds: 4, baths: 2, parking: 1, landSize: 310, frontage: 9, status: "for-sale", score: 86,
    lat: -33.8775, lng: 151.1858, lmr: true, tod: false, todDistance: 350,
    insights: ["Inside LMR housing area", "Light rail 350m", "Main-road exposure", "Strong rental demand"],
    breakdown: { planningOpportunity: 88, marketDemand: 86, transportAccess: 78, riskScore: 25 },
    image: "/property-terrace-house.png", agent: agents.olivia,
    aiSummary: "Wide Glebe Point Road terrace inside the LMR housing area with strong rental depth.",
  }),
  listing({
    id: "g2", address: "27 Hereford Street", suburb: "Glebe", price: 1890000, type: "house",
    beds: 3, baths: 1, parking: 0, landSize: 180, frontage: 6, status: "for-sale", score: 78,
    lat: -33.8812, lng: 151.1836, lmr: true, tod: false, todDistance: 520,
    insights: ["Inside LMR housing area", "Narrow 6m frontage", "Heritage streetscape"],
    breakdown: { planningOpportunity: 72, marketDemand: 84, transportAccess: 70, riskScore: 35 },
    image: "/property-north-bondi-house.png", agent: agents.olivia,
    aiSummary: "Classic narrow-lot terrace; LMR controls apply but frontage limits redevelopment.",
  }),
  listing({
    id: "g3", address: "61 Wigram Road", suburb: "Glebe", price: 3350000, type: "house",
    beds: 5, baths: 3, parking: 2, landSize: 640, frontage: 21, status: "for-sale", score: 88,
    lat: -33.8791, lng: 151.178, lmr: true, tod: false, todDistance: 600,
    insights: ["Inside LMR housing area", "21m frontage", "Large 640m² lot", "Dual-occupancy potential"],
    breakdown: { planningOpportunity: 90, marketDemand: 82, transportAccess: 68, riskScore: 22 },
    image: "/property-beach-house.png", agent: agents.olivia,
    aiSummary: "Rare 21m-frontage Glebe holding; LMR controls support terraces or manor homes.",
  }),
  listing({
    id: "g4", address: "9 Toxteth Road", suburb: "Glebe", price: 4100000, type: "house",
    beds: 5, baths: 3, parking: 2, landSize: 720, frontage: 24, status: "under-offer", score: 84,
    lat: -33.883, lng: 151.1802, lmr: true, tod: false, todDistance: 750,
    insights: ["Inside LMR housing area", "24m frontage", "Under offer"],
    breakdown: { planningOpportunity: 86, marketDemand: 80, transportAccess: 62, riskScore: 30 },
    image: "/property-backyard.png", agent: agents.olivia,
    aiSummary: "Large-frontage site already under offer; track for a fall-through.",
  }),
  listing({
    id: "g5", address: "15 Mitchell Street", suburb: "Glebe", price: 1150000, type: "apartment",
    beds: 2, baths: 1, parking: 1, landSize: 0, frontage: 0, status: "for-sale", score: 70,
    lat: -33.8752, lng: 151.188, lmr: true, tod: false, todDistance: 280,
    insights: ["Strata apartment", "Light rail 280m", "No redevelopment upside"],
    breakdown: { planningOpportunity: 55, marketDemand: 80, transportAccess: 82, riskScore: 30 },
    image: "/property-apartment-bondi.png", agent: agents.olivia,
    aiSummary: "Solid rental apartment; planning reforms add little upside to strata stock.",
  }),
  listing({
    id: "g6", address: "88 Bridge Road", suburb: "Glebe", price: 6800000, type: "development",
    beds: 0, baths: 0, parking: 0, landSize: 980, frontage: 32, status: "for-sale", score: 90,
    lat: -33.8818, lng: 151.1885, lmr: true, tod: false, todDistance: 400,
    insights: ["Inside LMR housing area", "32m frontage", "Corner site", "Mid-rise potential"],
    breakdown: { planningOpportunity: 93, marketDemand: 84, transportAccess: 76, riskScore: 28 },
    image: "/property-mixed-use-site.png", agent: agents.olivia,
    aiSummary: "Corner development site with the widest frontage in Glebe; strong mid-rise case.",
  }),
  // Marrickville: m1–m4 inside the Marrickville Station TOD area
  listing({
    id: "m1", address: "212 Illawarra Road", suburb: "Marrickville", price: 5200000, type: "development",
    beds: 0, baths: 0, parking: 0, landSize: 860, frontage: 26, status: "for-sale", score: 94,
    lat: -33.9128, lng: 151.1546, lmr: true, tod: true, todDistance: 170,
    insights: ["Inside TOD area", "170m to Marrickville Station", "26m frontage", "Accelerated rezoning"],
    breakdown: { planningOpportunity: 96, marketDemand: 88, transportAccess: 95, riskScore: 20 },
    image: "/property-development-site.png", agent: agents.james,
    aiSummary: "Top-ranked TOD site: 26m frontage 170m from the station under accelerated rezoning.",
  }),
  listing({
    id: "m2", address: "14 Silver Street", suburb: "Marrickville", price: 2650000, type: "house",
    beds: 4, baths: 2, parking: 2, landSize: 560, frontage: 22, status: "for-sale", score: 91,
    lat: -33.9152, lng: 151.152, lmr: true, tod: true, todDistance: 190,
    insights: ["Inside TOD area", "190m to station", "22m frontage", "Amalgamation candidate"],
    breakdown: { planningOpportunity: 92, marketDemand: 86, transportAccess: 93, riskScore: 22 },
    image: "/property-terrace-house.png", agent: agents.james,
    aiSummary: "Wide-frontage house in the TOD core; strong amalgamation play with neighbours.",
  }),
  listing({
    id: "m3", address: "33 Leofrene Avenue", suburb: "Marrickville", price: 1980000, type: "house",
    beds: 3, baths: 1, parking: 1, landSize: 420, frontage: 12, status: "for-sale", score: 83,
    lat: -33.9158, lng: 151.1553, lmr: true, tod: true, todDistance: 260,
    insights: ["Inside TOD area", "260m to station", "12m frontage"],
    breakdown: { planningOpportunity: 84, marketDemand: 82, transportAccess: 90, riskScore: 26 },
    image: "/property-north-bondi-house.png", agent: agents.james,
    aiSummary: "TOD-located cottage; frontage is narrow for a standalone mid-rise.",
  }),
  listing({
    id: "m4", address: "5 Station Street", suburb: "Marrickville", price: 1720000, type: "house",
    beds: 3, baths: 2, parking: 1, landSize: 380, frontage: 20, status: "under-offer", score: 80,
    lat: -33.9131, lng: 151.1512, lmr: true, tod: true, todDistance: 230,
    insights: ["Inside TOD area", "20m frontage", "Under offer"],
    breakdown: { planningOpportunity: 85, marketDemand: 80, transportAccess: 92, riskScore: 30 },
    image: "/property-backyard.png", agent: agents.priya,
    aiSummary: "Good TOD frontage but already under offer.",
  }),
  listing({
    id: "m5", address: "120 Victoria Road", suburb: "Marrickville", price: 2100000, type: "house",
    beds: 4, baths: 2, parking: 2, landSize: 500, frontage: 18, status: "for-sale", score: 74,
    lat: -33.905, lng: 151.158, lmr: true, tod: false, todDistance: 1080,
    insights: ["Outside TOD area", "Inside LMR housing area", "18m frontage"],
    breakdown: { planningOpportunity: 74, marketDemand: 78, transportAccess: 60, riskScore: 30 },
    image: "/property-beach-house.png", agent: agents.james,
    aiSummary: "LMR-eligible family home beyond the TOD catchment.",
  }),
  listing({
    id: "m6", address: "47 Calvert Street", suburb: "Marrickville", price: 2300000, type: "house",
    beds: 4, baths: 2, parking: 1, landSize: 540, frontage: 25, status: "sold", score: 72,
    lat: -33.9085, lng: 151.16, lmr: true, tod: false, todDistance: 860,
    insights: ["Recently sold", "25m frontage", "Comparable sale"],
    breakdown: { planningOpportunity: 76, marketDemand: 74, transportAccess: 62, riskScore: 32 },
    image: "/property-terrace-house.png", agent: agents.james,
    aiSummary: "Recent sale; useful comparable for frontage-driven pricing.",
  }),
  // Dulwich Hill
  listing({
    id: "d1", address: "18 Wardell Road", suburb: "Dulwich Hill", price: 2380000, type: "house",
    beds: 4, baths: 2, parking: 1, landSize: 520, frontage: 23, status: "for-sale", score: 87,
    lat: -33.9102, lng: 151.1418, lmr: true, tod: true, todDistance: 120,
    insights: ["Inside TOD area", "120m to Dulwich Hill Station", "23m frontage"],
    breakdown: { planningOpportunity: 89, marketDemand: 83, transportAccess: 94, riskScore: 24 },
    image: "/property-north-bondi-house.png", agent: agents.priya,
    aiSummary: "Station-adjacent TOD site with workable frontage for terraces or mid-rise.",
  }),
  listing({
    id: "d2", address: "6 Ewart Street", suburb: "Dulwich Hill", price: 1850000, type: "house",
    beds: 3, baths: 1, parking: 1, landSize: 410, frontage: 15, status: "for-sale", score: 76,
    lat: -33.9068, lng: 151.136, lmr: true, tod: false, todDistance: 650,
    insights: ["Outside TOD area", "Inside LMR housing area", "15m frontage"],
    breakdown: { planningOpportunity: 75, marketDemand: 80, transportAccess: 72, riskScore: 28 },
    image: "/property-backyard.png", agent: agents.priya,
    aiSummary: "LMR-eligible house just outside the TOD catchment.",
  }),
]

// LMR and TOD come from the live NSW layer; these remaining overlays are modelled demo data.
export const planningZones: PlanningZone[] = [
  {
    id: "dev1",
    layer: "development",
    name: "Bridge Road uplift (modelled)",
    polygon: [
      [-33.8808, 151.1868],
      [-33.8805, 151.1902],
      [-33.8832, 151.1906],
      [-33.8835, 151.187],
    ],
  },
  {
    id: "dev2",
    layer: "development",
    name: "Illawarra Road uplift (modelled)",
    polygon: [
      [-33.912, 151.1535],
      [-33.9118, 151.1558],
      [-33.9138, 151.156],
      [-33.914, 151.1537],
    ],
  },
  {
    id: "con1",
    layer: "constraints",
    name: "Glebe heritage conservation (modelled)",
    polygon: [
      [-33.8795, 151.1825],
      [-33.879, 151.1855],
      [-33.882, 151.186],
      [-33.8825, 151.183],
    ],
  },
]
```

```ts
export const layerMeta: LayerMeta[] = [
  { id: "listings", label: "Property Listings", color: "var(--primary)", description: "Demo listings" },
  { id: "lmr", label: "Low & Mid-Rise Housing", color: "var(--success)", description: "NSW Indicative LMR Housing Area (live)" },
  { id: "tod", label: "Transport Oriented Development", color: "var(--primary)", description: "NSW TOD areas incl. accelerated rezoning (live)" },
  { id: "development", label: "Development Opportunities", color: "var(--ai)", description: "Modelled uplift sites (demo)" },
  { id: "constraints", label: "Planning Constraints", color: "var(--warning)", description: "Heritage & environmental limits (demo)" },
]

export const suggestedPrompts = [
  "Which suburbs have TOD areas?",
  "Find properties with LMR upside",
  "Compare Glebe and Marrickville",
  "Which sites have 20m+ frontage?",
]

export const exampleSearches = [
  "Properties for sale in Glebe in the TOD area",
  "Marrickville TOD with 20m frontage",
  "Find properties with LMR potential",
]

export const alerts: AlertItem[] = [
  {
    id: "a1",
    title: "Notify me when listings appear inside TOD areas",
    description: "Alert when a new listing falls inside a NSW Transport Oriented Development area.",
    category: "zoning",
    active: true,
    frequency: "Real-time",
    lastTriggered: "3 hours ago",
  },
  {
    id: "a2",
    title: "Notify me when 20m+ frontage sites list in Glebe",
    description: "Track wide-frontage listings inside the Glebe LMR housing area.",
    category: "listing",
    active: true,
    frequency: "Daily digest",
    lastTriggered: "Today, 8:00 AM",
  },
  {
    id: "a3",
    title: "Notify me when council planning changes occur",
    description: "Monitor Inner West Council planning proposals and DA determinations.",
    category: "planning",
    active: false,
    frequency: "Weekly",
    lastTriggered: "6 days ago",
  },
  {
    id: "a4",
    title: "Notify me when TOD rezonings are finalised",
    description: "Alerts when accelerated TOD rezonings are gazetted around Inner West stations.",
    category: "zoning",
    active: true,
    frequency: "Real-time",
    lastTriggered: "Yesterday",
  },
]

export function aiReply(question: string): string {
  const q = question.toLowerCase()
  if (q.includes("interesting") || q.includes("why")) {
    return "This property sits inside the NSW Indicative Low and Mid-Rise Housing Area, so planning controls now allow terraces, townhouses and manor homes where they were previously restricted. Inside a TOD area, accelerated rezoning adds further height and FSR uplift near the station."
  }
  if (q.includes("tod") || q.includes("transport")) {
    return "Glebe has no TOD area under the current NSW program. The nearest TOD areas are around Marrickville and Dulwich Hill stations. In Marrickville, 212 Illawarra Road (score 94, 26m frontage) and 14 Silver Street (score 91, 22m frontage) are for sale inside the TOD area."
  }
  if (q.includes("frontage")) {
    return "Sites with 20m+ frontage that are for sale now: 212 Illawarra Road and 14 Silver Street (Marrickville, inside TOD), 18 Wardell Road (Dulwich Hill, inside TOD), and 61 Wigram Road and 88 Bridge Road (Glebe, LMR only)."
  }
  if (q.includes("lmr") || q.includes("upside")) {
    return "All six Glebe listings sit inside the Indicative LMR Housing Area. The strongest upside is 88 Bridge Road (score 90, 32m corner frontage) and 61 Wigram Road (score 88, 21m frontage on a 640m² lot)."
  }
  if (q.includes("compare") || q.includes("subur")) {
    return "Glebe is fully inside the LMR housing area but has no TOD area, so uplift is limited to low and mid-rise forms. Marrickville combines LMR coverage with a TOD area around the station, which supports higher density on wide-frontage sites."
  }
  if (q.includes("zoning") || q.includes("explain")) {
    return "LMR reforms permit low and mid-rise housing (terraces, townhouses and manor homes, and mid-rise near centres) in identified areas. TOD areas within ~400m of selected stations receive accelerated rezoning with higher height and FSR controls."
  }
  return "Based on current NSW planning data, the strongest opportunities combine a TOD location with 20m+ frontage. Ask me about TOD areas, LMR upside, frontage, or how Glebe and Marrickville compare."
}
```

- [ ] **Step 5: Run the tests and the type check**

Run: `pnpm test`
Expected: all tests in `search.test.ts`, `mock-data.test.ts` and `format.test.ts` PASS.

Run: `pnpm exec tsc --noEmit`
Expected: no errors. If `lib/store.tsx` complains about the savedIds seed, leave it; Task 3 rewrites that file.

- [ ] **Step 6: Commit Tasks 1 and 2 together**

```bash
git add package.json tsconfig.json lib/types.ts lib/search.ts lib/search.test.ts lib/mock-data.ts lib/mock-data.test.ts lib/format.ts lib/format.test.ts
git commit -m "feat: Inner West demo data, search filters, node test harness"
```

---

### Task 3: Store: filters, fly-to, auth, contract requests, persistence

**Files:**
- Create: `lib/persist.ts`
- Test: `lib/persist.test.ts`
- Modify: `lib/store.tsx` (full rewrite below)

**Interfaces:**
- Consumes: `Filters`, `defaultFilters`, `filterProperties` (Task 1); `properties`, `suburbs`, `DEMO_USER`, `aiReply` (Task 2).
- Produces:
  - `loadJSON<T>(key: string, fallback: T): T` and `saveJSON(key: string, value: unknown): void`
  - New `useN3X7()` fields:
    - `filters: Filters`, `setFilters(patch: Partial<Filters>): void`, `filteredProperties: Property[]`
    - `flyTarget: FlyTarget | null`, where `FlyTarget = { center: [number, number]; zoom: number; key: number }`
    - `contractRequests: Record<string, ContractRequest>`, `requestContract(id: string, message: string): Promise<void>`
    - `user: DemoUser | null`, `hydrated: boolean`, `signIn(email: string): void`, `signOut(): void`
  - All existing fields stay unchanged.

- [ ] **Step 1: Write the failing persistence tests**

Create `lib/persist.test.ts`:

```ts
import { afterEach, test } from "node:test"
import assert from "node:assert/strict"
import { loadJSON, saveJSON } from "./persist.ts"

function installStorage(impl: Partial<Storage> | undefined) {
  Object.defineProperty(globalThis, "localStorage", { value: impl, configurable: true, writable: true })
}

function memoryStorage(): Storage {
  const m = new Map<string, string>()
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
    key: () => null,
    get length() { return m.size },
  }
}

afterEach(() => installStorage(undefined))

test("returns fallback when storage is missing", () => {
  installStorage(undefined)
  assert.deepEqual(loadJSON("k", ["x"]), ["x"])
  saveJSON("k", [1]) // must not throw
})

test("round-trips values and removes on null", () => {
  installStorage(memoryStorage())
  saveJSON("k", { a: 1 })
  assert.deepEqual(loadJSON("k", null), { a: 1 })
  saveJSON("k", null)
  assert.equal(loadJSON("k", "fallback"), "fallback")
})

test("corrupt JSON falls back", () => {
  const s = memoryStorage()
  s.setItem("k", "{not json")
  installStorage(s)
  assert.equal(loadJSON("k", 7), 7)
})

test("throwing storage (private mode) never throws", () => {
  installStorage({
    getItem: () => { throw new Error("denied") },
    setItem: () => { throw new Error("denied") },
    removeItem: () => { throw new Error("denied") },
  })
  assert.equal(loadJSON("k", 1), 1)
  assert.doesNotThrow(() => saveJSON("k", 2))
  assert.doesNotThrow(() => saveJSON("k", null))
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test`
Expected: FAIL, because `Cannot find module '.../lib/persist.ts'`.

- [ ] **Step 3: Implement `lib/persist.ts`**

```ts
/** localStorage helpers that never throw (private mode, blocked storage, SSR). */
export function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = globalThis.localStorage?.getItem(key)
    return raw == null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

export function saveJSON(key: string, value: unknown): void {
  try {
    if (value === null) globalThis.localStorage?.removeItem(key)
    else globalThis.localStorage?.setItem(key, JSON.stringify(value))
  } catch {
    // Storage unavailable: state stays in memory only.
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test`
Expected: all `persist.test.ts` tests PASS, and the earlier tests still PASS.

- [ ] **Step 5: Rewrite `lib/store.tsx`**

Replace the whole file with:

```tsx
"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { properties as allProperties, suburbs, DEMO_USER, aiReply } from "./mock-data"
import type {
  ChatMessage,
  ContractRequest,
  DemoUser,
  LayerId,
  Property,
} from "./types"
import { defaultFilters, filterProperties, type Filters } from "./search"
import { loadJSON, saveJSON } from "./persist"

export interface FlyTarget {
  center: [number, number]
  zoom: number
  key: number
}

interface N3X7State {
  properties: Property[]
  savedIds: string[]
  isSaved: (id: string) => boolean
  toggleSave: (id: string) => void
  selectedId: string | null
  selectedProperty: Property | null
  setSelectedId: (id: string | null) => void
  drawerOpen: boolean
  openProperty: (id: string) => void
  closeDrawer: () => void
  layers: Record<LayerId, boolean>
  toggleLayer: (id: LayerId) => void
  query: string
  setQuery: (q: string) => void
  chat: ChatMessage[]
  askAi: (question: string) => void
  aiContextId: string | null
  setAiContextId: (id: string | null) => void
  filters: Filters
  setFilters: (patch: Partial<Filters>) => void
  filteredProperties: Property[]
  flyTarget: FlyTarget | null
  contractRequests: Record<string, ContractRequest>
  requestContract: (id: string, message: string) => Promise<void>
  user: DemoUser | null
  hydrated: boolean
  signIn: (email: string) => void
  signOut: () => void
}

const N3X7Context = createContext<N3X7State | null>(null)

const KEYS = {
  user: "n3x7.user",
  saved: "n3x7.saved",
  contracts: "n3x7.contracts",
}

let msgCounter = 0

export function N3X7Provider({ children }: { children: ReactNode }) {
  const [hydrated, setHydrated] = useState(false)
  const [user, setUser] = useState<DemoUser | null>(null)
  const [savedIds, setSavedIds] = useState<string[]>([])
  const [contractRequests, setContractRequests] = useState<
    Record<string, ContractRequest>
  >({})
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [aiContextId, setAiContextId] = useState<string | null>(null)
  const [filters, setFiltersState] = useState<Filters>(defaultFilters)
  const [flyTarget, setFlyTarget] = useState<FlyTarget | null>(null)
  const [layers, setLayers] = useState<Record<LayerId, boolean>>({
    listings: true,
    lmr: true,
    tod: true,
    development: false,
    constraints: false,
  })
  const [chat, setChat] = useState<ChatMessage[]>([
    {
      id: "seed-1",
      role: "assistant",
      content:
        "Hi, I'm N3X7 — your AI property analyst. Ask me about TOD areas, LMR upside, frontage, or how suburbs compare. Select a property to give me more context.",
    },
  ])

  // Restore demo session after mount (localStorage is browser-only).
  useEffect(() => {
    setUser(loadJSON<DemoUser | null>(KEYS.user, null))
    setSavedIds(loadJSON<string[]>(KEYS.saved, []))
    setContractRequests(loadJSON<Record<string, ContractRequest>>(KEYS.contracts, {}))
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (hydrated) saveJSON(KEYS.user, user)
  }, [hydrated, user])
  useEffect(() => {
    if (hydrated) saveJSON(KEYS.saved, savedIds)
  }, [hydrated, savedIds])
  useEffect(() => {
    if (hydrated) saveJSON(KEYS.contracts, contractRequests)
  }, [hydrated, contractRequests])

  const toggleSave = useCallback((id: string) => {
    setSavedIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    )
  }, [])

  const toggleLayer = useCallback((id: LayerId) => {
    setLayers((prev) => ({ ...prev, [id]: !prev[id] }))
  }, [])

  const openProperty = useCallback((id: string) => {
    setSelectedId(id)
    setDrawerOpen(true)
  }, [])

  const closeDrawer = useCallback(() => setDrawerOpen(false), [])

  const setFilters = useCallback((patch: Partial<Filters>) => {
    setFiltersState((prev) => ({ ...prev, ...patch }))
    if (patch.suburb) {
      const s = suburbs.find((x) => x.name === patch.suburb)
      if (s) setFlyTarget({ center: s.center, zoom: 15, key: Date.now() })
    }
  }, [])

  const requestContract = useCallback(async (id: string, message: string) => {
    await new Promise((r) => setTimeout(r, 800))
    setContractRequests((prev) => ({
      ...prev,
      [id]: { requestedAt: new Date().toISOString(), message },
    }))
    setSavedIds((prev) => (prev.includes(id) ? prev : [...prev, id]))
  }, [])

  const signIn = useCallback((email: string) => {
    setUser({
      email,
      name: email === DEMO_USER.email ? DEMO_USER.name : email.split("@")[0],
      role: DEMO_USER.role,
    })
  }, [])

  const signOut = useCallback(() => {
    setDrawerOpen(false)
    setUser(null)
  }, [])

  const askAi = useCallback((question: string) => {
    const q = question.trim()
    if (!q) return
    const userMsg: ChatMessage = {
      id: `u-${msgCounter++}`,
      role: "user",
      content: q,
    }
    setChat((prev) => [...prev, userMsg])
    const reply = aiReply(q)
    setTimeout(() => {
      setChat((prev) => [
        ...prev,
        { id: `a-${msgCounter++}`, role: "assistant", content: reply },
      ])
    }, 550)
  }, [])

  const selectedProperty = useMemo(
    () => allProperties.find((p) => p.id === selectedId) ?? null,
    [selectedId],
  )

  const filteredProperties = useMemo(
    () => filterProperties(allProperties, filters),
    [filters],
  )

  const value = useMemo<N3X7State>(
    () => ({
      properties: allProperties,
      savedIds,
      isSaved: (id: string) => savedIds.includes(id),
      toggleSave,
      selectedId,
      selectedProperty,
      setSelectedId,
      drawerOpen,
      openProperty,
      closeDrawer,
      layers,
      toggleLayer,
      query,
      setQuery,
      chat,
      askAi,
      aiContextId,
      setAiContextId,
      filters,
      setFilters,
      filteredProperties,
      flyTarget,
      contractRequests,
      requestContract,
      user,
      hydrated,
      signIn,
      signOut,
    }),
    [
      savedIds,
      toggleSave,
      selectedId,
      selectedProperty,
      drawerOpen,
      openProperty,
      closeDrawer,
      layers,
      toggleLayer,
      query,
      chat,
      askAi,
      aiContextId,
      filters,
      setFilters,
      filteredProperties,
      flyTarget,
      contractRequests,
      requestContract,
      user,
      hydrated,
      signIn,
      signOut,
    ],
  )

  return <N3X7Context.Provider value={value}>{children}</N3X7Context.Provider>
}

export function useN3X7() {
  const ctx = useContext(N3X7Context)
  if (!ctx) throw new Error("useN3X7 must be used within N3X7Provider")
  return ctx
}
```

- [ ] **Step 6: Run the type check and tests**

Run: `pnpm exec tsc --noEmit && pnpm test`
Expected: no type errors, and all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/persist.ts lib/persist.test.ts lib/store.tsx
git commit -m "feat: store filters, fly-to, demo auth, contract requests with persistence"
```

---

### Task 4: Search and filter UI wired to the map

**Files:**
- Modify: `components/search-bar.tsx` (the `submit` function and imports)
- Modify: `components/discovery-panel.tsx` (full rewrite)
- Modify: `components/property-map.tsx` (`MapController`, the markers source)

**Interfaces:**
- Consumes: `filters`, `setFilters`, `filteredProperties`, `flyTarget` (Task 3); `parseSearch`, `defaultFilters`, `frontageOptions`, `nearbyTodSuburbs`, `showsNoTodNotice` (Task 1); `suburbs` (Task 2).
- Produces: no new exports.

- [ ] **Step 1: Route suburb searches to the filters in `components/search-bar.tsx`**

Replace the imports and `submit` with:

```tsx
import { useRef, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { ArrowUpRight, Search, Sparkles } from "lucide-react"
import { useN3X7 } from "@/lib/store"
import { exampleSearches, suburbs } from "@/lib/mock-data"
import { parseSearch } from "@/lib/search"
import { cn } from "@/lib/utils"
```

```tsx
  const { query, setQuery, askAi, setFilters } = useN3X7()
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const pathname = usePathname()
  const wrapRef = useRef<HTMLDivElement>(null)

  function submit(value: string) {
    const q = value.trim()
    if (!q) return
    setQuery(q)
    setOpen(false)
    // Searches naming a known suburb drive the Discover filters
    const patch = parseSearch(q, suburbs)
    if (patch) {
      setFilters(patch)
      if (pathname !== "/") router.push("/")
      return
    }
    // Natural-language questions route to the AI analyst
    if (/\b(find|show|ask|why|compare|explain|under|potential|growth)\b/i.test(q)) {
      askAi(q)
      router.push("/analyst")
    }
  }
```

- [ ] **Step 2: Rewrite `components/discovery-panel.tsx`**

```tsx
"use client"

import { useMemo, useState } from "react"
import { Info, TrainFront, TrendingUp, X } from "lucide-react"
import { useN3X7 } from "@/lib/store"
import { suburbs } from "@/lib/mock-data"
import {
  defaultFilters,
  frontageOptions,
  nearbyTodSuburbs,
  showsNoTodNotice,
} from "@/lib/search"
import { PropertyCard } from "./property-card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

type Chip = "all" | "high" | "lmr"

const chips: { id: Chip; label: string }[] = [
  { id: "all", label: "All" },
  { id: "high", label: "High Potential" },
  { id: "lmr", label: "LMR" },
]

function Toggle({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
        active
          ? "border-primary/60 bg-primary/15 text-foreground"
          : "border-border text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  )
}

export function DiscoveryPanel() {
  const { filteredProperties, filters, setFilters } = useN3X7()
  const [chip, setChip] = useState<Chip>("all")

  const list = useMemo(() => {
    const filtered = filteredProperties.filter((p) => {
      if (chip === "high") return p.opportunity === "HIGH POTENTIAL"
      if (chip === "lmr") return p.lmr
      return true
    })
    return [...filtered].sort((a, b) => b.score - a.score)
  }, [filteredProperties, chip])

  const noTod = showsNoTodNotice(filters, suburbs)
  const alternatives = filters.suburb ? nearbyTodSuburbs(filters.suburb, suburbs) : []
  const frontageChoices = frontageOptions.includes(filters.minFrontage)
    ? frontageOptions
    : [...frontageOptions, filters.minFrontage].sort((a, b) => a - b)

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="shrink-0 space-y-3 border-b border-border px-4 py-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-foreground">
              Property Discovery
            </h2>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <TrendingUp className="size-3.5 text-success" />
              {list.length} listings in {filters.suburb ?? "the Inner West"}
            </p>
          </div>
          <span className="rounded-md border border-border px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
            Demo listings
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {filters.suburb && (
            <span className="flex items-center gap-1 rounded-lg bg-secondary px-2.5 py-1.5 text-xs font-medium text-foreground">
              {filters.suburb}
              <button
                onClick={() => setFilters({ suburb: null })}
                aria-label={`Clear ${filters.suburb}`}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </span>
          )}
          <Toggle
            active={filters.todOnly}
            onClick={() => setFilters({ todOnly: !filters.todOnly })}
          >
            <TrainFront className="size-3.5" />
            In TOD area
          </Toggle>
          <Toggle
            active={filters.forSaleOnly}
            onClick={() => setFilters({ forSaleOnly: !filters.forSaleOnly })}
          >
            For sale now
          </Toggle>
          <label className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs text-muted-foreground">
            Frontage
            <select
              value={filters.minFrontage}
              onChange={(e) => setFilters({ minFrontage: Number(e.target.value) })}
              className="bg-transparent py-0.5 font-medium text-foreground outline-none"
              aria-label="Minimum frontage"
            >
              {frontageChoices.map((n) => (
                <option key={n} value={n} className="bg-popover">
                  {n === 0 ? "Any" : `${n} m+`}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex gap-1.5">
          {chips.map((f) => (
            <button
              key={f.id}
              onClick={() => setChip(f.id)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                chip === f.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 p-4">
          {noTod ? (
            <div className="glass space-y-3 rounded-2xl p-4">
              <p className="flex items-start gap-2 text-sm text-foreground">
                <Info className="mt-0.5 size-4 shrink-0 text-primary" />
                {filters.suburb} has no TOD area under current NSW planning.
              </p>
              <p className="text-xs text-muted-foreground">
                Nearby suburbs with TOD areas:
              </p>
              <div className="flex flex-wrap gap-2">
                {alternatives.map((s) => (
                  <button
                    key={s.name}
                    onClick={() => setFilters({ suburb: s.name })}
                    className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/85"
                  >
                    <TrainFront className="size-3.5" />
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
          ) : list.length === 0 ? (
            <div className="glass space-y-3 rounded-2xl p-4 text-center">
              <p className="text-sm text-foreground">No listings match these filters.</p>
              <button
                onClick={() => {
                  setFilters({ ...defaultFilters, suburb: filters.suburb })
                  setChip("all")
                }}
                className="text-xs font-medium text-primary hover:underline"
              >
                Clear filters
              </button>
            </div>
          ) : (
            list.map((p) => <PropertyCard key={p.id} property={p} />)
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
```

- [ ] **Step 3: Make the map follow the filters in `components/property-map.tsx`**

In `MapController`, replace `const { selectedId } = useN3X7()` with `const { selectedId, flyTarget } = useN3X7()`. Then add this effect after the existing `selectedId` effect:

```tsx
  useEffect(() => {
    if (flyTarget) map.flyTo(flyTarget.center, flyTarget.zoom, { duration: 0.9 })
  }, [map, flyTarget])
```

In `PropertyMap`, replace `const { layers, openProperty, selectedId } = useN3X7()` with:

```tsx
  const { layers, openProperty, selectedId, filteredProperties } = useN3X7()
```

Then change the markers loop from `properties.map((p) => (` to `filteredProperties.map((p) => (`. Keep the module-level `properties` import, because `MapController` still uses it for `selectedId` fly-to.

- [ ] **Step 4: Type check and tests**

Run: `pnpm exec tsc --noEmit && pnpm test`
Expected: no type errors, and all tests PASS.

- [ ] **Step 5: Manual check in the browser**

The dev server is already running on http://localhost:3002. If it isn't, run `pnpm dev` and use the port it prints. The login gate doesn't exist yet, so `/` opens directly.

1. Type `Properties for sale in Glebe in the TOD area` and press Enter. Expect the Glebe chip, In TOD area and For sale now to be active, the TOD notice to show with Marrickville and Dulwich Hill buttons, and the map to stay on Glebe.
2. Click **Marrickville**. Expect the map to fly to Marrickville and the list to show 212 Illawarra Road, 14 Silver Street and 33 Leofrene Avenue (TOD + for sale).
3. Set Frontage to 20 m+. Expect 212 Illawarra Road and 14 Silver Street only. The markers should match the list.
4. Turn off In TOD area, search `Dulwich Hill`, and set Frontage to 25 m+. The listings there have 23 m and 15 m frontage, so expect the generic "No listings match these filters" with Clear filters and **not** the TOD notice (Review Focus 2). Clicking Clear filters should bring back both Dulwich Hill listings.

- [ ] **Step 6: Commit**

```bash
git add components/search-bar.tsx components/discovery-panel.tsx components/property-map.tsx
git commit -m "feat: suburb/TOD/frontage/for-sale filters with TOD-suggestion empty state"
```

---

### Task 5: Live NSW LMR/TOD overlay

**Files:**
- Create: `lib/arcgis.ts`
- Test: `lib/arcgis.test.ts`
- Create: `components/planning-overlay.tsx`
- Modify: `components/property-map.tsx` (colours, legend, overlay mount)
- Modify: `components/layer-controls.tsx` (swatch colours)

**Interfaces:**
- Consumes: `layers` from the store.
- Produces:
  - `LMR_MAPSERVER: string`
  - `planningLayerIds(on: { lmr: boolean; tod: boolean }): number[]`
  - `buildExportUrl(bbox: BBox, width: number, height: number, layerIds: number[]): string`, where `BBox = { west; south; east; north }`
  - `<PlanningOverlay onStatus={(s: "ok" | "error") => void} />`

- [ ] **Step 1: Write the failing tests**

Create `lib/arcgis.test.ts`:

```ts
import { test } from "node:test"
import assert from "node:assert/strict"
import { buildExportUrl, LMR_MAPSERVER, planningLayerIds } from "./arcgis.ts"

test("planningLayerIds maps toggles to NSW layer ids", () => {
  assert.deepEqual(planningLayerIds({ lmr: true, tod: true }), [4, 2, 3])
  assert.deepEqual(planningLayerIds({ lmr: true, tod: false }), [4])
  assert.deepEqual(planningLayerIds({ lmr: false, tod: true }), [2, 3])
  assert.deepEqual(planningLayerIds({ lmr: false, tod: false }), [])
})

test("buildExportUrl builds a transparent web-mercator export request", () => {
  const url = new URL(
    buildExportUrl({ west: 151.17, south: -33.89, east: 151.196, north: -33.872 }, 800.4, 600, [4, 2, 3]),
  )
  assert.equal(`${url.origin}${url.pathname}`, `${LMR_MAPSERVER}/export`)
  const q = url.searchParams
  assert.equal(q.get("bbox"), "151.17,-33.89,151.196,-33.872")
  assert.equal(q.get("bboxSR"), "4326")
  assert.equal(q.get("imageSR"), "3857")
  assert.equal(q.get("size"), "800,600")
  assert.equal(q.get("format"), "png32")
  assert.equal(q.get("transparent"), "true")
  assert.equal(q.get("layers"), "show:4,2,3")
  assert.equal(q.get("f"), "image")
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test`
Expected: FAIL, because `Cannot find module '.../lib/arcgis.ts'`.

- [ ] **Step 3: Implement `lib/arcgis.ts`**

```ts
// NSW DPHI Low & Mid-Rise / TOD map service. Only `export` is enabled (no `query`).
export const LMR_MAPSERVER =
  "https://spatialportalarcgis.dpie.nsw.gov.au/sarcgis/rest/services/LMR/LMR/MapServer"

export interface BBox {
  west: number
  south: number
  east: number
  north: number
}

/** lmr → Indicative LMR Housing Area (4); tod → TOD Accelerated Rezoning (2) + TOD Area (3). */
export function planningLayerIds(on: { lmr: boolean; tod: boolean }): number[] {
  return [...(on.lmr ? [4] : []), ...(on.tod ? [2, 3] : [])]
}

export function buildExportUrl(
  bbox: BBox,
  width: number,
  height: number,
  layerIds: number[],
): string {
  const params = new URLSearchParams({
    bbox: [bbox.west, bbox.south, bbox.east, bbox.north].join(","),
    bboxSR: "4326",
    imageSR: "3857",
    size: `${Math.round(width)},${Math.round(height)}`,
    format: "png32",
    transparent: "true",
    layers: `show:${layerIds.join(",")}`,
    f: "image",
  })
  return `${LMR_MAPSERVER}/export?${params}`
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test`
Expected: all tests PASS.

- [ ] **Step 5: Create `components/planning-overlay.tsx` and mount it**

```tsx
"use client"

import { useEffect, useState } from "react"
import { ImageOverlay, useMap, useMapEvents } from "react-leaflet"
import type { LatLngBoundsExpression, Map as LeafletMap } from "leaflet"
import { buildExportUrl, planningLayerIds } from "@/lib/arcgis"
import { useN3X7 } from "@/lib/store"

interface View {
  url: string
  bounds: LatLngBoundsExpression
}

function viewFor(map: LeafletMap, ids: number[]): View | null {
  const size = map.getSize()
  if (ids.length === 0 || size.x === 0 || size.y === 0) return null
  const b = map.getBounds()
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  return {
    url: buildExportUrl(
      { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() },
      Math.min(size.x * dpr, 4096),
      Math.min(size.y * dpr, 4096),
      ids,
    ),
    bounds: [
      [b.getSouth(), b.getWest()],
      [b.getNorth(), b.getEast()],
    ],
  }
}

/** Live NSW LMR/TOD layers rendered from the ArcGIS export endpoint for the current view. */
export function PlanningOverlay({
  onStatus,
}: {
  onStatus: (status: "ok" | "error") => void
}) {
  const map = useMap()
  const { layers } = useN3X7()
  const ids = planningLayerIds({ lmr: layers.lmr, tod: layers.tod })
  const idsKey = ids.join(",")
  const [view, setView] = useState<View | null>(null)

  useEffect(() => {
    setView(viewFor(map, ids))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, idsKey])

  useMapEvents({
    moveend: () => setView(viewFor(map, ids)),
    resize: () => setView(viewFor(map, ids)),
  })

  if (!view) return null
  return (
    <ImageOverlay
      url={view.url}
      bounds={view.bounds}
      opacity={0.55}
      zIndex={250}
      eventHandlers={{
        load: () => onStatus("ok"),
        error: () => onStatus("error"),
      }}
    />
  )
}
```

In `components/property-map.tsx`:

1. Add the import `import { PlanningOverlay } from "./planning-overlay"`.
2. Change `layerColors` so `lmr: "#f2c98a"` and `tod: "#c39bd3"`. Leave the others as they are.
3. Change the `MapLegend` signature to `function MapLegend({ overlayStatus }: { overlayStatus: "loading" | "ok" | "error" })`, and insert this after the `</ul>` inside the expanded legend:

```tsx
          {(layers.lmr || layers.tod) && (
            <p
              className={cn(
                "mt-2 border-t border-border pt-2 text-[10px]",
                overlayStatus === "error" ? "text-warning" : "text-muted-foreground",
              )}
            >
              {overlayStatus === "error"
                ? "Live NSW layer unavailable — showing listings only"
                : "LMR / TOD source: NSW DPHI ArcGIS (live)"}
            </p>
          )}
```

   Also add `import { cn } from "@/lib/utils"` at the top if it is not already there.
4. In `PropertyMap`, add `const [overlayStatus, setOverlayStatus] = useState<"loading" | "ok" | "error">("loading")`. Render `<PlanningOverlay onStatus={setOverlayStatus} />` right after `<TileLayer … />`, and change `<MapLegend />` to `<MapLegend overlayStatus={overlayStatus} />`.

In `components/layer-controls.tsx`, change `swatch` so `lmr: "#f2c98a"` and `tod: "#c39bd3"`.

- [ ] **Step 6: Type check, then a manual check including failure**

Run: `pnpm exec tsc --noEmit && pnpm test`
Expected: no type errors, and all tests PASS.

In the browser:

1. At Glebe, a tan LMR overlay should cover most of Glebe, with no purple TOD. The legend should read "source: NSW DPHI ArcGIS (live)".
2. Search Marrickville. A purple TOD overlay should appear around the station, and the TOD-flagged markers (m1–m4) should sit on it while m5/m6 sit off it. If a TOD marker sits clearly outside the purple area, nudge its `lat`/`lng` towards the station in `lib/mock-data.ts`. Keep within 300 m of the `todAreas` centre so the tests still pass, and re-run `pnpm test`.
3. Pan and zoom. The overlay should re-render aligned to the streets.
4. Toggle the LMR and TOD layers in Intelligence Layers. The overlay should update or disappear.
5. Failure check (Review Focus 3): in DevTools → Network, block the request domain `spatialportalarcgis.dpie.nsw.gov.au` and pan. The legend should show "Live NSW layer unavailable", and the markers and filters should still work. Then unblock it.

- [ ] **Step 7: Commit**

```bash
git add lib/arcgis.ts lib/arcgis.test.ts components/planning-overlay.tsx components/property-map.tsx components/layer-controls.tsx
git commit -m "feat: live NSW LMR/TOD overlay from ArcGIS export with graceful fallback"
```

---

### Task 6: Property details, request contract, saved status

**Files:**
- Create: `components/contract-request.tsx`
- Modify: `components/property-drawer.tsx`
- Modify: `components/property-card.tsx`
- Modify: `app/saved/page.tsx`

**Interfaces:**
- Consumes: `user`, `contractRequests`, `requestContract` (Task 3); `statusLabel`, `formatRelative` (Task 2).
- Produces: `<ContractRequestPanel property={Property} />`

- [ ] **Step 1: Create `components/contract-request.tsx`**

```tsx
"use client"

import { useState } from "react"
import { CheckCircle2, FileText, Loader2, Mail, Phone } from "lucide-react"
import type { Property } from "@/lib/types"
import { useN3X7 } from "@/lib/store"
import { formatRelative } from "@/lib/format"
import { Button } from "@/components/ui/button"

export function ContractRequestPanel({ property: p }: { property: Property }) {
  const { user, contractRequests, requestContract } = useN3X7()
  const request = contractRequests[p.id]
  const [open, setOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState(
    `Hi ${p.agent.name.split(" ")[0]}, please send through the contract of sale for ${p.address}, ${p.suburb}. Thanks, ${user?.name ?? ""}`,
  )

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSending(true)
    await requestContract(p.id, message)
    setSending(false)
    setOpen(false)
  }

  return (
    <div>
      <h3 className="mb-2.5 text-sm font-semibold text-foreground">Selling agent</h3>
      <div className="glass rounded-xl p-3">
        <p className="text-sm font-medium text-foreground">{p.agent.name}</p>
        <p className="text-xs text-muted-foreground">{p.agent.agency}</p>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Phone className="size-3" /> {p.agent.phone}
          </span>
          <span className="flex items-center gap-1">
            <Mail className="size-3" /> {p.agent.email}
          </span>
        </div>
      </div>

      {request ? (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-success/30 bg-success/10 p-3 text-xs text-foreground">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
          <span>
            Contract requested from {p.agent.name} ·{" "}
            {formatRelative(request.requestedAt)}. Saved to your watchlist.
          </span>
        </div>
      ) : open ? (
        <form onSubmit={submit} className="mt-3 space-y-2.5">
          <p className="text-xs text-muted-foreground">
            To <span className="text-foreground">{p.agent.email}</span> · from{" "}
            <span className="text-foreground">{user?.email}</span>
          </p>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            aria-label="Message to agent"
            className="w-full resize-none rounded-lg border border-border bg-card/60 p-2.5 text-sm text-foreground outline-none focus:border-primary/60"
          />
          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={sending}
            >
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={sending}>
              {sending ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
              {sending ? "Sending…" : "Send request"}
            </Button>
          </div>
        </form>
      ) : (
        <Button
          variant="outline"
          className="mt-3 w-full"
          onClick={() => setOpen(true)}
          disabled={p.status === "sold"}
        >
          <FileText className="size-4" />
          {p.status === "sold" ? "Sold — contract unavailable" : "Request contract"}
        </Button>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Update `components/property-drawer.tsx`**

1. Imports:
   - Add `Ruler` to the lucide import and drop `Car`.
   - Add `import { formatPrice, opportunityStyle, statusLabel, typeLabel } from "@/lib/format"`, replacing the existing format import.
   - Add `import { ContractRequestPanel } from "./contract-request"`.
2. Directly after the price `<p className="mt-2 font-mono text-2xl …">…</p>`, add:

```tsx
                  <span
                    className={cn(
                      "mt-1.5 inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium",
                      p.status === "for-sale"
                        ? "bg-success/15 text-success"
                        : "bg-secondary text-muted-foreground",
                    )}
                  >
                    {statusLabel[p.status]}
                  </span>
```

3. In the attributes array, replace the Parking entry `{ icon: Car, label: "Parking", value: p.parking },` with:

```tsx
                  {
                    icon: Ruler,
                    label: "Frontage",
                    value: p.frontage ? `${p.frontage}m` : "—",
                  },
```

4. In the TOD tile, replace `{p.todDistance}m` and its `<p>` with:

```tsx
                    <p
                      className={cn(
                        "mt-1 font-mono text-sm font-semibold",
                        p.tod ? "text-success" : "text-foreground",
                      )}
                    >
                      {p.tod ? "INSIDE" : `${p.todDistance}m`}
                    </p>
```

5. After the Key Insights `</div>`, still inside `<div className="space-y-6 p-5">`, add:

```tsx
              <ContractRequestPanel key={p.id} property={p} />
```

- [ ] **Step 3: Update `components/property-card.tsx`**

Replace the `{property.landSize > 0 && (…)}` block with:

```tsx
          <span className="ml-auto flex items-center gap-2 font-mono">
            {property.frontage > 0 && <span>{property.frontage}m front</span>}
            {property.landSize > 0 && <span>{property.landSize}m²</span>}
          </span>
```

Replace the bottom-left image badge `<span className="absolute bottom-3 left-3 …">{typeLabel[property.type]}</span>` with:

```tsx
        <div className="absolute bottom-3 left-3 flex gap-1.5">
          <span className="rounded-md bg-background/70 px-2 py-0.5 text-[11px] font-medium text-foreground backdrop-blur">
            {typeLabel[property.type]}
          </span>
          {property.tod && (
            <span className="rounded-md bg-primary/80 px-2 py-0.5 text-[11px] font-semibold text-primary-foreground backdrop-blur">
              TOD
            </span>
          )}
          {property.status !== "for-sale" && (
            <span className="rounded-md bg-background/70 px-2 py-0.5 text-[11px] font-medium text-muted-foreground backdrop-blur">
              {statusLabel[property.status]}
            </span>
          )}
        </div>
```

Change the format import to `import { formatPrice, opportunityStyle, statusLabel, typeLabel } from "@/lib/format"`.

- [ ] **Step 4: Update `app/saved/page.tsx`**

1. Imports:
   - Add `FileCheck` to the lucide import.
   - Change the format import to `import { formatPrice, formatRelative, opportunityStyle, typeLabel } from "@/lib/format"`.
2. Add `contractRequests` to the `useN3X7()` destructure.
3. Right after the `Saved {p.savedDate ?? "recently"}` `</span>`, add:

```tsx
                      {contractRequests[p.id] && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-medium text-success">
                          <FileCheck className="size-3" />
                          Contract requested ·{" "}
                          {formatRelative(contractRequests[p.id].requestedAt)}
                        </span>
                      )}
```

- [ ] **Step 5: Type check, then a manual check**

Run: `pnpm exec tsc --noEmit && pnpm test`
Expected: no type errors, and all tests PASS.

In the browser:

1. Open 212 Illawarra Road. It should show the For sale pill, Frontage 26m, TOD INSIDE, and the James Romano agent card.
2. Click Request contract. The form should be prefilled, ending "Thanks, " (no user until Task 7). Click Send request: the spinner shows for about 0.8 s, then the green "Contract requested … just now" box appears and the bookmark becomes Saved.
3. Go to Saved. The property should show the "Contract requested · just now" badge.
4. Open 33 Leofrene Avenue and close the drawer without requesting. Its state should stay unaffected.
5. Review Focus 5: open 47 Calvert Street (sold). The button should be disabled and read "Sold — contract unavailable".

- [ ] **Step 6: Commit**

```bash
git add components/contract-request.tsx components/property-drawer.tsx components/property-card.tsx app/saved/page.tsx
git commit -m "feat: agent details, request-contract flow, contract status on saved"
```

---

### Task 7: Staff login gate

**Files:**
- Create: `app/login/page.tsx`
- Modify: `components/app-shell.tsx` (full rewrite)
- Modify: `components/top-header.tsx` (user identity, sign out)

**Interfaces:**
- Consumes: `user`, `hydrated`, `signIn`, `signOut` (Task 3); `DEMO_USER` (Task 2).
- Produces: route `/login`.

- [ ] **Step 1: Create `app/login/page.tsx`**

```tsx
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Hexagon, Loader2 } from "lucide-react"
import { useN3X7 } from "@/lib/store"
import { DEMO_USER } from "@/lib/mock-data"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export default function LoginPage() {
  const { signIn } = useN3X7()
  const router = useRouter()
  const [email, setEmail] = useState(DEMO_USER.email)
  const [password, setPassword] = useState(DEMO_USER.password)
  const [busy, setBusy] = useState(false)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const value = email.trim()
    if (!value) return
    setBusy(true)
    setTimeout(() => {
      signIn(value)
      router.replace("/")
    }, 500)
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <form onSubmit={submit} className="glass w-full max-w-sm space-y-5 rounded-2xl p-6">
        <div className="flex items-center gap-2">
          <Hexagon className="size-7 text-primary" fill="currentColor" />
          <span className="text-lg font-semibold">
            N3X7<span className="text-primary">.bot</span>
          </span>
        </div>
        <div>
          <h1 className="text-xl font-semibold text-foreground">Staff sign in</h1>
          <p className="text-sm text-muted-foreground">
            AI property intelligence for acquisitions teams.
          </p>
        </div>
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">Email</span>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">Password</span>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </label>
        <Button type="submit" className="w-full" disabled={busy}>
          {busy && <Loader2 className="size-4 animate-spin" />}
          Sign in
        </Button>
        <p className="text-center text-[11px] text-muted-foreground">
          Demo environment — any credentials are accepted.
        </p>
      </form>
    </div>
  )
}
```

- [ ] **Step 2: Rewrite `components/app-shell.tsx`**

```tsx
"use client"

import { useEffect, type ReactNode } from "react"
import { usePathname, useRouter } from "next/navigation"
import { useN3X7 } from "@/lib/store"
import { Sidebar } from "./sidebar"
import { TopHeader } from "./top-header"
import { PropertyDrawer } from "./property-drawer"

export function AppShell({ children }: { children: ReactNode }) {
  const { user, hydrated } = useN3X7()
  const pathname = usePathname()
  const router = useRouter()
  const isLogin = pathname === "/login"

  useEffect(() => {
    if (!hydrated) return
    if (!user && !isLogin) router.replace("/login")
    if (user && isLogin) router.replace("/")
  }, [hydrated, user, isLogin, router])

  if (isLogin) return <>{children}</>
  // Hold a blank frame until the stored session is read, to avoid flashing the app or login.
  if (!hydrated || !user) return <div className="h-dvh w-full bg-background" />

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background text-foreground">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopHeader />
        <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
      </div>
      <PropertyDrawer />
    </div>
  )
}
```

- [ ] **Step 3: Show the signed-in user and Sign out in `components/top-header.tsx`**

Add `import { useN3X7 } from "@/lib/store"`. At the top of `TopHeader`, add:

```tsx
  const { user, signOut } = useN3X7()
  const name = user?.name ?? "Guest"
  const initials = name
    .split(/\s+/)
    .map((w) => w[0]?.toUpperCase())
    .join("")
    .slice(0, 2)
```

Then make these replacements:
- `AC` → `{initials}`
- `Alex Carter` → `{name}`
- `Investor` → `{user?.role}`
- The last `<DropdownMenuItem>Sign out</DropdownMenuItem>` → `<DropdownMenuItem onClick={signOut}>Sign out</DropdownMenuItem>`

The shell's effect redirects to `/login` once `user` is null.

- [ ] **Step 4: Type check, then a manual check**

Run: `pnpm exec tsc --noEmit && pnpm test`
Expected: no type errors, and all tests PASS.

In the browser:

1. In DevTools → Application → Local Storage, clear the `n3x7.*` keys, then load `/`. You should be redirected to `/login` with the fields prefilled.
2. Click Sign in. You should land on Discover, and the header should show "Sam Taylor · Acquisitions Analyst".
3. Visit `/login` while signed in. You should be redirected to `/`.
4. Use the user menu → Sign out. You should go back to `/login`.

- [ ] **Step 5: Commit**

```bash
git add app/login/page.tsx components/app-shell.tsx components/top-header.tsx
git commit -m "feat: demo staff login gate with persisted session and sign out"
```

---

### Task 8: Full demo rehearsal, docs, build

**Files:**
- Modify: `CLAUDE.md` (commands + architecture notes)
- Modify: `docs/superpowers/specs/2026-10-15-client-demo-design.md` (§4 note: inline panel instead of dialog)

- [ ] **Step 1: Update `CLAUDE.md`**

In the Commands block:
- Add `pnpm test   # node --test over lib/**/*.test.ts (Node 24 native TS)`.
- Replace the sentence "There is no test framework." with: "Tests use Node's built-in runner on the pure `lib/` modules. Run one file with `node --test lib/search.test.ts`. Modules imported by tests must only use `import type` for local types, and runtime imports need a `.ts` extension."

In Architecture, add bullets:
- **Demo flow:** a localStorage-backed demo login gate in `AppShell` → `/login`. Filters (`lib/search.ts`) live in the store and drive both the list and the map markers. Contract requests are mocked in the store.
- **Live planning layers:** `components/planning-overlay.tsx` draws NSW LMR (layer 4) and TOD (layers 2, 3) from the ArcGIS `export` endpoint (`lib/arcgis.ts`). `query` is disabled on that service, so listing `tod`/`lmr` flags are hand-set in `lib/mock-data.ts` and checked against `todAreas` by tests.

- [ ] **Step 2: Note the spec deviation**

In the spec §4, replace "It opens a dialog (shadcn `dialog`, base-nova)" with "It expands an inline form inside the drawer (chosen over a nested dialog during planning)".

- [ ] **Step 3: Full verification**

Run: `pnpm test && pnpm exec tsc --noEmit && pnpm build`
Expected: all tests PASS, no type errors, and the build succeeds.

- [ ] **Step 4: Rehearse the whole client script in the browser (spec "Demo script")**

Clear the `n3x7.*` localStorage keys first, then:

1. `/` redirects to `/login`. Sign in.
2. Search `Properties for sale in Glebe in the TOD area`. The TOD notice should appear and the map should show LMR only.
3. Click Marrickville. The map flies there and the TOD overlay plus the TOD listings appear.
4. Set Frontage to 20 m+. The list shows 212 Illawarra Road and 14 Silver Street.
5. Open 212 Illawarra Road, Save, Request contract, Send. The confirmation appears.
6. **Hard refresh** (Review Focus 4). You should stay signed in with no login flash, and the state is preserved.
7. Go to Saved. It shows the Contract requested badge.
8. Analyst: ask "Which suburbs have TOD areas?" and you should get the Inner West TOD answer.
9. Check at mobile width (DevTools 390 px). The Discover map/list stack still works and the drawer is usable.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md docs/superpowers/specs/2026-10-15-client-demo-design.md
git commit -m "docs: document demo flow, live NSW layers and test command"
```

- [ ] **Step 6: Hand off**

Report the results to the user. Ask before pushing `demo/client-walkthrough`, and before merging to `main`, because a merge auto-deploys to Vercel.
