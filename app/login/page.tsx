"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Eye, EyeOff, Hexagon, Loader2 } from "lucide-react"
import { useN3X7 } from "@/lib/store"
import type { SignInResult } from "@/lib/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

const END_USER_TERMS_URL = "https://www.corelogic.com.au/endusertermsconditions"

// A password field with a show/hide toggle.
function PasswordInput(props: Omit<React.ComponentProps<typeof Input>, "type">) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="relative">
      <Input {...props} type={visible ? "text" : "password"} className="pr-9" />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted-foreground hover:text-foreground"
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  )
}

// Display Requirements for CoreLogic Enabled Applications, 4.1 Australian Copyright Notice.
function CopyrightNotice() {
  return (
    <Dialog>
      <DialogTrigger type="button" className="text-primary underline underline-offset-2">
        copyright notice
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Copyright notice</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm text-muted-foreground">
          <p>
            This publication reproduces materials and content owned or licenced by RP Data Pty Ltd
            trading as CoreLogic Asia Pacific (CoreLogic) and may include data, statistics,
            estimates, indices, photographs, maps, tools, calculators (including their outputs),
            commentary, reports and other information (CoreLogic Data).
          </p>
          <p>
            © Copyright {new Date().getFullYear()}. CoreLogic and its licensors are the sole and
            exclusive owners of all rights, title and interest (including intellectual property
            rights) the CoreLogic Data contained in this publication. All rights reserved.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default function LoginPage() {
  const { signIn, completeNewPassword } = useN3X7()
  const router = useRouter()
  const [step, setStep] = useState<"sign-in" | "new-password">("sign-in")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [acceptedCopyright, setAcceptedCopyright] = useState(false)
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const canSignIn = acceptedCopyright && acceptedTerms

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
            NEXT
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
              <PasswordInput
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </label>
            <div className="space-y-3">
              <label className="flex items-start gap-2.5 text-xs text-muted-foreground">
                <Checkbox
                  className="mt-0.5"
                  checked={acceptedCopyright}
                  onCheckedChange={(v) => setAcceptedCopyright(v === true)}
                />
                <span>
                  I acknowledge the Cotality (formerly CoreLogic) <CopyrightNotice />.
                </span>
              </label>
              <label className="flex items-start gap-2.5 text-xs text-muted-foreground">
                <Checkbox
                  className="mt-0.5"
                  checked={acceptedTerms}
                  onCheckedChange={(v) => setAcceptedTerms(v === true)}
                />
                <span>
                  I have read and accept Cotality&apos;s (formerly CoreLogic){" "}
                  <a
                    href={END_USER_TERMS_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline underline-offset-2"
                  >
                    End User Terms
                  </a>{" "}
                  for the access and use of the Product Data.
                </span>
              </label>
            </div>
          </>
        ) : (
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">New password</span>
            <PasswordInput
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
        <Button type="submit" className="w-full" disabled={busy || (step === "sign-in" && !canSignIn)}>
          {busy && <Loader2 className="size-4 animate-spin" />}
          {step === "sign-in" ? "Sign in" : "Save password"}
        </Button>
      </form>
    </div>
  )
}
