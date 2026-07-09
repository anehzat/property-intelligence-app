"use client"

import { useEffect, useRef, useState } from "react"
import { ArrowUp, Hexagon, Sparkles } from "lucide-react"
import { useN3X7 } from "@/lib/store"
import { suggestedPrompts } from "@/lib/mock-data"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

export function AISidebar({ className }: { className?: string }) {
  const { chat, askAi, selectedProperty } = useN3X7()
  const [input, setInput] = useState("")
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [chat])

  function send(value: string) {
    const q = value.trim()
    if (!q) return
    askAi(q)
    setInput("")
  }

  return (
    <div
      className={cn(
        "flex h-full flex-col border-l border-border bg-sidebar",
        className,
      )}
    >
      <div className="flex shrink-0 items-center gap-2.5 border-b border-border px-4 py-3.5">
        <div className="flex size-8 items-center justify-center rounded-lg bg-ai/15">
          <Sparkles className="size-4 text-ai" />
        </div>
        <div className="leading-tight">
          <h2 className="text-sm font-semibold text-foreground">Ask N3X7</h2>
          <p className="text-[11px] text-muted-foreground">
            {selectedProperty
              ? `Context: ${selectedProperty.address}`
              : "AI Property Analyst"}
          </p>
        </div>
        <span className="ml-auto flex items-center gap-1.5 rounded-full bg-success/12 px-2 py-1 text-[10px] font-medium text-success">
          <span className="size-1.5 rounded-full bg-success" />
          Online
        </span>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 p-4">
          {chat.map((m) =>
            m.role === "assistant" ? (
              <div key={m.id} className="flex gap-2.5">
                <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-ai/15">
                  <Hexagon className="size-3.5 text-ai" fill="currentColor" />
                </div>
                <div className="glass max-w-[85%] rounded-2xl rounded-tl-sm px-3.5 py-2.5 text-sm leading-relaxed text-foreground">
                  {m.content}
                </div>
              </div>
            ) : (
              <div key={m.id} className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-primary px-3.5 py-2.5 text-sm leading-relaxed text-primary-foreground">
                  {m.content}
                </div>
              </div>
            ),
          )}
          <div ref={endRef} />
        </div>
      </ScrollArea>

      <div className="shrink-0 space-y-3 border-t border-border p-3">
        <div className="flex flex-wrap gap-1.5">
          {suggestedPrompts.map((p) => (
            <button
              key={p}
              onClick={() => send(p)}
              className="rounded-full border border-border bg-card/50 px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-ai/50 hover:text-foreground"
            >
              {p}
            </button>
          ))}
        </div>
        <div className="flex items-end gap-2 rounded-xl border border-border bg-card/60 p-2 focus-within:border-ai/50 focus-within:ring-3 focus-within:ring-ai/15">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing &&
                e.keyCode !== 229
              ) {
                e.preventDefault()
                send(input)
              }
            }}
            rows={1}
            placeholder="Ask about zoning, upside, suburbs…"
            className="max-h-24 min-h-8 flex-1 resize-none bg-transparent px-1.5 py-1 text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
          <button
            onClick={() => send(input)}
            disabled={!input.trim()}
            aria-label="Send message"
            className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-ai text-ai-foreground transition-opacity disabled:opacity-40"
          >
            <ArrowUp className="size-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
