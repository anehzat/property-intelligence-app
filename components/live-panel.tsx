"use client"

import { Info, Loader2, TrendingUp } from "lucide-react"
import { useN3X7 } from "@/lib/store"
import { LIVE_SUBURBS, LIVE_TYPES, landAreaOptions } from "@/lib/live"
import { LiveListingCard } from "./live-listing-card"
import { SourceSwitch } from "./source-switch"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function LivePanel() {
  const { liveQuery: q, setLiveQuery, live } = useN3X7()
  const toggleType = (id: string) =>
    setLiveQuery({ types: q.types.includes(id) ? q.types.filter((t) => t !== id) : [...q.types, id] })

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="shrink-0 space-y-3 border-b border-border px-4 py-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-foreground">Property Discovery</h2>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <TrendingUp className="size-3.5 text-success" />
              {live.status === "ok" ? `${live.total} for sale in ${q.suburb}` : `Live listings in ${q.suburb}`}
            </p>
          </div>
          <SourceSwitch />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <label className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs text-muted-foreground">
            Suburb
            <select
              value={q.suburb}
              onChange={(e) => setLiveQuery({ suburb: e.target.value })}
              className="bg-transparent py-0.5 font-medium text-foreground outline-none"
              aria-label="Suburb"
            >
              {LIVE_SUBURBS.map((s) => (
                <option key={s} value={s} className="bg-popover">{s}</option>
              ))}
            </select>
          </label>
          {LIVE_TYPES.map((t) => (
            <button
              key={t.id}
              onClick={() => toggleType(t.id)}
              aria-pressed={q.types.includes(t.id)}
              className={cn(
                "rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
                q.types.includes(t.id)
                  ? "border-primary/60 bg-primary/15 text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
          <label className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs text-muted-foreground">
            Land
            <select
              value={q.minLandArea}
              onChange={(e) => setLiveQuery({ minLandArea: Number(e.target.value) })}
              className="bg-transparent py-0.5 font-medium text-foreground outline-none"
              aria-label="Minimum land area"
            >
              {landAreaOptions.map((n) => (
                <option key={n} value={n} className="bg-popover">{n === 0 ? "Any" : `${n} m²+`}</option>
              ))}
            </select>
          </label>
        </div>

        <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
          <Info className="mt-px size-3 shrink-0" />
          Sandbox data: Blacktown, Quakers Hill, Seven Hills only. Frontage and TOD flags aren&apos;t available from
          Cotality yet.
        </p>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 p-4">
          {live.status === "loading" || live.status === "idle" ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading live listings…
            </div>
          ) : live.status === "error" ? (
            <div role="alert" className="glass space-y-3 rounded-2xl p-4 text-center">
              <p className="text-sm text-foreground">{live.error}</p>
              <button
                onClick={() => setLiveQuery({ page: q.page })}
                className="text-xs font-medium text-primary hover:underline"
              >
                Try again
              </button>
            </div>
          ) : live.listings.length === 0 ? (
            <div className="glass rounded-2xl p-4 text-center text-sm text-foreground">
              No listings match these filters.
            </div>
          ) : (
            <>
              {live.listings.map((l) => (
                <LiveListingCard key={l.id} listing={l} />
              ))}
              {live.totalPages > 1 && (
                <div className="flex items-center justify-between pt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={q.page === 0}
                    onClick={() => setLiveQuery({ page: q.page - 1 })}
                  >
                    Previous
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Page {q.page + 1} of {live.totalPages}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={q.page + 1 >= live.totalPages}
                    onClick={() => setLiveQuery({ page: q.page + 1 })}
                  >
                    Next
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
