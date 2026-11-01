import { test } from "node:test"
import assert from "node:assert/strict"
import { isLoginPath, isPublicAuthPath, isRpDataPath } from "./paths.ts"

test("isLoginPath matches /login with or without a trailing slash", () => {
  assert.equal(isLoginPath("/login"), true)
  assert.equal(isLoginPath("/login/"), true)
})

test("isLoginPath rejects other pages", () => {
  assert.equal(isLoginPath("/"), false)
  assert.equal(isLoginPath("/saved/"), false)
  assert.equal(isLoginPath("/login-help/"), false)
})

test("isPublicAuthPath matches login and the RP Data pages with or without a trailing slash", () => {
  for (const p of ["/login", "/login/", "/connect-rpdata", "/connect-rpdata/", "/auth/rpdata/callback", "/auth/rpdata/callback/"]) {
    assert.equal(isPublicAuthPath(p), true, p)
  }
  assert.equal(isPublicAuthPath("/saved/"), false)
  assert.equal(isPublicAuthPath("/auth/rpdata/"), false)
})

test("isRpDataPath matches only the RP Data pages", () => {
  for (const p of ["/connect-rpdata", "/connect-rpdata/", "/auth/rpdata/callback", "/auth/rpdata/callback/"]) {
    assert.equal(isRpDataPath(p), true, p)
  }
  assert.equal(isRpDataPath("/login/"), false)
  assert.equal(isRpDataPath("/"), false)
})
