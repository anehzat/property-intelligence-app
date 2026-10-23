export interface LiveListing {
  id: string
  cotalityId: number
  address: string
  suburb: string
  state: "NSW"
  lat: number
  lng: number
  type: "house" | "apartment" | "development"
  beds: number | null
  baths: number | null
  parking: number | null
  landSize: number | null
  priceLabel: string | null
  price: number | null
  method: string | null
  listedAt: string | null
  agentName: string | null
  agency: string | null
  image: string | null
}

export interface LiveCampaign {
  agentName: string | null
  agentPhone: string | null
  agency: string | null
  agencyPhone: string | null
  priceLabel: string | null
  auctionDate: string | null
  daysOnMarket: number | null
}

export interface ListingsResponse {
  suburb: string
  page: number
  totalPages: number
  total: number
  listings: LiveListing[]
}

export interface ListingsQuery {
  suburb: string
  types: string[]
  minLandArea: number
  page: number
}
