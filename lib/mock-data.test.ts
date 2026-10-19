import { test } from "node:test"
import assert from "node:assert/strict"
import { properties, suburbs, todAreas } from "./mock-data.ts"
import { distanceMeters, filterProperties } from "./search.ts"

test("14 listings with unique ids across the three demo suburbs", () => {
  assert.equal(properties.length, 14)
  assert.equal(new Set(properties.map((p) => p.id)).size, 14)
  const names = new Set(suburbs.map((s) => s.name))
  for (const p of properties) assert.ok(names.has(p.suburb), p.suburb)
})

test("Glebe listings are LMR but never TOD (matches live NSW data)", () => {
  const glebe = properties.filter((p) => p.suburb === "Glebe")
  assert.equal(glebe.length, 6)
  assert.ok(glebe.every((p) => p.lmr && !p.tod))
})

test("tod flags agree with TOD area geometry (clear margin either side)", () => {
  for (const p of properties) {
    const d = Math.min(...todAreas.map((a) => distanceMeters([p.lat, p.lng], a.center)))
    if (p.tod) assert.ok(d <= 300, `${p.id} flagged TOD but ${Math.round(d)}m away`)
    else assert.ok(d >= 500, `${p.id} not TOD but only ${Math.round(d)}m away`)
  }
})

test("demo funnel: Marrickville + TOD + 20m + for sale leaves at least 2", () => {
  const hits = filterProperties(properties, {
    suburb: "Marrickville",
    todOnly: true,
    minFrontage: 20,
    forSaleOnly: true,
  })
  assert.ok(hits.length >= 2, `only ${hits.length}`)
})

test("Glebe + TOD yields nothing", () => {
  assert.equal(
    filterProperties(properties, { suburb: "Glebe", todOnly: true, minFrontage: 0, forSaleOnly: false }).length,
    0,
  )
})

test("todDistance matches the distance to the nearest TOD area (within 60m)", () => {
  for (const p of properties) {
    const d = Math.min(...todAreas.map((a) => distanceMeters([p.lat, p.lng], a.center)))
    assert.ok(Math.abs(p.todDistance - d) <= 60, `${p.id} todDistance ${p.todDistance} vs ${Math.round(d)}m`)
  }
})
