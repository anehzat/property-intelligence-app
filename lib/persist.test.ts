import { afterEach, test } from "node:test"
import assert from "node:assert/strict"
import { loadJSON, saveJSON } from "./persist.ts"

function installStorage(impl: Partial<Storage> | undefined) {
  Object.defineProperty(globalThis, "localStorage", { value: impl, configurable: true, writable: true })
}

function memoryStorage(): Storage {
  const m = new Map<string, string>()
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
    key: () => null,
    get length() { return m.size },
  }
}

afterEach(() => installStorage(undefined))

test("returns fallback when storage is missing", () => {
  installStorage(undefined)
  assert.deepEqual(loadJSON("k", ["x"]), ["x"])
  saveJSON("k", [1]) // must not throw
})

test("round-trips values and removes on null", () => {
  installStorage(memoryStorage())
  saveJSON("k", { a: 1 })
  assert.deepEqual(loadJSON("k", null), { a: 1 })
  saveJSON("k", null)
  assert.equal(loadJSON("k", "fallback"), "fallback")
})

test("corrupt JSON falls back", () => {
  const s = memoryStorage()
  s.setItem("k", "{not json")
  installStorage(s)
  assert.equal(loadJSON("k", 7), 7)
})

test("throwing storage (private mode) never throws", () => {
  installStorage({
    getItem: () => { throw new Error("denied") },
    setItem: () => { throw new Error("denied") },
    removeItem: () => { throw new Error("denied") },
  })
  assert.equal(loadJSON("k", 1), 1)
  assert.doesNotThrow(() => saveJSON("k", 2))
  assert.doesNotThrow(() => saveJSON("k", null))
})
