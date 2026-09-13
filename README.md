# Nomi

**Tell it once. Pick up where life left off.**

Nomi is a personal assistant that remembers everyday context, researches useful options with sourced evidence, and carries out connected actions only after you approve the exact details. Anyone can create an account on the web and link their own apps from inside the product; no source-code or `.env` setup is needed to use it.

> **Status: Phases 0–2 code complete; landing, sign-up, and login done; app linking, app shell, research, and Calendar next.** Contracts, schemas, core logic, Supabase clients, the session guard, the memory service with transactional RPCs, the memories/turns/connections routes, and the OpenRouter orchestrator behind `POST /api/assistant` exist with tests (mocked model; a live smoke test skips without a key). The SaaS landing page, five generative-ui cards, public sign-up with email confirmation, login, and an authenticated `/app` placeholder are in. Per-user Google Calendar linking (Phase 1b), grocery research (Phase 3), Calendar approval (Phase 4), and the conversation UI are not wired yet. Progress is tracked in [IMPLEMENTATION-PLAN.md](IMPLEMENTATION-PLAN.md).

## The loop

**Remember → Understand → Research → Recommend → Ask → Act**

1. You say: *"I'm out of tomatoes and potatoes. I'm cooking chicken curry tonight. I'm looking for running shoes."*
2. Nomi stores four structured, editable memories. You can inspect, correct, or delete them.
3. In a fresh conversation you ask *"What should I buy today?"* Nomi recalls the shortages, connects them to dinner, and keeps the shoes as a separate interest. Other curry ingredients are suggestions, not assumed shortages.
4. Tap **Groceries** → up to three sourced product cards per ingredient, with reasons and honest unknowns.
5. Tap **Schedule grocery run** → an exact event preview. Nothing has been written yet.
6. Tap **Allow** → exactly one real Google Calendar event, with a link to open it.

## Principles

- No invented prices, stock, ratings, savings, or success states. Unknown is shown as unknown.
- No external write without explicit approval of the exact payload. The model proposes; only the approval endpoint executes.
- Memory is built from your explicit statements only, and is always visible, editable, and deletable.
- Research mode (`live`, `cached`, `fixture`) is always labelled in the UI.

## Architecture

| Layer | Choice |
|---|---|
| App | Next.js 16 (App Router), TypeScript strict, React 19, Tailwind 4 |
| Model | OpenRouter (OpenAI-compatible) via the `openai` SDK. Default `openai/gpt-4.1-mini`; configurable with `NOMI_MODEL` |
| Orchestration | One bounded orchestrator with strict tool schemas (≤ 3 rounds, ≤ 5 tool calls) |
| Memory & state | Supabase Postgres: `turns`, `memories`, `actions`. Row-level security on |
| Auth | Supabase email/password with public sign-up and email confirmation; identity always derived from the verified session |
| App linking | Per-user OAuth from `/app/connections`; refresh tokens encrypted at rest; server-side provider keys shown as "Included" (Phase 1b) |
| Research | SerpApi Google Shopping, normalized to a nullable evidence record |
| Action | Google Calendar REST with a deterministic event ID and server-side atomic approval claim |
| Voice (P1) | Push-to-talk → server transcription (Deepgram Nova-3 by default, OpenAI optional) → editable transcript → Send |
| Tests | Vitest (unit + route handlers), Playwright journey later |

## Getting started

```bash
git clone https://github.com/Amith71965/Nomi.git
cd Nomi
npm install
cp .env.example .env    # then fill in values
npm run check           # typecheck + lint + tests
npm run dev             # http://localhost:3000
```

Node 22 or newer is required.

## Environment variables

Copy `.env.example` to `.env` (or `.env.local`). Startup validation fails with the **name** of any missing variable, never its value.

| Group | Variables | Notes |
|---|---|---|
| App | `APP_ORIGIN` | Exact trusted origin, no trailing slash |
| Model | `OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL`, `NOMI_MODEL`, `OPENROUTER_SITE_URL`, `OPENROUTER_APP_NAME` | Model must support tool calling and JSON-schema output. The key is optional at startup; without it the assistant route answers `503 provider_unavailable` and `/api/connections` reports `model.ready=false` |
| Voice (optional) | `ENABLE_VOICE`, `TRANSCRIPTION_PROVIDER` (`deepgram` default or `openai`), `DEEPGRAM_API_KEY`, `DEEPGRAM_MODEL`, `OPENAI_API_KEY`, `OPENAI_TRANSCRIBE_MODEL` | OpenRouter has no speech-to-text. Only the selected provider's key is required, and only when voice is on |
| Supabase | `NEXT_PUBLIC_SUPABASE_URL`; one public key: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, or `SUPABASE_ANON_PUBLIC_KEY`; one server key: `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SECRET_KEY`, or `SUPABASE_LEGACY_SERVICE_ROLE_SECRET_KEY` | Legacy JWT keys and newer publishable/secret keys are both accepted under any of these names. The server key is server-only |
| Owner's test account | `DEMO_USER_ID` (optional), `DEMO_TIME_ZONE` | UUID of your own test user, used only by scripts. Accounts are public; nothing is restricted to this ID |
| Calendar | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `GOOGLE_CALENDAR_ID`, `GOOGLE_CALENDAR_LABEL`, `GOOGLE_OAUTH_REDIRECT_URI` | Redirect URI is for the local authorize script only |
| Shopping | `PRODUCT_SEARCH_API_KEY`, `PRODUCT_SEARCH_LOCATION` | SerpApi key and an explicit city |
| Modes | `RESEARCH_MODE`, `ENABLE_PLACES`, `GOOGLE_MAPS_API_KEY` | Places is P2 and off by default |

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` / `npm start` | Production build and serve |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint (Next core-web-vitals + TypeScript rules) |
| `npm test` | Run all Vitest suites once |
| `npm run test:watch` | Vitest in watch mode |
| `npm run check` | typecheck + lint + test. Must pass before every commit |
| `npm run demo:user` | Create your own test user through the Admin API (skips the email step) and write `DEMO_USER_ID` to `.env`: `DEMO_EMAIL=… DEMO_PASSWORD=… npm run demo:user` |
| `npm run token` | Print a bearer token for a user: `DEMO_EMAIL=… DEMO_PASSWORD=… npm run token` |
| `npm run api:test` | Sign in as the test user, seed a probe memory, run the Postman collection with newman against `BASE_URL` (default `http://localhost:3000`), remove the probe |
| `npm run verify` | End-to-end setup check: env, Supabase connectivity and grants, schema, anon isolation, test user; with `DEMO_EMAIL`/`DEMO_PASSWORD` also sign-in, RLS as that user, memory and turn RPC round trips; with `BASE_URL` also a live API smoke; model/calendar/shopping readiness. Prints PASS/FAIL/SKIP, never a secret |
| `npm run calendar:authorize` | Local one-time OAuth setup for the dedicated demo calendar (Phase 4) |
| `npm run demo:reset` | Scoped reset of the demo user's data, dry-run first (Phase 7) |

## Testing

This is a test-based build. Every module under `lib/` has a test under `tests/`; every API route gets a route test that calls the exported handler with a real `Request`. Provider adapters are tested against recorded fixtures; live tests are opt-in and skip without credentials.

```bash
npm test                 # everything
npx vitest run tests/ranking.test.ts
```

Manual checks that need a human (a real Calendar event, the microphone on the demo browser, the deployed URL) are listed under **Needs a human** in the implementation plan.

### Verifying a setup

```bash
DEMO_EMAIL=… DEMO_PASSWORD=… npm run verify                                   # env, database, RLS, RPCs
BASE_URL=http://localhost:3000 DEMO_EMAIL=… DEMO_PASSWORD=… npm run verify    # + live API smoke (dev server running)
```

Every check prints `PASS`, `FAIL`, or `SKIP` with a one-line reason and the exit code is non-zero on any failure. Probe rows created during the run are removed.

### Postman

`postman/Nomi.postman_collection.json` mirrors the route tests for hand-driven checks against a running server. Every authenticated request uses `Authorization: Bearer <token>`. The quickest path runs it with newman, which needs no Postman account:

```bash
npm run dev            # in one terminal
DEMO_EMAIL=… DEMO_PASSWORD=… npm run api:test   # in another
```

To drive it from the Postman app instead, import the collection, set `baseUrl`, and paste the token printed by `npm run token` into `accessToken`.

### CI

`ci/check.yml` is the GitHub Actions workflow (typecheck, lint, test on every push and PR). It lives outside `.github/` until the repo owner grants the `workflow` scope to the GitHub CLI; see issue #8.

## Project structure

```
app/            routes: / (landing), /login, /signup, /auth/callback, /app, /app/memory, /app/connections, /api/*
components/     ui primitives, assistant shell, generative-ui cards, landing sections
lib/            ai, tools, memory, actions, integrations, ranking, supabase, schemas, env, errors, time
types/          contracts.ts — the wire contract
fixtures/       explicitly labelled example data
supabase/       versioned migrations
scripts/        authorize-calendar, reset-demo
tests/          Vitest suites
```

## API surface

| Method / path | Status | Purpose |
|---|---|---|
| `GET /api/health` | done | `{ ok: true }` |
| `GET /api/memories?category=` | done | Active, unexpired memories of the signed-in user |
| `PATCH /api/memories/:id` | done | Explicit Save with `{ version, value?, status?, expiresAt? }`; `409 version_conflict`, `409 turn_in_progress` |
| `DELETE /api/memories/:id` | done | `{ version, confirmed: true }` → `204`; deletion also drops prior turns from model context |
| `GET /api/turns?conversationId=` | done | Own turn history, oldest first |
| `GET /api/connections` | done (configuration only) | Readiness of model, database, calendar, shopping, voice; never key material |
| `POST /api/assistant` | done (memory tools only) | One turn: text/note/voice transcript, or a saved suggestion. Idempotent on `clientRequestId`; one active turn per user; `409 stale_context` for a suggestion whose source turn was invalidated |
| `POST /api/transcribe` | done (route + adapters) | Multipart `audio` file (≤ 3 MB, ≤ 30 s) → `{ text, confidence, durationSeconds, provider, model }`. Nothing is saved; `503` when voice is disabled; `413`/`400` on bad uploads |
| `GET/PATCH /api/actions/:id`, `POST …/approve`, `POST …/cancel` | Phase 4 | Proposal review, change, approve, cancel |

Identity is derived server-side from the Supabase session cookie or an `Authorization: Bearer <access_token>` header. Mutating requests from a browser must carry a matching `Origin`. Errors share `{ error: { code, message, retryable }, requestId }` and every response is `Cache-Control: no-store`.

## Database

Migrations live in `supabase/migrations/` and are applied by hand in the Supabase SQL editor, in order:

1. `001_initial.sql` — `turns`, `memories`, `actions`, indexes, RLS (authenticated = read own rows only).
2. `002_memory_rpc.sql` — service-role RPCs: `upsert_memories` (newer source wins, same turn is a no-op), `patch_memory`, `delete_memory` (both refuse while a turn is processing and invalidate model context), `invalidate_context`, `has_active_turn`.
3. `003_turn_rpc.sql` — `begin_turn` (idempotent on client request id, one active turn, 60 s abandonment, 10 turns/min), `reopen_turn`, and re-declares the memory RPCs with the same per-user advisory lock so a stale in-flight turn can never write a forgotten fact back. Upserts accept an optional status.

All three are additive: they create `turns`, `memories`, `actions`, their indexes, triggers, policies, and the functions above, and touch nothing else in the project. They are applied to the hackathon Supabase project (a shared free-tier project; Nomi's objects sit alongside unrelated tables and never reference them). To move to a dedicated project later, apply the same three files in order.

## Voice transcription

`lib/integrations/transcription.ts` defines a small `Transcriber` interface with two implementations. `DeepgramTranscriber` posts the raw recording to Deepgram's pre-recorded endpoint (`/v1/listen`, `smart_format`, English) over `fetch` and parses only the transcript, confidence, and duration. `OpenAITranscriber` wraps the OpenAI audio endpoint for parity with the original plan. The route validates size and type before any provider call, discards the audio afterwards, and never writes memory: the transcript comes back for the user to review and send.

`tests/transcription.live.test.ts` posts one second of silence to Deepgram and skips without `DEEPGRAM_API_KEY`. `npm run verify` performs the same check when voice is enabled.

## Orchestrator

`lib/ai/orchestrator.ts` runs one bounded turn: at most 3 model rounds and 5 tool calls, `parallel_tool_calls: false`, a 25 s deadline. Context is at most 30 memories plus 6 recent turns still in model context. The model reaches OpenRouter through the `openai` SDK (`lib/ai/client.ts`) with strict tool schemas and a strict JSON answer schema derived from Zod (`lib/schemas/json-schema.ts` strips constraint keywords strict providers reject; Zod re-validates everything server-side).

The model can only call `get_memories`, `create_memory`, and `update_memory` in this phase. Research and proposal tools appear when Phases 3 and 4 switch their capability flags on. Every saved fact must carry a quote found in the user's newest message; keys are canonicalized server-side; expiries are server defaults; confidence below 0.8 is dropped with a reason. The decision card's confirmed needs and interests are verified against stored memory rows, not taken from the model. Suggested actions come from an allowlisted stage table; the model may order them but cannot invent one, and nothing is offered without a working handler.

`tests/ai.live.test.ts` is the OpenRouter smoke test; it skips unless `OPENROUTER_API_KEY` is set.

## Frontend

Routes: `/` SaaS landing (nav, hero with a real rendering of the product cards labelled as illustrative, how it works, walkthrough, integrations with honest status badges, trust, FAQ, CTA, footer), `/signup` (email, password, confirm; shows "check your email" when confirmation is on, and says so plainly when an account exists or sign-ups are off), `/login`, `/auth/callback` (turns the confirmation link into a session and redirects only inside the app), `/app` authenticated shell placeholder. `proxy.ts` sends signed-out visitors from `/app` to `/login` and signed-in visitors away from `/login` and `/signup`.

Sign-up needs two Supabase settings: email sign-ups allowed (Authentication → Sign In / Providers → Email) and, under URL Configuration, Site URL set to `APP_ORIGIN` with `APP_ORIGIN/auth/callback` in the redirect list. New accounts are sent to `/app/connections` to choose which apps to link.

Generative UI lives in `components/generative-ui/`: five card components (`memory_update`, `shopping_results`, `decision_card`, `approval_card`, `calendar_confirmation`) behind a registry that validates every block with Zod before rendering. Unknown or invalid blocks render a text notice with Retry. The landing page renders the same components from `fixtures/ui-responses.json`.

### Design tokens

Warm editorial ledger. Fonts are self-hosted at build time through `next/font`: Fraunces (display), Instrument Sans (body), IBM Plex Mono (evidence and metadata).

Light: canvas `#F6F4EF`, surface `#FFFFFF`, text `#1B1A17`, muted `#6B675E`, border `#E3DFD5`, accent `#4F46E5`.
Dark: canvas `#121210`, surface `#1B1A17`, text `#F3F1EA`, muted `#A8A398`, border `#2E2C27`, accent `#A5B4FC`.
Spacing 8/16/24/32/48/64 px. Radius 12 px controls, 16 px cards, pill chips. Motion 160–220 ms opacity/transform only; `prefers-reduced-motion` disables it. Tokens are CSS custom properties in `app/globals.css`, exposed to Tailwind through `@theme inline`.

Integration badges on the landing page come from `components/landing/content.ts`. Only a hand-set `live` status renders as "Live", and only after the provider has been verified end to end.

## Known limitations

- Email and password accounts only; no social sign-in yet.
- English, US shopping results, USD, manually selected city.
- One 30-minute calendar event, no attendees, no conflict detection.
- Shopping results are search listings, not live retailer stock.

## Roadmap (post-hackathon)

More linkable apps → calendar edit/cancel, notes, reminders → opt-in proactive suggestions → mobile and multimodal capture → learned preferences. Payments and sensitive authentication stay under direct user control.

## License

Not yet decided. All rights reserved until a license file is added.
