import type { APIGatewayProxyEventV2 } from "aws-lambda"
import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager"
import { createCotality, type Creds } from "./cotality.ts"
import { handle } from "./dispatch.ts"
import { loadLegal, type LegalSection } from "./legal.ts"
import { createRpAuth, type AuthCreds } from "./rpdata-auth.ts"
import { silentFrom } from "./rpdata-silent.ts"
import { createDynamoStore, createKmsCipher } from "./rpdata-store.ts"
import { createTokenManager } from "./rpdata-tokens.ts"

const secrets = new SecretsManagerClient({})

interface Secret extends Partial<Creds>, Partial<AuthCreds> {
  dataAuth?: string
  silentApiKey?: string
  silentSecret?: string
  rppBaseUrl?: string
}

let secretPromise: Promise<Secret> | null = null

/** Fetches the secret once per container; a failed fetch is retried on the next call. */
function loadSecret(): Promise<Secret> {
  secretPromise ??= secrets
    .send(new GetSecretValueCommand({ SecretId: process.env.SECRET_ID }))
    .then((r) => JSON.parse(r.SecretString ?? "{}") as Secret)
    .catch((e) => {
      secretPromise = null
      throw e
    })
  return secretPromise
}

async function loadCreds(): Promise<Creds> {
  const j = await loadSecret()
  if (!j.clientId || !j.clientSecret || !j.baseUrl) {
    throw new Error("Cotality secret is missing clientId, clientSecret or baseUrl")
  }
  return { clientId: j.clientId, clientSecret: j.clientSecret, baseUrl: j.baseUrl.replace(/\/+$/, "") }
}

// Missing user fields come through empty, so the auth client reports "unavailable" (502 on /rpdata/*).
async function loadAuthCreds(): Promise<AuthCreds> {
  const j = await loadSecret()
  return {
    authBaseUrl: (j.authBaseUrl ?? "").replace(/\/+$/, ""),
    userClientId: j.userClientId ?? "",
    userClientSecret: j.userClientSecret ?? "",
  }
}

// Module scope: the token and locality caches live as long as the Lambda container.
const cotality = createCotality(loadCreds)
const tokens = createTokenManager({
  store: createDynamoStore({
    linksTable: process.env.LINKS_TABLE ?? "",
    accountsTable: process.env.ACCOUNTS_TABLE ?? "",
    cipher: createKmsCipher(process.env.KMS_KEY_ID ?? ""),
  }),
  auth: createRpAuth(loadAuthCreds),
})
const redirectOrigins = (process.env.REDIRECT_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim().replace(/\/+$/, ""))
  .filter(Boolean)

/** Disclaimer wording changes rarely: one fetch per container every 6 hours. */
const LEGAL_TTL_MS = 6 * 60 * 60_000
let legalCache: { at: number; sections: Promise<LegalSection[]> } | null = null
function legal(): Promise<LegalSection[]> {
  if (!legalCache || Date.now() - legalCache.at > LEGAL_TTL_MS) {
    legalCache = { at: Date.now(), sections: loadLegal((category, key) => cotality.legalContent(category, key)) }
  }
  return legalCache.sections
}

export async function handler(event: APIGatewayProxyEventV2) {
  return handle(event, loadSecret, (dataAuth, secret) => ({
    client: cotality,
    tokens,
    dataAuth,
    redirectOrigins,
    silent: silentFrom(secret),
    legal,
  }))
}
