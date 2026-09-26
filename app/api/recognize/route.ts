import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { issueTicket, ticketSigningConfigured } from "@/lib/tickets";
import { recognizeImage } from "@/lib/vision";

const requestSchema = z.object({
  guestId: z.string().uuid(),
  imageData: z.string().max(1_400_000),
  focusLabel: z.string().trim().min(2).max(60).optional(),
});

export async function POST(request: Request) {
  if (Number(request.headers.get("content-length") || 0) > 1_500_000) {
    return NextResponse.json({ error: "Photo is too large. Capture again with a smaller image." }, { status: 413 });
  }

  let body: z.infer<typeof requestSchema>;
  try {
    body = requestSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "A valid guest ID and compressed photo are required." }, { status: 400 });
  }

  const imageMatch = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+=*)$/.exec(body.imageData);
  if (!imageMatch) {
    return NextResponse.json({ error: "Use a JPEG, PNG, or WebP still image." }, { status: 400 });
  }
  const imageBytes = Buffer.from(imageMatch[2], "base64");
  const actualType = imageBytes[0] === 0xff && imageBytes[1] === 0xd8 && imageBytes[2] === 0xff
    ? "jpeg"
    : imageBytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      ? "png"
      : imageBytes.subarray(0, 4).toString("ascii") === "RIFF" && imageBytes.subarray(8, 12).toString("ascii") === "WEBP"
        ? "webp"
        : "unknown";
  if (actualType !== imageMatch[1]) return NextResponse.json({ error: "Photo content does not match its image type." }, { status: 400 });
  if (!ticketSigningConfigured()) {
    return NextResponse.json({ error: "Recognition saving is not configured. Set APP_SIGNING_SECRET to a stable value of at least 32 characters in .env.local, then restart the server." }, { status: 503 });
  }

  try {
    const recognition = await recognizeImage(body.imageData, body.focusLabel);
    const uncertain = recognition.uncertain;
    const card = {
      id: randomUUID(),
      name: uncertain ? "Unidentified object" : recognition.objectName,
      category: recognition.category,
      shortFact: recognition.shortFact,
      rarity: "common" as const,
      xp: uncertain ? 5 : 10,
      source: "ai" as const,
      uncertaintyNote: uncertain ? (recognition.uncertaintyNote || "The image does not support a confident identification.") : undefined,
      discoveredAt: new Date().toISOString(),
    };

    const imageHash = createHash("sha256").update(body.imageData).digest("hex");
    return NextResponse.json({ recognition: { ...recognition, uncertain }, card, ticket: issueTicket({ guestId: body.guestId, card, imageHash, subjectType: recognition.subjectType, issuedAt: Date.now() }) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "RECOGNITION_FAILED";
    if (message === "AI_NOT_CONFIGURED") {
      return NextResponse.json({ error: "AI not configured. Add XAI_API_KEY (or VISION_API_KEY) to .env.local to identify photos." }, { status: 503 });
    }
    if (message === "SIGNING_SECRET_NOT_CONFIGURED") {
      return NextResponse.json({ error: "Set APP_SIGNING_SECRET in .env.local, then restart the server." }, { status: 503 });
    }
    console.error("Vision recognition failed:", message);
    return NextResponse.json({ error: "Recognition did not complete. Check the photo and try again." }, { status: 502 });
  }
}