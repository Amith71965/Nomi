# Demo video: recording script and publishing checklist

Target length **4 to 4½ minutes**. Everything below is timed, and every claim in
the narration is something the app actually does. Read it once before recording
so the clicks feel natural.

---

## Part 1. Before you hit record

### Protect your secrets on camera

A screen recording is permanent. Before recording, close or hide:

- Your terminal, if `.env` values, tokens or the output of `npm run token` are on screen
- The Vercel project's Environment Variables page
- The Supabase dashboard's API keys page
- Any password manager, email client, or browser tab showing an inbox

**Sign in to the app before you start recording.** Do not type a password on
camera. Start the recording on a page where you are already signed in.

### Warm up the slow parts

The product search provider is slow on a cold query and fast once warm, so the
cache is hot for the take:

1. Open the live app and sign in.
2. Go to **Linked apps** and confirm **Where you shop** is set to your city.
3. Open **Assistant** and run one throwaway grocery search. Discard the result.

### Give yourself a clean account

From the project folder, preview what would be deleted, then do it:

```bash
RESET_USER_ID=<your user id> npm run demo:reset
RESET_USER_ID=<your user id> RESET_CONFIRM=true npm run demo:reset
```

This clears that one account's memories, turns and actions. It never touches
other accounts, and it keeps your linked apps unless you add `RESET_UNLINK=true`.

### Browser and capture settings

- Browser at **1920 × 1080**, zoom at 100%, bookmarks bar hidden
- One window, one tab, no notifications (turn on Do Not Disturb)
- Record at **1080p, 30 fps**
- macOS: QuickTime → File → New Screen Recording, or OBS for a webcam inset
- Record system audio off, microphone on, and do a ten-second test for levels

### Which path to record

**Path A** is the current state of the deployed app. Google Calendar is not
configured there, so the approval step ends with an honest refusal rather than a
real event. That is still a strong moment, and the script below makes it one.

**Path B** is for after you add `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and
`INTEGRATIONS_ENCRYPTION_KEY` and link your calendar. It ends with a real event.
Path B is the stronger demo. Record it if you have the credentials in time.

---

## Part 2. The script

Narration is in quotes. Actions are in brackets.

### 0:00 – 0:20 · Open on the landing page

> "This is Nomi. It's a personal assistant for everyday errands. You tell it
> things in plain language, it remembers them as facts you can edit, and when
> you ask what to do next it researches real options and can put one event on
> your calendar. But only after you approve the exact details."

*[Scroll slowly to the integrations section and stop.]*

> "Every badge here is honest. Nothing says connected until you've actually
> connected it."

### 0:20 – 0:50 · Linked apps

*[Click through to the app, open **Linked apps**.]*

> "When you sign up, this is where you land. Each card says what linking lets
> Nomi do, and what Nomi will never do with it. The assistant model, grocery
> research and voice are included, so there's nothing to set up. Google Calendar
> is the one you link yourself, with your own account."

*[Point at **Where you shop**.]*

> "Where you shop is your setting, not the app's. It's stored as a memory you
> can delete, and it's what the product search uses."

### 0:50 – 1:30 · Remember

*[Open **Assistant**. Type the sentence. Send.]*

```
I'm out of tomatoes and potatoes. I'm cooking chicken curry tonight. I'm looking for running shoes.
```

> "One sentence, four different kinds of fact."

*[Wait for the reply. Open the **Memory** panel.]*

> "Two shortages, a dinner plan for tonight, and a shopping interest. Each one
> carries the exact words I used, so I can check what it thinks I said. And I
> can delete any of them."

### 1:30 – 2:10 · Understand

*[Close the panel. Click **New conversation**. Type and send.]*

```
What should I buy today?
```

> "Brand new conversation. No history at all."

*[Read the answer on screen.]*

> "It recalls the two shortages, connects them to tonight's curry, and keeps the
> running shoes separate, because shoes aren't groceries and I never said I
> needed them today. The other curry ingredients come back as suggestions to
> check, not as things it assumes I'm out of. It never invents a shortage."

### 2:10 – 3:00 · Research

*[Click the **Groceries** chip.]*

> "Now it searches real listings for the things I actually confirmed."

*[Let the cards render. Point at one with a price and a unit.]*

> "Each card has the merchant, the unit size, and when it was retrieved."

*[Scroll to a card with a missing price, if there is one.]*

> "And this is the part I care about most. When a listing doesn't state a price,
> it says 'Price not listed'. It never shows zero dollars. Stock is unknown on
> every card, because search listings genuinely don't carry live store
> inventory, and pretending otherwise would be a lie."

*[Point at the per-unit comparison.]*

> "Prices are only compared per kilogram when the listing actually states a
> weight, so a one pound pack and a five pound bag can be compared fairly, and
> an 'each' listing isn't ranked on a price it doesn't have."

### 3:00 – 3:40 · Ask

*[Click **Schedule grocery run**.]*

> "This is the approval step. Here's the exact event: the title, the date and
> time, which calendar, no attendees, no reminders. Nothing has been written
> anywhere yet."

*[Click **Change**, move the time by an hour, save.]*

> "I can change it, and the proposal version goes up, so a card I've already
> moved past can't approve something I'm no longer looking at."

**Path A, no calendar linked** — *[click **Allow**]*

> "I haven't linked a calendar on this deployment, so watch what it does. It
> refuses, it tells me exactly why, and it writes nothing. It doesn't pretend
> the event exists."

**Path B, calendar linked** — *[click **Allow**]*

> "And that's one real event on my own calendar."

*[Open the event link in a new tab, show it in Google Calendar, come back.]*

### 3:40 – 4:10 · The honest part

**Path B only** — *[click **Allow** again on the same card]*

> "Press it twice and it refuses as stale. The event id is derived from the
> approval itself, so a double click or a retry can't ever create a second one."

**Both paths** — *[open **Memory**, delete the tomatoes memory, close, ask again]*

```
What should I buy today?
```

> "Delete a memory and the next answer actually changes. Nothing it told me is
> stuck in a cache somewhere. What you see in that panel is what it knows."

### 4:10 – 4:30 · Close

*[Back to the landing page or the Linked apps page.]*

> "Nomi is a Next.js app on Supabase, with one bounded orchestrator calling
> allowlisted tools through OpenRouter. Grocery listings come from SerpApi,
> voice from Deepgram, and calendar writes go to your own Google account through
> per-user OAuth, with the refresh token encrypted before it's stored. It's live
> at the link below, and the code is on GitHub. Thanks for watching."

---

## Part 3. After recording

1. Trim the head and tail so the first frame is the landing page.
2. Watch it once at full screen and check no secret, token, email address or
   dashboard key is readable in any frame. If one is, re-record that section.
3. Export at 1080p.
4. Grab a thumbnail frame from the grocery cards section, which is the most
   visually interesting shot.

---

## Part 4. Publishing on YouTube

1. Go to youtube.com, click the camera icon, then **Upload video**.
2. Select the exported file.

### Title

Pick one:

- `Nomi: an assistant that remembers, researches, and asks before it acts`
- `Nomi demo: memory, sourced grocery research, and approval before any action`

### Description

Paste this and fill in the two blanks:

```
Nomi is a personal assistant for everyday errands. You tell it things in plain
language, it keeps them as structured memory you can edit, and it connects those
facts to a decision: what to buy, from where, and when to go. It researches real
listings with the source attached to every field, and it creates a calendar
event only after you approve the exact details.

Three rules it never breaks:
• Nothing is invented. A listing without a price says "Price not listed", never $0.
• The model can propose, but only you can execute. There is no tool that writes
  to your calendar; approval runs an atomic claim first, so one approval can only
  ever create one event.
• Memory comes from what you actually said, quoted, and you can delete any of it.

Try it: https://nomi-tau-three.vercel.app
Code: https://github.com/Amith71965/Nomi

Built with Next.js 16, React 19, TypeScript, Tailwind 4, Supabase (Postgres,
Auth, row-level security), OpenRouter for model access, SerpApi for grocery
listings, Deepgram for voice, and the Google Calendar API with per-user OAuth.
296 tests.

Chapters:
0:00 What Nomi is
0:20 Linked apps and honest status
0:50 Remember: one sentence, four facts
1:30 Understand: recall in a fresh conversation
2:10 Research: sourced cards with honest unknowns
3:00 Ask: approval before anything is written
3:40 Delete a memory, watch the answer change
4:10 How it is built

Made for <hackathon name>.
```

Adjust the chapter timestamps to your actual cut. The first one must stay `0:00`
or YouTube will not show chapters.

### Settings

- **Visibility:** Unlisted while you check it, then Public before you submit
- **Audience:** "No, it's not made for kids"
- **Category:** Science & Technology
- **Tags:** `AI assistant`, `Next.js`, `Supabase`, `hackathon`, `LLM tools`,
  `Google Calendar API`, `TypeScript`

---

## Part 5. Last step

Copy the YouTube link into the README's demo video row, which is waiting for it:

```
| **Demo video** | _Not recorded yet. Paste the link here:_ `<demo video URL>` |
```

Replace that whole line with your link, commit, and push.
