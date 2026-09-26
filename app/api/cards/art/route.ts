import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { issueArtworkTicket, readTicket } from "@/lib/tickets";

const requestSchema = z.object({
  guestId: z.string().uuid(),
  recognitionTicket: z.string().min(40).max(10000),
  imageData: z.string().max(1_400_000),
  consent: z.literal(true),
});

const personPattern = /\b(person|people|human|man|woman|child|boy|girl|face|selfie)\b/i;

function imageType(imageData: string) {
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+=*)$/.exec(imageData);
  if (!match) return null;
  const bytes = Buffer.from(match[2], "base64");
  const kind = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    ? "jpeg"
    : bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      ? "png"
      : bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP"
        ? "webp"
        : "unknown";
  return kind === match[1] ? match[1] : null;
}

async function durableArtwork(data: unknown) {
  const parsed = z.object({ data: z.array(z.object({ url: z.string().url().optional(), b64_json: z.string().optional() })).min(1) }).parse(data);
  const result = parsed.data[0];
  if (result.b64_json) {
    const bytes = Buffer.from(result.b64_json, "base64");
    if (!bytes.length || bytes.length > 2_500_000) throw new Error("ARTWORK_SIZE_INVALID");
    return `data:image/png;base64,${bytes.toString("base64")}`;
  }
  if (!result.url) throw new Error("ARTWORK_RESULT_MISSING");
  const url = new URL(result.url);
  if (url.protocol !== "https:" || !(url.hostname === "x.ai" || url.hostname.endsWith(".x.ai"))) throw new Error("ARTWORK_URL_UNTRUSTED");
  const image = await fetch(url, { signal: AbortSignal.timeout(20000), redirect: "error" });
  if (!image.ok || !image.headers.get("content-type")?.startsWith("image/")) throw new Error("ARTWORK_DOWNLOAD_FAILED");
  const bytes = Buffer.from(await image.arrayBuffer());
  if (!bytes.length || bytes.length > 2_500_000) throw new Error("ARTWORK_SIZE_INVALID");
  const contentType = image.headers.get("content-type")?.split(";")[0] || "image/png";
  return `data:${contentType};base64,${bytes.toString("base64")}`;
}

export async function POST(request: Request) {
  if (Number(request.headers.get("content-length") || 0) > 1_500_000) return NextResponse.json({ error: "Photo is too large. Capture again with a smaller image." }, { status: 413 });
  let body: z.infer<typeof requestSchema>;
  try {
    body = requestSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Explicit consent, the recognition proof, and one compressed still are required." }, { status: 400 });
  }
  if (!imageType(body.imageData)) return NextResponse.json({ error: "Use a valid JPEG, PNG, or WebP photo." }, { status: 400 });
  const recognition = readTicket(body.recognitionTicket, body.guestId);
  if (!recognition) return NextResponse.json({ error: "Recognition proof is invalid or expired. Rescan the object." }, { status: 403 });
  if (recognition.subjectType === "person" || personPattern.test(`${recognition.card.name} ${recognition.card.category}`)) {
    return NextResponse.json({ error: "Photo-based art is disabled for person-centered discoveries. Use the category illustration instead." }, { status: 422 });
  }

  const digest = createHash("sha256").update(body.imageData).digest();
  const recognizedDigest = Buffer.from(recognition.imageHash, "hex");
  if (digest.length !== recognizedDigest.length || !timingSafeEqual(digest, recognizedDigest)) {
    return NextResponse.json({ error: "Photo does not match the recognized still. Rescan before making card art." }, { status: 403 });
  }

  const key = process.env.XAI_API_KEY || process.env.VISION_API_KEY;
  if (!key) return NextResponse.json({ error: "xAI is not configured for card artwork." }, { status: 503 });
  try {
    const response = await fetch("https://api.x.ai/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.XAI_IMAGE_MODEL || "grok-imagine-image-2.0",
        prompt: `Transform this exact visible ${recognition.card.category.toLowerCase()} into an original anime-inspired collectible-card illustration. Keep the main non-human object recognizable, faithful to its visible shape, and centered. Use lively illustrated lighting and a fresh editorial composition. No words, letters, logos, known characters, franchise references, or extra objects.`,
        image: { url: body.imageData, type: "image_url" },
      }),
      signal: AbortSignal.timeout(45000),
    });
    if (!response.ok) {
      console.error("xAI image edit failed with status:", response.status);
      return NextResponse.json({ error: "xAI could not make card art. Use category art or retry once." }, { status: 502 });
    }
    const artworkData = await durableArtwork(await response.json());
    const artTicket = issueArtworkTicket({ guestId: body.guestId, cardId: recognition.card.id, artworkData, issuedAt: Date.now() });
    return NextResponse.json({ artworkKind: "xai-edited", artTicket, cardId: recognition.card.id });
  } catch (error) {
    console.error("xAI artwork processing failed:", error instanceof Error ? error.message : "UNKNOWN");
    return NextResponse.json({ error: "Card art is unavailable. Use the category illustration or retry once." }, { status: 502 });
  }
}