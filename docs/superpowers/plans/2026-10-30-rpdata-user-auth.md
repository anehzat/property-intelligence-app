# RP Data User Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every N3X7 user links their own RP Data account once during sign-in (RP.Inside Steps 1–3), and the API then gets and silently refreshes Cotality tokens for that user.

**Architecture:** The front end (static export) sends the user to Cotality's authorize page and posts the returned `code` to three new Lambda routes. The Lambda exchanges the code, stores KMS-encrypted tokens per Cognito user in DynamoDB, and refreshes them under a per-user lease. A secret field `dataAuth` switches the existing data routes between the shared client-credentials token and the user's token.

**Tech Stack:** Next.js 16 static export + React 19 (front end); TypeScript Lambda on Node 22, AWS SAM, API Gateway HTTP API with Cognito JWT authorizer, DynamoDB, KMS, Secrets Manager; `node --test`.

**Spec:** `docs/superpowers/specs/2026-10-30-rpdata-user-auth-design.md`

## Global Constraints

- Scope is RP.Inside Steps 1–3 only. No HMAC silent login or deep links.
- Cognito stays. RP Data linking is an extra, mandatory step after Cognito sign-in.
- The client secret and the user's Cotality tokens never reach the browser, the logs, or the page URL after the callback. Never log codes, tokens, secrets or the RP Data username.
- Redirect URI = `window.location.origin + "/auth/rpdata/callback/"`, with the trailing slash.
- Cotality token endpoint: `POST {authBaseUrl}/as/token.oauth2`, `Content-Type: application/x-www-form-urlencoded`. Authorize: `GET {authBaseUrl}/as/authorization.oauth2?response_type=code&client_id=…&redirect_uri=…&scope=openid&state=…`.
- Refresh when `accessExpiresAt - now <= 5 minutes`. Lease 15 s. A container without the lease polls every 500 ms for up to 5 s, then returns 503 "RP Data busy, try again". Retry a failed post-refresh write up to 3 times. Lambda timeout is 15 s.
- One RP Data account (`rpSub` = the access token's `sub` claim) links to at most one N3X7 user. Error: 409 `{ error: "This RP Data account is already linked to another N3X7 user", code: "RPDATA_IN_USE" }`.
- Data routes in `"user"` mode: no link → 409 `{ error: "RP Data not linked", code: "RPDATA_NOT_LINKED" }`. A 401 from the data API → 502 "Cotality rejected the RP Data token", with no refresh. `"client"` mode is unchanged and is the default.
- Tables: `n3x7-rpdata-links` (key `userId`) and `n3x7-rpdata-accounts` (key `rpSub`, attribute `userId`). KMS alias `alias/n3x7-rpdata`.
- If `NEXT_PUBLIC_RPDATA_AUTH_URL` or `NEXT_PUBLIC_RPDATA_CLIENT_ID` is empty, the RP Data step is skipped entirely.
- New AWS SDK packages are pinned to `3.1156.0` (the version already used for `@aws-sdk/client-secrets-manager`), as devDependencies, because the Lambda runtime provides them and esbuild marks `@aws-sdk/*` external.
- Front-end modules imported by tests use `import type` for local types and `.ts` extensions on runtime imports (see CLAUDE.md).

## Review Focus

1. **The user cancels on Cotality's page.** The callback arrives with `?error=access_denied` and no `code`. Expect `/connect-rpdata/` with "RP Data sign-in was cancelled", and no POST. → Task 6 test `callbackOutcome handles error param`.
2. **`state` is missing or wrong** (callback opened directly, in a new tab, or with sessionStorage cleared). Expect no POST and an error on `/connect-rpdata/`. → Task 6 test `callbackOutcome rejects missing or mismatched state`.
3. **Cotality's token response lacks `refresh_token` or `expires_in`.** Expect 502 and nothing stored. → Task 1 test `exchangeCode rejects a response without refresh_token`.
4. **Front-end RP Data config is empty.** Expect the app to work exactly as today, with no redirect to `/connect-rpdata/` and no loop. → Task 6 test `rpdataEnabled is false when either value is empty`, and the Task 7 gate uses it.
5. **The Lambda gets a POST with a non-JSON or empty body.** Expect 400, and Cotality is never called. → Task 4 test `POST /rpdata/connect with a bad body is 400`.

---

### Task 1: Cotality OAuth client (Steps 2 and 3)

**Files:**
- Create: `api/src/rpdata-auth.ts`
- Test: `api/src/rpdata-auth.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface AuthCreds { authBaseUrl: string; userClientId: string; userClientSecret: string }
  export interface TokenSet { accessToken: string; refreshToken: string; expiresAt: number; rpSub: string; rpUsername: string }
  export class RpAuthError extends Error { code: "invalid_grant" | "invalid_client" | "bad_response" | "quota" | "unavailable" }
  export interface RpAuth {
    exchangeCode(code: string, redirectUri: string): Promise<TokenSet>   // Step 2
    refresh(refreshToken: string): Promise<TokenSet>                     // Step 3
  }
  export function createRpAuth(loadCreds: () => Promise<AuthCreds>, fetchFn?: typeof fetch, now?: () => number): RpAuth
  export function decodeClaims(jwt: string): { sub?: string; username?: string }
  ```

- [ ] **Step 1: Write the failing tests** in `api/src/rpdata-auth.test.ts`. Use a fake `fetchFn` that records `(url, init)` and returns a JSON `Response`, with `now = () => 1_000_000`.
  - `exchangeCode posts the authorization_code grant`: url `https://auth.test/as/token.oauth2`, method `POST`, content type `application/x-www-form-urlencoded`. The body params equal `{grant_type: "authorization_code", client_id: "cid", client_secret: "sec", code: "abc", redirect_uri: "https://next.eronka.com/auth/rpdata/callback/"}`. The result is `{accessToken, refreshToken: "r1", expiresAt: 1_000_000 + 3599_000, rpSub: "sub-1", rpUsername: "jane"}`, where the access token is an unsigned JWT whose payload is `{sub:"sub-1", username:"jane"}`.
  - `refresh posts the refresh_token grant`: the body params equal `{grant_type: "refresh_token", client_id, client_secret, refresh_token: "r1"}`.
  - `400 invalid_grant maps to code invalid_grant`, `401 invalid_client maps to code invalid_client` (Cotality body `{error: "…"}`), `429 maps to quota`, `500 maps to unavailable`.
  - `exchangeCode rejects a response without refresh_token` → `RpAuthError` with code `bad_response`. Do the same for missing `expires_in`, and for an access token without a `sub` claim.
  - `decodeClaims returns {} for a malformed token`.

- [ ] **Step 2: Run** `cd api && node --test src/rpdata-auth.test.ts`. Expected: FAIL, module not found.

- [ ] **Step 3: Implement** `api/src/rpdata-auth.ts`. Build the form body with `URLSearchParams`, and send no `Authorization` header (the guide sends `client_id` and `client_secret` in the form). `decodeClaims` base64url-decodes the middle segment without verifying the signature. Error codes come from the HTTP status, plus the `error` field for 400 and 401.

- [ ] **Step 4: Run** `cd api && node --test src/rpdata-auth.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit**
  ```bash
  git add api/src/rpdata-auth.ts api/src/rpdata-auth.test.ts
  git commit -m "feat(api): Cotality user OAuth client for code exchange and refresh"
  ```

### Task 2: Link store (DynamoDB + KMS) and its in-memory twin

**Files:**
- Create: `api/src/rpdata-store.ts` (interface, memory store, DynamoDB store, KMS cipher)
- Test: `api/src/rpdata-store.test.ts`
- Modify: `api/package.json` (add devDependencies `@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`, `@aws-sdk/client-kms`, all `3.1156.0`; run `cd api && pnpm install`)

**Interfaces:**
- Produces:
  ```ts
  export interface LinkRecord {
    userId: string; rpSub: string; rpUsername: string
    accessToken: string; accessExpiresAt: number; refreshToken: string
    version: number; refreshingUntil?: number; linkedAt: number; refreshedAt: number
  }
  export interface LinkStore {
    get(userId: string): Promise<LinkRecord | null>
    /** One transaction: put link, claim rpSub for userId, release previousRpSub if different. */
    link(rec: LinkRecord, previousRpSub: string | null): Promise<"ok" | "in-use">
    /** Sets refreshingUntil=until iff version matches and no refreshingUntil > now. */
    tryLease(userId: string, version: number, now: number, until: number): Promise<boolean>
    /** Writes new tokens, version+1, removes refreshingUntil, iff version matches. */
    saveRefreshed(userId: string, version: number, t: { accessToken: string; accessExpiresAt: number; refreshToken: string; refreshedAt: number }): Promise<boolean>
    clearLease(userId: string, version: number): Promise<void>
    /** One transaction: delete link and the rpSub claim. */
    unlink(userId: string, rpSub: string): Promise<void>
  }
  export interface Cipher { encrypt(plain: string): Promise<string>; decrypt(cipher: string): Promise<string> }
  export function createMemoryStore(): LinkStore
  export function createDynamoStore(opts: { linksTable: string; accountsTable: string; cipher: Cipher; doc?: DynamoDBDocumentClient }): LinkStore
  export function createKmsCipher(keyId: string, kms?: KMSClient): Cipher
  ```

- [ ] **Step 1: Write the failing tests** against `createMemoryStore()`. These tests pin the semantics that the DynamoDB store must match:
  - `link stores a record and claims the rp account`
  - `link returns in-use when another user holds rpSub and stores nothing`
  - `link by the same user again is ok`
  - `link with a different previousRpSub frees the old claim` (a second user can then link the old `rpSub`)
  - `tryLease fails on a version mismatch and while another lease is unexpired, succeeds after it expires`
  - `saveRefreshed increments version and clears the lease; a stale version returns false`
  - `unlink removes both the link and the claim`

  Add one test for the DynamoDB store with a fake `doc` whose `send` records commands: `createDynamoStore link sends a TransactWriteCommand with the accounts condition`. Assert that the condition expression is `attribute_not_exists(rpSub) OR userId = :me`, and that `accessToken` and `refreshToken` in the put are the fake cipher's output (`enc(…)`), not plaintext. Map a `TransactionCanceledException` whose `CancellationReasons[1].Code === "ConditionalCheckFailed"` to `"in-use"`.

- [ ] **Step 2: Run** `cd api && node --test src/rpdata-store.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement** `api/src/rpdata-store.ts`. The DynamoDB store uses `DynamoDBDocumentClient` with `GetCommand`, `UpdateCommand` (condition expressions for the lease and save), `TransactWriteCommand` (link and unlink) and `ConditionalCheckFailedException` → `false`. The cipher wraps only `accessToken` and `refreshToken`, using KMS `EncryptCommand` / `DecryptCommand` with base64 ciphertext.

- [ ] **Step 4: Run** `cd api && node --test src/rpdata-store.test.ts && pnpm typecheck`. Expected: PASS, no type errors.

- [ ] **Step 5: Commit**
  ```bash
  git add api/package.json api/pnpm-lock.yaml api/src/rpdata-store.ts api/src/rpdata-store.test.ts
  git commit -m "feat(api): encrypted RP Data link store with one account per user"
  ```

### Task 3: Token manager (connect, status, silent refresh with lease)

**Files:**
- Create: `api/src/rpdata-tokens.ts`
- Test: `api/src/rpdata-tokens.test.ts`

**Interfaces:**
- Consumes: `RpAuth`, `TokenSet`, `RpAuthError` (Task 1); `LinkStore`, `LinkRecord`, `createMemoryStore` (Task 2).
- Produces:
  ```ts
  export class RpDataError extends Error {
    status: 400 | 409 | 502 | 503
    code: "RPDATA_NOT_LINKED" | "RPDATA_IN_USE" | "RPDATA_INVALID_CODE" | "RPDATA_BUSY" | "RPDATA_UNAVAILABLE"
  }
  export interface TokenManager {
    status(userId: string): Promise<{ connected: boolean; username?: string }>
    connect(userId: string, code: string, redirectUri: string): Promise<{ connected: true; username: string }>
    disconnect(userId: string): Promise<void>
    accessToken(userId: string): Promise<string>   // throws RpDataError
  }
  export function createTokenManager(deps: { store: LinkStore; auth: RpAuth; now?: () => number; sleep?: (ms: number) => Promise<void>; log?: (line: string) => void }): TokenManager
  ```

- [ ] **Step 1: Write the failing tests**, using a memory store, a scripted fake `RpAuth` that counts calls, a controllable `now`, and an instant `sleep`:
  - `connect stores tokens and returns the username`
  - `connect maps invalid_grant to 400 RPDATA_INVALID_CODE and stores nothing`
  - `connect maps an rp account held by another user to 409 RPDATA_IN_USE`
  - `accessToken returns the stored token when more than 5 minutes remain` (0 refresh calls)
  - `accessToken refreshes when 5 minutes or less remain and stores the new pair` (version +1)
  - `two concurrent accessToken calls refresh once`: `Promise.all` of two calls, with the fake refresh resolving after a tick → exactly 1 refresh call, and both return the new token
  - `a waiter that sees no version change for 5 s gets 503 RPDATA_BUSY`
  - `invalid_grant on refresh after another container refreshed uses the new token`: the store version changes between lease and failure → the new token is returned, nothing is deleted
  - `invalid_grant on refresh with no version change unlinks and throws 409 RPDATA_NOT_LINKED`
  - `a failed save after a successful refresh retries 3 times then throws 502`: the store's `saveRefreshed` rejects 3 times → 502, and `saveRefreshed` was called 4 times in total (1 + 3 retries)
  - `other refresh failures clear the lease, keep the link and throw 502`
  - `accessToken with no link throws 409 RPDATA_NOT_LINKED`

- [ ] **Step 2: Run** `cd api && node --test src/rpdata-tokens.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement** `api/src/rpdata-tokens.ts`, following the spec's "Refreshing safely" steps 1–5 and the Global Constraints values. Keep a per-container `Map<userId, LinkRecord>` cache and re-read from the store whenever the cached token is inside the 5-minute window. Log only the event name and Cotality error code.

- [ ] **Step 4: Run** `cd api && node --test src/rpdata-tokens.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit**
  ```bash
  git add api/src/rpdata-tokens.ts api/src/rpdata-tokens.test.ts
  git commit -m "feat(api): RP Data token manager with lease-guarded silent refresh"
  ```

### Task 4: Routes, data-auth switch and handler wiring

**Files:**
- Modify: `api/src/cotality.ts` (methods take an optional user token), `api/src/routes.ts`, `api/src/handler.ts`, `api/src/params.ts`
- Test: `api/src/routes.test.ts`, `api/src/cotality.test.ts`, `api/src/params.test.ts`

**Interfaces:**
- Consumes: `TokenManager`, `RpDataError` (Task 3).
- Produces:
  ```ts
  // cotality.ts
  export interface CotalityClient {
    suggestLocality(query: string, userToken?: string): Promise<number>
    searchForSale(localityId: number, q: ListingsQuery, userToken?: string): Promise<unknown>
    saleCampaign(propertyId: number, userToken?: string): Promise<unknown>
  }
  // A 401 while using userToken throws CotalityError(401, "user token rejected") with `userToken: true`; no retry.
  // routes.ts
  export interface RouteEvent { routeKey: string; body?: string; isBase64Encoded?: boolean; queryStringParameters?; pathParameters?;
    requestContext?: { requestId?: string; authorizer?: { jwt?: { claims?: Record<string, unknown> } } } }
  export interface RouteDeps { client: CotalityClient; tokens: TokenManager; dataAuth: "client" | "user"; redirectOrigins: string[] }
  export async function route(event: RouteEvent, deps: RouteDeps, log?: (line: string) => void): Promise<RouteResult>
  // params.ts
  export function parseConnectBody(body: string | undefined, redirectOrigins: string[], isBase64 = false): { code: string; redirectUri: string }  // throws BadRequest
  ```

- [ ] **Step 1: Write the failing tests:**
  - `params.test.ts`:
    - `parseConnectBody accepts an allowlisted redirect URI`: origin `https://next.eronka.com` → `https://next.eronka.com/auth/rpdata/callback/`.
    - `parseConnectBody rejects another origin, a path without the trailing slash, a missing code, and non-JSON`.
  - `cotality.test.ts`:
    - `with a user token, get uses it and does not call the token endpoint`.
    - `a 401 with a user token throws without retrying`.
  - `routes.test.ts`: update the existing tests to pass `RouteDeps` with `dataAuth: "client"`. Add:
    - `GET /rpdata/status returns the manager's status for claims.sub`.
    - `POST /rpdata/connect returns 200 {connected, username}`.
    - `POST /rpdata/connect with a bad body is 400` (the manager is never called).
    - `RpDataError maps to its status and {error, code}`.
    - `DELETE /rpdata/connection returns 204`.
    - `a missing claims.sub is 401`.
    - `user mode passes the user's token to Cotality`.
    - `user mode without a link is 409 RPDATA_NOT_LINKED`.
    - `user mode 401 from Cotality is 502 "Cotality rejected the RP Data token"`.
    - `client mode never calls tokens.accessToken`.

- [ ] **Step 2: Run** `cd api && pnpm test`. Expected: the new tests FAIL.

- [ ] **Step 3: Implement.**
  - `route` reads `userId` from `requestContext.authorizer.jwt.claims.sub`.
  - Add the three route keys `GET /rpdata/status`, `POST /rpdata/connect` and `DELETE /rpdata/connection`. Return a 204 with an empty body.
  - `toError` maps `RpDataError` → `[status, message]`, with `code` in the body. A `CotalityError` with `userToken` maps to 502 "Cotality rejected the RP Data token".
  - `handler.ts`:
    - Load `authBaseUrl`, `userClientId`, `userClientSecret` and `dataAuth` (default `"client"`) from the same secret. Missing user fields are allowed while `dataAuth` is `"client"`; the `/rpdata/*` routes then return 502.
    - Build `createDynamoStore` from the env vars `LINKS_TABLE`, `ACCOUNTS_TABLE` and `KMS_KEY_ID`.
    - Read `REDIRECT_ORIGINS` (comma-separated).

- [ ] **Step 4: Run** `cd api && pnpm test && pnpm typecheck`. Expected: PASS.

- [ ] **Step 5: Commit**
  ```bash
  git add api/src
  git commit -m "feat(api): /rpdata routes and per-user Cotality tokens behind dataAuth"
  ```

### Task 5: Infrastructure and scripts

**Files:**
- Modify: `api/template.yaml`, `api/put-cotality-secret.sh`, `api/smoke.sh`, `CLAUDE.md` (API section: new routes, tables, `dataAuth`)

**Interfaces:**
- Consumes: the env var names from Task 4 (`LINKS_TABLE`, `ACCOUNTS_TABLE`, `KMS_KEY_ID`, `REDIRECT_ORIGINS`) and the secret fields `authBaseUrl`, `userClientId`, `userClientSecret`, `dataAuth`.

- [ ] **Step 1: Edit `template.yaml`:**
  - **Tables:**
    - `RpDataLinks` (`AWS::DynamoDB::Table`, `TableName: n3x7-rpdata-links`, key `userId` S, `BillingMode: PAY_PER_REQUEST`, `SSESpecification.SSEEnabled: true`)
    - `RpDataAccounts` (`n3x7-rpdata-accounts`, key `rpSub` S, same settings)
  - **KMS key:** `RpDataKey` (`AWS::KMS::Key`, key rotation on, key policy giving the account root admin) and `RpDataKeyAlias` (`alias/n3x7-rpdata`).
  - **API function:**
    - `Timeout: 15`.
    - Env `LINKS_TABLE`, `ACCOUNTS_TABLE`, `KMS_KEY_ID` (the key ARN), and `REDIRECT_ORIGINS: !Join [",", !Ref AllowedOrigins]`.
    - IAM: `dynamodb:GetItem/PutItem/UpdateItem/DeleteItem` on both table ARNs, `kms:Encrypt/Decrypt` on the key ARN.
    - Events `GET /rpdata/status`, `POST /rpdata/connect`, `DELETE /rpdata/connection`.
  - **CORS:** `AllowMethods: [GET, POST, DELETE, OPTIONS]`.

- [ ] **Step 2: Edit the scripts.**
  - `put-cotality-secret.sh` also writes the optional `COTALITY_AUTH_BASE_URL` (default `https://auth.corelogic.asia`), `COTALITY_USER_CLIENT_ID`, `COTALITY_USER_CLIENT_SECRET` and `COTALITY_DATA_AUTH` (default `client`). Empty values are left out of the JSON. The script still never prints secrets, and its summary line names the data auth mode.
  - `smoke.sh` adds `GET /rpdata/status` → 200 with `connected` false for the smoke user, and a CORS preflight for `POST` on `/rpdata/connect` → 204. When `dataAuth` is `user`, which the script reads from a `DATA_AUTH` env var (default `client`), the listing checks expect 409 instead.

- [ ] **Step 3: Verify.** Run `cd api && sam validate --lint --profile n3x7 --region ap-southeast-2 && pnpm build`. Expected: the template is valid and `dist/handler.mjs` is built. Do **not** deploy in this task.

- [ ] **Step 4: Commit**
  ```bash
  git add api/template.yaml api/put-cotality-secret.sh api/smoke.sh CLAUDE.md
  git commit -m "feat(api): DynamoDB, KMS and routes for RP Data linking"
  ```

### Task 6: Front-end RP Data helpers

**Files:**
- Create: `lib/rpdata.ts`
- Test: `lib/rpdata.test.ts`
- Modify: `lib/config.ts` (add `rpdataAuthUrl: process.env.NEXT_PUBLIC_RPDATA_AUTH_URL ?? ""` and `rpdataClientId: process.env.NEXT_PUBLIC_RPDATA_CLIENT_ID ?? ""`), `lib/paths.ts`, `lib/paths.test.ts`, `.env` (add both keys, empty, with a comment)

**Interfaces:**
- Produces:
  ```ts
  export const RPDATA_CALLBACK_PATH = "/auth/rpdata/callback/"
  export const RPDATA_STATE_KEY = "n3x7.rpdata.state"
  export function rpdataEnabled(authUrl: string, clientId: string): boolean
  export function redirectUriFor(origin: string): string
  export function authorizeUrl(authUrl: string, clientId: string, redirectUri: string, state: string): string
  export function newState(): string  // 32 hex chars from crypto.getRandomValues
  export type CallbackOutcome = { ok: true; code: string } | { ok: false; message: string }
  export function callbackOutcome(search: string, savedState: string | null): CallbackOutcome
  export interface RpStatus { connected: boolean; username?: string }
  export function isRpStatus(x: unknown): x is RpStatus
  export function rpdataUrl(apiBase: string, path: "status" | "connect" | "connection"): string
  // lib/paths.ts
  export function isPublicAuthPath(pathname: string): boolean   // /login, /connect-rpdata, /auth/rpdata/callback (± trailing slash)
  export function isRpDataPath(pathname: string): boolean       // /connect-rpdata, /auth/rpdata/callback
  ```

- [ ] **Step 1: Write the failing tests:**
  - `rpdataEnabled is false when either value is empty`.
  - `redirectUriFor("https://next.eronka.com")` equals `"https://next.eronka.com/auth/rpdata/callback/"`.
  - `authorizeUrl` for `"https://auth.corelogic.asia"` has path `/as/authorization.oauth2` and params `response_type=code`, `client_id`, `redirect_uri` (encoded), `scope=openid`, `state`.
  - `newState returns 32 hex chars and differs between calls`.
  - `callbackOutcome returns the code when state matches`.
  - `callbackOutcome rejects missing or mismatched state`. Message: "The RP Data sign-in link expired. Please try again."
  - `callbackOutcome handles error param`: `?error=access_denied` → "RP Data sign-in was cancelled". Any other `error` → "RP Data sign-in failed. Please try again."
  - `callbackOutcome with no code and no error fails`.
  - `isPublicAuthPath` and `isRpDataPath` work with and without the trailing slash.

- [ ] **Step 2: Run** `node --test lib/rpdata.test.ts lib/paths.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement** `lib/rpdata.ts` and the `paths.ts` additions. Keep `isLoginPath` as it is.

- [ ] **Step 4: Run** `pnpm test`. Expected: PASS.

- [ ] **Step 5: Commit**
  ```bash
  git add lib/rpdata.ts lib/rpdata.test.ts lib/paths.ts lib/paths.test.ts lib/config.ts .env
  git commit -m "feat: RP Data authorize URL, state and callback helpers"
  ```

### Task 7: Sign-in gate, connect and callback pages, settings, 409 handling

**Files:**
- Create: `app/connect-rpdata/page.tsx`, `app/auth/rpdata/callback/page.tsx`
- Modify: `lib/store.tsx`, `components/app-shell.tsx`, `app/settings/page.tsx`, `components/live-drawer.tsx` (409 → mark unlinked)

**Interfaces:**
- Consumes: everything in Task 6; `getIdToken` from `lib/auth.ts`; `fetchLive` and `LiveError` from `lib/live.ts`.
- Produces (store additions on `useN3X7()`):
  ```ts
  rpdata: "unknown" | "linked" | "unlinked" | "disabled"
  rpUsername: string | null
  refreshRpData: () => Promise<void>     // GET /rpdata/status
  connectRpData: (code: string) => Promise<{ ok: true } | { ok: false; message: string }>  // POST /rpdata/connect
  disconnectRpData: () => Promise<void>  // DELETE /rpdata/connection, then rpdata = "unlinked"
  markRpDataUnlinked: () => void         // called on any 409 RPDATA_NOT_LINKED
  ```

- [ ] **Step 1: Store.**
  - After the Cognito user is set, `rpdata` becomes `"disabled"` when `!rpdataEnabled(config.rpdataAuthUrl, config.rpdataClientId)`. Otherwise it calls `refreshRpData()`.
  - When a status call fails (network or 5xx), keep `"unknown"` and expose the error. Don't redirect.
  - In the listings loader, a `LiveError` with status 409 calls `markRpDataUnlinked()`.
  - Sign-out resets `rpdata` to `"unknown"`.

- [ ] **Step 2: AppShell gate.** Gate on login exactly as today, using `isPublicAuthPath` in place of `isLoginPath` for the public-page check. Then:
  - signed in, `rpdata === "unlinked"`, not on an RP Data path → `router.replace("/connect-rpdata/")`;
  - on `/connect-rpdata/` with `rpdata === "linked"` or `"disabled"` → `router.replace("/")`.

  While `rpdata === "unknown"`, hold the blank frame. Render the two RP Data pages without the sidebar, like the login page, but only when a user is signed in. Otherwise send them to `/login`.

- [ ] **Step 3: `/connect-rpdata/` page.** Use the same card as the login page.
  - Title: "Connect your RP Data account".
  - Text: "N3X7 uses your own RP Data account to access Cotality data. You'll sign in on Cotality's page once; after that N3X7 keeps you connected."
  - Button "Connect RP Data": creates `newState()`, saves it to `sessionStorage[RPDATA_STATE_KEY]`, then sets `location.href = authorizeUrl(…, redirectUriFor(location.origin), state)`.
  - A "Sign out" link.
  - An error line from `?error=` in the page's query string, set by the callback.
  - `RPDATA_IN_USE` text: "This RP Data account is already linked to another N3X7 user. Contact your N3X7 admin."

- [ ] **Step 4: Callback page.**
  - On mount: `callbackOutcome(location.search, sessionStorage[RPDATA_STATE_KEY])`, remove the state key, and `history.replaceState(null, "", RPDATA_CALLBACK_PATH)` so the code leaves the URL.
  - On `ok`: `connectRpData(code)`. Success → `router.replace("/")`. Failure → `/connect-rpdata/?error=<encoded message>`.
  - Show "Connecting your RP Data account…" with a spinner meanwhile.
  - Guard with a ref so React Strict Mode doesn't POST the single-use code twice.

- [ ] **Step 5: Settings.** When `rpdata` is `"linked"`, add an "RP Data" row: "Connected as {rpUsername}" with a "Disconnect" button that calls `disconnectRpData()` and then routes to `/connect-rpdata/`. When `"disabled"`, hide the row.

- [ ] **Step 6: Live drawer.** A 409 from the campaign call calls `markRpDataUnlinked()`.

- [ ] **Step 7: Verify.**
  - `pnpm exec tsc --noEmit && pnpm test && pnpm build`. Expected: no type errors, tests pass, and `out/connect-rpdata/index.html` and `out/auth/rpdata/callback/index.html` exist.
  - With the RP Data env values empty, `pnpm dev`: sign-in lands on `/` exactly as before (Review Focus 4).
  - With dummy values (`NEXT_PUBLIC_RPDATA_AUTH_URL=https://auth.corelogic.asia`, `NEXT_PUBLIC_RPDATA_CLIENT_ID=test`) and the deployed API returning 200 `{connected:false}`: sign-in redirects to `/connect-rpdata/`. "Connect RP Data" navigates to an `auth.corelogic.asia/as/authorization.oauth2?…` URL with all five params. Opening `/auth/rpdata/callback/?code=x&state=wrong` shows the expired-link error and sends no POST (check the network panel).

- [ ] **Step 8: Commit**
  ```bash
  git add app/connect-rpdata app/auth lib/store.tsx components/app-shell.tsx app/settings/page.tsx components/live-drawer.tsx
  git commit -m "feat: mandatory RP Data connect step in sign-in with callback and settings"
  ```

---

**Not in this plan (waiting on Cotality):** deploying the stack with real user-auth credentials, registering `https://next.eronka.com/auth/rpdata/callback/`, flipping `dataAuth` to `user`, and the end-to-end check against UAT or Production.
