"use client"

import { useEffect, type ReactNode } from "react"
import { usePathname, useRouter } from "next/navigation"
import { useN3X7 } from "@/lib/store"
import { isLoginPath, isRpDataPath } from "@/lib/paths"
import { Button } from "@/components/ui/button"
import { AuthCard } from "./auth-card"
import { Sidebar } from "./sidebar"
import { TopHeader } from "./top-header"
import { PropertyDrawer } from "./property-drawer"
import { LiveDrawer } from "./live-drawer"

export function AppShell({ children }: { children: ReactNode }) {
  const { user, hydrated, rpdata, rpdataError, refreshRpData, signOut } = useN3X7()
  const pathname = usePathname()
  const router = useRouter()
  const isLogin = isLoginPath(pathname)
  const isRpData = isRpDataPath(pathname)
  const isConnectPage = pathname.replace(/\/+$/, "") === "/connect-rpdata"

  useEffect(() => {
    if (!hydrated) return
    if (!user && !isLogin) router.replace("/login")
    else if (user && isLogin) router.replace("/")
    else if (user && rpdata === "unlinked" && !isRpData) router.replace("/connect-rpdata/")
    else if (user && isConnectPage && (rpdata === "linked" || rpdata === "disabled")) router.replace("/")
  }, [hydrated, user, isRpData, isLogin, isConnectPage, rpdata, router])

  if (isLogin) return <>{children}</>
  // Hold a blank frame until the stored session is read, to avoid flashing the app or login.
  if (!hydrated || !user) return <div className="h-dvh w-full bg-background" />

  // Hold the blank frame only while the first status request is in flight.
  if (rpdata === "unknown") {
    if (!rpdataError) return <div className="h-dvh w-full bg-background" />
    return (
      <AuthCard>
        <p role="alert" className="text-sm text-foreground">
          {rpdataError}
        </p>
        <Button className="w-full" onClick={() => void refreshRpData()}>
          Retry
        </Button>
        <button
          type="button"
          onClick={signOut}
          className="block text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          Sign out
        </button>
      </AuthCard>
    )
  }

  if (isRpData) return <>{children}</>

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
