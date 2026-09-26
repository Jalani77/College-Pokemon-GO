import { NextResponse } from "next/server";
import { z } from "zod";
import { getDatabase, mongoUnavailable } from "@/lib/db";

const schema = z.object({ guestId: z.string().uuid(), cardName: z.string().trim().min(2).max(80), action: z.enum(["add", "remove"]) });

export async function GET(request: Request) {
  const guestId = new URL(request.url).searchParams.get("guestId");
  const parsedGuestId = z.string().uuid().safeParse(guestId);
  if (!parsedGuestId.success) return NextResponse.json({ error: "Invalid guest ID." }, { status: 400 });
  const validGuestId = parsedGuestId.data;
  try {
    const database = await getDatabase();
    const user = await database.collection<{ guestId: string; lookingFor?: string[] }>("users").findOne({ guestId: validGuestId });
    const names = Array.isArray(user?.lookingFor) ? user.lookingFor : [];
    const matches = await database.collection<{ guestId: string; lookingFor?: string[] }>("users").find({ guestId: { $ne: validGuestId }, lookingFor: { $in: names } }, { projection: { guestId: 1, lookingFor: 1 } }).toArray();
    return NextResponse.json({ names, matches: matches.flatMap((match) => (match.lookingFor as string[]).filter((name) => names.includes(name)).map((name) => ({ name, explorer: `explorer-${String(match.guestId).slice(0, 4)}` }))), storage: "mongodb" });
  } catch (error) {
    if (error instanceof Error && error.message === "DATABASE_NOT_CONFIGURED") return NextResponse.json({ names: [], matches: [], storage: "local-demo" });
    if (mongoUnavailable(error)) return NextResponse.json({ error: "MongoDB is currently unavailable." }, { status: 503 });
    return NextResponse.json({ error: "Could not load community wishlist." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Enter a card name." }, { status: 400 });
  }
  try {
    const database = await getDatabase();
    const users = database.collection<{ guestId: string; lookingFor?: string[] }>("users");
    if (body.action === "add") {
      await users.updateOne(
        { guestId: body.guestId },
        { $addToSet: { lookingFor: body.cardName }, $setOnInsert: { createdAt: new Date() } },
        { upsert: true },
      );
    } else {
      await users.updateOne({ guestId: body.guestId }, { $pull: { lookingFor: body.cardName } });
    }
    return NextResponse.json({ saved: true, storage: "mongodb" });
  } catch (error) {
    if (error instanceof Error && error.message === "DATABASE_NOT_CONFIGURED") return NextResponse.json({ error: "Local demo wishlist is stored on this device." }, { status: 503 });
    if (mongoUnavailable(error)) return NextResponse.json({ error: "MongoDB is currently unavailable." }, { status: 503 });
    return NextResponse.json({ error: "Could not update community wishlist." }, { status: 500 });
  }
}