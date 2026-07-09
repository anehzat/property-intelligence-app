"use client"

import { ScrollArea } from "@/components/ui/scroll-area"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { alerts as seedAlerts } from "@/lib/mock-data"
import type { AlertItem } from "@/lib/types"
import { useState } from "react"
import { Bell, MapPinned, FileText, Home, Plus } from "lucide-react"

const categoryMeta: Record<
  AlertItem["category"],
  { label: string; icon: typeof Bell; color: string }
> = {
  zoning: { label: "Zoning", icon: MapPinned, color: "text-chart-4" },
  planning: { label: "Planning", icon: FileText, color: "text-primary" },
  listing: { label: "Listing", icon: Home, color: "text-chart-2" },
}

export default function AlertsPage() {
  const [items, setItems] = useState<AlertItem[]>(seedAlerts)

  function toggle(id: string) {
    setItems((prev) =>
      prev.map((a) => (a.id === id ? { ...a, active: !a.active } : a)),
    )
  }

  const activeCount = items.filter((a) => a.active).length

  return (
    <ScrollArea className="h-full">
      <div className="mx-auto max-w-4xl px-6 py-8">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-balance text-2xl font-semibold tracking-tight">
              Alerts &amp; Monitoring
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {activeCount} active alerts watching planning changes, rezonings and new listings.
            </p>
          </div>
          <Button size="sm" className="gap-2">
            <Plus className="size-4" />
            New Alert
          </Button>
        </div>

        <div className="flex flex-col gap-3">
          {items.map((alert) => {
            const meta = categoryMeta[alert.category]
            const Icon = meta.icon
            return (
              <Card
                key={alert.id}
                className="flex items-start gap-4 p-4"
              >
                <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/40">
                  <Icon className={`size-5 ${meta.color}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-medium">{alert.title}</h3>
                    <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                      {meta.label}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {alert.description}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>Frequency: {alert.frequency}</span>
                    <span>Last triggered: {alert.lastTriggered}</span>
                  </div>
                </div>
                <Switch
                  checked={alert.active}
                  onCheckedChange={() => toggle(alert.id)}
                  aria-label={`Toggle ${alert.title}`}
                />
              </Card>
            )
          })}
        </div>
      </div>
    </ScrollArea>
  )
}
