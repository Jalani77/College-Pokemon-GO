import { z } from "zod";
import type { FieldSuggestion, Recognition } from "@/lib/types";

const recognitionSchema = z.object({
  objectName: z.string().trim().min(2).max(80),
  category: z.string().trim().min(2).max(50),
  shortFact: z.string().trim().min(8).max(240),
  uncertain: z.boolean(),
  uncertaintyNote: z.string().trim().max(180),
});

const fieldSuggestionsSchema = z.object({
  suggestions: z.array(z.object({
    name: z.string().trim().min(2).max(60),
    clue: z.string().trim().min(8).max(140),
    category: z.string().trim().min(2).max(40),
  })).max(4),
});

function apiKey() {
  return process.env.XAI_API_KEY || process.env.VISION_API_KEY;
}

export function visionConfigured() {
  return Boolean(apiKey());
}

export async function recognizeImage(imageData: string): Promise<Recognition> {
  const key = apiKey();
  if (!key) throw new Error("AI_NOT_CONFIGURED");

  const response = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.VISION_MODEL || "grok-2-vision-1212",
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "Describe the main visible discovery, not the photographer. Return JSON with objectName (2-80 chars), category (2-50 chars), shortFact (8-240 chars), uncertain (boolean), uncertaintyNote (0-180 chars). For a person, never identify them or infer identity, age, gender, ethnicity, health, mood, or other personal traits. A generic clothing/scene description such as 'Person wearing a blue hoodie' is allowed; shortFact must be only a neutral visible observation, never a fun fact about them. For objects, plants, animals, signs, and art, give a concise name and an interesting fact only when well supported; otherwise describe visible features and set uncertain=true. Never invent species, history, exact location, or campus facts. Do not provide numeric confidence scores. If uncertain, explain briefly and avoid precise claims.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: "What is the main visible subject? Treat this as a free discovery, not a mission-match test." },
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

export async function suggestFieldDiscoveries(imageData: string): Promise<FieldSuggestion[]> {
  const key = apiKey();
  if (!key) throw new Error("AI_NOT_CONFIGURED");
  const response = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.VISION_MODEL || "grok-2-vision-1212",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "Suggest up to 4 broad, optional discovery prompts inspired by visible surroundings. Return JSON {suggestions:[{name,category,clue}]}. These are ideas, not verified missions or map pins. Do not infer GPS, compass direction, distance, campus identity, species, history, or presence beyond what is visible. Never identify a person or infer personal traits. Prefer broad prompts like 'Look for a tree' or 'Spot a sign'. If the frame is unclear, return an empty suggestions array.",
        },
        { role: "user", content: [{ type: "text", text: "Suggest nearby things a student could look for, based only on this selected frame." }, { type: "image_url", image_url: { url: imageData, detail: "low" } }] },
      ],
    }),
    signal: AbortSignal.timeout(25000),
  });
  if (!response.ok) throw new Error(`VISION_PROVIDER_ERROR_${response.status}`);
  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("INVALID_VISION_RESPONSE");
  const parsed: unknown = JSON.parse(content);
  return fieldSuggestionsSchema.parse(parsed).suggestions;
}