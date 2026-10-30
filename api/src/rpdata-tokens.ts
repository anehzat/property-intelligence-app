import { RpAuthError } from "./rpdata-auth.ts"
import type { RpAuth } from "./rpdata-auth.ts"
import type { LinkRecord, LinkStore } from "./rpdata-store.ts"

export type RpDataStatus = 400 | 409 | 502 | 503
export type RpDataCode =
  | "RPDATA_NOT_LINKED"
  | "RPDATA_IN_USE"
  | "RPDATA_INVALID_CODE"
  | "RPDATA_BUSY"
  | "RPDATA_UNAVAILABLE"

export class RpDataError extends Error {
  status: RpDataStatus
  code: RpDataCode
  constructor(status: RpDataStatus, code: RpDataCode, message: string) {
    super(message)
    this.name = "RpDataError"
    this.status = status
    this.code = code
  }
}

export interface TokenManager {
  status(userId: string): Promise<{ connected: boolean; username?: string }>
  connect(userId: string, code: string, redirectUri: string): Promise<{ connected: true; username: string }>
  disconnect(userId: string): Promise<void>
  /** A usable Cotality access token for the user. Throws RpDataError. */
  accessToken(userId: string): Promise<string>
}

/** Refresh when this little or less remains on the access token. */
const REFRESH_WINDOW_MS = 5 * 60_000
const LEASE_MS = 15_000
const WAIT_POLL_MS = 500
const WAIT_MAX_MS = 5_000
/** Retries of the post-refresh write, after the first attempt. */
const SAVE_RETRIES = 3

const notLinked = () => new RpDataError(409, "RPDATA_NOT_LINKED", "RP Data not linked")
const unavailable = () => new RpDataError(502, "RPDATA_UNAVAILABLE", "RP Data unavailable")

export function createTokenManager(deps: {
  store: LinkStore
  auth: RpAuth
  now?: () => number
  sleep?: (ms: number) => Promise<void>
  log?: (line: string) => void
}): TokenManager {
  const { store, auth } = deps
  const now = deps.now ?? Date.now
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const log = deps.log ?? console.log
  /** Per-container copy. Only ever trusted while outside the refresh window. */
  const cache = new Map<string, LinkRecord>()

  // Never log tokens, codes, secrets or the RP Data username: event name and Cotality error code only.
  const logEvent = (event: string, code?: string) => log(JSON.stringify(code ? { event, code } : { event }))

  const fresh = (r: LinkRecord) => r.accessExpiresAt - now() > REFRESH_WINDOW_MS

  function fromAuthError(e: RpAuthError, event: string): RpDataError {
    logEvent(event, e.code)
    if (e.code === "quota") return new RpDataError(503, "RPDATA_UNAVAILABLE", "Cotality quota exceeded, try later")
    return unavailable()
  }

  /** Runs fn, turning anything that is not already an RpDataError into a logged 502. */
  async function guard<T>(event: string, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn()
    } catch (e) {
      if (e instanceof RpDataError) throw e
      if (e instanceof RpAuthError) throw fromAuthError(e, event)
      logEvent(event)
      throw unavailable()
    }
  }

  /** Re-reads the item; returns its token if its version moved past `version`. */
  async function winnerToken(userId: string, version: number): Promise<string | null> {
    const r = await store.get(userId)
    if (!r) {
      cache.delete(userId)
      throw notLinked()
    }
    if (r.version === version) return null
    cache.set(userId, r)
    return r.accessToken
  }

  /** Another container holds the lease: poll until the version changes, for up to 5 s. */
  async function waitForRefresh(userId: string, version: number): Promise<string> {
    const start = now()
    while (now() - start < WAIT_MAX_MS) {
      await sleep(WAIT_POLL_MS)
      const token = await winnerToken(userId, version)
      if (token !== null) return token
    }
    logEvent("rpdata_lease_wait_timeout")
    throw new RpDataError(503, "RPDATA_BUSY", "RP Data busy, try again")
  }

  async function refreshUnderLease(rec: LinkRecord): Promise<string> {
    const { userId, version } = rec
    let next
    try {
      next = await auth.refresh(rec.refreshToken)
    } catch (e) {
      if (e instanceof RpAuthError && e.code === "invalid_grant") {
        // Another container may have used the refresh token first.
        const token = await winnerToken(userId, version)
        if (token !== null) return token
        logEvent("rpdata_refresh_revoked", e.code)
        cache.delete(userId)
        await store.unlink(userId, rec.rpSub)
        throw notLinked()
      }
      await store.clearLease(userId, version).catch(() => logEvent("rpdata_clear_lease_failed"))
      if (e instanceof RpAuthError) throw fromAuthError(e, "rpdata_refresh_failed")
      logEvent("rpdata_refresh_failed")
      throw unavailable()
    }

    const saved = {
      accessToken: next.accessToken,
      accessExpiresAt: next.expiresAt,
      refreshToken: next.refreshToken,
      refreshedAt: now(),
    }
    // The old refresh token is spent, so this write matters: retry it.
    for (let attempt = 0; attempt <= SAVE_RETRIES; attempt++) {
      let ok: boolean
      try {
        ok = await store.saveRefreshed(userId, version, saved)
      } catch {
        continue
      }
      if (ok) {
        cache.set(userId, { ...rec, ...saved, version: version + 1, refreshingUntil: undefined })
        return saved.accessToken
      }
      // Version conflict: someone else saved a pair. Use theirs.
      const token = await winnerToken(userId, version)
      if (token !== null) return token
      break
    }
    logEvent("rpdata_save_failed")
    throw unavailable()
  }

  async function accessToken(userId: string): Promise<string> {
    const cached = cache.get(userId)
    if (cached && fresh(cached)) return cached.accessToken

    const rec = await store.get(userId)
    if (!rec) {
      cache.delete(userId)
      throw notLinked()
    }
    cache.set(userId, rec)
    if (fresh(rec)) return rec.accessToken

    const t = now()
    if (await store.tryLease(userId, rec.version, t, t + LEASE_MS)) return refreshUnderLease(rec)
    return waitForRefresh(userId, rec.version)
  }

  return {
    status: (userId) =>
      guard("rpdata_status_failed", async () => {
        const rec = await store.get(userId)
        if (!rec) {
          cache.delete(userId)
          return { connected: false }
        }
        return rec.rpUsername ? { connected: true, username: rec.rpUsername } : { connected: true }
      }),

    connect: (userId, code, redirectUri) =>
      guard("rpdata_connect_failed", async () => {
        let set
        try {
          set = await auth.exchangeCode(code, redirectUri)
        } catch (e) {
          if (e instanceof RpAuthError && e.code === "invalid_grant") {
            logEvent("rpdata_connect_rejected", e.code)
            throw new RpDataError(400, "RPDATA_INVALID_CODE", "RP Data sign-in code was rejected")
          }
          throw e
        }
        const existing = await store.get(userId)
        const t = now()
        const rec: LinkRecord = {
          userId,
          rpSub: set.rpSub,
          rpUsername: set.rpUsername,
          accessToken: set.accessToken,
          accessExpiresAt: set.expiresAt,
          refreshToken: set.refreshToken,
          version: 0,
          linkedAt: t,
          refreshedAt: t,
        }
        if ((await store.link(rec, existing?.rpSub ?? null)) === "in-use") {
          throw new RpDataError(409, "RPDATA_IN_USE", "This RP Data account is already linked to another N3X7 user")
        }
        cache.set(userId, rec)
        return { connected: true as const, username: set.rpUsername }
      }),

    disconnect: (userId) =>
      guard("rpdata_disconnect_failed", async () => {
        cache.delete(userId)
        const rec = await store.get(userId)
        if (rec) await store.unlink(userId, rec.rpSub)
        cache.delete(userId)
      }),

    accessToken: (userId) => guard("rpdata_token_failed", () => accessToken(userId)),
  }
}
