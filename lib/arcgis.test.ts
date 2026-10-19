import { test } from "node:test"
import assert from "node:assert/strict"
import { buildExportUrl, LMR_MAPSERVER, planningLayerIds } from "./arcgis.ts"

test("planningLayerIds maps toggles to NSW layer ids", () => {
  assert.deepEqual(planningLayerIds({ lmr: true, tod: true }), [4, 2, 3])
  assert.deepEqual(planningLayerIds({ lmr: true, tod: false }), [4])
  assert.deepEqual(planningLayerIds({ lmr: false, tod: true }), [2, 3])
  assert.deepEqual(planningLayerIds({ lmr: false, tod: false }), [])
})

test("buildExportUrl builds a transparent web-mercator export request", () => {
  const url = new URL(
    buildExportUrl({ west: 151.17, south: -33.89, east: 151.196, north: -33.872 }, 800.4, 600, [4, 2, 3]),
  )
  assert.equal(`${url.origin}${url.pathname}`, `${LMR_MAPSERVER}/export`)
  const q = url.searchParams
  assert.equal(q.get("bbox"), "151.17,-33.89,151.196,-33.872")
  assert.equal(q.get("bboxSR"), "4326")
  assert.equal(q.get("imageSR"), "3857")
  assert.equal(q.get("size"), "800,600")
  assert.equal(q.get("format"), "png32")
  assert.equal(q.get("transparent"), "true")
  assert.equal(q.get("layers"), "show:4,2,3")
  assert.equal(q.get("f"), "image")
})
