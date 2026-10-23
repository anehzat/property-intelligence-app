import { CotalityError, type CotalityClient } from "./cotality.ts"
import { mapCampaign, mapSearch } from "./map.ts"
import { BadRequest, SUPPORTED_SUBURBS, parseListingsQuery, parsePropertyId } from "./params.ts"

export interface RouteEvent {
  routeKey: string
  queryStringParameters?: Record<string, string | undefined>
  pathParameters?: Record<string, string | undefined>
  requestContext?: { requestId?: string }
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
  if (e instanceof BadRequest) return [400, e.message]
  if (e instanceof CotalityError && e.status === 401) return [502, "Cotality authentication failed"]
  if (e instanceof CotalityError && e.status === 429) return [503, "Cotality quota exceeded, try later"]
  return [502, "Cotality unavailable"]
}

export async function route(
  event: RouteEvent,
  client: CotalityClient,
  log: (line: string) => void = console.log,
): Promise<RouteResult> {
  const started = Date.now()
  let status = 500
  let errorName: string | undefined
  try {
    if (event.routeKey === "GET /listings") {
      const q = parseListingsQuery(event.queryStringParameters ?? {})
      const localityId = await client.suggestLocality(SUPPORTED_SUBURBS[q.suburb])
      const body = await client.searchForSale(localityId, q)
      status = 200
      return json(status, mapSearch(body, q.suburb, q.page))
    }
    if (event.routeKey === "GET /listings/{id}/campaign") {
      const id = parsePropertyId(event.pathParameters?.id)
      const campaign = mapCampaign(await client.saleCampaign(id))
      status = campaign ? 200 : 404
      return json(status, campaign ?? { error: "No active sale campaign" })
    }
    status = 404
    return json(status, { error: "Not found" })
  } catch (e) {
    const [s, message] = toError(e)
    status = s
    errorName = e instanceof Error ? e.name : "Unknown"
    return json(status, { error: message })
  } finally {
    log(
      JSON.stringify({
        requestId: event.requestContext?.requestId,
        route: event.routeKey,
        status,
        error: errorName,
        ms: Date.now() - started,
      }),
    )
  }
}
