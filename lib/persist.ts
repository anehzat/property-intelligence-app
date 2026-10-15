/** localStorage helpers that never throw (private mode, blocked storage, SSR). */
export function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = globalThis.localStorage?.getItem(key)
    return raw == null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

export function saveJSON(key: string, value: unknown): void {
  try {
    if (value === null) globalThis.localStorage?.removeItem(key)
    else globalThis.localStorage?.setItem(key, JSON.stringify(value))
  } catch {
    // Storage unavailable: state stays in memory only.
  }
}
