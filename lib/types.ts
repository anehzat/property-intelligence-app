export type PropertyType = "house" | "apartment" | "development"

export type Opportunity = "HIGH POTENTIAL" | "MODERATE" | "EMERGING" | "STABLE"

export interface ScoreBreakdown {
  planningOpportunity: number
  marketDemand: number
  transportAccess: number
  riskScore: number
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
  score: number
  opportunity: Opportunity
  lat: number
  lng: number
  lmr: boolean
  todDistance: number
  developmentPotential: "High" | "Medium" | "Low"
  insights: string[]
  breakdown: ScoreBreakdown
  image: string
  gallery: string[]
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
