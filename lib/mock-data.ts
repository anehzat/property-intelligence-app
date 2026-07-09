import type { Property, PlanningZone, AlertItem } from "./types"

// Centered on North Bondi, NSW
export const MAP_CENTER: [number, number] = [-33.8865, 151.2758]

export const properties: Property[] = [
  {
    id: "p1",
    address: "25 Hardy Street",
    suburb: "North Bondi",
    state: "NSW",
    price: 2850000,
    type: "house",
    beds: 4,
    baths: 3,
    parking: 2,
    landSize: 512,
    score: 89,
    opportunity: "HIGH POTENTIAL",
    lat: -33.8842,
    lng: 151.2771,
    lmr: true,
    todDistance: 450,
    developmentPotential: "High",
    insights: [
      "Located inside LMR area",
      "Potential density uplift",
      "Strong suburb demand",
      "450m from transport",
    ],
    breakdown: {
      planningOpportunity: 90,
      marketDemand: 85,
      transportAccess: 80,
      riskScore: 20,
    },
    image: "/property-north-bondi-house.png",
    gallery: [
      "/property-north-bondi-house.png",
      "/property-interior-living.png",
      "/property-backyard.png",
    ],
    savedDate: "2 days ago",
    aiSummary:
      "Prime LMR-zoned house with strong density uplift potential and proximity to transport corridors.",
  },
  {
    id: "p2",
    address: "8 Wairoa Avenue",
    suburb: "North Bondi",
    state: "NSW",
    price: 1780000,
    type: "apartment",
    beds: 2,
    baths: 2,
    parking: 1,
    landSize: 0,
    score: 82,
    opportunity: "MODERATE",
    lat: -33.889,
    lng: 151.2735,
    lmr: true,
    todDistance: 220,
    developmentPotential: "Medium",
    insights: [
      "Within LMR mid-rise band",
      "220m from transport hub",
      "Consistent rental demand",
      "Below suburb median",
    ],
    breakdown: {
      planningOpportunity: 78,
      marketDemand: 88,
      transportAccess: 92,
      riskScore: 28,
    },
    image: "/property-apartment-bondi.png",
    gallery: ["/property-apartment-bondi.png", "/property-interior-living.png"],
    savedDate: "5 days ago",
    aiSummary:
      "Well-located apartment inside the mid-rise band with excellent transport access and firm rental demand.",
  },
  {
    id: "p3",
    address: "142 Military Road",
    suburb: "Dover Heights",
    state: "NSW",
    price: 4250000,
    type: "development",
    beds: 5,
    baths: 4,
    parking: 3,
    landSize: 890,
    score: 94,
    opportunity: "HIGH POTENTIAL",
    lat: -33.8795,
    lng: 151.2812,
    lmr: true,
    todDistance: 610,
    developmentPotential: "High",
    insights: [
      "Large amalgamation-ready site",
      "LMR + development overlay",
      "Ocean-adjacent premium",
      "Significant uplift modelled",
    ],
    breakdown: {
      planningOpportunity: 96,
      marketDemand: 90,
      transportAccess: 72,
      riskScore: 18,
    },
    image: "/property-development-site.png",
    gallery: ["/property-development-site.png", "/property-backyard.png"],
    savedDate: "1 week ago",
    aiSummary:
      "Large development-overlay site with the highest modelled uplift in the discovery set.",
  },
  {
    id: "p4",
    address: "3 Ramsgate Avenue",
    suburb: "North Bondi",
    state: "NSW",
    price: 3120000,
    type: "house",
    beds: 3,
    baths: 2,
    parking: 1,
    landSize: 430,
    score: 76,
    opportunity: "EMERGING",
    lat: -33.8858,
    lng: 151.2793,
    lmr: false,
    todDistance: 380,
    developmentPotential: "Medium",
    insights: [
      "Adjacent to LMR boundary",
      "Beachside lifestyle premium",
      "Renovation upside",
      "380m from transport",
    ],
    breakdown: {
      planningOpportunity: 64,
      marketDemand: 84,
      transportAccess: 82,
      riskScore: 34,
    },
    image: "/property-beach-house.png",
    gallery: ["/property-beach-house.png", "/property-interior-living.png"],
  },
  {
    id: "p5",
    address: "56 Blair Street",
    suburb: "North Bondi",
    state: "NSW",
    price: 2240000,
    type: "apartment",
    beds: 3,
    baths: 2,
    parking: 2,
    landSize: 0,
    score: 85,
    opportunity: "MODERATE",
    lat: -33.8901,
    lng: 151.2778,
    lmr: true,
    todDistance: 300,
    developmentPotential: "Medium",
    insights: [
      "Inside LMR mid-rise band",
      "Dual-key configuration",
      "Strong yield profile",
      "300m from transport",
    ],
    breakdown: {
      planningOpportunity: 82,
      marketDemand: 86,
      transportAccess: 88,
      riskScore: 24,
    },
    image: "/property-apartment-bondi.png",
    gallery: ["/property-apartment-bondi.png"],
  },
  {
    id: "p6",
    address: "19 Wellington Street",
    suburb: "Bondi",
    state: "NSW",
    price: 1950000,
    type: "house",
    beds: 3,
    baths: 1,
    parking: 0,
    landSize: 385,
    score: 71,
    opportunity: "EMERGING",
    lat: -33.8925,
    lng: 151.2712,
    lmr: true,
    todDistance: 160,
    developmentPotential: "Medium",
    insights: [
      "Inside LMR low-rise band",
      "160m from transport hub",
      "Original condition upside",
      "Tightly held street",
    ],
    breakdown: {
      planningOpportunity: 74,
      marketDemand: 80,
      transportAccess: 94,
      riskScore: 30,
    },
    image: "/property-terrace-house.png",
    gallery: ["/property-terrace-house.png"],
  },
  {
    id: "p7",
    address: "220 Old South Head Road",
    suburb: "Bondi",
    state: "NSW",
    price: 5600000,
    type: "development",
    beds: 0,
    baths: 0,
    parking: 6,
    landSize: 1240,
    score: 91,
    opportunity: "HIGH POTENTIAL",
    lat: -33.8878,
    lng: 151.2687,
    lmr: true,
    todDistance: 90,
    developmentPotential: "High",
    insights: [
      "Corner amalgamation opportunity",
      "TOD precinct core (90m)",
      "Mixed-use permissible",
      "Strong feasibility",
    ],
    breakdown: {
      planningOpportunity: 93,
      marketDemand: 82,
      transportAccess: 96,
      riskScore: 22,
    },
    image: "/property-mixed-use-site.png",
    gallery: ["/property-mixed-use-site.png"],
  },
]

export const planningZones: PlanningZone[] = [
  {
    id: "lmr1",
    layer: "lmr",
    name: "North Bondi LMR Precinct",
    polygon: [
      [-33.8825, 151.272],
      [-33.882, 151.2805],
      [-33.8895, 151.2815],
      [-33.8915, 151.274],
      [-33.887, 151.2708],
    ],
  },
  {
    id: "lmr2",
    layer: "lmr",
    name: "Bondi LMR Corridor",
    polygon: [
      [-33.8905, 151.2675],
      [-33.8898, 151.2725],
      [-33.8945, 151.2732],
      [-33.8952, 151.268],
    ],
  },
  {
    id: "tod1",
    layer: "tod",
    name: "Bondi TOD Precinct",
    polygon: [
      [-33.8858, 151.2668],
      [-33.8852, 151.2712],
      [-33.8902, 151.2718],
      [-33.891, 151.2665],
    ],
  },
  {
    id: "dev1",
    layer: "development",
    name: "Dover Heights Uplift Zone",
    polygon: [
      [-33.8772, 151.279],
      [-33.8768, 151.2835],
      [-33.8818, 151.284],
      [-33.8825, 151.2792],
    ],
  },
  {
    id: "con1",
    layer: "constraints",
    name: "Coastal Heritage Constraint",
    polygon: [
      [-33.8828, 151.2818],
      [-33.882, 151.2865],
      [-33.887, 151.287],
      [-33.8878, 151.282],
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
  {
    id: "listings",
    label: "Property Listings",
    color: "var(--primary)",
    description: "Live property markers",
  },
  {
    id: "lmr",
    label: "Low & Mid-Rise Housing",
    color: "var(--success)",
    description: "LMR planning reform areas",
  },
  {
    id: "tod",
    label: "Transport Oriented Development",
    color: "var(--primary)",
    description: "TOD accelerated precincts",
  },
  {
    id: "development",
    label: "Development Opportunities",
    color: "var(--ai)",
    description: "Modelled uplift sites",
  },
  {
    id: "constraints",
    label: "Planning Constraints",
    color: "var(--warning)",
    description: "Heritage & environmental limits",
  },
]

export const suggestedPrompts = [
  "Find properties with LMR upside",
  "Compare these suburbs",
  "Explain this zoning",
  "Find undervalued opportunities",
]

export const exampleSearches = [
  "25 Hardy Street North Bondi",
  "Find properties under $2m with LMR potential",
  "Show me future growth areas",
]

export const alerts: AlertItem[] = [
  {
    id: "a1",
    title: "Notify me when properties enter LMR zones",
    description:
      "Get alerted when a new listing falls inside a Low & Mid-Rise Housing reform area.",
    category: "zoning",
    active: true,
    frequency: "Real-time",
    lastTriggered: "3 hours ago",
  },
  {
    id: "a2",
    title: "Notify me when new listings appear near Bondi",
    description: "Track new listings within a 2km radius of Bondi Beach.",
    category: "listing",
    active: true,
    frequency: "Daily digest",
    lastTriggered: "Today, 8:00 AM",
  },
  {
    id: "a3",
    title: "Notify me when council planning changes occur",
    description:
      "Monitor Waverley Council planning proposals and DA determinations.",
    category: "planning",
    active: false,
    frequency: "Weekly",
    lastTriggered: "6 days ago",
  },
  {
    id: "a4",
    title: "Notify me when TOD precincts are gazetted",
    description:
      "Alerts for newly declared Transport Oriented Development precincts in Eastern Suburbs.",
    category: "zoning",
    active: true,
    frequency: "Real-time",
    lastTriggered: "Yesterday",
  },
]

export function aiReply(question: string): string {
  const q = question.toLowerCase()
  if (q.includes("interesting") || q.includes("why")) {
    return "This property is located within an identified Low and Mid-Rise Housing area. Planning changes may create additional development potential compared with historical controls, and its proximity to transport strengthens both amenity and future demand."
  }
  if (q.includes("lmr") || q.includes("upside")) {
    return "I found 5 properties inside active LMR reform areas. The strongest upside is 142 Military Road (score 94) and 220 Old South Head Road (score 91), both carrying development overlays with significant modelled density uplift."
  }
  if (q.includes("compare") || q.includes("subur")) {
    return "North Bondi shows higher LMR coverage and lifestyle premium, while Bondi benefits from the TOD precinct core near Bondi Junction. Dover Heights carries fewer listings but the largest amalgamation-ready sites."
  }
  if (q.includes("zoning") || q.includes("explain")) {
    return "This area sits under LMR reform controls permitting low and mid-rise housing (terraces, townhouses and manor homes up to ~3 storeys). Within 800m of transport, additional height and FSR bonuses may apply under the TOD framework."
  }
  if (q.includes("undervalued")) {
    return "19 Wellington Street and 3 Ramsgate Avenue screen as undervalued: both sit near LMR boundaries and transport, yet trade below the modelled fair value implied by their planning opportunity scores."
  }
  return "Based on current planning intelligence, the selected area shows strong future potential driven by LMR reforms and transport-oriented development. Ask me about zoning, uplift potential, or how these suburbs compare."
}
