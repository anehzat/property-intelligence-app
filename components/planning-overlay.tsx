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
 * Live NSW LMR/TOD layers rendered from the ArcGIS export endpoint for the current view.
 * LMR and TOD are separate images so the TOD parcels stay legible on top of LMR.
 */
export function PlanningOverlay({
  onStatus,
}: {
  onStatus: (status: "ok" | "error") => void
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
  const groups = [
    { key: "lmr", ids: planningLayerIds({ lmr: layers.lmr, tod: false }), opacity: 0.4, zIndex: 240 },
    { key: "tod", ids: planningLayerIds({ lmr: false, tod: layers.tod }), opacity: 0.85, zIndex: 260 },
  ]

  return (
    <>
      {groups
        .filter((g) => g.ids.length > 0)
        .map((g) => (
          <ImageOverlay
            key={g.key}
            url={buildExportUrl(frame.bbox, frame.width, frame.height, g.ids)}
            bounds={frame.bounds}
            opacity={g.opacity}
            zIndex={g.zIndex}
            eventHandlers={{
              load: () => onStatus("ok"),
              error: () => onStatus("error"),
            }}
          />
        ))}
    </>
  )
}
