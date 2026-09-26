import { NextResponse } from "next/server";
import { z } from "zod";
import { getDatabase, mongoUnavailable } from "@/lib/db";

export async function POST(request: Request, context: { params: Promise<{ eventId: string }> }) {
  let guestId: string;
  try {
    guestId = z.string().uuid().parse((await request.json()).guestId);
  } catch {
    return NextResponse.json({ error: "A valid guest ID is required." }, { status: 400 });
  }
  const { eventId } = await context.params;
  try {
    const database = await getDatabase();
    const result = await database.collection<{ _id: string; startsAt: string; attendees: string[] }>("events").updateOne(
      { _id: eventId, startsAt: { $gt: new Date().toISOString() } },
      { $addToSet: { attendees: guestId } },
    );
    if (!result.matchedCount) return NextResponse.json({ error: "Upcoming group quest not found." }, { status: 404 });
    return NextResponse.json({ joined: true, alreadyJoined: !result.modifiedCount });
  } catch (error) {
    if (error instanceof Error && error.message === "DATABASE_NOT_CONFIGURED") return NextResponse.json({ error: "Local demo RSVP is stored on this device." }, { status: 503 });
    if (mongoUnavailable(error)) return NextResponse.json({ error: "MongoDB is currently unavailable." }, { status: 503 });
    return NextResponse.json({ error: "Could not join this group quest." }, { status: 500 });
  }
}