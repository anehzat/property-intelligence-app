"use client"

import { useRef, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { ArrowUpRight, Search, Sparkles } from "lucide-react"
import { useN3X7 } from "@/lib/store"
import { exampleSearches, suburbs } from "@/lib/mock-data"
import { noMatchMessage, routeSearch } from "@/lib/search-route"
import { cn } from "@/lib/utils"

export function SearchBar() {
  const { query, setQuery, askAi, setFilters, setDataSource, setLiveQuery } = useN3X7()
  const [open, setOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  // Enter pressed while an IME (e.g. Vietnamese Telex) is still composing a word
  const enterWhileComposing = useRef(false)
  const router = useRouter()
  const pathname = usePathname()
  const wrapRef = useRef<HTMLDivElement>(null)

  function submit(value: string) {
    const q = value.trim()
    if (!q) return
    setQuery(q)
    setOpen(false)
    setNotice(null)
    const route = routeSearch(q, suburbs)
    if (route.kind === "live") {
      // A Cotality sandbox suburb switches Discover to live listings
      setDataSource("live")
      setLiveQuery({ suburb: route.suburb })
      if (pathname !== "/") router.push("/")
    } else if (route.kind === "demo") {
      // Searches naming a known demo suburb drive the Discover filters
      setDataSource("demo")
      setFilters(route.patch)
      if (pathname !== "/") router.push("/")
    } else if (route.kind === "ai") {
      askAi(q)
      router.push("/analyst")
    } else {
      setNotice(noMatchMessage(q))
    }
  }

  return (
    <div ref={wrapRef} className="relative w-full max-w-2xl">
      <div
        className={cn(
          "flex h-11 items-center gap-2.5 rounded-xl border bg-card/60 px-3.5 backdrop-blur transition-colors",
          open ? "border-primary/60 ring-3 ring-primary/15" : "border-border",
        )}
      >
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setNotice(null)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return
            if (e.nativeEvent.isComposing) enterWhileComposing.current = true
            else submit(e.currentTarget.value)
          }}
          onCompositionEnd={(e) => {
            if (!enterWhileComposing.current) return
            enterWhileComposing.current = false
            submit(e.currentTarget.value)
          }}
          placeholder="Search address, suburb or ask N3X7 anything..."
          className="h-full min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          aria-label="Search properties or ask N3X7"
        />
        <kbd className="hidden shrink-0 items-center gap-1 rounded-md border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:flex">
          Enter
        </kbd>
      </div>

      {notice && !open && (
        <p role="status" className="absolute top-13 left-0 z-50 w-full rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground shadow-lg">
          {notice}
        </p>
      )}

      {open && (
        <div className="glass absolute top-13 left-0 z-50 w-full overflow-hidden rounded-xl p-1.5 shadow-2xl">
          <p className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            <Sparkles className="size-3 text-ai" />
            Try asking
          </p>
          {exampleSearches.map((s) => (
            <button
              key={s}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => submit(s)}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-foreground transition-colors hover:bg-accent"
            >
              <Search className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="flex-1 truncate">{s}</span>
              <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
