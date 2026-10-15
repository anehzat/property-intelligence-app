"use client"

import { useEffect, useState } from "react"
import { ImageOverlay, useMap, useMapEvents } from "react-leaflet"
import type { LatLngBoundsExpression, Map as LeafletMap } from "leaflet"
import { buildExportUrl, planningLayerIds, type BBox } from "@/lib/arcgis"
import { useN3X7 } from "@/lib/store"

interface Frame {
  bbox: BBox
  width: number
  height: number
  bounds: LatLngBoundsExpression
}

interface Shot {
  url: string
  bounds: LatLngBoundsExpression
}

type Status = "ok" | "error"

function frameFor(map: LeafletMap): Frame | null {
  const size = map.getSize()
  if (size.x === 0 || size.y === 0) return null
  const b = map.getBounds()
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  return {
    bbox: { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() },
    width: Math.min(size.x * dpr, 4096),
    height: Math.min(size.y * dpr, 4096),
    bounds: [
      [b.getSouth(), b.getWest()],
      [b.getNorth(), b.getEast()],
    ],
  }
}

/**
 * One NSW layer group, double-buffered: the image for a new view loads invisibly and only
 * replaces the visible one once loaded, so a stale image is never stretched over a new view.
 */
function LiveLayer({
  frame,
  ids,
  opacity,
  zIndex,
  onStatus,
}: {
  frame: Frame
  ids: number[]
  opacity: number
  zIndex: number
  onStatus: (status: Status) => void
}) {
  const next: Shot = {
    url: buildExportUrl(frame.bbox, frame.width, frame.height, ids),
    bounds: frame.bounds,
  }
  const [shown, setShown] = useState<Shot | null>(null)

  return (
    <>
      {shown && (
        <ImageOverlay
          key={`shown:${shown.url}`}
          url={shown.url}
          bounds={shown.bounds}
          opacity={opacity}
          zIndex={zIndex}
        />
      )}
      {shown?.url !== next.url && (
        <ImageOverlay
          key={`next:${next.url}`}
          url={next.url}
          bounds={next.bounds}
          opacity={0}
          zIndex={zIndex}
          eventHandlers={{
            load: () => {
              setShown(next)
              onStatus("ok")
            },
            error: () => onStatus("error"),
          }}
        />
      )}
    </>
  )
}

/** Live NSW LMR/TOD layers rendered from the ArcGIS export endpoint for the current view. */
export function PlanningOverlay({
  onStatus,
}: {
  onStatus: (status: Status) => void
}) {
  const map = useMap()
  const { layers } = useN3X7()
  const [frame, setFrame] = useState<Frame | null>(null)

  useEffect(() => {
    setFrame(frameFor(map))
  }, [map])

  useMapEvents({
    moveend: () => setFrame(frameFor(map)),
    resize: () => setFrame(frameFor(map)),
  })

  if (!frame) return null
  // LMR and TOD are separate images so the TOD parcels stay legible on top of LMR.
  const groups = [
    { key: "lmr", ids: planningLayerIds({ lmr: layers.lmr, tod: false }), opacity: 0.4, zIndex: 240 },
    { key: "tod", ids: planningLayerIds({ lmr: false, tod: layers.tod }), opacity: 0.85, zIndex: 260 },
  ]

  return (
    <>
      {groups
        .filter((g) => g.ids.length > 0)
        .map((g) => (
          <LiveLayer
            key={g.key}
            frame={frame}
            ids={g.ids}
            opacity={g.opacity}
            zIndex={g.zIndex}
            onStatus={onStatus}
          />
        ))}
    </>
  )
}
