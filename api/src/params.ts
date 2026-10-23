import type { ListingsQuery } from "./types.ts"

/** Sandbox-supported suburbs → the query sent to Cotality's suggest service. */
export const SUPPORTED_SUBURBS: Record<string, string> = {
  Blacktown: "Blacktown NSW 2148",
  "Quakers Hill": "Quakers Hill NSW 2763",
  "Seven Hills": "Seven Hills NSW 2147",
}

export const LIVE_TYPES = ["HOUSE", "UNIT", "LAND"] as const

export class BadRequest extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BadRequest"
  }
}

function intParam(v: string | undefined, name: string, max: number): number {
  if (v === undefined || v === "") return 0
  if (!/^\d+$/.test(v) || Number(v) > max) {
    throw new BadRequest(`${name} must be a whole number from 0 to ${max}`)
  }
  return Number(v)
}

export function parseListingsQuery(q: Record<string, string | undefined>): ListingsQuery {
  const names = Object.keys(SUPPORTED_SUBURBS)
  const wanted = (q.suburb ?? "").trim().toLowerCase()
  const suburb = names.find((s) => s.toLowerCase() === wanted)
  if (!suburb) throw new BadRequest(`suburb must be one of: ${names.join(", ")}`)

  const types = (q.types ?? "")
    .split(",")
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean)
  if (types.some((t) => !(LIVE_TYPES as readonly string[]).includes(t))) {
    throw new BadRequest(`types must be from: ${LIVE_TYPES.join(", ")}`)
  }

  return {
    suburb,
    types,
    minLandArea: intParam(q.minLandArea, "minLandArea", 100_000),
    page: intParam(q.page, "page", 500),
  }
}

export function parsePropertyId(v: string | undefined): number {
  if (!v || !/^\d{1,12}$/.test(v)) throw new BadRequest("id must be a numeric Cotality property id")
  return Number(v)
}
