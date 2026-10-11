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
