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
  Property,
} from "./types"
import { defaultFilters, filterProperties, type Filters } from "./search"
import { loadJSON, saveJSON } from "./persist"
import {
  completeNewPassword as cognitoNewPassword,
  currentUser,
  signInWithPassword,
  signOutCognito,
  type SignInResult,
} from "./auth"

export interface FlyTarget {
  center: [number, number]
  zoom: number
  key: number
}

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
}

const N3X7Context = createContext<N3X7State | null>(null)

const KEYS = {
  saved: "n3x7.saved",
  contracts: "n3x7.contracts",
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
      isSaved: (id: string) => savedIds.includes(id),
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
    ],
  )

  return <N3X7Context.Provider value={value}>{children}</N3X7Context.Provider>
}

export function useN3X7() {
  const ctx = useContext(N3X7Context)
  if (!ctx) throw new Error("useN3X7 must be used within N3X7Provider")
  return ctx
}
