import type { Suburb } from "./types"
import type { Filters } from "./search"
import { LIVE_SUBURBS, matchLiveSuburb } from "./live.ts"
import { parseSearch } from "./search.ts"

export type SearchRoute =
  | { kind: "live"; suburb: (typeof LIVE_SUBURBS)[number] }
  | { kind: "demo"; patch: Partial<Filters> }
  | { kind: "ai" }
  | { kind: "none" }

/** Where a search-bar query goes: live Cotality listings, the demo filters, the AI analyst, or nowhere. */
export function routeSearch(query: string, demoSuburbs: Suburb[]): SearchRoute {
  const suburb = matchLiveSuburb(query)
  if (suburb) return { kind: "live", suburb }
  const patch = parseSearch(query, demoSuburbs)
  if (patch) return { kind: "demo", patch }
  if (/\b(find|show|ask|why|compare|explain|under|potential|growth)\b/i.test(query)) return { kind: "ai" }
  return { kind: "none" }
}

/** Shown under the search bar when a query matches nothing. */
export function noMatchMessage(query: string): string {
  return `No match for "${query}". Live Cotality data covers ${LIVE_SUBURBS.slice(0, -1).join(", ")} and ${LIVE_SUBURBS.at(-1)}.`
}
