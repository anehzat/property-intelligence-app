// Helpers for the RP Data (Cotality) OAuth sign-in. Pure, so they can be tested without a browser.
// Callers pass config values in, so this file never imports lib/config.ts.

export const RPDATA_CALLBACK_PATH = "/auth/rpdata/callback/"
export const RPDATA_STATE_KEY = "n3x7.rpdata.state"

const trim = (base: string) => base.replace(/\/+$/, "")

/** The RP Data step is skipped unless both values are set. */
export function rpdataEnabled(authUrl: string, clientId: string): boolean {
  return authUrl !== "" && clientId !== ""
}

export function redirectUriFor(origin: string): string {
  return `${origin}${RPDATA_CALLBACK_PATH}`
}

export function authorizeUrl(authUrl: string, clientId: string, redirectUri: string, state: string): string {
  const p = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: "openid",
    state,
  })
  return `${trim(authUrl)}/as/authorization.oauth2?${p.toString()}`
}

/** 32 random hex characters, used as the OAuth state. */
export function newState(): string {
  const bytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
}

/** Fixed failure keys. The connect page shows only these messages, never text taken from the URL. */
export type RpErrorKey = "cancelled" | "expired" | "failed" | "in_use" | "connect_failed"

export const RPDATA_ERROR_MESSAGES: Record<RpErrorKey, string> = {
  cancelled: "RP Data sign-in was cancelled.",
  expired: "The RP Data sign-in link expired. Please try again.",
  failed: "RP Data sign-in failed. Please try again.",
  in_use: "This RP Data account is already linked to another N3X7 user. Contact your N3X7 admin.",
  connect_failed: "Couldn't connect your RP Data account. Please try again.",
}

/** The message for a key from the query string, or null for anything unknown. */
export function rpdataErrorMessage(key: string | null): string | null {
  if (key === null || !Object.prototype.hasOwnProperty.call(RPDATA_ERROR_MESSAGES, key)) return null
  return RPDATA_ERROR_MESSAGES[key as RpErrorKey]
}

/** Maps a failed /rpdata/connect response (its `code` field) to a key. */
export function connectErrorKey(apiCode: unknown): RpErrorKey {
  return apiCode === "RPDATA_IN_USE" ? "in_use" : "connect_failed"
}

export type CallbackOutcome = { ok: true; code: string } | { ok: false; error: RpErrorKey }

/** Reads the callback query string. An error param wins, then the state check, then a missing code. */
export function callbackOutcome(search: string, savedState: string | null): CallbackOutcome {
  const p = new URLSearchParams(search)
  const error = p.get("error")
  if (error) return { ok: false, error: error === "access_denied" ? "cancelled" : "failed" }
  const state = p.get("state")
  if (!savedState || state !== savedState) return { ok: false, error: "expired" }
  const code = p.get("code")
  if (!code) return { ok: false, error: "failed" }
  return { ok: true, code }
}

export interface RpStatus {
  connected: boolean
  username?: string
}

export function isRpStatus(x: unknown): x is RpStatus {
  return !!x && typeof x === "object" && typeof (x as RpStatus).connected === "boolean"
}

export function rpdataUrl(apiBase: string, path: "status" | "connect" | "connection"): string {
  return `${trim(apiBase)}/rpdata/${path}`
}

/** Data routes only work once the user is linked (or the RP Data step is off). */
export function shouldLoadLive(rpdata: "unknown" | "linked" | "unlinked" | "disabled"): boolean {
  return rpdata === "linked" || rpdata === "disabled"
}
