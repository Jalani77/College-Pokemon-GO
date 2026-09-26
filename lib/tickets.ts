import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { DiscoveryCard } from "@/lib/types";

type DiscoveryTicket = { guestId: string; card: DiscoveryCard; imageHash: string; subjectType: "object" | "person" | "scene"; issuedAt: number };
type ArtworkTicket = { guestId: string; cardId: string; artworkData: string; issuedAt: number };

function secret() {
  const configured = process.env.APP_SIGNING_SECRET;
  if (!configured || configured.length < 32) {
    throw new Error("SIGNING_SECRET_NOT_CONFIGURED");
  }
  return configured;
}

function signature(value: string) {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

export function ticketSigningConfigured() {
  return Boolean(process.env.APP_SIGNING_SECRET && process.env.APP_SIGNING_SECRET.length >= 32);
}

export function issueTicket(ticket: DiscoveryTicket) {
  const payload = Buffer.from(JSON.stringify(ticket)).toString("base64url");
  return `${payload}.${signature(payload)}`;
}

export function issueArtworkTicket(ticket: ArtworkTicket) {
  const payload = Buffer.from(JSON.stringify(ticket)).toString("base64url");
  return `${payload}.${signature(payload)}`;
}

function verifyPayload(token: string) {
  const [payload, supplied, extra] = token.split(".");
  if (!payload || !supplied || extra) return null;
  const expected = Buffer.from(signature(payload));
  const actual = Buffer.from(supplied);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as unknown;
  } catch {
    return null;
  }
}

export function readTicket(token: string, guestId: string) {
  const payload = verifyPayload(token);
  if (!payload) return null;
  try {
    const ticket = z.object({
      guestId: z.string().uuid(),
      card: z.object({
        id: z.string().uuid(),
        name: z.string().min(2).max(80),
        category: z.string().min(2).max(50),
        shortFact: z.string().min(8).max(240),
        rarity: z.literal("common"),
        xp: z.union([z.literal(5), z.literal(10)]),
        source: z.literal("ai"),
        artworkData: z.string().optional(),
        artworkKind: z.enum(["xai-edited", "category-illustration"]).optional(),
        uncertaintyNote: z.string().max(180).optional(),
        discoveredAt: z.string().datetime(),
      }),
      imageHash: z.string().regex(/^[a-f0-9]{64}$/),
      subjectType: z.enum(["object", "person", "scene"]),
      issuedAt: z.number().int().positive(),
    }).parse(payload) as DiscoveryTicket;
    const age = Date.now() - ticket.issuedAt;
    if (ticket.guestId !== guestId || age < 0 || age > 15 * 60 * 1000) return null;
    return ticket;
  } catch {
    return null;
  }
}

export function readArtworkTicket(token: string, guestId: string, cardId: string) {
  const payload = verifyPayload(token);
  if (!payload) return null;
  const parsed = z.object({
    guestId: z.string().uuid(),
    cardId: z.string().uuid(),
    artworkData: z.string().min(30).max(3_400_000),
    issuedAt: z.number().int().positive(),
  }).safeParse(payload);
  if (!parsed.success) return null;
  const ticket = parsed.data;
  const age = Date.now() - ticket.issuedAt;
  if (ticket.guestId !== guestId || ticket.cardId !== cardId || age < 0 || age > 30 * 60 * 1000) return null;
  return ticket as ArtworkTicket;
}