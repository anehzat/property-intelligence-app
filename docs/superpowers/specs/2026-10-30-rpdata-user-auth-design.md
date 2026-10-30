# RP Data user authentication (RP.Inside Steps 1–3): design

_30 October 2026. Ticket: "Implement page 7 internal authentication instruction"._

## Intent

Cotality (Fion Lee, Data Products Implementations) requires that every N3X7 user holds their own RP Data subscription and that their RP Data login is what gives access to Cotality data, built into the app's sign-in. The RP.Inside guide ("User Auth and Silent Login V4.0") describes this as three steps:

1. **Authenticate user** (pages 4–5): redirect to Cotality's login page, which returns a one-time authorisation `code`.
2. **Generate a user token** (pages 6–7): exchange the code for an access token (~1 hour) and a refresh token.
3. **OAuth refresh token** (page 7): keep getting new tokens with the refresh token, so the user never logs in to RP Data again. Each refresh token works **once**. It never expires unless revoked; if revoked, start again from Step 1.

The ticket is done when Steps 1–3 work: a user links their RP Data account once, and from then on N3X7 gets Cotality tokens for that user silently.

## Goals

- Every N3X7 user must link their RP Data account during sign-in before they can see any Cotality data.
- After linking, the user is never asked for RP Data credentials again unless Cotality revokes the token.
- Cotality data calls can use the signed-in user's own token.
- The client secret and the user's Cotality tokens never reach the browser.
- The environment (UAT or Production) is configuration only, because Cotality hasn't confirmed which one we use yet.

## Non-goals

- Silent login / deep linking into RP Data with HMAC (guide pages 8–9). That is a separate ticket.
- Cotality disclaimer display requirements.
- Replacing Cognito. Cognito stays as the N3X7 identity (admin-invited users only).
- Switching the data API from sandbox to UAT/Production. This only adds the switch.
- An admin UI for linked accounts.

## Anti-goals (this would be a failure even if it "works")

- A refresh token or client secret readable from the browser, the logs or the page URL after the callback.
- Two concurrent requests both using the same refresh token, so one fails and the user is pushed back to Cotality's login for no reason.
- Any route showing Cotality data to a user who hasn't linked RP Data (when the user-token mode is on).

## Decided with the product owner

- **Sign-in model:** keep Cognito, and add a mandatory "Connect RP Data" step to the sign-in flow. This works like the existing "Set a new password" step.
- **Scope:** Steps 1–3 only.
- **Refresh tokens** are stored server-side, per user, in DynamoDB.
- **One RP Data account links to at most one N3X7 user**, so staff can't share an RP Data login. This enforces Cotality's "every user holds their own subscription" rule.
- **Environment** is configuration, with UAT or Production chosen later.
- **Cotality data calls** use the user's token. The existing client-credentials token (sandbox) stays behind a config switch until the environment is confirmed.

## Facts from Cotality's guide

| Item | Value |
|---|---|
| Auth domain | UAT `https://auth-uat.corelogic.asia`, Production `https://auth.corelogic.asia` |
| Step 1 | `GET {auth}/as/authorization.oauth2?response_type=code&client_id=…&redirect_uri=…&scope=openid`. The user logs in on Cotality's page (and picks an account if they have several), then gets a 302 to `redirect_uri?code=…` |
| Step 2 | `POST {auth}/as/token.oauth2`, form-encoded: `grant_type=authorization_code`, `client_id`, `client_secret`, `code`, `redirect_uri` (must be identical to Step 1) |
| Step 3 | `POST {auth}/as/token.oauth2`, form-encoded: `grant_type=refresh_token`, `client_id`, `client_secret`, `refresh_token` |
| Token response | `access_token` (JWT; claims include `sub`, `username`, `exp`), `refresh_token`, `expires_in` (~3599), `token_type: Bearer`, `scope`, `id_token` |
| Errors (Table 8) | 401 `invalid_request` / `invalid_client` (bad client credentials), 400 `invalid_grant` (used or invalid code or refresh token, redirect URI mismatch), 400 `unsupported_grant_type` |
| Redirect URI | Must be registered with Cotality first, per client ID and environment |

The user's RP Data account is **Production** (`rpp.corelogic.com.au`). The data API today is the **sandbox** (`api-sbox.corelogic.asia`), which is unlikely to accept a Production user token. That is why data calls keep the switch.

## The flow

```
Login page ──Cognito SRP──▶ signed in ──GET /rpdata/status──▶ linked? ── yes ──▶ app
                                                              │
                                                              no
                                                              ▼
                                       /connect-rpdata/ page: "Connect your RP Data account"
                                                              │ (button)
                                                              ▼
                     browser → {auth}/as/authorization.oauth2?…&state=<random>   (Step 1)
                                                              │ user logs in at Cotality
                                                              ▼
                     /auth/rpdata/callback/?code=…&state=…  (checks state, strips code from URL)
                                                              │ POST /rpdata/connect {code, redirectUri}  + Cognito JWT
                                                              ▼
                     Lambda: Step 2 exchange → store tokens for this Cognito user → 200
                                                              ▼
                                                             app
Later, any Cotality data call:
  Lambda reads this user's tokens → access token valid for 5+ minutes? use it
                                 → otherwise Step 3 refresh (one at a time per user) → store new pair → use
  Refresh fails with invalid_grant → delete the link → API returns 409 "RP Data not linked" → app sends the user to /connect-rpdata/
```

### Front end (static export, no server)

- **Config** (`.env`, public values): `NEXT_PUBLIC_RPDATA_AUTH_URL` (the auth domain) and `NEXT_PUBLIC_RPDATA_CLIENT_ID`. If either is empty, the whole RP Data step is skipped, so the app keeps working before Cotality sends credentials. Add `features.rpdata` alongside the existing flags.
- **Redirect URI** = `window.location.origin + "/auth/rpdata/callback/"`. Keep the trailing slash, because of `trailingSlash: true`. This gives the same path on production and localhost; only the origin differs.
- **`state`**: a random value saved in `sessionStorage` before Step 1 and checked on the callback (CSRF protection). The guide doesn't mention `state`, but it is standard OAuth and the PingFederate endpoint returns it. _(My call.)_
- **Sign-in gate:** after the Cognito session is restored or created, `AppShell` calls `GET /rpdata/status`. If not linked, it redirects to `/connect-rpdata/`. `/login/`, `/connect-rpdata/` and `/auth/rpdata/callback/` are exempt from that redirect. Every other page stays gated as now.
- **`/connect-rpdata/` page:** same card style as the login page. It explains that N3X7 uses your RP Data account for Cotality data, has a "Connect RP Data" button and a "Sign out" link, and shows an error message when the callback failed. For `RPDATA_IN_USE` the message says the account is already linked to another N3X7 user and to contact an admin.
- **Callback page:** checks `state`, calls `history.replaceState` to drop `code` from the URL, posts the code, then goes to `/`. On failure it goes to `/connect-rpdata/` with the error.
- **A 409 from any data route** sends the user to `/connect-rpdata/`.
- **Settings page:** shows "RP Data: connected as {username}" with a "Disconnect" button. _(My call: small, and it gives a way to re-link.)_

### API (Lambda + API Gateway)

New routes, all behind the existing Cognito JWT authorizer. The Cognito user ID is `requestContext.authorizer.jwt.claims.sub`.

| Route | Does | Returns |
|---|---|---|
| `GET /rpdata/status` | Reads the user's link | `{ connected: boolean, username?: string }` |
| `POST /rpdata/connect` | Body `{ code, redirectUri }`. Checks `redirectUri` against an allowlist, runs Step 2, stores the result | 200 `{ connected: true, username }`; 400 when Cotality says `invalid_grant`; 409 `RPDATA_IN_USE` when the RP Data account belongs to another user; 502 for other failures |
| `DELETE /rpdata/connection` | Deletes the user's link | 204 |

- **`redirectUri` allowlist:** the same origins as `AllowedOrigins`, plus `/auth/rpdata/callback/`. A redirect URI from anywhere else gets a 400.
- **CORS:** add `POST` and `DELETE` to `AllowMethods`.
- **`username`** comes from the access token's `username` claim. Decode it only; we don't verify it, because it came straight from Cotality over TLS.

### Token store

- **DynamoDB table** `n3x7-rpdata-links`, partition key `userId` (the Cognito `sub`), on-demand billing, point-in-time recovery off, encrypted at rest.
- **The app also encrypts the tokens itself.** A customer-managed KMS key (`alias/n3x7-rpdata`, defined in `template.yaml`) encrypts `accessToken` and `refreshToken` with `kms:Encrypt` before every write and decrypts them after every read. Encrypt each value directly; both are well under KMS's 4 KB limit. Someone with read access to the table still can't use the tokens. This also gives Cotality's Solution Design a clear security answer. _(My call.)_
- **Item:** `userId`, `rpUsername`, `accessToken` (ciphertext), `accessExpiresAt` (epoch ms), `refreshToken` (ciphertext), `version` (number), `refreshingUntil` (epoch ms, optional), `linkedAt`, `refreshedAt`.
- **Second table** `n3x7-rpdata-accounts`, partition key `rpSub` (the `sub` claim of the Cotality access token, i.e. the RP Data user), attribute `userId`. It enforces one N3X7 user per RP Data account.
- **Linking** (`POST /rpdata/connect`) writes both items in one `TransactWriteItems`. The `accounts` put is conditional on `attribute_not_exists(rpSub) OR userId = :me`. If that condition fails, the RP Data account already belongs to someone else: return **409 `{ error: "This RP Data account is already linked to another N3X7 user", code: "RPDATA_IN_USE" }`** and store nothing. Relinking the same account to the same user is allowed. If the user was linked to a different RP Data account before, delete the old `accounts` item in the same transaction.
- **Unlinking** (disconnect, or deletion after `invalid_grant`) deletes both items in one transaction.
- **IAM:** Lambda gets `GetItem`, `PutItem`, `UpdateItem`, `DeleteItem` and `TransactWriteItems` (via those actions) on these two tables only, and `kms:Encrypt` / `kms:Decrypt` on that key only.

### Refreshing safely (Step 3)

Refresh tokens are single-use, and several Lambda containers may serve the same user at once. Only one container may refresh a user's token at a time, so a refresh takes a **lease** first. To get a token for a user:

1. Read the item. If `accessExpiresAt - now > 5 minutes`, use `accessToken`.
2. Otherwise take the lease: a conditional update that sets `refreshingUntil = now + 15 s`, only if `version` is unchanged **and** there is no unexpired `refreshingUntil`.
   - **Lease taken:** call Step 3. Then write the new pair, increment `version` and clear `refreshingUntil`, conditional on `version`.
   - **Lease not taken** (another container is refreshing): poll the item every 500 ms for up to 5 s until `version` changes, then use the new access token. If it hasn't changed, return 503 "RP Data busy, try again". Never call Cotality with the old refresh token.
3. If Step 3 returns `invalid_grant`, read the item again. If `version` changed in the meantime, use the new token. Otherwise the token was revoked: delete the item and return 409 "RP Data not linked".
4. If Cotality returns a new pair but the DynamoDB write fails, retry the write up to 3 times (the old refresh token is already used, so this write matters). If it still fails, log it and return 502. The user will have to relink, which is accepted as a rare last resort.
5. Any other Cotality failure returns 502, clears the lease and keeps the item.

The Lambda timeout goes from 10 s to 15 s so that a lease wait plus a refresh fits.

Keep an in-memory copy per container, keyed by user, so most requests don't hit DynamoDB. The rules above still decide when to refresh.

### Data calls

- New setting `dataAuth` in the Cotality secret: `"client"` (today: one client-credentials token, sandbox) or `"user"` (each user's token from the store). Default is `"client"`.
- In `"user"` mode, `GET /listings` and `GET /listings/{id}/campaign` use the caller's token. A user with no link gets 409.
- In `"user"` mode, a **401 from the data API does not trigger a refresh**: the token is always refreshed before it expires, so a 401 means Cotality rejects this token for the data API (e.g. a Production token against the sandbox). Return 502 "Cotality rejected the RP Data token" and log it. This avoids burning a single-use refresh token on every request. The existing retry-once on 401 stays for `"client"` mode. _(My call.)_

### Secrets and configuration

Add to the existing `n3x7/cotality` secret, alongside the current fields:

```json
{ "authBaseUrl": "https://auth.corelogic.asia", "userClientId": "…", "userClientSecret": "…", "dataAuth": "client" }
```

Update `api/put-cotality-secret.sh` to write the new fields. Pass the redirect allowlist to Lambda as an environment variable built from `AllowedOrigins`.

### Logging

Log route, status, duration and the Cotality error code (e.g. `invalid_grant`). Never log codes, tokens, client secrets or the RP Data username.

## Testing

- Unit tests (node --test, in the style of `api/src/*.test.ts`) with a fake `fetch` and a fake store:
  - code exchange: success, `invalid_grant`, `invalid_client`
  - the redirect allowlist
  - refresh: valid token reused; expiring token refreshed; conditional-write conflict re-reads and doesn't call Cotality twice; `invalid_grant` deletes the link and gives 409
  - the `dataAuth` switch
- Front-end pure helpers (authorize URL builder, `state` check, redirect URI) tested in `lib/*.test.ts`.
- Unit tests also cover linking: a second user linking an RP Data account that's already taken gets `RPDATA_IN_USE` and nothing is stored; the same user relinking succeeds; switching to a different RP Data account frees the old one.
- Unit tests also cover the lease: two concurrent refreshes call Cotality once; `invalid_grant` after a version change uses the new token instead of deleting; the write retry; a 401 in user mode returns 502 without refreshing.
- `api/smoke.sh` checks `GET /rpdata/status` for the smoke user and, in `"user"` mode, expects 409 from the data routes. Data routes keep their current smoke checks in `"client"` mode. No bypass for the smoke user. _(My call.)_
- End-to-end can only run once Cotality registers the redirect URI and sends the client ID and secret.

## Waiting on Cotality

- Which environment (UAT or Production), and the user-auth client ID and secret for it.
- Registration of the redirect URIs: `https://next.eronka.com/auth/rpdata/callback/`, and, if Cotality accepts it, `http://localhost:3000/auth/rpdata/callback/` for testing.

## Left to the builder

- Component structure, file names and copy wording on the connect page.
- Whether `/rpdata/status` is cached in the store for the session.
- The exact shape of the DynamoDB access code (SDK v3 `DynamoDBDocumentClient` is fine).
