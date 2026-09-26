import { expect, test } from "@playwright/test";

test("camera permission denial shows a clear retry and upload path", async ({ page, context }) => {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: async () => { throw new DOMException("Permission denied", "NotAllowedError"); } },
    });
  });

  await page.goto("/");
  await expect(page.getByText(/Camera permission was denied/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry camera" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Upload a photo" })).toBeVisible();
});

test("no-key upload is honest and a local quest card survives refresh", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByText(/LOCAL DEMO/).first()).toBeVisible();

  await page.locator('input[type="file"]').setInputFiles({
    name: "pixel.png",
    mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j1z8AAAAASUVORK5CYII=", "base64"),
  });
  await expect(page.getByText(/AI not configured/)).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "Map", exact: true }).click();
  await page.getByRole("button", { name: "Add a quest" }).click();
  await page.getByLabel("Location name").fill("Browser test spot");
  await page.getByLabel("Clue").fill("Follow the browser test route to this test pin.");
  await page.getByLabel("Reward card").fill("Browser test card");
  await page.getByLabel("Category").fill("Test object");
  await page.getByLabel("Verified fact").fill("Test-only organizer note; not a campus fact.");
  await page.getByLabel("Latitude").fill("0");
  await page.getByLabel("Longitude").fill("0");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Add local demo quest" }).click();
  await page.getByRole("button", { name: /Browser test spot/ }).click();
  await expect(page.getByRole("heading", { name: "Browser test card" })).toBeVisible();
  await expect(page.getByText(/no verified campus data or XP is claimed/i)).toBeVisible();
  await page.getByRole("button", { name: "View in deck" }).click();
  await expect(page.getByText("Browser test card", { exact: true })).toBeVisible();

  await page.screenshot({ path: "/tmp/outside-mobile.png", fullPage: true });
  await page.reload();
  await page.getByRole("button", { name: "Deck", exact: true }).click();
  await expect(page.getByText("Browser test card", { exact: true })).toBeVisible();
  await page.screenshot({ path: "/tmp/outside-deck-mobile.png", fullPage: true });
});