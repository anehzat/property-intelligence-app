// NSW planning controls and land restrictions for one lot, from public NSW ArcGIS services.
// Both services allow `query` and send `Access-Control-Allow-Origin: *`, so the browser calls them directly.
export const NSW_PLANNING = "https://mapprod3.environment.nsw.gov.au/arcgis/rest/services"
export const NSW_CADASTRE_LOTS =
  "https://maps.six.nsw.gov.au/arcgis/rest/services/public/NSW_Cadastre/MapServer/9"

export type ControlKey = "zoning" | "fsr" | "height" | "minLot"
export type RestrictionKey =
  | "heritage"
  | "flood"
  | "bushfire"
  | "biodiversity"
  | "acidSulfate"
  | "landslip"
  | "ols"
  | "easement"
type LayerKey = ControlKey | Exclude<RestrictionKey, "easement">

type Attrs = Record<string, unknown>
type Rings = number[][][]

const LAYERS: Record<LayerKey, { path: string; outFields: string }> = {
  zoning: { path: "Planning/EPI_Primary_Planning_Layers/MapServer/2", outFields: "LAY_CLASS,SYM_CODE" },
  fsr: { path: "Planning/EPI_Primary_Planning_Layers/MapServer/1", outFields: "FSR" },
  height: { path: "Planning/EPI_Primary_Planning_Layers/MapServer/5", outFields: "MAX_B_H,UNITS" },
  minLot: { path: "Planning/EPI_Primary_Planning_Layers/MapServer/4", outFields: "LOT_SIZE,UNITS" },
  heritage: { path: "Planning/EPI_Primary_Planning_Layers/MapServer/0", outFields: "LAY_CLASS,H_NAME" },
  flood: { path: "Planning/Hazard/MapServer/1", outFields: "LAY_CLASS" },
  bushfire: { path: "ePlanning/Planning_Portal_Hazard/MapServer/229", outFields: "d_Category" },
  biodiversity: { path: "Planning/Protection/MapServer/10", outFields: "LAY_CLASS" },
  acidSulfate: { path: "Planning/Protection/MapServer/1", outFields: "LAY_CLASS" },
  landslip: { path: "Planning/Hazard/MapServer/2", outFields: "LAY_CLASS" },
  ols: { path: "Planning/Protection/MapServer/6", outFields: "MINIMUM_HEIGHT,MAXIMUM_HEIGHT" },
}

export const RESTRICTION_LABELS: Record<RestrictionKey, string> = {
  heritage: "Heritage",
  flood: "Flood",
  bushfire: "Bushfire",
  biodiversity: "Biodiversity",
  acidSulfate: "Acid sulfate soil",
  landslip: "Landslip",
  ols: "Airspace (OLS)",
  easement: "Easement",
}

export interface Restriction {
  key: RestrictionKey
  label: string
  status: "clear" | "affected" | "unknown"
  details: string[]
}

export interface SiteChecks {
  /** Lot/plan label, or null when the point isn't on a lot and the checks used the point itself. */
  lot: string | null
  /** Distinct values per control; [] means the LEP doesn't map one, null means the check failed. */
  controls: Record<ControlKey, string[] | null>
  restrictions: Restriction[]
}

export function lotQueryUrl(lat: number, lng: number): string {
  const params = new URLSearchParams({
    geometry: `${lng},${lat}`,
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "lotnumber,planlabel",
    returnGeometry: "true",
    outSR: "4326",
    geometryPrecision: "7",
    f: "json",
  })
  return `${NSW_CADASTRE_LOTS}/query?${params}`
}

export function parseLot(json: unknown): { label: string; rings: Rings } | null {
  const f = (json as { features?: { attributes?: Attrs; geometry?: { rings?: Rings } }[] })?.features?.[0]
  const rings = f?.geometry?.rings
  if (!f || !rings?.length) return null
  const { lotnumber, planlabel } = f.attributes ?? {}
  return { label: [lotnumber, planlabel].filter(Boolean).join("/"), rings }
}

/** Shrinks the lot toward its centre so layers that only touch its boundary (neighbours, roads) don't match. */
export function insetRings(rings: Rings, factor = 0.9): Rings {
  const [first, ...rest] = rings[0]
  const last = rest.at(-1)
  // Rings repeat their first vertex at the end; count it once.
  const outer = last && last[0] === first[0] && last[1] === first[1] ? [first, ...rest.slice(0, -1)] : rings[0]
  const cx = outer.reduce((s, p) => s + p[0], 0) / outer.length
  const cy = outer.reduce((s, p) => s + p[1], 0) / outer.length
  return rings.map((ring) => ring.map(([x, y]) => [cx + (x - cx) * factor, cy + (y - cy) * factor]))
}

const num = (v: unknown) => (typeof v === "number" ? +v.toFixed(2) : null)
const str = (v: unknown) => (typeof v === "string" && v.trim() && v !== "Null" ? v.trim() : null)

const DETAIL: Record<LayerKey, (a: Attrs) => string | null> = {
  zoning: (a) => [str(a.SYM_CODE), str(a.LAY_CLASS)].filter(Boolean).join(" ") || null,
  fsr: (a) => (num(a.FSR) !== null ? `${num(a.FSR)}:1` : null),
  height: (a) => (num(a.MAX_B_H) !== null ? `${num(a.MAX_B_H)} ${str(a.UNITS) ?? "m"}` : null),
  minLot: (a) => (num(a.LOT_SIZE) !== null ? `${num(a.LOT_SIZE)} ${str(a.UNITS) ?? "m²"}` : null),
  heritage: (a) => [str(a.LAY_CLASS), str(a.H_NAME)].filter(Boolean).join(": ") || "Heritage",
  flood: (a) => str(a.LAY_CLASS) ?? "Flood planning area",
  bushfire: (a) => str(a.d_Category) ?? "Bushfire prone land",
  biodiversity: (a) => str(a.LAY_CLASS) ?? "Biodiversity",
  acidSulfate: (a) => str(a.LAY_CLASS) ?? "Acid sulfate soils",
  landslip: (a) => str(a.LAY_CLASS) ?? "Landslide risk",
  ols: (a) =>
    num(a.MINIMUM_HEIGHT) !== null && num(a.MAXIMUM_HEIGHT) !== null
      ? `${num(a.MINIMUM_HEIGHT)}–${num(a.MAXIMUM_HEIGHT)} m AHD`
      : "Obstacle limitation surface",
}

/** Distinct, sorted detail strings for one layer's matching features. */
export function summarise(key: LayerKey, features: Attrs[]): string[] {
  const out = new Set<string>()
  for (const a of features) {
    const d = DETAIL[key](a)
    if (d) out.add(d)
  }
  return [...out].sort((a, b) => a.localeCompare(b, "en", { numeric: true }))
}

/** Affected restrictions and failed checks. Easement is always unknown (it needs a title search), so it isn't counted. */
export function verdict(restrictions: Restriction[]): { affected: Restriction[]; unknown: number } {
  return {
    affected: restrictions.filter((r) => r.status === "affected"),
    unknown: restrictions.filter((r) => r.status === "unknown" && r.key !== "easement").length,
  }
}

type Geometry = { type: "esriGeometryPoint"; value: string } | { type: "esriGeometryPolygon"; value: string }

async function queryLayer(key: LayerKey, geom: Geometry, fetchFn: typeof fetch): Promise<Attrs[] | null> {
  const body = new URLSearchParams({
    geometry: geom.value,
    geometryType: geom.type,
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: LAYERS[key].outFields,
    returnGeometry: "false",
    f: "json",
  })
  try {
    // POST, because a lot polygon can be too long for a URL.
    const r = await fetchFn(`${NSW_PLANNING}/${LAYERS[key].path}/query`, { method: "POST", body })
    if (!r.ok) return null
    const j = (await r.json()) as { features?: { attributes: Attrs }[]; error?: unknown }
    if (j.error || !Array.isArray(j.features)) return null
    return j.features.map((f) => f.attributes)
  } catch {
    return null
  }
}

async function findLot(lat: number, lng: number, fetchFn: typeof fetch) {
  try {
    const r = await fetchFn(lotQueryUrl(lat, lng))
    return r.ok ? parseLot(await r.json()) : null
  } catch {
    return null
  }
}

export async function fetchSiteChecks(lat: number, lng: number, fetchFn: typeof fetch = fetch): Promise<SiteChecks> {
  const lot = await findLot(lat, lng, fetchFn)
  const geom: Geometry = lot
    ? { type: "esriGeometryPolygon", value: JSON.stringify({ rings: insetRings(lot.rings) }) }
    : { type: "esriGeometryPoint", value: `${lng},${lat}` }
  const keys = Object.keys(LAYERS) as LayerKey[]
  const results = await Promise.all(keys.map((k) => queryLayer(k, geom, fetchFn)))
  const details = Object.fromEntries(
    keys.map((k, i) => [k, results[i] === null ? null : summarise(k, results[i]!)]),
  ) as Record<LayerKey, string[] | null>

  const restrictions = (Object.keys(RESTRICTION_LABELS) as RestrictionKey[]).map((key): Restriction => {
    // Easements are on the title (88B instrument), not in any planning layer.
    const d = key === "easement" ? null : details[key]
    return {
      key,
      label: RESTRICTION_LABELS[key],
      status: d === null ? "unknown" : d.length ? "affected" : "clear",
      details: d ?? [],
    }
  })
  return {
    lot: lot?.label ?? null,
    controls: { zoning: details.zoning, fsr: details.fsr, height: details.height, minLot: details.minLot },
    restrictions,
  }
}

const cache = new Map<string, Promise<SiteChecks>>()

/** fetchSiteChecks, remembered per location for the session; a failed lookup is dropped so it can be retried. */
export function siteChecksFor(lat: number, lng: number): Promise<SiteChecks> {
  const id = `${lat.toFixed(6)},${lng.toFixed(6)}`
  let p = cache.get(id)
  if (!p) {
    p = fetchSiteChecks(lat, lng)
    p.catch(() => cache.delete(id))
    cache.set(id, p)
  }
  return p
}
