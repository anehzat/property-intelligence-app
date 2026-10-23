"use client"

import { useRef, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { ArrowUpRight, Search, Sparkles } from "lucide-react"
import { useN3X7 } from "@/lib/store"
import { exampleSearches, suburbs } from "@/lib/mock-data"
import { parseSearch } from "@/lib/search"
import { matchLiveSuburb } from "@/lib/live"
import { cn } from "@/lib/utils"

export function SearchBar() {
  const { query, setQuery, askAi, setFilters, setDataSource, setLiveQuery } = useN3X7()
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const pathname = usePathname()
  const wrapRef = useRef<HTMLDivElement>(null)

  function submit(value: string) {
    const q = value.trim()
    if (!q) return
    setQuery(q)
    setOpen(false)
    // A Cotality sandbox suburb switches Discover to live listings
    const liveSuburb = matchLiveSuburb(q)
    if (liveSuburb) {
      setDataSource("live")
      setLiveQuery({ suburb: liveSuburb })
      if (pathname !== "/") router.push("/")
      return
    }
    // Searches naming a known demo suburb drive the Discover filters
    const patch = parseSearch(q, suburbs)
    if (patch) {
      setFilters(patch)
      if (pathname !== "/") router.push("/")
      return
    }
    // Natural-language questions route to the AI analyst
    if (/\b(find|show|ask|why|compare|explain|under|potential|growth)\b/i.test(q)) {
      askAi(q)
      router.push("/analyst")
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
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) submit(query)
          }}
          placeholder="Search address, suburb or ask N3X7 anything..."
          className="h-full min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          aria-label="Search properties or ask N3X7"
        />
        <kbd className="hidden shrink-0 items-center gap-1 rounded-md border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:flex">
          Enter
        </kbd>
      </div>

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
