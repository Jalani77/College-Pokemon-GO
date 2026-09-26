# Outside

A mobile-first campus discovery game. The phone view is camera-first; desktop can use the photo upload button. AI discoveries are unverified and clearly labeled. Organizer-entered quest facts are separate from AI content.

## Run it

Requirements: Node.js 20 or newer and npm. From this folder:

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open **http://localhost:3000**. In a Codespace or remote VS Code session, forward port `3000` in the **Ports** panel and open its forwarded URL. Camera access requires `localhost` or HTTPS and browser permission. Desktop discovery works with a photo upload instead.

`npm run lint`, `npm run typecheck`, and `npm run build` run the project quality gates. `npm run test:e2e` runs mobile Chromium flows for free scanning, duplicate-save behavior, provider/database failures, zero-pin map/GPS fallback, Field Scan, wishlist visibility, and reduced motion. On Linux, first install Playwright's browser/runtime dependencies with `npx playwright install --with-deps chromium`. `npm run start` serves the production build.

## Configure live services

Without credentials, Outside starts in an explicit **LOCAL DEMO** mode: you can enter a quest yourself, claim a zero-XP demo card, and refresh to verify that it remains in this browser. No campus locations or facts are pre-seeded. Demo cards, quest pins, RSVPs, and wishlist entries use this browser's local storage; they are not shared, server-persisted, or authenticated. Photo recognition returns **AI not configured** until a key is added.

To enable shared MongoDB persistence:

1. Create a free MongoDB Atlas project and database at [MongoDB Atlas](https://www.mongodb.com/atlas). In **Database > Connect > Drivers**, copy its Node.js connection string; replace the password placeholder and URL-encode special characters. Add the app's host IP in **Network Access**. Set this as `MONGODB_URI` and set `MONGODB_DB` to the database name.
2. Set `ADMIN_TOKEN` to a strong random secret. Organizers enter it in the in-app quest/event form to publish verified locations and upcoming group quests. The token is held by the server and is not stored in the database or browser storage.
3. Set `APP_SIGNING_SECRET` to a stable random secret of at least 32 characters so short-lived AI recognition tickets can be verified consistently across server workers/restarts. Generate one with `openssl rand -hex 32`. Recognition returns an actionable configuration error if this is missing; tickets signed with a different secret cannot be saved.
4. Restart the server. The app creates the `users`, `cards`, `ownedCards`, `locations`, and `events` collections and useful indexes as needed.

To enable photo recognition, create an API key in the [xAI console](https://console.x.ai/) and set `XAI_API_KEY`. `VISION_API_KEY` is accepted as a legacy fallback. `VISION_MODEL` defaults to `grok-2-vision-1212`. The key is only read by the server integration in `lib/vision.ts`; keep billing limits on the provider account. Captured photos are compressed to a JPEG still, sent once for recognition, and are not stored in MongoDB or retained by this app.

Optional consented card art uses xAI's image-edit endpoint with `XAI_IMAGE_MODEL` (default `grok-imagine-image-2.0`). Each selected scan can incur one additional billed image-edit request; check current xAI pricing before enabling it. The original photo remains memory-only; only the generated, size-limited artwork is retained in MongoDB with the saved card. Person-centered recognitions cannot use photo artwork. If image editing fails or consent is declined, a clearly labeled category illustration is used instead.

Set values only in the ignored `.env.local` file. `.env.example` documents the variable names without credentials. The app recognizes guest users with a browser-generated UUID; this is a demo convenience, **not authentication**. Before production use, add real sign-in/session verification, authorization tied to a verified organizer account, endpoint rate limits, abuse reporting, and a privacy/retention policy. The demo organizer token alone is not production event authorization.

## Data and reward rules

- xAI output is schema-validated and labeled AI-generated. Provider-declared uncertainty is shown with a retry option; the provider is prompted not to identify people, infer personal traits, or guess species, history, or campus facts.
- The server issues common AI cards and fixed XP using an expiring, guest-bound signed ticket. The browser cannot submit rarity or XP.
- Rare verified-location quest claims use organizer-entered facts and get a single 25 XP reward; duplicate quest claims are blocked by a unique database index. Local demo claims award no XP.
- Verified pins require real coordinates, a verified name/fact, MongoDB, and the admin token. No GSU locations or coordinates are bundled. The map uses OpenStreetMap tiles.
- Group quests only appear after an organizer supplies a future date, meeting point, organizer, and reward. RSVPs are idempotent. Events do not confer a reward card just for RSVP.
- Community matches and “Who wants this?” are only shown for users who explicitly opt in with a display name. Guest IDs, contact details, and location are not returned. Local demo wishlists stay on the device.
- Field Scan analyzes only a still frame captured when requested. Its broad suggestions are AI ideas, not verified quests or map pins.
- “Scan surroundings” freezes one user-selected still and returns non-person object labels. xAI does not supply reliable boxes in this integration, so targets are selectable chips below the frame; no coordinates or live tracking are claimed. “Capture now” remains available without scanning.
- There is no chat composer/message API in this codebase yet. Wishlist matches are displayed, but messaging is not presented as functional until a real chat flow exists.

## Current demo boundary

The live camera and desktop upload UI, still-image compression, xAI recognition, multi-object frame labels, image-bound signed-card save endpoint, swipe-to-unlock reveal, optional consented xAI image editing, OpenStreetMap, GPS opt-in, deck, and wishlist opt-in are implemented. AI requires `XAI_API_KEY` or the legacy `VISION_API_KEY`; shared persistence requires a reachable Atlas database. Generated art adds one billed image-edit request per consented selected scan. Playwright uses mocked service responses for client-flow tests; the running Atlas-backed Deck was also verified separately. A chat composer does not yet exist.