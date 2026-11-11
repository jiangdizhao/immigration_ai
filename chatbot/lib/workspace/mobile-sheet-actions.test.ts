import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createMobileSheetActionCloser } from "./mobile-sheet-actions";

/**
 * Phase 14-A R1-02 — mobile Sheet action settlement.
 *
 * The rule itself is pure and tested directly. The component wiring is pinned
 * because this repository has no DOM test harness for the workspace component, and
 * the difference between "closed on success" and "closed on failure" is exactly the
 * kind of regression that is invisible until a customer is stuck behind a drawer.
 */
const workspace = readFileSync(
  new URL("../../components/immigration-ai-workspace.tsx", import.meta.url),
  "utf8"
);

function extractDeclaration(startMarker: string) {
  const start = workspace.indexOf(startMarker);
  if (start < 0) {
    throw new Error(`missing declaration: ${startMarker}`);
  }
  const end = workspace.indexOf("\n  };\n", start);
  if (end <= start) {
    throw new Error(`unterminated declaration: ${startMarker}`);
  }
  return workspace.slice(start, end);
}

test("a rejected action never closes the mobile Sheet", () => {
  let closes = 0;
  const closer = createMobileSheetActionCloser(() => {
    closes += 1;
  });
  assert.equal(closer.settle("rejected"), false);
  assert.equal(
    closes,
    0,
    "a failed action must not look like navigation success"
  );
});

test("one action closes the Sheet at most once", () => {
  let closes = 0;
  const closer = createMobileSheetActionCloser(() => {
    closes += 1;
  });
  assert.equal(closer.settle("accepted"), true);
  assert.equal(closes, 1);
  // A late or double-settled promise must not close a Sheet the customer re-opened.
  assert.equal(closer.settle("accepted"), false);
  assert.equal(closer.settle("rejected"), false);
  assert.equal(closes, 1);
});

test("a rejection does not consume the action", () => {
  let closes = 0;
  const closer = createMobileSheetActionCloser(() => {
    closes += 1;
  });
  assert.equal(closer.settle("rejected"), false);
  assert.equal(closer.settle("accepted"), true);
  assert.equal(closes, 1);
});

test("a new standalone Chat closes the Sheet only after creation succeeded", () => {
  const start = extractDeclaration(
    "const startStandaloneConversation = () => {"
  );
  assert.match(
    start,
    /createConversation\(\)/u,
    "the existing creation path must be reused"
  );
  assert.equal(
    (start.match(/createConversation\(/gu) ?? []).length,
    1,
    "one click must never create two conversations"
  );
  // Success closes; failure keeps the Sheet open and reports the real error.
  assert.match(start, /\.then\(\(\) => \{\s*closer\.settle\("accepted"\);/u);
  assert.match(
    start,
    /\.catch\(\(conversationError\) => \{\s*closer\.settle\("rejected"\);/u
  );
  assert.match(start, /toast\.error\(message\)/u);
  assert.doesNotMatch(
    start,
    /\.then\(\(\) => \{\s*closer\.settle\("rejected"\)/u,
    "a successful creation must never be reported as rejected"
  );
});

test("a rail quick question submits once and closes on acceptance only", () => {
  const rail = extractDeclaration(
    "const submitMessageFromRail = (question: string) => {"
  );
  assert.equal(
    (rail.match(/submitMessage\(/gu) ?? []).length,
    1,
    "one tap must submit exactly one question"
  );
  assert.match(rail, /closer\.settle\("accepted"\)/u);
  assert.doesNotMatch(
    rail,
    /setMobileSheetOpen\(false\)\).*setMobileSheetOpen\(false\)\)/u
  );
  // The rail (Sheet) quick questions use the sheet-aware submission…
  assert.match(
    workspace,
    /onClick=\{\(\) => submitMessageFromRail\(question\)\}/u
  );
  // …while the in-chat empty-state questions keep the plain submission path.
  assert.match(workspace, /onClick=\{\(\) => submitMessage\(question\)\}/u);
  // And the composer is untouched.
  assert.match(workspace, /onClick=\{\(\) => submitMessage\(input\)\}/u);
});

test("submission acceptance is reported before dispatch and never on a guard rejection", () => {
  const body = extractDeclaration("const submitMessage = async (");
  assert.match(body, /onAccepted\?: \(\) => void/u);
  assert.equal(
    (body.match(/onAccepted\?\.\(\)/gu) ?? []).length,
    2,
    "exactly the dispatched turn and the rendered blocked response report acceptance"
  );
  const blocked = body.indexOf(
    "await appendBlockedResponse(submissionDecision)"
  );
  const firstAccept = body.indexOf("onAccepted?.()");
  const dispatch = body.indexOf("await sendToWidgetRoute(");
  assert.ok(blocked >= 0 && firstAccept > blocked);
  assert.ok(
    dispatch > firstAccept,
    "the Sheet is revealed while the turn is in flight, not after it resolves"
  );
  // Guard rejections (empty text, busy, read-only) return before any signal.
  const guards = body.slice(
    body.indexOf("const trimmed"),
    body.indexOf("const nextUserMessage")
  );
  assert.ok(guards.length > 0, "the guard region must be found");
  assert.doesNotMatch(guards, /onAccepted\?\.\(\)/u);
  // A failed request never reports acceptance: the only signals are the two above,
  // and both happen before the request can fail.
  assert.match(body, /catch \(requestError\) \{/u);
});
