"use client"

import { useEffect, useMemo, useState } from "react"
import {
  MapContainer,
  Marker,
  Polygon,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet"
import L from "leaflet"
import { Crosshair, Layers, Locate, Plus, Minus } from "lucide-react"
import { MAP_CENTER, planningZones, layerMeta, properties } from "@/lib/mock-data"
import type { LiveListing, Property } from "@/lib/types"
import { useN3X7 } from "@/lib/store"
import { formatPriceShort } from "@/lib/format"
import { cn } from "@/lib/utils"
import { PlanningOverlay } from "./planning-overlay"

const layerColors: Record<string, string> = {
  lmr: "#f2c98a",
  tod: "#c39bd3",
  development: "#c084fc",
  constraints: "#f5c451",
}

const typeSvg: Record<Property["type"], string> = {
  house: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9 21v-6h6v6"/>',
  apartment:
    '<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M9 7h2M9 11h2M9 15h2M13 7h2M13 11h2M13 15h2"/>',
  development:
    '<path d="M4 21h16"/><path d="M6 21V8l6-3 6 3v13"/><path d="M9 21v-5h6v5"/><path d="M12 2v3"/>',
}

function scoreHex(score: number) {
  if (score >= 85) return "#4ade80"
  if (score >= 75) return "#4aa8ff"
  if (score >= 60) return "#f5c451"
  return "#9aa4b2"
}

function markerIcon(p: Property, active: boolean) {
  const color = scoreHex(p.score)
  const html = `
    <div style="transform: translate(-50%, -100%); position:relative; display:flex; flex-direction:column; align-items:center;">
      <div style="display:flex; align-items:center; gap:5px; padding:4px 8px 4px 5px; border-radius:999px;
        background:${active ? color : "rgba(28,33,43,0.92)"}; border:1.5px solid ${color};
        box-shadow:0 4px 14px rgba(0,0,0,0.45); backdrop-filter:blur(6px); white-space:nowrap;
        transform: scale(${active ? 1.08 : 1}); transition: transform .15s;">
        <span style="display:flex; align-items:center; justify-content:center; width:20px; height:20px; border-radius:50%; background:${color};">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none"
            stroke="#0f1319" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${typeSvg[p.type]}</svg>
        </span>
        <span style="font-family:var(--font-mono, monospace); font-size:11px; font-weight:700; color:${active ? "#0f1319" : "#fff"};">
          ${formatPriceShort(p.price)}
        </span>
        <span style="font-family:var(--font-mono, monospace); font-size:10px; font-weight:700; color:${active ? "#0f1319" : color};">
          ${p.score}
        </span>
      </div>
      <div style="width:2px; height:9px; background:${color};"></div>
    </div>`
  return L.divIcon({
    className: "n3x7-marker",
    html,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  })
}

const LIVE_COLOR = "#4aa8ff"

function liveMarkerIcon(l: LiveListing, active: boolean) {
  const label = l.price !== null ? formatPriceShort(l.price) : (l.method ?? "For sale")
  const html = `
    <div style="transform: translate(-50%, -100%); position:relative; display:flex; flex-direction:column; align-items:center;">
      <div style="display:flex; align-items:center; gap:5px; padding:4px 8px 4px 5px; border-radius:999px;
        background:${active ? LIVE_COLOR : "rgba(28,33,43,0.92)"}; border:1.5px solid ${LIVE_COLOR};
        box-shadow:0 4px 14px rgba(0,0,0,0.45); white-space:nowrap;">
        <span style="display:flex; align-items:center; justify-content:center; width:20px; height:20px; border-radius:50%; background:${LIVE_COLOR};">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none"
            stroke="#0f1319" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${typeSvg[l.type]}</svg>
        </span>
        <span style="font-family:var(--font-mono, monospace); font-size:11px; font-weight:700; color:${active ? "#0f1319" : "#fff"};">
          ${label.replace(/</g, "&lt;")}
        </span>
      </div>
      <div style="width:2px; height:9px; background:${LIVE_COLOR};"></div>
    </div>`
  return L.divIcon({ className: "n3x7-marker", html, iconSize: [0, 0], iconAnchor: [0, 0] })
}

function MapController() {
  const map = useMap()
  const { selectedId, flyTarget, selectedLive } = useN3X7()

  useEffect(() => {
    // Ensure Leaflet measures the container after layout settles.
    const t = setTimeout(() => map.invalidateSize(), 150)
    const el = map.getContainer()
    const ro = new ResizeObserver(() => map.invalidateSize())
    ro.observe(el)
    return () => {
      clearTimeout(t)
      ro.disconnect()
    }
  }, [map])

  useEffect(() => {
    if (!selectedId) return
    const p = properties.find((x) => x.id === selectedId)
    if (p) map.flyTo([p.lat, p.lng], 16, { duration: 0.8 })
  }, [map, selectedId])

  useEffect(() => {
    if (flyTarget) map.flyTo(flyTarget.center, flyTarget.zoom, { duration: 0.9 })
  }, [map, flyTarget])

  useEffect(() => {
    if (selectedLive) map.flyTo([selectedLive.lat, selectedLive.lng], 16, { duration: 0.8 })
  }, [map, selectedLive])
  return null
}

function MapControls() {
  const map = useMap()
  return (
    <div className="absolute top-4 right-4 z-[500] flex flex-col gap-2">
      <div className="glass flex flex-col overflow-hidden rounded-xl">
        <button
          onClick={() => map.zoomIn()}
          className="flex size-9 items-center justify-center text-foreground transition-colors hover:bg-accent"
          aria-label="Zoom in"
        >
          <Plus className="size-4" />
        </button>
        <div className="h-px bg-border" />
        <button
          onClick={() => map.zoomOut()}
          className="flex size-9 items-center justify-center text-foreground transition-colors hover:bg-accent"
          aria-label="Zoom out"
        >
          <Minus className="size-4" />
        </button>
      </div>
      <button
        onClick={() => map.flyTo(MAP_CENTER, 15, { duration: 0.8 })}
        className="glass flex size-9 items-center justify-center rounded-xl text-foreground transition-colors hover:bg-accent"
        aria-label="Recenter on search area"
        title="Search location"
      >
        <Crosshair className="size-4 text-primary" />
      </button>
      <button
        onClick={() => map.locate({ setView: true, maxZoom: 16 })}
        className="glass flex size-9 items-center justify-center rounded-xl text-foreground transition-colors hover:bg-accent"
        aria-label="Use current location"
        title="Current location"
      >
        <Locate className="size-4" />
      </button>
    </div>
  )
}

function MapLegend({
  overlayStatus,
}: {
  overlayStatus: "loading" | "ok" | "error"
}) {
  const { layers } = useN3X7()
  const [showLegend, setShowLegend] = useState(true)
  const legendItems = layerMeta.filter(
    (l) => layers[l.id as keyof typeof layers],
  )

  return (
    <div className="absolute bottom-4 left-4 z-[500]">
      {showLegend ? (
        <div className="glass w-56 rounded-xl p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-foreground uppercase">
              <Layers className="size-3.5 text-primary" />
              Map Legend
            </span>
            <button
              onClick={() => setShowLegend(false)}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Hide legend"
            >
              <Minus className="size-3.5" />
            </button>
          </div>
          <ul className="space-y-1.5">
            {legendItems.map((l) => (
              <li
                key={l.id}
                className="flex items-center gap-2 text-xs text-muted-foreground"
              >
                <span
                  className="size-3 shrink-0 rounded-[4px]"
                  style={{
                    backgroundColor:
                      l.id === "listings"
                        ? "transparent"
                        : `${layerColors[l.id]}33`,
                    border: `1.5px solid ${l.id === "listings" ? "#4aa8ff" : layerColors[l.id]}`,
                  }}
                />
                {l.label}
              </li>
            ))}
          </ul>
          {(layers.lmr || layers.tod) && (
            <p
              className={cn(
                "mt-2 border-t border-border pt-2 text-[10px]",
                overlayStatus === "error" ? "text-warning" : "text-muted-foreground",
              )}
            >
              {overlayStatus === "error"
                ? "Live NSW layer unavailable — showing listings only"
                : "LMR / TOD source: NSW DPHI ArcGIS (live)"}
            </p>
          )}
        </div>
      ) : (
        <button
          onClick={() => setShowLegend(true)}
          className="glass flex size-9 items-center justify-center rounded-xl text-foreground hover:bg-accent"
          aria-label="Show legend"
        >
          <Layers className="size-4 text-primary" />
        </button>
      )}
    </div>
  )
}

export default function PropertyMap() {
  const {
    layers,
    openProperty,
    selectedId,
    filteredProperties,
    dataSource,
    live,
    openLive,
    selectedLive,
  } = useN3X7()
  const [overlayStatus, setOverlayStatus] = useState<"loading" | "ok" | "error">(
    "loading",
  )

  const visibleZones = useMemo(
    () => planningZones.filter((z) => layers[z.layer]),
    [layers],
  )

  return (
    <div className="relative h-full w-full">
      <MapContainer
        center={MAP_CENTER}
        zoom={15}
        zoomControl={false}
        className="h-full w-full"
        attributionControl
      >
        {/* CARTO basemaps now require an API key; Esri Dark Gray Canvas is keyless. */}
        <TileLayer
          url="https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
          attribution="Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors"
          maxNativeZoom={16}
          maxZoom={19}
        />
        <TileLayer
          url="https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}"
          maxNativeZoom={16}
          maxZoom={19}
          zIndex={2}
        />
        <PlanningOverlay onStatus={setOverlayStatus} />

        {visibleZones.map((zone) => (
          <Polygon
            key={zone.id}
            positions={zone.polygon}
            pathOptions={{
              color: layerColors[zone.layer],
              fillColor: layerColors[zone.layer],
              fillOpacity: 0.14,
              weight: 1.5,
              dashArray: zone.layer === "constraints" ? "6 5" : undefined,
            }}
          >
            <Tooltip sticky className="!border-0 !bg-transparent !p-0 !shadow-none">
              <span className="rounded-md bg-popover px-2 py-1 text-xs font-medium text-popover-foreground ring-1 ring-border">
                {zone.name}
              </span>
            </Tooltip>
          </Polygon>
        ))}

        {layers.listings &&
          dataSource === "demo" &&
          filteredProperties.map((p) => (
            <Marker
              key={p.id}
              position={[p.lat, p.lng]}
              icon={markerIcon(p, selectedId === p.id)}
              eventHandlers={{ click: () => openProperty(p.id) }}
            >
              <Popup>
                <div className="min-w-44 space-y-1">
                  <p className="text-sm font-semibold text-foreground">
                    {p.address}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {p.suburb} {p.state}
                  </p>
                  <div className="flex items-center justify-between pt-1">
                    <span className="font-mono text-sm font-semibold text-foreground">
                      {formatPriceShort(p.price)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {p.beds} bed
                    </span>
                    <span
                      className="font-mono text-xs font-bold"
                      style={{ color: scoreHex(p.score) }}
                    >
                      {p.score}/100
                    </span>
                  </div>
                  <button
                    onClick={() => openProperty(p.id)}
                    className="mt-1 w-full rounded-md bg-primary py-1 text-xs font-medium text-primary-foreground"
                  >
                    View details
                  </button>
                </div>
              </Popup>
            </Marker>
          ))}

        {layers.listings &&
          dataSource === "live" &&
          live.listings.map((l) => (
            <Marker
              key={l.id}
              position={[l.lat, l.lng]}
              icon={liveMarkerIcon(l, selectedLive?.id === l.id)}
              eventHandlers={{ click: () => openLive(l) }}
            />
          ))}

        <MapController />
        <MapControls />
        <MapLegend overlayStatus={overlayStatus} />
      </MapContainer>
    </div>
  )
}
