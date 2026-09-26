import { NextResponse } from "next/server";
import { z } from "zod";
import { getDatabase, mongoUnavailable } from "@/lib/db";
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
    if (mongoUnavailable(error)) return NextResponse.json({ cards: [], storage: "unavailable", error: "MongoDB is configured but could not be reached." }, { status: 503 });
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
  if (!ticket) return NextResponse.json({ error: "This recognition expired. Discover the object again." }, { status: 403 });

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
    if (mongoUnavailable(error) || (error instanceof Error && error.message === "DATABASE_NOT_CONFIGURED")) {
      return NextResponse.json({ error: "MongoDB is unavailable. This card was not saved; local demo mode is not server persistence." }, { status: 503 });
    }
    console.error("Card save failed:", error);
    return NextResponse.json({ error: "Could not save card." }, { status: 500 });
  }
}