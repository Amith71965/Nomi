# Nomi

**Tell it once. Pick up where life left off.**

Nomi is a personal assistant that remembers everyday context, researches useful options with sourced evidence, and carries out connected actions only after you approve the exact details.

> **Status: Phase 0 — foundation.** Wire contracts, runtime schemas, core logic (memory keys, time resolution, ranking, approval policy) and their tests exist. No database, model, provider, or UI flow is wired yet. Progress is tracked in [IMPLEMENTATION-PLAN.md](IMPLEMENTATION-PLAN.md).

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
| Auth | Supabase email/password, one private demo user |
| Research | SerpApi Google Shopping, normalized to a nullable evidence record |
| Action | Google Calendar REST with a deterministic event ID and server-side atomic approval claim |
| Voice (P1) | Push-to-talk → server transcription → editable transcript → Send |
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
| Model | `OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL`, `NOMI_MODEL`, `OPENROUTER_SITE_URL`, `OPENROUTER_APP_NAME` | Model must support tool calling and JSON-schema output |
| Voice (optional) | `ENABLE_VOICE`, `OPENAI_API_KEY`, `OPENAI_TRANSCRIBE_MODEL` | OpenRouter has no speech-to-text; a direct OpenAI key is needed only if voice is on |
| Supabase | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Service role key is server-only |
| Demo | `DEMO_USER_ID`, `DEMO_TIME_ZONE` | UUID of the pre-created auth user |
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
| `npm run calendar:authorize` | Local one-time OAuth setup for the dedicated demo calendar (Phase 4) |
| `npm run demo:reset` | Scoped reset of the demo user's data, dry-run first (Phase 7) |

## Testing

This is a test-based build. Every module under `lib/` has a test under `tests/`; every API route gets a route test that calls the exported handler with a real `Request`. Provider adapters are tested against recorded fixtures; live tests are opt-in and skip without credentials.

```bash
npm test                 # everything
npx vitest run tests/ranking.test.ts
```

Manual checks that need a human (a real Calendar event, the microphone on the demo browser, the deployed URL) are listed under **Needs a human** in the implementation plan.

## Project structure

```
app/            routes: / (landing), /login, /app, /app/memory, /app/connections, /api/*
components/     ui primitives, assistant shell, generative-ui cards, landing sections
lib/            ai, tools, memory, actions, integrations, ranking, supabase, schemas, env, errors, time
types/          contracts.ts — the wire contract
fixtures/       explicitly labelled example data
supabase/       versioned migrations
scripts/        authorize-calendar, reset-demo
tests/          Vitest suites
```

## API surface (target)

| Method / path | Purpose |
|---|---|
| `POST /api/assistant` | One turn: text/note/voice transcript, or a saved suggestion |
| `GET /api/turns?conversationId=` | Own turn history |
| `GET /api/memories`, `PATCH /api/memories/:id`, `DELETE /api/memories/:id` | Read, edit, confirm-delete memories |
| `POST /api/transcribe` | Audio → text (voice P1) |
| `GET/PATCH /api/actions/:id`, `POST …/approve`, `POST …/cancel` | Proposal review, change, approve, cancel |
| `GET /api/connections` | Honest readiness of model, database, calendar, shopping, voice |
| `GET /api/health` | `{ ok: true }` |

Errors share `{ error: { code, message, retryable }, requestId }`.

## Design tokens

Light: canvas `#F7F7F5`, surface `#FFFFFF`, text `#17191F`, muted `#5E626E`, accent `#4F46E5`.
Dark: canvas `#111318`, surface `#1A1D24`, text `#F5F6F8`, muted `#ADB3C0`, accent `#A5B4FC`.
Spacing 8/16/24/32/48/64 px. Radius 12 px controls, 16 px cards, pill chips. Motion 160–220 ms opacity/transform.

## Known limitations

- Single private demo user; no public onboarding.
- English, US shopping results, USD, manually selected city.
- One 30-minute calendar event, no attendees, no conflict detection.
- Shopping results are search listings, not live retailer stock.

## Roadmap (post-hackathon)

Per-user OAuth and encrypted tokens → calendar edit/cancel, notes, reminders → opt-in proactive suggestions → mobile and multimodal capture → learned preferences. Payments and sensitive authentication stay under direct user control.

## License

Not yet decided. All rights reserved until a license file is added.
