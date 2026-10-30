import { test } from "node:test"
import assert from "node:assert/strict"
import { RpAuthError } from "./rpdata-auth.ts"
import type { RpAuth, TokenSet } from "./rpdata-auth.ts"
import { createMemoryStore } from "./rpdata-store.ts"
import type { LinkRecord, LinkStore } from "./rpdata-store.ts"
import { RpDataError, createTokenManager } from "./rpdata-tokens.ts"

const MIN = 60_000
const T0 = 1_000_000_000

const tokens = (n: number, extra: Partial<TokenSet> = {}): TokenSet => ({
  accessToken: `a${n}`,
  refreshToken: `r${n}`,
  expiresAt: T0 + 60 * MIN,
  rpSub: "sub1",
  rpUsername: "rp-user",
  ...extra,
})

function fakeAuth(script: { exchange?: () => Promise<TokenSet>; refresh?: (rt: string) => Promise<TokenSet> } = {}) {
  const calls = { exchange: 0, refresh: 0 }
  const auth: RpAuth = {
    async exchangeCode() {
      calls.exchange++
      return script.exchange ? script.exchange() : tokens(1)
    },
    async refresh(rt) {
      calls.refresh++
      return script.refresh ? script.refresh(rt) : tokens(2)
    },
  }
  return { auth, calls }
}

function setup(opts: { store?: LinkStore; auth?: RpAuth } = {}) {
  const clock = { t: T0 }
  const store = opts.store ?? createMemoryStore()
  const logs: string[] = []
  const mgr = createTokenManager({
    store,
    auth: opts.auth ?? fakeAuth().auth,
    now: () => clock.t,
    // Advances the clock and yields a macrotask so other async work can progress.
    sleep: (ms) => {
      clock.t += ms
      return new Promise((r) => setImmediate(r))
    },
    log: (line) => logs.push(line),
  })
  return { clock, store, mgr, logs }
}

const rec = (extra: Partial<LinkRecord> = {}): LinkRecord => ({
  userId: "u1",
  rpSub: "sub1",
  rpUsername: "rp-user",
  accessToken: "a1",
  accessExpiresAt: T0 + 60 * MIN,
  refreshToken: "r1",
  version: 0,
  linkedAt: T0,
  refreshedAt: T0,
  ...extra,
})

async function rejectsWith(p: Promise<unknown>, status: number, code: string) {
  await assert.rejects(p, (e: unknown) => {
    assert.ok(e instanceof RpDataError, `expected RpDataError, got ${String(e)}`)
    assert.equal(e.status, status)
    assert.equal(e.code, code)
    return true
  })
}

test("connect stores tokens and returns the username", async () => {
  const { mgr, store } = setup()
  assert.deepEqual(await mgr.connect("u1", "code", "https://app/cb"), { connected: true, username: "rp-user" })
  const r = await store.get("u1")
  assert.equal(r?.accessToken, "a1")
  assert.equal(r?.refreshToken, "r1")
  assert.equal(r?.rpSub, "sub1")
  assert.equal(r?.version, T0)
  assert.equal(r?.linkedAt, T0)
  assert.equal(r?.refreshedAt, T0)
  assert.deepEqual(await mgr.status("u1"), { connected: true, username: "rp-user" })
})

test("connect maps invalid_grant to 400 RPDATA_INVALID_CODE and stores nothing", async () => {
  const { auth } = fakeAuth({ exchange: async () => { throw new RpAuthError("invalid_grant", "x") } })
  const { mgr, store } = setup({ auth })
  await rejectsWith(mgr.connect("u1", "bad", "https://app/cb"), 400, "RPDATA_INVALID_CODE")
  assert.equal(await store.get("u1"), null)
})

test("connect maps an rp account held by another user to 409 RPDATA_IN_USE", async () => {
  const { mgr, store } = setup()
  await store.link(rec({ userId: "u2" }), null)
  await rejectsWith(mgr.connect("u1", "code", "https://app/cb"), 409, "RPDATA_IN_USE")
  assert.equal(await store.get("u1"), null)
})

test("connect releases the user's previous rp account", async () => {
  const { auth } = fakeAuth({ exchange: async () => tokens(1, { rpSub: "sub2" }) })
  const { mgr, store } = setup({ auth })
  await store.link(rec(), null)
  await mgr.connect("u1", "code", "https://app/cb")
  assert.equal((await store.get("u1"))?.rpSub, "sub2")
  // sub1 is free again, so another user can claim it.
  assert.equal(await store.link(rec({ userId: "u2" }), null), "ok")
})

test("connect maps quota to 503 and other auth failures to 502", async () => {
  const quota = fakeAuth({ exchange: async () => { throw new RpAuthError("quota", "x") } })
  const a = setup({ auth: quota.auth })
  await assert.rejects(a.mgr.connect("u1", "c", "cb"), (e: unknown) => {
    assert.ok(e instanceof RpDataError)
    assert.equal(e.status, 503)
    assert.equal(e.code, "RPDATA_UNAVAILABLE")
    assert.equal(e.message, "Cotality quota exceeded, try later")
    return true
  })
  for (const code of ["invalid_client", "unavailable", "bad_response"] as const) {
    const f = fakeAuth({ exchange: async () => { throw new RpAuthError(code, "x") } })
    const { mgr } = setup({ auth: f.auth })
    await rejectsWith(mgr.connect("u1", "c", "cb"), 502, "RPDATA_UNAVAILABLE")
  }
})

test("status omits an empty username and reports no link", async () => {
  const { mgr, store } = setup()
  assert.deepEqual(await mgr.status("u1"), { connected: false })
  await store.link(rec({ rpUsername: "" }), null)
  assert.deepEqual(await mgr.status("u1"), { connected: true })
})

test("disconnect unlinks, and with no link is a no-op", async () => {
  const { mgr, store } = setup()
  await mgr.disconnect("u1")
  await mgr.connect("u1", "code", "cb")
  assert.equal(await mgr.accessToken("u1"), "a1")
  await mgr.disconnect("u1")
  assert.equal(await store.get("u1"), null)
  await rejectsWith(mgr.accessToken("u1"), 409, "RPDATA_NOT_LINKED")
})

test("relink after disconnect gets a new version, so a stale saveRefreshed at the old version returns false", async () => {
  const { mgr, store, clock } = setup()
  await mgr.connect("u1", "code", "cb")
  const oldVersion = (await store.get("u1"))!.version
  await mgr.disconnect("u1")
  clock.t += 1_000
  await mgr.connect("u1", "code2", "cb")
  const stale = { accessToken: "aOld", accessExpiresAt: clock.t + 60 * MIN, refreshToken: "rOld", refreshedAt: clock.t }
  assert.equal(await store.saveRefreshed("u1", oldVersion, stale), false)
  const r = await store.get("u1")
  assert.equal(r?.version, T0 + 1_000)
  assert.equal(r?.accessToken, "a1")
  assert.equal(r?.refreshToken, "r1")
})

test("a cached token is re-read from the store after 60 s, so a disconnect elsewhere takes effect", async () => {
  const shared = createMemoryStore()
  const a = setup({ store: shared })
  const b = setup({ store: shared })
  await shared.link(rec(), null)
  assert.equal(await b.mgr.accessToken("u1"), "a1")
  await a.mgr.disconnect("u1")
  b.clock.t += 59_000
  assert.equal(await b.mgr.accessToken("u1"), "a1")
  b.clock.t += 2_000
  await rejectsWith(b.mgr.accessToken("u1"), 409, "RPDATA_NOT_LINKED")
})

test("a refresh takes a 20 s lease", async () => {
  const mem = createMemoryStore()
  const leases: [number, number][] = []
  const store: LinkStore = {
    ...mem,
    tryLease(userId, version, now, until) {
      leases.push([now, until])
      return mem.tryLease(userId, version, now, until)
    },
  }
  const { mgr } = setup({ store })
  await mem.link(rec({ accessExpiresAt: T0 }), null)
  await mgr.accessToken("u1")
  assert.deepEqual(leases, [[T0, T0 + 20_000]])
})

test("accessToken returns the stored token when more than 5 minutes remain", async () => {
  const f = fakeAuth()
  const { mgr, store } = setup({ auth: f.auth })
  await store.link(rec({ accessExpiresAt: T0 + 5 * MIN + 1 }), null)
  assert.equal(await mgr.accessToken("u1"), "a1")
  assert.equal(await mgr.accessToken("u1"), "a1")
  assert.equal(f.calls.refresh, 0)
})

test("accessToken refreshes when 5 minutes or less remain and stores the new pair", async () => {
  const f = fakeAuth()
  const { mgr, store } = setup({ auth: f.auth })
  await store.link(rec({ accessExpiresAt: T0 + 5 * MIN }), null)
  assert.equal(await mgr.accessToken("u1"), "a2")
  assert.equal(f.calls.refresh, 1)
  const r = await store.get("u1")
  assert.equal(r?.version, 1)
  assert.equal(r?.accessToken, "a2")
  assert.equal(r?.refreshToken, "r2")
  assert.equal(r?.refreshedAt, T0)
  assert.equal(r?.refreshingUntil, undefined)
})

test("a cached token that enters the 5-minute window goes back through the store", async () => {
  const f = fakeAuth({ refresh: async () => tokens(2, { expiresAt: T0 + 120 * MIN }) })
  const { mgr, store, clock } = setup({ auth: f.auth })
  await store.link(rec({ accessExpiresAt: T0 + 10 * MIN }), null)
  assert.equal(await mgr.accessToken("u1"), "a1")
  clock.t += 5 * MIN
  assert.equal(await mgr.accessToken("u1"), "a2")
  assert.equal(f.calls.refresh, 1)
})

test("two concurrent accessToken calls refresh once", async () => {
  const f = fakeAuth({
    refresh: () => new Promise((r) => setImmediate(() => r(tokens(2)))),
  })
  const { mgr, store } = setup({ auth: f.auth })
  await store.link(rec({ accessExpiresAt: T0 }), null)
  const [x, y] = await Promise.all([mgr.accessToken("u1"), mgr.accessToken("u1")])
  assert.equal(f.calls.refresh, 1)
  assert.equal(x, "a2")
  assert.equal(y, "a2")
})

test("a waiter that sees no version change for 5 s gets 503 RPDATA_BUSY", async () => {
  const f = fakeAuth()
  const { mgr, store } = setup({ auth: f.auth })
  await store.link(rec({ accessExpiresAt: T0 }), null)
  assert.equal(await store.tryLease("u1", 0, T0, T0 + 60_000), true)
  await assert.rejects(mgr.accessToken("u1"), (e: unknown) => {
    assert.ok(e instanceof RpDataError)
    assert.equal(e.status, 503)
    assert.equal(e.code, "RPDATA_BUSY")
    assert.equal(e.message, "RP Data busy, try again")
    return true
  })
  assert.equal(f.calls.refresh, 0)
})

test("a waiter uses the new token once another container refreshes", async () => {
  const f = fakeAuth()
  const { mgr, store, clock } = setup({ auth: f.auth })
  await store.link(rec({ accessExpiresAt: T0 }), null)
  await store.tryLease("u1", 0, T0, T0 + 15_000)
  const p = mgr.accessToken("u1")
  await new Promise((r) => setImmediate(r))
  await store.saveRefreshed("u1", 0, { accessToken: "aX", accessExpiresAt: clock.t + 60 * MIN, refreshToken: "rX", refreshedAt: clock.t })
  assert.equal(await p, "aX")
  assert.equal(f.calls.refresh, 0)
})

test("invalid_grant on refresh after another container refreshed uses the new token", async () => {
  const store = createMemoryStore()
  const f = fakeAuth({
    refresh: async () => {
      // Another container saves a new pair while our call is in flight
      // (saveRefreshed is conditional on version only, as in DynamoDB).
      await store.saveRefreshed("u1", 0, {
        accessToken: "aX",
        accessExpiresAt: T0 + 60 * MIN,
        refreshToken: "rX",
        refreshedAt: T0,
      })
      throw new RpAuthError("invalid_grant", "x")
    },
  })
  const { mgr } = setup({ store, auth: f.auth })
  await store.link(rec({ accessExpiresAt: T0 }), null)
  assert.equal(await mgr.accessToken("u1"), "aX")
  assert.equal((await store.get("u1"))?.rpSub, "sub1")
})

test("invalid_grant on refresh with no version change unlinks and throws 409 RPDATA_NOT_LINKED", async () => {
  const f = fakeAuth({ refresh: async () => { throw new RpAuthError("invalid_grant", "x") } })
  const { mgr, store } = setup({ auth: f.auth })
  await store.link(rec({ accessExpiresAt: T0 }), null)
  await rejectsWith(mgr.accessToken("u1"), 409, "RPDATA_NOT_LINKED")
  assert.equal(await store.get("u1"), null)
  assert.equal(await store.link(rec({ userId: "u2" }), null), "ok")
})

test("a failed save after a successful refresh retries 3 times then throws 502", async () => {
  const mem = createMemoryStore()
  let saves = 0
  const store: LinkStore = {
    ...mem,
    async saveRefreshed() {
      saves++
      throw new Error("dynamo down")
    },
  }
  const f = fakeAuth()
  const { mgr, logs } = setup({ store, auth: f.auth })
  await mem.link(rec({ accessExpiresAt: T0 }), null)
  await rejectsWith(mgr.accessToken("u1"), 502, "RPDATA_UNAVAILABLE")
  assert.equal(saves, 4)
  assert.equal(f.calls.refresh, 1)
  assert.ok(logs.some((l) => l.includes("rpdata_save_failed")))
  assert.ok(logs.every((l) => !l.includes("a2") && !l.includes("r2") && !l.includes("rp-user")))
})

test("a save that succeeds on retry returns the new token", async () => {
  const mem = createMemoryStore()
  let saves = 0
  const store: LinkStore = {
    ...mem,
    async saveRefreshed(userId, version, t) {
      if (++saves < 3) throw new Error("dynamo blip")
      return mem.saveRefreshed(userId, version, t)
    },
  }
  const { mgr } = setup({ store })
  await mem.link(rec({ accessExpiresAt: T0 }), null)
  assert.equal(await mgr.accessToken("u1"), "a2")
  assert.equal(saves, 3)
  assert.equal((await mem.get("u1"))?.version, 1)
})

test("a save that loses the version race uses the winner's token", async () => {
  const mem = createMemoryStore()
  const store: LinkStore = {
    ...mem,
    async saveRefreshed(userId, version) {
      await mem.saveRefreshed(userId, version, {
        accessToken: "aW",
        accessExpiresAt: T0 + 60 * MIN,
        refreshToken: "rW",
        refreshedAt: T0,
      })
      return mem.saveRefreshed(userId, version, { accessToken: "a2", accessExpiresAt: 0, refreshToken: "r2", refreshedAt: 0 })
    },
  }
  const { mgr } = setup({ store })
  await mem.link(rec({ accessExpiresAt: T0 }), null)
  assert.equal(await mgr.accessToken("u1"), "aW")
})

test("other refresh failures clear the lease, keep the link and throw 502", async () => {
  const f = fakeAuth({ refresh: async () => { throw new RpAuthError("unavailable", "x") } })
  const { mgr, store } = setup({ auth: f.auth })
  await store.link(rec({ accessExpiresAt: T0 }), null)
  await rejectsWith(mgr.accessToken("u1"), 502, "RPDATA_UNAVAILABLE")
  const r = await store.get("u1")
  assert.equal(r?.refreshToken, "r1")
  assert.equal(r?.version, 0)
  assert.equal(r?.refreshingUntil, undefined)
})

test("a quota failure on refresh throws 503 and clears the lease", async () => {
  const f = fakeAuth({ refresh: async () => { throw new RpAuthError("quota", "x") } })
  const { mgr, store } = setup({ auth: f.auth })
  await store.link(rec({ accessExpiresAt: T0 }), null)
  await rejectsWith(mgr.accessToken("u1"), 503, "RPDATA_UNAVAILABLE")
  assert.equal((await store.get("u1"))?.refreshingUntil, undefined)
})

test("accessToken with no link throws 409 RPDATA_NOT_LINKED", async () => {
  const { mgr } = setup()
  await rejectsWith(mgr.accessToken("u1"), 409, "RPDATA_NOT_LINKED")
})

test("store failures become 502 and log only the event name", async () => {
  const mem = createMemoryStore()
  const store: LinkStore = {
    ...mem,
    async get() {
      throw new Error("secret-ish detail")
    },
  }
  const { mgr, logs } = setup({ store })
  await rejectsWith(mgr.accessToken("u1"), 502, "RPDATA_UNAVAILABLE")
  await rejectsWith(mgr.status("u1"), 502, "RPDATA_UNAVAILABLE")
  assert.ok(logs.length >= 2)
  assert.ok(logs.every((l) => !l.includes("secret-ish")))
})
