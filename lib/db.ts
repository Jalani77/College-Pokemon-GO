import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
const databaseName = process.env.MONGODB_DB || "outside";

declare global {
  var outsideMongo: Promise<MongoClient> | undefined;
}

export function databaseConfigured() {
  return Boolean(uri);
}

export async function getDatabase() {
  if (!uri) throw new Error("DATABASE_NOT_CONFIGURED");

  global.outsideMongo ??= new MongoClient(uri, {
    serverSelectionTimeoutMS: 5000,
  }).connect();

  const client = await global.outsideMongo;
  const database = client.db(databaseName);
  await Promise.all([
    database.collection("users").createIndex({ guestId: 1 }, { unique: true }),
    database.collection("cards").createIndex({ questId: 1 }, { unique: true, sparse: true }),
    database.collection("ownedCards").createIndex({ guestId: 1, questId: 1 }, { unique: true, partialFilterExpression: { questId: { $type: "string" } } }),
    database.collection("ownedCards").createIndex({ guestId: 1, cardId: 1 }, { unique: true }),
    database.collection("ownedCards").createIndex({ guestId: 1, discoveredAt: -1 }),
    database.collection("locations").createIndex({ coordinates: "2dsphere" }),
    database.collection("events").createIndex({ startsAt: 1 }),
  ]);
  return database;
}

export function mongoUnavailable(error: unknown) {
  if (!(error instanceof Error)) return false;
  if (["MongoServerSelectionError", "MongoNetworkError"].includes(error.name)) return true;
  const code = mongoFailureCode(error);
  return ["EBADNAME", "ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "ETIMEDOUT"].includes(code);
}

export function mongoFailureCode(error: unknown) {
  const pending: unknown[] = [error];
  const visited = new Set<object>();
  while (pending.length) {
    const current = pending.shift();
    if (!current || typeof current !== "object" || visited.has(current)) continue;
    visited.add(current);
    if ("code" in current && (typeof current.code === "string" || typeof current.code === "number")) {
      return String(current.code);
    }
    if ("cause" in current) pending.push(current.cause);
    if ("reason" in current && current.reason && typeof current.reason === "object") {
      if ("cause" in current.reason) pending.push(current.reason.cause);
      if ("servers" in current.reason && current.reason.servers instanceof Map) {
        for (const server of current.reason.servers.values()) {
          if (server && typeof server === "object" && "error" in server) pending.push(server.error);
        }
      }
    }
  }
  return "";
}