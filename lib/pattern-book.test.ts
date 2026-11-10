import { test } from "node:test"
import assert from "node:assert/strict"
import { buildablePatterns, formatRange, patterns } from "./pattern-book.ts"

const ids = (lot: { landSize: number | null; frontage: number | null }) =>
  buildablePatterns(lot).map((f) => f.pattern.id)

test("stores all 17 Pattern Book designs with unique ids and sane ranges", () => {
  assert.equal(patterns.length, 17)
  assert.equal(new Set(patterns.map((p) => p.id)).size, 17)
  for (const p of patterns) {
    for (const k of ["dwellings", "minLotArea", "minLotWidth", "storeys", "fsr", "siteGradient"] as const) {
      assert.ok(p[k].min <= p[k].max, `${p.id} ${k}`)
    }
    assert.ok(p.url.startsWith("https://www.planning.nsw.gov.au/"), p.id)
  }
})

test("matches the published key metrics for Small Lot Apartments 03", () => {
  const p = patterns.find((x) => x.id === "small-lot-apartments-03")!
  assert.deepEqual(p.dwellings, { min: 9, max: 24 })
  assert.deepEqual(p.minLotArea, { min: 640, max: 1287 })
  assert.deepEqual(p.minLotWidth, { min: 16, max: 19.8 })
  assert.deepEqual(p.storeys, { min: 4, max: 6 })
})

test("no lot area means nothing can be checked", () => {
  assert.deepEqual(buildablePatterns({ landSize: 0, frontage: 0 }), [])
  assert.deepEqual(buildablePatterns({ landSize: null, frontage: 20 }), [])
})

test("a small narrow lot fits nothing", () => {
  assert.deepEqual(ids({ landSize: 310, frontage: 9 }), [])
})

test("a lot exactly at Terraces 01 minimums fits it", () => {
  const got = ids({ landSize: 500, frontage: 15 })
  assert.ok(got.includes("terraces-01"))
  assert.ok(got.includes("row-homes-01"))
  assert.ok(!got.includes("terraces-03"), "needs 18 m width")
  assert.ok(!got.includes("manor-homes-01"), "needs 625 m²")
})

test("width rules a pattern out even when the area fits", () => {
  const got = ids({ landSize: 2000, frontage: 12 })
  assert.deepEqual(got.sort(), ["semis-01", "semis-02"])
})

test("unknown frontage checks area only and says so", () => {
  const fits = buildablePatterns({ landSize: 640, frontage: null })
  assert.ok(fits.some((f) => f.pattern.id === "small-lot-apartments-03"))
  assert.ok(fits.every((f) => f.widthUnchecked))
})

test("fitsLargest needs the top of both ranges", () => {
  const byId = (lot: { landSize: number; frontage: number }, id: string) =>
    buildablePatterns(lot).find((f) => f.pattern.id === id)!
  assert.equal(byId({ landSize: 1287, frontage: 19.8 }, "small-lot-apartments-03").fitsLargest, true)
  assert.equal(byId({ landSize: 1287, frontage: 19 }, "small-lot-apartments-03").fitsLargest, false)
  assert.equal(byId({ landSize: 640, frontage: 21 }, "small-lot-apartments-03").fitsLargest, false)
})

test("results are sorted by most dwellings first", () => {
  const fits = buildablePatterns({ landSize: 980, frontage: 32 })
  const maxes = fits.map((f) => f.pattern.dwellings.max)
  assert.deepEqual(maxes, [...maxes].sort((a, b) => b - a))
  assert.equal(fits[0].pattern.dwellings.max, 24)
})

test("formatRange collapses equal ends and adds the unit", () => {
  assert.equal(formatRange({ min: 2, max: 2 }), "2")
  assert.equal(formatRange({ min: 640, max: 1287 }, "m²"), "640–1287 m²")
})
