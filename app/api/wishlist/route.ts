import { NextResponse } from "next/server";
import { z } from "zod";
import { getDatabase, mongoUnavailable } from "@/lib/db";

const schema = z.object({
  guestId: z.string().uuid(),
  cardName: z.string().trim().min(2).max(80).optional(),
  action: z.enum(["add", "remove", "profile"]),
  displayName: z.string().trim().max(40).optional(),
  visibilityOptIn: z.boolean().optional(),
}).refine((body) => body.action === "profile" || Boolean(body.cardName), "Enter a card name.")
  .refine((body) => body.action !== "profile" || body.visibilityOptIn !== true || Boolean(body.displayName?.trim()), "Choose a display name before opting in.");

type WishlistUser = { guestId: string; lookingFor?: string[]; displayName?: string; visibilityOptIn?: boolean };

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function GET(request: Request) {
  const guestId = new URL(request.url).searchParams.get("guestId");
  const parsedGuestId = z.string().uuid().safeParse(guestId);
  if (!parsedGuestId.success) return NextResponse.json({ error: "Invalid guest ID." }, { status: 400 });
  const validGuestId = parsedGuestId.data;
  const cardName = new URL(request.url).searchParams.get("cardName")?.trim();
  try {
    const database = await getDatabase();
    const users = database.collection<WishlistUser>("users");
    const user = await users.findOne({ guestId: validGuestId });
    const names = Array.isArray(user?.lookingFor) ? user.lookingFor : [];
    const publicProfileFilter = { visibilityOptIn: true, displayName: { $type: "string", $ne: "" } };
    const matches = names.length ? await users.find({ guestId: { $ne: validGuestId }, ...publicProfileFilter, lookingFor: { $in: names } }, { projection: { displayName: 1, lookingFor: 1 } }).toArray() : [];
    const wantedBy = cardName ? await users.find({
      guestId: { $ne: validGuestId },
      ...publicProfileFilter,
      lookingFor: { $regex: `^${escapeRegex(cardName)}$`, $options: "i" },
    }, { projection: { displayName: 1 } }).toArray() : [];
    return NextResponse.json({
      names,
      displayName: user?.displayName || "",
      visibilityOptIn: Boolean(user?.visibilityOptIn),
      matches: matches.flatMap((match) => (match.lookingFor || []).filter((name) => names.some((ownName) => ownName.toLowerCase() === name.toLowerCase())).map((name) => ({ name, displayName: match.displayName! }))),
      wantedBy: wantedBy.map((person) => person.displayName!),
      storage: "mongodb",
    });
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
    const users = database.collection<WishlistUser>("users");
    if (body.action === "profile") {
      await users.updateOne(
        { guestId: body.guestId },
        { $set: { displayName: body.displayName?.trim() || "", visibilityOptIn: Boolean(body.visibilityOptIn) }, $setOnInsert: { createdAt: new Date() } },
        { upsert: true },
      );
      return NextResponse.json({ saved: true, storage: "mongodb" });
    }
    if (body.action === "add") {
      await users.updateOne(
        { guestId: body.guestId },
        { $addToSet: { lookingFor: body.cardName }, $setOnInsert: { createdAt: new Date() } },
        { upsert: true },
      );
    } else {
      await users.updateOne({ guestId: body.guestId }, { $pull: { lookingFor: body.cardName! } });
    }
    return NextResponse.json({ saved: true, storage: "mongodb" });
  } catch (error) {
    if (error instanceof Error && error.message === "DATABASE_NOT_CONFIGURED") return NextResponse.json({ error: "Local demo wishlist is stored on this device." }, { status: 503 });
    if (mongoUnavailable(error)) return NextResponse.json({ error: "MongoDB is currently unavailable." }, { status: 503 });
    return NextResponse.json({ error: "Could not update community wishlist." }, { status: 500 });
  }
}