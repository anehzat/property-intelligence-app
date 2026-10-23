"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Hexagon, Loader2 } from "lucide-react"
import { useN3X7 } from "@/lib/store"
import type { SignInResult } from "@/lib/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export default function LoginPage() {
  const { signIn, completeNewPassword } = useN3X7()
  const router = useRouter()
  const [step, setStep] = useState<"sign-in" | "new-password">("sign-in")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function handle(r: SignInResult) {
    if (r.status === "ok") router.replace("/")
    else if (r.status === "new-password-required") setStep("new-password")
    else setError(r.message)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      handle(
        step === "sign-in"
          ? await signIn(email.trim(), password)
          : await completeNewPassword(newPassword),
      )
    } finally {
      setBusy(false)
    }
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
          <h1 className="text-xl font-semibold text-foreground">
            {step === "sign-in" ? "Staff sign in" : "Set a new password"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {step === "sign-in"
              ? "AI property intelligence for acquisitions teams."
              : "Choose a password of at least 12 characters with upper and lower case letters, a number and a symbol."}
          </p>
        </div>
        {step === "sign-in" ? (
          <>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Email</span>
              <Input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Password</span>
              <Input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </label>
          </>
        ) : (
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">New password</span>
            <Input
              type="password"
              required
              minLength={12}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
            />
          </label>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy && <Loader2 className="size-4 animate-spin" />}
          {step === "sign-in" ? "Sign in" : "Save password"}
        </Button>
      </form>
    </div>
  )
}
