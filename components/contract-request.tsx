"use client"

import { useState } from "react"
import { CheckCircle2, FileText, Loader2, Mail, Phone } from "lucide-react"
import type { Property } from "@/lib/types"
import { useN3X7 } from "@/lib/store"
import { formatRelative } from "@/lib/format"
import { Button } from "@/components/ui/button"

export function ContractRequestPanel({ property: p }: { property: Property }) {
  const { user, contractRequests, requestContract } = useN3X7()
  const request = contractRequests[p.id]
  const [open, setOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState(
    `Hi ${p.agent.name.split(" ")[0]}, please send through the contract of sale for ${p.address}, ${p.suburb}. Thanks, ${user?.name ?? ""}`,
  )

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSending(true)
    await requestContract(p.id, message)
    setSending(false)
    setOpen(false)
  }

  return (
    <div>
      <h3 className="mb-2.5 text-sm font-semibold text-foreground">Selling agent</h3>
      <div className="glass rounded-xl p-3">
        <p className="text-sm font-medium text-foreground">{p.agent.name}</p>
        <p className="text-xs text-muted-foreground">{p.agent.agency}</p>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Phone className="size-3" /> {p.agent.phone}
          </span>
          <span className="flex items-center gap-1">
            <Mail className="size-3" /> {p.agent.email}
          </span>
        </div>
      </div>

      {request ? (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-success/30 bg-success/10 p-3 text-xs text-foreground">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
          <span>
            Contract requested from {p.agent.name} ·{" "}
            {formatRelative(request.requestedAt)}. Saved to your watchlist.
          </span>
        </div>
      ) : open ? (
        <form onSubmit={submit} className="mt-3 space-y-2.5">
          <p className="text-xs text-muted-foreground">
            To <span className="text-foreground">{p.agent.email}</span> · from{" "}
            <span className="text-foreground">{user?.email}</span>
          </p>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            aria-label="Message to agent"
            className="w-full resize-none rounded-lg border border-border bg-card/60 p-2.5 text-sm text-foreground outline-none focus:border-primary/60"
          />
          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={sending}
            >
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={sending}>
              {sending ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
              {sending ? "Sending…" : "Send request"}
            </Button>
          </div>
        </form>
      ) : (
        <Button
          variant="outline"
          className="mt-3 w-full"
          onClick={() => setOpen(true)}
          disabled={p.status === "sold"}
        >
          <FileText className="size-4" />
          {p.status === "sold" ? "Sold — contract unavailable" : "Request contract"}
        </Button>
      )}
    </div>
  )
}
