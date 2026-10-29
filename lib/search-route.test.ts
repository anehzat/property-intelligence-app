import { test } from "node:test"
import assert from "node:assert/strict"
import { noMatchMessage, routeSearch } from "./search-route.ts"
import type { Suburb } from "./types"

const demo = [{ name: "Glebe", center: [0, 0], hasTod: false }] as Suburb[]

test("routeSearch sends live suburbs to Cotality", () => {
  assert.deepEqual(routeSearch("seven halls", demo), { kind: "live", suburb: "Seven Hills" })
})

test("routeSearch sends demo suburbs to the demo filters", () => {
  assert.deepEqual(routeSearch("Glebe for sale", demo), { kind: "demo", patch: { suburb: "Glebe", forSaleOnly: true } })
})

test("routeSearch sends questions to the analyst", () => {
  assert.deepEqual(routeSearch("Find properties with LMR upside", demo), { kind: "ai" })
})

test("routeSearch reports when nothing matches", () => {
  assert.deepEqual(routeSearch("Parramatta", demo), { kind: "none" })
})

test("noMatchMessage lists the live suburbs", () => {
  assert.equal(
    noMatchMessage("xyz"),
    'No match for "xyz". Live Cotality data covers Blacktown, Quakers Hill and Seven Hills.',
  )
})
