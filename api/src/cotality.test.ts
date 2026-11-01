import { test } from "node:test"
import assert from "node:assert/strict"
import { CotalityError, createCotality, searchPath } from "./cotality.ts"

const creds = async () => ({ clientId: "id", clientSecret: "secret", baseUrl: "https://cot.test" })
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })

function fakeFetch(handler: (url: string, init?: RequestInit) => Response) {
  const calls: string[] = []
  const fn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    calls.push(url)
    return handler(url, init)
  }) as typeof fetch
  return { fn, calls }
}

const tokenOk = (url: string) =>
  url.includes("/access/as/token.oauth2") ? json({ access_token: "t1", expires_in: 3300 }) : null

test("searchPath always sends activeCampaign=true and size=20", () => {
  const p = searchPath(42, { suburb: "Blacktown", types: ["HOUSE", "LAND"], minLandArea: 500, page: 2 })
  assert.equal(
    p,
    "/search/au/property/locality/42/otmForSale?activeCampaign=true&size=20&page=2&pTypes=HOUSE%2CLAND&landArea=500-",
  )
  assert.equal(
    searchPath(42, { suburb: "Blacktown", types: [], minLandArea: 0, page: 0 }),
    "/search/au/property/locality/42/otmForSale?activeCampaign=true&size=20&page=0",
  )
})

test("token request uses Basic auth and the token is reused", async () => {
  let auth = ""
  const f = fakeFetch((url, init) => {
    if (url.includes("token.oauth2")) {
      auth = String((init?.headers as Record<string, string>).Authorization)
      return json({ access_token: "t1", expires_in: 3300 })
    }
    return json({ ok: true })
  })
  const c = createCotality(creds, f.fn, () => 0)
  await c.saleCampaign(1)
  await c.saleCampaign(2)
  assert.equal(auth, `Basic ${Buffer.from("id:secret").toString("base64")}`)
  assert.equal(f.calls.filter((u) => u.includes("token.oauth2")).length, 1)
})

test("token is refreshed within 5 minutes of expiry", async () => {
  let t = 0
  const f = fakeFetch((url) => tokenOk(url) ?? json({}))
  const c = createCotality(creds, f.fn, () => t)
  await c.saleCampaign(1)
  t = (3300 - 299) * 1000
  await c.saleCampaign(1)
  assert.equal(f.calls.filter((u) => u.includes("token.oauth2")).length, 2)
})

test("a 401 forces one token refresh and retry", async () => {
  let dataCalls = 0
  const f = fakeFetch((url) => {
    const tok = tokenOk(url)
    if (tok) return tok
    dataCalls++
    return dataCalls === 1 ? json({}, 401) : json({ ok: true })
  })
  const c = createCotality(creds, f.fn, () => 0)
  assert.deepEqual(await c.saleCampaign(1), { ok: true })
  assert.equal(f.calls.filter((u) => u.includes("token.oauth2")).length, 2)
})

test("a second 401 throws CotalityError(401)", async () => {
  const f = fakeFetch((url) => tokenOk(url) ?? json({}, 401))
  const c = createCotality(creds, f.fn, () => 0)
  await assert.rejects(c.saleCampaign(1), (e) => e instanceof CotalityError && e.status === 401)
})

test("429 throws CotalityError(429) and 404 resolves null", async () => {
  const f429 = fakeFetch((url) => tokenOk(url) ?? json({}, 429))
  await assert.rejects(createCotality(creds, f429.fn).saleCampaign(1), (e) => e instanceof CotalityError && e.status === 429)
  const f404 = fakeFetch((url) => tokenOk(url) ?? json({}, 404))
  assert.equal(await createCotality(creds, f404.fn).saleCampaign(1), null)
})

test("failed token request throws CotalityError(401)", async () => {
  const f = fakeFetch(() => json({ error: "invalid_client" }, 400))
  await assert.rejects(createCotality(creds, f.fn).saleCampaign(1), (e) => e instanceof CotalityError && e.status === 401)
})

test("suggestLocality returns the locality id and caches it", async () => {
  const f = fakeFetch((url) =>
    tokenOk(url) ??
    json({ suggestions: [{ suggestionType: "locality", localityId: 777, suggestion: "Blacktown NSW 2148" }] }),
  )
  const c = createCotality(creds, f.fn, () => 0)
  assert.equal(await c.suggestLocality("Blacktown NSW 2148"), 777)
  assert.equal(await c.suggestLocality("Blacktown NSW 2148"), 777)
  const suggestCalls = f.calls.filter((u) => u.includes("suggest.json"))
  assert.equal(suggestCalls.length, 1)
  assert.ok(suggestCalls[0].includes("q=Blacktown%20NSW%202148"))
  assert.ok(suggestCalls[0].includes("suggestionTypes=locality"))
})

test("suggestLocality throws when no locality is found", async () => {
  const f = fakeFetch((url) => tokenOk(url) ?? json({ suggestions: [] }))
  await assert.rejects(createCotality(creds, f.fn).suggestLocality("Nowhere"), CotalityError)
})

test("with a user token, get uses it and does not call the token endpoint", async () => {
  let auth = ""
  const f = fakeFetch((url, init) => {
    auth = String((init?.headers as Record<string, string>).Authorization)
    return json({ ok: true })
  })
  const c = createCotality(creds, f.fn, () => 0)
  await c.saleCampaign(1, "user-tok")
  assert.equal(auth, "Bearer user-tok")
  assert.equal(f.calls.filter((u) => u.includes("token.oauth2")).length, 0)
})

test("a 401 with a user token throws without retrying", async () => {
  const f = fakeFetch(() => json({}, 401))
  const c = createCotality(creds, f.fn, () => 0)
  await assert.rejects(
    () => c.saleCampaign(1, "user-tok"),
    (e: unknown) => e instanceof CotalityError && e.status === 401 && e.userToken === true,
  )
  assert.equal(f.calls.length, 1)
})
