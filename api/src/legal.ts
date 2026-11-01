// Cotality disclaimers shown next to Cotality data, fetched from Cotality's Content Services
// so the wording stays current. A copy taken on 2 November 2026 stands in if a fetch fails.

export interface LegalSection {
  key: string
  title: string
  paragraphs: string[]
}

export type ContentCategory = "copyrights" | "disclaimers"

interface Entry {
  category: ContentCategory
  key: string
  title: string
  fallback: string[]
}

/**
 * What N3X7 shows today: NSW for-sale listings, agent details and a map of them.
 * The Service Agent Statement applies to Victorian data only, so it is not listed.
 */
export const LEGAL_ENTRIES: Entry[] = [
  {
    category: "copyrights",
    key: "clCopyright_au",
    title: "Australian Copyright Notice",
    fallback: [
      "This publication reproduces materials and content owned or licenced by RP Data Pty Ltd trading as Cotality (Cotality) and may include data, statistics, estimates, indices, photographs, maps, tools, calculators (including their outputs), commentary, reports and other information (Cotality Data).",
      "© Copyright 2026. Cotality and its licensors are the sole and exclusive owners of all rights, title and interest (including intellectual property rights) subsisting in the Cotality Data contained in this publication. All rights reserved.",
    ],
  },
  {
    category: "disclaimers",
    key: "clData_anz",
    title: "Cotality General Disclaimer",
    fallback: [
      "The Cotality Data provided in this publication is of a general nature and should not be construed as specific advice or relied upon in lieu of appropriate professional advice.",
      "While Cotality uses commercially reasonable efforts to ensure the Cotality Data is current, Cotality does not warrant the accuracy, currency or completeness of the Cotality Data and to the full extent permitted by law excludes all loss or damage howsoever arising (including through negligence) in connection with the Cotality Data.",
    ],
  },
  {
    category: "disclaimers",
    key: "stateNsw_au",
    title: "New South Wales Data",
    fallback: [
      "Contains property sales information provided under licence from the Valuer General New South Wales. RP Data Pty Ltd trading as Cotality is authorised as a Property Sales Information provider by the Valuer General New South Wales.",
    ],
  },
  {
    category: "disclaimers",
    key: "map_anz",
    title: "Maps",
    fallback: [
      "A map showing boundaries of a property is indicative only and may not be complete or accurate. Any map that is produced is not intended or designed to replace the certificate of title or land survey information. If you need a certificate of title or land survey information for any purpose, then you can order these separately from Cotality or the relevant government body.",
    ],
  },
]

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" }

/** Content Services returns light HTML. Splits it into plain-text paragraphs; no markup reaches the page. */
export function toParagraphs(html: string): string[] {
  return html
    .split(/<\/?p[^>]*>|<br\s*\/?>/i)
    .map((part) =>
      part
        .replace(/<[^>]*>/g, "")
        .replace(/&(#39|[a-z]+);/gi, (m, name: string) => ENTITIES[name.toLowerCase()] ?? m)
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean)
}

/** One section per entry, in order. Any entry that fails or comes back empty uses its fallback. */
export async function loadLegal(
  fetchContent: (category: ContentCategory, key: string) => Promise<unknown>,
): Promise<LegalSection[]> {
  return Promise.all(
    LEGAL_ENTRIES.map(async (e) => {
      let paragraphs: string[] = []
      try {
        const body = (await fetchContent(e.category, e.key)) as { content?: unknown } | null
        if (typeof body?.content === "string") paragraphs = toParagraphs(body.content)
      } catch {
        // Fall through to the stored copy.
      }
      return { key: e.key, title: e.title, paragraphs: paragraphs.length ? paragraphs : e.fallback }
    }),
  )
}
