import { test } from "node:test"
import assert from "node:assert/strict"
import { authErrorMessage, userFromClaims } from "./claims.ts"

test("userFromClaims uses the name claim", () => {
  assert.deepEqual(userFromClaims({ email: "a@x.com", name: "Armin Nehzat" }), {
    email: "a@x.com", name: "Armin Nehzat", role: "Acquisitions Analyst",
  })
})

test("userFromClaims falls back to the email local part", () => {
  assert.equal(userFromClaims({ email: "trong@eroka.com" }).name, "trong")
  assert.equal(userFromClaims({}).email, "")
})

test("authErrorMessage hides whether the user exists", () => {
  assert.equal(authErrorMessage({ name: "NotAuthorizedException", message: "x" }), "Incorrect email or password.")
  assert.equal(authErrorMessage({ name: "UserNotFoundException" }), "Incorrect email or password.")
})

test("authErrorMessage passes through password policy messages", () => {
  assert.equal(
    authErrorMessage({ name: "InvalidPasswordException", message: "Password not long enough" }),
    "Password not long enough",
  )
  assert.equal(authErrorMessage({}), "Sign-in failed. Please try again.")
})
