export type PropertyType = "house" | "apartment" | "development"

export type Opportunity = "HIGH POTENTIAL" | "MODERATE" | "EMERGING" | "STABLE"

export interface ScoreBreakdown {
  planningOpportunity: number
  marketDemand: number
  transportAccess: number
  riskScore: number
}

export type ListingStatus = "for-sale" | "under-offer" | "sold"

export interface Agent {
  name: string
  agency: string
  phone: string
  email: string
}

export interface Property {
  id: string
  address: string
  suburb: string
  state: string
  price: number
  type: PropertyType
  beds: number
  baths: number
  parking: number
  landSize: number
  /** Street frontage in metres; 0 when not applicable (e.g. apartments). */
  frontage: number
  status: ListingStatus
  score: number
  opportunity: Opportunity
  lat: number
  lng: number
  lmr: boolean
  /** Inside a NSW TOD area (hand-assigned to match the live NSW layer). */
  tod: boolean
  /** Distance to the nearest station / light rail stop, metres. */
  todDistance: number
  developmentPotential: "High" | "Medium" | "Low"
  insights: string[]
  breakdown: ScoreBreakdown
  image: string
  gallery: string[]
  agent: Agent
  savedDate?: string
  aiSummary?: string
}

export type LayerId =
  | "listings"
  | "lmr"
  | "tod"
  | "development"
  | "constraints"

export interface PlanningZone {
  id: string
  layer: Exclude<LayerId, "listings">
  name: string
  polygon: [number, number][]
}

export interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
}

export interface AlertItem {
  id: string
  title: string
  description: string
  category: "zoning" | "listing" | "planning"
  active: boolean
  frequency: string
  lastTriggered: string
}

export interface Suburb {
  name: string
  center: [number, number]
  hasTod: boolean
}

export interface TodArea {
  id: string
  name: string
  center: [number, number]
  radiusM: number
}

export interface DemoUser {
  email: string
  name: string
  role: string
}

export interface ContractRequest {
  requestedAt: string
  message: string
}

// Live listings from the N3X7 API (Cotality). Keep in sync with api/src/types.ts.
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
