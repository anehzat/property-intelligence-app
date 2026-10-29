"use client"

import { Bookmark, Calendar, FileCheck, MapPin, Sparkles, Trash2 } from "lucide-react"
import { useN3X7 } from "@/lib/store"
import { features } from "@/lib/config"
import { formatPrice, formatRelative, opportunityStyle, typeLabel } from "@/lib/format"
import { ScoreRing } from "@/components/score-card"
import { LiveListingCard } from "@/components/live-listing-card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export default function SavedPage() {
  const {
    properties,
    savedIds,
    toggleSave,
    openProperty,
    setAiContextId,
    askAi,
    contractRequests,
    savedLive,
  } = useN3X7()
  const saved = properties.filter((p) => savedIds.includes(p.id))
  const savedLiveList = Object.values(savedLive)

  return (
    <ScrollArea className="h-full">
      <div className="mx-auto max-w-5xl px-4 py-6 md:px-8">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Saved Properties
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {saved.length + savedLiveList.length} opportunities tracked in your intelligence watchlist.
          </p>
        </header>

        {saved.length === 0 && savedLiveList.length === 0 ? (
          <div className="glass flex flex-col items-center justify-center gap-3 rounded-2xl py-20 text-center">
            <div className="flex size-12 items-center justify-center rounded-xl bg-primary/12">
              <Bookmark className="size-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">
                No saved properties yet
              </p>
              <p className="text-xs text-muted-foreground">
                Save opportunities from Discover to track them here.
              </p>
            </div>
          </div>
        ) : (
          <>
          <div className="grid gap-4">
            {saved.map((p) => {
              const opp = opportunityStyle[p.opportunity]
              return (
                <div
                  key={p.id}
                  className="glass group flex flex-col gap-4 rounded-2xl p-3 transition-all hover:ring-1 hover:ring-primary/40 sm:flex-row"
                >
                  <img
                    src={p.image || "/placeholder.svg"}
                    alt={`${p.address}, ${p.suburb}`}
                    className="h-40 w-full shrink-0 rounded-xl object-cover sm:h-32 sm:w-48"
                  />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                              opp.className,
                            )}
                          >
                            <span
                              className={cn("size-1.5 rounded-full", opp.dot)}
                            />
                            {opp.text}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            {typeLabel[p.type]}
                          </span>
                        </div>
                        <h3 className="mt-1.5 truncate text-base font-semibold text-foreground">
                          {p.address}
                        </h3>
                        <p className="flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin className="size-3" />
                          {p.suburb} {p.state}
                        </p>
                      </div>
                      {features.score && <ScoreRing score={p.score} size={48} />}
                    </div>

                    <p className="mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-foreground/80">
                      <Sparkles className="mt-0.5 size-3 shrink-0 text-ai" />
                      {p.aiSummary ??
                        "Tracked opportunity with active planning signals."}
                    </p>

                    <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 pt-3">
                      <span className="font-mono text-base font-semibold text-foreground">
                        {formatPrice(p.price)}
                      </span>
                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Calendar className="size-3" />
                        Saved {p.savedDate ?? "recently"}
                      </span>
                      {contractRequests[p.id] && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-medium text-success">
                          <FileCheck className="size-3" />
                          Contract requested ·{" "}
                          {formatRelative(contractRequests[p.id].requestedAt)}
                        </span>
                      )}
                      <div className="ml-auto flex gap-1.5">
                        {features.ai && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setAiContextId(p.id)
                              askAi(`Why is ${p.address} interesting?`)
                            }}
                          >
                            <Sparkles className="size-3.5 text-ai" />
                            Ask AI
                          </Button>
                        )}
                        <Button size="sm" onClick={() => openProperty(p.id)}>
                          View
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label="Remove from saved"
                          onClick={() => toggleSave(p.id)}
                        >
                          <Trash2 className="size-4 text-muted-foreground" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          {savedLiveList.length > 0 && (
            <section className="mt-8 space-y-3">
              <h2 className="text-sm font-semibold text-foreground">Live listings (Cotality)</h2>
              <div className="grid gap-4 md:grid-cols-2">
                {savedLiveList.map((l) => (
                  <LiveListingCard key={l.id} listing={l} />
                ))}
              </div>
            </section>
          )}
          </>
        )}
      </div>
    </ScrollArea>
  )
}
