// Cotality disclaimers, served by the N3X7 API from Cotality's Content Services.

export interface LegalSection {
  key: string
  title: string
  paragraphs: string[]
}

export const DISCLAIMERS_HEADING = "Cotality Property Data Disclaimers"
/** Alt text Cotality requires on its logo in every data section header. */
export const COTALITY_LOGO_ALT = "Source: Cotality®"

const trim = (base: string) => base.replace(/\/+$/, "")

export function disclaimersUrl(apiBase: string): string {
  return `${trim(apiBase)}/legal/disclaimers`
}

export function isDisclaimers(x: unknown): x is { sections: LegalSection[] } {
  const sections = (x as { sections?: unknown } | null)?.sections
  return (
    Array.isArray(sections) &&
    sections.length > 0 &&
    sections.every(
      (s: LegalSection) =>
        !!s &&
        typeof s.title === "string" &&
        Array.isArray(s.paragraphs) &&
        s.paragraphs.every((p) => typeof p === "string"),
    )
  )
}
