import { test } from "node:test"
import assert from "node:assert/strict"
import {
  fetchSiteChecks,
  insetRings,
  lotQueryUrl,
  NSW_CADASTRE_LOTS,
  NSW_PLANNING,
  parseLot,
  summarise,
  verdict,
  type Restriction,
} from "./site-checks.ts"

test("lotQueryUrl asks the cadastre for the lot under a point, in WGS84", () => {
  const url = new URL(lotQueryUrl(-33.88, 151.1856))
  assert.equal(`${url.origin}${url.pathname}`, `${NSW_CADASTRE_LOTS}/query`)
  const q = url.searchParams
  assert.equal(q.get("geometry"), "151.1856,-33.88")
  assert.equal(q.get("geometryType"), "esriGeometryPoint")
  assert.equal(q.get("inSR"), "4326")
  assert.equal(q.get("outSR"), "4326")
  assert.equal(q.get("returnGeometry"), "true")
})

test("parseLot reads the label and rings of the first lot", () => {
  const rings = [[[151, -33], [151.001, -33], [151.001, -33.001], [151, -33]]]
  assert.deepEqual(
    parseLot({ features: [{ attributes: { lotnumber: "2", planlabel: "DP87113" }, geometry: { rings } }] }),
    { label: "2/DP87113", rings },
  )
  assert.equal(parseLot({ features: [] }), null)
  assert.equal(parseLot({ error: { code: 400 } }), null)
})

test("insetRings pulls every vertex toward the outer ring's centre", () => {
  const [ring] = insetRings([[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]], 0.9)
  assert.deepEqual(ring[0].map((v) => +v.toFixed(6)), [0.5, 0.5])
  assert.deepEqual(ring[2].map((v) => +v.toFixed(6)), [9.5, 9.5])
})

test("summarise turns layer attributes into short, distinct details", () => {
  assert.deepEqual(
    summarise("zoning", [
      { LAY_CLASS: "General Residential", SYM_CODE: "R1" },
      { LAY_CLASS: "Infrastructure", SYM_CODE: "SP2" },
      { LAY_CLASS: "General Residential", SYM_CODE: "R1" },
    ]),
    ["R1 General Residential", "SP2 Infrastructure"],
  )
  assert.deepEqual(summarise("fsr", [{ FSR: 1 }, { FSR: 0.8 }, { FSR: 1 }]), ["0.8:1", "1:1"])
  assert.deepEqual(summarise("height", [{ MAX_B_H: 9, UNITS: "m" }]), ["9 m"])
  assert.deepEqual(summarise("minLot", [{ LOT_SIZE: 450, UNITS: "m²" }, { LOT_SIZE: 40, UNITS: "ha" }]), [
    "40 ha",
    "450 m²",
  ])
  assert.deepEqual(
    summarise("heritage", [{ LAY_CLASS: "Conservation Area - General", H_NAME: "Hereford and Forest Lodge" }]),
    ["Conservation Area - General: Hereford and Forest Lodge"],
  )
  assert.deepEqual(summarise("bushfire", [{ Category: 1, d_Category: "Vegetation Category 1" }]), [
    "Vegetation Category 1",
  ])
  assert.deepEqual(summarise("acidSulfate", [{ LAY_CLASS: "Class 5" }, { LAY_CLASS: "Class 3" }]), [
    "Class 3",
    "Class 5",
  ])
  assert.deepEqual(summarise("ols", [{ MINIMUM_HEIGHT: 120, MAXIMUM_HEIGHT: 130 }]), ["120–130 m AHD"])
  assert.deepEqual(summarise("flood", []), [])
})

const r = (status: Restriction["status"], key: Restriction["key"] = "flood"): Restriction => ({
  key, label: key, status, details: [],
})

test("verdict lists affected restrictions and counts failed checks, but not the easement", () => {
  assert.deepEqual(verdict([r("clear"), r("unknown", "easement")]), { affected: [], unknown: 0 })
  assert.deepEqual(verdict([r("affected", "heritage"), r("unknown"), r("clear", "ols")]), {
    affected: [r("affected", "heritage")],
    unknown: 1,
  })
})

function fakeFetch(lot: unknown, byLayer: Record<string, unknown>, calls: string[] = []) {
  return (async (input: string | URL, init?: RequestInit) => {
    const url = String(input)
    calls.push(url + (init?.body ? `?${init.body}` : ""))
    const body = url.startsWith(NSW_CADASTRE_LOTS)
      ? lot
      : byLayer[url.slice(NSW_PLANNING.length + 1).replace("/MapServer/", "/").replace("/query", "")]
    if (body === undefined) return new Response("", { status: 500 })
    return new Response(JSON.stringify(body), { status: 200 })
  }) as typeof fetch
}

const glebeLot = {
  features: [
    {
      attributes: { lotnumber: "2", planlabel: "DP87113" },
      geometry: { rings: [[[151.1855, -33.8801], [151.1857, -33.8801], [151.1857, -33.8799], [151.1855, -33.8801]]] },
    },
  ],
}
const none = { features: [] }
const glebeLayers: Record<string, unknown> = {
  "Planning/EPI_Primary_Planning_Layers/2": { features: [{ attributes: { LAY_CLASS: "General Residential", SYM_CODE: "R1" } }] },
  "Planning/EPI_Primary_Planning_Layers/1": { features: [{ attributes: { FSR: 0.8 } }] },
  "Planning/EPI_Primary_Planning_Layers/5": { features: [{ attributes: { MAX_B_H: 9, UNITS: "m" } }] },
  "Planning/EPI_Primary_Planning_Layers/4": none,
  "Planning/EPI_Primary_Planning_Layers/0": {
    features: [{ attributes: { LAY_CLASS: "Conservation Area - General", H_NAME: "Hereford and Forest Lodge" } }],
  },
  "Planning/Hazard/1": none,
  "ePlanning/Planning_Portal_Hazard/229": none,
  "Planning/Protection/10": none,
  "Planning/Protection/1": { features: [{ attributes: { LAY_CLASS: "Class 5" } }] },
  "Planning/Hazard/2": none,
  "Planning/Protection/6": none,
}

test("fetchSiteChecks queries every layer with the lot polygon", async () => {
  const calls: string[] = []
  const s = await fetchSiteChecks(-33.88, 151.1856, fakeFetch(glebeLot, glebeLayers, calls))
  assert.equal(s.lot, "2/DP87113")
  assert.deepEqual(s.controls, {
    zoning: ["R1 General Residential"],
    fsr: ["0.8:1"],
    height: ["9 m"],
    minLot: [],
  })
  assert.deepEqual(
    s.restrictions.map((x) => [x.key, x.status, x.details]),
    [
      ["heritage", "affected", ["Conservation Area - General: Hereford and Forest Lodge"]],
      ["flood", "clear", []],
      ["bushfire", "clear", []],
      ["biodiversity", "clear", []],
      ["acidSulfate", "affected", ["Class 5"]],
      ["landslip", "clear", []],
      ["ols", "clear", []],
      ["easement", "unknown", []],
    ],
  )
  const layerCall = calls.find((c) => c.includes("Planning/Hazard/MapServer/1/query"))!
  assert.match(layerCall, /geometryType=esriGeometryPolygon/)
  assert.match(layerCall, /spatialRel=esriSpatialRelIntersects/)
})

test("fetchSiteChecks falls back to the point and marks failed layers unknown", async () => {
  const calls: string[] = []
  const { "Planning/Hazard/1": _flood, ...rest } = glebeLayers
  const s = await fetchSiteChecks(-33.88, 151.1856, fakeFetch(none, rest, calls))
  assert.equal(s.lot, null)
  assert.equal(s.restrictions.find((x) => x.key === "flood")!.status, "unknown")
  const layerCall = calls.find((c) => c.includes("Planning/Protection/MapServer/1/query"))!
  assert.match(layerCall, /geometryType=esriGeometryPoint/)
  assert.match(layerCall, /geometry=151.1856%2C-33.88/)
})
