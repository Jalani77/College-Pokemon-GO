import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDatabase, mongoUnavailable } from "@/lib/db";

const eventSchema = z.object({
  title: z.string().trim().min(4).max(100),
  description: z.string().trim().min(12).max(260),
  meetingPoint: z.string().trim().min(3).max(140),
  startsAt: z.string().datetime().refine((value) => new Date(value).getTime() > Date.now(), "Event must be in the future."),
  rewardCard: z.string().trim().min(2).max(80),
  organizer: z.string().trim().min(2).max(40),
});

export async function GET() {
  try {
    const database = await getDatabase();
    const events = await database.collection<{ _id: string } & Record<string, unknown>>("events").find({ startsAt: { $gte: new Date().toISOString() } }).sort({ startsAt: 1 }).toArray();
    return NextResponse.json({ events: events.map(({ _id, ...event }) => ({ ...event, id: _id.toString() })), storage: "mongodb" });
  } catch (error) {
    if (error instanceof Error && error.message === "DATABASE_NOT_CONFIGURED") return NextResponse.json({ events: [], storage: "local-demo" });
    if (mongoUnavailable(error)) return NextResponse.json({ error: "MongoDB is configured but unavailable." }, { status: 503 });
    console.error("Event read failed:", error);
    return NextResponse.json({ error: "Could not load group quests." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!process.env.ADMIN_TOKEN || request.headers.get("x-admin-token") !== process.env.ADMIN_TOKEN) {
    return NextResponse.json({ error: "Event creation requires the server-side ADMIN_TOKEN." }, { status: 401 });
  }
  let body: z.infer<typeof eventSchema>;
  try {
    body = eventSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Enter a future date and complete the organizer, meeting point, and reward." }, { status: 400 });
  }

  try {
    const database = await getDatabase();
    const event = { ...body, attendees: [], createdAt: new Date() };
    const id = randomUUID();
    await database.collection<{ _id: string } & Record<string, unknown>>("events").insertOne({ ...event, _id: id });
    return NextResponse.json({ event: { ...event, id }, storage: "mongodb" }, { status: 201 });
  } catch (error) {
    if (mongoUnavailable(error) || (error instanceof Error && error.message === "DATABASE_NOT_CONFIGURED")) {
      return NextResponse.json({ error: "Events can be published only when MongoDB is connected." }, { status: 503 });
    }
    console.error("Event creation failed:", error);
    return NextResponse.json({ error: "Could not create group quest." }, { status: 500 });
  }
}