import { AISidebar } from "@/components/ai-sidebar"
import { DiscoveryPanel } from "@/components/discovery-panel"

export default function AnalystPage() {
  return (
    <div className="flex h-full">
      <div className="min-w-0 flex-1 border-r border-border">
        <AISidebar className="border-l-0" />
      </div>
      <div className="hidden w-[380px] shrink-0 lg:block">
        <DiscoveryPanel />
      </div>
    </div>
  )
}
