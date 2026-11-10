// Key metrics for every NSW Housing Pattern Book design, copied from the "Key metrics" panel on each
// pattern's page (planning.nsw.gov.au, checked 10 Nov 2026). Low-rise figures are the compact designs
// for low- and mid-rise (LMR) housing areas; mid-rise figures are the range across each pattern's options.
// Pure, so tests can import it.

export interface Range {
  min: number
  max: number
}

export type PatternKind =
  | "semis"
  | "terraces"
  | "manor-homes"
  | "row-homes"
  | "small-lot-apartments"
  | "corner-lot-apartments"
  | "large-lot-apartments"

export interface PatternDesign {
  id: string
  name: string
  architect: string
  kind: PatternKind
  scale: "low-rise" | "mid-rise"
  url: string
  dwellings: Range
  bedrooms: string
  /** Low-rise only. */
  bathroomsPerDwelling?: Range
  /** Low-rise only. */
  parkingPerDwelling?: number
  /** Low-rise only, m². */
  floorAreaPerDwelling?: number
  /** Mid-rise only, m². */
  gfa?: Range
  /** Mid-rise only, percent NSA:GFA. */
  efficiency?: Range
  /** Mid-rise only. */
  parkingPerBuilding?: Range
  /** m². Mid-rise: the smallest option needs `min`, the largest `max`. */
  minLotArea: Range
  /** m. Same reading as minLotArea. */
  minLotWidth: Range
  storeys: Range
  /** FSR as n:1. */
  fsr: Range
  livability: string
  /** Metres of fall, front to back. */
  siteGradient: Range
}

const r = (min: number, max = min): Range => ({ min, max })
const BASE = "https://www.planning.nsw.gov.au/government-architect-nsw/housing-design/nsw-housing-pattern-book/"

export const patterns: PatternDesign[] = [
  {
    id: "semis-01", name: "Semis 01", architect: "Anthony Gill Architects", kind: "semis", scale: "low-rise",
    url: BASE + "semis-01-by-anthony-gill-architects",
    dwellings: r(2), bedrooms: "3-4", bathroomsPerDwelling: r(1.5, 2.5), parkingPerDwelling: 0.5, floorAreaPerDwelling: 166,
    minLotArea: r(450), minLotWidth: r(12), storeys: r(2), fsr: r(0.75), livability: "Silver", siteGradient: r(0, 1.4),
  },
  {
    id: "semis-02", name: "Semis 02", architect: "Sibling Architecture", kind: "semis", scale: "low-rise",
    url: BASE + "semis-02-by-sibling-architecture",
    dwellings: r(2), bedrooms: "2-4", bathroomsPerDwelling: r(1.5, 2.5), parkingPerDwelling: 0.5, floorAreaPerDwelling: 120,
    minLotArea: r(450), minLotWidth: r(12), storeys: r(2), fsr: r(0.6), livability: "Silver/Gold", siteGradient: r(0, 2),
  },
  {
    id: "terraces-01", name: "Terraces 01", architect: "Carter Williamson", kind: "terraces", scale: "low-rise",
    url: BASE + "terraces-01-by-carter-williamson",
    dwellings: r(3), bedrooms: "3-4", bathroomsPerDwelling: r(2.5), parkingPerDwelling: 0.5, floorAreaPerDwelling: 130,
    minLotArea: r(500), minLotWidth: r(15), storeys: r(2), fsr: r(0.79), livability: "Silver", siteGradient: r(0, 1.2),
  },
  {
    id: "terraces-02", name: "Terraces 02", architect: "Sam Crawford Architects", kind: "terraces", scale: "low-rise",
    url: BASE + "terraces-02-by-sam-crawford-architects",
    dwellings: r(3), bedrooms: "2-4", bathroomsPerDwelling: r(1.5, 2.5), parkingPerDwelling: 0.5, floorAreaPerDwelling: 110,
    minLotArea: r(515), minLotWidth: r(18.5), storeys: r(2), fsr: r(0.69), livability: "Silver/Gold", siteGradient: r(0, 1.2),
  },
  {
    id: "terraces-03", name: "Terraces 03", architect: "Officer Woods Architects", kind: "terraces", scale: "low-rise",
    url: BASE + "terraces-03-by-officer-woods-architects",
    dwellings: r(3), bedrooms: "2-5", bathroomsPerDwelling: r(1.5, 2.5), parkingPerDwelling: 0.5, floorAreaPerDwelling: 93,
    minLotArea: r(500), minLotWidth: r(18), storeys: r(2), fsr: r(0.8), livability: "Silver/Gold", siteGradient: r(0, 1.4),
  },
  {
    id: "terraces-04", name: "Terraces 04", architect: "Other Architects x NMBW", kind: "terraces", scale: "low-rise",
    url: BASE + "terraces-04-by-other-architects-nmbw",
    dwellings: r(3), bedrooms: "2-5", bathroomsPerDwelling: r(2, 2.5), parkingPerDwelling: 0.5, floorAreaPerDwelling: 113,
    minLotArea: r(595), minLotWidth: r(18), storeys: r(2), fsr: r(0.8), livability: "Silver/Gold", siteGradient: r(0, 3),
  },
  {
    id: "manor-homes-01", name: "Manor Homes 01", architect: "Studio Johnston", kind: "manor-homes", scale: "low-rise",
    url: BASE + "manor-homes-01-by-studio-johnston",
    dwellings: r(4), bedrooms: "1-3", bathroomsPerDwelling: r(1.5, 2), parkingPerDwelling: 0.5, floorAreaPerDwelling: 83,
    minLotArea: r(625), minLotWidth: r(15), storeys: r(2), fsr: r(0.6), livability: "Silver", siteGradient: r(0, 2.5),
  },
  {
    id: "row-homes-01", name: "Row Homes 01", architect: "SAHA", kind: "row-homes", scale: "low-rise",
    url: BASE + "row-homes-01-by-saha",
    dwellings: r(4), bedrooms: "2-3", bathroomsPerDwelling: r(1, 2), parkingPerDwelling: 0.5, floorAreaPerDwelling: 52,
    minLotArea: r(500), minLotWidth: r(13), storeys: r(2), fsr: r(0.59), livability: "Silver/Gold", siteGradient: r(0, 2.7),
  },
  {
    id: "small-lot-apartments-01", name: "Small Lot Apartments 01", architect: "Collins and Turner",
    kind: "small-lot-apartments", scale: "mid-rise", url: BASE + "small-lot-apartments-01-by-collins-and-turner",
    dwellings: r(7, 13), bedrooms: "Studio-4", gfa: r(441, 1350), efficiency: r(86, 97), parkingPerBuilding: r(4, 8),
    minLotArea: r(520, 904), minLotWidth: r(13, 16.6), storeys: r(3, 4), fsr: r(1.09, 1.49), livability: "Standard",
    siteGradient: r(0, 1),
  },
  {
    id: "small-lot-apartments-02", name: "Small Lot Apartments 02", architect: "Nguluway DesignInc",
    kind: "small-lot-apartments", scale: "mid-rise", url: BASE + "small-lot-apartments-02-by-nguluway-designinc",
    dwellings: r(6, 14), bedrooms: "1-3", gfa: r(642, 1238), efficiency: r(81, 89), parkingPerBuilding: r(5),
    minLotArea: r(571, 863), minLotWidth: r(13.6, 16.6), storeys: r(3, 4), fsr: r(0.92, 1.39), livability: "Standard",
    siteGradient: r(0, 1.66),
  },
  {
    id: "small-lot-apartments-03", name: "Small Lot Apartments 03", architect: "MHN Design Union",
    kind: "small-lot-apartments", scale: "mid-rise", url: BASE + "small-lot-apartments-03-by-mhn-design-union",
    dwellings: r(9, 24), bedrooms: "Studio-4", gfa: r(840, 3050), efficiency: r(73, 86), parkingPerBuilding: r(4, 10),
    minLotArea: r(640, 1287), minLotWidth: r(16, 19.8), storeys: r(4, 6), fsr: r(1.31, 2.38), livability: "Standard",
    siteGradient: r(0, 2.25),
  },
  {
    id: "small-lot-apartments-04", name: "Small Lot Apartments 04", architect: "Neeson Murcutt Neille",
    kind: "small-lot-apartments", scale: "mid-rise", url: BASE + "small-lot-apartments-04-by-neeson-murcutt-neille",
    dwellings: r(6, 21), bedrooms: "Studio-3", gfa: r(779, 1555), efficiency: r(72, 81), parkingPerBuilding: r(1, 7),
    minLotArea: r(600, 1028), minLotWidth: r(16.5, 20.4), storeys: r(4, 5), fsr: r(1.38, 1.79), livability: "Standard",
    siteGradient: r(0, 2),
  },
  {
    id: "corner-lot-apartments-01", name: "Corner Lot Apartments 01", architect: "Tonkin Zulaikha Greer",
    kind: "corner-lot-apartments", scale: "mid-rise", url: BASE + "corner-lot-apartments-01-by-tonkin-zulaikha-greer",
    dwellings: r(9, 21), bedrooms: "Studio-4", gfa: r(941, 2166), efficiency: r(91, 95), parkingPerBuilding: r(4, 18),
    minLotArea: r(525, 1050), minLotWidth: r(15, 21), storeys: r(4, 6), fsr: r(1.32, 2.66), livability: "Standard",
    siteGradient: r(0, 3.8),
  },
  {
    id: "corner-lot-apartments-02", name: "Corner Lot Apartments 02", architect: "Spacecraft Architects",
    kind: "corner-lot-apartments", scale: "mid-rise", url: BASE + "corner-lot-apartments-02-by-spacecraft-architects",
    dwellings: r(10, 24), bedrooms: "0-4", gfa: r(753, 2883), efficiency: r(93, 95), parkingPerBuilding: r(6, 11),
    minLotArea: r(614, 1287), minLotWidth: r(17.9, 19.8), storeys: r(4, 6), fsr: r(1.23, 2.52), livability: "Standard",
    siteGradient: r(0, 4),
  },
  {
    id: "large-lot-apartments-01", name: "Large Lot Apartments 01", architect: "Silvester Fuller",
    kind: "large-lot-apartments", scale: "mid-rise", url: BASE + "large-lot-apartments-01-by-silvester-fuller",
    dwellings: r(20, 40), bedrooms: "1-3", gfa: r(2148, 3555), efficiency: r(78, 83), parkingPerBuilding: r(13, 53),
    minLotArea: r(1610, 2338), minLotWidth: r(49.1, 65.1), storeys: r(4, 6), fsr: r(1.3, 2.1),
    livability: "Beyond minimum", siteGradient: r(0, 4),
  },
  {
    id: "large-lot-apartments-02", name: "Large Lot Apartments 02", architect: "Bennett and Trimble",
    kind: "large-lot-apartments", scale: "mid-rise", url: BASE + "large-lot-apartments-02-by-bennett-and-trimble",
    dwellings: r(24, 216), bedrooms: "0-3", gfa: r(2734, 18060), efficiency: r(79, 96), parkingPerBuilding: r(15, 100),
    minLotArea: r(2052, 12040), minLotWidth: r(36, 172), storeys: r(3, 6), fsr: r(0.76, 1.93),
    livability: "Standard and beyond minimum", siteGradient: r(0, 4),
  },
  {
    id: "large-lot-apartments-03", name: "Large Lot Apartments 03", architect: "Andrew Burges Architects",
    kind: "large-lot-apartments", scale: "mid-rise", url: BASE + "large-lot-apartments-03-by-andrew-burges-architects",
    // The page prints the FSR as "1.621-2.1:1"; 1.62:1 is the evident reading.
    dwellings: r(58, 140), bedrooms: "0-4", gfa: r(5803, 14162), efficiency: r(93, 94), parkingPerBuilding: r(30, 120),
    minLotArea: r(3551, 6566), minLotWidth: r(67, 127.5), storeys: r(4, 6), fsr: r(1.62, 2.1),
    livability: "Beyond minimum", siteGradient: r(0, 2),
  },
]

export interface Lot {
  /** m²; 0 or null when unknown. */
  landSize: number | null
  /** m; 0 or null when unknown. */
  frontage: number | null
}

export interface PatternFit {
  pattern: PatternDesign
  /** The lot also meets the largest option's minimums (mid-rise), so every option fits. */
  fitsLargest: boolean
  /** Frontage unknown, so only the lot area was checked. */
  widthUnchecked: boolean
}

const known = (n: number | null) => (n !== null && n > 0 ? n : null)

/**
 * Patterns whose smallest option fits the lot on minimum lot area and width alone. Planning controls
 * (zoning, LEP minimums, corner lots, LMR/TOD area) are not checked. Sorted most dwellings first.
 */
export function buildablePatterns(lot: Lot, all: PatternDesign[] = patterns): PatternFit[] {
  const area = known(lot.landSize)
  if (area === null) return []
  const width = known(lot.frontage)
  return all
    .filter((p) => area >= p.minLotArea.min && (width === null || width >= p.minLotWidth.min))
    .map((p) => ({
      pattern: p,
      fitsLargest: area >= p.minLotArea.max && (width === null || width >= p.minLotWidth.max),
      widthUnchecked: width === null,
    }))
    .sort((a, b) => b.pattern.dwellings.max - a.pattern.dwellings.max || a.pattern.name.localeCompare(b.pattern.name))
}

export function formatRange(x: Range, unit = ""): string {
  const s = x.min === x.max ? `${x.min}` : `${x.min}–${x.max}`
  return unit ? `${s} ${unit}` : s
}
