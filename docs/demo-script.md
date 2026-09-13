# Demo script

Six minutes, one account, no hidden steps. Every number on screen comes from a
real response.

## Before you start

1. Sign in as a real account (create one at `/signup` if needed).
2. Open **Linked apps**. Confirm Google Calendar shows **Linked** with the
   account email, and that **Where you shop** has your city.
3. Reset the account's data so the run is clean:

```bash
RESET_USER_ID=<your user id> npm run demo:reset
```

Check the counts it prints, then run it again with `RESET_CONFIRM=true`.

4. Run one throwaway grocery search before the audience arrives. The product
   provider is slow on a cold query and fast once warm.

## The run

**1. Remember (45s).** In `/app`, say:

> I'm out of tomatoes and potatoes. I'm cooking chicken curry tonight. I'm looking for running shoes.

Four memories appear. Open **Memory** and show that each carries the exact words
you said. Point out that the curry is a plan, the shoes are an interest, and
neither invented a shortage.

**2. Understand (45s).** Press **New conversation**, then ask:

> What should I buy today?

It recalls the two shortages from a fresh conversation, keeps the shoes separate,
and lists curry ingredients as suggestions to check rather than as things you are
out of.

**3. Research (60s).** Press **Groceries**. Sourced cards appear for two items,
each with the merchant, the unit, and the retrieval time. Find a listing without
a price and read it aloud: it says "Price not listed". Point out that stock is
unknown on every card, because search listings do not carry it.

**4. Recommend (30s).** The decision card names the recommendation and the
reasons behind it, and states its own limitations.

**5. Ask (45s).** Press **Schedule grocery run**. The approval card shows the
exact event: title, date, time, calendar, no attendees, no reminders. Say plainly
that nothing has been written yet. Press **Change**, move the time, and show the
version number increase.

**6. Act (45s).** Press **Allow**. One event is created and the card becomes a
confirmation with a real link. Open it in Google Calendar.

**7. The honest part (60s).** Back in the app, press **Allow** again on the old
card, or reload and try: it refuses as stale. Show the calendar: still one event.
Then delete a memory in the drawer and ask the question again to show the answer
changes.

## If something goes wrong

- **Search is slow or empty.** Say so and move on; the card shows which item did
  not complete. Set `RESEARCH_MODE=cached` beforehand if the venue's network is
  unreliable, and point at the "cached" badge.
- **Calendar link expired.** The card says so and creates nothing. Re-link from
  **Linked apps**; Google's Testing mode expires grants after seven days.
- **The model is unavailable.** The turn fails with a plain sentence and a Retry
  that reuses the same request id, so a retry cannot duplicate work.
