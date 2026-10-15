import type { ListingStatus, Opportunity, PropertyType } from "./types"

export function formatPrice(n: number) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(n)
}

export function formatPriceShort(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, "")}m`
  if (n >= 1_000) return `$${Math.round(n / 1_000)}k`
  return `$${n}`
}

export const opportunityStyle: Record<
  Opportunity,
  { text: string; className: string; dot: string }
> = {
  "HIGH POTENTIAL": {
    text: "High Potential",
    className: "bg-success/12 text-success",
    dot: "bg-success",
  },
  MODERATE: {
    text: "Moderate",
    className: "bg-primary/12 text-primary",
    dot: "bg-primary",
  },
  EMERGING: {
    text: "Emerging",
    className: "bg-warning/12 text-warning",
    dot: "bg-warning",
  },
  STABLE: {
    text: "Stable",
    className: "bg-muted text-muted-foreground",
    dot: "bg-muted-foreground",
  },
}

export const typeLabel: Record<PropertyType, string> = {
  house: "House",
  apartment: "Apartment",
  development: "Development",
}

export const statusLabel: Record<ListingStatus, string> = {
  "for-sale": "For sale",
  "under-offer": "Under offer",
  sold: "Sold",
}

export function formatRelative(iso: string, now: number = Date.now()): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000))
  if (s < 60) return "just now"
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.round(h / 24)
  return `${d} day${d === 1 ? "" : "s"} ago`
}
