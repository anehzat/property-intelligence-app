"use client"

import { useEffect, useState } from "react"
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  HelpCircle,
  Loader2,
  ShieldAlert,
} from "lucide-react"
import { buildablePatterns, formatRange, patterns, type Lot, type PatternDesign } from "@/lib/pattern-book"
import { siteChecksFor, verdict, type Restriction, type SiteChecks } from "@/lib/site-checks"
import { cn } from "@/lib/utils"

const smallest = {
  area: Math.min(...patterns.map((p) => p.minLotArea.min)),
  width: Math.min(...patterns.map((p) => p.minLotWidth.min)),
}

type ChecksState = { status: "loading" } | { status: "ok"; checks: SiteChecks } | { status: "error" }

function useSiteChecks(lat: number, lng: number): ChecksState {
  const [state, setState] = useState<ChecksState>({ status: "loading" })
  useEffect(() => {
    let cancelled = false
    setState({ status: "loading" })
    siteChecksFor(lat, lng).then(
      (checks) => !cancelled && setState({ status: "ok", checks }),
      () => !cancelled && setState({ status: "error" }),
    )
    return () => {
      cancelled = true
    }
  }, [lat, lng])
  return state
}

/**
 * "What you can build", in two steps: (1) LEP controls and the NSW Housing Pattern Book designs whose minimum
 * lot area and width this lot meets, then (2) land restrictions from NSW planning layers.
 * `inLmrOrTod` is undefined when the planning area isn't known (live listings).
 */
export function BuildablePatterns({
  lot,
  inLmrOrTod,
  at,
}: {
  lot: Lot
  inLmrOrTod?: boolean
  at: { lat: number; lng: number }
}) {
  const fits = buildablePatterns(lot)
  const hasArea = lot.landSize !== null && lot.landSize > 0
  const checks = useSiteChecks(at.lat, at.lng)

  return (
    <div className="space-y-4">
      <Verdict hasArea={hasArea} fits={fits.length} checks={checks} />
      <div>
        <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Building2 className="size-4 text-primary" />
          <StepChip n={1} />
          What you can build
        </h3>
        {checks.status === "ok" && <Controls checks={checks.checks} />}
        <Patterns lot={lot} inLmrOrTod={inLmrOrTod} />
      </div>
      <div>
        <h3 className="mb-2.5 flex items-center gap-2 text-sm font-semibold text-foreground">
          <ShieldAlert className="size-4 text-primary" />
          <StepChip n={2} />
          Land restrictions
        </h3>
        <Restrictions checks={checks} />
        <p className="mt-2 text-[11px] text-muted-foreground">
          Source: NSW Planning and NSW Spatial Services. Indicative only, not a substitute for a Section 10.7
          planning certificate.
        </p>
      </div>
    </div>
  )
}

function StepChip({ n }: { n: number }) {
  return <span className="rounded-full bg-secondary px-1.5 py-px text-[10px] font-medium text-muted-foreground">Step {n}</span>
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`
}

function Verdict({ hasArea, fits, checks }: { hasArea: boolean; fits: number; checks: ChecksState }) {
  const designs = !hasArea ? "Land size unknown" : fits ? `${plural(fits, "design")} fit` : "No design fits"
  if (checks.status !== "ok") {
    return (
      <div className="flex items-center gap-2.5 rounded-xl border border-border p-3 text-sm text-foreground">
        {checks.status === "loading" ? (
          <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <HelpCircle className="size-4 shrink-0 text-muted-foreground" />
        )}
        <span>
          <span className="font-semibold">{designs}</span>
          <span className="text-muted-foreground">
            {checks.status === "loading" ? " · checking land restrictions…" : " · couldn't check land restrictions"}
          </span>
        </span>
      </div>
    )
  }
  const { affected, unknown } = verdict(checks.checks.restrictions)
  const restrictions = affected.length
    ? `${plural(affected.length, "restriction")} to check`
    : unknown
      ? `couldn't check ${unknown} of ${checks.checks.restrictions.length - 1}`
      : "no mapped restrictions"
  const good = affected.length === 0 && unknown === 0 && fits > 0
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-xl border p-3",
        affected.length ? "border-warning/35 bg-warning/10" : good ? "border-success/35 bg-success/10" : "border-border",
      )}
    >
      {affected.length ? (
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
      ) : good ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
      ) : (
        <HelpCircle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      )}
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">
          {designs} · {restrictions}
        </p>
        {affected.length > 0 && (
          <p className="mt-0.5 text-xs text-muted-foreground">{affected.map((r) => r.label).join(" · ")}</p>
        )}
      </div>
    </div>
  )
}

function Controls({ checks }: { checks: SiteChecks }) {
  const value = (v: string[] | null) => (v === null ? "—" : v.length ? v.join(", ") : "Not mapped")
  const rows: [string, string][] = [
    ["Zoning", value(checks.controls.zoning)],
    ["Max height", value(checks.controls.height)],
    ["FSR", value(checks.controls.fsr)],
    ["Min lot size (LEP)", value(checks.controls.minLot)],
  ]
  return (
    <div className="mb-2.5">
      {checks.lot && <p className="mb-1.5 text-xs text-muted-foreground">Lot {checks.lot}</p>}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-xl border border-border p-3 text-xs">
        {rows.map(([label, v]) => (
          <div key={label} className={cn("flex justify-between gap-2", label === "Zoning" && "col-span-2")}>
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="text-right font-mono text-foreground">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function Restrictions({ checks }: { checks: ChecksState }) {
  if (checks.status === "loading") {
    return (
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        Checking NSW planning layers…
      </p>
    )
  }
  if (checks.status === "error") {
    return <p className="rounded-xl border border-border p-3 text-xs text-muted-foreground">Couldn't reach NSW planning layers.</p>
  }
  return (
    <ul className="divide-y divide-border rounded-xl border border-border">
      {checks.checks.restrictions.map((r) => (
        <RestrictionRow key={r.key} r={r} />
      ))}
    </ul>
  )
}

function RestrictionRow({ r }: { r: Restriction }) {
  const [Icon, tone, text] =
    r.status === "affected"
      ? [AlertTriangle, "text-warning", r.details.join("; ")]
      : r.status === "clear"
        ? [CheckCircle2, "text-success", "None mapped"]
        : r.key === "easement"
          ? [HelpCircle, "text-muted-foreground", "Check title (88B)"]
          : [HelpCircle, "text-muted-foreground", "Couldn't check"]
  return (
    <li className="flex items-start justify-between gap-3 px-3 py-2 text-xs">
      <span className="text-foreground">{r.label}</span>
      <span className={cn("flex items-start gap-1.5 text-right", tone)}>
        {text}
        <Icon className="mt-px size-3.5 shrink-0" />
      </span>
    </li>
  )
}

function Patterns({ lot, inLmrOrTod }: { lot: Lot; inLmrOrTod?: boolean }) {
  const fits = buildablePatterns(lot)
  const hasArea = lot.landSize !== null && lot.landSize > 0
  const widthUnchecked = fits.some((f) => f.widthUnchecked)
  const hasMidRise = fits.some((f) => f.pattern.scale === "mid-rise")

  return (
    <div>
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
          <li>Low-rise minimums are for LMR housing areas. The LEP minimum lot size is shown above, not applied.</li>
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
