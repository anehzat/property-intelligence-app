import type {
  Agent,
  AlertItem,
  PlanningZone,
  Property,
  Suburb,
  TodArea,
} from "./types"

// Demo opens on Glebe (inner west Sydney)
export const MAP_CENTER: [number, number] = [-33.8795, 151.185]

export const DEMO_USER = {
  email: "demo@n3x7.bot",
  password: "n3x7-demo",
  name: "Sam Taylor",
  role: "Acquisitions Analyst",
}

export const suburbs: Suburb[] = [
  { name: "Glebe", center: [-33.8795, 151.185], hasTod: false },
  { name: "Marrickville", center: [-33.911, 151.155], hasTod: true },
  { name: "Dulwich Hill", center: [-33.907, 151.139], hasTod: true },
]

// Approximations of the live NSW "TOD Area" polygons, used to keep mock flags honest.
export const todAreas: TodArea[] = [
  { id: "tod-marrickville", name: "Marrickville Station TOD", center: [-33.914, 151.1535], radiusM: 400 },
  { id: "tod-dulwich", name: "Dulwich Hill Station TOD", center: [-33.911, 151.141], radiusM: 400 },
]

const agents: Record<string, Agent> = {
  olivia: { name: "Olivia Chen", agency: "Parkside Residential", phone: "0491 570 006", email: "olivia.chen@example.com" },
  james: { name: "James Romano", agency: "Inner West Property Co.", phone: "0491 570 156", email: "james.romano@example.com" },
  priya: { name: "Priya Shah", agency: "Greenway Estate Agents", phone: "0491 570 157", email: "priya.shah@example.com" },
}

type Seed = Omit<Property, "state" | "opportunity" | "gallery" | "developmentPotential">

function listing(s: Seed): Property {
  return {
    ...s,
    state: "NSW",
    opportunity:
      s.score >= 85 ? "HIGH POTENTIAL" : s.score >= 78 ? "MODERATE" : s.score >= 70 ? "EMERGING" : "STABLE",
    developmentPotential:
      s.breakdown.planningOpportunity >= 85 ? "High" : s.breakdown.planningOpportunity >= 70 ? "Medium" : "Low",
    gallery: [s.image, "/property-interior-living.png", "/property-backyard.png"],
  }
}

export const properties: Property[] = [
  // Glebe: inside the Indicative LMR Housing Area, no TOD area
  listing({
    id: "g1", address: "142 Glebe Point Road", suburb: "Glebe", price: 2450000, type: "house",
    beds: 4, baths: 2, parking: 1, landSize: 310, frontage: 9, status: "for-sale", score: 86,
    lat: -33.8775, lng: 151.1858, lmr: true, tod: false, todDistance: 5040,
    insights: ["Inside LMR housing area", "Light rail 350m", "Main-road exposure", "Strong rental demand"],
    breakdown: { planningOpportunity: 88, marketDemand: 86, transportAccess: 78, riskScore: 25 },
    image: "/property-terrace-house.png", agent: agents.olivia,
    aiSummary: "Wide Glebe Point Road terrace inside the LMR housing area with strong rental depth.",
  }),
  listing({
    id: "g2", address: "27 Hereford Street", suburb: "Glebe", price: 1890000, type: "house",
    beds: 3, baths: 1, parking: 0, landSize: 180, frontage: 6, status: "for-sale", score: 78,
    lat: -33.8812, lng: 151.1836, lmr: true, tod: false, todDistance: 4580,
    insights: ["Inside LMR housing area", "Narrow 6m frontage", "Heritage streetscape"],
    breakdown: { planningOpportunity: 72, marketDemand: 84, transportAccess: 70, riskScore: 35 },
    image: "/property-north-bondi-house.png", agent: agents.olivia,
    aiSummary: "Classic narrow-lot terrace; LMR controls apply but frontage limits redevelopment.",
  }),
  listing({
    id: "g3", address: "61 Wigram Road", suburb: "Glebe", price: 3350000, type: "house",
    beds: 5, baths: 3, parking: 2, landSize: 640, frontage: 21, status: "for-sale", score: 88,
    lat: -33.8791, lng: 151.178, lmr: true, tod: false, todDistance: 4490,
    insights: ["Inside LMR housing area", "21m frontage", "Large 640m² lot", "Dual-occupancy potential"],
    breakdown: { planningOpportunity: 90, marketDemand: 82, transportAccess: 68, riskScore: 22 },
    image: "/property-beach-house.png", agent: agents.olivia,
    aiSummary: "Rare 21m-frontage Glebe holding; LMR controls support terraces or manor homes.",
  }),
  listing({
    id: "g4", address: "9 Toxteth Road", suburb: "Glebe", price: 4100000, type: "house",
    beds: 5, baths: 3, parking: 2, landSize: 720, frontage: 24, status: "under-offer", score: 84,
    lat: -33.883, lng: 151.1802, lmr: true, tod: false, todDistance: 4240,
    insights: ["Inside LMR housing area", "24m frontage", "Under offer"],
    breakdown: { planningOpportunity: 86, marketDemand: 80, transportAccess: 62, riskScore: 30 },
    image: "/property-backyard.png", agent: agents.olivia,
    aiSummary: "Large-frontage site already under offer; track for a fall-through.",
  }),
  listing({
    id: "g5", address: "15 Mitchell Street", suburb: "Glebe", price: 1150000, type: "apartment",
    beds: 2, baths: 1, parking: 1, landSize: 0, frontage: 0, status: "for-sale", score: 70,
    lat: -33.8752, lng: 151.188, lmr: true, tod: false, todDistance: 5360,
    insights: ["Strata apartment", "Light rail 280m", "No redevelopment upside"],
    breakdown: { planningOpportunity: 55, marketDemand: 80, transportAccess: 82, riskScore: 30 },
    image: "/property-apartment-bondi.png", agent: agents.olivia,
    aiSummary: "Solid rental apartment; planning reforms add little upside to strata stock.",
  }),
  listing({
    id: "g6", address: "88 Bridge Road", suburb: "Glebe", price: 6800000, type: "development",
    beds: 0, baths: 0, parking: 0, landSize: 980, frontage: 32, status: "for-sale", score: 90,
    lat: -33.8818, lng: 151.1885, lmr: true, tod: false, todDistance: 4820,
    insights: ["Inside LMR housing area", "32m frontage", "Corner site", "Mid-rise potential"],
    breakdown: { planningOpportunity: 93, marketDemand: 84, transportAccess: 76, riskScore: 28 },
    image: "/property-mixed-use-site.png", agent: agents.olivia,
    aiSummary: "Corner development site with the widest frontage in Glebe; strong mid-rise case.",
  }),
  // Marrickville: m1–m4 inside the Marrickville Station TOD area
  listing({
    id: "m1", address: "212 Illawarra Road", suburb: "Marrickville", price: 5200000, type: "development",
    beds: 0, baths: 0, parking: 0, landSize: 860, frontage: 26, status: "for-sale", score: 94,
    lat: -33.9128, lng: 151.1546, lmr: true, tod: true, todDistance: 170,
    insights: ["Inside TOD area", "170m to Marrickville Station", "26m frontage", "Accelerated rezoning"],
    breakdown: { planningOpportunity: 96, marketDemand: 88, transportAccess: 95, riskScore: 20 },
    image: "/property-development-site.png", agent: agents.james,
    aiSummary: "Top-ranked TOD site: 26m frontage 170m from the station under accelerated rezoning.",
  }),
  listing({
    id: "m2", address: "14 Silver Street", suburb: "Marrickville", price: 2650000, type: "house",
    beds: 4, baths: 2, parking: 2, landSize: 560, frontage: 22, status: "for-sale", score: 91,
    lat: -33.9152, lng: 151.152, lmr: true, tod: true, todDistance: 190,
    insights: ["Inside TOD area", "190m to station", "22m frontage", "Amalgamation candidate"],
    breakdown: { planningOpportunity: 92, marketDemand: 86, transportAccess: 93, riskScore: 22 },
    image: "/property-terrace-house.png", agent: agents.james,
    aiSummary: "Wide-frontage house in the TOD core; strong amalgamation play with neighbours.",
  }),
  listing({
    id: "m3", address: "33 Leofrene Avenue", suburb: "Marrickville", price: 1980000, type: "house",
    beds: 3, baths: 1, parking: 1, landSize: 420, frontage: 12, status: "for-sale", score: 83,
    lat: -33.9158, lng: 151.1553, lmr: true, tod: true, todDistance: 260,
    insights: ["Inside TOD area", "260m to station", "12m frontage"],
    breakdown: { planningOpportunity: 84, marketDemand: 82, transportAccess: 90, riskScore: 26 },
    image: "/property-north-bondi-house.png", agent: agents.james,
    aiSummary: "TOD-located cottage; frontage is narrow for a standalone mid-rise.",
  }),
  listing({
    id: "m4", address: "5 Station Street", suburb: "Marrickville", price: 1720000, type: "house",
    beds: 3, baths: 2, parking: 1, landSize: 380, frontage: 20, status: "under-offer", score: 80,
    lat: -33.9131, lng: 151.1512, lmr: true, tod: true, todDistance: 230,
    insights: ["Inside TOD area", "20m frontage", "Under offer"],
    breakdown: { planningOpportunity: 85, marketDemand: 80, transportAccess: 92, riskScore: 30 },
    image: "/property-backyard.png", agent: agents.priya,
    aiSummary: "Good TOD frontage but already under offer.",
  }),
  listing({
    id: "m5", address: "120 Victoria Road", suburb: "Marrickville", price: 2100000, type: "house",
    beds: 4, baths: 2, parking: 2, landSize: 500, frontage: 18, status: "for-sale", score: 74,
    lat: -33.905, lng: 151.158, lmr: false, tod: false, todDistance: 1080,
    insights: ["Outside TOD area", "Outside LMR housing area", "18m frontage"],
    breakdown: { planningOpportunity: 74, marketDemand: 78, transportAccess: 60, riskScore: 30 },
    image: "/property-beach-house.png", agent: agents.james,
    aiSummary: "Family home outside both the LMR housing area and the TOD catchment.",
  }),
  listing({
    id: "m6", address: "47 Calvert Street", suburb: "Marrickville", price: 2300000, type: "house",
    beds: 4, baths: 2, parking: 1, landSize: 540, frontage: 25, status: "sold", score: 72,
    lat: -33.9085, lng: 151.16, lmr: false, tod: false, todDistance: 860,
    insights: ["Recently sold", "25m frontage", "Comparable sale"],
    breakdown: { planningOpportunity: 76, marketDemand: 74, transportAccess: 62, riskScore: 32 },
    image: "/property-terrace-house.png", agent: agents.james,
    aiSummary: "Recent sale; useful comparable for frontage-driven pricing.",
  }),
  // Dulwich Hill
  listing({
    id: "d1", address: "18 Wardell Road", suburb: "Dulwich Hill", price: 2380000, type: "house",
    beds: 4, baths: 2, parking: 1, landSize: 520, frontage: 23, status: "for-sale", score: 87,
    lat: -33.9102, lng: 151.1418, lmr: true, tod: true, todDistance: 120,
    insights: ["Inside TOD area", "120m to Dulwich Hill Station", "23m frontage"],
    breakdown: { planningOpportunity: 89, marketDemand: 83, transportAccess: 94, riskScore: 24 },
    image: "/property-north-bondi-house.png", agent: agents.priya,
    aiSummary: "Station-adjacent TOD site with workable frontage for terraces or mid-rise.",
  }),
  listing({
    id: "d2", address: "6 Ewart Street", suburb: "Dulwich Hill", price: 1850000, type: "house",
    beds: 3, baths: 1, parking: 1, landSize: 410, frontage: 15, status: "for-sale", score: 76,
    lat: -33.9068, lng: 151.136, lmr: true, tod: false, todDistance: 650,
    insights: ["Outside TOD area", "Inside LMR housing area", "15m frontage"],
    breakdown: { planningOpportunity: 75, marketDemand: 80, transportAccess: 72, riskScore: 28 },
    image: "/property-backyard.png", agent: agents.priya,
    aiSummary: "LMR-eligible house just outside the TOD catchment.",
  }),
]

// LMR and TOD come from the live NSW layer; these remaining overlays are modelled demo data.
export const planningZones: PlanningZone[] = [
  {
    id: "dev1",
    layer: "development",
    name: "Bridge Road uplift (modelled)",
    polygon: [
      [-33.8808, 151.1868],
      [-33.8805, 151.1902],
      [-33.8832, 151.1906],
      [-33.8835, 151.187],
    ],
  },
  {
    id: "dev2",
    layer: "development",
    name: "Illawarra Road uplift (modelled)",
    polygon: [
      [-33.912, 151.1535],
      [-33.9118, 151.1558],
      [-33.9138, 151.156],
      [-33.914, 151.1537],
    ],
  },
  {
    id: "con1",
    layer: "constraints",
    name: "Glebe heritage conservation (modelled)",
    polygon: [
      [-33.8795, 151.1825],
      [-33.879, 151.1855],
      [-33.882, 151.186],
      [-33.8825, 151.183],
    ],
  },
]

export interface LayerMeta {
  id: PlanningZone["layer"] | "listings"
  label: string
  color: string
  description: string
}

export const layerMeta: LayerMeta[] = [
  { id: "listings", label: "Property Listings", color: "var(--primary)", description: "Demo listings" },
  { id: "lmr", label: "Low & Mid-Rise Housing", color: "var(--success)", description: "NSW Indicative LMR Housing Area (live)" },
  { id: "tod", label: "Transport Oriented Development", color: "var(--primary)", description: "NSW TOD areas incl. accelerated rezoning (live)" },
  { id: "development", label: "Development Opportunities", color: "var(--ai)", description: "Modelled uplift sites (demo)" },
  { id: "constraints", label: "Planning Constraints", color: "var(--warning)", description: "Heritage & environmental limits (demo)" },
]

export const suggestedPrompts = [
  "Which suburbs have TOD areas?",
  "Find properties with LMR upside",
  "Compare Glebe and Marrickville",
  "Which sites have 20m+ frontage?",
]

export const exampleSearches = [
  "Properties for sale in Glebe in the TOD area",
  "Marrickville TOD with 20m frontage",
  "Find properties with LMR potential",
]

export const alerts: AlertItem[] = [
  {
    id: "a1",
    title: "Notify me when listings appear inside TOD areas",
    description: "Alert when a new listing falls inside a NSW Transport Oriented Development area.",
    category: "zoning",
    active: true,
    frequency: "Real-time",
    lastTriggered: "3 hours ago",
  },
  {
    id: "a2",
    title: "Notify me when 20m+ frontage sites list in Glebe",
    description: "Track wide-frontage listings inside the Glebe LMR housing area.",
    category: "listing",
    active: true,
    frequency: "Daily digest",
    lastTriggered: "Today, 8:00 AM",
  },
  {
    id: "a3",
    title: "Notify me when council planning changes occur",
    description: "Monitor Inner West Council planning proposals and DA determinations.",
    category: "planning",
    active: false,
    frequency: "Weekly",
    lastTriggered: "6 days ago",
  },
  {
    id: "a4",
    title: "Notify me when TOD rezonings are finalised",
    description: "Alerts when accelerated TOD rezonings are gazetted around Inner West stations.",
    category: "zoning",
    active: true,
    frequency: "Real-time",
    lastTriggered: "Yesterday",
  },
]

export function aiReply(question: string): string {
  const q = question.toLowerCase()
  if (q.includes("interesting") || q.includes("why")) {
    return "This property sits inside the NSW Indicative Low and Mid-Rise Housing Area, so planning controls now allow terraces, townhouses and manor homes where they were previously restricted. Inside a TOD area, accelerated rezoning adds further height and FSR uplift near the station."
  }
  if (q.includes("tod") || q.includes("transport")) {
    return "Glebe has no TOD area under the current NSW program. The nearest TOD areas are around Marrickville and Dulwich Hill stations. In Marrickville, 212 Illawarra Road (score 94, 26m frontage) and 14 Silver Street (score 91, 22m frontage) are for sale inside the TOD area."
  }
  if (q.includes("frontage")) {
    return "Sites with 20m+ frontage that are for sale now: 212 Illawarra Road and 14 Silver Street (Marrickville, inside TOD), 18 Wardell Road (Dulwich Hill, inside TOD), and 61 Wigram Road and 88 Bridge Road (Glebe, LMR only)."
  }
  if (q.includes("lmr") || q.includes("upside")) {
    return "All six Glebe listings sit inside the Indicative LMR Housing Area. The strongest upside is 88 Bridge Road (score 90, 32m corner frontage) and 61 Wigram Road (score 88, 21m frontage on a 640m² lot)."
  }
  if (q.includes("compare") || q.includes("subur")) {
    return "Glebe is fully inside the LMR housing area but has no TOD area, so uplift is limited to low and mid-rise forms. Marrickville combines LMR coverage with a TOD area around the station, which supports higher density on wide-frontage sites."
  }
  if (q.includes("zoning") || q.includes("explain")) {
    return "LMR reforms permit low and mid-rise housing (terraces, townhouses and manor homes, and mid-rise near centres) in identified areas. TOD areas within ~400m of selected stations receive accelerated rezoning with higher height and FSR controls."
  }
  return "Based on current NSW planning data, the strongest opportunities combine a TOD location with 20m+ frontage. Ask me about TOD areas, LMR upside, frontage, or how Glebe and Marrickville compare."
}
