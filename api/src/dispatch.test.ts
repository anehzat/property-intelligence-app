import { test } from "node:test"
import assert from "node:assert/strict"
import { dataAuthFrom, handle } from "./dispatch.ts"
import type { RouteDeps } from "./routes.ts"

test("dataAuthFrom returns user only for exactly user", () => {
  assert.equal(dataAuthFrom({ dataAuth: "user" }), "user")
  for (const s of [{}, null, undefined, { dataAuth: "User" }, { dataAuth: "client" }, { dataAuth: true }, "user"]) {
    assert.equal(dataAuthFrom(s), "client")
  }
})

test("a secret load failure returns 502 and never calls the route", async () => {
  let made = false
  const r = await handle(
    { routeKey: "GET /listings", queryStringParameters: { suburb: "Blacktown" } },
    async () => { throw new Error("boom") },
    () => { made = true; return {} as RouteDeps },
    () => {},
  )
  assert.equal(r.statusCode, 502)
  assert.deepEqual(JSON.parse(r.body), { error: "Cotality unavailable" })
  assert.equal(made, false)
})

test("a loaded secret picks the mode and routes", async () => {
  let mode = ""
  const r = await handle(
    { routeKey: "GET /nope" },
    async () => ({ dataAuth: "user" }),
    (m) => { mode = m; return {} as RouteDeps },
    () => {},
  )
  assert.equal(mode, "user")
  assert.equal(r.statusCode, 404)
})
