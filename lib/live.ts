import type { ListingsResponse, LiveCampaign, LiveListing } from "./types"

export const LIVE_SUBURBS = ["Blacktown", "Quakers Hill", "Seven Hills"] as const
export const LIVE_TYPES = [
  { id: "HOUSE", label: "House" },
  { id: "UNIT", label: "Unit" },
  { id: "LAND", label: "Land" },
] as const
export const landAreaOptions = [0, 300, 500, 800, 1000]

// Lowercase letters only, without a trailing "s", so "Seven Hills", "sevenhill" and "seven hill" compare equal.
function squash(text: string): string {
  return text.toLowerCase().replace(/[^a-z]/g, "").replace(/s$/, "")
}

function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const row = [i]
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = row
  }
  return prev[b.length]
}

/**
 * The live suburb named in free text, forgiving case, spacing, a trailing "s" and small typos,
 * e.g. "Quakers Hills" → "Quakers Hill", "seven halls" → "Seven Hills". Null if none.
 */
export function matchLiveSuburb(text: string): (typeof LIVE_SUBURBS)[number] | null {
  const words = text.split(/\s+/).filter(Boolean)
  let best: { name: (typeof LIVE_SUBURBS)[number]; distance: number } | null = null
  for (const name of LIVE_SUBURBS) {
    const target = squash(name)
    // One wrong letter for short names, two for longer ones; "Blacktowner" is still not Blacktown.
    const tolerance = target.length < 10 ? 1 : 2
    // Try every run of up to three consecutive words, so "Black town" and "sevenhills" both line up.
    for (let start = 0; start < words.length; start++) {
      for (let len = 1; len <= 3 && start + len <= words.length; len++) {
        const distance = editDistance(squash(words.slice(start, start + len).join("")), target)
        if (distance <= tolerance && (!best || distance < best.distance)) best = { name, distance }
      }
    }
  }
  return best?.name ?? null
}

export interface LiveQuery {
  suburb: string
  types: string[]
  minLandArea: number
  page: number
}

export const defaultLiveQuery: LiveQuery = { suburb: "Blacktown", types: [], minLandArea: 0, page: 0 }

const trim = (base: string) => base.replace(/\/+$/, "")

export function listingsUrl(base: string, q: LiveQuery): string {
  const p = new URLSearchParams({ suburb: q.suburb, page: String(q.page) })
  if (q.types.length) p.set("types", q.types.join(","))
  if (q.minLandArea > 0) p.set("minLandArea", String(q.minLandArea))
  // %20, not "+", for spaces: API Gateway passes "+" through literally.
  return `${trim(base)}/listings?${p.toString().replace(/\+/g, "%20")}`
}

export function campaignUrl(base: string, cotalityId: number): string {
  return `${trim(base)}/listings/${cotalityId}/campaign`
}

export function isListingsResponse(x: unknown): x is ListingsResponse {
  const r = x as ListingsResponse | null
  return !!r && typeof r === "object" && Array.isArray(r.listings) && typeof r.total === "number"
}

export function isLiveCampaign(x: unknown): x is LiveCampaign {
  return !!x && typeof x === "object" && "agentName" in x
}

export function centerOf(listings: Pick<LiveListing, "lat" | "lng">[]): [number, number] | null {
  if (!listings.length) return null
  const lat = listings.reduce((s, l) => s + l.lat, 0) / listings.length
  const lng = listings.reduce((s, l) => s + l.lng, 0) / listings.length
  return [lat, lng]
}

export class LiveError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = "LiveError"
    this.status = status
  }
}

export async function fetchLive<T>(
  url: string,
  token: string,
  guard: (x: unknown) => x is T,
): Promise<T> {
  let r: Response
  try {
    r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  } catch {
    throw new LiveError(0, "Can't reach the N3X7 API.")
  }
  const body: unknown = await r.json().catch(() => null)
  if (!r.ok) {
    const msg = (body as { error?: unknown } | null)?.error
    throw new LiveError(
      r.status,
      r.status === 401
        ? "Your session has expired. Sign in again."
        : typeof msg === "string"
          ? msg
          : `Request failed (${r.status}).`,
    )
  }
  if (!guard(body)) throw new LiveError(r.status, "Unexpected response from the N3X7 API.")
  return body
}
