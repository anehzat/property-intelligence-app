import { test } from "node:test"
import assert from "node:assert/strict"
import { isLoginPath } from "./paths.ts"

test("isLoginPath matches /login with or without a trailing slash", () => {
  assert.equal(isLoginPath("/login"), true)
  assert.equal(isLoginPath("/login/"), true)
})

test("isLoginPath rejects other pages", () => {
  assert.equal(isLoginPath("/"), false)
  assert.equal(isLoginPath("/saved/"), false)
  assert.equal(isLoginPath("/login-help/"), false)
})
