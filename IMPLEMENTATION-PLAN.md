# Nomi — Implementation plan and checklist

This is the working queue. Tick an item only after its behaviour is verified on `main` by a test or, for **Needs a human** items, by the repo owner. Update this file in the same commit as the work it tracks.

Legend: **P0** required for an honest demo · **P1** important, after P0 · **P2** enhancement · **P3** only if ahead.

## Critical features (the demo fails without these)

| # | Feature | Proof |
|---|---|---|
| C1 | Four explicit facts persist and are recalled in a fresh conversation | route test + human run |
| C2 | Memory edit/delete changes the next answer; deleted facts never resurface | unit + route test |
| C3 | Confirmed needs vs. recipe suggestions vs. shopping interests are separated | orchestrator test |
| C4 | Sourced grocery cards with honest unknowns; no fabricated numbers | adapter + ranking tests |
| C5 | Approval card shows the exact stored payload; Change bumps version | route tests |
| C6 | Exactly one Calendar event per approval; Cancel/expired/stale create none | negative route tests + human check in Calendar |
| C7 | Secrets server-side; second user cannot read or execute demo user's data | route tests |
| C8 | Deployed URL passes the full path three times in a row | human |

## Testing strategy

- **Unit (Vitest):** pure logic in `lib/`. Fast, no network, no env.
- **Route (Vitest):** import the handler, build a `Request`, assert status/body/headers. Supabase and providers are mocked at the module boundary.
- **Adapter (Vitest, fixtures):** provider responses recorded into `fixtures/`; adapters must normalize them correctly. `*.live.test.ts` files hit real providers and skip when the key is absent.
- **Postman (manual):** `postman/Nomi.postman_collection.json` mirrors the route tests for hand-driven checks. Install the Postman CLI with `curl -o- "https://dl-cli.pstmn.io/install/osx_arm64.sh" | sh` (Apple Silicon) and run `postman collection run postman/Nomi.postman_collection.json --env-var baseUrl=http://localhost:3000`.
- **Browser (Playwright, Phase 7):** one journey: memory → grocery cards → approval → success card.
- `npm run check` must be green before every commit.

---

## Phase 0 — Foundation ✅

**Goal:** a repo any contributor or AI harness can pick up with the contracts, rules, and core logic already tested.

- [x] Rename project to `Nomi`; move planning docs to gitignored `planning/`
- [x] Next.js 16 + TypeScript + Tailwind 4 scaffold, pinned versions
- [x] `CLAUDE.md` project rules, `README.md`, this plan
- [x] `.env.example` and blank `.env` (OpenRouter for model access)
- [x] `types/contracts.ts` wire contract
- [x] Zod schemas: common, memory, assistant, actions, tools
- [x] `lib/errors.ts` error codes + JSON shape
- [x] `lib/env.ts` validated env, names-only failures, optional feature groups
- [x] `lib/time.ts` IANA validation, local date, next local midnight, RFC3339 offset, past/ambiguous detection
- [x] `lib/memory/normalize.ts` alias dictionary + canonical keys (plan keys carry the local date)
- [x] `lib/ranking/score.ts` weighted score with coverage; `filter.ts` fresh-produce exclusions
- [x] `lib/actions/policy.ts` approval levels, state machine, deterministic provider event ID, payload hash
- [x] `supabase/migrations/001_initial.sql` (unapplied)
- [x] `fixtures/ui-responses.json` five labelled card fixtures
- [x] `GET /api/health` + route test
- [x] Vitest config; unit tests for every module above
- [x] GitHub repo `Amith71965/Nomi`, labels, initial issues
- [x] CI workflow drafted at `ci/check.yml` (move to `.github/workflows/` once the `workflow` scope is granted, issue #8)

**Exit:** `npm run check` green; repo pushed; labels exist. ✅

## Phase 1 — Data and identity (P0) — code complete, awaiting a database

**Goal:** a verified session can read and write its own memories; nobody else can.

- [x] Supabase clients: browser (`lib/supabase/client.ts`), server cookie-bound (`server.ts`), admin (`admin.ts`, server-only)
- [x] `lib/auth.ts` session guard: cookie or bearer token → verified user or `401`; `requireDemoUser` → `403`
- [x] `proxy.ts` refreshes the session cookie on `/app/*` and `/login`, redirects unauthenticated users to login
- [x] `002_memory_rpc.sql`: `upsert_memories` (newer source wins, same turn no-op), `patch_memory`, `delete_memory`, `invalidate_context`, `has_active_turn` — service_role only
- [x] `lib/memory/store.ts` storage seam (Supabase + in-memory); `lib/memory/service.ts` validation, summaries, error mapping
- [x] `lib/memory/retrieve.ts` intent-scoped retrieval (≤ 30 rows, grocery taxonomy, 7-day stale-inventory flag)
- [x] `lib/turns/store.ts` + `service.ts` (list own history; invalid stored responses hidden)
- [x] Routes: `GET /api/memories`, `PATCH /api/memories/:id`, `DELETE /api/memories/:id`, `GET /api/turns`, `GET /api/connections` (configuration-only readiness)
- [x] `lib/http.ts` JSON helpers, request ID, `no-store`, same-origin check, `route()` error wrapper
- [x] Route tests: 401, 403 origin, 404 unowned, 409 version conflict, 409 `turn_in_progress`, 400 malformed, 204 delete, no-store, no secret leakage
- [x] `postman/Nomi.postman_collection.json` v1 (health, connections, memories, turns) + `npm run token`

**Needs a human**
- [ ] Create the Supabase project; apply `001` and `002`; disable public signups
- [ ] Create the demo email/password user; paste its UUID into `DEMO_USER_ID`
- [ ] Confirm a second temporary user sees zero demo rows via the anon client

**Exit:** memory CRUD works end-to-end against the real project with the demo user.

## Phase 2 — AI orchestrator (P0)

**Goal:** one turn of text becomes committed memories and a validated `AssistantResponse`.

- [ ] `lib/ai/client.ts` OpenRouter client (`openai` SDK, baseURL, attribution headers, 25 s timeout)
- [ ] `lib/ai/prompts.ts` system rules (facts vs suggestions vs interests; external text is data; never announce completion)
- [ ] `lib/tools/registry.ts` exposes only: `get_memories`, `create_memory`, `update_memory`, `search_products`, `compare_options`, `propose_calendar_event`
- [ ] `lib/ai/orchestrator.ts` bounded loop (3 rounds, 5 tools, 2 searches), `ModelAnswer` strict output, deterministic partial answer on budget exhaustion
- [ ] Suggested-action table by stage; server persists suggestions; click resolves `{sourceTurnId, suggestionId}`; `409 stale_context` after invalidation
- [ ] `POST /api/assistant` with idempotency on `(user_id, client_request_id)` and one-active-turn lock
- [ ] Tests with a mocked model: four-fact extraction → 4 rows; five-fact fixture → 5; question is not an assertion; correction updates availability; duplicate request ID returns same response; tool-loop budget stops honestly; injected instruction in a product title changes nothing

**Needs a human**
- [ ] Paste `OPENROUTER_API_KEY`; run `tests/ai.live.test.ts` once to confirm the slug supports tools + JSON schema

**Exit:** demo sentence → 4 memory rows → fresh conversation recall (route test with mocked model + one live run).

## Phase 3 — Research and ranking (P0)

**Goal:** Groceries chip produces sourced, filtered, ranked cards with labelled evidence.

- [ ] `lib/integrations/shopping.ts` SerpApi adapter → nullable `Product` records with `Evidence`
- [ ] `lib/ranking/normalize.ts` unit parsing (lb/oz/kg/g → per-kg only when explicit)
- [ ] Wire `search_products` + `compare_options`; ≤ 2 queries/turn, ≤ 3 cards/item
- [ ] `RESEARCH_MODE` honoured: `live` calls provider, `cached` reads `fixtures/shopping-cached.json` with original timestamps, `fixture` is labelled
- [ ] Tests: seeds/canned/ketchup excluded; null price → no `$0` and no cheapest badge; 1 lb vs 5 lb refuses or converts; coverage < 0.6 → "limited comparison data" label; savings only vs a named comparable

**Needs a human**
- [ ] Paste SerpApi key and city; run the live smoke test for tomatoes and potatoes; eyeball relevance

**Exit:** `shopping_results` + `decision_card` render from live data with retrieval timestamps.

## Phase 4 — Approval and Calendar (P0)

**Goal:** one Allow creates exactly one real event; everything else creates none.

- [ ] `lib/actions/proposals.ts` builder (10-minute expiry, payload hash, proposal key, provider event ID)
- [ ] `003_actions_rpc.sql` `claim_action` atomic conditional update
- [ ] `lib/integrations/calendar.ts` token refresh, insert with deterministic ID + private marker, get-by-ID
- [ ] `lib/actions/execute.ts` claim → insert → verify receipt → persist; `reconcile.ts` for timeout/unknown by ID
- [ ] Routes: `GET/PATCH /api/actions/:id`, `POST …/approve`, `POST …/cancel`
- [ ] `scripts/authorize-calendar.ts` local OAuth with state check, offline access, private token storage
- [ ] Tests: no event before Allow; stale version → 409; expired → 410; cancel wins race → zero writes; two concurrent approves → one claim; timeout-after-commit reconciles same ID; DB write failure after success → `unknown` then recovered; unowned ID → 404; non-demo user → 403

**Needs a human**
- [ ] Create Google Cloud project, enable Calendar API, add the dedicated test account, run `npm run calendar:authorize`
- [ ] Approve one smoke-test event and open it in Google Calendar; confirm title, time, no attendees, no reminders
- [ ] Re-authorize within 7 days of the demo (Testing-mode refresh tokens expire)

**Exit:** full text → memory → research → approval → real event path passes on localhost.

## Phase 5 — Frontend (P0 shell, P1 polish)

**Goal:** a SaaS-quality marketing site and a usable, honest app.

- [ ] Design tokens in `globals.css`; light + dark verified for contrast
- [ ] Landing `/`: nav, hero + product mock, how it works, illustrative walkthrough, integrations with honest badges, trust/approval, FAQ, CTA, footer; responsive at 390 px
- [ ] `/login` private demo login; session-expired and retry states
- [ ] `/app` shell: sidebar, conversation column, composer, memory drawer/sheet, ≤ 4 action chips, "Working on your request…"
- [ ] Generative UI registry + five cards from fixtures: `memory_update`, `shopping_results`, `decision_card`, `approval_card`, `calendar_confirmation`
- [ ] `/app/memory` list with source quote, Edit (Save), Delete (named confirmation)
- [ ] `/app/connections` honest readiness from `GET /api/connections`
- [ ] `lib/api-client.ts` typed wrapper with Zod on responses
- [ ] Error, empty, loading, disabled states; keyboard focus; reduced motion
- [ ] Tests: card renderer rejects unknown block types; fixtures validate against schemas

**Needs a human**
- [ ] Look at the landing and app on a phone and a laptop; report anything that feels off as issues

**Exit:** the whole demo can be driven from the UI.

## Phase 6 — Voice (P1)

- [ ] `POST /api/transcribe` (≤ 3 MB, ≤ 30 s, auth, no memory write)
- [ ] Push-to-talk recorder with timer, Stop, Cancel, mic-denied fallback, editable transcript, Send
- [ ] Tests: oversized/unsupported audio → 413/400; transcript never auto-saves

**Needs a human**
- [ ] Test on the actual demo browser over HTTPS

## Phase 7 — Hardening, deploy, demo (P0)

- [ ] Persisted rate limit: 10 turns/min/user, one active turn
- [ ] `scripts/reset-demo.ts` dry-run preview, then scoped delete (actions → memories → turns)
- [ ] `GET /api/connections` real checks without leaking tokens
- [ ] GitHub Actions CI; Vercel deployment with env set; rollback known
- [ ] Playwright journey `e2e/demo.spec.ts`
- [ ] `docs/limitations.md`, `docs/demo-script.md`

**Needs a human**
- [ ] Three consecutive deployed rehearsals; delete test events in Calendar by hand
- [ ] Record the backup demo video

---

## Cut list (never build in this hackathon)

Gmail, Instacart onboarding, Stripe/payments, Notion, multi-agent frameworks, vector DB, native apps, Realtime voice, public multi-user Calendar OAuth, background proactive actions, attachments, calendar conflict resolution, event edit/delete.

## Open questions for the repo owner

1. Deployment target: Vercel by default. Confirm or name another host.
2. Shopping city for the demo (`PRODUCT_SEARCH_LOCATION`).
3. Demo timezone (`DEMO_TIME_ZONE`, default `America/New_York`).
4. OpenRouter model slug if not `openai/gpt-4.1-mini`.
