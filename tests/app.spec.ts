import { expect, test, type Page, type Route } from "@playwright/test";

const guestId = "d07548e7-224b-4bfc-a8e0-621b0dc8c74d";
const appleCard = {
  id: "b2bb2e6f-cac8-4d69-8939-a84bd5a1d7b4",
  name: "Red apple",
  category: "Fruit",
  shortFact: "A crisp red fruit with a pale star-shaped core.",
  rarity: "common",
  xp: 10,
  source: "ai",
  discoveredAt: "2026-09-26T12:00:00.000Z",
};
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j1z8AAAAASUVORK5CYII=", "base64");

type MockOptions = {
  aiConfigured?: boolean;
  recognitionFailureCount?: number;
  saveFailure?: boolean;
  wantedBy?: string[];
  suggestions?: { name: string; clue: string; category: string }[];
};

async function denyCamera(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: async () => { throw new DOMException("Permission denied", "NotAllowedError"); } },
    });
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition: (_success: PositionCallback, error: PositionErrorCallback) => error({ code: 1, message: "denied", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError) },
    });
  });
}

async function mockServices(page: Page, options: MockOptions = {}) {
  const saved = new Map<string, typeof appleCard>();
  const tickets = new Map<string, typeof appleCard>();
  const ticket = "signed-test-recognition-proof";
  let recognitionCalls = 0;
  let profile = { displayName: "", visibilityOptIn: false };
  const lookingFor: string[] = [];

  await page.addInitScript((id) => localStorage.setItem("outside.guestId", id), guestId);
  await page.route("**/api/status", (route) => route.fulfill({ json: { databaseConfigured: true, visionConfigured: options.aiConfigured !== false, storage: "mongodb" } }));
  await page.route(/\/api\/deck(?:\?.*)?$/, async (route: Route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: { cards: Array.from(saved.values()), storage: "mongodb" } });
    if (options.saveFailure) return route.fulfill({ status: 503, json: { error: "MongoDB could not be reached. This card was not saved." } });
    const body = route.request().postDataJSON() as { ticket: string; guestId: string };
    const card = tickets.get(body.ticket);
    if (!card || body.guestId !== guestId) return route.fulfill({ status: 403, json: { error: "Invalid recognition proof." } });
    const alreadySaved = saved.has(card.id);
    saved.set(card.id, card);
    return route.fulfill({ json: { card, storage: "mongodb", alreadySaved } });
  });
  await page.route("**/api/locations", (route) => route.fulfill({ json: { locations: [], storage: "mongodb" } }));
  await page.route("**/api/events", (route) => route.fulfill({ json: { events: [], storage: "mongodb" } }));
  await page.route("**/api/wishlist**", async (route) => {
    if (route.request().method() === "GET") {
      const url = new URL(route.request().url());
      const cardName = url.searchParams.get("cardName");
      return route.fulfill({ json: {
        names: lookingFor,
        displayName: profile.displayName,
        visibilityOptIn: profile.visibilityOptIn,
        matches: [],
        wantedBy: cardName?.toLowerCase() === appleCard.name.toLowerCase() ? (options.wantedBy || []) : [],
        storage: "mongodb",
      } });
    }
    const body = route.request().postDataJSON() as { action: string; cardName?: string; displayName?: string; visibilityOptIn?: boolean };
    if (body.action === "profile") profile = { displayName: body.displayName || "", visibilityOptIn: Boolean(body.visibilityOptIn) };
    if (body.action === "add" && body.cardName && !lookingFor.includes(body.cardName)) lookingFor.push(body.cardName);
    if (body.action === "remove" && body.cardName) lookingFor.splice(lookingFor.indexOf(body.cardName), 1);
    return route.fulfill({ json: { saved: true, storage: "mongodb" } });
  });
  await page.route("**/api/field-scan", (route) => route.fulfill({ json: { suggestions: options.suggestions || [{ name: "Look for a tree", category: "Nature", clue: "Notice the shape of leaves in view." }], source: "ai-suggestions" } }));
  await page.route("**/api/recognize", async (route) => {
    recognitionCalls += 1;
    if (options.aiConfigured === false) return route.fulfill({ status: 503, json: { error: "AI not configured. Add XAI_API_KEY to .env.local." } });
    if (recognitionCalls <= (options.recognitionFailureCount || 0)) return route.fulfill({ status: 502, json: { error: "Recognition did not complete. Check the photo and try again." } });
    const body = route.request().postDataJSON() as { guestId: string; imageData: string };
    if (body.guestId !== guestId || !body.imageData.startsWith("data:image/jpeg;base64,")) return route.fulfill({ status: 400, json: { error: "Invalid still image request." } });
    tickets.set(ticket, appleCard);
    return route.fulfill({ json: { card: appleCard, ticket, recognition: { uncertain: false, missionMatch: false } } });
  });

  return { saved, ticket };
}

async function uploadPhoto(page: Page) {
  await page.locator('input[type="file"]').setInputFiles({ name: "test.png", mimeType: "image/png", buffer: png });
}

test("free scan saves an arbitrary common card despite mission mismatch and stays idempotent after refresh", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await denyCamera(page);
  const services = await mockServices(page);
  await page.goto("/");
  await expect(page.getByText(/Camera permission was denied/)).toBeVisible();
  await uploadPhoto(page);
  await expect(page.getByRole("heading", { name: "Red apple" })).toBeVisible();
  await expect(page.getByText("common", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Skip animation" }).click();
  await page.getByRole("button", { name: "Add to deck" }).click();
  await expect(page.getByText("SAVED DISCOVERY")).toBeVisible();
  await expect(page.getByText(/No opted-in explorers/)).toBeVisible();
  expect(services.saved.size).toBe(1);

  const duplicateSaves = await page.evaluate(async ({ id, token }) => Promise.all([1, 2].map(() => fetch("/api/deck", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ guestId: id, ticket: token }),
  }).then((response) => response.json()))), { id: guestId, token: services.ticket });
  expect(duplicateSaves).toHaveLength(2);
  expect(services.saved.size).toBe(1);

  await page.reload();
  await page.getByRole("button", { name: "Deck", exact: true }).click();
  await expect(page.getByText("Red apple", { exact: true })).toBeVisible();
  await page.screenshot({ path: "/tmp/outside-small-phone.png", fullPage: true });
});

test("failed xAI recognition is truthful and can be retried", async ({ page }) => {
  await denyCamera(page);
  await mockServices(page, { recognitionFailureCount: 1 });
  await page.goto("/");
  await uploadPhoto(page);
  await expect(page.getByText(/Recognition did not complete/)).toBeVisible();
  await uploadPhoto(page);
  await expect(page.getByRole("heading", { name: "Red apple" })).toBeVisible();
});

test("MongoDB save failure never displays a saved state", async ({ page }) => {
  await denyCamera(page);
  await mockServices(page, { saveFailure: true });
  await page.goto("/");
  await uploadPhoto(page);
  await expect(page.getByRole("heading", { name: "Red apple" })).toBeVisible();
  await page.getByRole("button", { name: "Skip animation" }).click();
  await page.getByRole("button", { name: "Add to deck" }).click();
  await expect(page.getByText(/MongoDB could not be reached/)).toBeVisible();
  await expect(page.getByText("AI-GENERATED IDENTIFICATION")).toBeVisible();
  await expect(page.getByText("SAVED DISCOVERY")).toHaveCount(0);
});

test("zero-pin map remains interactive and GPS denial is clearly labeled", async ({ page }) => {
  await denyCamera(page);
  await mockServices(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Map", exact: true }).click();
  await expect(page.locator(".leaflet-container")).toBeVisible();
  await expect(page.getByText("DEMO AREA · LOCATION NOT SHARED")).toBeVisible();
  await page.getByRole("button", { name: "My location" }).click();
  await expect(page.getByText("LOCATION UNAVAILABLE · DEMO AREA")).toBeVisible();
});

test("Field Scan suggestions come from a selected frame and are not pins", async ({ page }) => {
  await denyCamera(page);
  await mockServices(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Map", exact: true }).click();
  await page.getByRole("button", { name: "Field Scan" }).click();
  await uploadPhoto(page);
  await expect(page.getByText(/AI IDEAS FROM THIS FRAME · NOT VERIFIED PINS/)).toBeVisible();
  await expect(page.getByText("Look for a tree")).toBeVisible();
  await page.getByRole("button", { name: "Map", exact: true }).click();
  await expect(page.locator(".leaflet-marker-icon")).toHaveCount(0);
});

test("a saved card shows opted-in wishlist display names", async ({ page }) => {
  await denyCamera(page);
  await mockServices(page, { wantedBy: ["Rowan"] });
  await page.goto("/");
  await uploadPhoto(page);
  await expect(page.getByRole("heading", { name: "Red apple" })).toBeVisible();
  await page.getByRole("button", { name: "Skip animation" }).click();
  await page.getByRole("button", { name: "Add to deck" }).click();
  await expect(page.getByText("WHO WANTS THIS?")).toBeVisible();
  await expect(page.getByText("Rowan", { exact: true })).toBeVisible();
});

test("reduced-motion preference skips the reveal animation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await denyCamera(page);
  await mockServices(page);
  await page.goto("/");
  await uploadPhoto(page);
  await expect(page.getByRole("heading", { name: "Red apple" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Skip animation" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add to deck" })).toBeEnabled();
});

test("missing xAI configuration gives an honest upload error", async ({ page }) => {
  await denyCamera(page);
  await mockServices(page, { aiConfigured: false });
  await page.goto("/");
  await uploadPhoto(page);
  await expect(page.getByText(/AI not configured/)).toBeVisible();
});
