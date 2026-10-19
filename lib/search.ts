import type { Property, Suburb } from "./types"

export interface Filters {
  suburb: string | null
  todOnly: boolean
  minFrontage: number
  forSaleOnly: boolean
}

export const defaultFilters: Filters = {
  suburb: null,
  todOnly: false,
  minFrontage: 0,
  forSaleOnly: false,
}

export const frontageOptions = [0, 10, 15, 20, 25]

export function filterProperties(list: Property[], f: Filters): Property[] {
  return list.filter(
    (p) =>
      (!f.suburb || p.suburb === f.suburb) &&
      (!f.todOnly || p.tod) &&
      (f.minFrontage <= 0 || p.frontage >= f.minFrontage) &&
      (!f.forSaleOnly || p.status === "for-sale"),
  )
}

export function distanceMeters(a: [number, number], b: [number, number]): number {
  const R = 6_371_000
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(b[0] - a[0])
  const dLng = rad(b[1] - a[1])
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export function nearbyTodSuburbs(from: string, all: Suburb[]): Suburb[] {
  const origin = all.find((s) => s.name === from)
  if (!origin) return []
  return all
    .filter((s) => s.hasTod && s.name !== from)
    .sort(
      (x, y) =>
        distanceMeters(origin.center, x.center) -
        distanceMeters(origin.center, y.center),
    )
}

export function showsNoTodNotice(f: Filters, all: Suburb[]): boolean {
  if (!f.todOnly || !f.suburb) return false
  return all.find((s) => s.name === f.suburb)?.hasTod === false
}

/** Turns a free-text search into filters. Returns null when no known suburb is named. */
export function parseSearch(query: string, all: Suburb[]): Partial<Filters> | null {
  const q = query.toLowerCase()
  const suburb = all.find((s) => new RegExp(`\\b${s.name.toLowerCase()}\\b`).test(q))
  if (!suburb) return null
  const patch: Partial<Filters> = { suburb: suburb.name }
  if (/\btod\b|transport[- ]oriented/.test(q)) patch.todOnly = true
  if (/for sale|available/.test(q)) patch.forSaleOnly = true
  const m = q.match(/(\d+)\s*m\b[^.]*frontage|frontage[^\d]{0,20}(\d+)\s*m\b/)
  if (m) patch.minFrontage = Number(m[1] ?? m[2])
  return patch
}
