"use client"

import { useState } from "react"
import { Layers, ChevronDown } from "lucide-react"
import { layerMeta } from "@/lib/mock-data"
import { useN3X7 } from "@/lib/store"
import { Checkbox } from "@/components/ui/checkbox"
import type { LayerId } from "@/lib/types"
import { cn } from "@/lib/utils"

const swatch: Record<string, string> = {
  listings: "#4aa8ff",
  lmr: "#f2c98a",
  tod: "#c39bd3",
  development: "#c084fc",
  constraints: "#f5c451",
}

export function LayerControls({ className }: { className?: string }) {
  const { layers, toggleLayer } = useN3X7()
  const [open, setOpen] = useState(false)

  return (
    <div className={cn("glass w-64 overflow-hidden rounded-xl", className)}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3.5 py-3"
      >
        <Layers className="size-4 text-primary" />
        <span className="text-sm font-medium text-foreground">
          Intelligence Layers
        </span>
        <ChevronDown
          className={cn(
            "ml-auto size-4 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <ul className="space-y-0.5 border-t border-border p-2">
          {layerMeta.map((l) => {
            const checked = layers[l.id as LayerId]
            return (
              <li key={l.id}>
                <label
                  className={cn(
                    "flex cursor-pointer items-start gap-2.5 rounded-lg p-2 transition-colors hover:bg-accent/60",
                    checked && "bg-accent/40",
                  )}
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => toggleLayer(l.id as LayerId)}
                    className="mt-0.5"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <span
                        className="size-2.5 shrink-0 rounded-[3px]"
                        style={{
                          backgroundColor: `${swatch[l.id]}33`,
                          border: `1.5px solid ${swatch[l.id]}`,
                        }}
                      />
                      {l.label}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-muted-foreground">
                      {l.description}
                    </span>
                  </span>
                </label>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
