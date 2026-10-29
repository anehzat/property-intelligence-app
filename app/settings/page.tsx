"use client"

import { ScrollArea } from "@/components/ui/scroll-area"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { useN3X7 } from "@/lib/store"

function Row({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-4">
      <div className="min-w-0">
        <p className="font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  )
}

export default function SettingsPage() {
  const { user } = useN3X7()

  return (
    <ScrollArea className="h-full">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="text-balance text-2xl font-semibold tracking-tight">
          Settings
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your workspace, data sources and investment preferences.
        </p>

        <Card className="mt-6 p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Profile
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" htmlFor="name">
                Full name
              </label>
              <Input id="name" defaultValue={user?.name} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" htmlFor="email">
                Email
              </label>
              <Input id="email" type="email" defaultValue={user?.email} />
            </div>
          </div>
        </Card>

        <Card className="mt-6 p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Investment preferences
          </h2>
          <div className="mt-2 divide-y divide-border">
            <Row
              title="Target markets"
              description="Suburbs and regions the AI prioritises when surfacing opportunities."
            >
              <div className="flex gap-1.5">
                <Badge variant="secondary">Eastern Suburbs</Badge>
                <Badge variant="secondary">Inner West</Badge>
              </div>
            </Row>
            <Row
              title="Development focus"
              description="Weight scores toward sites with rezoning and uplift potential."
            >
              <Switch defaultChecked />
            </Row>
            <Row
              title="Risk tolerance"
              description="Include higher-risk emerging opportunities in results."
            >
              <Switch />
            </Row>
          </div>
        </Card>

        <Card className="mt-6 p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Data sources
          </h2>
          <div className="mt-2 divide-y divide-border">
            <Row
              title="NSW Planning Portal"
              description="Live zoning, LMR and TOD precinct data."
            >
              <Badge className="bg-chart-2/15 text-chart-2">Connected</Badge>
            </Row>
            <Row
              title="Listings feed"
              description="Real-time on-market and off-market listings."
            >
              <Badge className="bg-chart-2/15 text-chart-2">Connected</Badge>
            </Row>
            <Row
              title="Valuation model"
              description="Cotality automated valuation and comparable sales."
            >
              <Badge variant="outline">Beta</Badge>
            </Row>
          </div>
        </Card>

        <Separator className="my-8" />

        <div className="flex justify-end gap-3">
          <Button variant="outline">Cancel</Button>
          <Button>Save changes</Button>
        </div>
      </div>
    </ScrollArea>
  )
}
