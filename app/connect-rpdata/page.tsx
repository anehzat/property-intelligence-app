"use client"

import { useEffect, useState } from "react"
import { useN3X7 } from "@/lib/store"
import { config } from "@/lib/config"
import { authorizeUrl, newState, redirectUriFor, rpdataErrorMessage, RPDATA_STATE_KEY } from "@/lib/rpdata"
import { Button } from "@/components/ui/button"
import { AuthCard } from "@/components/auth-card"

export default function ConnectRpDataPage() {
  const { signOut } = useN3X7()
  const [error, setError] = useState<string | null>(null)

  // The callback page passes a failure key; only known keys map to a fixed message.
  useEffect(() => {
    setError(rpdataErrorMessage(new URLSearchParams(window.location.search).get("error")))
  }, [])

  function connect() {
    const state = newState()
    sessionStorage.setItem(RPDATA_STATE_KEY, state)
    window.location.href = authorizeUrl(
      config.rpdataAuthUrl,
      config.rpdataClientId,
      redirectUriFor(window.location.origin),
      state,
    )
  }

  return (
    <AuthCard>
      <div>
        <h1 className="text-xl font-semibold text-foreground">Connect your RP Data account</h1>
        <p className="text-sm text-muted-foreground">
          N3X7 uses your own RP Data account to access Cotality data. You&apos;ll sign in on
          Cotality&apos;s page once; after that N3X7 keeps you connected.
        </p>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button className="w-full" onClick={connect}>
        Connect RP Data
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
