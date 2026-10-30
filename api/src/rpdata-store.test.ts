import { test } from "node:test"
import assert from "node:assert/strict"
import { TransactWriteCommand } from "@aws-sdk/lib-dynamodb"
import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb"
import { createDynamoStore, createMemoryStore } from "./rpdata-store.ts"
import type { LinkRecord } from "./rpdata-store.ts"

const rec = (userId: string, rpSub: string, extra: Partial<LinkRecord> = {}): LinkRecord => ({
  userId,
  rpSub,
  rpUsername: "rp-user",
  accessToken: "a1",
  accessExpiresAt: 1000,
  refreshToken: "r1",
  version: 0,
  linkedAt: 1,
  refreshedAt: 1,
  ...extra,
})

test("link stores a record and claims the rp account", async () => {
  const s = createMemoryStore()
  assert.equal(await s.link(rec("u1", "sub1"), null), "ok")
  assert.equal((await s.get("u1"))?.rpSub, "sub1")
  assert.equal(await s.link(rec("u2", "sub1"), null), "in-use")
})

test("link returns in-use when another user holds rpSub and stores nothing", async () => {
  const s = createMemoryStore()
  await s.link(rec("u1", "sub1"), null)
  assert.equal(await s.link(rec("u2", "sub1"), null), "in-use")
  assert.equal(await s.get("u2"), null)
})

test("link by the same user again is ok", async () => {
  const s = createMemoryStore()
  await s.link(rec("u1", "sub1"), null)
  assert.equal(await s.link(rec("u1", "sub1", { accessToken: "a2" }), "sub1"), "ok")
  assert.equal((await s.get("u1"))?.accessToken, "a2")
})

test("link with a different previousRpSub frees the old claim", async () => {
  const s = createMemoryStore()
  await s.link(rec("u1", "sub1"), null)
  assert.equal(await s.link(rec("u1", "sub2"), "sub1"), "ok")
  assert.equal(await s.link(rec("u2", "sub1"), null), "ok")
  assert.equal(await s.link(rec("u3", "sub2"), null), "in-use")
})

test("tryLease fails on a version mismatch and while another lease is unexpired, succeeds after it expires", async () => {
  const s = createMemoryStore()
  await s.link(rec("u1", "sub1"), null)
  assert.equal(await s.tryLease("u1", 5, 100, 130), false)
  assert.equal(await s.tryLease("u1", 0, 100, 130), true)
  assert.equal(await s.tryLease("u1", 0, 110, 140), false)
  assert.equal(await s.tryLease("u1", 0, 130, 160), true)
  assert.equal((await s.get("u1"))?.refreshingUntil, 160)
})

test("saveRefreshed increments version and clears the lease; a stale version returns false", async () => {
  const s = createMemoryStore()
  await s.link(rec("u1", "sub1"), null)
  await s.tryLease("u1", 0, 100, 130)
  const t = { accessToken: "a2", accessExpiresAt: 2000, refreshToken: "r2", refreshedAt: 50 }
  assert.equal(await s.saveRefreshed("u1", 0, t), true)
  const got = await s.get("u1")
  assert.equal(got?.version, 1)
  assert.equal(got?.refreshingUntil, undefined)
  assert.equal(got?.refreshToken, "r2")
  assert.equal(await s.saveRefreshed("u1", 0, t), false)
})

test("link with a previousRpSub that no longer exists succeeds", async () => {
  const s = createMemoryStore()
  assert.equal(await s.link(rec("u1", "sub2"), "gone"), "ok")
})

test("link with a previousRpSub held by another user throws and stores nothing", async () => {
  const s = createMemoryStore()
  await s.link(rec("u2", "sub1"), null)
  await assert.rejects(s.link(rec("u1", "sub2"), "sub1"), /RP Data account claim conflict/)
  assert.equal(await s.get("u1"), null)
  assert.equal(await s.link(rec("u3", "sub2"), null), "ok")
})

test("unlink when the claim is held by another user throws and keeps the link", async () => {
  const s = createMemoryStore()
  await s.link(rec("u2", "sub1"), null)
  await s.link(rec("u1", "sub9"), null)
  await assert.rejects(s.unlink("u1", "sub1"), /RP Data account claim conflict/)
  assert.ok(await s.get("u1"))
})

test("link sends the old-claim delete with attribute_not_exists(rpSub) OR userId = :me", async () => {
  const f = fakeDoc(() => {
    throw Object.assign(new Error("x"), {
      name: "TransactionCanceledException",
      CancellationReasons: [{ Code: "None" }, { Code: "None" }, { Code: "ConditionalCheckFailed" }],
    })
  })
  const s = createDynamoStore({ linksTable: "L", accountsTable: "A", cipher, doc: f.doc })
  await assert.rejects(s.link(rec("u1", "sub2"), "sub1"), /RP Data account claim conflict/)
  const items = (f.sent[0] as TransactWriteCommand).input.TransactItems!
  assert.equal(items[2].Delete?.ConditionExpression, "attribute_not_exists(rpSub) OR userId = :me")
})

test("clearLease removes the lease only for the matching version", async () => {
  const s = createMemoryStore()
  await s.link(rec("u1", "sub1"), null)
  await s.tryLease("u1", 0, 100, 130)
  await s.clearLease("u1", 9)
  assert.equal((await s.get("u1"))?.refreshingUntil, 130)
  await s.clearLease("u1", 0)
  assert.equal((await s.get("u1"))?.refreshingUntil, undefined)
})

test("unlink removes both the link and the claim", async () => {
  const s = createMemoryStore()
  await s.link(rec("u1", "sub1"), null)
  await s.unlink("u1", "sub1")
  assert.equal(await s.get("u1"), null)
  assert.equal(await s.link(rec("u2", "sub1"), null), "ok")
})

const cipher = {
  encrypt: async (p: string) => `enc(${p})`,
  decrypt: async (c: string) => c.slice(4, -1),
}

function fakeDoc(handler: (cmd: unknown) => unknown) {
  const sent: unknown[] = []
  const doc = {
    send: async (cmd: unknown) => {
      sent.push(cmd)
      return handler(cmd)
    },
  } as unknown as DynamoDBDocumentClient
  return { doc, sent }
}

test("createDynamoStore link sends a TransactWriteCommand with the accounts condition", async () => {
  const f = fakeDoc(() => ({}))
  const s = createDynamoStore({ linksTable: "L", accountsTable: "A", cipher, doc: f.doc })
  assert.equal(await s.link(rec("u1", "sub2"), "sub1"), "ok")
  const cmd = f.sent[0] as TransactWriteCommand
  assert.ok(cmd instanceof TransactWriteCommand)
  const items = cmd.input.TransactItems!
  assert.equal(items.length, 3)
  assert.equal(items[0].Put?.TableName, "L")
  assert.equal(items[0].Put?.Item?.accessToken, "enc(a1)")
  assert.equal(items[0].Put?.Item?.refreshToken, "enc(r1)")
  assert.equal(items[1].Put?.TableName, "A")
  assert.equal(items[1].Put?.ConditionExpression, "attribute_not_exists(rpSub) OR userId = :me")
  assert.equal(items[2].Delete?.Key?.rpSub, "sub1")
  assert.equal(items[2].Delete?.ConditionExpression, "attribute_not_exists(rpSub) OR userId = :me")
})

test("createDynamoStore maps a cancelled accounts claim to in-use and rethrows other errors", async () => {
  const cancelled = Object.assign(new Error("x"), {
    name: "TransactionCanceledException",
    CancellationReasons: [{ Code: "None" }, { Code: "ConditionalCheckFailed" }],
  })
  const s = createDynamoStore({
    linksTable: "L",
    accountsTable: "A",
    cipher,
    doc: fakeDoc(() => {
      throw cancelled
    }).doc,
  })
  assert.equal(await s.link(rec("u1", "sub1"), null), "in-use")
  const boom = createDynamoStore({
    linksTable: "L",
    accountsTable: "A",
    cipher,
    doc: fakeDoc(() => {
      throw new Error("boom")
    }).doc,
  })
  await assert.rejects(boom.link(rec("u1", "sub1"), null), /boom/)
})

test("createDynamoStore get decrypts tokens and tryLease maps a failed condition to false", async () => {
  const f = fakeDoc((cmd) => {
    if ((cmd as { constructor: { name: string } }).constructor.name === "GetCommand")
      return { Item: { ...rec("u1", "sub1"), accessToken: "enc(a1)", refreshToken: "enc(r1)" } }
    throw Object.assign(new Error("c"), { name: "ConditionalCheckFailedException" })
  })
  const s = createDynamoStore({ linksTable: "L", accountsTable: "A", cipher, doc: f.doc })
  const got = await s.get("u1")
  assert.equal(got?.accessToken, "a1")
  assert.equal(got?.refreshToken, "r1")
  assert.equal(await s.tryLease("u1", 0, 1, 2), false)
})
