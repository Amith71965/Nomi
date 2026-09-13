# Build verification — September 13, 2026

The production build completed successfully. The local landing page was opened and checked in a browser. Supabase and OpenRouter passed the live setup checks. Both OpenRouter smoke tests and the Deepgram transcription smoke test passed. Voice was enabled in the local `.env` after the provider test passed; microphone capture still needs a browser test.

The full check run at 18:04 returned 287 passing tests and one failure: `tests/actions.test.ts`, “two concurrent approvals produce one claim and one event.” The test expected one fulfilled approval but observed two. This needs investigation before claiming duplicate-approval behavior is verified.

Another active process replaced Calendar source files, tests, and routes and committed changes during this run. The tree remains under active modification, so these results describe the tested snapshot, not later edits. Do not deploy based on this build alone.

## Remaining Calendar review

The observed Calendar implementation also needs these checks before live use:

- Verify receipt ID, private action marker, title, start/end, time zone, and other approved fields before recording success. The observed adapter accepted any response matching a loose event schema.
- Have GET action status reconcile unknown and stale executing actions. The observed GET only returned the stored row.
- Recover when Google succeeds but saving the receipt fails; a stale executing row must not remain permanently stuck.
- Avoid treating one immediate 404 after an uncertain insert as proof that no event can still commit.
- Bind a proposal to the originally linked Google account so reconnecting a different account cannot redirect an old approval through the `primary` calendar alias.

Google OAuth credentials and the encryption key are missing, and live grocery search lacks a SerpApi key. See integration-setup.md for setup. No real Calendar event was created or claimed verified in this run. No hosted deployment was performed.
