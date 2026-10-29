"use client"

import { useN3X7 } from "@/lib/store"
import { cn } from "@/lib/utils"
import { features } from "@/lib/config"

export function SourceSwitch() {
  const { dataSource, setDataSource } = useN3X7()
  const options = [
    { id: "demo", label: "Demo listings" },
    { id: "live", label: "Live · Cotality" },
  ] as const
  if (!features.demo) return null
  return (
    <div className="flex rounded-lg border border-border p-0.5" role="group" aria-label="Data source">
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => setDataSource(o.id)}
          aria-pressed={dataSource === o.id}
          className={cn(
            "rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
            dataSource === o.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
