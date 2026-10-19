import { test } from "node:test"
import assert from "node:assert/strict"
import { formatDistance, formatRelative, statusLabel } from "./format.ts"

test("formatRelative buckets", () => {
  const now = Date.parse("2026-10-16T10:00:00Z")
  const ago = (ms: number) => new Date(now - ms).toISOString()
  assert.equal(formatRelative(ago(10_000), now), "just now")
  assert.equal(formatRelative(ago(5 * 60_000), now), "5 min ago")
  assert.equal(formatRelative(ago(3 * 3_600_000), now), "3 h ago")
  assert.equal(formatRelative(ago(26 * 3_600_000), now), "1 day ago")
  assert.equal(formatRelative(ago(-60_000), now), "just now")
})

test("statusLabel covers every status", () => {
  assert.deepEqual(statusLabel, {
    "for-sale": "For sale",
    "under-offer": "Under offer",
    sold: "Sold",
  })
})

test("formatDistance uses metres below 1km, km above", () => {
  assert.equal(formatDistance(170), "170m")
  assert.equal(formatDistance(1080), "1.1km")
  assert.equal(formatDistance(5040), "5.0km")
})
