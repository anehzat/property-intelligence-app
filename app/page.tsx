import { MapPanel } from "@/components/map-panel"
import { DiscoveryPanel } from "@/components/discovery-panel"

export default function DiscoverPage() {
  return (
    <div className="flex h-full flex-col lg:flex-row">
      <div className="h-[42vh] min-w-0 border-b border-border lg:h-full lg:flex-1 lg:border-b-0 lg:border-r">
        <MapPanel />
      </div>
      <div className="min-h-0 flex-1 lg:w-[400px] lg:flex-none">
        <DiscoveryPanel />
      </div>
    </div>
  )
}
