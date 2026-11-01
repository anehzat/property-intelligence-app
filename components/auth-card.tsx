import type { ReactNode } from "react"
import { Hexagon } from "lucide-react"

// The centred card used by the sign-in, RP Data connect and callback pages.
export function AuthCard({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="glass w-full max-w-sm space-y-5 rounded-2xl p-6">
        <div className="flex items-center gap-2">
          <Hexagon className="size-7 text-primary" fill="currentColor" />
          <span className="text-lg font-semibold">NEXT</span>
        </div>
        {children}
      </div>
    </div>
  )
}
