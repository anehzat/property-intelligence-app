"use client"

import dynamic from "next/dynamic"
import { LayerControls } from "./layer-controls"

const PropertyMap = dynamic(() => import("./property-map"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <div className="size-6 animate-spin rounded-full border-2 border-border border-t-primary" />
        <span className="text-sm">Loading planning intelligence…</span>
      </div>
    </div>
  ),
})

export function MapPanel() {
  return (
    <div className="relative h-full w-full">
      <PropertyMap />
      <div className="absolute top-4 left-4 z-[500]">
        <LayerControls />
      </div>
    </div>
  )
}
