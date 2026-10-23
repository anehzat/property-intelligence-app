# Cotality Backend on AWS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Staff sign in through Cognito and browse live for-sale listings from Cotality (sandbox) through a small authenticated AWS backend, next to the existing demo listings.

**Architecture:** A new `api/` package (TypeScript Lambda) is deployed as one SAM stack (`n3x7-api`) holding a Cognito User Pool, an HTTP API with a JWT authorizer, throttling and CORS, and the Lambda, which reads Cotality credentials from Secrets Manager. The static Next.js front end swaps the demo login for Cognito (SRP), and adds a "Live · Cotality" data source that calls the API with the user's ID token.

**Tech Stack:**
- AWS: CloudFormation with the SAM transform (deployed with the AWS CLI only, no SAM CLI), Cognito, API Gateway HTTP API, Lambda `nodejs22.x` arm64, Secrets Manager
- `api/`: esbuild, Node 24 `node --test`
- Front end: `amazon-cognito-identity-js`, Next.js 16 static export

**Spec:** `docs/superpowers/specs/2026-10-23-cotality-backend-design.md`

## Global Constraints

- AWS account `654157459349`, region `ap-southeast-2`, CLI profile `n3x7`. Every AWS CLI call passes `--profile n3x7 --region ap-southeast-2`.
- Cotality secret ID `n3x7/cotality`, JSON `{clientId, clientSecret, baseUrl}`. Sandbox base URL is `https://api-sbox.corelogic.asia`. Token endpoint is `POST {baseUrl}/access/as/token.oauth2?grant_type=client_credentials` with `Authorization: Basic base64(id:secret)`.
- Supported suburbs, exactly: `Blacktown` → query `Blacktown NSW 2148`, `Quakers Hill` → `Quakers Hill NSW 2763`, `Seven Hills` → `Seven Hills NSW 2147`.
- Listing search always sends `activeCampaign=true` and `size=20`.
- Types are `HOUSE`, `UNIT`, `LAND`. Mapping: HOUSE→`house`, UNIT/FLATS→`apartment`, anything else→`development`.
- Live listing IDs are `cl-<cotalityId>`.
- Never print, log or commit secrets, tokens, or agent names/phones. Credentials only move through `file://` temp files with mode 600.
- CORS origins: `https://next.eronka.com`, `https://main.d2tgqj6ewcyky0.amplifyapp.com`, `http://localhost:3000`. Throttling: 10 rps, burst 20.
- Cognito: admin-create only, email username, password minimum 12 characters with lowercase, uppercase, numbers and symbols, TOTP MFA optional, ID/access tokens 1 h, refresh tokens 30 days. Web client uses SRP and refresh only, no secret.
- Lambda: memory 256 MB, timeout 10 s, env `SECRET_ID=n3x7/cotality`, IAM read on that secret only. **No reserved concurrency** (see Ruling R1).
- Front-end modules imported by `node --test` use `import type` for local types, and runtime imports need a `.ts` extension. `api/src` follows the same rule.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

**Ruling R1 (deviation from spec §5):** the spec asks for Lambda reserved concurrency 5. This account's Lambda concurrency limit is 10 (`aws lambda get-account-settings` gives `ConcurrentExecutions 10, Unreserved 10`), and AWS requires at least 10 unreserved, so any reservation fails. API Gateway throttling (10 rps / burst 20) is the cap instead. Cost if wrong: a burst could spend more Cotality sandbox quota; request a limit increase and add the reservation later.

## Review Focus

1. **Expired or missing Cognito session while in Live mode.** The user should see "Your session has expired. Sign in again." and nothing should crash. Test: `fetchLive` maps a 401 to that message (Task 6), and `lib/auth.ts` returns null rather than throwing when Cognito isn't configured (Task 5).
2. **Cotality returns listings with missing coordinates or IDs.** They must be dropped, not crash the map. Test: `mapListing` returns null for them (Task 1).
3. **Price labels that aren't a single dollar amount** (`"Auction"`, `"$1.1m - $1.2m"`, `"Contact agent"`, `"$950,000+"`) must give `price: null`, and the UI must show the label. Test in Task 1.
4. **The token expires mid-session, or Cotality returns 401.** One forced refresh, then a 502 with "Cotality authentication failed". Test in Task 2.
5. **Unsupported suburb, page or ID input** (including injection like `../`) must give 400 and never reach Cotality. Tests in Task 3.

---

## File map

| File | Task | Responsibility |
|---|---|---|
| `api/package.json`, `api/tsconfig.json`, `api/pnpm-lock.yaml` | 1 | Package setup |
| `api/src/types.ts` | 1 | `LiveListing`, `LiveCampaign`, `ListingsResponse`, `ListingsQuery` |
| `api/src/map.ts` (+ test) | 1 | Cotality JSON → app shapes |
| `api/src/cotality.ts` (+ test) | 2 | Token cache, locality cache, GETs, `CotalityError` |
| `api/src/params.ts` (+ test) | 3 | Query/path validation, `BadRequest`, supported suburbs |
| `api/src/routes.ts` (+ test) | 3 | Route dispatch, error → HTTP mapping, structured log |
| `api/src/handler.ts` | 3 | Lambda entry: Secrets Manager loader and `route()` |
| `api/template.yaml` | 4 | SAM stack |
| `api/deploy-prod.sh`, `api/put-cotality-secret.sh`, `api/create-user.sh`, `api/smoke.sh` | 4 | Operations |
| `tsconfig.json`, `.gitignore` | 1 | Exclude `api/` from the root tsc, and ignore build output |
| `lib/config.ts`, `lib/claims.ts` (+ test), `lib/auth.ts` | 5 | Cognito on the front end |
| `lib/store.tsx`, `app/login/page.tsx`, `lib/mock-data.ts` | 5 | Real sign-in |
| `lib/types.ts`, `lib/live.ts` (+ test) | 6 | Live types and API client |
| `lib/store.tsx`, `components/source-switch.tsx`, `components/live-panel.tsx`, `components/live-listing-card.tsx`, `components/discovery-panel.tsx`, `components/property-map.tsx` | 6 | Live mode UI and markers |
| `components/live-drawer.tsx`, `components/app-shell.tsx`, `app/saved/page.tsx` | 7 | Live drawer, saving live listings |
| `.env`, `CLAUDE.md` | 8 | Rollout config and docs |

---

### Task 1: `api/` package and Cotality → app mapping

**Files:**
- Create: `api/package.json`, `api/tsconfig.json`, `api/src/types.ts`, `api/src/map.ts`, `api/src/map.test.ts`
- Modify: `tsconfig.json` (exclude), `.gitignore`

**Interfaces:**
- Produces:
  - `LiveListing`, `LiveCampaign`, `ListingsResponse`, `ListingsQuery` (in `api/src/types.ts`)
  - `parsePrice(label: string | null): number | null`
  - `mapType(t: unknown): LiveListing["type"]`
  - `mapListing(raw: unknown, suburb: string): LiveListing | null`
  - `mapSearch(body: unknown, suburb: string, page: number): ListingsResponse`
  - `mapCampaign(body: unknown): LiveCampaign | null`

- [ ] **Step 1: Package scaffolding**

`api/package.json`:
```json
{
  "name": "n3x7-api",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test \"src/**/*.test.ts\"",
    "typecheck": "tsc --noEmit",
    "build": "esbuild src/handler.ts --bundle --platform=node --target=node22 --format=esm --external:@aws-sdk/* --outfile=dist/handler.mjs"
  },
  "devDependencies": {
    "@aws-sdk/client-secrets-manager": "3.1156.0",
    "@types/aws-lambda": "8.10.164",
    "@types/node": "^24",
    "esbuild": "0.28.2",
    "typescript": "5.7.3"
  }
}
```

`api/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "esnext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["src/**/*.ts"]
}
```

Root `tsconfig.json`: change `"exclude": ["node_modules"]` to `"exclude": ["node_modules", "api"]`.

Append to root `.gitignore`:
```
# Cotality API build output
/api/dist/
/api/packaged.yaml
```

Run: `cd api && pnpm install`
Expected: creates `api/node_modules` and `api/pnpm-lock.yaml`, no errors.

- [ ] **Step 2: Types**

`api/src/types.ts`:
```ts
export interface LiveListing {
  id: string
  cotalityId: number
  address: string
  suburb: string
  state: "NSW"
  lat: number
  lng: number
  type: "house" | "apartment" | "development"
  beds: number | null
  baths: number | null
  parking: number | null
  landSize: number | null
  priceLabel: string | null
  price: number | null
  method: string | null
  listedAt: string | null
  agentName: string | null
  agency: string | null
  image: string | null
}

export interface LiveCampaign {
  agentName: string | null
  agentPhone: string | null
  agency: string | null
  agencyPhone: string | null
  priceLabel: string | null
  auctionDate: string | null
  daysOnMarket: number | null
}

export interface ListingsResponse {
  suburb: string
  page: number
  totalPages: number
  total: number
  listings: LiveListing[]
}

export interface ListingsQuery {
  suburb: string
  types: string[]
  minLandArea: number
  page: number
}
```

- [ ] **Step 3: Write the failing tests**

`api/src/map.test.ts`:
```ts
import { test } from "node:test"
import assert from "node:assert/strict"
import { mapCampaign, mapListing, mapSearch, mapType, parsePrice } from "./map.ts"

const raw = (over: Record<string, unknown> = {}) => ({
  propertySummary: {
    id: 123,
    propertyType: "HOUSE",
    address: { singleLineAddress: "1 Main St Blacktown NSW 2148" },
    coordinate: { latitude: -33.77, longitude: 150.9 },
    attributes: { bedrooms: 3, bathrooms: 2, carSpaces: 1, landArea: 556 },
    propertyPhoto: { mediumPhotoUrl: "https://img/x.jpg" },
    otmForSaleDetail: {
      priceDescription: "$1,250,000",
      agent: "A Agent",
      agency: "Agency Co",
      method: "Normal Sale",
      date: "2026-10-01T00:00:00Z",
    },
    ...over,
  },
})

test("parsePrice reads a single dollar amount", () => {
  assert.equal(parsePrice("$1,250,000"), 1250000)
  assert.equal(parsePrice(" $950000 "), 950000)
})

test("parsePrice returns null for anything that isn't one amount", () => {
  for (const s of ["Auction", "Contact agent", "$1.1m - $1.2m", "$950,000+", "", null]) {
    assert.equal(parsePrice(s), null, String(s))
  }
})

test("mapType maps Cotality property types", () => {
  assert.equal(mapType("HOUSE"), "house")
  assert.equal(mapType("UNIT"), "apartment")
  assert.equal(mapType("FLATS"), "apartment")
  assert.equal(mapType("LAND"), "development")
  assert.equal(mapType(undefined), "development")
})

test("mapListing maps a full record", () => {
  assert.deepEqual(mapListing(raw(), "Blacktown"), {
    id: "cl-123",
    cotalityId: 123,
    address: "1 Main St Blacktown NSW 2148",
    suburb: "Blacktown",
    state: "NSW",
    lat: -33.77,
    lng: 150.9,
    type: "house",
    beds: 3,
    baths: 2,
    parking: 1,
    landSize: 556,
    priceLabel: "$1,250,000",
    price: 1250000,
    method: "Normal Sale",
    listedAt: "2026-10-01T00:00:00Z",
    agentName: "A Agent",
    agency: "Agency Co",
    image: "https://img/x.jpg",
  })
})

test("mapListing turns missing optional fields into null", () => {
  const l = mapListing(
    raw({ attributes: {}, otmForSaleDetail: {}, propertyPhoto: undefined }),
    "Blacktown",
  )
  assert.ok(l)
  assert.equal(l.beds, null)
  assert.equal(l.landSize, null)
  assert.equal(l.priceLabel, null)
  assert.equal(l.price, null)
  assert.equal(l.agentName, null)
  assert.equal(l.image, null)
})

test("mapListing drops records without id or coordinates", () => {
  assert.equal(mapListing(raw({ id: undefined }), "Blacktown"), null)
  assert.equal(mapListing(raw({ coordinate: {} }), "Blacktown"), null)
  assert.equal(mapListing({}, "Blacktown"), null)
})

test("mapSearch maps paging and skips bad records", () => {
  const body = {
    _embedded: { propertySummaryList: [raw(), raw({ coordinate: null })] },
    page: { totalElements: 182, totalPages: 10, number: 0, size: 20 },
  }
  const r = mapSearch(body, "Blacktown", 0)
  assert.equal(r.total, 182)
  assert.equal(r.totalPages, 10)
  assert.equal(r.listings.length, 1)
  assert.deepEqual(mapSearch({}, "Blacktown", 2), {
    suburb: "Blacktown", page: 2, totalPages: 0, total: 0, listings: [],
  })
})

test("mapCampaign picks the active campaign", () => {
  const body = {
    forSalePropertyCampaign: {
      campaigns: [
        { isActiveCampaign: false, agent: { agent: "Old", phoneNumber: "1" } },
        {
          isActiveCampaign: true,
          agent: { agent: "New Agent", phoneNumber: "0400 000 000" },
          agency: { companyName: "Agency Co", phoneNumber: "02 0000 0000" },
          priceDescription: "Auction",
          auctionDate: "2026-11-01",
          daysOnMarket: 12,
        },
      ],
    },
  }
  assert.deepEqual(mapCampaign(body), {
    agentName: "New Agent",
    agentPhone: "0400 000 000",
    agency: "Agency Co",
    agencyPhone: "02 0000 0000",
    priceLabel: "Auction",
    auctionDate: "2026-11-01",
    daysOnMarket: 12,
  })
})

test("mapCampaign returns null without an active campaign", () => {
  assert.equal(mapCampaign({ forSalePropertyCampaign: { campaigns: [{ isActiveCampaign: false }] } }), null)
  assert.equal(mapCampaign(null), null)
})
```

- [ ] **Step 4: Run the tests to confirm they fail**

Run: `cd api && node --test src/map.test.ts`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `./map.ts`.

- [ ] **Step 5: Implement**

`api/src/map.ts`:
```ts
import type { ListingsResponse, LiveCampaign, LiveListing } from "./types.ts"

// Cotality payloads are loosely typed; read them defensively.
type Json = any

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null
const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : null

export function parsePrice(label: string | null): number | null {
  const m = label?.match(/^\s*\$\s?([\d,]+)\s*$/)
  return m ? Number(m[1].replace(/,/g, "")) : null
}

export function mapType(t: unknown): LiveListing["type"] {
  const v = typeof t === "string" ? t.toUpperCase() : ""
  if (v === "HOUSE") return "house"
  if (v === "UNIT" || v === "FLATS") return "apartment"
  return "development"
}

export function mapListing(raw: unknown, suburb: string): LiveListing | null {
  const p: Json = (raw as Json)?.propertySummary
  const id = num(p?.id)
  const lat = num(p?.coordinate?.latitude)
  const lng = num(p?.coordinate?.longitude)
  if (id === null || lat === null || lng === null) return null
  const otm: Json = p.otmForSaleDetail ?? {}
  const priceLabel = str(otm.priceDescription)
  return {
    id: `cl-${id}`,
    cotalityId: id,
    address: str(p.address?.singleLineAddress) ?? "Address unavailable",
    suburb,
    state: "NSW",
    lat,
    lng,
    type: mapType(p.propertyType),
    beds: num(p.attributes?.bedrooms),
    baths: num(p.attributes?.bathrooms),
    parking: num(p.attributes?.carSpaces),
    landSize: num(p.attributes?.landArea),
    priceLabel,
    price: parsePrice(priceLabel),
    method: str(otm.method),
    listedAt: str(otm.date),
    agentName: str(otm.agent),
    agency: str(otm.agency),
    image: str(p.propertyPhoto?.mediumPhotoUrl),
  }
}

export function mapSearch(body: unknown, suburb: string, page: number): ListingsResponse {
  const b = body as Json
  const list: unknown[] = Array.isArray(b?._embedded?.propertySummaryList)
    ? b._embedded.propertySummaryList
    : []
  return {
    suburb,
    page,
    totalPages: num(b?.page?.totalPages) ?? 0,
    total: num(b?.page?.totalElements) ?? 0,
    listings: list
      .map((x) => mapListing(x, suburb))
      .filter((x): x is LiveListing => x !== null),
  }
}

export function mapCampaign(body: unknown): LiveCampaign | null {
  const campaigns: Json[] = (body as Json)?.forSalePropertyCampaign?.campaigns ?? []
  const c = Array.isArray(campaigns) ? campaigns.find((x) => x?.isActiveCampaign === true) : null
  if (!c) return null
  return {
    agentName: str(c.agent?.agent),
    agentPhone: str(c.agent?.phoneNumber),
    agency: str(c.agency?.companyName),
    agencyPhone: str(c.agency?.phoneNumber),
    priceLabel: str(c.priceDescription) ?? str(c.latestAdvertisementPrice),
    auctionDate: str(c.auctionDate),
    daysOnMarket: num(c.daysOnMarket),
  }
}
```

- [ ] **Step 6: Run the tests to confirm they pass**

Run: `cd api && pnpm test`
Expected: PASS, 9 tests, 0 failures.

- [ ] **Step 7: Commit**

```bash
git add api/package.json api/pnpm-lock.yaml api/tsconfig.json api/src/types.ts api/src/map.ts api/src/map.test.ts tsconfig.json .gitignore
git commit -m "feat(api): map Cotality search and campaign payloads to app shapes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Cotality client with token and locality caches

**Files:**
- Create: `api/src/cotality.ts`, `api/src/cotality.test.ts`

**Interfaces:**
- Consumes: `ListingsQuery` from Task 1.
- Produces:
  - `class CotalityError extends Error { status: number }`
  - `interface Creds { clientId: string; clientSecret: string; baseUrl: string }`
  - `interface CotalityClient { suggestLocality(query: string): Promise<number>; searchForSale(localityId: number, q: ListingsQuery): Promise<unknown>; saleCampaign(propertyId: number): Promise<unknown> }`
  - `searchPath(localityId: number, q: ListingsQuery): string`
  - `createCotality(loadCreds: () => Promise<Creds>, fetchFn?: typeof fetch, now?: () => number): CotalityClient`

- [ ] **Step 1: Write the failing tests**

`api/src/cotality.test.ts`:
```ts
import { test } from "node:test"
import assert from "node:assert/strict"
import { CotalityError, createCotality, searchPath } from "./cotality.ts"

const creds = async () => ({ clientId: "id", clientSecret: "secret", baseUrl: "https://cot.test" })
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })

function fakeFetch(handler: (url: string, init?: RequestInit) => Response) {
  const calls: string[] = []
  const fn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    calls.push(url)
    return handler(url, init)
  }) as typeof fetch
  return { fn, calls }
}

const tokenOk = (url: string) =>
  url.includes("/access/as/token.oauth2") ? json({ access_token: "t1", expires_in: 3300 }) : null

test("searchPath always sends activeCampaign=true and size=20", () => {
  const p = searchPath(42, { suburb: "Blacktown", types: ["HOUSE", "LAND"], minLandArea: 500, page: 2 })
  assert.equal(
    p,
    "/search/au/property/locality/42/otmForSale?activeCampaign=true&size=20&page=2&pTypes=HOUSE%2CLAND&landArea=500-",
  )
  assert.equal(
    searchPath(42, { suburb: "Blacktown", types: [], minLandArea: 0, page: 0 }),
    "/search/au/property/locality/42/otmForSale?activeCampaign=true&size=20&page=0",
  )
})

test("token request uses Basic auth and the token is reused", async () => {
  let auth = ""
  const f = fakeFetch((url, init) => {
    if (url.includes("token.oauth2")) {
      auth = String((init?.headers as Record<string, string>).Authorization)
      return json({ access_token: "t1", expires_in: 3300 })
    }
    return json({ ok: true })
  })
  const c = createCotality(creds, f.fn, () => 0)
  await c.saleCampaign(1)
  await c.saleCampaign(2)
  assert.equal(auth, `Basic ${Buffer.from("id:secret").toString("base64")}`)
  assert.equal(f.calls.filter((u) => u.includes("token.oauth2")).length, 1)
})

test("token is refreshed within 5 minutes of expiry", async () => {
  let t = 0
  const f = fakeFetch((url) => tokenOk(url) ?? json({}))
  const c = createCotality(creds, f.fn, () => t)
  await c.saleCampaign(1)
  t = (3300 - 299) * 1000
  await c.saleCampaign(1)
  assert.equal(f.calls.filter((u) => u.includes("token.oauth2")).length, 2)
})

test("a 401 forces one token refresh and retry", async () => {
  let dataCalls = 0
  const f = fakeFetch((url) => {
    const tok = tokenOk(url)
    if (tok) return tok
    dataCalls++
    return dataCalls === 1 ? json({}, 401) : json({ ok: true })
  })
  const c = createCotality(creds, f.fn, () => 0)
  assert.deepEqual(await c.saleCampaign(1), { ok: true })
  assert.equal(f.calls.filter((u) => u.includes("token.oauth2")).length, 2)
})

test("a second 401 throws CotalityError(401)", async () => {
  const f = fakeFetch((url) => tokenOk(url) ?? json({}, 401))
  const c = createCotality(creds, f.fn, () => 0)
  await assert.rejects(c.saleCampaign(1), (e) => e instanceof CotalityError && e.status === 401)
})

test("429 throws CotalityError(429) and 404 resolves null", async () => {
  const f429 = fakeFetch((url) => tokenOk(url) ?? json({}, 429))
  await assert.rejects(createCotality(creds, f429.fn).saleCampaign(1), (e) => e instanceof CotalityError && e.status === 429)
  const f404 = fakeFetch((url) => tokenOk(url) ?? json({}, 404))
  assert.equal(await createCotality(creds, f404.fn).saleCampaign(1), null)
})

test("failed token request throws CotalityError(401)", async () => {
  const f = fakeFetch(() => json({ error: "invalid_client" }, 400))
  await assert.rejects(createCotality(creds, f.fn).saleCampaign(1), (e) => e instanceof CotalityError && e.status === 401)
})

test("suggestLocality returns the locality id and caches it", async () => {
  const f = fakeFetch((url) =>
    tokenOk(url) ??
    json({ suggestions: [{ suggestionType: "locality", localityId: 777, suggestion: "Blacktown NSW 2148" }] }),
  )
  const c = createCotality(creds, f.fn, () => 0)
  assert.equal(await c.suggestLocality("Blacktown NSW 2148"), 777)
  assert.equal(await c.suggestLocality("Blacktown NSW 2148"), 777)
  const suggestCalls = f.calls.filter((u) => u.includes("suggest.json"))
  assert.equal(suggestCalls.length, 1)
  assert.ok(suggestCalls[0].includes("q=Blacktown%20NSW%202148"))
  assert.ok(suggestCalls[0].includes("suggestionTypes=locality"))
})

test("suggestLocality throws when no locality is found", async () => {
  const f = fakeFetch((url) => tokenOk(url) ?? json({ suggestions: [] }))
  await assert.rejects(createCotality(creds, f.fn).suggestLocality("Nowhere"), CotalityError)
})
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `cd api && node --test src/cotality.test.ts`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `./cotality.ts`.

- [ ] **Step 3: Implement**

`api/src/cotality.ts`:
```ts
import type { ListingsQuery } from "./types.ts"

export class CotalityError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = "CotalityError"
    this.status = status
  }
}

export interface Creds {
  clientId: string
  clientSecret: string
  baseUrl: string
}

export interface CotalityClient {
  suggestLocality(query: string): Promise<number>
  searchForSale(localityId: number, q: ListingsQuery): Promise<unknown>
  saleCampaign(propertyId: number): Promise<unknown>
}

const REFRESH_MARGIN_MS = 5 * 60_000

export function searchPath(localityId: number, q: ListingsQuery): string {
  const params = new URLSearchParams({ activeCampaign: "true", size: "20", page: String(q.page) })
  if (q.types.length) params.set("pTypes", q.types.join(","))
  if (q.minLandArea > 0) params.set("landArea", `${q.minLandArea}-`)
  return `/search/au/property/locality/${localityId}/otmForSale?${params}`
}

export function createCotality(
  loadCreds: () => Promise<Creds>,
  fetchFn: typeof fetch = fetch,
  now: () => number = Date.now,
): CotalityClient {
  let creds: Creds | null = null
  let token: { value: string; expiresAt: number } | null = null
  const localities = new Map<string, number>()

  async function getCreds() {
    creds ??= await loadCreds()
    return creds
  }

  async function getToken(force = false): Promise<string> {
    if (!force && token && now() < token.expiresAt - REFRESH_MARGIN_MS) return token.value
    const c = await getCreds()
    const basic = Buffer.from(`${c.clientId}:${c.clientSecret}`).toString("base64")
    const r = await fetchFn(`${c.baseUrl}/access/as/token.oauth2?grant_type=client_credentials`, {
      method: "POST",
      headers: { Authorization: `Basic ${basic}`, "Content-Length": "0" },
    })
    if (r.status === 429) throw new CotalityError(429, "Cotality token quota exceeded")
    if (!r.ok) throw new CotalityError(401, "Cotality token request failed")
    const j = (await r.json()) as { access_token?: string; expires_in?: number }
    if (!j.access_token) throw new CotalityError(401, "Cotality token missing")
    token = { value: j.access_token, expiresAt: now() + (j.expires_in ?? 0) * 1000 }
    return token.value
  }

  async function get(path: string): Promise<unknown> {
    const c = await getCreds()
    const call = async (force: boolean) =>
      fetchFn(c.baseUrl + path, {
        headers: { Authorization: `Bearer ${await getToken(force)}`, accept: "application/json" },
      })
    let r = await call(false)
    if (r.status === 401) r = await call(true)
    if (r.status === 404) return null
    if (!r.ok) throw new CotalityError(r.status, `Cotality responded ${r.status}`)
    return r.json()
  }

  return {
    async suggestLocality(query) {
      const cached = localities.get(query)
      if (cached !== undefined) return cached
      const body = (await get(
        `/property/au/v2/suggest.json?q=${encodeURIComponent(query)}&suggestionTypes=locality`,
      )) as { suggestions?: { suggestionType?: string; localityId?: unknown }[] } | null
      const hit = body?.suggestions?.find(
        (s) => s.suggestionType === "locality" && typeof s.localityId === "number",
      )
      if (!hit) throw new CotalityError(404, "Locality not found")
      localities.set(query, hit.localityId as number)
      return hit.localityId as number
    },
    searchForSale(localityId, q) {
      return get(searchPath(localityId, q))
    },
    saleCampaign(propertyId) {
      return get(`/property-details/au/properties/${propertyId}/otm/campaign/sales`)
    },
  }
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `cd api && pnpm test`
Expected: PASS, 18 tests (9 + 9), 0 failures.

- [ ] **Step 5: Commit**

```bash
git add api/src/cotality.ts api/src/cotality.test.ts
git commit -m "feat(api): Cotality client with cached token, 401 retry and locality cache

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Param validation, routes and the Lambda handler

**Files:**
- Create: `api/src/params.ts`, `api/src/params.test.ts`, `api/src/routes.ts`, `api/src/routes.test.ts`, `api/src/handler.ts`

**Interfaces:**
- Consumes: `CotalityClient`, `CotalityError` (Task 2); `mapSearch`, `mapCampaign` (Task 1); `ListingsQuery` (Task 1).
- Produces:
  - `SUPPORTED_SUBURBS: Record<string, string>`
  - `LIVE_TYPES: readonly string[]`
  - `class BadRequest extends Error`
  - `parseListingsQuery(q: Record<string, string | undefined>): ListingsQuery`
  - `parsePropertyId(v: string | undefined): number`
  - `interface RouteEvent { routeKey: string; queryStringParameters?: Record<string, string | undefined>; pathParameters?: Record<string, string | undefined>; requestContext?: { requestId?: string } }`
  - `interface RouteResult { statusCode: number; headers: Record<string, string>; body: string }`
  - `route(event: RouteEvent, client: CotalityClient, log?: (line: string) => void): Promise<RouteResult>`
  - `handler(event: APIGatewayProxyEventV2): Promise<RouteResult>` in `handler.ts`

- [ ] **Step 1: Write the failing tests**

`api/src/params.test.ts`:
```ts
import { test } from "node:test"
import assert from "node:assert/strict"
import { BadRequest, parseListingsQuery, parsePropertyId } from "./params.ts"

test("parseListingsQuery accepts supported suburbs case-insensitively", () => {
  assert.deepEqual(parseListingsQuery({ suburb: "quakers hill" }), {
    suburb: "Quakers Hill", types: [], minLandArea: 0, page: 0,
  })
})

test("parseListingsQuery parses types, land area and page", () => {
  assert.deepEqual(
    parseListingsQuery({ suburb: "Blacktown", types: "house, land", minLandArea: "500", page: "3" }),
    { suburb: "Blacktown", types: ["HOUSE", "LAND"], minLandArea: 500, page: 3 },
  )
})

test("parseListingsQuery rejects unsupported or missing suburbs", () => {
  for (const suburb of [undefined, "", "Glebe", "../Blacktown"]) {
    assert.throws(() => parseListingsQuery({ suburb }), BadRequest, String(suburb))
  }
})

test("parseListingsQuery rejects bad types, land area and page", () => {
  assert.throws(() => parseListingsQuery({ suburb: "Blacktown", types: "CASTLE" }), BadRequest)
  assert.throws(() => parseListingsQuery({ suburb: "Blacktown", minLandArea: "-5" }), BadRequest)
  assert.throws(() => parseListingsQuery({ suburb: "Blacktown", minLandArea: "1e9" }), BadRequest)
  assert.throws(() => parseListingsQuery({ suburb: "Blacktown", page: "1.5" }), BadRequest)
  assert.throws(() => parseListingsQuery({ suburb: "Blacktown", page: "501" }), BadRequest)
})

test("parsePropertyId accepts digits only", () => {
  assert.equal(parsePropertyId("47872329"), 47872329)
  for (const v of [undefined, "", "abc", "12/../3", "1".repeat(13)]) {
    assert.throws(() => parsePropertyId(v), BadRequest, String(v))
  }
})
```

`api/src/routes.test.ts`:
```ts
import { test } from "node:test"
import assert from "node:assert/strict"
import { route } from "./routes.ts"
import { CotalityError, type CotalityClient } from "./cotality.ts"

const summary = {
  propertySummary: { id: 5, propertyType: "HOUSE", coordinate: { latitude: -33.7, longitude: 150.9 } },
}

function client(over: Partial<CotalityClient> = {}): CotalityClient & { queries: string[] } {
  const queries: string[] = []
  return {
    queries,
    async suggestLocality(q) { queries.push(q); return 777 },
    async searchForSale() {
      return { _embedded: { propertySummaryList: [summary] }, page: { totalElements: 1, totalPages: 1 } }
    },
    async saleCampaign() {
      return { forSalePropertyCampaign: { campaigns: [{ isActiveCampaign: true, agent: { agent: "A" } }] } }
    },
    ...over,
  }
}
const silent = () => {}
const body = (r: { body: string }) => JSON.parse(r.body)

test("GET /listings returns mapped listings", async () => {
  const c = client()
  const r = await route({ routeKey: "GET /listings", queryStringParameters: { suburb: "Seven Hills" } }, c, silent)
  assert.equal(r.statusCode, 200)
  assert.equal(r.headers["content-type"], "application/json")
  assert.deepEqual(c.queries, ["Seven Hills NSW 2147"])
  assert.equal(body(r).listings[0].id, "cl-5")
  assert.equal(body(r).suburb, "Seven Hills")
})

test("GET /listings with a bad suburb is 400 and never calls Cotality", async () => {
  const c = client()
  const r = await route({ routeKey: "GET /listings", queryStringParameters: { suburb: "Glebe" } }, c, silent)
  assert.equal(r.statusCode, 400)
  assert.match(body(r).error, /Blacktown, Quakers Hill, Seven Hills/)
  assert.deepEqual(c.queries, [])
})

test("GET /listings/{id}/campaign returns the campaign or 404", async () => {
  const ok = await route({ routeKey: "GET /listings/{id}/campaign", pathParameters: { id: "5" } }, client(), silent)
  assert.equal(ok.statusCode, 200)
  assert.equal(body(ok).agentName, "A")
  const none = await route(
    { routeKey: "GET /listings/{id}/campaign", pathParameters: { id: "5" } },
    client({ async saleCampaign() { return null } }),
    silent,
  )
  assert.equal(none.statusCode, 404)
})

test("Cotality errors map to 502/503", async () => {
  const cases: [unknown, number, RegExp][] = [
    [new CotalityError(401, "x"), 502, /authentication failed/],
    [new CotalityError(429, "x"), 503, /quota exceeded/],
    [new CotalityError(500, "x"), 502, /unavailable/],
    [new TypeError("fetch failed"), 502, /unavailable/],
  ]
  for (const [err, status, msg] of cases) {
    const r = await route(
      { routeKey: "GET /listings", queryStringParameters: { suburb: "Blacktown" } },
      client({ async suggestLocality() { throw err } }),
      silent,
    )
    assert.equal(r.statusCode, status)
    assert.match(body(r).error, msg)
  }
})

test("unknown routes are 404", async () => {
  const r = await route({ routeKey: "GET /nope" }, client(), silent)
  assert.equal(r.statusCode, 404)
})

test("logs one line with route, status and duration but no listing data", async () => {
  const lines: string[] = []
  await route(
    { routeKey: "GET /listings", queryStringParameters: { suburb: "Blacktown" }, requestContext: { requestId: "r1" } },
    client(),
    (l) => lines.push(l),
  )
  assert.equal(lines.length, 1)
  const entry = JSON.parse(lines[0])
  assert.equal(entry.requestId, "r1")
  assert.equal(entry.route, "GET /listings")
  assert.equal(entry.status, 200)
  assert.equal(typeof entry.ms, "number")
  assert.ok(!lines[0].includes("cl-5"))
})
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `cd api && node --test src/params.test.ts src/routes.test.ts`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `./params.ts` and `./routes.ts`.

- [ ] **Step 3: Implement**

`api/src/params.ts`:
```ts
import type { ListingsQuery } from "./types.ts"

/** Sandbox-supported suburbs → the query sent to Cotality's suggest service. */
export const SUPPORTED_SUBURBS: Record<string, string> = {
  Blacktown: "Blacktown NSW 2148",
  "Quakers Hill": "Quakers Hill NSW 2763",
  "Seven Hills": "Seven Hills NSW 2147",
}

export const LIVE_TYPES = ["HOUSE", "UNIT", "LAND"] as const

export class BadRequest extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BadRequest"
  }
}

function intParam(v: string | undefined, name: string, max: number): number {
  if (v === undefined || v === "") return 0
  if (!/^\d+$/.test(v) || Number(v) > max) {
    throw new BadRequest(`${name} must be a whole number from 0 to ${max}`)
  }
  return Number(v)
}

export function parseListingsQuery(q: Record<string, string | undefined>): ListingsQuery {
  const names = Object.keys(SUPPORTED_SUBURBS)
  const wanted = (q.suburb ?? "").trim().toLowerCase()
  const suburb = names.find((s) => s.toLowerCase() === wanted)
  if (!suburb) throw new BadRequest(`suburb must be one of: ${names.join(", ")}`)

  const types = (q.types ?? "")
    .split(",")
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean)
  if (types.some((t) => !(LIVE_TYPES as readonly string[]).includes(t))) {
    throw new BadRequest(`types must be from: ${LIVE_TYPES.join(", ")}`)
  }

  return {
    suburb,
    types,
    minLandArea: intParam(q.minLandArea, "minLandArea", 100_000),
    page: intParam(q.page, "page", 500),
  }
}

export function parsePropertyId(v: string | undefined): number {
  if (!v || !/^\d{1,12}$/.test(v)) throw new BadRequest("id must be a numeric Cotality property id")
  return Number(v)
}
```

`api/src/routes.ts`:
```ts
import { CotalityError, type CotalityClient } from "./cotality.ts"
import { mapCampaign, mapSearch } from "./map.ts"
import { BadRequest, SUPPORTED_SUBURBS, parseListingsQuery, parsePropertyId } from "./params.ts"

export interface RouteEvent {
  routeKey: string
  queryStringParameters?: Record<string, string | undefined>
  pathParameters?: Record<string, string | undefined>
  requestContext?: { requestId?: string }
}

export interface RouteResult {
  statusCode: number
  headers: Record<string, string>
  body: string
}

const json = (statusCode: number, data: unknown): RouteResult => ({
  statusCode,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(data),
})

function toError(e: unknown): [number, string] {
  if (e instanceof BadRequest) return [400, e.message]
  if (e instanceof CotalityError && e.status === 401) return [502, "Cotality authentication failed"]
  if (e instanceof CotalityError && e.status === 429) return [503, "Cotality quota exceeded, try later"]
  return [502, "Cotality unavailable"]
}

export async function route(
  event: RouteEvent,
  client: CotalityClient,
  log: (line: string) => void = console.log,
): Promise<RouteResult> {
  const started = Date.now()
  let status = 500
  let errorName: string | undefined
  try {
    if (event.routeKey === "GET /listings") {
      const q = parseListingsQuery(event.queryStringParameters ?? {})
      const localityId = await client.suggestLocality(SUPPORTED_SUBURBS[q.suburb])
      const body = await client.searchForSale(localityId, q)
      status = 200
      return json(status, mapSearch(body, q.suburb, q.page))
    }
    if (event.routeKey === "GET /listings/{id}/campaign") {
      const id = parsePropertyId(event.pathParameters?.id)
      const campaign = mapCampaign(await client.saleCampaign(id))
      status = campaign ? 200 : 404
      return json(status, campaign ?? { error: "No active sale campaign" })
    }
    status = 404
    return json(status, { error: "Not found" })
  } catch (e) {
    const [s, message] = toError(e)
    status = s
    errorName = e instanceof Error ? e.name : "Unknown"
    return json(status, { error: message })
  } finally {
    log(
      JSON.stringify({
        requestId: event.requestContext?.requestId,
        route: event.routeKey,
        status,
        error: errorName,
        ms: Date.now() - started,
      }),
    )
  }
}
```

`api/src/handler.ts`:
```ts
import type { APIGatewayProxyEventV2 } from "aws-lambda"
import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager"
import { createCotality, type Creds } from "./cotality.ts"
import { route } from "./routes.ts"

const secrets = new SecretsManagerClient({})

async function loadCreds(): Promise<Creds> {
  const r = await secrets.send(new GetSecretValueCommand({ SecretId: process.env.SECRET_ID }))
  const j = JSON.parse(r.SecretString ?? "{}") as Partial<Creds>
  if (!j.clientId || !j.clientSecret || !j.baseUrl) {
    throw new Error("Cotality secret is missing clientId, clientSecret or baseUrl")
  }
  return { clientId: j.clientId, clientSecret: j.clientSecret, baseUrl: j.baseUrl.replace(/\/+$/, "") }
}

// Module scope: the token and locality caches live as long as the Lambda container.
const cotality = createCotality(loadCreds)

export async function handler(event: APIGatewayProxyEventV2) {
  return route(event, cotality)
}
```

- [ ] **Step 4: Run tests, type-check and build**

Run: `cd api && pnpm test && pnpm typecheck && pnpm build && ls -la dist/handler.mjs`
Expected:
- PASS, 29 tests (18 + 5 + 6), 0 failures
- tsc prints nothing
- esbuild writes `dist/handler.mjs`, a few KB, with no `@aws-sdk` code bundled

- [ ] **Step 5: Commit**

```bash
git add api/src/params.ts api/src/params.test.ts api/src/routes.ts api/src/routes.test.ts api/src/handler.ts
git commit -m "feat(api): /listings and /listings/{id}/campaign routes with validation and error mapping

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: SAM stack, operations scripts, deploy and smoke test

**Files:**
- Create: `api/template.yaml`, `api/deploy-prod.sh`, `api/put-cotality-secret.sh`, `api/create-user.sh`, `api/smoke.sh`

**Interfaces:**
- Consumes: `dist/handler.mjs` exporting `handler` (Task 3).
- Produces stack `n3x7-api` outputs: `ApiUrl`, `UserPoolId`, `UserPoolClientId`, `SmokeClientId`. Task 8 copies the first three into `.env`.

- [ ] **Step 1: Template**

`api/template.yaml`:
```yaml
AWSTemplateFormatVersion: "2010-09-09"
Transform: AWS::Serverless-2016-10-31
Description: N3X7 Cotality API (Cognito + HTTP API + Lambda)

Parameters:
  AllowedOrigins:
    Type: CommaDelimitedList
    Default: https://next.eronka.com,https://main.d2tgqj6ewcyky0.amplifyapp.com,http://localhost:3000
  SecretId:
    Type: String
    Default: n3x7/cotality

Resources:
  UserPool:
    Type: AWS::Cognito::UserPool
    Properties:
      UserPoolName: n3x7-staff
      UsernameAttributes: [email]
      AutoVerifiedAttributes: [email]
      AdminCreateUserConfig:
        AllowAdminCreateUserOnly: true
      MfaConfiguration: OPTIONAL
      EnabledMfas: [SOFTWARE_TOKEN_MFA]
      AccountRecoverySetting:
        RecoveryMechanisms:
          - Name: verified_email
            Priority: 1
      Policies:
        PasswordPolicy:
          MinimumLength: 12
          RequireLowercase: true
          RequireUppercase: true
          RequireNumbers: true
          RequireSymbols: true
          TemporaryPasswordValidityDays: 7

  WebClient:
    Type: AWS::Cognito::UserPoolClient
    Properties:
      ClientName: n3x7-web
      UserPoolId: !Ref UserPool
      GenerateSecret: false
      ExplicitAuthFlows: [ALLOW_USER_SRP_AUTH, ALLOW_REFRESH_TOKEN_AUTH]
      PreventUserExistenceErrors: ENABLED
      IdTokenValidity: 1
      AccessTokenValidity: 1
      RefreshTokenValidity: 30
      TokenValidityUnits:
        IdToken: hours
        AccessToken: hours
        RefreshToken: days

  SmokeClient:
    Type: AWS::Cognito::UserPoolClient
    Properties:
      ClientName: n3x7-smoke
      UserPoolId: !Ref UserPool
      GenerateSecret: false
      ExplicitAuthFlows: [ALLOW_ADMIN_USER_PASSWORD_AUTH, ALLOW_REFRESH_TOKEN_AUTH]
      PreventUserExistenceErrors: ENABLED
      IdTokenValidity: 1
      AccessTokenValidity: 1
      RefreshTokenValidity: 1
      TokenValidityUnits:
        IdToken: hours
        AccessToken: hours
        RefreshToken: days

  HttpApi:
    Type: AWS::Serverless::HttpApi
    Properties:
      CorsConfiguration:
        AllowOrigins: !Ref AllowedOrigins
        AllowHeaders: [authorization, content-type]
        AllowMethods: [GET, OPTIONS]
        MaxAge: 600
      DefaultRouteSettings:
        ThrottlingBurstLimit: 20
        ThrottlingRateLimit: 10
      Auth:
        DefaultAuthorizer: Cognito
        Authorizers:
          Cognito:
            IdentitySource: $request.header.Authorization
            JwtConfiguration:
              issuer: !Sub https://cognito-idp.${AWS::Region}.amazonaws.com/${UserPool}
              audience:
                - !Ref WebClient
                - !Ref SmokeClient

  ApiLogGroup:
    Type: AWS::Logs::LogGroup
    Properties:
      LogGroupName: /aws/lambda/n3x7-api
      RetentionInDays: 30

  ApiFunction:
    Type: AWS::Serverless::Function
    DependsOn: ApiLogGroup
    Properties:
      FunctionName: n3x7-api
      CodeUri: dist/
      Handler: handler.handler
      Runtime: nodejs22.x
      Architectures: [arm64]
      MemorySize: 256
      Timeout: 10
      Environment:
        Variables:
          SECRET_ID: !Ref SecretId
      Policies:
        - Statement:
            - Effect: Allow
              Action: secretsmanager:GetSecretValue
              Resource: !Sub arn:aws:secretsmanager:${AWS::Region}:${AWS::AccountId}:secret:${SecretId}-*
      Events:
        Listings:
          Type: HttpApi
          Properties:
            ApiId: !Ref HttpApi
            Path: /listings
            Method: GET
        Campaign:
          Type: HttpApi
          Properties:
            ApiId: !Ref HttpApi
            Path: /listings/{id}/campaign
            Method: GET

Outputs:
  ApiUrl:
    Value: !Sub https://${HttpApi}.execute-api.${AWS::Region}.amazonaws.com
  UserPoolId:
    Value: !Ref UserPool
  UserPoolClientId:
    Value: !Ref WebClient
  SmokeClientId:
    Value: !Ref SmokeClient
```

Run: `aws cloudformation validate-template --template-body file://api/template.yaml --profile n3x7 --region ap-southeast-2 >/dev/null && echo valid`
Expected: `valid`.

- [ ] **Step 2: Scripts**

`api/put-cotality-secret.sh`:
```bash
#!/bin/bash

# Store the Cotality client credentials in Secrets Manager. Never prints them.
set -euo pipefail

AWS_PROFILE=n3x7
REGION=ap-southeast-2
SECRET_ID=n3x7/cotality
ENV_FILE=${1:-$HOME/.config/n3x7/cotality.env}
export COTALITY_BASE_URL=${COTALITY_BASE_URL:-https://api-sbox.corelogic.asia}

echo "🔐 Reading credentials from $ENV_FILE..."
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a
: "${COTALITY_CLIENT_ID:?COTALITY_CLIENT_ID missing in $ENV_FILE}"
: "${COTALITY_CLIENT_SECRET:?COTALITY_CLIENT_SECRET missing in $ENV_FILE}"

TMP=$(mktemp)
chmod 600 "$TMP"
trap 'rm -f "$TMP"' EXIT
python3 -c 'import json,os; print(json.dumps({"clientId": os.environ["COTALITY_CLIENT_ID"], "clientSecret": os.environ["COTALITY_CLIENT_SECRET"], "baseUrl": os.environ["COTALITY_BASE_URL"]}))' > "$TMP"

if aws secretsmanager describe-secret --secret-id $SECRET_ID --region $REGION --profile $AWS_PROFILE > /dev/null 2>&1; then
  aws secretsmanager put-secret-value --secret-id $SECRET_ID --secret-string "file://$TMP" \
    --region $REGION --profile $AWS_PROFILE > /dev/null
  echo "✅ Updated secret $SECRET_ID (base URL: $COTALITY_BASE_URL)"
else
  aws secretsmanager create-secret --name $SECRET_ID --secret-string "file://$TMP" \
    --description "Cotality API client credentials for N3X7" \
    --region $REGION --profile $AWS_PROFILE > /dev/null
  echo "✅ Created secret $SECRET_ID (base URL: $COTALITY_BASE_URL)"
fi
```

`api/deploy-prod.sh`:
```bash
#!/bin/bash

# Build the Cotality API Lambda and deploy the n3x7-api stack to production
set -euo pipefail

echo "🚀 Starting API production deployment process..."

# Variables
AWS_PROFILE=n3x7
REGION=ap-southeast-2
STACK=n3x7-api

cd "$(dirname "$0")"

echo "🔐 Checking AWS credentials..."
ACCOUNT=$(aws sts get-caller-identity --profile $AWS_PROFILE --query Account --output text)
BUCKET=n3x7-deploy-$ACCOUNT
echo "   Account: $ACCOUNT (profile: $AWS_PROFILE)"
echo ""
echo "📋 Source: branch $(git rev-parse --abbrev-ref HEAD), commit $(git rev-parse --short HEAD)"
echo ""

read -p "⚠️  Are you sure you want to deploy the API to PRODUCTION? (yes/no): " confirm
if [ "$confirm" != "yes" ]; then
  echo "❌ Deployment cancelled"
  exit 0
fi

echo ""
echo "📦 Installing dependencies..."
pnpm install --frozen-lockfile > /dev/null
echo "🧪 Running tests..."
pnpm test > /dev/null
pnpm typecheck
echo "🏗️  Building Lambda bundle..."
rm -rf dist
pnpm build > /dev/null

if ! aws s3api head-bucket --bucket "$BUCKET" --profile $AWS_PROFILE > /dev/null 2>&1; then
  echo "🪣 Creating deployment bucket $BUCKET..."
  aws s3api create-bucket --bucket "$BUCKET" --region $REGION \
    --create-bucket-configuration LocationConstraint=$REGION --profile $AWS_PROFILE > /dev/null
  aws s3api put-public-access-block --bucket "$BUCKET" --profile $AWS_PROFILE \
    --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
fi

echo "⬆️  Packaging..."
aws cloudformation package --template-file template.yaml --s3-bucket "$BUCKET" --s3-prefix $STACK \
  --output-template-file packaged.yaml --region $REGION --profile $AWS_PROFILE > /dev/null

echo "🔄 Deploying stack $STACK..."
aws cloudformation deploy --template-file packaged.yaml --stack-name $STACK \
  --capabilities CAPABILITY_IAM CAPABILITY_AUTO_EXPAND --no-fail-on-empty-changeset \
  --region $REGION --profile $AWS_PROFILE
rm -f packaged.yaml

echo ""
echo "✅ API deployment complete!"
echo "=========================================="
aws cloudformation describe-stacks --stack-name $STACK --region $REGION --profile $AWS_PROFILE \
  --query 'Stacks[0].Outputs[].[OutputKey,OutputValue]' --output table
echo ""
echo "🔗 Useful commands:"
echo "   Logs: aws logs tail /aws/lambda/n3x7-api --follow --region $REGION --profile $AWS_PROFILE"
echo "   Smoke test: ./smoke.sh"
```

`api/create-user.sh`:
```bash
#!/bin/bash

# Invite a staff member to N3X7. Cognito emails them a temporary password.
set -euo pipefail

AWS_PROFILE=n3x7
REGION=ap-southeast-2
STACK=n3x7-api
EMAIL=${1:?usage: ./create-user.sh <email> "<full name>"}
NAME=${2:?usage: ./create-user.sh <email> "<full name>"}

POOL=$(aws cloudformation describe-stacks --stack-name $STACK --region $REGION --profile $AWS_PROFILE \
  --query "Stacks[0].Outputs[?OutputKey=='UserPoolId'].OutputValue" --output text)

aws cognito-idp admin-create-user --user-pool-id "$POOL" --username "$EMAIL" \
  --user-attributes Name=email,Value="$EMAIL" Name=email_verified,Value=true Name=name,Value="$NAME" \
  --desired-delivery-mediums EMAIL --region $REGION --profile $AWS_PROFILE > /dev/null

echo "✅ Invited $EMAIL ($NAME). Cognito has emailed a temporary password, valid for 7 days."
echo "   They set a new password on first sign-in at https://next.eronka.com/login"
```

`api/smoke.sh`:
```bash
#!/bin/bash

# Smoke-test the deployed API with a throwaway smoke user. Prints statuses only, never tokens.
set -euo pipefail

AWS_PROFILE=n3x7
REGION=ap-southeast-2
STACK=n3x7-api
SMOKE_USER=smoke-test@n3x7.invalid

out() {
  aws cloudformation describe-stacks --stack-name $STACK --region $REGION --profile $AWS_PROFILE \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}
API=$(out ApiUrl)
POOL=$(out UserPoolId)
CLIENT=$(out SmokeClientId)

if ! aws cognito-idp admin-get-user --user-pool-id "$POOL" --username $SMOKE_USER \
  --region $REGION --profile $AWS_PROFILE > /dev/null 2>&1; then
  aws cognito-idp admin-create-user --user-pool-id "$POOL" --username $SMOKE_USER \
    --user-attributes Name=email,Value=$SMOKE_USER Name=name,Value="Smoke Test" \
    --message-action SUPPRESS --region $REGION --profile $AWS_PROFILE > /dev/null
fi
PASS="Sm0ke!$(openssl rand -hex 12)"
aws cognito-idp admin-set-user-password --user-pool-id "$POOL" --username $SMOKE_USER \
  --password "$PASS" --permanent --region $REGION --profile $AWS_PROFILE
TOKEN=$(aws cognito-idp admin-initiate-auth --user-pool-id "$POOL" --client-id "$CLIENT" \
  --auth-flow ADMIN_USER_PASSWORD_AUTH --auth-parameters USERNAME=$SMOKE_USER,PASSWORD="$PASS" \
  --region $REGION --profile $AWS_PROFILE --query 'AuthenticationResult.IdToken' --output text)

fail=0
check() { # name expected actual
  if [ "$2" = "$3" ]; then echo "✅ $1 → $3"; else echo "❌ $1 → $3 (expected $2)"; fail=1; fi
}

code=$(curl -s -o /dev/null -w '%{http_code}' "$API/listings?suburb=Blacktown")
check "no token" 401 "$code"

code=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $TOKEN" "$API/listings?suburb=Glebe")
check "unsupported suburb" 400 "$code"

for s in Blacktown "Quakers%20Hill" "Seven%20Hills"; do
  body=$(curl -s -w '\n%{http_code}' -H "Authorization: Bearer $TOKEN" "$API/listings?suburb=$s")
  code=$(echo "$body" | tail -1)
  count=$(echo "$body" | sed '$d' | python3 -c 'import sys,json; print(len(json.load(sys.stdin).get("listings",[])))' 2>/dev/null || echo 0)
  check "listings $s (count $count)" 200 "$code"
  [ "$count" -gt 0 ] || { echo "❌ listings $s returned no listings"; fail=1; }
done

ID=$(curl -s -H "Authorization: Bearer $TOKEN" "$API/listings?suburb=Blacktown" \
  | python3 -c 'import sys,json; l=json.load(sys.stdin)["listings"]; print(next((x["cotalityId"] for x in l if x.get("agentName")), l[0]["cotalityId"]))')
code=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $TOKEN" "$API/listings/$ID/campaign")
check "campaign for a listed property" 200 "$code"

code=$(curl -s -o /dev/null -w '%{http_code}' -X OPTIONS -H "Origin: https://next.eronka.com" \
  -H "Access-Control-Request-Method: GET" -H "Access-Control-Request-Headers: authorization" "$API/listings")
check "CORS preflight" 204 "$code"

exit $fail
```

Run: `chmod +x api/*.sh && for f in api/*.sh; do bash -n "$f" && echo "$f ok"; done`
Expected: four `ok` lines.

- [ ] **Step 3: Commit**

```bash
git add api/template.yaml api/*.sh
git commit -m "feat(api): SAM stack (Cognito, HTTP API, Lambda) and deploy/secret/user/smoke scripts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 4: Store the secret and deploy**

This creates AWS resources, which the user approved in the spec. Run:
```bash
./api/put-cotality-secret.sh
echo yes | ./api/deploy-prod.sh
```
Expected:
- `✅ Created secret n3x7/cotality (base URL: https://api-sbox.corelogic.asia)`
- the stack reaches CREATE_COMPLETE, and the outputs table shows `ApiUrl`, `UserPoolId`, `UserPoolClientId` and `SmokeClientId`

- [ ] **Step 5: Smoke test**

Run: `./api/smoke.sh`
Expected: every line ✅, exit 0. If the campaign check gives 404 because the active-flag mismatch noted in the spec risk is real, stop and record a ruling before changing `mapCampaign`.

---

### Task 5: Cognito sign-in on the front end

**Files:**
- Create: `lib/config.ts`, `lib/claims.ts`, `lib/claims.test.ts`, `lib/auth.ts`
- Modify: `lib/store.tsx`, `app/login/page.tsx`, `lib/mock-data.ts` (remove `DEMO_USER.password`), `lib/mock-data.test.ts` (if it asserts on the password), `package.json` (dependency)

**Interfaces:**
- Produces:
  - `config: { apiUrl: string; userPoolId: string; userPoolClientId: string }`
  - `userFromClaims(claims: Record<string, unknown>): DemoUser`
  - `authErrorMessage(err: { name?: string; message?: string }): string`
  - `type SignInResult = { status: "ok"; user: DemoUser } | { status: "new-password-required" } | { status: "error"; message: string }`
  - `signInWithPassword(email: string, password: string): Promise<SignInResult>`
  - `completeNewPassword(newPassword: string): Promise<SignInResult>`
  - `currentUser(): Promise<DemoUser | null>`
  - `getIdToken(): Promise<string | null>`
  - `signOutCognito(): void`
  - store: `signIn(email, password): Promise<SignInResult>` and `completeNewPassword(pw): Promise<SignInResult>`

- [ ] **Step 1: Dependency**

Run: `pnpm add amazon-cognito-identity-js@6.3.22`
Expected: added to `dependencies`, lockfile updated.

- [ ] **Step 2: Write the failing test**

`lib/claims.test.ts`:
```ts
import { test } from "node:test"
import assert from "node:assert/strict"
import { authErrorMessage, userFromClaims } from "./claims.ts"

test("userFromClaims uses the name claim", () => {
  assert.deepEqual(userFromClaims({ email: "a@x.com", name: "Armin Nehzat" }), {
    email: "a@x.com", name: "Armin Nehzat", role: "Acquisitions Analyst",
  })
})

test("userFromClaims falls back to the email local part", () => {
  assert.equal(userFromClaims({ email: "trong@eroka.com" }).name, "trong")
  assert.equal(userFromClaims({}).email, "")
})

test("authErrorMessage hides whether the user exists", () => {
  assert.equal(authErrorMessage({ name: "NotAuthorizedException", message: "x" }), "Incorrect email or password.")
  assert.equal(authErrorMessage({ name: "UserNotFoundException" }), "Incorrect email or password.")
})

test("authErrorMessage passes through password policy messages", () => {
  assert.equal(
    authErrorMessage({ name: "InvalidPasswordException", message: "Password not long enough" }),
    "Password not long enough",
  )
  assert.equal(authErrorMessage({}), "Sign-in failed. Please try again.")
})
```

Run: `node --test lib/claims.test.ts`
Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement `config`, `claims` and `auth`**

`lib/config.ts`:
```ts
// Public identifiers (not secrets), inlined at build time from .env.
export const config = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? "",
  userPoolId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID ?? "",
  userPoolClientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID ?? "",
}
```

`lib/claims.ts`:
```ts
import type { DemoUser } from "./types"

export function userFromClaims(claims: Record<string, unknown>): DemoUser {
  const email = typeof claims.email === "string" ? claims.email : ""
  const name = typeof claims.name === "string" && claims.name.trim() ? claims.name.trim() : email.split("@")[0]
  return { email, name, role: "Acquisitions Analyst" }
}

export function authErrorMessage(err: { name?: string; message?: string }): string {
  switch (err.name) {
    case "NotAuthorizedException":
    case "UserNotFoundException":
      return "Incorrect email or password."
    case "InvalidPasswordException":
    case "PasswordResetRequiredException":
    case "LimitExceededException":
      return err.message ?? "Sign-in failed. Please try again."
    default:
      return "Sign-in failed. Please try again."
  }
}
```

`lib/auth.ts`:
```ts
import {
  AuthenticationDetails,
  CognitoUser,
  CognitoUserPool,
  type CognitoUserSession,
} from "amazon-cognito-identity-js"
import { config } from "./config"
import { authErrorMessage, userFromClaims } from "./claims"
import type { DemoUser } from "./types"

export type SignInResult =
  | { status: "ok"; user: DemoUser }
  | { status: "new-password-required" }
  | { status: "error"; message: string }

let pool: CognitoUserPool | null = null
/** Null when the Cognito IDs aren't configured (e.g. no .env yet); the constructor throws on bad IDs. */
function getPool(): CognitoUserPool | null {
  if (!pool && config.userPoolId && config.userPoolClientId) {
    try {
      pool = new CognitoUserPool({ UserPoolId: config.userPoolId, ClientId: config.userPoolClientId })
    } catch {
      return null
    }
  }
  return pool
}

// The Cognito user waiting on a NEW_PASSWORD_REQUIRED challenge.
let pending: CognitoUser | null = null

function callbacks(user: CognitoUser, resolve: (r: SignInResult) => void) {
  return {
    onSuccess: (s: CognitoUserSession) =>
      resolve({ status: "ok", user: userFromClaims(s.getIdToken().decodePayload()) }),
    onFailure: (err: { name?: string; message?: string }) =>
      resolve({ status: "error", message: authErrorMessage(err) }),
    newPasswordRequired: () => {
      pending = user
      resolve({ status: "new-password-required" })
    },
  }
}

export function signInWithPassword(email: string, password: string): Promise<SignInResult> {
  const p = getPool()
  if (!p) return Promise.resolve({ status: "error", message: "Sign-in isn't configured for this build." })
  const user = new CognitoUser({ Username: email, Pool: p })
  return new Promise((resolve) =>
    user.authenticateUser(
      new AuthenticationDetails({ Username: email, Password: password }),
      callbacks(user, resolve),
    ),
  )
}

export function completeNewPassword(newPassword: string): Promise<SignInResult> {
  const user = pending
  if (!user) return Promise.resolve({ status: "error", message: "Please sign in again." })
  return new Promise((resolve) =>
    user.completeNewPasswordChallenge(newPassword, {}, callbacks(user, resolve)),
  )
}

function session(): Promise<CognitoUserSession | null> {
  const user = getPool()?.getCurrentUser()
  if (!user) return Promise.resolve(null)
  return new Promise((resolve) =>
    // getSession refreshes an expired ID token with the refresh token.
    user.getSession((err: Error | null, s: CognitoUserSession | null) =>
      resolve(err || !s?.isValid() ? null : s),
    ),
  )
}

export async function currentUser(): Promise<DemoUser | null> {
  const s = await session()
  return s ? userFromClaims(s.getIdToken().decodePayload()) : null
}

export async function getIdToken(): Promise<string | null> {
  return (await session())?.getIdToken().getJwtToken() ?? null
}

export function signOutCognito() {
  getPool()?.getCurrentUser()?.signOut()
  pending = null
}
```

Run: `node --test lib/claims.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 4: Store wiring**

In `lib/store.tsx`:
1. Add the import `import { completeNewPassword as cognitoNewPassword, currentUser, signInWithPassword, signOutCognito, type SignInResult } from "./auth"`.
2. Remove `DEMO_USER` from the `./mock-data` import.
3. In `N3X7State`, replace `signIn: (email: string) => void` with:
   ```ts
   signIn: (email: string, password: string) => Promise<SignInResult>
   completeNewPassword: (newPassword: string) => Promise<SignInResult>
   ```
4. Remove `user: "n3x7.user"` from `KEYS`, and remove the `useEffect` that saves `KEYS.user`.
5. Replace the hydration effect with:
   ```ts
   // Restore the Cognito session and the browser-only demo state after mount.
   useEffect(() => {
     let alive = true
     currentUser().then((u) => {
       if (!alive) return
       setUser(u)
       setSavedIds(loadJSON<string[]>(KEYS.saved, []))
       setContractRequests(loadJSON<Record<string, ContractRequest>>(KEYS.contracts, {}))
       setHydrated(true)
     })
     return () => {
       alive = false
     }
   }, [])
   ```
6. Replace `signIn` with:
   ```ts
   const signIn = useCallback(async (email: string, password: string) => {
     const r = await signInWithPassword(email, password)
     if (r.status === "ok") setUser(r.user)
     return r
   }, [])

   const completeNewPassword = useCallback(async (newPassword: string) => {
     const r = await cognitoNewPassword(newPassword)
     if (r.status === "ok") setUser(r.user)
     return r
   }, [])
   ```
7. In `signOut`, add `signOutCognito()` as the first line.
8. Add `completeNewPassword` to the context value object and to the `useMemo` dependency list.

In `lib/mock-data.ts`, remove the `password` field from `DEMO_USER`. If `lib/mock-data.test.ts` references it, remove that assertion.

- [ ] **Step 5: Login page**

Replace `app/login/page.tsx` with:
```tsx
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Hexagon, Loader2 } from "lucide-react"
import { useN3X7 } from "@/lib/store"
import type { SignInResult } from "@/lib/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export default function LoginPage() {
  const { signIn, completeNewPassword } = useN3X7()
  const router = useRouter()
  const [step, setStep] = useState<"sign-in" | "new-password">("sign-in")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function handle(r: SignInResult) {
    if (r.status === "ok") router.replace("/")
    else if (r.status === "new-password-required") setStep("new-password")
    else setError(r.message)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      handle(
        step === "sign-in"
          ? await signIn(email.trim(), password)
          : await completeNewPassword(newPassword),
      )
    } finally {
      setBusy(false)
    }
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
          <h1 className="text-xl font-semibold text-foreground">
            {step === "sign-in" ? "Staff sign in" : "Set a new password"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {step === "sign-in"
              ? "AI property intelligence for acquisitions teams."
              : "Choose a password of at least 12 characters with upper and lower case letters, a number and a symbol."}
          </p>
        </div>
        {step === "sign-in" ? (
          <>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Email</span>
              <Input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Password</span>
              <Input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </label>
          </>
        ) : (
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">New password</span>
            <Input
              type="password"
              required
              minLength={12}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
            />
          </label>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy && <Loader2 className="size-4 animate-spin" />}
          {step === "sign-in" ? "Sign in" : "Save password"}
        </Button>
      </form>
    </div>
  )
}
```

- [ ] **Step 6: Verify**

Run: `pnpm test && pnpm exec tsc --noEmit && pnpm build > /tmp/n3x7-build.log 2>&1; echo build $?`
Expected:
- all tests pass (24 existing + 4 new = 28)
- tsc clean
- `build 0`

If the build fails with `global is not defined` from `amazon-cognito-identity-js`, add `<script>window.global ||= window</script>` via `next/script` with `strategy="beforeInteractive"` in `app/layout.tsx`, and record a ruling.

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml lib/config.ts lib/claims.ts lib/claims.test.ts lib/auth.ts lib/store.tsx app/login/page.tsx lib/mock-data.ts lib/mock-data.test.ts
git commit -m "feat: replace demo login with Cognito sign-in (SRP, first-login password change)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Live data source: API client, store, panel and markers

**Files:**
- Create: `lib/live.ts`, `lib/live.test.ts`, `components/source-switch.tsx`, `components/live-listing-card.tsx`, `components/live-panel.tsx`
- Modify: `lib/types.ts`, `lib/store.tsx`, `components/discovery-panel.tsx`, `components/property-map.tsx`

**Interfaces:**
- Consumes: `config.apiUrl` and `getIdToken()` (Task 5); the API contract (Task 3).
- Produces:
  - In `lib/types.ts`: `LiveListing`, `LiveCampaign` (identical to `api/src/types.ts`), `ListingsResponse`
  - `LIVE_SUBURBS`, `LIVE_TYPES`, `landAreaOptions`, `LiveQuery`, `defaultLiveQuery`
  - `listingsUrl(base, q)`, `campaignUrl(base, cotalityId)`
  - `isListingsResponse(x)`, `isLiveCampaign(x)`
  - `centerOf(listings): [number, number] | null`
  - `class LiveError`, `fetchLive<T>(url, token, guard)`
  - store: `dataSource: "demo" | "live"`, `setDataSource`, `liveQuery`, `setLiveQuery(patch)`, `live: LiveState`, `selectedLive: LiveListing | null`, `openLive(l)`, `closeLive()`, `savedLive: Record<string, LiveListing>`, `toggleSaveLive(l)`. `isSaved(id)` also covers live IDs.

- [ ] **Step 1: Types**

Append to `lib/types.ts` the same `LiveListing`, `LiveCampaign` and `ListingsResponse` interfaces as in `api/src/types.ts` (Task 1, Step 2), verbatim.

- [ ] **Step 2: Write the failing tests**

`lib/live.test.ts`:
```ts
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  LiveError, campaignUrl, centerOf, fetchLive, isListingsResponse, listingsUrl,
} from "./live.ts"

test("listingsUrl encodes the query", () => {
  assert.equal(
    listingsUrl("https://api.test", { suburb: "Quakers Hill", types: ["HOUSE", "LAND"], minLandArea: 500, page: 1 }),
    "https://api.test/listings?suburb=Quakers%20Hill&page=1&types=HOUSE%2CLAND&minLandArea=500",
  )
  assert.equal(
    listingsUrl("https://api.test/", { suburb: "Blacktown", types: [], minLandArea: 0, page: 0 }),
    "https://api.test/listings?suburb=Blacktown&page=0",
  )
})

test("campaignUrl", () => {
  assert.equal(campaignUrl("https://api.test", 42), "https://api.test/listings/42/campaign")
})

test("isListingsResponse checks the shape", () => {
  assert.equal(isListingsResponse({ suburb: "B", page: 0, total: 0, totalPages: 0, listings: [] }), true)
  assert.equal(isListingsResponse({ listings: "nope" }), false)
  assert.equal(isListingsResponse(null), false)
})

test("centerOf averages coordinates", () => {
  assert.deepEqual(centerOf([{ lat: -33, lng: 150 }, { lat: -34, lng: 151 }] as never), [-33.5, 150.5])
  assert.equal(centerOf([]), null)
})

test("fetchLive surfaces the API error message", async () => {
  const realFetch = globalThis.fetch
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ error: "Cotality quota exceeded, try later" }), { status: 503 })) as typeof fetch
  try {
    await assert.rejects(
      fetchLive("https://api.test/listings", "tok", isListingsResponse),
      (e) => e instanceof LiveError && e.status === 503 && e.message === "Cotality quota exceeded, try later",
    )
  } finally {
    globalThis.fetch = realFetch
  }
})

test("fetchLive maps 401 to a session-expired message", async () => {
  const realFetch = globalThis.fetch
  globalThis.fetch = (async () => new Response(JSON.stringify({ message: "Unauthorized" }), { status: 401 })) as typeof fetch
  try {
    await assert.rejects(fetchLive("u", "t", isListingsResponse), /Your session has expired/)
  } finally {
    globalThis.fetch = realFetch
  }
})

test("fetchLive rejects unexpected shapes and network failures", async () => {
  const realFetch = globalThis.fetch
  try {
    globalThis.fetch = (async () => new Response("{}", { status: 200 })) as typeof fetch
    await assert.rejects(fetchLive("u", "t", isListingsResponse), /Unexpected response/)
    globalThis.fetch = (async () => { throw new TypeError("fetch failed") }) as typeof fetch
    await assert.rejects(fetchLive("u", "t", isListingsResponse), /Can't reach the N3X7 API/)
  } finally {
    globalThis.fetch = realFetch
  }
})
```

Run: `node --test lib/live.test.ts`
Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement `lib/live.ts`**

```ts
import type { ListingsResponse, LiveCampaign, LiveListing } from "./types"

export const LIVE_SUBURBS = ["Blacktown", "Quakers Hill", "Seven Hills"] as const
export const LIVE_TYPES = [
  { id: "HOUSE", label: "House" },
  { id: "UNIT", label: "Unit" },
  { id: "LAND", label: "Land" },
] as const
export const landAreaOptions = [0, 300, 500, 800, 1000]

export interface LiveQuery {
  suburb: string
  types: string[]
  minLandArea: number
  page: number
}

export const defaultLiveQuery: LiveQuery = { suburb: "Blacktown", types: [], minLandArea: 0, page: 0 }

const trim = (base: string) => base.replace(/\/+$/, "")

export function listingsUrl(base: string, q: LiveQuery): string {
  const p = new URLSearchParams({ suburb: q.suburb, page: String(q.page) })
  if (q.types.length) p.set("types", q.types.join(","))
  if (q.minLandArea > 0) p.set("minLandArea", String(q.minLandArea))
  // %20, not "+", for spaces: API Gateway passes "+" through literally.
  return `${trim(base)}/listings?${p.toString().replace(/\+/g, "%20")}`
}

export function campaignUrl(base: string, cotalityId: number): string {
  return `${trim(base)}/listings/${cotalityId}/campaign`
}

export function isListingsResponse(x: unknown): x is ListingsResponse {
  const r = x as ListingsResponse | null
  return !!r && typeof r === "object" && Array.isArray(r.listings) && typeof r.total === "number"
}

export function isLiveCampaign(x: unknown): x is LiveCampaign {
  return !!x && typeof x === "object" && "agentName" in x
}

export function centerOf(listings: Pick<LiveListing, "lat" | "lng">[]): [number, number] | null {
  if (!listings.length) return null
  const lat = listings.reduce((s, l) => s + l.lat, 0) / listings.length
  const lng = listings.reduce((s, l) => s + l.lng, 0) / listings.length
  return [lat, lng]
}

export class LiveError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = "LiveError"
    this.status = status
  }
}

export async function fetchLive<T>(
  url: string,
  token: string,
  guard: (x: unknown) => x is T,
): Promise<T> {
  let r: Response
  try {
    r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  } catch {
    throw new LiveError(0, "Can't reach the N3X7 API.")
  }
  const body: unknown = await r.json().catch(() => null)
  if (!r.ok) {
    const msg = (body as { error?: unknown } | null)?.error
    throw new LiveError(
      r.status,
      r.status === 401
        ? "Your session has expired. Sign in again."
        : typeof msg === "string"
          ? msg
          : `Request failed (${r.status}).`,
    )
  }
  if (!guard(body)) throw new LiveError(r.status, "Unexpected response from the N3X7 API.")
  return body
}
```

Run: `node --test lib/live.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 4: Store**

In `lib/store.tsx`:
1. Imports: `import { config } from "./config"`, `import { getIdToken } from "./auth"` (merge into the Task 5 import), `import { centerOf, defaultLiveQuery, fetchLive, isListingsResponse, listingsUrl, type LiveQuery } from "./live"`, and add `LiveListing` to the `./types` type import.
2. Above `N3X7State`, add:
   ```ts
   export type DataSource = "demo" | "live"
   export interface LiveState {
     status: "idle" | "loading" | "ok" | "error"
     listings: LiveListing[]
     total: number
     totalPages: number
     error: string | null
   }
   const idleLive: LiveState = { status: "idle", listings: [], total: 0, totalPages: 0, error: null }
   ```
3. Add to `N3X7State`:
   ```ts
   dataSource: DataSource
   setDataSource: (s: DataSource) => void
   liveQuery: LiveQuery
   setLiveQuery: (patch: Partial<LiveQuery>) => void
   live: LiveState
   selectedLive: LiveListing | null
   openLive: (l: LiveListing) => void
   closeLive: () => void
   ```
4. State and callbacks in the provider:
   ```ts
   const [dataSource, setDataSource] = useState<DataSource>("demo")
   const [liveQuery, setLiveQueryState] = useState<LiveQuery>(defaultLiveQuery)
   const [live, setLive] = useState<LiveState>(idleLive)
   const [selectedLive, setSelectedLive] = useState<LiveListing | null>(null)

   // Any filter change returns to the first page unless a page is given.
   const setLiveQuery = useCallback((patch: Partial<LiveQuery>) => {
     setLiveQueryState((prev) => ({ ...prev, ...patch, page: patch.page ?? 0 }))
   }, [])
   const openLive = useCallback((l: LiveListing) => {
     setDrawerOpen(false)
     setSelectedLive(l)
   }, [])
   const closeLive = useCallback(() => setSelectedLive(null), [])

   useEffect(() => {
     if (dataSource !== "live" || !user) return
     let cancelled = false
     setLive((s) => ({ ...s, status: "loading", error: null }))
     ;(async () => {
       try {
         const token = await getIdToken()
         if (!token) throw new Error("Your session has expired. Sign in again.")
         const res = await fetchLive(listingsUrl(config.apiUrl, liveQuery), token, isListingsResponse)
         if (cancelled) return
         setLive({ status: "ok", listings: res.listings, total: res.total, totalPages: res.totalPages, error: null })
         const center = centerOf(res.listings)
         if (center) setFlyTarget({ center, zoom: 14, key: Date.now() })
       } catch (e) {
         if (!cancelled) {
           setLive({ ...idleLive, status: "error", error: e instanceof Error ? e.message : "Something went wrong." })
         }
       }
     })()
     return () => {
       cancelled = true
     }
   }, [dataSource, liveQuery, user])
   ```
5. In `signOut`, also reset: `setDataSource("demo")`, `setLiveQueryState(defaultLiveQuery)`, `setLive(idleLive)`, `setSelectedLive(null)`.
6. Add all eight new members to the context value and the `useMemo` dependency list (`dataSource`, `liveQuery`, `setLiveQuery`, `live`, `selectedLive`, `openLive`, `closeLive`; `setDataSource` is a state setter, so it's stable).
7. Saved live listings (the live card and drawer both need them):

1. `KEYS`: add `savedLive: "n3x7.savedLive"`.
2. State: `const [savedLive, setSavedLive] = useState<Record<string, LiveListing>>({})`
3. In the hydration effect, add `setSavedLive(loadJSON<Record<string, LiveListing>>(KEYS.savedLive, {}))`.
4. Persist: `useEffect(() => { if (hydrated) saveJSON(KEYS.savedLive, savedLive) }, [hydrated, savedLive])`
5. Callback:
   ```ts
   // Live listings aren't in the bundled data, so a snapshot is saved alongside the id.
   const toggleSaveLive = useCallback((l: LiveListing) => {
     setSavedLive((prev) => {
       const next = { ...prev }
       if (next[l.id]) delete next[l.id]
       else next[l.id] = l
       return next
     })
   }, [])
   ```
6. Change `isSaved` in the value to `(id: string) => savedIds.includes(id) || id in savedLive`.
7. `signOut`: add `setSavedLive({})`.
8. Add `savedLive: Record<string, LiveListing>` and `toggleSaveLive: (l: LiveListing) => void` to `N3X7State`, the value object, and the deps (`savedLive`, `toggleSaveLive`).



- [ ] **Step 5: Source switch, live card and live panel**

`components/source-switch.tsx`:
```tsx
"use client"

import { useN3X7 } from "@/lib/store"
import { cn } from "@/lib/utils"

export function SourceSwitch() {
  const { dataSource, setDataSource } = useN3X7()
  const options = [
    { id: "demo", label: "Demo listings" },
    { id: "live", label: "Live · Cotality" },
  ] as const
  return (
    <div className="flex rounded-lg border border-border p-0.5" role="group" aria-label="Data source">
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => setDataSource(o.id)}
          aria-pressed={dataSource === o.id}
          className={cn(
            "rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
            dataSource === o.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
```

`components/live-listing-card.tsx`:
```tsx
"use client"

import { Bath, BedDouble, Bookmark, Car, LandPlot, MapPin } from "lucide-react"
import type { LiveListing } from "@/lib/types"
import { useN3X7 } from "@/lib/store"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function LiveListingCard({ listing: l }: { listing: LiveListing }) {
  const { openLive, isSaved, toggleSaveLive } = useN3X7()
  const saved = isSaved(l.id)
  return (
    <div className="glass overflow-hidden rounded-2xl">
      <img src={l.image ?? "/placeholder.svg"} alt={l.address} className="h-40 w-full object-cover" />
      <div className="space-y-3 p-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{l.address}</h3>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="size-3" />
            {l.suburb} {l.state}
          </p>
        </div>
        <p className="font-mono text-lg font-semibold text-foreground">{l.priceLabel ?? "Price on request"}</p>
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          {l.beds !== null && <span className="flex items-center gap-1"><BedDouble className="size-3.5" />{l.beds}</span>}
          {l.baths !== null && <span className="flex items-center gap-1"><Bath className="size-3.5" />{l.baths}</span>}
          {l.parking !== null && <span className="flex items-center gap-1"><Car className="size-3.5" />{l.parking}</span>}
          {l.landSize !== null && <span className="flex items-center gap-1"><LandPlot className="size-3.5" />{l.landSize} m²</span>}
        </div>
        {(l.agentName || l.agency) && (
          <p className="text-xs text-muted-foreground">
            {[l.agentName, l.agency].filter(Boolean).join(" · ")}
          </p>
        )}
        <div className="flex gap-2">
          <Button size="sm" className="flex-1" onClick={() => openLive(l)}>
            View Details
          </Button>
          <Button
            size="sm"
            variant={saved ? "secondary" : "outline"}
            onClick={() => toggleSaveLive(l)}
            aria-label={saved ? "Unsave" : "Save"}
          >
            <Bookmark className={cn("size-4", saved && "fill-current")} />
          </Button>
        </div>
      </div>
    </div>
  )
}
```

`components/live-panel.tsx`:
```tsx
"use client"

import { Info, Loader2, TrendingUp } from "lucide-react"
import { useN3X7 } from "@/lib/store"
import { LIVE_SUBURBS, LIVE_TYPES, landAreaOptions } from "@/lib/live"
import { LiveListingCard } from "./live-listing-card"
import { SourceSwitch } from "./source-switch"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function LivePanel() {
  const { liveQuery: q, setLiveQuery, live } = useN3X7()
  const toggleType = (id: string) =>
    setLiveQuery({ types: q.types.includes(id) ? q.types.filter((t) => t !== id) : [...q.types, id] })

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="shrink-0 space-y-3 border-b border-border px-4 py-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-foreground">Property Discovery</h2>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <TrendingUp className="size-3.5 text-success" />
              {live.status === "ok" ? `${live.total} for sale in ${q.suburb}` : `Live listings in ${q.suburb}`}
            </p>
          </div>
          <SourceSwitch />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <label className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs text-muted-foreground">
            Suburb
            <select
              value={q.suburb}
              onChange={(e) => setLiveQuery({ suburb: e.target.value })}
              className="bg-transparent py-0.5 font-medium text-foreground outline-none"
              aria-label="Suburb"
            >
              {LIVE_SUBURBS.map((s) => (
                <option key={s} value={s} className="bg-popover">{s}</option>
              ))}
            </select>
          </label>
          {LIVE_TYPES.map((t) => (
            <button
              key={t.id}
              onClick={() => toggleType(t.id)}
              aria-pressed={q.types.includes(t.id)}
              className={cn(
                "rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
                q.types.includes(t.id)
                  ? "border-primary/60 bg-primary/15 text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
          <label className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs text-muted-foreground">
            Land
            <select
              value={q.minLandArea}
              onChange={(e) => setLiveQuery({ minLandArea: Number(e.target.value) })}
              className="bg-transparent py-0.5 font-medium text-foreground outline-none"
              aria-label="Minimum land area"
            >
              {landAreaOptions.map((n) => (
                <option key={n} value={n} className="bg-popover">{n === 0 ? "Any" : `${n} m²+`}</option>
              ))}
            </select>
          </label>
        </div>

        <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
          <Info className="mt-px size-3 shrink-0" />
          Sandbox data: Blacktown, Quakers Hill, Seven Hills only. Frontage and TOD flags aren&apos;t available from
          Cotality yet.
        </p>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 p-4">
          {live.status === "loading" || live.status === "idle" ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading live listings…
            </div>
          ) : live.status === "error" ? (
            <div role="alert" className="glass space-y-3 rounded-2xl p-4 text-center">
              <p className="text-sm text-foreground">{live.error}</p>
              <button
                onClick={() => setLiveQuery({ page: q.page })}
                className="text-xs font-medium text-primary hover:underline"
              >
                Try again
              </button>
            </div>
          ) : live.listings.length === 0 ? (
            <div className="glass rounded-2xl p-4 text-center text-sm text-foreground">
              No listings match these filters.
            </div>
          ) : (
            <>
              {live.listings.map((l) => (
                <LiveListingCard key={l.id} listing={l} />
              ))}
              {live.totalPages > 1 && (
                <div className="flex items-center justify-between pt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={q.page === 0}
                    onClick={() => setLiveQuery({ page: q.page - 1 })}
                  >
                    Previous
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Page {q.page + 1} of {live.totalPages}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={q.page + 1 >= live.totalPages}
                    onClick={() => setLiveQuery({ page: q.page + 1 })}
                  >
                    Next
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
```

- [ ] **Step 6: Discovery panel switch**

In `components/discovery-panel.tsx`:
1. Add imports `import { LivePanel } from "./live-panel"` and `import { SourceSwitch } from "./source-switch"`.
2. Change the `useN3X7()` destructure to also take `dataSource`.
3. After the `frontageChoices` line and before `return (`, add: `if (dataSource === "live") return <LivePanel />`
4. Replace the `<span …>Demo listings</span>` element with `<SourceSwitch />`.

- [ ] **Step 7: Live markers on the map**

In `components/property-map.tsx`:
1. Add `import type { LiveListing } from "@/lib/types"`.
2. Below `markerIcon`, add:
   ```ts
   const LIVE_COLOR = "#4aa8ff"

   function liveMarkerIcon(l: LiveListing, active: boolean) {
     const label = l.price !== null ? formatPriceShort(l.price) : (l.method ?? "For sale")
     const html = `
       <div style="transform: translate(-50%, -100%); position:relative; display:flex; flex-direction:column; align-items:center;">
         <div style="display:flex; align-items:center; gap:5px; padding:4px 8px 4px 5px; border-radius:999px;
           background:${active ? LIVE_COLOR : "rgba(28,33,43,0.92)"}; border:1.5px solid ${LIVE_COLOR};
           box-shadow:0 4px 14px rgba(0,0,0,0.45); white-space:nowrap;">
           <span style="display:flex; align-items:center; justify-content:center; width:20px; height:20px; border-radius:50%; background:${LIVE_COLOR};">
             <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none"
               stroke="#0f1319" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${typeSvg[l.type]}</svg>
           </span>
           <span style="font-family:var(--font-mono, monospace); font-size:11px; font-weight:700; color:${active ? "#0f1319" : "#fff"};">
             ${label.replace(/</g, "&lt;")}
           </span>
         </div>
         <div style="width:2px; height:9px; background:${LIVE_COLOR};"></div>
       </div>`
     return L.divIcon({ className: "n3x7-marker", html, iconSize: [0, 0], iconAnchor: [0, 0] })
   }
   ```
3. In `MapController`, take `selectedLive` from `useN3X7()` and add:
   ```ts
   useEffect(() => {
     if (selectedLive) map.flyTo([selectedLive.lat, selectedLive.lng], 16, { duration: 0.8 })
   }, [map, selectedLive])
   ```
4. In `PropertyMap`, take `dataSource`, `live`, `openLive` and `selectedLive` from `useN3X7()`. Change the existing marker block's condition from `{layers.listings &&` to `{layers.listings && dataSource === "demo" &&`. After that block, add:
   ```tsx
   {layers.listings &&
     dataSource === "live" &&
     live.listings.map((l) => (
       <Marker
         key={l.id}
         position={[l.lat, l.lng]}
         icon={liveMarkerIcon(l, selectedLive?.id === l.id)}
         eventHandlers={{ click: () => openLive(l) }}
       />
     ))}
   ```

- [ ] **Step 8: Verify**

Run: `pnpm test && pnpm exec tsc --noEmit && pnpm build > /tmp/n3x7-build.log 2>&1; echo build $?`
Expected: 35 tests pass (28 + 7), tsc clean, `build 0`.

- [ ] **Step 9: Commit**

```bash
git add lib/types.ts lib/live.ts lib/live.test.ts lib/store.tsx components/source-switch.tsx components/live-listing-card.tsx components/live-panel.tsx components/discovery-panel.tsx components/property-map.tsx
git commit -m "feat: Live · Cotality data source with filters, paging and map markers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Live drawer and saving live listings

**Files:**
- Create: `components/live-drawer.tsx`
- Modify: `components/app-shell.tsx`, `app/saved/page.tsx`

**Interfaces:**
- Consumes: `selectedLive`, `closeLive` (Task 6); `campaignUrl`, `fetchLive`, `isLiveCampaign` (Task 6); `getIdToken` (Task 5).
- Consumes also: store `savedLive`, `toggleSaveLive`, `isSaved` (Task 6, Step 4.7).

- [ ] **Step 1: Live drawer**

`components/live-drawer.tsx`:
```tsx
"use client"

import { useEffect, useState } from "react"
import { Bath, BedDouble, Bookmark, Car, Info, LandPlot, Loader2, MapPin, Phone } from "lucide-react"
import { useN3X7 } from "@/lib/store"
import { getIdToken } from "@/lib/auth"
import { config } from "@/lib/config"
import { campaignUrl, fetchLive, isLiveCampaign, LiveError } from "@/lib/live"
import type { LiveCampaign } from "@/lib/types"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { Button, buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type CampaignState =
  | { status: "loading" }
  | { status: "ok"; campaign: LiveCampaign }
  | { status: "none" }
  | { status: "error"; message: string }

function Tile({ icon: Icon, label, value }: { icon: typeof BedDouble; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border p-3">
      <Icon className="mb-1 size-4 text-muted-foreground" />
      <p className="text-sm font-semibold text-foreground">{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  )
}

function PhoneLink({ label, name, phone }: { label: string; name: string | null; phone: string | null }) {
  if (!name && !phone) return null
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
      <div>
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className="text-sm font-medium text-foreground">{name ?? "—"}</p>
      </div>
      {phone && (
        <a href={`tel:${phone.replace(/\s+/g, "")}`} className={buttonVariants({ size: "sm", variant: "outline" })}>
          <Phone className="size-4" />
          {phone}
        </a>
      )}
    </div>
  )
}

export function LiveDrawer() {
  const { selectedLive: l, closeLive, isSaved, toggleSaveLive } = useN3X7()
  const [campaign, setCampaign] = useState<CampaignState>({ status: "loading" })

  useEffect(() => {
    if (!l) return
    let cancelled = false
    setCampaign({ status: "loading" })
    ;(async () => {
      try {
        const token = await getIdToken()
        if (!token) throw new LiveError(401, "Your session has expired. Sign in again.")
        const c = await fetchLive(campaignUrl(config.apiUrl, l.cotalityId), token, isLiveCampaign)
        if (!cancelled) setCampaign({ status: "ok", campaign: c })
      } catch (e) {
        if (cancelled) return
        if (e instanceof LiveError && e.status === 404) setCampaign({ status: "none" })
        else setCampaign({ status: "error", message: e instanceof Error ? e.message : "Couldn't load agent details." })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [l])

  return (
    <Sheet open={!!l} onOpenChange={(o) => !o && closeLive()}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto bg-background p-0 sm:!max-w-lg">
        {l && (
          <>
            <img src={l.image ?? "/placeholder.svg"} alt={l.address} className="h-60 w-full object-cover" />
            <div className="space-y-5 p-5">
              <div>
                <span className="rounded-md border border-border px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                  Live · Cotality sandbox
                </span>
                <h2 className="mt-2 text-lg font-semibold text-foreground">{l.address}</h2>
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="size-3" />
                  {l.suburb} {l.state}
                </p>
              </div>

              <div>
                <p className="font-mono text-2xl font-semibold text-foreground">{l.priceLabel ?? "Price on request"}</p>
                <p className="text-xs text-muted-foreground">
                  {[l.method, l.listedAt && `listed ${new Date(l.listedAt).toLocaleDateString("en-AU")}`]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>

              <div className="grid grid-cols-4 gap-2">
                <Tile icon={BedDouble} label="Beds" value={l.beds?.toString() ?? "—"} />
                <Tile icon={Bath} label="Baths" value={l.baths?.toString() ?? "—"} />
                <Tile icon={Car} label="Cars" value={l.parking?.toString() ?? "—"} />
                <Tile icon={LandPlot} label="Land" value={l.landSize !== null ? `${l.landSize} m²` : "—"} />
              </div>

              <div className="flex items-start gap-2 rounded-xl border border-border p-3 text-xs text-muted-foreground">
                <Info className="mt-px size-3.5 shrink-0" />
                Not scored yet. N3X7 score, frontage and LMR/TOD flags aren&apos;t available for live listings.
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground">Selling agent</h3>
                {campaign.status === "loading" && (
                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="size-3.5 animate-spin" />
                    Loading agent details…
                  </p>
                )}
                {campaign.status === "ok" && (
                  <>
                    <PhoneLink label="Agent" name={campaign.campaign.agentName} phone={campaign.campaign.agentPhone} />
                    <PhoneLink label="Agency" name={campaign.campaign.agency} phone={campaign.campaign.agencyPhone} />
                    {campaign.campaign.auctionDate && (
                      <p className="text-xs text-muted-foreground">
                        Auction {new Date(campaign.campaign.auctionDate).toLocaleDateString("en-AU")}
                      </p>
                    )}
                  </>
                )}
                {campaign.status === "none" && (
                  <p className="text-xs text-muted-foreground">
                    {[l.agentName, l.agency].filter(Boolean).join(" · ") || "No agent details available."}
                  </p>
                )}
                {campaign.status === "error" && (
                  <p role="alert" className="text-xs text-destructive">{campaign.message}</p>
                )}
              </div>

              <Button
                className="w-full"
                variant={isSaved(l.id) ? "secondary" : "outline"}
                onClick={() => toggleSaveLive(l)}
              >
                <Bookmark className={cn("size-4", isSaved(l.id) && "fill-current")} />
                {isSaved(l.id) ? "Saved" : "Save"}
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
```

- [ ] **Step 2: Mount the drawer**

In `components/app-shell.tsx`, import `LiveDrawer` from `./live-drawer` and render `<LiveDrawer />` right after `<PropertyDrawer />`.

- [ ] **Step 3: Saved page**

In `app/saved/page.tsx`:
1. Import `LiveListingCard` from `@/components/live-listing-card`.
2. Take `savedLive` from `useN3X7()`, and add `const savedLiveList = Object.values(savedLive)`.
3. Change the count text to `{saved.length + savedLiveList.length} opportunities tracked in your intelligence watchlist.`
4. Change the empty-state condition from `saved.length === 0` to `saved.length === 0 && savedLiveList.length === 0`.
5. After the existing saved list (still inside the non-empty branch), add:
   ```tsx
   {savedLiveList.length > 0 && (
     <section className="mt-8 space-y-3">
       <h2 className="text-sm font-semibold text-foreground">Live listings (Cotality)</h2>
       <div className="grid gap-4 md:grid-cols-2">
         {savedLiveList.map((l) => (
           <LiveListingCard key={l.id} listing={l} />
         ))}
       </div>
     </section>
   )}
   ```
   If the non-empty branch renders only `saved.map(...)` in a single element, wrap that element and the new section in a fragment.

- [ ] **Step 4: Verify**

Run: `pnpm test && pnpm exec tsc --noEmit && pnpm build > /tmp/n3x7-build.log 2>&1; echo build $?`
Expected: 35 tests pass, tsc clean, `build 0`.

- [ ] **Step 5: Commit**

```bash
git add components/live-drawer.tsx components/app-shell.tsx app/saved/page.tsx
git commit -m "feat: live listing drawer with agent phone numbers, and saving live listings

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Rollout configuration, end-to-end check, docs

**Files:**
- Create: `.env`
- Modify: `CLAUDE.md`

- [ ] **Step 1: `.env` from the stack outputs**

Run:
```bash
o() { aws cloudformation describe-stacks --stack-name n3x7-api --profile n3x7 --region ap-southeast-2 --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text; }
cat > .env <<EOF
# Public identifiers for the N3X7 API and Cognito (not secrets). Read by next dev and next build.
NEXT_PUBLIC_API_URL=$(o ApiUrl)
NEXT_PUBLIC_COGNITO_USER_POOL_ID=$(o UserPoolId)
NEXT_PUBLIC_COGNITO_CLIENT_ID=$(o UserPoolClientId)
EOF
cat .env
```
Expected: three non-empty values. `ApiUrl` starts with `https://` and ends in `.execute-api.ap-southeast-2.amazonaws.com`.

- [ ] **Step 2: Create a test staff user (STOP: ask the user)**

Inviting sends an email, so ask the user which email(s) to invite first. Suggested: their own address. Armin (`anehzat@eronka.com`) is invited only on their go-ahead. Then run `./api/create-user.sh <email> "<name>"`.
Expected: `✅ Invited …`.

- [ ] **Step 3: Local end-to-end check**

Run `pnpm dev` and use Chrome at `http://localhost:3000`. The user signs in themselves with the emailed temporary password. Never type passwords for them. Then check:
1. The new-password step appears, and saving lands on Discover.
2. Switch to **Live · Cotality**: Blacktown listings load, markers appear, and the map flies to Blacktown.
3. Toggle House, set Land to 500 m²+: the list narrows, and paging works.
4. Open a listing: the agent and agency phone links load.
5. Save it, open Saved: it's under "Live listings (Cotality)". Refresh: it's still there.
6. Sign out: you're back at the login page, and Saved is empty after signing back in.
7. Switch back to Demo listings: the original demo flow is unchanged.

- [ ] **Step 4: Docs**

`CLAUDE.md` changes:
1. In **Project**, change "It is a **front-end-only prototype**: there is no backend…" to say listings come from `lib/mock-data.ts` (Demo) or the `api/` Cotality backend (Live), and AI replies are still mocked.
2. In **Commands**, add:
   ```
   cd api && pnpm test        # API unit tests
   ./api/deploy-prod.sh       # build + deploy the n3x7-api stack (Cognito, HTTP API, Lambda)
   ./api/smoke.sh             # end-to-end check of the deployed API
   ./api/create-user.sh <email> "<name>"   # invite a staff user
   ```
3. Replace the **Demo flow** login sentence with: sign-in is Cognito (`lib/auth.ts`, SRP). Users are admin-created with `api/create-user.sh`. `.env` holds the public API URL and Cognito IDs.
4. Add an **API** bullet: `api/` is a separate pnpm package with a Lambda behind an HTTP API JWT authorizer. Cotality credentials live in Secrets Manager `n3x7/cotality` (sandbox: Blacktown, Quakers Hill, Seven Hills only). There's no reserved concurrency because the account limit is 10. The API shape is duplicated in `api/src/types.ts` and `lib/types.ts`, so keep them in sync.

- [ ] **Step 5: Commit**

```bash
git add .env CLAUDE.md
git commit -m "chore: API and Cognito config for the front end, docs for the Cotality backend

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Production front-end deploy (STOP: ask the user)**

This replaces the demo login on `next.eronka.com`. Confirm with the user that Armin and everyone who needs access has been invited, then run `./deploy-prod.sh` and repeat the Step 3 checks on the Amplify URL.
