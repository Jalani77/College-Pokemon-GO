import { NextResponse } from "next/server";
import { z } from "zod";
import { suggestFieldDiscoveries } from "@/lib/vision";

const requestSchema = z.object({ imageData: z.string().max(1_400_000) });

export async function POST(request: Request) {
  let imageData: string;
  try {
    imageData = requestSchema.parse(await request.json()).imageData;
  } catch {
    return NextResponse.json({ error: "A compressed still image is required." }, { status: 400 });
  }
  if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(imageData)) {
    return NextResponse.json({ error: "Use a JPEG, PNG, or WebP still image." }, { status: 400 });
  }
  try {
    return NextResponse.json({ suggestions: await suggestFieldDiscoveries(imageData), source: "ai-suggestions" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "FIELD_SCAN_FAILED";
    if (message === "AI_NOT_CONFIGURED") return NextResponse.json({ error: "AI not configured. Add XAI_API_KEY or VISION_API_KEY to .env.local." }, { status: 503 });
    console.error("Field scan failed:", message);
    return NextResponse.json({ error: "Field scan failed. Retry with a clearer still image." }, { status: 502 });
  }
}