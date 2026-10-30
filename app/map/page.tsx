import { MapPanel } from "@/components/map-panel"
import { AISidebar } from "@/components/ai-sidebar"
import { features } from "@/lib/config"

export default function MapPage() {
  return (
    <div className="flex h-full">
      <div className="min-w-0 flex-1">
        <MapPanel />
      </div>
      {features.ai && <AISidebar className="hidden w-80 shrink-0 xl:flex" />}
    </div>
  )
}
