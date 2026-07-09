import type { Opportunity, PropertyType } from "./types"

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
