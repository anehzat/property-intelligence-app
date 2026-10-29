"use client"

import { useEffect, useState } from "react"
import {
  Bath,
  BedDouble,
  Bookmark,
  LandPlot,
  MapPin,
  Ruler,
  Sparkles,
  TrainFront,
  TrendingUp,
} from "lucide-react"
import { useN3X7 } from "@/lib/store"
import { features } from "@/lib/config"
import {
  formatDistance,
  formatPrice,
  opportunityStyle,
  statusLabel,
  typeLabel,
} from "@/lib/format"
import { ScoreRing, ScoreBar } from "./score-card"
import { ContractRequestPanel } from "./contract-request"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function PropertyDrawer() {
  const {
    drawerOpen,
    closeDrawer,
    selectedProperty: p,
    isSaved,
    toggleSave,
    setAiContextId,
    askAi,
  } = useN3X7()
  const [activeImg, setActiveImg] = useState(0)

  useEffect(() => {
    setActiveImg(0)
  }, [p?.id])

  return (
    <Sheet open={drawerOpen} onOpenChange={(o) => !o && closeDrawer()}>
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-y-auto bg-background p-0 sm:!max-w-lg"
      >
        {p && (
          <>
            <div className="relative">
              <img
                src={p.gallery[activeImg] || p.image || "/placeholder.svg"}
                alt={`${p.address} view ${activeImg + 1}`}
                className="h-60 w-full object-cover"
              />
              <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-background to-transparent" />
              <span
                className={cn(
                  "absolute top-4 left-4 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold backdrop-blur",
                  opportunityStyle[p.opportunity].className,
                )}
              >
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    opportunityStyle[p.opportunity].dot,
                  )}
                />
                {opportunityStyle[p.opportunity].text}
              </span>
              {p.gallery.length > 1 && (
                <div className="absolute bottom-3 left-4 flex gap-1.5">
                  {p.gallery.map((g, i) => (
                    <button
                      key={g + i}
                      onClick={() => setActiveImg(i)}
                      aria-label={`View image ${i + 1}`}
                      className={cn(
                        "h-1.5 rounded-full transition-all",
                        i === activeImg
                          ? "w-6 bg-primary"
                          : "w-1.5 bg-foreground/40",
                      )}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-6 p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                    {typeLabel[p.type]}
                  </span>
                  <h2 className="mt-0.5 text-xl font-semibold text-foreground">
                    {p.address}
                  </h2>
                  <p className="flex items-center gap-1 text-sm text-muted-foreground">
                    <MapPin className="size-3.5" />
                    {p.suburb} {p.state}
                  </p>
                  <p className="mt-2 font-mono text-2xl font-semibold text-foreground">
                    {formatPrice(p.price)}
                  </p>
                  <span
                    className={cn(
                      "mt-1.5 inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium",
                      p.status === "for-sale"
                        ? "bg-success/15 text-success"
                        : "bg-secondary text-muted-foreground",
                    )}
                  >
                    {statusLabel[p.status]}
                  </span>
                </div>
                <div className="flex flex-col items-center">
                  <ScoreRing score={p.score} size={68} stroke={6} />
                  <span className="mt-1 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                    N3X7 Score
                  </span>
                </div>
              </div>

              {/* Attributes */}
              <div className="grid grid-cols-4 gap-2">
                {[
                  { icon: BedDouble, label: "Beds", value: p.beds },
                  { icon: Bath, label: "Baths", value: p.baths },
                  {
                    icon: LandPlot,
                    label: "Land",
                    value: p.landSize ? `${p.landSize}m²` : "—",
                  },
                  {
                    icon: Ruler,
                    label: "Frontage",
                    value: p.frontage ? `${p.frontage}m` : "—",
                  },
                ].map(({ icon: Icon, label, value }) => (
                  <div
                    key={label}
                    className="glass flex flex-col items-center gap-1 rounded-xl py-3"
                  >
                    <Icon className="size-4 text-primary" />
                    <span className="font-mono text-sm font-semibold text-foreground">
                      {value}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {label}
                    </span>
                  </div>
                ))}
              </div>

              {/* Planning Intelligence */}
              <div>
                <h3 className="mb-2.5 flex items-center gap-2 text-sm font-semibold text-foreground">
                  <TrendingUp className="size-4 text-success" />
                  Planning Intelligence
                </h3>
                <div className="grid grid-cols-3 gap-2">
                  <div className="glass rounded-xl p-3">
                    <p className="text-[11px] text-muted-foreground">
                      LMR Status
                    </p>
                    <p
                      className={cn(
                        "mt-1 text-sm font-semibold",
                        p.lmr ? "text-success" : "text-muted-foreground",
                      )}
                    >
                      {p.lmr ? "YES" : "NO"}
                    </p>
                  </div>
                  <div className="glass rounded-xl p-3">
                    <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <TrainFront className="size-3" /> TOD
                    </p>
                    <p
                      className={cn(
                        "mt-1 font-mono text-sm font-semibold",
                        p.tod ? "text-success" : "text-foreground",
                      )}
                    >
                      {p.tod ? "INSIDE" : formatDistance(p.todDistance)}
                    </p>
                  </div>
                  <div className="glass rounded-xl p-3">
                    <p className="text-[11px] text-muted-foreground">
                      Dev Potential
                    </p>
                    <p
                      className={cn(
                        "mt-1 text-sm font-semibold",
                        p.developmentPotential === "High"
                          ? "text-success"
                          : p.developmentPotential === "Medium"
                            ? "text-primary"
                            : "text-muted-foreground",
                      )}
                    >
                      {p.developmentPotential}
                    </p>
                  </div>
                </div>
              </div>

              {/* Score breakdown */}
              <div>
                <h3 className="mb-3 text-sm font-semibold text-foreground">
                  N3X7 Score Breakdown
                </h3>
                <div className="space-y-3">
                  <ScoreBar
                    label="Planning Opportunity"
                    value={p.breakdown.planningOpportunity}
                  />
                  <ScoreBar
                    label="Market Demand"
                    value={p.breakdown.marketDemand}
                  />
                  <ScoreBar
                    label="Transport Access"
                    value={p.breakdown.transportAccess}
                  />
                  <ScoreBar
                    label="Risk Score"
                    value={p.breakdown.riskScore}
                    inverse
                  />
                </div>
              </div>

              {/* Insights */}
              <div>
                <h3 className="mb-2.5 text-sm font-semibold text-foreground">
                  Key Insights
                </h3>
                <ul className="grid grid-cols-2 gap-2">
                  {p.insights.map((i) => (
                    <li
                      key={i}
                      className="glass flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-foreground/90"
                    >
                      <span className="size-1.5 shrink-0 rounded-full bg-success" />
                      {i}
                    </li>
                  ))}
                </ul>
              </div>

              <ContractRequestPanel key={p.id} property={p} />
            </div>

            <div className="sticky bottom-0 flex gap-2 border-t border-border bg-background/90 p-4 backdrop-blur">
              <Button
                variant={isSaved(p.id) ? "secondary" : "outline"}
                onClick={() => toggleSave(p.id)}
                className="flex-1"
              >
                <Bookmark
                  className={cn("size-4", isSaved(p.id) && "fill-current")}
                />
                {isSaved(p.id) ? "Saved" : "Save"}
              </Button>
              {features.ai && (
                <Button
                  className="flex-[1.5] bg-ai text-ai-foreground [a]:hover:bg-ai/80 hover:bg-ai/85"
                  onClick={() => {
                    setAiContextId(p.id)
                    askAi(`Why is ${p.address} interesting?`)
                  }}
                >
                  <Sparkles className="size-4" />
                  Ask N3X7 about this
                </Button>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
