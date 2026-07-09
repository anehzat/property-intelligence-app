import { MapPanel } from "@/components/map-panel"
import { AISidebar } from "@/components/ai-sidebar"

export default function MapPage() {
  return (
    <div className="flex h-full">
      <div className="min-w-0 flex-1">
        <MapPanel />
      </div>
      <AISidebar className="hidden w-80 shrink-0 xl:flex" />
    </div>
  )
}
