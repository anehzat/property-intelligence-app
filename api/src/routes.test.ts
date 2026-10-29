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
