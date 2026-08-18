import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeAssistantMode,
  widgetRouteForAssistantMode,
} from "./assistant-mode";

test("normalizes canonical and legacy assistant modes at compatibility boundaries", () => {
  assert.equal(normalizeAssistantMode("default"), "default");
  assert.equal(normalizeAssistantMode("premium"), "premium");
  assert.equal(normalizeAssistantMode("default_legal_pipeline"), "default");
  assert.equal(normalizeAssistantMode("premium_direct_gpt55_high"), "premium");
  assert.equal(normalizeAssistantMode("unknown"), "default");
  assert.equal(normalizeAssistantMode(null), "default");
});

test("selects a route from canonical assistant mode only", () => {
  assert.equal(widgetRouteForAssistantMode("default"), "/api/widget-chat");
  assert.equal(
    widgetRouteForAssistantMode("premium"),
    "/api/widget-chat-direct"
  );
});
