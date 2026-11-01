import { test } from "node:test"
import assert from "node:assert/strict"
import { LEGAL_ENTRIES, loadLegal, toParagraphs } from "./legal.ts"

test("toParagraphs splits on <p> and strips every tag", () => {
  assert.deepEqual(
    toParagraphs("First <b>bold</b>.<p>© Copyright 2026.  All&nbsp;rights &amp; title.</p><script>x</script>"),
    ["First bold.", "© Copyright 2026. All rights & title.", "x"],
  )
  assert.deepEqual(toParagraphs("By using Product Data, you accept Cotality&#39;s <u>End User Terms</u>."), [
    "By using Product Data, you accept Cotality's End User Terms.",
  ])
  assert.deepEqual(toParagraphs("<p></p>  "), [])
})

test("loadLegal keeps the entry order and uses live wording", async () => {
  const asked: string[] = []
  const sections = await loadLegal(async (category, key) => {
    asked.push(`${category}/${key}`)
    return { key, content: `Live ${key}<p>second</p>` }
  })
  assert.deepEqual(asked, [
    "copyrights/clCopyright_au",
    "disclaimers/clData_anz",
    "disclaimers/stateNsw_au",
    "disclaimers/map_anz",
  ])
  assert.deepEqual(sections.map((s) => s.title), [
    "Australian Copyright Notice",
    "Cotality General Disclaimer",
    "New South Wales Data",
    "Maps",
  ])
  assert.deepEqual(sections[0].paragraphs, ["Live clCopyright_au", "second"])
})

test("loadLegal falls back per entry on a failure, a 404 or empty content", async () => {
  const sections = await loadLegal(async (_c, key) => {
    if (key === "clCopyright_au") throw new Error("boom")
    if (key === "clData_anz") return null
    if (key === "stateNsw_au") return { content: "<p> </p>" }
    return { content: "Live map" }
  })
  assert.deepEqual(sections[0].paragraphs, LEGAL_ENTRIES[0].fallback)
  assert.deepEqual(sections[1].paragraphs, LEGAL_ENTRIES[1].fallback)
  assert.deepEqual(sections[2].paragraphs, LEGAL_ENTRIES[2].fallback)
  assert.deepEqual(sections[3].paragraphs, ["Live map"])
})
