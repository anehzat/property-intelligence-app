"use client"

import { useEffect, useState } from "react"
import { Bath, BedDouble, Bookmark, Car, Info, LandPlot, Loader2, MapPin, Phone } from "lucide-react"
import { useN3X7 } from "@/lib/store"
import { getIdToken } from "@/lib/auth"
import { config } from "@/lib/config"
import { campaignUrl, fetchLive, isLiveCampaign, LiveError } from "@/lib/live"
import type { LiveCampaign } from "@/lib/types"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { Button, buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type CampaignState =
  | { status: "loading" }
  | { status: "ok"; campaign: LiveCampaign }
  | { status: "none" }
  | { status: "error"; message: string }

function Tile({ icon: Icon, label, value }: { icon: typeof BedDouble; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border p-3">
      <Icon className="mb-1 size-4 text-muted-foreground" />
      <p className="text-sm font-semibold text-foreground">{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  )
}

function PhoneLink({ label, name, phone }: { label: string; name: string | null; phone: string | null }) {
  if (!name && !phone) return null
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
      <div>
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className="text-sm font-medium text-foreground">{name ?? "—"}</p>
      </div>
      {phone && (
        <a href={`tel:${phone.replace(/\s+/g, "")}`} className={buttonVariants({ size: "sm", variant: "outline" })}>
          <Phone className="size-4" />
          {phone}
        </a>
      )}
    </div>
  )
}

export function LiveDrawer() {
  const { selectedLive: l, closeLive, isSaved, toggleSaveLive } = useN3X7()
  const [campaign, setCampaign] = useState<CampaignState>({ status: "loading" })

  useEffect(() => {
    if (!l) return
    let cancelled = false
    setCampaign({ status: "loading" })
    ;(async () => {
      try {
        const token = await getIdToken()
        if (!token) throw new LiveError(401, "Your session has expired. Sign in again.")
        const c = await fetchLive(campaignUrl(config.apiUrl, l.cotalityId), token, isLiveCampaign)
        if (!cancelled) setCampaign({ status: "ok", campaign: c })
      } catch (e) {
        if (cancelled) return
        if (e instanceof LiveError && e.status === 404) setCampaign({ status: "none" })
        else setCampaign({ status: "error", message: e instanceof Error ? e.message : "Couldn't load agent details." })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [l])

  return (
    <Sheet open={!!l} onOpenChange={(o) => !o && closeLive()}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto bg-background p-0 sm:!max-w-lg">
        {l && (
          <>
            <img src={l.image ?? "/placeholder.svg"} alt={l.address} className="h-60 w-full object-cover" />
            <div className="space-y-5 p-5">
              <div>
                <span className="rounded-md border border-border px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                  Live · Cotality sandbox
                </span>
                <h2 className="mt-2 text-lg font-semibold text-foreground">{l.address}</h2>
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="size-3" />
                  {l.suburb} {l.state}
                </p>
              </div>

              <div>
                <p className="font-mono text-2xl font-semibold text-foreground">{l.priceLabel ?? "Price on request"}</p>
                <p className="text-xs text-muted-foreground">
                  {[l.method, l.listedAt && `listed ${new Date(l.listedAt).toLocaleDateString("en-AU")}`]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>

              <div className="grid grid-cols-4 gap-2">
                <Tile icon={BedDouble} label="Beds" value={l.beds?.toString() ?? "—"} />
                <Tile icon={Bath} label="Baths" value={l.baths?.toString() ?? "—"} />
                <Tile icon={Car} label="Cars" value={l.parking?.toString() ?? "—"} />
                <Tile icon={LandPlot} label="Land" value={l.landSize !== null ? `${l.landSize} m²` : "—"} />
              </div>

              <div className="flex items-start gap-2 rounded-xl border border-border p-3 text-xs text-muted-foreground">
                <Info className="mt-px size-3.5 shrink-0" />
                Not scored yet. N3X7 score, frontage and LMR/TOD flags aren&apos;t available for live listings.
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground">Selling agent</h3>
                {campaign.status === "loading" && (
                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="size-3.5 animate-spin" />
                    Loading agent details…
                  </p>
                )}
                {campaign.status === "ok" && (
                  <>
                    <PhoneLink label="Agent" name={campaign.campaign.agentName} phone={campaign.campaign.agentPhone} />
                    <PhoneLink label="Agency" name={campaign.campaign.agency} phone={campaign.campaign.agencyPhone} />
                    {campaign.campaign.auctionDate && (
                      <p className="text-xs text-muted-foreground">
                        Auction {new Date(campaign.campaign.auctionDate).toLocaleDateString("en-AU")}
                      </p>
                    )}
                  </>
                )}
                {campaign.status === "none" && (
                  <p className="text-xs text-muted-foreground">
                    {[l.agentName, l.agency].filter(Boolean).join(" · ") || "No agent details available."}
                  </p>
                )}
                {campaign.status === "error" && (
                  <p role="alert" className="text-xs text-destructive">{campaign.message}</p>
                )}
              </div>

              <Button
                className="w-full"
                variant={isSaved(l.id) ? "secondary" : "outline"}
                onClick={() => toggleSaveLive(l)}
              >
                <Bookmark className={cn("size-4", isSaved(l.id) && "fill-current")} />
                {isSaved(l.id) ? "Saved" : "Save"}
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
