"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { properties as allProperties, suburbs, aiReply } from "./mock-data"
import type {
  ChatMessage,
  ContractRequest,
  DemoUser,
  LayerId,
  LiveListing,
  Property,
} from "./types"
import { defaultFilters, filterProperties, type Filters } from "./search"
import { loadJSON, saveJSON } from "./persist"
import { config } from "./config"
import { isRpStatus, redirectUriFor, rpdataEnabled, rpdataUrl } from "./rpdata"
import {
  centerOf,
  defaultLiveQuery,
  fetchLive,
  isListingsResponse,
  listingsUrl,
  LiveError,
  type LiveQuery,
} from "./live"
import {
  completeNewPassword as cognitoNewPassword,
  currentUser,
  getIdToken,
  signInWithPassword,
  signOutCognito,
  type SignInResult,
} from "./auth"

export interface FlyTarget {
  center: [number, number]
  zoom: number
  key: number
}

export type DataSource = "demo" | "live"

export type RpDataState = "unknown" | "linked" | "unlinked" | "disabled"

const RPDATA_CONNECT_FAILED = "Couldn't connect your RP Data account. Please try again."
const RPDATA_IN_USE_MESSAGE =
  "This RP Data account is already linked to another N3X7 user. Contact your N3X7 admin."

export interface LiveState {
  status: "idle" | "loading" | "ok" | "error"
  listings: LiveListing[]
  total: number
  totalPages: number
  error: string | null
}

const idleLive: LiveState = { status: "idle", listings: [], total: 0, totalPages: 0, error: null }

interface N3X7State {
  properties: Property[]
  savedIds: string[]
  isSaved: (id: string) => boolean
  toggleSave: (id: string) => void
  selectedId: string | null
  selectedProperty: Property | null
  setSelectedId: (id: string | null) => void
  drawerOpen: boolean
  openProperty: (id: string) => void
  closeDrawer: () => void
  layers: Record<LayerId, boolean>
  toggleLayer: (id: LayerId) => void
  query: string
  setQuery: (q: string) => void
  chat: ChatMessage[]
  askAi: (question: string) => void
  aiContextId: string | null
  setAiContextId: (id: string | null) => void
  filters: Filters
  setFilters: (patch: Partial<Filters>) => void
  filteredProperties: Property[]
  flyTarget: FlyTarget | null
  contractRequests: Record<string, ContractRequest>
  requestContract: (id: string, message: string) => Promise<void>
  user: DemoUser | null
  hydrated: boolean
  signIn: (email: string, password: string) => Promise<SignInResult>
  completeNewPassword: (newPassword: string) => Promise<SignInResult>
  signOut: () => void
  dataSource: DataSource
  setDataSource: (s: DataSource) => void
  liveQuery: LiveQuery
  setLiveQuery: (patch: Partial<LiveQuery>) => void
  live: LiveState
  selectedLive: LiveListing | null
  openLive: (l: LiveListing) => void
  closeLive: () => void
  savedLive: Record<string, LiveListing>
  toggleSaveLive: (l: LiveListing) => void
  rpdata: RpDataState
  rpUsername: string | null
  rpdataError: string | null
  refreshRpData: () => Promise<void>
  connectRpData: (code: string) => Promise<{ ok: true } | { ok: false; message: string }>
  disconnectRpData: () => Promise<void>
  markRpDataUnlinked: () => void
}

const N3X7Context = createContext<N3X7State | null>(null)

const KEYS = {
  saved: "n3x7.saved",
  contracts: "n3x7.contracts",
  savedLive: "n3x7.savedLive",
}

let msgCounter = 0

export function N3X7Provider({ children }: { children: ReactNode }) {
  const [hydrated, setHydrated] = useState(false)
  const [user, setUser] = useState<DemoUser | null>(null)
  const [savedIds, setSavedIds] = useState<string[]>([])
  const [contractRequests, setContractRequests] = useState<
    Record<string, ContractRequest>
  >({})
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [aiContextId, setAiContextId] = useState<string | null>(null)
  const [filters, setFiltersState] = useState<Filters>(defaultFilters)
  const [flyTarget, setFlyTarget] = useState<FlyTarget | null>(null)
  const [layers, setLayers] = useState<Record<LayerId, boolean>>({
    listings: true,
    lmr: true,
    tod: true,
    development: false,
    constraints: false,
  })
  const [dataSource, setDataSource] = useState<DataSource>("live")
  const [liveQuery, setLiveQueryState] = useState<LiveQuery>(defaultLiveQuery)
  const [live, setLive] = useState<LiveState>(idleLive)
  const [selectedLive, setSelectedLive] = useState<LiveListing | null>(null)
  const [savedLive, setSavedLive] = useState<Record<string, LiveListing>>({})
  const [rpdata, setRpdata] = useState<RpDataState>("unknown")
  const [rpUsername, setRpUsername] = useState<string | null>(null)
  const [rpdataError, setRpdataError] = useState<string | null>(null)
  const [chat, setChat] = useState<ChatMessage[]>([
    {
      id: "seed-1",
      role: "assistant",
      content:
        "Hi, I'm N3X7 — your AI property analyst. Ask me about TOD areas, LMR upside, frontage, or how suburbs compare. Select a property to give me more context.",
    },
  ])

  // Restore the Cognito session and the browser-only demo state after mount.
  useEffect(() => {
    let alive = true
    currentUser().then((u) => {
      if (!alive) return
      setUser(u)
      setSavedIds(loadJSON<string[]>(KEYS.saved, []))
      setContractRequests(loadJSON<Record<string, ContractRequest>>(KEYS.contracts, {}))
      setSavedLive(loadJSON<Record<string, LiveListing>>(KEYS.savedLive, {}))
      setHydrated(true)
    })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (hydrated) saveJSON(KEYS.saved, savedIds)
  }, [hydrated, savedIds])
  useEffect(() => {
    if (hydrated) saveJSON(KEYS.contracts, contractRequests)
  }, [hydrated, contractRequests])
  useEffect(() => {
    if (hydrated) saveJSON(KEYS.savedLive, savedLive)
  }, [hydrated, savedLive])

  const toggleSave = useCallback((id: string) => {
    setSavedIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    )
  }, [])

  const toggleLayer = useCallback((id: LayerId) => {
    setLayers((prev) => ({ ...prev, [id]: !prev[id] }))
  }, [])

  const openProperty = useCallback((id: string) => {
    setSelectedId(id)
    setDrawerOpen(true)
  }, [])

  const closeDrawer = useCallback(() => setDrawerOpen(false), [])

  const setFilters = useCallback((patch: Partial<Filters>) => {
    setFiltersState((prev) => ({ ...prev, ...patch }))
    if (patch.suburb) {
      const s = suburbs.find((x) => x.name === patch.suburb)
      if (s) setFlyTarget({ center: s.center, zoom: 15, key: Date.now() })
    }
  }, [])

  // Any filter change returns to the first page unless a page is given.
  const setLiveQuery = useCallback((patch: Partial<LiveQuery>) => {
    setLiveQueryState((prev) => ({ ...prev, ...patch, page: patch.page ?? 0 }))
  }, [])
  const openLive = useCallback((l: LiveListing) => {
    setDrawerOpen(false)
    setSelectedLive(l)
  }, [])
  const closeLive = useCallback(() => setSelectedLive(null), [])

  // Live listings aren't in the bundled data, so a snapshot is saved alongside the id.
  const toggleSaveLive = useCallback((l: LiveListing) => {
    setSavedLive((prev) => {
      const next = { ...prev }
      if (next[l.id]) delete next[l.id]
      else next[l.id] = l
      return next
    })
  }, [])

  const markRpDataUnlinked = useCallback(() => {
    setRpdata("unlinked")
    setRpUsername(null)
  }, [])

  useEffect(() => {
    if (dataSource !== "live" || !user) return
    let cancelled = false
    setLive((s) => ({ ...s, status: "loading", error: null }))
    ;(async () => {
      try {
        const token = await getIdToken()
        if (!token) throw new Error("Your session has expired. Sign in again.")
        const res = await fetchLive(listingsUrl(config.apiUrl, liveQuery), token, isListingsResponse)
        if (cancelled) return
        setLive({ status: "ok", listings: res.listings, total: res.total, totalPages: res.totalPages, error: null })
        const center = centerOf(res.listings)
        if (center) setFlyTarget({ center, zoom: 14, key: Date.now() })
      } catch (e) {
        if (!cancelled) {
          if (e instanceof LiveError && e.status === 409) markRpDataUnlinked()
          setLive({ ...idleLive, status: "error", error: e instanceof Error ? e.message : "Something went wrong." })
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [dataSource, liveQuery, user, markRpDataUnlinked])

  const refreshRpData = useCallback(async () => {
    setRpdataError(null)
    try {
      const token = await getIdToken()
      if (!token) throw new Error("Your session has expired. Sign in again.")
      const s = await fetchLive(rpdataUrl(config.apiUrl, "status"), token, isRpStatus)
      setRpdata(s.connected ? "linked" : "unlinked")
      setRpUsername(s.connected ? (s.username ?? null) : null)
    } catch {
      setRpdataError("Couldn't check your RP Data connection.")
    }
  }, [])

  const connectRpData = useCallback(async (code: string) => {
    try {
      const token = await getIdToken()
      if (!token) return { ok: false as const, message: "Your session has expired. Sign in again." }
      const r = await fetch(rpdataUrl(config.apiUrl, "connect"), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ code, redirectUri: redirectUriFor(window.location.origin) }),
      })
      const body: unknown = await r.json().catch(() => null)
      const b = (body ?? {}) as { error?: unknown; code?: unknown; connected?: unknown; username?: unknown }
      if (!r.ok) {
        const message =
          b.code === "RPDATA_IN_USE"
            ? RPDATA_IN_USE_MESSAGE
            : typeof b.error === "string" && b.error
              ? b.error
              : RPDATA_CONNECT_FAILED
        return { ok: false as const, message }
      }
      setRpdata("linked")
      setRpUsername(typeof b.username === "string" ? b.username : null)
      return { ok: true as const }
    } catch {
      return { ok: false as const, message: RPDATA_CONNECT_FAILED }
    }
  }, [])

  const disconnectRpData = useCallback(async () => {
    const token = await getIdToken()
    if (!token) throw new Error("Your session has expired. Sign in again.")
    const r = await fetch(rpdataUrl(config.apiUrl, "connection"), {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!r.ok) throw new Error("Couldn't disconnect RP Data. Please try again.")
    setRpdata("unlinked")
    setRpUsername(null)
  }, [])

  // Once signed in, find out whether this user has linked an RP Data account.
  useEffect(() => {
    if (!user) return
    if (!rpdataEnabled(config.rpdataAuthUrl, config.rpdataClientId)) {
      setRpdata("disabled")
      return
    }
    void refreshRpData()
  }, [user, refreshRpData])

  const requestContract = useCallback(async (id: string, message: string) => {
    await new Promise((r) => setTimeout(r, 800))
    setContractRequests((prev) => ({
      ...prev,
      [id]: { requestedAt: new Date().toISOString(), message },
    }))
    setSavedIds((prev) => (prev.includes(id) ? prev : [...prev, id]))
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    const r = await signInWithPassword(email, password)
    if (r.status === "ok") setUser(r.user)
    return r
  }, [])

  const completeNewPassword = useCallback(async (newPassword: string) => {
    const r = await cognitoNewPassword(newPassword)
    if (r.status === "ok") setUser(r.user)
    return r
  }, [])

  // Signing out resets the demo session so each walkthrough starts clean.
  const signOut = useCallback(() => {
    signOutCognito()
    setDrawerOpen(false)
    setUser(null)
    setSavedIds([])
    setContractRequests({})
    setSavedLive({})
    setDataSource("live")
    setLiveQueryState(defaultLiveQuery)
    setLive(idleLive)
    setSelectedLive(null)
    setRpdata("unknown")
    setRpUsername(null)
    setRpdataError(null)
  }, [])

  const askAi = useCallback((question: string) => {
    const q = question.trim()
    if (!q) return
    const userMsg: ChatMessage = {
      id: `u-${msgCounter++}`,
      role: "user",
      content: q,
    }
    setChat((prev) => [...prev, userMsg])
    const reply = aiReply(q)
    setTimeout(() => {
      setChat((prev) => [
        ...prev,
        { id: `a-${msgCounter++}`, role: "assistant", content: reply },
      ])
    }, 550)
  }, [])

  const selectedProperty = useMemo(
    () => allProperties.find((p) => p.id === selectedId) ?? null,
    [selectedId],
  )

  const filteredProperties = useMemo(
    () => filterProperties(allProperties, filters),
    [filters],
  )

  const value = useMemo<N3X7State>(
    () => ({
      properties: allProperties,
      savedIds,
      isSaved: (id: string) => savedIds.includes(id) || id in savedLive,
      toggleSave,
      selectedId,
      selectedProperty,
      setSelectedId,
      drawerOpen,
      openProperty,
      closeDrawer,
      layers,
      toggleLayer,
      query,
      setQuery,
      chat,
      askAi,
      aiContextId,
      setAiContextId,
      filters,
      setFilters,
      filteredProperties,
      flyTarget,
      contractRequests,
      requestContract,
      user,
      hydrated,
      signIn,
      completeNewPassword,
      signOut,
      dataSource,
      setDataSource,
      liveQuery,
      setLiveQuery,
      live,
      selectedLive,
      openLive,
      closeLive,
      savedLive,
      toggleSaveLive,
      rpdata,
      rpUsername,
      rpdataError,
      refreshRpData,
      connectRpData,
      disconnectRpData,
      markRpDataUnlinked,
    }),
    [
      savedIds,
      toggleSave,
      selectedId,
      selectedProperty,
      drawerOpen,
      openProperty,
      closeDrawer,
      layers,
      toggleLayer,
      query,
      chat,
      askAi,
      aiContextId,
      filters,
      setFilters,
      filteredProperties,
      flyTarget,
      contractRequests,
      requestContract,
      user,
      hydrated,
      signIn,
      completeNewPassword,
      signOut,
      dataSource,
      liveQuery,
      setLiveQuery,
      live,
      selectedLive,
      openLive,
      closeLive,
      savedLive,
      toggleSaveLive,
      rpdata,
      rpUsername,
      rpdataError,
      refreshRpData,
      connectRpData,
      disconnectRpData,
      markRpDataUnlinked,
    ],
  )

  return <N3X7Context.Provider value={value}>{children}</N3X7Context.Provider>
}

export function useN3X7() {
  const ctx = useContext(N3X7Context)
  if (!ctx) throw new Error("useN3X7 must be used within N3X7Provider")
  return ctx
}
