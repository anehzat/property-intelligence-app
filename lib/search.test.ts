import { test } from "node:test"
import assert from "node:assert/strict"
import type { Property, Suburb } from "./types"
import {
  defaultFilters,
  distanceMeters,
  filterProperties,
  nearbyTodSuburbs,
  parseSearch,
  showsNoTodNotice,
} from "./search.ts"

const suburbs: Suburb[] = [
  { name: "Glebe", center: [-33.8795, 151.185], hasTod: false },
  { name: "Marrickville", center: [-33.911, 151.155], hasTod: true },
  { name: "Dulwich Hill", center: [-33.907, 151.139], hasTod: true },
]

function prop(over: Partial<Property>): Property {
  return {
    id: "x", address: "1 Test St", suburb: "Marrickville", state: "NSW",
    price: 1, type: "house", beds: 1, baths: 1, parking: 0, landSize: 0,
    frontage: 20, status: "for-sale", score: 80, opportunity: "MODERATE",
    lat: 0, lng: 0, lmr: true, tod: true, todDistance: 100,
    developmentPotential: "Medium", insights: [],
    breakdown: { planningOpportunity: 0, marketDemand: 0, transportAccess: 0, riskScore: 0 },
    image: "", gallery: [],
    agent: { name: "A", agency: "B", phone: "", email: "" },
    ...over,
  }
}

test("filterProperties applies every active filter", () => {
  const list = [
    prop({ id: "a" }),
    prop({ id: "b", tod: false }),
    prop({ id: "c", frontage: 12 }),
    prop({ id: "d", status: "sold" }),
    prop({ id: "e", suburb: "Glebe" }),
  ]
  const f = { suburb: "Marrickville", todOnly: true, minFrontage: 20, forSaleOnly: true }
  assert.deepEqual(filterProperties(list, f).map((p) => p.id), ["a"])
  assert.equal(filterProperties(list, defaultFilters).length, 5)
})

test("distanceMeters is roughly right for ~1km", () => {
  const d = distanceMeters([-33.9, 151.15], [-33.909, 151.15])
  assert.ok(d > 980 && d < 1020, `got ${d}`)
})

test("nearbyTodSuburbs excludes origin and non-TOD, nearest first", () => {
  assert.deepEqual(
    nearbyTodSuburbs("Glebe", suburbs).map((s) => s.name),
    ["Marrickville", "Dulwich Hill"],
  )
  assert.deepEqual(nearbyTodSuburbs("Nowhere", suburbs), [])
})

test("showsNoTodNotice only for TOD filter on a suburb without TOD", () => {
  const glebe = { ...defaultFilters, suburb: "Glebe" }
  assert.equal(showsNoTodNotice({ ...glebe, todOnly: true }, suburbs), true)
  assert.equal(showsNoTodNotice({ ...glebe, todOnly: false, minFrontage: 25 }, suburbs), false)
  assert.equal(showsNoTodNotice({ ...defaultFilters, suburb: "Marrickville", todOnly: true }, suburbs), false)
  assert.equal(showsNoTodNotice({ ...defaultFilters, todOnly: true }, suburbs), false)
})

test("parseSearch reads the client's sentence", () => {
  assert.deepEqual(
    parseSearch("I want to find all properties for sale in GLEBE that are in the TOD area.", suburbs),
    { suburb: "Glebe", todOnly: true, forSaleOnly: true },
  )
})

test("parseSearch handles multi-word suburbs and frontage phrasings", () => {
  assert.deepEqual(parseSearch("dulwich hill", suburbs), { suburb: "Dulwich Hill" })
  assert.deepEqual(parseSearch("Marrickville 20m frontage", suburbs), {
    suburb: "Marrickville",
    minFrontage: 20,
  })
  assert.deepEqual(parseSearch("marrickville frontage of at least 25 m", suburbs), {
    suburb: "Marrickville",
    minFrontage: 25,
  })
})

test("parseSearch returns null without a known suburb", () => {
  assert.equal(parseSearch("Find properties with LMR potential", suburbs), null)
  assert.equal(parseSearch("Bondi", suburbs), null)
})
