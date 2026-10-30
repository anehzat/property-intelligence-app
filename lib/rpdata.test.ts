import { test } from "node:test"
import assert from "node:assert/strict"
import {
  authorizeUrl,
  callbackOutcome,
  isRpStatus,
  newState,
  redirectUriFor,
  rpdataEnabled,
  rpdataUrl,
} from "./rpdata.ts"

const EXPIRED = "The RP Data sign-in link expired. Please try again."
const FAILED = "RP Data sign-in failed. Please try again."

test("rpdataEnabled is false when either value is empty", () => {
  assert.equal(rpdataEnabled("", "abc"), false)
  assert.equal(rpdataEnabled("https://auth.corelogic.asia", ""), false)
  assert.equal(rpdataEnabled("https://auth.corelogic.asia", "abc"), true)
})

test("redirectUriFor appends the callback path with a trailing slash", () => {
  assert.equal(redirectUriFor("https://next.eronka.com"), "https://next.eronka.com/auth/rpdata/callback/")
})

test("authorizeUrl builds the authorization request", () => {
  const redirect = "https://next.eronka.com/auth/rpdata/callback/"
  const u = new URL(authorizeUrl("https://auth.corelogic.asia/", "cid", redirect, "st"))
  assert.equal(u.origin + u.pathname, "https://auth.corelogic.asia/as/authorization.oauth2")
  assert.equal(u.searchParams.get("response_type"), "code")
  assert.equal(u.searchParams.get("client_id"), "cid")
  assert.equal(u.searchParams.get("redirect_uri"), redirect)
  assert.equal(u.searchParams.get("scope"), "openid")
  assert.equal(u.searchParams.get("state"), "st")
  assert.ok(u.search.includes("redirect_uri=https%3A%2F%2F"))
})

test("newState returns 32 hex chars and differs between calls", () => {
  const a = newState()
  assert.match(a, /^[0-9a-f]{32}$/)
  assert.notEqual(a, newState())
})

test("callbackOutcome returns the code when state matches", () => {
  assert.deepEqual(callbackOutcome("?code=abc&state=s1", "s1"), { ok: true, code: "abc" })
  assert.deepEqual(callbackOutcome("code=abc&state=s1", "s1"), { ok: true, code: "abc" })
})

test("callbackOutcome rejects missing or mismatched state", () => {
  assert.deepEqual(callbackOutcome("?code=abc&state=s1", "s2"), { ok: false, message: EXPIRED })
  assert.deepEqual(callbackOutcome("?code=abc", "s1"), { ok: false, message: EXPIRED })
  assert.deepEqual(callbackOutcome("?code=abc&state=s1", null), { ok: false, message: EXPIRED })
  assert.deepEqual(callbackOutcome("?code=abc&state=", ""), { ok: false, message: EXPIRED })
})

test("callbackOutcome handles the error param first", () => {
  assert.deepEqual(callbackOutcome("?error=access_denied&state=x", "s1"), {
    ok: false,
    message: "RP Data sign-in was cancelled.",
  })
  assert.deepEqual(callbackOutcome("?error=server_error", "s1"), { ok: false, message: FAILED })
})

test("callbackOutcome with no code and no error fails", () => {
  assert.deepEqual(callbackOutcome("?state=s1", "s1"), { ok: false, message: FAILED })
  assert.deepEqual(callbackOutcome("", "s1"), { ok: false, message: EXPIRED })
})

test("isRpStatus accepts only status objects", () => {
  assert.equal(isRpStatus({ connected: true, username: "a" }), true)
  assert.equal(isRpStatus({ connected: false }), true)
  assert.equal(isRpStatus({ connected: "yes" }), false)
  assert.equal(isRpStatus(null), false)
})

test("rpdataUrl joins the base and path, trimming trailing slashes", () => {
  assert.equal(rpdataUrl("https://api.test/", "status"), "https://api.test/rpdata/status")
  assert.equal(rpdataUrl("https://api.test", "connect"), "https://api.test/rpdata/connect")
  assert.equal(rpdataUrl("https://api.test//", "connection"), "https://api.test/rpdata/connection")
})

test("shouldLoadLive only allows linked or disabled", async () => {
  const { shouldLoadLive } = await import("./rpdata.ts")
  assert.equal(shouldLoadLive("linked"), true)
  assert.equal(shouldLoadLive("disabled"), true)
  assert.equal(shouldLoadLive("unlinked"), false)
  assert.equal(shouldLoadLive("unknown"), false)
})
