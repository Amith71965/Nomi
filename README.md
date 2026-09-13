# Nomi

**Tell it once. Pick up where life left off.**

Nomi is a personal assistant for everyday errands. You tell it things in plain language, it keeps them as structured memory you can edit, and later it connects those facts to a decision: what to buy, from where, and when to go. It researches real listings with the source attached to every field, and it can put one event on your own Google Calendar, but only after you approve the exact details.

Anyone can create an account on the web and link their own apps from inside the product. No end user touches source code or an `.env` file.

| | |
|---|---|
| **Live app** | https://nomi-tau-three.vercel.app |
| **Demo video** | _Not recorded yet. Paste the link here:_ `<demo video URL>` |
| **Repository** | https://github.com/Amith71965/Nomi |
| **Build plan and checklist** | [IMPLEMENTATION-PLAN.md](IMPLEMENTATION-PLAN.md) |
| **What it deliberately will not do** | [docs/limitations.md](docs/limitations.md) |
| **Six-minute walkthrough** | [docs/demo-script.md](docs/demo-script.md) |

> **Status.** The whole loop is built, tested and deployed: public sign-up, per-user app linking, the conversation shell with memory and voice, grocery research with sourced cards, and approval that creates exactly one calendar event. 296 Vitest tests pass. Google Calendar linking needs an OAuth client in the environment before Allow can create real events; until then the app says so instead of pretending.

---

## Table of contents

- [What we built](#what-we-built)
- [Apps and services we integrated](#apps-and-services-we-integrated)
- [Technology stack](#technology-stack)
- [How a turn works](#how-a-turn-works)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Database setup](#database-setup)
- [Scripts](#scripts)
- [Testing](#testing)
- [Deploying](#deploying)
- [Project structure](#project-structure)
- [API surface](#api-surface)
- [How each part works](#how-each-part-works)
- [Known limitations](#known-limitations)
- [Roadmap](#roadmap)

---

## What we built

The product is one loop: **Remember → Understand → Research → Recommend → Ask → Act.**

1. **Remember.** You say *"I'm out of tomatoes and potatoes. I'm cooking chicken curry tonight. I'm looking for running shoes."* Nomi saves four separate, structured memories: two shortages, one dinner plan, one shopping interest. Each one carries the exact words you used. You can read, correct, or delete any of them.
2. **Understand.** In a brand new conversation you ask *"What should I buy today?"* Nomi recalls the shortages, connects them to tonight's dinner, and keeps the running shoes apart as an ongoing interest rather than a thing you need today. Other curry ingredients are offered as suggestions to check, never as assumed shortages.
3. **Research.** Press **Groceries**. Nomi searches real listings for your confirmed needs near the city you chose, filters out the irrelevant ones, ranks what is left, and shows up to three cards per item with the merchant, the unit, the retrieval time and a plain reason.
4. **Recommend.** A decision card names one option per item, the reasons behind it, and its own limitations.
5. **Ask.** Press **Schedule grocery run**. An approval card shows the exact event: title, date, time, calendar, no attendees, no reminders. Nothing has been written anywhere yet. You can change the time, which bumps the proposal version.
6. **Act.** Press **Allow**. Exactly one event is created on your own calendar and the card becomes a confirmation with a real link.

### What makes it different

- **Nothing is invented.** A listing with no price says "Price not listed", never `$0`. Stock is reported as unknown on every card, because search listings genuinely do not carry it. A recommendation with thin evidence says so.
- **The model can propose; only you can execute.** There is no tool in the registry that writes to your calendar. The approval endpoint is the only path to a real event, and it runs an atomic database claim first, so a double click, a stale card, an expired proposal or a cancel arriving first can never produce two events.
- **Memory comes from what you actually said.** A question ("are we out of tomatoes?") is not an assertion. Every saved fact must quote your own message, and anything the model is less than 80% sure about becomes a clarifying question instead of a row in the database.
- **Your apps stay yours.** You link them from inside the product and unlink whenever you want. Refresh tokens are encrypted before they touch the database, and no API response ever returns one.

---

## Apps and services we integrated

Two kinds of integration. **You link** means each user connects their own account inside the app. **Included** means Nomi provides it with a server-side key and the user configures nothing.

| Service | What it does in Nomi | Kind | Needed? |
|---|---|---|---|
| **Supabase** (Postgres, Auth, RLS) | Accounts, sessions, and every row of memory, turns, actions and links. Row-level security means an account can only ever read its own data | Included | **Required** |
| **OpenRouter** (`openai` SDK) | Model access for the orchestrator, with strict tool schemas and JSON-schema output. Default model `openai/gpt-4.1-mini` | Included | **Required** for the assistant |
| **SerpApi** (Google Shopping engine) | Real grocery listings for confirmed needs, normalized into records whose missing fields stay missing | Included | Optional: without it, research runs from recorded listings labelled `cached` |
| **Google Calendar API** | Creates one event on the user's own calendar after approval, with a deterministic event id so retries cannot duplicate it | **You link** (per-user OAuth) | Optional: unlinked users get a plain refusal |
| **Google OAuth 2.0 / OpenID Connect** | The linking flow itself: consent, code exchange, token refresh, revocation on unlink, and the account email used as the card's label | **You link** | Required for Calendar |
| **Google Maps Geocoding API** | Turns the city a user types ("austin tx") into a canonical "Austin, Texas, United States" so product search localizes correctly | Included | Optional: without it the typed text is used as-is and the app says it was not verified |
| **Deepgram** (Nova-3) | Push-to-talk transcription. The audio is discarded after transcription and the transcript is editable before it is sent | Included | Optional, only when voice is on |
| **OpenAI** (audio transcription) | Alternative transcription provider behind the same interface, selected with `TRANSCRIPTION_PROVIDER=openai` | Included | Optional alternative to Deepgram |
| **Vercel** | Hosting for the deployed app, Node runtime | Platform | For deployment |
| **GitHub** | Repository, issues and the parked CI workflow | Platform | Development |

Deliberately **not** integrated, and the app says so on its own Linked apps page: email sending, payments or checkout, Instacart, Notion, Gmail. Notes export is listed as planned and is not built.

---

## Technology stack

| Area | Choice |
|---|---|
| Framework | Next.js 16 (App Router), React 19, Node runtime for every API route |
| Language | TypeScript in `strict` mode. No `any`, no `@ts-ignore`, no non-null assertions on external data |
| Validation | Zod 4 at every boundary: request bodies, query params, route params, model output, provider responses, database rows, environment |
| Styling | Tailwind 4 with CSS custom-property tokens; `next/font` for Fraunces, Instrument Sans and IBM Plex Mono |
| Model access | `openai` SDK pointed at OpenRouter, strict `tools` plus `response_format: json_schema` |
| Data | Supabase Postgres with RLS; all writes go through service-role RPCs inside authenticated route handlers |
| Crypto | Node `crypto`: AES-256-GCM sealed boxes for refresh tokens, HMAC-SHA256 for the OAuth `state` |
| Tests | Vitest for units and route handlers, recorded fixtures for provider adapters, opt-in live tests, Postman/newman for hand-driven API checks |

---

## How a turn works

```
browser  →  POST /api/assistant
              ├── verify session (cookie or bearer) and Origin
              ├── begin_turn RPC: idempotent, one active turn, 10/min
              ├── load memories + recent turns  →  context message
              └── orchestrator loop (≤ 3 model rounds, ≤ 5 tool calls, 25 s)
                    ├── get_memories / create_memory / update_memory
                    ├── search_products / compare_options      (research on)
                    └── propose_calendar_event                 (calendar linked)
              ← server assembles the cards from its own stored records
```

The model chooses *what* to look up and *how to explain it*. Every factual field on a card comes from a committed database row or a provider response the server recorded, never from the model's own text. Approval is a separate request entirely.

---

## Getting started

### Prerequisites

- **Node 22 or newer** and npm
- A **Supabase** project (the free tier is enough)
- An **OpenRouter** API key for the assistant
- Optional: SerpApi key, Deepgram key, Google Cloud OAuth client, Google Maps key

### 1. Clone and install

```bash
git clone https://github.com/Amith71965/Nomi.git
cd Nomi
npm install
```

### 2. Create your environment file

```bash
cp .env.example .env
```

Open `.env` and fill in the values described in [Environment variables](#environment-variables). The minimum to boot is `APP_ORIGIN`, the Supabase URL, one public Supabase key and one server key. Startup validation reports the **name** of anything missing, never a value.

### 3. Set up the database

Open the Supabase SQL editor and run the files in `supabase/migrations/` **in numerical order**. They are additive and safe to run alongside unrelated tables. See [Database setup](#database-setup) for what each one does.

### 4. Configure authentication

In Supabase, go to Authentication:

- **Sign In / Providers → Email:** allow new users to sign up, with email confirmation on.
- **URL Configuration:** set Site URL to your `APP_ORIGIN` and add `<APP_ORIGIN>/auth/callback` to the redirect list.

Without the second step, confirmation links will not return to your app.

### 5. Check everything before you run it

```bash
npm run check     # typecheck, lint and 296 tests
npm run verify    # env, database connectivity, grants, schema, isolation
```

`npm run verify` prints `PASS`, `FAIL` or `SKIP` per check with a one-line reason, and never prints a secret. Add credentials for deeper checks:

```bash
DEMO_EMAIL=you@example.com DEMO_PASSWORD=… npm run verify
```

### 6. Run it

```bash
npm run dev       # http://localhost:3000
```

Create an account at `/signup`, confirm by email, and you land on **Linked apps**. Set **Where you shop**, link Google Calendar if you configured one, then open **Assistant** and say something true about today.

For a production build locally:

```bash
npm run build
npm start
```

### Optional: create a test account without email

Handy for API testing and rehearsals, since it skips the confirmation step:

```bash
DEMO_EMAIL=you@example.com DEMO_PASSWORD=… npm run demo:user
```

This writes the new user's UUID into `.env` as `DEMO_USER_ID`, which the scripts use. Nothing in the app is restricted to that ID.

### Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Startup fails naming a variable | That variable is missing or blank in `.env`. Optional features only demand their keys when switched on |
| Assistant answers `503 provider_unavailable` | `OPENROUTER_API_KEY` is not set |
| Google Calendar card says "Not available yet" | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `INTEGRATIONS_ENCRYPTION_KEY` must all three be set, or all three left blank |
| Confirmation email links to localhost | Supabase Site URL and redirect list still point at localhost. See step 4 |
| Grocery search is slow the first time | The provider is slow on a cold query. Results are cached in-process for ten minutes, and the cached copy is labelled as such |
| A mutating request returns `403 origin_mismatch` | `APP_ORIGIN` does not match the origin the browser is actually using |

---

## Environment variables

Copy `.env.example` to `.env`. Startup validation fails with the **name** of any missing variable, never its value.

| Group | Variables | Notes |
|---|---|---|
| App | `APP_ORIGIN` | Exact trusted origin, no trailing slash. Used for same-origin checks and OAuth redirects |
| Model | `OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL`, `NOMI_MODEL`, `OPENROUTER_SITE_URL`, `OPENROUTER_APP_NAME` | The model must support tool calling and JSON-schema output. The key is optional at startup; without it the assistant answers `503` and the connections view reports the model as not ready |
| Supabase | `NEXT_PUBLIC_SUPABASE_URL`; one public key: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` or `SUPABASE_ANON_PUBLIC_KEY`; one server key: `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SECRET_KEY` or `SUPABASE_LEGACY_SERVICE_ROLE_SECRET_KEY` | Legacy JWT keys and newer publishable/secret keys are both accepted under any of these names. The server key is server-only and bypasses RLS |
| Google linking | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `INTEGRATIONS_ENCRYPTION_KEY` | One OAuth client of type Web application, redirect `<APP_ORIGIN>/api/integrations/google/callback`, Calendar API enabled. The key (`openssl rand -base64 32`) seals refresh tokens at rest. Required together or left blank together; blank hides linking |
| Shopping | `PRODUCT_SEARCH_API_KEY`, `PRODUCT_SEARCH_LOCATION` (optional) | SerpApi key. The location is a **fallback only**: each user sets their own inside the app, and that is what their searches use |
| Maps (optional) | `GOOGLE_MAPS_API_KEY` | Server-side geocoding that canonicalizes a user's typed city. Without it the typed text is used as-is and the app says it was not verified |
| Voice (optional) | `ENABLE_VOICE`, `TRANSCRIPTION_PROVIDER` (`deepgram` default, or `openai`), `DEEPGRAM_API_KEY`, `DEEPGRAM_MODEL`, `OPENAI_API_KEY`, `OPENAI_TRANSCRIBE_MODEL` | OpenRouter has no speech-to-text, so voice uses a dedicated provider. Only the selected provider's key is required, and only when voice is on |
| Owner's test account | `DEMO_USER_ID` (optional), `DEMO_TIME_ZONE` | UUID of your own test user, used only by scripts. Accounts are public; nothing in the app is restricted to this ID |
| Modes | `RESEARCH_MODE` (`live`/`cached`/`fixture`), `ENABLE_PLACES` | The research mode is always visible in the UI. Places is a P2 feature and off by default |

---

## Database setup

Migrations live in `supabase/migrations/` and are applied by hand in the Supabase SQL editor, in order. All five are additive: they create Nomi's own four tables, their indexes, triggers, policies and functions, and touch nothing else in the project.

1. **`001_initial.sql`** — `turns`, `memories`, `actions`, indexes, RLS on (an authenticated client can read only its own rows and write nothing directly).
2. **`002_memory_rpc.sql`** — service-role RPCs: `upsert_memories` (newer source wins, the same turn is a no-op), `patch_memory`, `delete_memory` (both refuse while a turn is processing and invalidate model context), `invalidate_context`, `has_active_turn`.
3. **`003_turn_rpc.sql`** — `begin_turn` (idempotent on client request id, one active turn, 60 s abandonment, 10 turns per minute), `reopen_turn`, and re-declares the memory RPCs under the same per-user advisory lock so a stale in-flight turn can never write a forgotten fact back.
4. **`004_connections.sql`** — `connections`: one row per user and provider holding the account label and the refresh token as an AES-256-GCM sealed box. RLS read-own, and the column-level grant to `authenticated` **excludes the token columns**, so even a direct client query cannot read one.
5. **`005_actions_rpc.sql`** — `claim_action`, `cancel_action`, `patch_action` and `settle_action`: conditional updates under the per-user advisory lock that decide every approval transition atomically.

---

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` / `npm start` | Production build and serve |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint (Next core-web-vitals plus TypeScript rules) |
| `npm test` | Run all Vitest suites once |
| `npm run test:watch` | Vitest in watch mode |
| `npm run check` | typecheck + lint + test. Must pass before every commit |
| `npm run verify` | End-to-end setup check: env, Supabase connectivity and grants, schema, anon isolation, test user; with `DEMO_EMAIL`/`DEMO_PASSWORD` also sign-in, RLS as that user and RPC round trips; with `BASE_URL` also a live API smoke. Prints PASS/FAIL/SKIP, never a secret |
| `npm run demo:user` | Create your own test user through the Admin API, skipping email confirmation, and write `DEMO_USER_ID` to `.env` |
| `npm run token` | Print a bearer token for a user: `DEMO_EMAIL=… DEMO_PASSWORD=… npm run token` |
| `npm run api:test` | Sign in, seed a probe memory, run the Postman collection with newman against `BASE_URL`, remove the probe |
| `npm run demo:reset` | Scoped reset of ONE account's data before a rehearsal. Dry run by default: `RESET_USER_ID=… npm run demo:reset`, then repeat with `RESET_CONFIRM=true`. Add `RESET_UNLINK=true` to drop linked apps too. Never touches auth users or another account |

---

## Testing

This is a test-based build. Every module under `lib/` has a test under `tests/`, and every API route has a route test that calls the exported handler with a real `Request`. Provider adapters are tested against recorded fixtures; live tests are opt-in and skip without credentials.

```bash
npm test                              # everything
npx vitest run tests/actions.test.ts  # one suite
```

The approval suite covers the cases that matter most: a double approve, a stale version, an expired proposal, a cancel winning the race, two concurrent approvals producing one claim, a timeout after the event was already committed, a duplicate event id on retry, and a user with no linked calendar.

### Live tests

```bash
npx vitest run tests/ai.live.test.ts             # OpenRouter, skips without a key
npx vitest run tests/transcription.live.test.ts  # Deepgram, skips without a key
```

### Postman

`postman/Nomi.postman_collection.json` mirrors the route tests for hand-driven checks. The quickest path uses newman and needs no Postman account:

```bash
npm run dev                                      # terminal one
DEMO_EMAIL=… DEMO_PASSWORD=… npm run api:test    # terminal two
```

To drive it from the Postman app instead, import the collection, set `baseUrl`, and paste the token from `npm run token` into `accessToken`.

### CI

`ci/check.yml` is the GitHub Actions workflow (typecheck, lint, test on every push and pull request). It lives outside `.github/` until the repo owner grants the `workflow` scope to the GitHub CLI; see issue #8.

---

## Deploying

Vercel, Node runtime, one project.

1. Link the project and set every variable from the table above as a production environment variable.
2. Deploy once to learn the production URL.
3. Set `APP_ORIGIN` and `OPENROUTER_SITE_URL` to that URL and redeploy, so same-origin checks and OAuth redirects line up.
4. In Supabase, set the Site URL to that origin and add `<origin>/auth/callback` to the redirect list.
5. In Google Cloud, add `<origin>/api/integrations/google/callback` to the OAuth client.
6. Apply the migrations in the SQL editor in order.

Rolling back is a redeploy of the previous build from the Vercel dashboard.

---

## Project structure

```
app/              routes: / (landing), /login, /signup, /auth/callback,
                  /app, /app/connections, /api/*
components/       ui primitives, auth forms, assistant shell,
                  connections cards, generative-ui cards, landing sections
lib/ai            client.ts (OpenRouter), orchestrator.ts, prompts.ts, service.ts
lib/tools         registry.ts + handlers: memory, research, proposals
lib/memory        service.ts, store.ts, normalize.ts, retrieve.ts
lib/connections   catalog.ts, store.ts, service.ts, linking.ts
lib/actions       policy.ts, proposals.ts, store.ts, execute.ts, service.ts
lib/integrations  google-oauth.ts, calendar.ts, shopping.ts,
                  transcription.ts, places.ts
lib/ranking       score.ts, filter.ts, normalize.ts
lib/supabase      client.ts (browser), server.ts (cookies), admin.ts (service role)
lib/schemas       Zod: common, memory, assistant, actions, tools, connections,
                  google, calendar, shopping, db
lib/              env.ts, errors.ts, auth.ts, crypto.ts, oauth-state.ts,
                  time.ts, http.ts, api-client.ts, preferences.ts
types/            contracts.ts — the wire contract
fixtures/         explicitly labelled example data, never a silent fallback
supabase/         versioned migrations
scripts/          verify-setup, create-demo-user, get-access-token,
                  api-test, reset-demo
docs/             limitations.md, demo-script.md
tests/            Vitest suites mirroring lib/ and app/api/
```

---

## API surface

| Method / path | Purpose |
|---|---|
| `GET /api/health` | `{ ok: true }` |
| `GET /api/memories?category=` | Active, unexpired memories of the signed-in user |
| `PATCH /api/memories/:id` | Explicit save with `{ version, value?, status?, expiresAt? }`; `409` on version conflict or an in-flight turn |
| `DELETE /api/memories/:id` | `{ version, confirmed: true }` → `204`. Deletion also drops prior turns from model context |
| `GET /api/turns?conversationId=` | Own turn history, oldest first |
| `GET /api/connections` | The integrations catalogue merged with the caller's own links: kind, honest status, what each enables and never does, account label, connect and unlink paths, plus server readiness. Never token or key material |
| `GET /api/preferences/location` | The caller's saved shopping location |
| `PUT /api/preferences/location` | Save it, canonicalized through Maps when a key is configured; the reply says whether it was verified |
| `DELETE /api/preferences/location` | Clear it. Searches then run without a location rather than guessing one |
| `GET /api/integrations/google/start` | Sets a signed, user-bound `state` cookie and redirects to Google's consent screen (offline access, `calendar.events` and email only) |
| `GET /api/integrations/google/callback` | Checks cookie, signature and session user, exchanges the code server-side, seals the refresh token, stores the link. No token ever appears in a URL |
| `DELETE /api/integrations/google` | Revokes at Google and drops the sealed token; reports honestly whether Google confirmed |
| `POST /api/assistant` | One turn: text, note, voice transcript, or a saved suggestion. Idempotent on `clientRequestId`; one active turn per user |
| `POST /api/transcribe` | Multipart `audio` (≤ 3 MB, ≤ 30 s) → transcript. Nothing is saved; `503` when voice is off |
| `GET /api/actions/:id` | The caller's own proposal, with expiry applied at read time |
| `PATCH /api/actions/:id` | Change the proposal before approving: validates the payload, refuses a past time, bumps the version |
| `POST /api/actions/:id/approve` | The only path that can create a calendar event, and only after the atomic claim. The body carries a version and nothing else |
| `POST /api/actions/:id/cancel` | Cancels a proposal; an executing action cannot be cancelled |

Identity is derived server-side from the Supabase session cookie or an `Authorization: Bearer` header. Mutating browser requests must carry a matching `Origin`. Errors share `{ error: { code, message, retryable }, requestId }`, and every authenticated response is `Cache-Control: no-store`.

---

## How each part works

### Orchestrator

`lib/ai/orchestrator.ts` runs one bounded turn: at most 3 model rounds and 5 tool calls, `parallel_tool_calls: false`, a 25 second deadline. Context is at most 30 memories plus 6 recent turns. The model reaches OpenRouter through the `openai` SDK with strict tool schemas and a strict JSON answer schema derived from Zod, and everything it returns is re-validated server-side.

Tools are capability-gated: memory tools always, research when the deployment can search, and `propose_calendar_event` only for a user who has linked a calendar. Every saved fact must quote the user's newest message; keys are canonicalized server-side; expiries are server defaults; confidence below 0.8 is dropped. The decision card's confirmed needs are verified against stored rows rather than taken from the model, and suggestion chips come from an allowlisted table, so the model can order them but never invent one.

### Linked apps

`lib/connections/catalog.ts` is the single source for every integration's name, its plain-language "enables" and "never" copy, and its kind. `lib/connections/service.ts` merges that catalogue with the caller's rows and the deployment's configuration: a card reads `linked` only when a real row exists, `not_linked` when the user can connect, `unavailable` when the deployment has no OAuth client, and `error` when a stored link stopped working.

Linking uses one confidential Google OAuth client and a per-user grant. The `state` parameter is an HMAC-signed payload carrying the user id, provider and issue time, mirrored in an httpOnly cookie; the callback accepts it only when the cookie matches, the signature verifies, it is under ten minutes old, and the session user is the one who started the link. The refresh token is sealed before it is written and opened only inside the linking service and the calendar executor.

### Grocery research

`lib/integrations/shopping.ts` calls SerpApi's Google Shopping engine and turns each listing into a record whose fields are null when the listing did not state them. A per-kilogram price exists only when the title states a weight, so a 1 lb and a 5 lb bag become genuinely comparable and an "each" listing is shown but not price-ranked. `lib/tools/research.ts` filters irrelevant results (seeds, ketchup, decor), ranks the rest, writes a plain reason on each card, and keeps the results for the turn.

Live results are cached in the process for ten minutes because the provider is slow on a cold query; a cache hit keeps its original retrieval time and is relabelled `cached`. The provider has its own timeout inside the turn's, so a slow search degrades one item to "did not complete" instead of failing the whole turn.

**Where you shop is the user's setting.** It is stored as an ordinary preference memory they can see and delete, edited on the Linked apps page, and applied only to their own searches.

### Approval and Calendar

The model can propose but never execute. Approving calls `claim_action`, a conditional update under the per-user advisory lock. Only after the claim succeeds does the server refresh the caller's own Google token and insert the event, using an event id derived from the action UUID. A retry reuses that id, so Google answers `409` and Nomi reports the existing event rather than creating a second. An ambiguous failure settles as `unknown` and is resolved by reading the event back by id, never by inserting again. Events carry no attendees, no notifications and no default reminders.

### Voice

`lib/integrations/transcription.ts` defines a `Transcriber` interface with Deepgram and OpenAI implementations. The route validates size and type before any provider call, discards the audio afterwards, and writes no memory: the transcript comes back for the user to edit and send.

### Frontend

`/` is the marketing site, whose integration cards derive from the same catalogue as the app so the two can never disagree. `/signup`, `/login` and `/auth/callback` handle accounts. `/app` is the assistant: one conversation column, a composer (Enter sends, Shift+Enter for a newline, push-to-talk when voice is configured), validated cards, and up to four suggestion chips that each post a real turn. Failures render as a plain sentence with Retry, which reuses the same `clientRequestId` so a request that actually finished returns its stored answer. The memory sheet lists everything with its source quote and offers Delete behind a named confirmation. `/app/connections` is onboarding and settings in one page.

Generative UI lives in `components/generative-ui/`: five card components behind a registry that validates every block with Zod before rendering. Unknown or invalid blocks become a text notice with Retry.

### Design

A warm editorial ledger. Fonts are self-hosted at build time through `next/font`: Fraunces for display, Instrument Sans for body, IBM Plex Mono for evidence and metadata.

Light: canvas `#F6F4EF`, surface `#FFFFFF`, text `#1B1A17`, muted `#6B675E`, border `#E3DFD5`, accent `#4F46E5`.
Dark: canvas `#121210`, surface `#1B1A17`, text `#F3F1EA`, muted `#A8A398`, border `#2E2C27`, accent `#A5B4FC`.

Spacing 8/16/24/32/48/64 px. Radius 12 px on controls, 16 px on cards. Motion is 160–220 ms opacity and transform only, disabled under `prefers-reduced-motion`. Tokens are CSS custom properties exposed to Tailwind through `@theme inline`.

---

## Known limitations

The full list is in [docs/limitations.md](docs/limitations.md). The short version:

- Email and password accounts only; no social sign-in.
- Two items per research turn, three listings each. US results, USD, English.
- Listings are search results, not a retailer's live stock.
- One 30-minute calendar event, no attendees, no conflict detection, no edit or delete after creation.
- While the Google consent screen is in Testing mode, refresh tokens expire after seven days and the user must link again.
- Voice is capped at 30 seconds and 3 MB per clip.
- No Playwright browser journey yet, and CI is parked until the repository's token gains the `workflow` scope.

---

## Roadmap

More linkable apps → calendar edit and cancel, notes, reminders → opt-in proactive suggestions → mobile and multimodal capture → learned preferences. Payments and sensitive authentication stay under direct user control.

---

## License

Not yet decided. All rights reserved until a license file is added.
