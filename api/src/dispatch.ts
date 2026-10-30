import { route, type RouteDeps, type RouteEvent, type RouteResult } from "./routes.ts"

/** "user" only for exactly "user". Call this only with a secret that loaded. */
export function dataAuthFrom(secret: unknown): "client" | "user" {
  return (secret as { dataAuth?: unknown } | null)?.dataAuth === "user" ? "user" : "client"
}

let loggedMode: "client" | "user" | undefined

/** Fails closed: if the secret cannot be loaded, nothing is called and the answer is 502. */
export async function handle(
  event: RouteEvent,
  loadSecret: () => Promise<unknown>,
  makeDeps: (dataAuth: "client" | "user") => RouteDeps,
  log: (line: string) => void = console.log,
): Promise<RouteResult> {
  let dataAuth: "client" | "user"
  try {
    dataAuth = dataAuthFrom(await loadSecret())
  } catch {
    log(JSON.stringify({ requestId: event.requestContext?.requestId, route: event.routeKey, status: 502, error: "SecretLoad" }))
    return {
      statusCode: 502,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "Cotality unavailable" }),
    }
  }
  if (loggedMode !== dataAuth) {
    loggedMode = dataAuth
    log(JSON.stringify({ event: "data_auth_mode", mode: dataAuth }))
  }
  return route(event, makeDeps(dataAuth), log)
}
