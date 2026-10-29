"use client"

import { useEffect, type ReactNode } from "react"
import { usePathname, useRouter } from "next/navigation"
import { useN3X7 } from "@/lib/store"
import { isLoginPath } from "@/lib/paths"
import { Sidebar } from "./sidebar"
import { TopHeader } from "./top-header"
import { PropertyDrawer } from "./property-drawer"
import { LiveDrawer } from "./live-drawer"

export function AppShell({ children }: { children: ReactNode }) {
  const { user, hydrated } = useN3X7()
  const pathname = usePathname()
  const router = useRouter()
  const isLogin = isLoginPath(pathname)

  useEffect(() => {
    if (!hydrated) return
    if (!user && !isLogin) router.replace("/login")
    if (user && isLogin) router.replace("/")
  }, [hydrated, user, isLogin, router])

  if (isLogin) return <>{children}</>
  // Hold a blank frame until the stored session is read, to avoid flashing the app or login.
  if (!hydrated || !user) return <div className="h-dvh w-full bg-background" />

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background text-foreground">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopHeader />
        <main className="isolate min-h-0 flex-1 overflow-hidden">{children}</main>
      </div>
      <PropertyDrawer />
      <LiveDrawer />
    </div>
  )
}
