import { NextResponse } from "next/server";
import { z } from "zod";
import { getDatabase, mongoUnavailable } from "@/lib/db";

const claimSchema = z.object({ guestId: z.string().uuid(), locationId: z.string().min(1).max(100) });

export async function POST(request: Request) {
  let body: z.infer<typeof claimSchema>;
  try {
    body = claimSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "A valid user and quest location are required." }, { status: 400 });
  }

  try {
    const database = await getDatabase();
    const location = await database.collection<{ _id: string; cardName: string; cardCategory: string; verifiedFact: string }>("locations").findOne({ _id: body.locationId });
    if (!location) return NextResponse.json({ error: "Quest location not found." }, { status: 404 });
    const card = {
      id: `quest-${location._id.toString()}`,
      name: String(location.cardName),
      category: String(location.cardCategory),
      shortFact: String(location.verifiedFact),
      rarity: "rare" as const,
      xp: 25,
      source: "verified-quest" as const,
      discoveredAt: new Date().toISOString(),
      questId: location._id.toString(),
    };
    await database.collection("users").updateOne({ guestId: body.guestId }, { $setOnInsert: { guestId: body.guestId, createdAt: new Date() } }, { upsert: true });
    await database.collection<{ _id: string } & Record<string, unknown>>("cards").updateOne({ _id: card.id }, { $setOnInsert: { ...card } }, { upsert: true });
    const result = await database.collection("ownedCards").updateOne(
      { guestId: body.guestId, questId: card.questId },
      { $setOnInsert: { ...card, cardId: card.id, guestId: body.guestId, wishlist: false } },
      { upsert: true },
    );
    if (!result.upsertedCount) return NextResponse.json({ error: "You have already completed this quest. XP cannot be earned twice." }, { status: 409 });
    return NextResponse.json({ card, storage: "mongodb" }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "DATABASE_NOT_CONFIGURED") return NextResponse.json({ error: "Verified quest claims need MongoDB. Use the clearly labeled local demo instead." }, { status: 503 });
    if (mongoUnavailable(error)) return NextResponse.json({ error: "MongoDB is currently unavailable." }, { status: 503 });
    if (error && typeof error === "object" && "code" in error && error.code === 11000) {
      return NextResponse.json({ error: "You have already completed this quest. XP cannot be earned twice." }, { status: 409 });
    }
    console.error("Quest claim failed:", error);
    return NextResponse.json({ error: "Could not claim this quest." }, { status: 500 });
  }
}