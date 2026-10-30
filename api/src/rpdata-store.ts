import { DynamoDBClient } from "@aws-sdk/client-dynamodb"
import { DecryptCommand, EncryptCommand, KMSClient } from "@aws-sdk/client-kms"
import {
  DynamoDBDocumentClient,
  GetCommand,
  TransactWriteCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb"

export interface LinkRecord {
  userId: string
  rpSub: string
  rpUsername: string
  accessToken: string
  accessExpiresAt: number
  refreshToken: string
  version: number
  refreshingUntil?: number
  linkedAt: number
  refreshedAt: number
}

export interface RefreshedTokens {
  accessToken: string
  accessExpiresAt: number
  refreshToken: string
  refreshedAt: number
}

export interface LinkStore {
  get(userId: string): Promise<LinkRecord | null>
  /** One transaction: put link, claim rpSub for userId, release previousRpSub if different. */
  link(rec: LinkRecord, previousRpSub: string | null): Promise<"ok" | "in-use">
  /** Sets refreshingUntil=until iff version matches and no refreshingUntil > now. */
  tryLease(userId: string, version: number, now: number, until: number): Promise<boolean>
  /** Writes new tokens, version+1, removes refreshingUntil, iff version matches. */
  saveRefreshed(userId: string, version: number, t: RefreshedTokens): Promise<boolean>
  clearLease(userId: string, version: number): Promise<void>
  /** One transaction: delete link and the rpSub claim. */
  unlink(userId: string, rpSub: string): Promise<void>
}

export interface Cipher {
  encrypt(plain: string): Promise<string>
  decrypt(cipher: string): Promise<string>
}

const CLAIM_CONFLICT = "RP Data account claim conflict"

export function createMemoryStore(): LinkStore {
  const links = new Map<string, LinkRecord>()
  const accounts = new Map<string, string>() // rpSub -> userId
  return {
    async get(userId) {
      const r = links.get(userId)
      return r ? { ...r } : null
    },
    async link(rec, previousRpSub) {
      const holder = accounts.get(rec.rpSub)
      if (holder !== undefined && holder !== rec.userId) return "in-use"
      const release = previousRpSub && previousRpSub !== rec.rpSub ? previousRpSub : null
      if (release) {
        const old = accounts.get(release)
        if (old !== undefined && old !== rec.userId) throw new Error(CLAIM_CONFLICT)
        accounts.delete(release)
      }
      accounts.set(rec.rpSub, rec.userId)
      links.set(rec.userId, { ...rec })
      return "ok"
    },
    async tryLease(userId, version, now, until) {
      const r = links.get(userId)
      if (!r || r.version !== version) return false
      if (r.refreshingUntil !== undefined && r.refreshingUntil > now) return false
      r.refreshingUntil = until
      return true
    },
    async saveRefreshed(userId, version, t) {
      const r = links.get(userId)
      if (!r || r.version !== version) return false
      Object.assign(r, t, { version: version + 1 })
      delete r.refreshingUntil
      return true
    },
    async clearLease(userId, version) {
      const r = links.get(userId)
      if (r && r.version === version) delete r.refreshingUntil
    },
    async unlink(userId, rpSub) {
      const holder = accounts.get(rpSub)
      if (holder !== undefined && holder !== userId) throw new Error(CLAIM_CONFLICT)
      links.delete(userId)
      accounts.delete(rpSub)
    },
  }
}

const errName = (e: unknown) => (e as { name?: string } | null)?.name

export function createDynamoStore(opts: {
  linksTable: string
  accountsTable: string
  cipher: Cipher
  doc?: DynamoDBDocumentClient
}): LinkStore {
  const { linksTable, accountsTable, cipher } = opts
  const doc = opts.doc ?? DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } })

  return {
    async get(userId) {
      const out = await doc.send(new GetCommand({ TableName: linksTable, Key: { userId } }))
      if (!out.Item) return null
      const item = out.Item as LinkRecord
      return {
        ...item,
        accessToken: await cipher.decrypt(item.accessToken),
        refreshToken: await cipher.decrypt(item.refreshToken),
      }
    },
    async link(rec, previousRpSub) {
      const item = {
        ...rec,
        accessToken: await cipher.encrypt(rec.accessToken),
        refreshToken: await cipher.encrypt(rec.refreshToken),
      }
      const items: NonNullable<TransactWriteCommand["input"]["TransactItems"]> = [
        { Put: { TableName: linksTable, Item: item } },
        {
          Put: {
            TableName: accountsTable,
            Item: { rpSub: rec.rpSub, userId: rec.userId },
            ConditionExpression: "attribute_not_exists(rpSub) OR userId = :me",
            ExpressionAttributeValues: { ":me": rec.userId },
          },
        },
      ]
      if (previousRpSub && previousRpSub !== rec.rpSub) {
        items.push({
          Delete: {
            TableName: accountsTable,
            Key: { rpSub: previousRpSub },
            ConditionExpression: "attribute_not_exists(rpSub) OR userId = :me",
            ExpressionAttributeValues: { ":me": rec.userId },
          },
        })
      }
      try {
        await doc.send(new TransactWriteCommand({ TransactItems: items }))
        return "ok"
      } catch (e) {
        const reasons = (e as { CancellationReasons?: { Code?: string }[] }).CancellationReasons
        if (errName(e) === "TransactionCanceledException" && reasons?.[1]?.Code === "ConditionalCheckFailed") {
          return "in-use"
        }
        if (errName(e) === "TransactionCanceledException" && reasons?.[2]?.Code === "ConditionalCheckFailed") {
          throw new Error(CLAIM_CONFLICT)
        }
        throw e
      }
    },
    async tryLease(userId, version, now, until) {
      try {
        await doc.send(
          new UpdateCommand({
            TableName: linksTable,
            Key: { userId },
            UpdateExpression: "SET refreshingUntil = :until",
            ConditionExpression:
              "attribute_exists(userId) AND version = :v AND (attribute_not_exists(refreshingUntil) OR refreshingUntil <= :now)",
            ExpressionAttributeValues: { ":until": until, ":v": version, ":now": now },
          }),
        )
        return true
      } catch (e) {
        if (errName(e) === "ConditionalCheckFailedException") return false
        throw e
      }
    },
    async saveRefreshed(userId, version, t) {
      try {
        await doc.send(
          new UpdateCommand({
            TableName: linksTable,
            Key: { userId },
            UpdateExpression:
              "SET accessToken = :at, accessExpiresAt = :ae, refreshToken = :rt, refreshedAt = :ra, version = :next REMOVE refreshingUntil",
            ConditionExpression: "attribute_exists(userId) AND version = :v",
            ExpressionAttributeValues: {
              ":at": await cipher.encrypt(t.accessToken),
              ":ae": t.accessExpiresAt,
              ":rt": await cipher.encrypt(t.refreshToken),
              ":ra": t.refreshedAt,
              ":next": version + 1,
              ":v": version,
            },
          }),
        )
        return true
      } catch (e) {
        if (errName(e) === "ConditionalCheckFailedException") return false
        throw e
      }
    },
    async clearLease(userId, version) {
      try {
        await doc.send(
          new UpdateCommand({
            TableName: linksTable,
            Key: { userId },
            UpdateExpression: "REMOVE refreshingUntil",
            ConditionExpression: "attribute_exists(userId) AND version = :v",
            ExpressionAttributeValues: { ":v": version },
          }),
        )
      } catch (e) {
        if (errName(e) !== "ConditionalCheckFailedException") throw e
      }
    },
    async unlink(userId, rpSub) {
      await doc.send(
        new TransactWriteCommand({
          TransactItems: [
            { Delete: { TableName: linksTable, Key: { userId } } },
            {
              Delete: {
                TableName: accountsTable,
                Key: { rpSub },
                ConditionExpression: "attribute_not_exists(rpSub) OR userId = :me",
                ExpressionAttributeValues: { ":me": userId },
              },
            },
          ],
        }),
      )
    },
  }
}

export function createKmsCipher(keyId: string, kms: KMSClient = new KMSClient({})): Cipher {
  return {
    async encrypt(plain) {
      const out = await kms.send(new EncryptCommand({ KeyId: keyId, Plaintext: new TextEncoder().encode(plain) }))
      if (!out.CiphertextBlob) throw new Error("KMS encrypt returned no ciphertext")
      return Buffer.from(out.CiphertextBlob).toString("base64")
    },
    async decrypt(cipher) {
      const out = await kms.send(new DecryptCommand({ KeyId: keyId, CiphertextBlob: Buffer.from(cipher, "base64") }))
      if (!out.Plaintext) throw new Error("KMS decrypt returned no plaintext")
      return new TextDecoder().decode(out.Plaintext)
    },
  }
}
