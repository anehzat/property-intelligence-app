import type { ListingsQuery } from "./types.ts"

export class CotalityError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = "CotalityError"
    this.status = status
  }
}

export interface Creds {
  clientId: string
  clientSecret: string
  baseUrl: string
}

export interface CotalityClient {
  suggestLocality(query: string): Promise<number>
  searchForSale(localityId: number, q: ListingsQuery): Promise<unknown>
  saleCampaign(propertyId: number): Promise<unknown>
}

const REFRESH_MARGIN_MS = 5 * 60_000

export function searchPath(localityId: number, q: ListingsQuery): string {
  const params = new URLSearchParams({ activeCampaign: "true", size: "20", page: String(q.page) })
  if (q.types.length) params.set("pTypes", q.types.join(","))
  if (q.minLandArea > 0) params.set("landArea", `${q.minLandArea}-`)
  return `/search/au/property/locality/${localityId}/otmForSale?${params}`
}

export function createCotality(
  loadCreds: () => Promise<Creds>,
  fetchFn: typeof fetch = fetch,
  now: () => number = Date.now,
): CotalityClient {
  let creds: Creds | null = null
  let token: { value: string; expiresAt: number } | null = null
  const localities = new Map<string, number>()

  async function getCreds() {
    creds ??= await loadCreds()
    return creds
  }

  async function getToken(force = false): Promise<string> {
    if (!force && token && now() < token.expiresAt - REFRESH_MARGIN_MS) return token.value
    const c = await getCreds()
    const basic = Buffer.from(`${c.clientId}:${c.clientSecret}`).toString("base64")
    const r = await fetchFn(`${c.baseUrl}/access/as/token.oauth2?grant_type=client_credentials`, {
      method: "POST",
      headers: { Authorization: `Basic ${basic}`, "Content-Length": "0" },
    })
    if (r.status === 429) throw new CotalityError(429, "Cotality token quota exceeded")
    if (!r.ok) throw new CotalityError(401, "Cotality token request failed")
    const j = (await r.json()) as { access_token?: string; expires_in?: number }
    if (!j.access_token) throw new CotalityError(401, "Cotality token missing")
    token = { value: j.access_token, expiresAt: now() + (j.expires_in ?? 0) * 1000 }
    return token.value
  }

  async function get(path: string): Promise<unknown> {
    const c = await getCreds()
    const call = async (force: boolean) =>
      fetchFn(c.baseUrl + path, {
        headers: { Authorization: `Bearer ${await getToken(force)}`, accept: "application/json" },
      })
    let r = await call(false)
    if (r.status === 401) r = await call(true)
    if (r.status === 404) return null
    if (!r.ok) throw new CotalityError(r.status, `Cotality responded ${r.status}`)
    return r.json()
  }

  return {
    async suggestLocality(query) {
      const cached = localities.get(query)
      if (cached !== undefined) return cached
      const body = (await get(
        `/property/au/v2/suggest.json?q=${encodeURIComponent(query)}&suggestionTypes=locality`,
      )) as { suggestions?: { suggestionType?: string; localityId?: unknown }[] } | null
      const hit = body?.suggestions?.find(
        (s) => s.suggestionType === "locality" && typeof s.localityId === "number",
      )
      if (!hit) throw new CotalityError(404, "Locality not found")
      localities.set(query, hit.localityId as number)
      return hit.localityId as number
    },
    searchForSale(localityId, q) {
      return get(searchPath(localityId, q))
    },
    saleCampaign(propertyId) {
      return get(`/property-details/au/properties/${propertyId}/otm/campaign/sales`)
    },
  }
}
