import { test } from "node:test"
import assert from "node:assert/strict"
import { route, type RouteDeps } from "./routes.ts"
import { CotalityError, type CotalityClient } from "./cotality.ts"
import { RpDataError, type TokenManager } from "./rpdata-tokens.ts"

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

function tokens(over: Partial<TokenManager> = {}): TokenManager & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    async status(id) { calls.push(`status:${id}`); return { connected: true, username: "u@x.com" } },
    async connect(id, code, uri) { calls.push(`connect:${id}:${code}:${uri}`); return { connected: true, username: "u@x.com" } },
    async disconnect(id) { calls.push(`disconnect:${id}`) },
    async accessToken(id) { calls.push(`token:${id}`); return "user-token" },
    ...over,
  }
}
const deps = (client: CotalityClient, over: Partial<RouteDeps> = {}): RouteDeps => ({
  client,
  tokens: tokens(),
  dataAuth: "client",
  redirectOrigins: ["https://next.eronka.com"],
  ...over,
})
const authed = (sub = "user-1") => ({ authorizer: { jwt: { claims: { sub } } } })
const body = (r: { body: string }) => JSON.parse(r.body)

test("GET /listings returns mapped listings", async () => {
  const c = client()
  const r = await route({ routeKey: "GET /listings", queryStringParameters: { suburb: "Seven Hills" } }, deps(c), silent)
  assert.equal(r.statusCode, 200)
  assert.equal(r.headers["content-type"], "application/json")
  assert.deepEqual(c.queries, ["Seven Hills NSW 2147"])
  assert.equal(body(r).listings[0].id, "cl-5")
  assert.equal(body(r).suburb, "Seven Hills")
})

test("GET /listings with a bad suburb is 400 and never calls Cotality", async () => {
  const c = client()
  const r = await route({ routeKey: "GET /listings", queryStringParameters: { suburb: "Glebe" } }, deps(c), silent)
  assert.equal(r.statusCode, 400)
  assert.match(body(r).error, /Blacktown, Quakers Hill, Seven Hills/)
  assert.deepEqual(c.queries, [])
})

test("GET /listings/{id}/campaign returns the campaign or 404", async () => {
  const ok = await route({ routeKey: "GET /listings/{id}/campaign", pathParameters: { id: "5" } }, deps(client()), silent)
  assert.equal(ok.statusCode, 200)
  assert.equal(body(ok).agentName, "A")
  const none = await route(
    { routeKey: "GET /listings/{id}/campaign", pathParameters: { id: "5" } },
    deps(client({ async saleCampaign() { return null } })),
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
      deps(client({ async suggestLocality() { throw err } })),
      silent,
    )
    assert.equal(r.statusCode, status)
    assert.match(body(r).error, msg)
  }
})

test("unknown routes are 404", async () => {
  const r = await route({ routeKey: "GET /nope" }, deps(client()), silent)
  assert.equal(r.statusCode, 404)
})

test("logs one line with route, status and duration but no listing data", async () => {
  const lines: string[] = []
  await route(
    { routeKey: "GET /listings", queryStringParameters: { suburb: "Blacktown" }, requestContext: { requestId: "r1" } },
    deps(client()),
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

const connectBody = JSON.stringify({ code: "abc", redirectUri: "https://next.eronka.com/auth/rpdata/callback/" })

test("GET /rpdata/status returns the manager's status for claims.sub", async () => {
  const tk = tokens()
  const r = await route({ routeKey: "GET /rpdata/status", requestContext: authed("u9") }, deps(client(), { tokens: tk }), silent)
  assert.equal(r.statusCode, 200)
  assert.deepEqual(body(r), { connected: true, username: "u@x.com" })
  assert.deepEqual(tk.calls, ["status:u9"])
})

test("POST /rpdata/connect returns 200 {connected, username}", async () => {
  const tk = tokens()
  const r = await route(
    { routeKey: "POST /rpdata/connect", body: connectBody, requestContext: authed("u9") },
    deps(client(), { tokens: tk }),
    silent,
  )
  assert.equal(r.statusCode, 200)
  assert.deepEqual(body(r), { connected: true, username: "u@x.com" })
  assert.deepEqual(tk.calls, ["connect:u9:abc:https://next.eronka.com/auth/rpdata/callback/"])
})

test("POST /rpdata/connect with a bad body is 400", async () => {
  const tk = tokens()
  for (const b of ["nope", JSON.stringify({ code: "abc", redirectUri: "https://evil.test/auth/rpdata/callback/" })]) {
    const r = await route(
      { routeKey: "POST /rpdata/connect", body: b, requestContext: authed() },
      deps(client(), { tokens: tk }),
      silent,
    )
    assert.equal(r.statusCode, 400)
  }
  assert.deepEqual(tk.calls, [])
})

test("RpDataError maps to its status and {error, code}", async () => {
  const tk = tokens({ async status() { throw new RpDataError(409, "RPDATA_IN_USE", "In use") } })
  const lines: string[] = []
  const r = await route(
    { routeKey: "GET /rpdata/status", requestContext: authed() },
    deps(client(), { tokens: tk }),
    (l) => lines.push(l),
  )
  assert.equal(r.statusCode, 409)
  assert.deepEqual(body(r), { error: "In use", code: "RPDATA_IN_USE" })
  assert.equal(JSON.parse(lines[0]).code, "RPDATA_IN_USE")
})

test("DELETE /rpdata/connection returns 204", async () => {
  const tk = tokens()
  const r = await route(
    { routeKey: "DELETE /rpdata/connection", requestContext: authed("u9") },
    deps(client(), { tokens: tk }),
    silent,
  )
  assert.equal(r.statusCode, 204)
  assert.equal(r.body, "")
  assert.deepEqual(tk.calls, ["disconnect:u9"])
})

test("a missing claims.sub is 401", async () => {
  const tk = tokens()
  for (const routeKey of ["GET /rpdata/status", "POST /rpdata/connect", "DELETE /rpdata/connection"]) {
    const r = await route({ routeKey, body: connectBody }, deps(client(), { tokens: tk }), silent)
    assert.equal(r.statusCode, 401)
    assert.deepEqual(body(r), { error: "Unauthorized" })
  }
  assert.deepEqual(tk.calls, [])
})

test("user mode passes the user's token to Cotality", async () => {
  const seen: (string | undefined)[] = []
  const c = client({
    async suggestLocality(_q, t) { seen.push(t); return 1 },
    async searchForSale(_l, _q, t) { seen.push(t); return {} },
  })
  const r = await route(
    { routeKey: "GET /listings", queryStringParameters: { suburb: "Blacktown" }, requestContext: authed("u9") },
    deps(c, { dataAuth: "user" }),
    silent,
  )
  assert.equal(r.statusCode, 200)
  assert.deepEqual(seen, ["user-token", "user-token"])
})

test("user mode without a link is 409 RPDATA_NOT_LINKED", async () => {
  const tk = tokens({ async accessToken() { throw new RpDataError(409, "RPDATA_NOT_LINKED", "RP Data not linked") } })
  const r = await route(
    { routeKey: "GET /listings", queryStringParameters: { suburb: "Blacktown" }, requestContext: authed() },
    deps(client(), { tokens: tk, dataAuth: "user" }),
    silent,
  )
  assert.equal(r.statusCode, 409)
  assert.deepEqual(body(r), { error: "RP Data not linked", code: "RPDATA_NOT_LINKED" })
})

test('user mode 401 from Cotality is 502 "Cotality rejected the RP Data token"', async () => {
  const r = await route(
    { routeKey: "GET /listings/{id}/campaign", pathParameters: { id: "5" }, requestContext: authed() },
    deps(client({ async saleCampaign() { throw new CotalityError(401, "user token rejected", true) } }), { dataAuth: "user" }),
    silent,
  )
  assert.equal(r.statusCode, 502)
  assert.deepEqual(body(r), { error: "Cotality rejected the RP Data token" })
})

test("client mode never calls tokens.accessToken", async () => {
  const tk = tokens()
  const seen: (string | undefined)[] = []
  const c = client({ async suggestLocality(_q, t) { seen.push(t); return 1 } })
  await route(
    { routeKey: "GET /listings", queryStringParameters: { suburb: "Blacktown" }, requestContext: authed() },
    deps(c, { tokens: tk }),
    silent,
  )
  assert.deepEqual(tk.calls, [])
  assert.deepEqual(seen, [undefined])
})
