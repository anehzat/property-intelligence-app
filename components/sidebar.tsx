"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Bell,
  Bookmark,
  Compass,
  Hexagon,
  Map as MapIcon,
  Settings,
  Sparkles,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useN3X7 } from "@/lib/store"

const nav = [
  { label: "Discover", href: "/", icon: Compass },
  { label: "Map", href: "/map", icon: MapIcon },
  { label: "Saved Properties", href: "/saved", icon: Bookmark },
  { label: "AI Analyst", href: "/analyst", icon: Sparkles },
  { label: "Alerts", href: "/alerts", icon: Bell },
  { label: "Settings", href: "/settings", icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()
  const { savedIds } = useN3X7()

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
      <div className="flex h-16 items-center gap-2.5 px-5">
        <div className="relative flex size-9 items-center justify-center">
          <Hexagon className="size-9 text-primary" fill="currentColor" />
          <span className="absolute font-mono text-[11px] font-bold text-primary-foreground">
            N3
          </span>
        </div>
        <div className="leading-none">
          <span className="text-[15px] font-semibold tracking-tight text-sidebar-foreground">
            NEXT
          </span>
          <p className="mt-1 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
            Property Intelligence
          </p>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3 py-4">
        {nav.map(({ label, href, icon: Icon }) => {
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
              )}
            >
              <Icon
                className={cn(
                  "size-4.5 transition-colors",
                  active
                    ? "text-primary"
                    : "text-muted-foreground group-hover:text-sidebar-foreground",
                )}
              />
              <span>{label}</span>
              {label === "Saved Properties" && savedIds.length > 0 && (
                <span className="ml-auto rounded-full bg-primary/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-primary">
                  {savedIds.length}
                </span>
              )}
              {label === "Alerts" && (
                <span className="ml-auto size-1.5 rounded-full bg-success" />
              )}
            </Link>
          )
        })}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <div className="glass flex items-center gap-3 rounded-xl p-3">
          <div className="flex size-8 items-center justify-center rounded-lg bg-ai/15">
            <Sparkles className="size-4 text-ai" />
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="text-xs font-medium text-sidebar-foreground">
              Pro Intelligence
            </p>
            <p className="truncate text-[11px] text-muted-foreground">
              Live planning data active
            </p>
          </div>
        </div>
      </div>
    </aside>
  )
}
