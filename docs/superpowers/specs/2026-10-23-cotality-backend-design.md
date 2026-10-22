# Cotality backend on AWS: design

**Date:** 2026-10-23 · **Branch:** `feat/cotality-api` (based on `deploy/aws-amplify`, PR #5)
**AWS:** account `654157459349`, region `ap-southeast-2`, CLI profile `n3x7`

## Goal

Staff sign in with real accounts and see **live for-sale listings from Cotality** next to the existing demo listings. The Cotality credentials never reach the browser, and nobody without an account can call the API.

## Context and constraints

- The front end is a **static export** on AWS Amplify (`next.eronka.com`, app `d2tgqj6ewcyky0`), deployed by `./deploy-prod.sh`. It has no server, so the Cotality proxy has to be a separate backend.
- Today's login is a demo: localStorage only, and any credentials are accepted. It protects nothing on a server.
- The Cotality credentials are a **sandbox** client (`EronkaNextProject`). The token comes from `POST https://api-sbox.corelogic.asia/access/as/token.oauth2?grant_type=client_credentials` with `Basic base64(id:secret)`, and lives about 55 minutes. Sandbox NSW data covers only **Blacktown, Quakers Hill and Seven Hills**, and the sandbox has a request quota (429 when exceeded).
- Verified in a spike on 2026-10-22:
  - `GET /property/au/v2/suggest.json?q=…&suggestionTypes=locality` returns `localityId`.
  - `GET /search/au/property/locality/{id}/otmForSale?activeCampaign=true&size=20` returns current listings: address, coordinates, beds/baths/car spaces, `landArea`, `propertyType`, photos, and `otmForSaleDetail` {`priceDescription`, `agent`, `agency`, `method`, `date`}. It supports the `pTypes`, `landArea`, `beds` and `page` filters. **Without `activeCampaign=true` it returns listings back to 2007.**
  - `GET /property-details/au/properties/{id}/otm/campaign/sales` returns agent and agency **phone numbers**, auction date, and first and latest price.
  - **No Cotality endpoint provides frontage**, and none sends contract requests.
- The team convention (Luxivana) is bash deploy scripts using the AWS CLI with a named profile, a `yes` confirmation before production, and specs and plans under `docs/superpowers/`.
- The client's long-term spec is FastAPI + PostGIS. This backend is deliberately small, so its routes can move there later.

## Non-goals

- Computing frontage (a future option is to derive it from NSW cadastre lot geometry).
- Production or UAT Cotality credentials. Switching is a secret change, not a code change.
- Server-side storage of saved properties or contract requests (they stay in localStorage).
- N3X7 scoring, LMR/TOD flags, or AI analysis for live listings.
- A custom API domain (`api.next.eronka.com`). The API Gateway URL is used for now.
- A staging environment.

## Architecture

```
Browser (next.eronka.com — static, Amplify)
  │  sign in (SRP) ──► Cognito User Pool ──► ID token (JWT)
  │  fetch with Authorization: Bearer <JWT>
  ▼
API Gateway HTTP API  (JWT authorizer = Cognito · throttling 10 rps / burst 20 · CORS allow-list)
  ▼
Lambda  n3x7-api  (Node 22, TypeScript, esbuild)
  │  reads secret once per container ─► Secrets Manager  n3x7/cotality
  │  caches Cotality token + localityIds in module memory
  ▼
Cotality API (sandbox base URL from the secret)
```

All of this is one **AWS SAM** stack, `n3x7-api`, defined in `api/template.yaml`.

## Components

### 1. `api/` (new folder, its own `package.json`, pnpm)

| File | Responsibility |
|---|---|
| `api/template.yaml` | SAM stack: Cognito User Pool, the web app client (SRP only), a separate smoke-test app client (admin password auth only, no secret exposure to the browser), HTTP API with JWT authorizer, throttling and CORS, the Lambda function, an IAM read policy for only the `n3x7/cotality` secret, and outputs (`ApiUrl`, `UserPoolId`, `UserPoolClientId`). |
| `api/src/handler.ts` | Routes the two endpoints, validates query params, maps errors to HTTP responses. |
| `api/src/cotality.ts` | Cotality client: loads the secret, caches the token (refreshes 5 minutes before `exp`, retries once on 401), and handles `suggestLocality(name)`, `searchForSale(localityId, filters, page)` and `saleCampaign(propertyId)`. |
| `api/src/map.ts` | Pure functions that turn Cotality JSON into the app's `LiveListing` and `LiveCampaign` shapes. |
| `api/src/*.test.ts` | `node --test` unit tests for `map.ts`, query building and param validation, plus the token cache with an injected clock and fetch. |
| `api/deploy-prod.sh` | Same style as the front-end script: checks the profile, asks for `yes`, runs tests, then `sam build && sam deploy`, and prints the outputs. |
| `api/put-cotality-secret.sh` | Reads `~/.config/n3x7/cotality.env` and creates or updates the secret `n3x7/cotality` (`{clientId, clientSecret, baseUrl}`). It never echoes values. |
| `api/create-user.sh <email> <name>` | `admin-create-user` in the pool. Cognito emails a temporary password, and the user sets a new one at first sign-in. |

### 2. API contract

All routes need `Authorization: Bearer <Cognito ID token>`. API Gateway returns 401 without one.

**`GET /listings`**

Query parameters:
- `suburb` (required): one of the sandbox-supported NSW suburbs (`Blacktown`, `Quakers Hill`, `Seven Hills`). Anything else returns 400 with that list.
- `types` (optional): comma list of `HOUSE`, `UNIT`, `LAND`. Passed as `pTypes`.
- `minLandArea` (optional, integer m²): passed as `landArea=<n>-`.
- `page` (optional, integer ≥ 0, default 0).

The handler resolves `localityId` with `suggest` (cached per suburb), then calls `otmForSale` with `activeCampaign=true` and `size=20`.

Response `200`:
```json
{ "suburb": "Blacktown", "page": 0, "totalPages": 10, "total": 182,
  "listings": [ LiveListing, … ] }
```

**`GET /listings/{id}/campaign`**

`id` is a Cotality property ID, digits only. Response `200` is a `LiveCampaign`, or `404` if the property has no active campaign.

**`LiveListing`** (Lambda output, consumed by the front end):
```ts
{ id: string            // "cl-<cotality id>"
  cotalityId: number
  address: string; suburb: string; state: "NSW"
  lat: number; lng: number
  type: "house" | "apartment" | "development"   // HOUSE→house, UNIT/FLATS→apartment, LAND/other→development
  beds: number | null; baths: number | null; parking: number | null
  landSize: number | null
  priceLabel: string | null   // Cotality priceDescription, e.g. "$1,250,000" or "Auction"
  price: number | null        // parsed when priceLabel is a single dollar amount, else null
  method: string | null       // Sale, Auction, …
  listedAt: string | null     // ISO date of the latest advertisement
  agentName: string | null; agency: string | null
  image: string | null }      // mediumPhotoUrl
```

**`LiveCampaign`:** `{ agentName, agentPhone, agency, agencyPhone, priceLabel, auctionDate, daysOnMarket }`, each `string | number | null`.

### 3. Errors

| Cause | HTTP | Body `error` |
|---|---|---|
| Missing or invalid JWT | 401 | from API Gateway |
| Bad or unsupported params | 400 | message listing the allowed values |
| Cotality 401 after one token refresh | 502 | `"Cotality authentication failed"` |
| Cotality 429 | 503 | `"Cotality quota exceeded, try later"` |
| Cotality 5xx or a network error | 502 | `"Cotality unavailable"` |
| Our throttle exceeded | 429 | from API Gateway |

The Lambda logs the request ID, route, Cotality status and duration. It **never** logs tokens, secrets, or agent names and phone numbers.

### 4. Front end

- **Config:** `lib/config.ts` reads `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_COGNITO_USER_POOL_ID` and `NEXT_PUBLIC_COGNITO_CLIENT_ID`. These are public identifiers, not secrets, and are committed in `.env.production`. `deploy-prod.sh` builds with them.
- **Auth (`lib/auth.ts`):** uses `amazon-cognito-identity-js` with the SRP flow, so the password is never sent in plain text. It handles `NEW_PASSWORD_REQUIRED` for first sign-in, keeps the session in Cognito's own localStorage keys, refreshes tokens, and signs out.
- **Store:** `signIn(email)` becomes `signIn(email, password)`, which is async and returns `"ok" | "new-password-required" | error message`. `user` comes from the Cognito ID token (`email`, `name`). `signOut` also signs out of Cognito, then resets saved state as today. `hydrated` waits for the Cognito session check.
- **Login page:** real email and password fields (not prefilled), an error message, and a "Set a new password" step when Cognito requires it. The "any credentials are accepted" text is removed.
- **Data source toggle:** the Discovery panel gets a **Demo listings / Live · Cotality** switch.
  - **Demo** is today's behaviour, unchanged.
  - **Live** shows a suburb picker limited to the three sandbox suburbs, plus type and min-land-area filters, fetches `GET /listings`, and shows loading, empty and error states.
  - Live markers render on the same map, and the NSW planning layers work as before.
  - The frontage filter and the "In TOD area" toggle are hidden in Live mode, with a note: *"Frontage and TOD flags aren't available from Cotality yet."*
  - A sandbox note reads: *"Sandbox data: Blacktown, Quakers Hill, Seven Hills only."*
- **Live listing card and drawer:**
  - Show the address, price label, beds/baths/car, land size, listing method and date, and the photo.
  - The drawer loads `GET /listings/{id}/campaign` and shows the agent and agency with **tap-to-call phone links**.
  - No N3X7 score, breakdown, LMR/TOD or AI insights. Show *"Not scored yet"* instead.
  - Save works with the `cl-` IDs.
  - "Request contract" for a live listing becomes **Call agent**. A simulated request would be misleading against real agents.
- `lib/live.ts` holds the fetch client and the `LiveListing` type, so the API's shape is defined in one place on the front end.

### 5. Security

- Cognito: admin-created users only (self sign-up disabled). Password policy: 12+ characters with mixed case, numbers and symbols. MFA optional (TOTP), can be enforced later. ID tokens last 1 hour, refresh tokens 30 days.
- API Gateway: the JWT authorizer checks issuer and audience. CORS allows only `https://next.eronka.com`, `https://main.d2tgqj6ewcyky0.amplifyapp.com` and `http://localhost:3000`. Throttling is 10 rps with a burst of 20.
- Lambda: least-privilege role with `secretsmanager:GetSecretValue` on `n3x7/cotality` only. Timeout 10 s, memory 256 MB, and reserved concurrency of 5 to cap the blast radius on Cotality's quota.
- Secrets: only in Secrets Manager. Never in the repo, the front end or logs.
- Only the routes above exist. The Lambda builds Cotality URLs itself, so there's no pass-through of arbitrary paths or params.

## Testing

- `api`: `pnpm test` runs `node --test` over `api/src/**/*.test.ts`. It covers:
  - mapping, including missing fields → `null` and the type mapping
  - price parsing (`"$1,250,000"` → 1250000; `"Auction"`, `"Contact agent"` and `"$1.1m - $1.2m"` → null)
  - param validation (unsupported suburb, a bad `page`, a non-digit `id`)
  - the token cache: reuses a token before expiry, refreshes it near expiry, and retries once on 401
- Front end: existing tests stay green, plus `node --test` for the pure pieces (`lib/live.ts` URL building and the response guard).
- After deploying:
  - a smoke script `api/smoke.sh` signs in a test user with `aws cognito-idp admin-initiate-auth` (enabled only for the smoke client), then calls `/listings?suburb=Blacktown` and checks that it returns 200 with listings
  - a call without a token must return 401
- Browser check on the Amplify URL: sign in with a real user → Live → Blacktown → listings and markers → open the drawer → agent phone appears → sign out → back at the login page.

## Rollout

1. Ben's DNS records for `next.eronka.com` (already requested) are not a blocker. The API uses its `execute-api` URL.
2. Run `api/put-cotality-secret.sh`, then `api/deploy-prod.sh` (creates the stack), then `api/create-user.sh` for each staff member.
3. Put the stack outputs into `.env.production`, then run `./deploy-prod.sh` for the front end.
4. **This replaces the demo login on production:** after rollout, only Cognito users can sign in. Create accounts for Armin and anyone who needs demo access before deploying the front end.
