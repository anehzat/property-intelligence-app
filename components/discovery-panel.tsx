"use client"

import { useMemo, useState } from "react"
import { SlidersHorizontal, TrendingUp } from "lucide-react"
import { useN3X7 } from "@/lib/store"
import { PropertyCard } from "./property-card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

type Filter = "all" | "high" | "lmr"

const filters: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "high", label: "High Potential" },
  { id: "lmr", label: "LMR" },
]

export function DiscoveryPanel() {
  const { properties } = useN3X7()
  const [filter, setFilter] = useState<Filter>("all")

  const list = useMemo(() => {
    const filtered = properties.filter((p) => {
      if (filter === "high") return p.opportunity === "HIGH POTENTIAL"
      if (filter === "lmr") return p.lmr
      return true
    })
    return [...filtered].sort((a, b) => b.score - a.score)
  }, [properties, filter])

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="shrink-0 space-y-3 border-b border-border px-4 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-foreground">
              Property Discovery
            </h2>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <TrendingUp className="size-3.5 text-success" />
              {list.length} opportunities near North Bondi
            </p>
          </div>
          <button
            className="flex size-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Filters"
          >
            <SlidersHorizontal className="size-4" />
          </button>
        </div>

        <div className="flex gap-1.5">
          {filters.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                filter === f.id
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
          {list.map((p) => (
            <PropertyCard key={p.id} property={p} />
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}
