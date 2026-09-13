# Nomi integration setup

Nomi uses four integrations: Google Calendar, SerpApi grocery search, OpenRouter AI chat, and Deepgram voice transcription. Users sign up in the app and connect their own Calendar under Linked apps. Provider keys belong in the server's `.env` locally and its environment settings when hosted. Never put secret keys into browser code or chat messages.

## Verified on September 13, 2026

- Supabase authentication, tables, server permissions, and anonymous access restrictions passed the live setup checks.
- OpenRouter responded successfully using the configured model.
- Calendar OAuth client credentials and the integration encryption key were absent.
- The SerpApi search key was absent. Live grocery research stays unavailable until configured; cached or fixture research must retain its visible label.

## Google Calendar

1. In Google Cloud, enable Google Calendar API and configure the OAuth consent screen.
2. Create a Web application OAuth client. For local development, register `http://localhost:3000/api/integrations/google/callback` as an authorized redirect URI. For hosting, use the exact `APP_ORIGIN` followed by `/api/integrations/google/callback`.
3. Add your Google account as a test user while the OAuth app is in Testing.
4. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `INTEGRATIONS_ENCRYPTION_KEY` together. Generate the encryption key with `openssl rand -base64 32`. Keep this key stable; changing it makes existing encrypted tokens unreadable.
5. Restart Nomi. Open Linked apps, select Connect Google Calendar, and complete Google's consent screen.
6. Ask Nomi to schedule a future event. Review the title, dates, time zone, calendar, location, and description before pressing Allow.

No Calendar event is verified until a real linked-account approval succeeds. Reconnect if a test-mode refresh token expires.

## Grocery search

Set `PRODUCT_SEARCH_API_KEY` to the SerpApi key, `PRODUCT_SEARCH_LOCATION` to the desired search city, and `RESEARCH_MODE=live`. Restart the app. Ask for grocery options after stating the items you need. Listings must show their evidence and retrieval time; missing prices and stock stay unknown.

## AI chat

Set `OPENROUTER_API_KEY` and select a model supporting tool calls and strict structured output via `NOMI_MODEL`. The existing default is `openai/gpt-4.1-mini`. Run `npm run verify` to check connectivity.

## Voice

Set `TRANSCRIPTION_PROVIDER=deepgram`, `DEEPGRAM_API_KEY`, and `ENABLE_VOICE=true`. Restart the app. Record with the microphone, review the editable transcript, then press Send. Browser microphone permission and HTTPS (or localhost) are required.

## Sign-up and hosting

In Supabase Authentication settings, set Site URL to `APP_ORIGIN` and allow `APP_ORIGIN/auth/callback` as a redirect. Enable email sign-up and confirmation. Use the same public origin for the app, Supabase redirect, and Google callback configuration.

Before publishing, run `npm run check`, `npm run build`, and `npm run verify`, then complete a browser journey using a real account. Provider credentials and a successful local build do not by themselves verify a hosted deployment.
