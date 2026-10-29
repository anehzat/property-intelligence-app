import type { ListingsResponse, LiveCampaign, LiveListing } from "./types.ts"

// Cotality payloads are loosely typed; read them defensively.
type Json = any

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null
const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : null

export function parsePrice(label: string | null): number | null {
  const m = label?.match(/^\s*\$\s?([\d,]+)\s*$/)
  return m ? Number(m[1].replace(/,/g, "")) : null
}

export function mapType(t: unknown): LiveListing["type"] {
  const v = typeof t === "string" ? t.toUpperCase() : ""
  if (v === "HOUSE") return "house"
  if (v === "UNIT" || v === "FLATS") return "apartment"
  return "development"
}

export function mapListing(raw: unknown, suburb: string): LiveListing | null {
  const p: Json = (raw as Json)?.propertySummary
  const id = num(p?.id)
  const lat = num(p?.coordinate?.latitude)
  const lng = num(p?.coordinate?.longitude)
  if (id === null || lat === null || lng === null) return null
  const otm: Json = p.otmForSaleDetail ?? {}
  const priceLabel = str(otm.priceDescription)
  return {
    id: `cl-${id}`,
    cotalityId: id,
    address: str(p.address?.singleLineAddress) ?? "Address unavailable",
    suburb,
    state: "NSW",
    lat,
    lng,
    type: mapType(p.propertyType),
    beds: num(p.attributes?.bedrooms),
    baths: num(p.attributes?.bathrooms),
    parking: num(p.attributes?.carSpaces),
    landSize: num(p.attributes?.landArea),
    priceLabel,
    price: parsePrice(priceLabel),
    method: str(otm.method),
    listedAt: str(otm.date),
    agentName: str(otm.agent),
    agency: str(otm.agency),
    image: str(p.propertyPhoto?.mediumPhotoUrl),
  }
}

export function mapSearch(body: unknown, suburb: string, page: number): ListingsResponse {
  const b = body as Json
  const list: unknown[] = Array.isArray(b?._embedded?.propertySummaryList)
    ? b._embedded.propertySummaryList
    : []
  return {
    suburb,
    page,
    totalPages: num(b?.page?.totalPages) ?? 0,
    total: num(b?.page?.totalElements) ?? 0,
    listings: list
      .map((x) => mapListing(x, suburb))
      .filter((x): x is LiveListing => x !== null),
  }
}

export function mapCampaign(body: unknown): LiveCampaign | null {
  const campaigns: Json[] = (body as Json)?.forSalePropertyCampaign?.campaigns ?? []
  const c = Array.isArray(campaigns) ? campaigns.find((x) => x?.isActiveCampaign === true) : null
  if (!c) return null
  return {
    agentName: str(c.agent?.agent),
    agentPhone: str(c.agent?.phoneNumber),
    agency: str(c.agency?.companyName),
    agencyPhone: str(c.agency?.phoneNumber),
    priceLabel: str(c.priceDescription) ?? str(c.latestAdvertisementPrice),
    auctionDate: str(c.auctionDate),
    daysOnMarket: num(c.daysOnMarket),
  }
}
