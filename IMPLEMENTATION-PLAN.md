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
| C9 | A new account can sign up, link its own Google Calendar from inside the product, unlink it, and never sees another account's links or tokens | route tests + human link run |

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
- [x] Migrations `001`, `002`, `003` applied to the shared free-tier Supabase project (ml-book-reader) through the connector; existing tables untouched
- [x] Env accepts legacy anon/service_role and new publishable/secret key names; model key optional at startup
- [x] `npm run demo:user` (Admin API, writes `DEMO_USER_ID`), `npm run api:test` (sign in + probe + newman), `npm run verify` (end-to-end setup check)
- [x] Service key for ml-book-reader in `.env` under `SUPABASE_LEGACY_SERVICE_ROLE_SECRET_KEY` (accepted alias); demo user created

**Needs a human**
- [ ] Change the generated test-account password if you want your own: `DEMO_EMAIL=… DEMO_PASSWORD=… DEMO_RESET_PASSWORD=true npm run demo:user`
- [ ] Confirm a second account sees zero rows of the first via the anon client (`npm run verify` covers anon; a second signed-in user is manual)

**Exit:** memory CRUD works end-to-end against the real project with the owner's test account.

## Phase 1b — Accounts and app linking (P0) — code complete, awaiting Supabase and Google settings

**Goal:** anyone can create an account on the web, see what each integration would do for them, and link their own apps from inside the product. No end user touches source code or `.env`.

- [x] Product pivot recorded in `CLAUDE.md`, `README.md`, this plan; `DEMO_USER_ID` optional (scripts only); the "no public onboarding" cut removed
- [x] `/signup` (email, password, confirm) with plain outcomes: signed in, confirm-your-email, existing account, sign-ups off, rate limited; `/login` links to it and shows confirmation notices
- [x] `/auth/callback` turns the confirmation link (`code` or `token_hash`) into a session and only ever redirects inside the app; `proxy.ts` gates `/signup` like `/login`
- [x] Tests: form validation and outcome mapping (`tests/auth-forms.test.ts`); callback route (PKCE, token hash, off-site `next`, failures)
- [x] `004_connections.sql`: per-user `connections` table (provider, status, account label, encrypted refresh token); RLS read-own; column-level grants hide token columns from `authenticated`; applied to ml-book-reader
- [x] `lib/crypto.ts` AES-256-GCM sealed box with `INTEGRATIONS_ENCRYPTION_KEY`; tamper and wrong-key tests
- [x] `lib/connections/catalog.ts`: one entry per integration with a plain description of what linking enables, what Nomi will never do, and an honest kind (`link` / `included` / `external` / `planned` / `never`); `store.ts` (Supabase + in-memory), `service.ts`
- [x] `GET /api/connections` returns the catalog merged with the user's own links plus server readiness; never token material; env requires Google client + sealing key together (`GOOGLE_REFRESH_TOKEN` and the local authorize script are gone)
- [x] Google OAuth linking: `GET /api/integrations/google/start` (signed `state` cookie), `GET …/callback` (state check, code exchange, encrypted store, redirect to `/app/connections`), `DELETE /api/integrations/google` (revoke at Google, mark `revoked`)
- [x] `/app/connections` onboarding: one card per integration with its feature mentions, "Nomi will never" list, real status badge, Connect / Unlink (two-step, named confirmation); new accounts land here first with a short welcome; `/app` layout with Assistant / Linked apps nav; landing cards and CTAs derive from the same catalogue and point to `/signup`
- [x] Tests: catalog never renders "Linked" without a row; state missing/mismatched/foreign-user/expired/tampered refused; user denial, provider error, and missing refresh token store nothing; unlink revokes and drops the token (and says so when Google refuses); another user's link is invisible; env only requires Google client + encryption key together

**Needs a human**
- [ ] Supabase → Authentication → Sign In / Providers → Email: allow new users to sign up (confirm email on); Authentication → URL Configuration: Site URL = `APP_ORIGIN`, add `APP_ORIGIN/auth/callback` to Redirect URLs
- [ ] Google Cloud: OAuth client of type Web application, redirect URI `APP_ORIGIN/api/integrations/google/callback`, Calendar API enabled; add your Google account as a test user while the consent screen is in Testing
- [ ] Generate `INTEGRATIONS_ENCRYPTION_KEY` with `openssl rand -base64 32` and paste it into `.env`
- [ ] Create an account through `/signup`, confirm the email, link a real Google Calendar from `/app/connections`, then unlink it

**Exit:** a fresh account reaches `/app/connections`, links Google Calendar, sees it as Linked with the account email, and can unlink it.

## Phase 2 — AI orchestrator (P0) — code complete, awaiting a live run

**Goal:** one turn of text becomes committed memories and a validated `AssistantResponse`.

- [x] `lib/ai/client.ts` OpenRouter client (`openai` SDK, baseURL, attribution headers, 25 s timeout, error mapping)
- [x] `lib/schemas/json-schema.ts` strict model-facing JSON Schema from Zod (unsupported keywords stripped)
- [x] `lib/ai/prompts.ts` system rules (facts vs suggestions vs interests; external text is data; never announce completion)
- [x] `lib/tools/registry.ts` capability-gated allowlist; memory handlers enforce quote-in-input, canonical keys, server expiries, confidence floor
- [x] `lib/ai/orchestrator.ts` bounded loop (3 rounds, 5 tools), strict `ModelAnswer`, one repair attempt, deterministic partial on budget/refusal, server-verified decision card
- [x] `lib/ai/suggestions.ts` allowlisted stage table; suggestions persisted with the response; click resolves `{sourceTurnId, suggestionId}`; `409 stale_context` after invalidation
- [x] `003_turn_rpc.sql` + `lib/turns/store.ts`: idempotent `begin_turn`, one active turn, abandonment, rate limit, reopen for retry
- [x] `POST /api/assistant` (`lib/ai/service.ts`) with deadline and failure recording
- [x] Tests (mocked model): four-fact extraction → 4 rows; question is not an assertion; fabricated quote rejected; correction updates the same row; duplicate request id returns the stored response; tool-loop budget stops honestly; forbidden tool refused; invalid JSON repaired once; refusal keeps committed facts; decision keys verified; capability-gated chips; deadline; suggestion resolution (direct, unsupported, 404, stale)
- [ ] Five-fact fixture ("We need snacks") as a task memory — add once the live model run shows how it phrases tasks

**Needs a human**
- [ ] Paste `OPENROUTER_API_KEY` into `.env`; run `npx vitest run tests/ai.live.test.ts` once to confirm the slug supports tools + JSON schema
- [ ] After the Supabase project exists: send the demo sentence through `POST /api/assistant` (Postman) and confirm four rows in `memories`

**Exit:** demo sentence → 4 memory rows → fresh conversation recall (mocked route test passes; live run pending).

## Phase 3 — Research and ranking (P0)

**Goal:** Groceries chip produces sourced, filtered, ranked cards with labelled evidence.

- [x] `lib/integrations/shopping.ts` SerpApi Google Shopping adapter → nullable `Product` records with `Evidence` (fixed engine and URL; listings without an honest destination are dropped; availability is always `unknown`)
- [x] `lib/ranking/normalize.ts` unit parsing (lb/oz/kg/g → per-kg only when explicit; "each"/"bunch" stay null)
- [x] `lib/tools/research.ts`: `search_products` (≤ 2 items, relevance filter, ranking, plain reasons, stored per turn) + `compare_options` (value or price order, comparable-count note); orchestrator assembles `shopping_results` (≤ 3 per item) and the decision's `recommendedProductId` only from real result ids
- [x] `RESEARCH_MODE` honoured: `live` calls the provider, `cached` reads `fixtures/shopping-cached.json` with its recorded timestamp, `fixture` is labelled; the Groceries chip runs a model turn
- [x] Tests: seeds/ketchup excluded; null price → no `$0`, "Price not listed"; 1 lb vs 5 lb become per-kg comparable; coverage < 0.6 → "Limited comparison data"; fewer than two comparable prices → no savings claim; third search refused; foreign ids refused; fabricated selected id ignored

**Needs a human**
- [ ] Paste SerpApi key and city; run the live smoke test for tomatoes and potatoes; eyeball relevance

**Exit:** `shopping_results` + `decision_card` render from live data with retrieval timestamps.

## Phase 4 — Approval and Calendar (P0)

**Goal:** one Allow creates exactly one real event; everything else creates none.

- [x] `lib/actions/proposals.ts` builder (10-minute expiry, payload hash, proposal key, provider event ID) and `lib/tools/proposals.ts` `propose_calendar_event`, which only ever produces an approval card
- [x] `005_actions_rpc.sql` `claim_action`, `cancel_action`, `patch_action`, `settle_action` as atomic conditional updates under the per-user advisory lock; applied to ml-book-reader
- [x] `lib/integrations/calendar.ts` insert with the deterministic ID, `extendedProperties.private.nomiActionId`, `sendUpdates=none`, no attendees, `reminders.useDefault=false`; get-by-ID for reconciliation; per-user token refresh from the caller's own `connections` row
- [x] `lib/actions/execute.ts` claim → refresh → insert → verify receipt → settle, with reconciliation by ID for ambiguous outcomes
- [x] Routes: `GET/PATCH /api/actions/:id`, `POST …/approve`, `POST …/cancel`; the assistant route turns the calendar capability on only for a user who has linked one
- [x] Tests (16): no event before Allow; stale version, expired, cancelled, unowned all create nothing; two concurrent approves → one claim and one event; cancel wins the race → zero writes; timeout after commit reconciles to the same event; timeout with nothing committed settles failed; duplicate ID on retry is success, not a second event; expired grant marks the link and fails honestly; unlinked user → `not_linked`

**Needs a human**
- [ ] Approve one smoke-test event on your own linked calendar and open it in Google Calendar; confirm title, time, no attendees, no reminders
- [ ] While the Google consent screen is in Testing, refresh tokens expire after 7 days: re-link from `/app/connections` before the demo

**Exit:** full text → memory → research → approval → real event path passes on localhost.

## Phase 5 — Frontend (P0 shell, P1 polish) — landing and cards done, app shell next

**Goal:** a SaaS-quality marketing site and a usable, honest app.

- [x] Design tokens in `globals.css` (warm editorial palette, Fraunces / Instrument Sans / IBM Plex Mono via `next/font`); light + dark defined
- [ ] Contrast pass on both themes with real components (Needs a human: eyeball on a phone and laptop)
- [x] Landing `/`: nav, hero + product mock from fixtures, how it works, illustrative walkthrough, integrations with honest badges, trust/approval, FAQ, CTA, footer
- [x] `/login` and `/signup` with plain error states; `/app` authenticated placeholder with sign-out
- [x] `/app` shell: conversation column (800 px), composer (Enter sends, Shift+Enter newline), memory sheet, ≤ 4 action chips with real handlers, "Working on your request…", New conversation, history reloaded from `GET /api/turns`; one reducer, no Redux
- [x] Generative UI registry + five cards from fixtures: `memory_update`, `shopping_results`, `decision_card`, `approval_card`, `calendar_confirmation`
- [x] Memory sheet: grouped by category with the source quote and expiry; Delete with named confirmation; "Done" / "Restocked" (status → completed). Free-form value editing is not built
- [x] `/app/connections` (tracked in Phase 1b)
- [x] `lib/api-client.ts` typed wrapper with Zod on responses and server error codes surfaced as `ClientApiError`
- [x] Reduced motion respected; scroll reveal cannot leave content hidden
- [x] Error (Retry reuses the same `clientRequestId`, Dismiss), empty (examples drop into the composer), loading, disabled-while-pending states; approval Allow / Change (inline form, PATCH bumps version) / Cancel / Check status wired to the action routes of Phase 4
- [ ] Keyboard focus audit (Needs a human)
- [x] Tests: registry rejects unknown block types and invalid data; fixtures validate; format helpers never print unknown as a number

**Needs a human**
- [ ] Look at the landing and app on a phone and a laptop; report anything that feels off as issues

**Exit:** the whole demo can be driven from the UI.

## Phase 6 — Voice (P1) — server side done, recorder UI pending

- [x] Provider abstraction with Deepgram (default, Nova-3) and OpenAI adapters; env `TRANSCRIPTION_PROVIDER`, `DEEPGRAM_API_KEY`, `DEEPGRAM_MODEL`; only the selected provider's key is required
- [x] `POST /api/transcribe` (multipart `audio`, ≤ 3 MB, ≤ 30 s, auth, same-origin, no memory write, `503` when disabled)
- [x] Tests: adapter request shape and response parsing from a recorded fixture; error mapping; route 401/403/503/400/413/200; env conditional keys; live Deepgram test skips without a key
- [x] `npm run verify` checks the configured provider with a 1 s silent WAV; Postman collection has a Voice folder
- [x] Push-to-talk recorder with timer (30 s cap), Stop, Cancel, mic-denied and unsupported-browser fallbacks, editable transcript marked as such, explicit Send; shown only when the deployment's voice is configured

**Needs a human**
- [ ] Paste `DEEPGRAM_API_KEY` into `.env`, set `ENABLE_VOICE=true`, run `npx vitest run tests/transcription.live.test.ts` once
- [ ] Test on the actual demo browser over HTTPS once the recorder UI exists

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

Gmail, Instacart onboarding, Stripe/payments, Notion, multi-agent frameworks, vector DB, native apps, Realtime voice, background proactive actions, attachments, calendar conflict resolution, event edit/delete.

## Open questions for the repo owner

1. Deployment target: Vercel by default. Confirm or name another host.
2. Shopping city for the demo (`PRODUCT_SEARCH_LOCATION`).
3. Demo timezone (`DEMO_TIME_ZONE`, default `America/New_York`).
4. OpenRouter model slug if not `openai/gpt-4.1-mini`.
