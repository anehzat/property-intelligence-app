"use client"

import { Bath, BedDouble, Bookmark, Car, LandPlot, MapPin } from "lucide-react"
import type { LiveListing } from "@/lib/types"
import { useN3X7 } from "@/lib/store"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function LiveListingCard({ listing: l }: { listing: LiveListing }) {
  const { openLive, isSaved, toggleSaveLive } = useN3X7()
  const saved = isSaved(l.id)
  return (
    <div className="glass overflow-hidden rounded-2xl">
      <img src={l.image ?? "/placeholder.svg"} alt={l.address} className="h-40 w-full object-cover" />
      <div className="space-y-3 p-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{l.address}</h3>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="size-3" />
            {l.suburb} {l.state}
          </p>
        </div>
        <p className="font-mono text-lg font-semibold text-foreground">{l.priceLabel ?? "Price on request"}</p>
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          {l.beds !== null && <span className="flex items-center gap-1"><BedDouble className="size-3.5" />{l.beds}</span>}
          {l.baths !== null && <span className="flex items-center gap-1"><Bath className="size-3.5" />{l.baths}</span>}
          {l.parking !== null && <span className="flex items-center gap-1"><Car className="size-3.5" />{l.parking}</span>}
          {l.landSize !== null && <span className="flex items-center gap-1"><LandPlot className="size-3.5" />{l.landSize} m²</span>}
        </div>
        {(l.agentName || l.agency) && (
          <p className="text-xs text-muted-foreground">
            {[l.agentName, l.agency].filter(Boolean).join(" · ")}
          </p>
        )}
        <div className="flex gap-2">
          <Button size="sm" className="flex-1" onClick={() => openLive(l)}>
            View Details
          </Button>
          <Button
            size="sm"
            variant={saved ? "secondary" : "outline"}
            onClick={() => toggleSaveLive(l)}
            aria-label={saved ? "Unsave" : "Save"}
          >
            <Bookmark className={cn("size-4", saved && "fill-current")} />
          </Button>
        </div>
      </div>
    </div>
  )
}
