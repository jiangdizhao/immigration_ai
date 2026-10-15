import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  buildWidgetTurnRequestBody,
  requestPolicySlugForConversation,
} from "./widget-turn-request";
import {
  fastWidgetRequestSchema,
  legalCheckWidgetRequestSchema,
  premiumWidgetRequestSchema,
} from "./widget-turn-schemas";

/**
 * Phase 12 Stage 2 hotfix — no-policy requests must never fail the widget
 * contract.
 *
 * Owner-host failure: an ordinary conversation (`0a8c3d1d-…`, two uploaded files,
 * no policy binding) failed Fast before model execution with
 * `ZodError path: ["policySlug"] expected: "string" received: "null"`, because the
 * workspace sent an explicit JSON `null` while the route schemas accepted only
 * `string | undefined`.
 *
 * These tests parse with the *real* shared schemas that the three widget routes
 * import, and build the body with the *real* frontend construction helper — no
 * disconnected mock of the contract.
 */

const CONVERSATION_ID = "0a8c3d1d-887d-4246-8f76-28ea613ecc55";
const POLICY_SLUG = "evisitor-application-arrangements-lin-26-061";

const ROUTES = [
  ["Fast", fastWidgetRequestSchema, "fast"],
  ["Legal Check", legalCheckWidgetRequestSchema, "default"],
  ["Premium", premiumWidgetRequestSchema, "premium"],
] as const;

type RouteMode = (typeof ROUTES)[number][2];

/** A raw wire body with the policy hint omitted or explicitly `null`. */
function wireBody(policySlug?: unknown) {
  return {
    id: CONVERSATION_ID,
    frontendChatId: CONVERSATION_ID,
    clientTurnId: "turn-00000001",
    matterId: null,
    intakeFacts: {},
    currentIntakeFacts: {},
    answerPreference: "answer_first",
    selectedChatModel: "gpt-5.6-luna",
    messages: [
      {
        id: "message-1",
        role: "user",
        parts: [{ type: "text", text: "What documents do I need?" }],
      },
    ],
    ...(policySlug === undefined ? {} : { policySlug }),
  };
}

/** The body is JSON-serialized before it is sent, so parse like the route does. */
function asRequestJson(body: unknown) {
  return JSON.parse(JSON.stringify(body));
}

/** The real frontend construction for one route's mode. */
function constructionBody(mode: RouteMode, policySlug: string | null) {
  return buildWidgetTurnRequestBody({
    conversationId: CONVERSATION_ID,
    clientTurnId: "turn-00000001",
    matterId: null,
    intakeFacts: {},
    currentIntakeFacts: {},
    answerPreference: "answer_first",
    assistantMode: mode,
    policySlug,
    messages: [
      { id: "message-1", role: "user", text: "What documents do I need?" },
    ],
  });
}

test("an ordinary conversation validates on all three widget routes", () => {
  for (const [name, schema] of ROUTES) {
    const omitted = schema.parse(asRequestJson(wireBody()));
    assert.equal(omitted.policySlug, null, `${name}: omitted slug → no hint`);

    const explicitNull = schema.parse(asRequestJson(wireBody(null)));
    assert.equal(explicitNull.policySlug, null, `${name}: null slug → no hint`);
  }
});

test("the real frontend construction omits the field when there is no binding", () => {
  for (const [name, schema, mode] of ROUTES) {
    const body = constructionBody(
      mode,
      requestPolicySlugForConversation({
        conversationId: CONVERSATION_ID,
        bindingChatId: null,
        bindingSlug: null,
      })
    );
    assert.equal("policySlug" in body, false, name);

    const json = JSON.stringify(body);
    assert.doesNotMatch(json, /"policySlug"/u, name);

    // The exact serialized request still satisfies this route.
    const parsed = schema.parse(JSON.parse(json));
    assert.equal(parsed.policySlug, null, name);
    assert.equal(parsed.id, CONVERSATION_ID, name);
  }
});

test("a policy-bound conversation still forwards its real slug", () => {
  const policySlug = requestPolicySlugForConversation({
    conversationId: CONVERSATION_ID,
    bindingChatId: CONVERSATION_ID,
    bindingSlug: POLICY_SLUG,
  });
  assert.equal(policySlug, POLICY_SLUG);

  for (const [name, schema, mode] of ROUTES) {
    const body = constructionBody(mode, policySlug);
    assert.equal(body.policySlug, POLICY_SLUG, name);
    const parsed = schema.parse(asRequestJson(body));
    assert.equal(parsed.policySlug, POLICY_SLUG, name);
  }
});

test("a binding for a different conversation is never adopted", () => {
  assert.equal(
    requestPolicySlugForConversation({
      conversationId: CONVERSATION_ID,
      bindingChatId: "99999999-9999-4999-8999-999999999999",
      bindingSlug: POLICY_SLUG,
    }),
    null
  );
  assert.equal(
    requestPolicySlugForConversation({
      conversationId: CONVERSATION_ID,
      bindingChatId: CONVERSATION_ID,
      bindingSlug: null,
    }),
    null
  );
});

test("malformed non-null slugs stay rejected on every route", () => {
  const invalid: unknown[] = [
    42,
    true,
    {},
    [],
    "",
    " ",
    "UPPER-CASE",
    "-leading-hyphen",
    "with space",
    "unicode-政策",
    "a".repeat(121),
  ];
  for (const [name, schema] of ROUTES) {
    for (const value of invalid) {
      assert.throws(
        () => schema.parse(asRequestJson(wireBody(value))),
        `${name} must reject ${JSON.stringify(value)}`
      );
    }
  }
});

test("the shared contract stays strict for the rest of the body", () => {
  // The hotfix relaxed only the policy-slug field; malformed bodies still fail.
  assert.throws(() =>
    fastWidgetRequestSchema.parse(
      asRequestJson({ ...wireBody(), messages: [] })
    )
  );
  assert.throws(() =>
    fastWidgetRequestSchema.parse(
      asRequestJson({ ...wireBody(), id: "not-a-uuid" })
    )
  );
  assert.throws(() =>
    fastWidgetRequestSchema.parse(
      asRequestJson({ ...wireBody(), clientTurnId: "short" })
    )
  );
  // Mode enums stay per-route.
  assert.throws(() =>
    fastWidgetRequestSchema.parse(
      asRequestJson({ ...wireBody(), assistantMode: "premium" })
    )
  );
  assert.throws(() =>
    fastWidgetRequestSchema.parse(
      asRequestJson({ ...wireBody(), assistantMode: "default" })
    )
  );
  assert.throws(() =>
    premiumWidgetRequestSchema.parse(
      asRequestJson({ ...wireBody(), assistantMode: "fast" })
    )
  );
  assert.throws(() =>
    premiumWidgetRequestSchema.parse(
      asRequestJson({ ...wireBody(), assistantMode: "default" })
    )
  );
  assert.throws(() =>
    legalCheckWidgetRequestSchema.parse(
      asRequestJson({ ...wireBody(), assistantMode: "premium" })
    )
  );
  // Legal Check still requires its model selection.
  assert.throws(() =>
    legalCheckWidgetRequestSchema.parse(
      asRequestJson({
        id: CONVERSATION_ID,
        messages: [
          {
            id: "message-1",
            role: "user",
            parts: [{ type: "text", text: "Hello" }],
          },
        ],
      })
    )
  );
});

test("the widget routes use the shared schema module under test", () => {
  for (const route of [
    "app/api/widget-chat-fast/route.ts",
    "app/api/widget-chat/route.ts",
    "app/api/widget-chat-direct/route.ts",
  ]) {
    const source = readFileSync(
      new URL(`../../${route}`, import.meta.url),
      "utf8"
    );
    assert.match(
      source,
      /from "@\/lib\/conversations\/widget-turn-schemas"/u,
      `${route} must import the shared request contract`
    );
    assert.doesNotMatch(
      source,
      /policySlug: z\s*\n?\s*\.string\(\)/u,
      `${route} must not re-declare its own policy-slug rule`
    );
  }
});

test("Legal Check authorizes database entitlement before turn persistence and serving", () => {
  const source = readFileSync(
    new URL("../../app/api/widget-chat/route.ts", import.meta.url),
    "utf8"
  );
  const entitlementCheck = source.indexOf("if (!modeAccess.slowAllowed)");
  const turnPersistence = source.indexOf(
    "await beginWidgetTurn(",
    entitlementCheck
  );
  const servingCall = source.indexOf(
    "await fetchLegalServiceJson(",
    entitlementCheck
  );
  assert.ok(source.includes("getUserEntitlementById(session.user.id)"));
  assert.ok(entitlementCheck >= 0);
  assert.ok(turnPersistence > entitlementCheck);
  assert.ok(servingCall > entitlementCheck);
});

test("Premium requires database entitlement before turn persistence and serving", () => {
  const source = readFileSync(
    new URL("../../app/api/widget-chat-direct/route.ts", import.meta.url),
    "utf8"
  );
  const accessCheck = source.indexOf(
    "const premiumAccess = await requirePremiumAccess()"
  );
  const turnPersistence = source.indexOf("await beginWidgetTurn(", accessCheck);
  const servingCall = source.indexOf(
    "await fetchLegalServiceDirect(",
    accessCheck
  );
  assert.match(source, /getUserEntitlementById\(session\.user\.id\)/u);
  assert.match(source, /isPremiumAllowed\(entitlement\)/u);
  assert.ok(accessCheck >= 0);
  assert.ok(turnPersistence > accessCheck);
  assert.ok(servingCall > accessCheck);
});

test("the workspace sends the shared body instead of a local literal", () => {
  const source = readFileSync(
    new URL("../../components/immigration-ai-workspace.tsx", import.meta.url),
    "utf8"
  );
  assert.match(source, /buildWidgetTurnRequestBody\(/u);
  assert.match(source, /requestPolicySlugForConversation\(/u);
  // The old inline literal body is gone: the conversation id is only passed to
  // the shared builder, never written into a hand-built request object.
  assert.doesNotMatch(
    source,
    /frontendChatId: stableConversationId,/u,
    "the body must come from the shared builder"
  );
});
