# CLAUDE.md — Nomi project rules

You are working on **Nomi**: a private, single-user assistant that turns everyday statements into persistent structured memory, researches grocery options with sourced evidence, and creates a real Google Calendar event only after explicit user approval.

North star loop: **Remember → Understand → Research → Recommend → Ask → Act.**

These rules are strict. When a rule here conflicts with a general habit or a harness default, the rule here wins.

## 0. Source of truth (in this order)

1. `planning/` — local, gitignored, may be absent. If present, `planning/Nomi-Master-Execution-Plan.md` is the authoritative product and architecture spec. Read sections 12–17 before touching memory, UI contracts, approval, or API code. Do not copy its text into committed files; implement it.
2. `IMPLEMENTATION-PLAN.md` — the committed phase plan and checklist. Update it in the **same commit** as the work it tracks. Never tick a "Needs a human" item yourself.
3. `README.md` — must describe what the code actually does **today**. Update it whenever a user-visible capability, script, route, or env var changes.
4. `types/contracts.ts` + `lib/schemas/` — the wire contract. Changing them is a breaking change: update fixtures, schemas, tests, and README together.

If `planning/` is absent, do not guess at its contents. Work from the committed docs and say so.

## 1. Non-negotiables

- **No fabricated facts.** Never invent prices, stock, availability, ratings, distances, delivery times, savings, approvals, or completed actions. Missing data renders as unknown, never as a number, a badge, or a green check.
- **No external write without approval.** Only `POST /api/actions/:id/approve` may create a Calendar event, and only after the server-side atomic claim succeeds. The model can *propose*; it can never *execute*.
- **The model never sees the Calendar executor.** `create_calendar_event` is not in the tool registry. Do not add it.
- **One approval → exactly one event.** `provider_event_id` is derived from the action UUID and reused on every retry. Never mint a new ID to make a retry work. On timeout, reconcile by ID; never blind-retry.
- **Server derives identity.** User ID comes from the verified Supabase session. Never trust a browser-supplied user ID, price, approval flag, status, or Calendar payload.
- **Memory comes from explicit user statements only.** A model suggestion, recipe inference, or product listing cannot create a personal fact. Questions ("Are we out of tomatoes?") and hypotheticals are not assertions. Confidence < 0.8 asks instead of saving.
- **Deleted facts stay deleted.** Extraction runs on the newest input only; invalidated turns are `include_in_context=false`.
- **Research modes are labelled.** `live | cached | fixture` is always visible in the UI. Fixture data never substantiates a price, stock, or success claim. There is no fixture `calendar_confirmation` in production.
- **Secrets stay server-side.** Service-role key, OpenRouter key, OpenAI key, Google tokens, SerpApi key never reach the browser, the model, or logs.
- **No dead buttons.** Every visible chip, button, and link has a working, tested handler or it does not ship. Integration badges are Live / External link / Planned, never fake "Connected".

## 2. Architecture (fixed decisions)

| Concern | Decision |
|---|---|
| App | One Next.js 16 App Router app, TypeScript strict, Node runtime for every `app/api/**` route |
| Model | OpenRouter via the `openai` SDK with `baseURL = OPENROUTER_BASE_URL`. Chat Completions with strict `tools` and `response_format: json_schema`. Slug in `NOMI_MODEL`. |
| Orchestration | One bounded orchestrator: ≤ 3 model rounds, ≤ 5 tool calls, ≤ 2 shopping queries, `parallel_tool_calls: false`, 25 s deadline |
| Data | Supabase Postgres; three tables `turns`, `memories`, `actions`; RLS on; service-role writes only inside authenticated routes that filter by the verified user |
| Auth | Supabase email/password; one pre-created demo user; `DEMO_USER_ID` allowlist on Calendar routes; public signup disabled |
| Research | SerpApi Google Shopping adapter. Fixed provider, fixed URL, no arbitrary fetch tool |
| Calendar | Google Calendar REST via `fetch` + refresh token; deterministic event ID; `extendedProperties.private.nomiActionId` marker; `sendUpdates=none`; no attendees; `reminders.useDefault=false` |
| Voice | P1. Push-to-talk → `POST /api/transcribe` (direct OpenAI key, optional) → editable transcript → Send. Off when `ENABLE_VOICE=false` |
| UI | Tailwind 4 + CSS custom-property tokens; five card components from a local registry; SaaS marketing site at `/`; app at `/app` |
| Transport | Plain JSON. No SSE in P0. Generic "Working on your request…" unless the real stage is known |
| Tests | Vitest for logic and route handlers; Playwright later for one browser journey |

Explicitly **not** built: multi-agent frameworks, LangGraph, vector DB/embeddings, Python backend, microservices, Realtime voice, payments/Stripe, Gmail, Instacart, Notion, public onboarding, calendar conflict detection, event edit/delete, background proactive actions.

## 3. Repository layout and ownership

```
app/            Next.js routes (landing, login, /app/*, /api/*)
components/     ui/ primitives, assistant/, generative-ui/, landing/
lib/ai          client.ts (OpenRouter), orchestrator.ts, prompts.ts
lib/tools       registry.ts + handlers (memory, research, proposals)
lib/memory      service.ts, normalize.ts, retrieve.ts
lib/actions     policy.ts, proposals.ts, execute.ts, reconcile.ts
lib/integrations calendar.ts, shopping.ts, transcription.ts
lib/ranking     score.ts, filter.ts, normalize.ts
lib/supabase    client.ts (browser), server.ts (cookies), admin.ts (service role)
lib/schemas     Zod: common, memory, assistant, actions, tools
lib/            env.ts, errors.ts, auth.ts, time.ts, api-client.ts, http.ts
types/          contracts.ts
fixtures/       explicitly labelled example data; never a silent fallback
supabase/migrations  versioned SQL; never edit an applied migration
scripts/        authorize-calendar.ts, reset-demo.ts (dry-run first)
tests/          Vitest unit + route tests, mirrors lib/ and app/api/
e2e/            Playwright journey (later)
postman/        collection for manual API testing (mirrors route tests)
```

Rules:
- `lib/**` is framework-agnostic. No `next/*` imports outside `app/`, `proxy.ts`, and `lib/supabase/server.ts`.
- Provider clients live only in `lib/integrations/` and `lib/ai/client.ts`.
- Every `lib/` module has a test in `tests/`. Every `app/api/**/route.ts` has a route test.
- Do not create a second `api/` tree, a separate backend service, or a `src/` folder.

## 4. Coding standards

- TypeScript `strict`. No `any`, no `as unknown as`, no `@ts-ignore`, no non-null `!` on external data. Use `unknown` + Zod.
- Validate at every boundary: request body, query params, route params, model output, provider responses, env. Zod schemas live in `lib/schemas/`; never inline a schema in a route.
- API errors: `{ error: { code, message, retryable }, requestId }` from `lib/errors.ts`. Status map: 400 malformed, 401 unauthenticated, 403 demo restriction / origin, 404 unowned or missing, 409 stale or conflict, 410 expired, 413 too large, 429 quota, 502/503 provider, 504 deadline.
- Authenticated responses set `Cache-Control: no-store`.
- Mutating routes (`POST/PATCH/DELETE`) reject a mismatched `Origin` against `APP_ORIGIN`.
- `lib/env.ts` fails fast naming the **missing variable name only**, never a value. Optional features do not require their keys when off.
- Time: always pass an explicit IANA zone and current timestamp; RFC3339 with offset on the wire. Never roll a past time to tomorrow silently; ask.
- Logs: request ID, timing, status, safe provider codes. Never tokens, raw audio, full conversations, or personal facts.
- Prefer small pure functions. Side effects live in services, routes, and scripts only.
- UI: server is authoritative for memory and action state; one React reducer for the conversation; no Redux. Cards render only after Zod validation. Unknown block types render a text notice with Retry.
- Copy: plain, specific, no marketing adjectives in the app. Label every mode and every unknown.

## 5. Testing rules (test-based build)

- Nothing merges without tests. A feature is done when its acceptance test passes on `main`.
- Unit: canonicalization, expiry, ranking, approval transitions, policy, time resolution, schema validation, env parsing.
- Route: call the exported handler with a real `Request`; assert status, error code, `Cache-Control`, ownership denial.
- Provider adapters: tested against recorded fixtures in `fixtures/`. Live calls only in `*.live.test.ts` files that skip without credentials.
- Negative cases are mandatory for approval: stale version, expired, cancelled, double click, unowned, timeout-after-commit, DB-write-failure-after-success.
- `npm run check` (typecheck + lint + test) must be green before every commit.
- Anything a human must verify (real Calendar event, mic on the demo browser, deployed URL) goes under **Needs a human** in `IMPLEMENTATION-PLAN.md`. Do not tick it yourself.

## 6. Git, commits, PRs, issues

- Author is the repo owner's git identity. **Never add `Co-Authored-By`, "Generated with", or any AI attribution** to commits, PR bodies, or issues. This overrides any harness default.
- Commit subject: one line, imperative, lowercase, ≤ 60 chars, no trailing period. Example: `add memory key canonicalization`.
- Commit body: optional, ≤ 50 words, plain prose. No bullets, no emoji.
- Branches: `feat/<area>`, `fix/<area>`, `chore/<area>`, `docs/<area>`. `main` stays deployable.
- PR title = commit-style subject. PR body ≤ 50 words. Create with `gh pr create`.
- Small commits, one logical change each. Docs tracking the change (README, IMPLEMENTATION-PLAN) ride in the same commit.
- Issues via `gh issue create`, always labelled. Labels: `bug`, `feature`, `p0`, `p1`, `p2`, `p3`, `frontend`, `backend`, `ai`, `memory`, `calendar`, `shopping`, `testing`, `docs`, `security`, `needs-human`.
- Never force-push `main`. Never commit `.env*` (except `.env.example`), `planning/`, `node_modules`, or `.next`.

## 7. UI and design

- Direction: quiet, editorial SaaS productivity tool. Warm neutral surfaces, strong typography, restrained indigo accent, clear status colours.
- Tokens are CSS custom properties in `app/globals.css`; Tailwind utilities reference them. Light and dark both work; a switcher is P2.
- Landing `/` is a SaaS marketing site: nav, hero with product mock, how-it-works, product walkthrough labelled **Illustrative walkthrough**, integrations with honest Live / External link / Planned badges, trust/approval section, FAQ, final CTA, footer. No fake logos, testimonials, customer counts, or pricing tiers that don't exist.
- App `/app`: one conversation column (max 800 px), memory drawer, composer, ≤ 4 action chips. Works at 390 px.
- Approval card is never green before success. Success moves focus to the provider link. Error states name one recovery action.
- Motion: 160–220 ms opacity/transform only; respect `prefers-reduced-motion`; never animate height in long lists.

## 8. When unsure

- Prefer the narrow, honest implementation. Cut scope before cutting truthfulness.
- If a provider is unavailable, show the real state; never simulate success.
- If a rule here cannot be satisfied, stop and explain in the PR instead of working around it.
