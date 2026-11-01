import { test } from "node:test"
import assert from "node:assert/strict"
import { disclaimersUrl, isDisclaimers } from "./legal.ts"

test("disclaimersUrl trims the base", () => {
  assert.equal(disclaimersUrl("https://api.test/"), "https://api.test/legal/disclaimers")
})

test("isDisclaimers needs at least one well-formed section", () => {
  assert.equal(isDisclaimers({ sections: [{ key: "k", title: "T", paragraphs: ["p"] }] }), true)
  assert.equal(isDisclaimers({ sections: [] }), false)
  assert.equal(isDisclaimers({ sections: [{ title: "T", paragraphs: [1] }] }), false)
  assert.equal(isDisclaimers({ sections: [null] }), false)
  assert.equal(isDisclaimers(null), false)
})
