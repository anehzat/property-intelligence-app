import type { APIGatewayProxyEventV2 } from "aws-lambda"
import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager"
import { createCotality, type Creds } from "./cotality.ts"
import { route } from "./routes.ts"

const secrets = new SecretsManagerClient({})

async function loadCreds(): Promise<Creds> {
  const r = await secrets.send(new GetSecretValueCommand({ SecretId: process.env.SECRET_ID }))
  const j = JSON.parse(r.SecretString ?? "{}") as Partial<Creds>
  if (!j.clientId || !j.clientSecret || !j.baseUrl) {
    throw new Error("Cotality secret is missing clientId, clientSecret or baseUrl")
  }
  return { clientId: j.clientId, clientSecret: j.clientSecret, baseUrl: j.baseUrl.replace(/\/+$/, "") }
}

// Module scope: the token and locality caches live as long as the Lambda container.
const cotality = createCotality(loadCreds)

export async function handler(event: APIGatewayProxyEventV2) {
  return route(event, cotality)
}
