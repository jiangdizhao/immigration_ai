import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

/**
 * Fast, Legal Check (Default) and Premium must not drift into separate
 * persistence implementations. These source-level assertions keep the shared
 * durable-turn contract in place without importing the Next.js route modules.
 */
const ROUTES = [
  "app/api/widget-chat/route.ts",
  "app/api/widget-chat-fast/route.ts",
  "app/api/widget-chat-direct/route.ts",
] as const;

function source(path: string) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

for (const route of ROUTES) {
  test(`${route} uses the shared durable turn contract`, () => {
    const contents = source(route);
    assert.match(
      contents,
      /from "@\/lib\/conversations\/widget-turn"/u,
      "the route must import the shared persistence module"
    );
    assert.match(contents, /beginWidgetTurn/u);
    assert.match(contents, /completeWidgetTurn/u);
    assert.match(contents, /failWidgetTurn/u);
    assert.doesNotMatch(
      contents,
      /saveMessages/u,
      "the route must not write messages directly any more"
    );
    assert.doesNotMatch(
      contents,
      /crypto\.randomUUID\(\)[\s\S]{0,80}role: "assistant"/u,
      "assistant identifiers must come from the durable turn service"
    );
    assert.match(contents, /clientTurnId/u);
    assert.match(contents, /persistence/u);
    assert.match(contents, /guardProjectChatIngress/u);
    assert.ok(
      contents.indexOf("await guardProjectChatIngress") <
        contents.indexOf("await beginWidgetTurn"),
      "Project origin must be checked before turn admission and provider work"
    );
  });
}

test("the widget routes share one message-parts contract", () => {
  const shared = readFileSync(
    new URL("./message-parts.ts", import.meta.url),
    "utf8"
  );
  assert.match(shared, /buildAssistantMessageParts/u);
  const historyRoute = readFileSync(
    new URL(
      "../../app/api/immigration-conversations/[chatId]/route.ts",
      import.meta.url
    ),
    "utf8"
  );
  assert.match(historyRoute, /createDatabaseConversationHistoryHandlers/u);
  assert.doesNotMatch(
    historyRoute,
    /extractTextFromParts/u,
    "the history route must not re-implement part extraction"
  );
});

test("the generic chat API cannot downgrade Project Chat IDs to standalone", () => {
  const route = source("app/(chat)/api/chat/route.ts");
  assert.match(route, /guardProjectChatIngress\(\{ id \}\)/u);
  assert.ok(
    route.indexOf("await guardProjectChatIngress") <
      route.indexOf("getChatById({ id })"),
    "persisted Project origin must be rejected before generic chat lookup or fallback creation"
  );
});

test("widget routes cannot silently swallow a persistence failure", () => {
  for (const route of ROUTES) {
    const contents = source(route);
    assert.doesNotMatch(
      contents,
      /catch \(error\) \{\s*console\.warn\("Failed to persist/u,
      "a swallowed persistence failure must be reported through the response"
    );
  }
});

test("every widget route fails closed when the durable turn is not established", () => {
  for (const route of ROUTES) {
    const contents = source(route);
    assert.match(
      contents,
      /turnStart\.status === "persistence_failed"/u,
      "a failed user-turn write must be reported instead of answering"
    );
    assert.match(
      contents,
      /"conversation_turn_not_persisted"/u,
      "the client must receive an explicit retryable persistence failure"
    );
    assert.match(
      contents,
      /turnStart\.status === "in_progress"/u,
      "a duplicate in-flight request must not generate a second answer"
    );
    assert.match(contents, /"client_turn_in_progress"/u);
  }
});

test("every widget route holds and releases the execution lease", () => {
  for (const route of ROUTES) {
    const contents = source(route);
    assert.match(
      contents,
      /startWidgetTurnHeartbeat\(/u,
      "a long model stage must renew its execution lease"
    );
    assert.match(
      contents,
      /executionOwnerId: turnStart\.executionOwnerId/u,
      "completion must be fenced by the lease owner"
    );
    assert.match(
      contents,
      /heartbeat\.stop\(\)/u,
      "every exit path must release the execution lease"
    );
    assert.match(
      contents,
      /executionAttempt: turnStart\.executionAttempt,/u,
      "the lease heartbeat must be fenced by the whole token"
    );
  }
});

test("every widget route presents the whole execution fence", () => {
  for (const route of ROUTES) {
    const contents = source(route);
    assert.match(
      contents,
      /executionOwnerId: turnStart\.executionOwnerId,/u,
      "completion must be fenced by the lease owner"
    );
    assert.match(
      contents,
      /executionAttempt: turnStart\.executionAttempt,/u,
      "completion must present the attempt number as well as the token"
    );
    assert.match(
      contents,
      /executionAttempt: failedTurn\.executionAttempt \?\? null,/u,
      "failure reporting must present the same fence"
    );
  }
});

test("assistant persistence is one atomic repository operation", () => {
  const queries = readFileSync(
    new URL("../db/queries.ts", import.meta.url),
    "utf8"
  );
  assert.match(queries, /finalizeConversationTurnAtomic/u);
  assert.match(
    queries,
    /\.for\("update"\)/u,
    "finalization must lock the turn row"
  );
  assert.match(queries, /outcome: "fence_lost"/u);
  assert.match(queries, /outcome: "message_conflict"/u);
  assert.doesNotMatch(
    queries,
    /export async function completeConversationTurn\(/u,
    "the non-atomic terminal write must not exist any more"
  );

  const ledger = readFileSync(
    new URL("./turn-ledger.ts", import.meta.url),
    "utf8"
  );
  assert.match(ledger, /finalizeTurn\(\{/u);
  assert.doesNotMatch(
    ledger,
    /insertMessage\(\{[\s\S]{0,200}role: "assistant"/u,
    "the ledger must not insert the assistant message outside the transaction"
  );

  // Both layers must share one immutable-message identity implementation.
  const identity = readFileSync(
    new URL("./message-identity.ts", import.meta.url),
    "utf8"
  );
  assert.match(identity, /export function matchesImmutableMessage/u);
  assert.match(identity, /export function deterministicMessageId/u);
});

test("the durable turn service owns the one-execution-per-turn rule", () => {
  const shared = readFileSync(
    new URL("./turn-ledger.ts", import.meta.url),
    "utf8"
  );
  for (const required of [
    "acquireExecution",
    "renewExecution",
    "TURN_EXECUTION_LEASE_MS",
    "executionOwnerId",
    "turn_execution_lease_lost",
    "deterministicMessageId",
  ]) {
    assert.match(shared, new RegExp(required, "u"), `${required} is required`);
  }
  const widget = readFileSync(
    new URL("./widget-turn.ts", import.meta.url),
    "utf8"
  );
  assert.match(
    widget,
    /runModel: start\.status === "proceed"/u,
    "only a proceed decision may run the model"
  );

  // The two terminal failure modes must never look like a saved turn.
  const notice = readFileSync(
    new URL("./persistence-notice.ts", import.meta.url),
    "utf8"
  );
  assert.match(notice, /saved: false/u);
  assert.match(notice, /persistence\.saved === true/u);
});
