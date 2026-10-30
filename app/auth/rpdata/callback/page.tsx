"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { useN3X7 } from "@/lib/store"
import { callbackOutcome, RPDATA_CALLBACK_PATH, RPDATA_STATE_KEY } from "@/lib/rpdata"
import { AuthCard } from "@/components/auth-card"

const failPath = (error: string) => `/connect-rpdata/?error=${error}`

export default function RpDataCallbackPage() {
  const { connectRpData } = useN3X7()
  const router = useRouter()
  // The code is single-use, so Strict Mode's second effect run must not send it again.
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    const outcome = callbackOutcome(window.location.search, sessionStorage.getItem(RPDATA_STATE_KEY))
    sessionStorage.removeItem(RPDATA_STATE_KEY)
    // Take the code out of the URL before it is sent anywhere.
    window.history.replaceState(null, "", RPDATA_CALLBACK_PATH)
    if (!outcome.ok) {
      router.replace(failPath(outcome.error))
      return
    }
    void connectRpData(outcome.code).then((r) => {
      router.replace(r.ok ? "/" : failPath(r.error))
    })
  }, [connectRpData, router])

  return (
    <AuthCard>
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Connecting your RP Data account…
      </div>
    </AuthCard>
  )
}
