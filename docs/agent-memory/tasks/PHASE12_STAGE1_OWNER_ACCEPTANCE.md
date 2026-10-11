# Phase 12 Stage 1 — Owner acceptance procedure (cross-device)

**Date:** 2026-10-11
**Stage:** Phase 12 Stage 1 — Account-centred Durable History and Documents
**Status of this procedure:** PREPARED — NOT YET EXECUTED BY THE OWNER (PENDING OWNER VERIFICATION)

Automated tests cannot prove cross-device behaviour. The steps below are the
owner-executable acceptance procedure for Stage 1. Each line must be executed on
the stated device/browser, and the result recorded honestly (pass / fail /
blocked). Do not mark a line passed if it was skipped.

## 0. Preconditions

- Backend and frontend run from the Stage 1 branch
  (`codex/phase12-stage1-user-data-reliability`).
- The isolated test database used by automated tests is disposable; the
  application database migration is applied only through the controlled
  procedure after separate owner authorization.
- Use one real test account you own. Do not use another person's account.

## 1. Ubuntu (baseline device)

1. Sign in with the test account.
2. Create three new conversations; send a message in each. Expected: the user
   message appears immediately and the answer appears after generation.
3. Attach the same PDF and DOCX in two different conversations. Expected: both
   uploads complete, extraction status is shown per document.
4. Confirm that a document extraction that produced no usable content is shown
   as such (not as "available to AI").
5. Note down the conversation titles and one message's exact text.

## 2. Windows (second device, same account)

1. Sign in with the same account in a different browser/device.
2. Expected: all conversations created on Ubuntu are listed (including any
   conversation older than the 80 most recent), and opening each one shows the
   full message text and metadata (citations/sources where present).
3. Open the account file history list. Expected: every retained file from all
   conversations is listed with its conversation association and status.
4. Download each original file. Expected: byte-identical to the original
   (verify with a checksum where practical).
5. Continue one historical conversation by sending a new message. Expected: the
   message is accepted, the answer appears, and the conversation keeps its
   original identity.

## 3. Android (or a separately authenticated browser)

1. Sign in with the same account.
2. Repeat: open the oldest conversation and the newest conversation; both must
   load with their messages.
3. Open the account file history list and download one original file.
4. Expected: the new message sent from Windows is visible here.

## 4. Cross-device consistency and ownership

1. Create more than 80 conversations (a script or repeated UI action is fine)
   and confirm the oldest conversation is still reachable through the history
   list's "load older" control.
2. Sign out and sign in again on one device. Expected: the history is unchanged
   (it is server-side, not browser state).
3. Sign in with a **different** account. Expected: none of the first account's
   conversations, files or downloads are visible or downloadable, including by
   guessing identifiers.
4. Rapidly switch between two long conversations. Expected: the conversation
   content shown always matches the selected conversation (no late response
   from the previous conversation replaces the current one).
5. Advance the browser clock or restore a saved page while a conversation is
   loading. Expected: an error/retry state appears instead of an empty history.

## 5. Failure-path observations

1. Start a message and interrupt the network before the answer arrives.
   Expected: an explicit error or "not saved" notice; no false success.
2. If an answer is shown with the "not saved" notice, use the retry control.
   Expected: the answer is saved without generating a second answer.
3. With the database temporarily stopped (only if you can do so safely on a
   disposable environment), confirm the answer is not reported as saved.
4. **R1 — duplicate submission.** Send the same message twice in quick
   succession (double-click, or send on a phone while the desktop request is
   still running). Expected: exactly one answer; the duplicate shows the
   "still being answered" notice, and checking again shows the single saved
   answer. There must never be two answers or two copies of the question in the
   saved history.
5. **R1 — persistence failure is explicit.** If a message cannot be saved
   (database unavailable), expected: the message is not answered with a false
   "saved" state; the UI asks you to send it again, and the retry succeeds once
   the database is back. A half-saved turn must never appear as saved.
6. **R1 — legacy conversations are readable.** Any conversation created before
   Phase 12 (a chat that has messages but no conversation record) must now
   appear in the history list and open read-only with its original messages,
   timestamps and citations. Nothing about it may be altered by opening it.

## 6. Evidence to record

For each step: device, browser, timestamp, expected vs observed, screenshot or
note. Record the exact failing step identifier if any step fails; do not
summarize a failure as a pass.

## 7. Owner-authorized items that are NOT part of this procedure

- Applying migration `0024`/`0025` to any non-disposable database.
- Fixing the inherited production build blocker (`lib/db/queries.ts`
  retained-VIP typing); the smallest typing-only correction is documented in the
  handoff and needs an explicit decision because it touches paused payment code.
- Any backfill of the legacy chats, or any change to existing customer data.

**Gate rule:** Stage 1 is not accepted until this procedure has been executed
and recorded, in addition to independent code review of the Stage 1 diff.
