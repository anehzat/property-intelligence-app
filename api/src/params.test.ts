import { test } from "node:test"
import assert from "node:assert/strict"
import { BadRequest, parseConnectBody, parseListingsQuery, parsePropertyId } from "./params.ts"

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

const origins = ["https://next.eronka.com"]
const cb = (o: object) => JSON.stringify(o)

test("parseConnectBody accepts an allowlisted redirect URI", () => {
  assert.deepEqual(
    parseConnectBody(cb({ code: "c1", redirectUri: "https://next.eronka.com/auth/rpdata/callback/" }), origins),
    { code: "c1", redirectUri: "https://next.eronka.com/auth/rpdata/callback/" },
  )
  const b64 = Buffer.from(cb({ code: "c1", redirectUri: "https://next.eronka.com/auth/rpdata/callback/" })).toString("base64")
  assert.equal(parseConnectBody(b64, origins, true).code, "c1")
})

test("parseConnectBody rejects another origin, a path without the trailing slash, a missing code, and non-JSON", () => {
  const bad = [
    cb({ code: "c1", redirectUri: "https://evil.test/auth/rpdata/callback/" }),
    cb({ code: "c1", redirectUri: "https://next.eronka.com/auth/rpdata/callback" }),
    cb({ redirectUri: "https://next.eronka.com/auth/rpdata/callback/" }),
    "not json",
    undefined,
  ]
  for (const b of bad) assert.throws(() => parseConnectBody(b, origins), BadRequest)
})
