# Known limitations

Written for judges and for anyone trying Nomi. Everything here is a deliberate
boundary, not a bug to discover during a demo.

## What Nomi will not do

- **No external write without approval.** The model can propose a calendar
  event; only the approval endpoint, after an atomic database claim, can create
  one. There is no tool that writes to Google Calendar.
- **No email, no payments, no checkout.** Nomi links to listings; buying stays
  with you.
- **No invented facts.** A listing without a price shows "Price not listed",
  never `$0`. Stock is reported as unknown for every search listing, because
  search results do not carry live store inventory.
- **No memory from inference.** Only what you explicitly state is saved. A
  question ("are we out of tomatoes?") is not an assertion, and recipe
  ingredients are suggestions to check, never assumed shortages.

## Where the seams are

| Area | Limitation |
|---|---|
| Accounts | Email and password only. No social sign-in, no password reset flow beyond Supabase's own. |
| Linking | Google Calendar only. While the Google consent screen is in Testing, refresh tokens expire after seven days and the user must link again. |
| Research | Two items per turn, three listings per item. US results, USD, English. Listings are search results, not a retailer's live stock or your local store's shelf. |
| Location | You set the city yourself. With a Maps key it is canonicalized; without one your text is used as typed and results may not be local. |
| Prices | Compared per kilogram only when a listing states a weight. "Each" and "bunch" listings are shown but not price-ranked, and no savings claim is made without two comparable listings. |
| Calendar | One 30-minute event, no attendees, no reminders, no notifications. No conflict detection, no edit or delete after creation. |
| Voice | Push to talk, 30 seconds, 3 MB. Audio is discarded after transcription; the transcript is editable and is not sent until you press Send. |
| Conversation | One conversation at a time per browser, kept in local storage. No search across past conversations. |
| Rate limits | Ten turns per minute per account, one active turn at a time. |

## Failure behaviour

- A slow or failing product search does not fail the turn: the affected item is
  reported as "did not complete" and no listings are shown for it.
- An ambiguous calendar write (timeout, 5xx) is recorded as `unknown` and
  resolved by reading the event back by its deterministic id. Nomi never
  inserts a second time to "make sure".
- If your Google grant expires, the link is marked as needing attention and the
  approval fails honestly. Nothing is created.

## Not built

Multi-agent frameworks, a vector database, native apps, realtime voice,
background proactive actions, Gmail, Instacart, Notion, Stripe.
