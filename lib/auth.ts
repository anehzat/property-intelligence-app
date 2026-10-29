import {
  AuthenticationDetails,
  CognitoUser,
  CognitoUserPool,
  type CognitoUserSession,
} from "amazon-cognito-identity-js"
import { config } from "./config"
import { authErrorMessage, userFromClaims } from "./claims"
import type { DemoUser } from "./types"

export type SignInResult =
  | { status: "ok"; user: DemoUser }
  | { status: "new-password-required" }
  | { status: "error"; message: string }

let pool: CognitoUserPool | null = null
/** Null when the Cognito IDs aren't configured (e.g. no .env yet); the constructor throws on bad IDs. */
function getPool(): CognitoUserPool | null {
  if (!pool && config.userPoolId && config.userPoolClientId) {
    try {
      pool = new CognitoUserPool({ UserPoolId: config.userPoolId, ClientId: config.userPoolClientId })
    } catch {
      return null
    }
  }
  return pool
}

// The Cognito user waiting on a NEW_PASSWORD_REQUIRED challenge.
let pending: CognitoUser | null = null

function callbacks(user: CognitoUser, resolve: (r: SignInResult) => void) {
  return {
    onSuccess: (s: CognitoUserSession) =>
      resolve({ status: "ok", user: userFromClaims(s.getIdToken().decodePayload()) }),
    onFailure: (err: { name?: string; message?: string }) =>
      resolve({ status: "error", message: authErrorMessage(err) }),
    newPasswordRequired: () => {
      pending = user
      resolve({ status: "new-password-required" })
    },
  }
}

export function signInWithPassword(email: string, password: string): Promise<SignInResult> {
  const p = getPool()
  if (!p) return Promise.resolve({ status: "error", message: "Sign-in isn't configured for this build." })
  const user = new CognitoUser({ Username: email, Pool: p })
  return new Promise((resolve) =>
    user.authenticateUser(
      new AuthenticationDetails({ Username: email, Password: password }),
      callbacks(user, resolve),
    ),
  )
}

export function completeNewPassword(newPassword: string): Promise<SignInResult> {
  const user = pending
  if (!user) return Promise.resolve({ status: "error", message: "Please sign in again." })
  return new Promise((resolve) =>
    user.completeNewPasswordChallenge(newPassword, {}, callbacks(user, resolve)),
  )
}

function session(): Promise<CognitoUserSession | null> {
  const user = getPool()?.getCurrentUser()
  if (!user) return Promise.resolve(null)
  return new Promise((resolve) =>
    // getSession refreshes an expired ID token with the refresh token.
    user.getSession((err: Error | null, s: CognitoUserSession | null) =>
      resolve(err || !s?.isValid() ? null : s),
    ),
  )
}

export async function currentUser(): Promise<DemoUser | null> {
  const s = await session()
  return s ? userFromClaims(s.getIdToken().decodePayload()) : null
}

export async function getIdToken(): Promise<string | null> {
  return (await session())?.getIdToken().getJwtToken() ?? null
}

export function signOutCognito() {
  getPool()?.getCurrentUser()?.signOut()
  pending = null
}
