"use client"

import { useMemo, useState } from "react"
import { Info, TrainFront, TrendingUp, X } from "lucide-react"
import { useN3X7 } from "@/lib/store"
import { suburbs } from "@/lib/mock-data"
import {
  defaultFilters,
  frontageOptions,
  nearbyTodSuburbs,
  showsNoTodNotice,
} from "@/lib/search"
import { PropertyCard } from "./property-card"
import { LivePanel } from "./live-panel"
import { SourceSwitch } from "./source-switch"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

type Chip = "all" | "high" | "lmr"

const chips: { id: Chip; label: string }[] = [
  { id: "all", label: "All" },
  { id: "high", label: "High Potential" },
  { id: "lmr", label: "LMR" },
]

function Toggle({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
        active
          ? "border-primary/60 bg-primary/15 text-foreground"
          : "border-border text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  )
}

export function DiscoveryPanel() {
  const { filteredProperties, filters, setFilters, dataSource } = useN3X7()
  const [chip, setChip] = useState<Chip>("all")

  const list = useMemo(() => {
    const filtered = filteredProperties.filter((p) => {
      if (chip === "high") return p.opportunity === "HIGH POTENTIAL"
      if (chip === "lmr") return p.lmr
      return true
    })
    return [...filtered].sort((a, b) => b.score - a.score)
  }, [filteredProperties, chip])

  const noTod = showsNoTodNotice(filters, suburbs)
  const alternatives = filters.suburb ? nearbyTodSuburbs(filters.suburb, suburbs) : []
  const frontageChoices = frontageOptions.includes(filters.minFrontage)
    ? frontageOptions
    : [...frontageOptions, filters.minFrontage].sort((a, b) => a - b)

  if (dataSource === "live") return <LivePanel />

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="shrink-0 space-y-3 border-b border-border px-4 py-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-foreground">
              Property Discovery
            </h2>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <TrendingUp className="size-3.5 text-success" />
              {list.length} listings in {filters.suburb ?? "the Inner West"}
            </p>
          </div>
          <SourceSwitch />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {filters.suburb && (
            <span className="flex items-center gap-1 rounded-lg bg-secondary px-2.5 py-1.5 text-xs font-medium text-foreground">
              {filters.suburb}
              <button
                onClick={() => setFilters({ suburb: null })}
                aria-label={`Clear ${filters.suburb}`}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </span>
          )}
          <Toggle
            active={filters.todOnly}
            onClick={() => setFilters({ todOnly: !filters.todOnly })}
          >
            <TrainFront className="size-3.5" />
            In TOD area
          </Toggle>
          <Toggle
            active={filters.forSaleOnly}
            onClick={() => setFilters({ forSaleOnly: !filters.forSaleOnly })}
          >
            For sale now
          </Toggle>
          <label className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs text-muted-foreground">
            Frontage
            <select
              value={filters.minFrontage}
              onChange={(e) => setFilters({ minFrontage: Number(e.target.value) })}
              className="bg-transparent py-0.5 font-medium text-foreground outline-none"
              aria-label="Minimum frontage"
            >
              {frontageChoices.map((n) => (
                <option key={n} value={n} className="bg-popover">
                  {n === 0 ? "Any" : `${n} m+`}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex gap-1.5">
          {chips.map((f) => (
            <button
              key={f.id}
              onClick={() => setChip(f.id)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                chip === f.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 p-4">
          {noTod ? (
            <div className="glass space-y-3 rounded-2xl p-4">
              <p className="flex items-start gap-2 text-sm text-foreground">
                <Info className="mt-0.5 size-4 shrink-0 text-primary" />
                {filters.suburb} has no TOD area under current NSW planning.
              </p>
              <p className="text-xs text-muted-foreground">
                Nearby suburbs with TOD areas:
              </p>
              <div className="flex flex-wrap gap-2">
                {alternatives.map((s) => (
                  <button
                    key={s.name}
                    onClick={() => setFilters({ suburb: s.name })}
                    className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/85"
                  >
                    <TrainFront className="size-3.5" />
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
          ) : list.length === 0 ? (
            <div className="glass space-y-3 rounded-2xl p-4 text-center">
              <p className="text-sm text-foreground">No listings match these filters.</p>
              <button
                onClick={() => {
                  setFilters({ ...defaultFilters, suburb: filters.suburb })
                  setChip("all")
                }}
                className="text-xs font-medium text-primary hover:underline"
              >
                Clear filters
              </button>
            </div>
          ) : (
            list.map((p) => <PropertyCard key={p.id} property={p} />)
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
