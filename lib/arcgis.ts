// NSW DPHI Low & Mid-Rise / TOD map service. Only `export` is enabled (no `query`).
export const LMR_MAPSERVER =
  "https://spatialportalarcgis.dpie.nsw.gov.au/sarcgis/rest/services/LMR/LMR/MapServer"

export interface BBox {
  west: number
  south: number
  east: number
  north: number
}

/** lmr → Indicative LMR Housing Area (4); tod → TOD Accelerated Rezoning (2) + TOD Area (3). */
export function planningLayerIds(on: { lmr: boolean; tod: boolean }): number[] {
  return [...(on.lmr ? [4] : []), ...(on.tod ? [2, 3] : [])]
}

export function buildExportUrl(
  bbox: BBox,
  width: number,
  height: number,
  layerIds: number[],
): string {
  const params = new URLSearchParams({
    bbox: [bbox.west, bbox.south, bbox.east, bbox.north].join(","),
    bboxSR: "4326",
    imageSR: "3857",
    size: `${Math.round(width)},${Math.round(height)}`,
    format: "png32",
    transparent: "true",
    layers: `show:${layerIds.join(",")}`,
    f: "image",
  })
  return `${LMR_MAPSERVER}/export?${params}`
}
