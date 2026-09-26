import { NextResponse } from "next/server";
import { z } from "zod";
import { getDatabase, mongoUnavailable } from "@/lib/db";

const updateSchema = z.object({ guestId: z.string().uuid(), wishlist: z.boolean() });

export async function PATCH(request: Request, context: { params: Promise<{ cardId: string }> }) {
  let body: z.infer<typeof updateSchema>;
  try {
    body = updateSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid wishlist update." }, { status: 400 });
  }
  const { cardId } = await context.params;
  try {
    const database = await getDatabase();
    const result = await database.collection("ownedCards").updateOne({ guestId: body.guestId, cardId }, { $set: { wishlist: body.wishlist } });
    if (!result.matchedCount) return NextResponse.json({ error: "Card not found in this deck." }, { status: 404 });
    return NextResponse.json({ saved: true, wishlist: body.wishlist });
  } catch (error) {
    if (error instanceof Error && error.message === "DATABASE_NOT_CONFIGURED") return NextResponse.json({ error: "Local demo wishlist is stored on this device." }, { status: 503 });
    if (mongoUnavailable(error)) return NextResponse.json({ error: "MongoDB is currently unavailable." }, { status: 503 });
    return NextResponse.json({ error: "Could not update wishlist." }, { status: 500 });
  }
}