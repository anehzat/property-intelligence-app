"use client"

import type { ReactNode } from "react"
import { Sidebar } from "./sidebar"
import { TopHeader } from "./top-header"
import { PropertyDrawer } from "./property-drawer"

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background text-foreground">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopHeader />
        <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
      </div>
      <PropertyDrawer />
    </div>
  )
}
