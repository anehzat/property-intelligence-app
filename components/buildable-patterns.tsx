"use client"

import { Building2, ChevronDown, ExternalLink } from "lucide-react"
import { buildablePatterns, formatRange, patterns, type Lot, type PatternDesign } from "@/lib/pattern-book"
import { cn } from "@/lib/utils"

const smallest = {
  area: Math.min(...patterns.map((p) => p.minLotArea.min)),
  width: Math.min(...patterns.map((p) => p.minLotWidth.min)),
}

/**
 * "What you can build": NSW Housing Pattern Book designs whose minimum lot area and width this lot meets.
 * `inLmrOrTod` is undefined when the planning area isn't known (live listings).
 */
export function BuildablePatterns({ lot, inLmrOrTod }: { lot: Lot; inLmrOrTod?: boolean }) {
  const fits = buildablePatterns(lot)
  const hasArea = lot.landSize !== null && lot.landSize > 0
  const widthUnchecked = fits.some((f) => f.widthUnchecked)
  const hasMidRise = fits.some((f) => f.pattern.scale === "mid-rise")

  return (
    <div>
      <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-foreground">
        <Building2 className="size-4 text-primary" />
        What you can build
      </h3>
      <p className="mb-2.5 text-xs text-muted-foreground">
        NSW Housing Pattern Book designs that fit this lot on minimum lot size alone.
      </p>

      {!hasArea ? (
        <p className="rounded-xl border border-border p-3 text-xs text-muted-foreground">
          No land size, so no Pattern Book design can be checked.
        </p>
      ) : fits.length === 0 ? (
        <p className="rounded-xl border border-border p-3 text-xs text-muted-foreground">
          Below the smallest Pattern Book minimum ({smallest.area} m² and {smallest.width} m wide).
        </p>
      ) : (
        <ul className="space-y-2">
          {fits.map((f) => (
            <PatternRow key={f.pattern.id} p={f.pattern} fitsLargest={f.fitsLargest} />
          ))}
        </ul>
      )}

      {hasArea && fits.length > 0 && (
        <ul className="mt-2.5 list-disc space-y-1 pl-4 text-[11px] text-muted-foreground">
          {widthUnchecked && <li>Frontage unknown: checked on lot area only.</li>}
          {hasMidRise && inLmrOrTod === false && (
            <li className="text-warning">Outside LMR and TOD areas, where mid-rise patterns don't apply.</li>
          )}
          <li>Low-rise minimums are for LMR housing areas. Zoning, council LEP minimums and site constraints aren't checked.</li>
        </ul>
      )}
    </div>
  )
}

function PatternRow({ p, fitsLargest }: { p: PatternDesign; fitsLargest: boolean }) {
  return (
    <li>
      <details className="group glass rounded-xl">
        <summary className="flex cursor-pointer list-none items-center gap-3 p-3 [&::-webkit-details-marker]:hidden">
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-foreground">
              {p.name}
              <Chip className={p.scale === "mid-rise" ? "bg-primary/12 text-primary" : "bg-success/12 text-success"}>
                {p.scale === "mid-rise" ? "Mid-rise" : "Low-rise"}
              </Chip>
              {p.kind === "corner-lot-apartments" && <Chip className="bg-secondary text-muted-foreground">Corner lot</Chip>}
              {p.scale === "mid-rise" && fitsLargest && (
                <Chip className="bg-success/12 text-success">All options fit</Chip>
              )}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {formatRange(p.dwellings)} dwellings · {formatRange(p.storeys)} storeys · min{" "}
              {formatRange(p.minLotArea, "m²")}, {formatRange(p.minLotWidth, "m")} wide
            </p>
          </div>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className="border-t border-border px-3 pt-2 pb-3">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
            {metricRows(p).map(([label, value]) => (
              <div key={label} className="flex justify-between gap-2">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="text-right font-mono text-foreground">{value}</dd>
              </div>
            ))}
          </dl>
          <a
            href={p.url}
            target="_blank"
            rel="noreferrer"
            className="mt-2.5 inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            {p.architect} · NSW Planning
            <ExternalLink className="size-3" />
          </a>
        </div>
      </details>
    </li>
  )
}

function metricRows(p: PatternDesign): [string, string][] {
  const rows: [string, string | undefined][] = [
    ["Dwellings", formatRange(p.dwellings)],
    ["Bedrooms", p.bedrooms],
    ["Bathrooms", p.bathroomsPerDwelling && formatRange(p.bathroomsPerDwelling)],
    ["Floor area / dwelling", p.floorAreaPerDwelling !== undefined ? `${p.floorAreaPerDwelling} m²` : undefined],
    ["GFA", p.gfa && formatRange(p.gfa, "m²")],
    ["Efficiency", p.efficiency && `${formatRange(p.efficiency)}%`],
    ["Parking / dwelling", p.parkingPerDwelling?.toString()],
    ["Parking / building", p.parkingPerBuilding && formatRange(p.parkingPerBuilding)],
    ["Min lot area", formatRange(p.minLotArea, "m²")],
    ["Min lot width", formatRange(p.minLotWidth, "m")],
    ["Storeys", formatRange(p.storeys)],
    ["FSR", p.fsr.min === p.fsr.max ? `${p.fsr.min}:1` : `${p.fsr.min}:1–${p.fsr.max}:1`],
    ["Livability", p.livability],
    ["Site gradient", formatRange(p.siteGradient, "m")],
  ]
  return rows.filter((r): r is [string, string] => r[1] !== undefined)
}

function Chip({ className, children }: { className: string; children: React.ReactNode }) {
  return <span className={cn("rounded-full px-1.5 py-px text-[10px] font-medium", className)}>{children}</span>
}
