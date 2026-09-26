import { NextResponse } from "next/server";
import { z } from "zod";
import { getDatabase, mongoFailureCode, mongoUnavailable } from "@/lib/db";
import { readTicket } from "@/lib/tickets";

const guestSchema = z.string().uuid();

export async function GET(request: Request) {
  const guestId = new URL(request.url).searchParams.get("guestId");
  if (!guestSchema.safeParse(guestId).success) return NextResponse.json({ error: "Invalid guest ID." }, { status: 400 });
  try {
    const database = await getDatabase();
    const cards = await database.collection("ownedCards").find({ guestId }).sort({ discoveredAt: -1 }).toArray();
    return NextResponse.json({ cards, storage: "mongodb" });
  } catch (error) {
    if (error instanceof Error && /bad auth|authentication failed/i.test(error.message)) {
      return NextResponse.json({ cards: [], storage: "unavailable", error: "MongoDB rejected the database user's credentials. Verify the Atlas Database Access username and password, then URL-encode special characters in MONGODB_URI and restart." }, { status: 503 });
    }
    if (mongoUnavailable(error)) {
      const code = mongoFailureCode(error);
      const message = code === "EBADNAME"
        ? "MongoDB Atlas URI has an invalid hostname. Replace the <db_password> placeholder with your database user's password, URL-encode special characters, and restart the server."
        : code === "ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR"
          ? "MongoDB Atlas rejected the TLS handshake before authentication. Check Atlas Network Access for this Codespace's outbound IP and verify the cluster's current Node.js SRV URI. Keep TLS enabled."
        : "MongoDB is configured but could not be reached. Verify the Atlas URI and network access list.";
      return NextResponse.json({ cards: [], storage: "unavailable", error: message }, { status: 503 });
    }
    if (error instanceof Error && error.name === "MongoServerError" && mongoFailureCode(error) === "18") {
      return NextResponse.json({ cards: [], storage: "unavailable", error: "MongoDB rejected authentication. Verify the Atlas database username, password, and authentication database." }, { status: 503 });
    }
    if (error instanceof Error && error.name === "MongoParseError") {
      return NextResponse.json({ cards: [], storage: "unavailable", error: "MongoDB URI could not be parsed. Check the Atlas connection string format." }, { status: 503 });
    }
    if (error instanceof Error && error.message === "DATABASE_NOT_CONFIGURED") return NextResponse.json({ cards: [], storage: "local-demo" });
    console.error("Deck read failed:", error);
    return NextResponse.json({ error: "Could not load deck." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let body: { guestId: string; ticket: string };
  try {
    body = z.object({ guestId: guestSchema, ticket: z.string().min(20).max(8000) }).parse(await request.json());
  } catch {
    return NextResponse.json({ error: "A valid recognition ticket is required." }, { status: 400 });
  }
  const ticket = readTicket(body.ticket, body.guestId);
  if (!ticket) {
    if (!process.env.APP_SIGNING_SECRET || process.env.APP_SIGNING_SECRET.length < 32) {
      return NextResponse.json({ error: "Recognition signing is not configured. Set APP_SIGNING_SECRET to a stable value of at least 32 characters, then restart the server and rediscover the object." }, { status: 503 });
    }
    return NextResponse.json({ error: "This recognition proof is invalid or expired. Discover the object again." }, { status: 403 });
  }

  try {
    const database = await getDatabase();
    await database.collection("users").updateOne(
      { guestId: body.guestId },
      { $setOnInsert: { guestId: body.guestId, createdAt: new Date() } },
      { upsert: true },
    );
    await database.collection<{ _id: string } & Record<string, unknown>>("cards").updateOne(
      { _id: ticket.card.id },
      { $setOnInsert: { ...ticket.card } },
      { upsert: true },
    );
    const result = await database.collection("ownedCards").updateOne(
      { guestId: body.guestId, cardId: ticket.card.id },
      { $setOnInsert: { ...ticket.card, cardId: ticket.card.id, guestId: body.guestId, wishlist: false } },
      { upsert: true },
    );
    return NextResponse.json({ card: ticket.card, storage: "mongodb", alreadySaved: result.upsertedCount === 0 });
  } catch (error) {
    if (error instanceof Error && (/bad auth|authentication failed/i.test(error.message) || ["18", "8000"].includes(mongoFailureCode(error)))) {
      return NextResponse.json({ error: "MongoDB rejected the database user's credentials. This card was not saved; verify the Atlas Database Access username and password, URL-encode special characters in MONGODB_URI, and retry." }, { status: 503 });
    }
    if (error instanceof Error && error.message === "DATABASE_NOT_CONFIGURED") {
      return NextResponse.json({ error: "MongoDB is not configured. This card was not saved; add MONGODB_URI to .env.local and restart." }, { status: 503 });
    }
    if (mongoUnavailable(error)) {
      return NextResponse.json({ error: "MongoDB could not be reached. This card was not saved; verify the Atlas URI, database password, and network access list." }, { status: 503 });
    }
    console.error("Card save failed:", error);
    return NextResponse.json({ error: "Could not save card." }, { status: 500 });
  }
}