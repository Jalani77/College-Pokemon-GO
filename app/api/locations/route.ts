import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDatabase, mongoUnavailable } from "@/lib/db";

const locationSchema = z.object({
  name: z.string().trim().min(3).max(100),
  clue: z.string().trim().min(8).max(220),
  cardName: z.string().trim().min(2).max(80),
  cardCategory: z.string().trim().min(2).max(50),
  verifiedFact: z.string().trim().min(12).max(240),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

function isAdmin(request: Request) {
  return Boolean(process.env.ADMIN_TOKEN) && request.headers.get("x-admin-token") === process.env.ADMIN_TOKEN;
}

export async function GET() {
  try {
    const database = await getDatabase();
    const locations = await database.collection<{ _id: string } & Record<string, unknown>>("locations").find({}).sort({ createdAt: -1 }).toArray();
    return NextResponse.json({ locations: locations.map(({ _id, ...location }) => ({ ...location, id: _id.toString() })), storage: "mongodb" });
  } catch (error) {
    if (error instanceof Error && error.message === "DATABASE_NOT_CONFIGURED") return NextResponse.json({ locations: [], storage: "local-demo" });
    if (mongoUnavailable(error)) return NextResponse.json({ error: "MongoDB is configured but unavailable." }, { status: 503 });
    console.error("Location read failed:", error);
    return NextResponse.json({ error: "Could not load quest locations." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isAdmin(request)) return NextResponse.json({ error: "Quest creation requires the server-side ADMIN_TOKEN." }, { status: 401 });
  let body: z.infer<typeof locationSchema>;
  try {
    body = locationSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Complete every field with a verified name, fact, and real coordinates." }, { status: 400 });
  }

  try {
    const database = await getDatabase();
    const id = randomUUID();
    await database.collection<{ _id: string } & Record<string, unknown>>("locations").insertOne({ ...body, _id: id, coordinates: { type: "Point", coordinates: [body.lng, body.lat] }, createdAt: new Date(), verifiedByOrganizer: true });
    return NextResponse.json({ location: { ...body, id }, storage: "mongodb" }, { status: 201 });
  } catch (error) {
    if (mongoUnavailable(error) || (error instanceof Error && error.message === "DATABASE_NOT_CONFIGURED")) {
      return NextResponse.json({ error: "A verified quest location can only be published when MongoDB is connected." }, { status: 503 });
    }
    console.error("Quest creation failed:", error);
    return NextResponse.json({ error: "Could not publish quest location." }, { status: 500 });
  }
}