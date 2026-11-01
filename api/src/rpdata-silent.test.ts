import { test } from "node:test"
import assert from "node:assert/strict"
import { createHmac } from "node:crypto"
import { RPP_PRODUCTION, silentFrom, silentLoginUrl, silentTimestamp } from "./rpdata-silent.ts"

const creds = { apiKey: "key123", secret: "s3cret", rppBaseUrl: "https://rpp-uat.corelogic.com.au/rpp" }
const at = new Date("2026-11-02T03:04:05Z")
const hmac = (raw: string) => createHmac("sha256", "s3cret").update(raw, "utf8").digest("hex")

test("silentFrom needs both the API key and the secret", () => {
  assert.equal(silentFrom({}), null)
  assert.equal(silentFrom(null), null)
  assert.equal(silentFrom({ silentApiKey: "k" }), null)
  assert.equal(silentFrom({ silentApiKey: "", silentSecret: "s" }), null)
  assert.deepEqual(silentFrom({ silentApiKey: "k", silentSecret: "s" }), { apiKey: "k", secret: "s", rppBaseUrl: RPP_PRODUCTION })
  assert.equal(silentFrom({ silentApiKey: "k", silentSecret: "s", rppBaseUrl: "https://x/rpp/" })?.rppBaseUrl, "https://x/rpp")
})

test("silentTimestamp is UTC with an explicit offset", () => {
  assert.equal(silentTimestamp(at), "2026-11-02T03:04:05+00:00")
})

test("dashboard URL hashes the raw query and encodes only the timestamp", () => {
  const url = silentLoginUrl(creds, "tok.en.jwt", { page: "dashboard" }, at)
  const raw = "timestamp=2026-11-02T03:04:05+00:00&oauthToken=tok.en.jwt&apiKey=key123"
  assert.equal(
    url,
    "https://rpp-uat.corelogic.com.au/rpp/dashboard.html?timestamp=2026-11-02T03%3A04%3A05%2B00%3A00" +
      `&oauthToken=tok.en.jwt&apiKey=key123&hash=${hmac(raw)}`,
  )
})

test("property URL puts the page parameters first and hashes them too", () => {
  const url = new URL(silentLoginUrl(creds, "t", { page: "property", propertyId: 13036998 }, at))
  assert.equal(url.pathname, "/rpp/property/detail.html")
  assert.deepEqual([...url.searchParams.keys()], ["propertyId", "is_workflow", "showNavBtns", "timestamp", "oauthToken", "apiKey", "hash"])
  const raw = "propertyId=13036998&is_workflow=false&showNavBtns=false&timestamp=2026-11-02T03:04:05+00:00&oauthToken=t&apiKey=key123"
  assert.equal(url.searchParams.get("hash"), hmac(raw))
  assert.equal(url.searchParams.get("timestamp"), "2026-11-02T03:04:05+00:00")
})
