"use client"

import { useEffect, useId, useState } from "react"
import { ExternalLink, Loader2 } from "lucide-react"
import { getIdToken } from "@/lib/auth"
import { config } from "@/lib/config"
import { fetchLive } from "@/lib/live"
import { COTALITY_LOGO_ALT, DISCLAIMERS_HEADING, disclaimersUrl, isDisclaimers, type LegalSection } from "@/lib/legal"
import { isSilentLogin, silentLoginApiUrl, type SilentTarget } from "@/lib/rpdata"
import { useN3X7 } from "@/lib/store"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// Cotality Logo, RGB Cream (for dark backgrounds), from Cotality Brand Resources, cropped to the artwork.
const LOGO_SRC = "/cotality-logo.svg"

/** Cotality's logo, once in the header of every section that shows Cotality data. */
export function CotalityLogo({ className }: { className?: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) {
    return (
      <span className={cn("shrink-0 text-[11px] font-medium whitespace-nowrap text-muted-foreground", className)}>
        {COTALITY_LOGO_ALT}
      </span>
    )
  }
  return (
    <img src={LOGO_SRC} alt={COTALITY_LOGO_ALT} onError={() => setFailed(true)} className={cn("h-6 w-auto shrink-0", className)} />
  )
}

// One fetch per page load, shared by every disclaimer box; a failure is retried next time a box mounts.
let sectionsPromise: Promise<LegalSection[]> | null = null
function loadSections(): Promise<LegalSection[]> {
  sectionsPromise ??= (async () => {
    const token = await getIdToken()
    if (!token) throw new Error("Your session has expired. Sign in again.")
    return (await fetchLive(disclaimersUrl(config.apiUrl), token, isDisclaimers)).sections
  })().catch((e) => {
    sectionsPromise = null
    throw e
  })
  return sectionsPromise
}

/** Full disclaimer wording in a same-page scroll box: no links out, nothing collapsed. */
export function CotalityDisclaimers({ className }: { className?: string }) {
  const [sections, setSections] = useState<LegalSection[] | null>(null)
  const [failed, setFailed] = useState(false)
  const headingId = useId()

  useEffect(() => {
    let cancelled = false
    loadSections().then(
      (s) => !cancelled && setSections(s),
      () => !cancelled && setFailed(true),
    )
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <section aria-labelledby={headingId} className={cn("rounded-xl border border-border", className)}>
      <h3 id={headingId} className="border-b border-border px-3 py-2 text-xs font-semibold text-foreground">
        {DISCLAIMERS_HEADING}
      </h3>
      <div tabIndex={0} className="max-h-44 space-y-3 overflow-y-auto px-3 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
        {sections ? (
          sections.map((s) => (
            <div key={s.key} className="space-y-1">
              <h4 className="font-semibold text-foreground/90">{s.title}</h4>
              {s.paragraphs.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          ))
        ) : failed ? (
          <p role="alert">Couldn&apos;t load the Cotality disclaimers. Reload the page to try again.</p>
        ) : (
          <p className="flex items-center gap-2">
            <Loader2 className="size-3 animate-spin" />
            Loading disclaimers…
          </p>
        )}
      </div>
    </section>
  )
}

/**
 * Opens RP Data Professional already signed in (silent login). Shown only when the user's RP Data
 * account is linked and the API has Cotality's silent login key. The signed URL is fetched on click,
 * because RP Data accepts it for 10 minutes only.
 */
export function OpenInRpData({ target, className }: { target: SilentTarget; className?: string }) {
  const { rpdata, rpSilentLogin, markRpDataUnlinked } = useN3X7()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (rpdata !== "linked" || !rpSilentLogin) return null

  const open = async () => {
    setError(null)
    setBusy(true)
    // Open the tab inside the click so pop-up blockers allow it, then point it at RP Data.
    const tab = window.open("", "_blank")
    if (tab) tab.opener = null
    try {
      const token = await getIdToken()
      if (!token) throw new Error("Your session has expired. Sign in again.")
      const { url } = await fetchLive(silentLoginApiUrl(config.apiUrl, target), token, isSilentLogin)
      if (tab) tab.location.href = url
      else window.location.href = url
    } catch (e) {
      tab?.close()
      if ((e as { status?: number }).status === 409) markRpDataUnlinked()
      setError("Couldn't open RP Data. Please try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={cn("space-y-1", className)}>
      <Button variant="outline" className="w-full" onClick={open} disabled={busy}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <ExternalLink className="size-4" />}
        {target.page === "property" ? "View in RP Data" : "Open RP Data"}
      </Button>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
