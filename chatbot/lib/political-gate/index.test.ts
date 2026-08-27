import assert from "node:assert/strict";
import test from "node:test";
import fixtures from "../../tests/fixtures/political-gate-fixtures.json";
import {
  evaluatePoliticalText,
  evaluateWidgetSubmission,
  politicalGateIdentity,
  sanitizePoliticalHistory,
} from "./index";

type FixtureCase = {
  decision: "allow" | "block";
  id: string;
  text: string;
};

const policyFixtures = fixtures as {
  cases: FixtureCase[];
  never_standalone_terms: string[];
  policy_version: string;
};

test("generated political-gate fixture corpus has stable public decisions", () => {
  assert.equal(
    politicalGateIdentity.policyVersion,
    policyFixtures.policy_version
  );

  for (const fixture of policyFixtures.cases) {
    const defaultModeResult = evaluatePoliticalText(fixture.text);
    const premiumModeResult = evaluatePoliticalText(fixture.text);

    assert.equal(defaultModeResult.decision, fixture.decision, fixture.id);
    assert.equal(premiumModeResult.decision, fixture.decision, fixture.id);
    assert.equal(
      defaultModeResult.policyVersion,
      politicalGateIdentity.policyVersion,
      fixture.id
    );
    assert.equal(
      defaultModeResult.policyHash,
      politicalGateIdentity.policyHash,
      fixture.id
    );
    assert.deepEqual(
      defaultModeResult.decision,
      premiumModeResult.decision,
      fixture.id
    );

    for (const prohibitedField of ["match", "normalized", "rawText", "rule"]) {
      assert.equal(
        prohibitedField in defaultModeResult,
        false,
        `${fixture.id} exposed ${prohibitedField}`
      );
    }
  }
});

test("never-standalone terms do not block on their own", () => {
  for (const term of policyFixtures.never_standalone_terms) {
    assert.equal(evaluatePoliticalText(term).decision, "allow", term);
  }
});

test("submission scanning cannot skip a late client-controlled value", () => {
  const intakeFacts = Object.fromEntries(
    Array.from({ length: 300 }, (_, index) => [
      `ordinary-field-${index}`,
      "ordinary immigration fact",
    ])
  );
  intakeFacts.lateFreeText = "falun gong";

  assert.equal(
    evaluateWidgetSubmission({
      intakeFacts,
      question: "Can I apply for a visa?",
    }).decision,
    "block"
  );
});

test("submission scanning evaluates text parts as one forwarded message", () => {
  assert.equal(
    evaluateWidgetSubmission({
      messages: [
        {
          parts: [
            { text: "Xi Jinping", type: "text" },
            { text: "criticize", type: "text" },
          ],
          role: "user",
        },
      ],
    }).decision,
    "block"
  );
});

test("historical blocked turns do not make a later submission sticky", () => {
  assert.equal(
    evaluateWidgetSubmission({
      messages: [
        { role: "user", parts: [{ type: "text", text: "习近平" }] },
        {
          role: "user",
          parts: [
            {
              type: "text",
              text: "Can a holder of subclass 461 visa who is onshore apply on their own?",
            },
          ],
        },
      ],
    }).decision,
    "allow"
  );
});

test("blocked historical messages are removed before normal history forwarding", () => {
  const safeHistory = sanitizePoliticalHistory([
    { role: "user", parts: [{ type: "text", text: "习近平" }] },
    {
      role: "user",
      parts: [{ type: "text", text: "Can I apply for a visa?" }],
    },
  ]) as Array<{ role: string; parts: Array<{ text: string }> }>;

  assert.deepEqual(safeHistory, [
    {
      role: "user",
      parts: [{ type: "text", text: "Can I apply for a visa?" }],
    },
  ]);
});

test("current guided-intake facts are checked without carried historical facts", () => {
  assert.equal(
    evaluateWidgetSubmission({
      messages: [
        { role: "user", parts: [{ type: "text", text: "Can I apply?" }] },
      ],
      intakeFacts: { previous_free_text: "法轮功" },
      currentIntakeFacts: {},
    }).decision,
    "allow"
  );
  assert.equal(
    evaluateWidgetSubmission({
      messages: [
        { role: "user", parts: [{ type: "text", text: "Guided intake" }] },
      ],
      currentIntakeFacts: { current_free_text: "法轮功" },
    }).decision,
    "block"
  );
});
