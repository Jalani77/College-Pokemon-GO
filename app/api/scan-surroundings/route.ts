import { NextResponse } from "next/server";
import { z } from "zod";
import { scanSurroundings } from "@/lib/vision";

const requestSchema = z.object({ imageData: z.string().max(1_400_000) });

function validImageData(imageData: string) {
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+=*)$/.exec(imageData);
  if (!match) return false;
  const bytes = Buffer.from(match[2], "base64");
  const kind = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    ? "jpeg"
    : bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      ? "png"
      : bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP"
        ? "webp"
        : "unknown";
  return kind === match[1];
}

export async function POST(request: Request) {
  if (Number(request.headers.get("content-length") || 0) > 1_500_000) {
    return NextResponse.json({ error: "Frame is too large. Capture again." }, { status: 413 });
  }
  let imageData: string;
  try {
    imageData = requestSchema.parse(await request.json()).imageData;
  } catch {
    return NextResponse.json({ error: "A compressed still frame is required." }, { status: 400 });
  }
  if (!validImageData(imageData)) return NextResponse.json({ error: "Frame must be a valid JPEG, PNG, or WebP still image." }, { status: 400 });

  try {
    const targets = await scanSurroundings(imageData);
    return NextResponse.json({ targets, localization: "none", source: "xai-selected-still" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "SURROUNDINGS_SCAN_FAILED";
    if (message === "AI_NOT_CONFIGURED") return NextResponse.json({ error: "AI not configured. Add XAI_API_KEY or VISION_API_KEY to .env.local." }, { status: 503 });
    console.error("Surroundings scan failed:", message);
    return NextResponse.json({ error: "Could not scan this frame. Retry or capture anything instead." }, { status: 502 });
  }
}