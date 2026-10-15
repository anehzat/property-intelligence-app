"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Hexagon, Loader2 } from "lucide-react"
import { useN3X7 } from "@/lib/store"
import { DEMO_USER } from "@/lib/mock-data"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export default function LoginPage() {
  const { signIn } = useN3X7()
  const router = useRouter()
  const [email, setEmail] = useState(DEMO_USER.email)
  const [password, setPassword] = useState(DEMO_USER.password)
  const [busy, setBusy] = useState(false)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const value = email.trim()
    if (!value) return
    setBusy(true)
    setTimeout(() => {
      signIn(value)
      router.replace("/")
    }, 500)
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <form onSubmit={submit} className="glass w-full max-w-sm space-y-5 rounded-2xl p-6">
        <div className="flex items-center gap-2">
          <Hexagon className="size-7 text-primary" fill="currentColor" />
          <span className="text-lg font-semibold">
            N3X7<span className="text-primary">.bot</span>
          </span>
        </div>
        <div>
          <h1 className="text-xl font-semibold text-foreground">Staff sign in</h1>
          <p className="text-sm text-muted-foreground">
            AI property intelligence for acquisitions teams.
          </p>
        </div>
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">Email</span>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">Password</span>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </label>
        <Button type="submit" className="w-full" disabled={busy}>
          {busy && <Loader2 className="size-4 animate-spin" />}
          Sign in
        </Button>
        <p className="text-center text-[11px] text-muted-foreground">
          Demo environment — any credentials are accepted.
        </p>
      </form>
    </div>
  )
}
