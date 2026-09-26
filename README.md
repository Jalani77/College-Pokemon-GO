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

`npm run lint`, `npm run typecheck`, and `npm run build` run the project quality gates. `npm run test:e2e` runs Chromium smoke tests for camera denial, the no-key upload state, and local quest-to-deck persistence. On Linux, first install Playwright's browser/runtime dependencies with `npx playwright install --with-deps chromium`. `npm run start` serves the production build.

## Configure live services

Without credentials, Outside starts in an explicit **LOCAL DEMO** mode: you can enter a quest yourself, claim a zero-XP demo card, and refresh to verify that it remains in this browser. No campus locations or facts are pre-seeded. Demo cards, quest pins, RSVPs, and wishlist entries use this browser's local storage; they are not shared, server-persisted, or authenticated. Photo recognition returns **AI not configured** until a key is added.

To enable shared MongoDB persistence:

1. Create a free MongoDB Atlas project and database at [MongoDB Atlas](https://www.mongodb.com/atlas). In **Database > Connect > Drivers**, copy its Node.js connection string; replace the password placeholder and URL-encode special characters. Add the app's host IP in **Network Access**. Set this as `MONGODB_URI` and set `MONGODB_DB` to the database name.
2. Set `ADMIN_TOKEN` to a strong random secret. Organizers enter it in the in-app quest/event form to publish verified locations and upcoming group quests. The token is held by the server and is not stored in the database or browser storage.
3. Set `APP_SIGNING_SECRET` to a stable random secret so short-lived AI recognition tickets can be verified consistently. Generate one with `openssl rand -hex 32`.
4. Restart the server. The app creates the `users`, `cards`, `ownedCards`, `locations`, and `events` collections and useful indexes as needed.

To enable photo recognition, create an API key at [OpenAI API keys](https://platform.openai.com/api-keys) and set `VISION_API_KEY`. `VISION_MODEL` defaults to `gpt-4o-mini`. The key is only read by the server integration in `lib/vision.ts`; keep billing limits on the provider account. Captured photos are compressed to a JPEG still, sent once for recognition, and are not stored in MongoDB or retained by this app.

Set values only in the ignored `.env.local` file. `.env.example` documents the variable names without credentials. The app recognizes guest users with a browser-generated UUID; this is a demo convenience, **not authentication**. Before production use, add real sign-in/session verification, authorization tied to a verified organizer account, endpoint rate limits, abuse reporting, and a privacy/retention policy. The demo organizer token alone is not production event authorization.

## Data and reward rules

- AI output is schema-validated and labeled AI-generated. Low-confidence identities appear as “Unidentified object”; the provider is prompted not to guess species, history, or campus facts.
- The server issues common AI cards and fixed XP using an expiring, guest-bound signed ticket. The browser cannot submit rarity or XP.
- Rare verified-location quest claims use organizer-entered facts and get a single 25 XP reward; duplicate quest claims are blocked by a unique database index. Local demo claims award no XP.
- Verified pins require real coordinates, a verified name/fact, MongoDB, and the admin token. No GSU locations or coordinates are bundled. The map uses OpenStreetMap tiles.
- Group quests only appear after an organizer supplies a future date, meeting point, organizer, and reward. RSVPs are idempotent. Events do not confer a reward card just for RSVP.
- Community “looking for” matches are only shown across users when shared MongoDB is enabled. Local demo wishlists stay on the device.

## Current demo boundary

The full live camera and desktop upload UI, still-image compression, recognition endpoint, card reveal, verified-quest map, deck, wishlists, and group-quest RSVP are implemented. AI recognition requires `VISION_API_KEY`; shared deck/community/map/event persistence requires a reachable Atlas database. With neither, the reproducible test path is: open **Map**, add an explicitly local demo quest with coordinates and organizer-entered text, claim it, choose **View in deck**, then refresh. That local path tests UI/deck persistence only; it does not verify a campus fact, AI, XP, or server persistence.