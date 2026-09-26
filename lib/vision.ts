import { z } from "zod";
import type { Recognition } from "@/lib/types";

const recognitionSchema = z.object({
  objectName: z.string().trim().min(2).max(80),
  category: z.string().trim().min(2).max(50),
  shortFact: z.string().trim().min(8).max(240),
  confidence: z.number().min(0).max(1),
  uncertaintyNote: z.string().trim().max(180),
});

export function visionConfigured() {
  return Boolean(process.env.VISION_API_KEY);
}

export async function recognizeImage(imageData: string): Promise<Recognition> {
  const apiKey = process.env.VISION_API_KEY;
  if (!apiKey) throw new Error("AI_NOT_CONFIGURED");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.VISION_MODEL || "gpt-4o-mini",
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "Identify only what is visibly supported by this photo. Return JSON with objectName, category, shortFact, confidence (0 to 1), uncertaintyNote. For an uncertain identity use objectName 'Unidentified object', category 'Uncertain', a short fact that only describes visible appearance, confidence below 0.5, and explain uncertainty. Never invent a specific species, history, location, or campus fact. shortFact must be a cautious, useful observation, not an unsupported claim.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: "What object is clearly visible?" },
            { type: "image_url", image_url: { url: imageData, detail: "low" } },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(25000),
  });

  if (!response.ok) throw new Error(`VISION_PROVIDER_ERROR_${response.status}`);
  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("INVALID_VISION_RESPONSE");
  const parsed: unknown = JSON.parse(content);
  return recognitionSchema.parse(parsed);
}