import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { DiscoveryCard } from "@/lib/types";

type DiscoveryTicket = { guestId: string; card: DiscoveryCard; issuedAt: number };

declare global {
  var outsideTicketSecret: Buffer | undefined;
}

function secret() {
  global.outsideTicketSecret ??= Buffer.from(process.env.APP_SIGNING_SECRET || randomBytes(32).toString("hex"));
  return global.outsideTicketSecret;
}

function signature(value: string) {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

export function issueTicket(ticket: DiscoveryTicket) {
  const payload = Buffer.from(JSON.stringify(ticket)).toString("base64url");
  return `${payload}.${signature(payload)}`;
}

export function readTicket(token: string, guestId: string) {
  const [payload, supplied, extra] = token.split(".");
  if (!payload || !supplied || extra) return null;
  const expected = Buffer.from(signature(payload));
  const actual = Buffer.from(supplied);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

  try {
    const ticket = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as DiscoveryTicket;
    if (ticket.guestId !== guestId || Date.now() - ticket.issuedAt > 5 * 60 * 1000) return null;
    return ticket;
  } catch {
    return null;
  }
}