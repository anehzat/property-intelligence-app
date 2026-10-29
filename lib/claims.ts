import type { DemoUser } from "./types"

export function userFromClaims(claims: Record<string, unknown>): DemoUser {
  const email = typeof claims.email === "string" ? claims.email : ""
  const name = typeof claims.name === "string" && claims.name.trim() ? claims.name.trim() : email.split("@")[0]
  return { email, name, role: "Acquisitions Analyst" }
}

export function authErrorMessage(err: { name?: string; message?: string }): string {
  switch (err.name) {
    case "NotAuthorizedException":
    case "UserNotFoundException":
      return "Incorrect email or password."
    case "InvalidPasswordException":
    case "PasswordResetRequiredException":
    case "LimitExceededException":
      return err.message ?? "Sign-in failed. Please try again."
    default:
      return "Sign-in failed. Please try again."
  }
}
