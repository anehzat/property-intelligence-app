import { test } from "node:test"
import assert from "node:assert/strict"
import { RpAuthError, createRpAuth, decodeClaims } from "./rpdata-auth.ts"

const creds = async () => ({ authBaseUrl: "https://auth.test", userClientId: "cid", userClientSecret: "sec" })
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url")
const jwt = (claims: unknown) => `${b64({ alg: "none" })}.${b64(claims)}.`
const goodAccess = jwt({ sub: "sub-1", username: "jane" })

function fakeFetch(res: () => Response) {
  const calls: { url: string; init?: RequestInit }[] = []
  const fn = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init })
    return res()
  }) as typeof fetch
  return { fn, calls }
}

const okBody = { access_token: goodAccess, refresh_token: "r1", expires_in: 3599 }
const make = (res: () => Response) => {
  const f = fakeFetch(res)
  return { ...f, auth: createRpAuth(creds, f.fn, () => 1_000_000) }
}
const params = (init?: RequestInit) => Object.fromEntries(new URLSearchParams(String(init?.body)))

test("exchangeCode posts the authorization_code grant", async () => {
  const { auth, calls } = make(() => json(okBody))
  const t = await auth.exchangeCode("abc", "https://next.eronka.com/auth/rpdata/callback/")
  assert.equal(calls[0].url, "https://auth.test/as/token.oauth2")
  assert.equal(calls[0].init?.method, "POST")
  const h = calls[0].init?.headers as Record<string, string>
  assert.equal(h["Content-Type"], "application/x-www-form-urlencoded")
  assert.equal(h.Authorization, undefined)
  assert.deepEqual(params(calls[0].init), {
    grant_type: "authorization_code",
    client_id: "cid",
    client_secret: "sec",
    code: "abc",
    redirect_uri: "https://next.eronka.com/auth/rpdata/callback/",
  })
  assert.deepEqual(t, {
    accessToken: goodAccess,
    refreshToken: "r1",
    expiresAt: 1_000_000 + 3599_000,
    rpSub: "sub-1",
    rpUsername: "jane",
  })
})

test("refresh posts the refresh_token grant", async () => {
  const { auth, calls } = make(() => json(okBody))
  await auth.refresh("r1")
  assert.deepEqual(params(calls[0].init), {
    grant_type: "refresh_token",
    client_id: "cid",
    client_secret: "sec",
    refresh_token: "r1",
  })
})

async function codeOf(res: () => Response) {
  const { auth } = make(res)
  try {
    await auth.refresh("r1")
  } catch (e) {
    assert.ok(e instanceof RpAuthError)
    return e.code
  }
  assert.fail("expected rejection")
}

test("400 invalid_grant maps to code invalid_grant", async () => {
  assert.equal(await codeOf(() => json({ error: "invalid_grant" }, 400)), "invalid_grant")
})
test("401 invalid_client maps to code invalid_client", async () => {
  assert.equal(await codeOf(() => json({ error: "invalid_client" }, 401)), "invalid_client")
})
test("429 maps to quota", async () => {
  assert.equal(await codeOf(() => json({}, 429)), "quota")
})
test("500 maps to unavailable", async () => {
  assert.equal(await codeOf(() => json({}, 500)), "unavailable")
})

test("exchangeCode rejects malformed success responses with bad_response", async () => {
  for (const body of [
    { access_token: goodAccess, expires_in: 3599 },
    { access_token: goodAccess, refresh_token: "r1" },
    { access_token: jwt({ username: "jane" }), refresh_token: "r1", expires_in: 3599 },
  ]) {
    const { auth } = make(() => json(body))
    await assert.rejects(auth.exchangeCode("c", "u"), (e: unknown) => e instanceof RpAuthError && e.code === "bad_response")
  }
})

test("decodeClaims returns {} for a malformed token", () => {
  assert.deepEqual(decodeClaims("nope"), {})
  assert.deepEqual(decodeClaims("a.%%%.c"), {})
  assert.deepEqual(decodeClaims(jwt({ sub: "s", username: "u" })), { sub: "s", username: "u" })
})

test("loadCreds failure becomes unavailable without leaking the original error", async () => {
  const f = fakeFetch(() => json(okBody))
  const auth = createRpAuth(async () => { throw new Error("AccessDenied arn:aws:secret") }, f.fn, () => 1)
  await assert.rejects(auth.refresh("r1"), (e: unknown) =>
    e instanceof RpAuthError && e.code === "unavailable" && !e.message.includes("AccessDenied"))
  assert.equal(f.calls.length, 0)
})

test("incomplete creds are unavailable and never reach fetch", async () => {
  const f = fakeFetch(() => json(okBody))
  const auth = createRpAuth(async () => ({ authBaseUrl: "https://auth.test", userClientId: "cid", userClientSecret: "" }), f.fn, () => 1)
  await assert.rejects(auth.exchangeCode("c", "u"), (e: unknown) => e instanceof RpAuthError && e.code === "unavailable")
  assert.equal(f.calls.length, 0)
})
