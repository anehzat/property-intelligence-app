"use client"

import {
  Bath,
  BedDouble,
  Bookmark,
  Car,
  Check,
  MapPin,
  Sparkles,
} from "lucide-react"
import type { Property } from "@/lib/types"
import { useN3X7 } from "@/lib/store"
import { features } from "@/lib/config"
import { formatPrice, opportunityStyle, statusLabel, typeLabel } from "@/lib/format"
import { ScoreRing } from "./score-card"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function PropertyCard({ property }: { property: Property }) {
  const { isSaved, toggleSave, openProperty, setAiContextId, askAi } = useN3X7()
  const saved = isSaved(property.id)
  const opp = opportunityStyle[property.opportunity]

  return (
    <div className="group glass overflow-hidden rounded-2xl transition-all hover:ring-1 hover:ring-primary/40">
      <div className="relative">
        <img
          src={property.image || "/placeholder.svg"}
          alt={`${property.address}, ${property.suburb}`}
          className="h-40 w-full object-cover"
        />
        <div className="absolute inset-x-0 top-0 flex items-start justify-between p-3">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold backdrop-blur",
              opp.className,
            )}
          >
            <span className={cn("size-1.5 rounded-full", opp.dot)} />
            {opp.text}
          </span>
          <button
            onClick={() => toggleSave(property.id)}
            aria-label={saved ? "Remove from saved" : "Save property"}
            className={cn(
              "flex size-8 items-center justify-center rounded-lg backdrop-blur transition-colors",
              saved
                ? "bg-primary text-primary-foreground"
                : "bg-background/60 text-foreground hover:bg-background/90",
            )}
          >
            <Bookmark className={cn("size-4", saved && "fill-current")} />
          </button>
        </div>
        <div className="absolute bottom-3 left-3 flex gap-1.5">
          <span className="rounded-md bg-background/70 px-2 py-0.5 text-[11px] font-medium text-foreground backdrop-blur">
            {typeLabel[property.type]}
          </span>
          {property.tod && (
            <span className="rounded-md bg-primary/80 px-2 py-0.5 text-[11px] font-semibold text-primary-foreground backdrop-blur">
              TOD
            </span>
          )}
          {property.status !== "for-sale" && (
            <span className="rounded-md bg-background/70 px-2 py-0.5 text-[11px] font-medium text-muted-foreground backdrop-blur">
              {statusLabel[property.status]}
            </span>
          )}
        </div>
      </div>

      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-foreground">
              {property.address}
            </h3>
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="size-3" />
              {property.suburb} {property.state}
            </p>
            <p className="mt-1.5 font-mono text-lg font-semibold text-foreground">
              {formatPrice(property.price)}
            </p>
          </div>
          <div className="flex flex-col items-center">
            <ScoreRing score={property.score} size={52} />
            <span className="mt-1 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
              N3X7
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 border-y border-border py-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <BedDouble className="size-3.5" /> {property.beds}
          </span>
          <span className="flex items-center gap-1">
            <Bath className="size-3.5" /> {property.baths}
          </span>
          <span className="flex items-center gap-1">
            <Car className="size-3.5" /> {property.parking}
          </span>
          <span className="ml-auto flex items-center gap-2 font-mono">
            {property.frontage > 0 && <span>{property.frontage}m front</span>}
            {property.landSize > 0 && <span>{property.landSize}m²</span>}
          </span>
        </div>

        <ul className="space-y-1.5">
          {property.insights.slice(0, 3).map((insight) => (
            <li
              key={insight}
              className="flex items-center gap-2 text-xs text-foreground/90"
            >
              <Check className="size-3.5 shrink-0 text-success" />
              {insight}
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-2 pt-1">
          <Button
            size="sm"
            className="flex-1"
            onClick={() => openProperty(property.id)}
          >
            View Details
          </Button>
          {features.ai && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setAiContextId(property.id)
                askAi(`Why is ${property.address} interesting?`)
              }}
            >
              <Sparkles className="size-3.5 text-ai" />
              Ask AI
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
