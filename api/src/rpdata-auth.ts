export interface AuthCreds {
  authBaseUrl: string
  userClientId: string
  userClientSecret: string
}

export interface TokenSet {
  accessToken: string
  refreshToken: string
  expiresAt: number
  rpSub: string
  rpUsername: string
}

export type RpAuthCode = "invalid_grant" | "invalid_client" | "bad_response" | "quota" | "unavailable"

export class RpAuthError extends Error {
  code: RpAuthCode
  constructor(code: RpAuthCode, message: string) {
    super(message)
    this.name = "RpAuthError"
    this.code = code
  }
}

export interface RpAuth {
  exchangeCode(code: string, redirectUri: string): Promise<TokenSet>
  refresh(refreshToken: string): Promise<TokenSet>
}

export function decodeClaims(jwt: string): { sub?: string; username?: string } {
  try {
    const payload = JSON.parse(Buffer.from(jwt.split(".")[1] ?? "", "base64url").toString("utf8"))
    if (!payload || typeof payload !== "object") return {}
    const out: { sub?: string; username?: string } = {}
    if (typeof payload.sub === "string") out.sub = payload.sub
    if (typeof payload.username === "string") out.username = payload.username
    return out
  } catch {
    return {}
  }
}

export function createRpAuth(
  loadCreds: () => Promise<AuthCreds>,
  fetchFn: typeof fetch = fetch,
  now: () => number = Date.now,
): RpAuth {
  let creds: AuthCreds | null = null

  async function tokenRequest(grant: Record<string, string>): Promise<TokenSet> {
    creds ??= await loadCreds()
    const body = new URLSearchParams({
      ...grant,
      client_id: creds.userClientId,
      client_secret: creds.userClientSecret,
    })
    let r: Response
    try {
      r = await fetchFn(`${creds.authBaseUrl}/as/token.oauth2`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      })
    } catch {
      throw new RpAuthError("unavailable", "RP Data token endpoint unreachable")
    }
    if (r.status === 429) throw new RpAuthError("quota", "RP Data token quota exceeded")
    if (r.status === 400 || r.status === 401) {
      const err = ((await r.json().catch(() => ({}))) as { error?: unknown }).error
      if (err === "invalid_grant") throw new RpAuthError("invalid_grant", "RP Data grant rejected")
      if (err === "invalid_client" || r.status === 401) throw new RpAuthError("invalid_client", "RP Data client rejected")
      throw new RpAuthError("invalid_grant", "RP Data token request rejected")
    }
    if (!r.ok) throw new RpAuthError("unavailable", `RP Data token endpoint failed (${r.status})`)

    const j = (await r.json().catch(() => null)) as {
      access_token?: unknown
      refresh_token?: unknown
      expires_in?: unknown
    } | null
    if (
      !j ||
      typeof j.access_token !== "string" ||
      typeof j.refresh_token !== "string" ||
      typeof j.expires_in !== "number"
    ) {
      throw new RpAuthError("bad_response", "RP Data token response incomplete")
    }
    const claims = decodeClaims(j.access_token)
    if (!claims.sub) throw new RpAuthError("bad_response", "RP Data access token has no subject")
    return {
      accessToken: j.access_token,
      refreshToken: j.refresh_token,
      expiresAt: now() + j.expires_in * 1000,
      rpSub: claims.sub,
      rpUsername: claims.username ?? "",
    }
  }

  return {
    exchangeCode: (code, redirectUri) =>
      tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri }),
    refresh: (refreshToken) => tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken }),
  }
}
