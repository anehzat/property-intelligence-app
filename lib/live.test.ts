import { test } from "node:test"
import assert from "node:assert/strict"
import {
  LiveError, campaignUrl, centerOf, fetchLive, isListingsResponse, listingsUrl, matchLiveSuburb,
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

test("matchLiveSuburb finds live suburbs in free text, tolerating a trailing s", () => {
  assert.equal(matchLiveSuburb("Quakers Hills"), "Quakers Hill")
  assert.equal(matchLiveSuburb("houses in seven hills nsw"), "Seven Hills")
  assert.equal(matchLiveSuburb("BLACKTOWN"), "Blacktown")
  assert.equal(matchLiveSuburb("quakers  hill"), "Quakers Hill")
})

test("matchLiveSuburb ignores other places", () => {
  assert.equal(matchLiveSuburb("Glebe"), null)
  assert.equal(matchLiveSuburb("Blacktowner"), null)
  assert.equal(matchLiveSuburb(""), null)
  assert.equal(matchLiveSuburb("Find properties with LMR upside"), null)
  assert.equal(matchLiveSuburb("black"), null)
})

test("matchLiveSuburb tolerates a missing s, odd spacing and small typos", () => {
  assert.equal(matchLiveSuburb("seven hill"), "Seven Hills")
  assert.equal(matchLiveSuburb("seven halls"), "Seven Hills")
  assert.equal(matchLiveSuburb("sevenhills"), "Seven Hills")
  assert.equal(matchLiveSuburb("Black town"), "Blacktown")
  assert.equal(matchLiveSuburb("blaktown"), "Blacktown")
  assert.equal(matchLiveSuburb("quaker hill"), "Quakers Hill")
  assert.equal(matchLiveSuburb("houses in qakers hils"), "Quakers Hill")
})
