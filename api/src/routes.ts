import { CotalityError, type CotalityClient } from "./cotality.ts"
import { mapCampaign, mapSearch } from "./map.ts"
import { BadRequest, SUPPORTED_SUBURBS, parseConnectBody, parseListingsQuery, parsePropertyId } from "./params.ts"
import { RpDataError, type TokenManager } from "./rpdata-tokens.ts"

export interface RouteEvent {
  routeKey: string
  body?: string
  isBase64Encoded?: boolean
  queryStringParameters?: Record<string, string | undefined>
  pathParameters?: Record<string, string | undefined>
  requestContext?: {
    requestId?: string
    authorizer?: { jwt?: { claims?: Record<string, unknown> } }
  }
}

export interface RouteDeps {
  client: CotalityClient
  tokens: TokenManager
  dataAuth: "client" | "user"
  redirectOrigins: string[]
}

class Unauthorized extends Error {
  constructor() {
    super("Unauthorized")
    this.name = "Unauthorized"
  }
}

export interface RouteResult {
  statusCode: number
  headers: Record<string, string>
  body: string
}

const json = (statusCode: number, data: unknown): RouteResult => ({
  statusCode,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(data),
})

function toError(e: unknown): [number, string] {
  if (e instanceof Unauthorized) return [401, e.message]
  if (e instanceof BadRequest) return [400, e.message]
  if (e instanceof RpDataError) return [e.status, e.message]
  if (e instanceof CotalityError && e.status === 401 && e.userToken) {
    return [502, "Cotality rejected the RP Data token"]
  }
  if (e instanceof CotalityError && e.status === 401) return [502, "Cotality authentication failed"]
  if (e instanceof CotalityError && e.status === 429) return [503, "Cotality quota exceeded, try later"]
  return [502, "Cotality unavailable"]
}

export async function route(
  event: RouteEvent,
  deps: RouteDeps,
  log: (line: string) => void = console.log,
): Promise<RouteResult> {
  const { client, tokens } = deps
  const started = Date.now()
  let status = 500
  let errorName: string | undefined
  let errorCode: string | undefined
  try {
    const sub = event.requestContext?.authorizer?.jwt?.claims?.sub
    const userId = typeof sub === "string" && sub ? sub : undefined
    const requireUser = () => {
      if (!userId) throw new Unauthorized()
      return userId
    }
    /** The user's Cotality token in "user" mode; undefined in "client" mode. */
    const dataToken = async () => (deps.dataAuth === "user" ? tokens.accessToken(requireUser()) : undefined)

    if (event.routeKey === "GET /rpdata/status") {
      status = 200
      return json(status, await tokens.status(requireUser()))
    }
    if (event.routeKey === "POST /rpdata/connect") {
      const id = requireUser()
      const { code, redirectUri } = parseConnectBody(event.body, deps.redirectOrigins, event.isBase64Encoded)
      status = 200
      return json(status, await tokens.connect(id, code, redirectUri))
    }
    if (event.routeKey === "DELETE /rpdata/connection") {
      await tokens.disconnect(requireUser())
      status = 204
      return { statusCode: status, headers: {}, body: "" }
    }
    if (event.routeKey === "GET /listings") {
      const q = parseListingsQuery(event.queryStringParameters ?? {})
      const token = await dataToken()
      const localityId = await client.suggestLocality(SUPPORTED_SUBURBS[q.suburb], token)
      const body = await client.searchForSale(localityId, q, token)
      status = 200
      return json(status, mapSearch(body, q.suburb, q.page))
    }
    if (event.routeKey === "GET /listings/{id}/campaign") {
      const id = parsePropertyId(event.pathParameters?.id)
      const campaign = mapCampaign(await client.saleCampaign(id, await dataToken()))
      status = campaign ? 200 : 404
      return json(status, campaign ?? { error: "No active sale campaign" })
    }
    status = 404
    return json(status, { error: "Not found" })
  } catch (e) {
    const [s, message] = toError(e)
    status = s
    errorName = e instanceof Error ? e.name : "Unknown"
    if (e instanceof RpDataError) {
      errorCode = e.code
      return json(status, { error: message, code: e.code })
    }
    return json(status, { error: message })
  } finally {
    log(
      JSON.stringify({
        requestId: event.requestContext?.requestId,
        route: event.routeKey,
        status,
        error: errorName,
        code: errorCode,
        ms: Date.now() - started,
      }),
    )
  }
}
