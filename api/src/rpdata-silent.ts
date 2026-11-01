// Silent login (deep link) into RP Data Professional, per the RP.Inside guide V4.0 pages 8–9.
// The URL carries the user's access token, a timestamp and our API key, signed with HMAC-SHA256.
import { createHmac } from "node:crypto"

export interface SilentCreds {
  apiKey: string
  secret: string
  /** RP Professional base, e.g. https://rpp.rpdata.com/rpp (Production) or https://rpp-uat.corelogic.com.au/rpp. */
  rppBaseUrl: string
}

export const RPP_PRODUCTION = "https://rpp.rpdata.com/rpp"

export type SilentTarget = { page: "dashboard" } | { page: "property"; propertyId: number }

/** Silent login is configured only when the secret holds both the API key and the integrator secret. */
export function silentFrom(secret: unknown): SilentCreds | null {
  const s = (secret ?? {}) as { silentApiKey?: unknown; silentSecret?: unknown; rppBaseUrl?: unknown }
  if (typeof s.silentApiKey !== "string" || !s.silentApiKey) return null
  if (typeof s.silentSecret !== "string" || !s.silentSecret) return null
  const base = typeof s.rppBaseUrl === "string" && s.rppBaseUrl ? s.rppBaseUrl : RPP_PRODUCTION
  return { apiKey: s.silentApiKey, secret: s.silentSecret, rppBaseUrl: base.replace(/\/+$/, "") }
}

const pad = (n: number) => String(n).padStart(2, "0")

/** yyyy-MM-ddTHH:mm:ss+00:00, in UTC. RP Data accepts any offset within 10 minutes of now. */
export function silentTimestamp(at: Date): string {
  return (
    `${at.getUTCFullYear()}-${pad(at.getUTCMonth() + 1)}-${pad(at.getUTCDate())}` +
    `T${pad(at.getUTCHours())}:${pad(at.getUTCMinutes())}:${pad(at.getUTCSeconds())}+00:00`
  )
}

/**
 * The hash covers every query parameter in its raw form, in URL order; only the timestamp
 * is encoded in the URL itself. The token (a JWT) and the API key need no encoding.
 */
export function silentLoginUrl(c: SilentCreds, oauthToken: string, target: SilentTarget, at: Date): string {
  const timestamp = silentTimestamp(at)
  const path = target.page === "property" ? "/property/detail.html" : "/dashboard.html"
  const pageParams: [string, string][] =
    target.page === "property"
      ? [["propertyId", String(target.propertyId)], ["is_workflow", "false"], ["showNavBtns", "false"]]
      : []
  const params: [string, string][] = [...pageParams, ["timestamp", timestamp], ["oauthToken", oauthToken], ["apiKey", c.apiKey]]
  const raw = params.map(([k, v]) => `${k}=${v}`).join("&")
  const hash = createHmac("sha256", c.secret).update(raw, "utf8").digest("hex")
  const query = params.map(([k, v]) => `${k}=${k === "timestamp" ? encodeURIComponent(v) : v}`).join("&")
  return `${c.rppBaseUrl}${path}?${query}&hash=${hash}`
}
