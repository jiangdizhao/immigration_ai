import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { DeepPreparationView } from "@/lib/workspace/student-500-deep-preparation";
import { student500DeepCopy } from "@/lib/workspace-copy";
import {
  buildEditorialReviewRequest,
  EditorialConsentPanel,
  sectionLocaleFor,
} from "./student-500-deep-preparation-section";

/**
 * Component-level regression for the remaining UI discrepancies.
 *
 * The review request must come from the server view (never a hardcoded draft
 * version, never a proposal's accepted draft id, never an empty fact selection) and
 * must be impossible without an explicit consent action. The rendered consent
 * surface and the locale wiring are asserted directly; this repository has no DOM
 * test library, so interaction is covered at the payload builder the button calls and
 * at the real server-rendered markup.
 */

const DRAFT_ID = "55555555-5555-4555-8555-555555555555";
const FACT_A = "66666666-6666-4666-8666-666666666666";
const FACT_B = "88888888-8888-4888-8888-888888888888";

function buildView(): DeepPreparationView {
  return {
    currentDraft: {
      contentSha256: "a".repeat(64),
      draftId: DRAFT_ID,
      version: 7,
    },
    disclosureScope: {
      factBearingDraftReferenceIds: [FACT_A, FACT_B],
      readableFactReferenceIds: [FACT_A, FACT_B],
    },
    editorialAuthority: { available: false, credentialStatus: "unavailable" },
    editorialReviews: [],
    followUpQuestions: [],
    limits: { maxEditorialRounds: 5, maxProposals: 10, maxTasks: 12 },
    primaryNextAction: null,
    proposal: null,
    scenario: {
      complexity: "complex",
      humanReviewRequired: true,
      scenarioKinds: ["onshore_with_current_visa"],
      unresolvedRequirementKeys: [],
    },
    submissionActionsAvailable: [],
    submissionStatus: "not_submission_ready",
    tasks: [],
  } as unknown as DeepPreparationView;
}

test("the review payload is the server draft identity and its fact dependencies", () => {
  const body = buildEditorialReviewRequest(buildView(), true);
  assert.ok(body);
  assert.equal(body.draftId, DRAFT_ID);
  assert.equal(body.draftVersion, 7);
  assert.deepEqual(body.factReferenceIds, [FACT_A, FACT_B]);
  assert.deepEqual(body.disclosureScopes, [
    "gs_draft_sections",
    "selected_fact_summaries",
  ]);
  assert.equal(body.consentGranted, true);
  // The pre-R3 defects must be gone.
  assert.notEqual(body.draftVersion, 1);
  assert.notDeepEqual(body.factReferenceIds, []);
  assert.equal(Object.hasOwn(body, "acceptedDraftId"), false);
});

test("no payload exists without consent or without a server draft", () => {
  assert.equal(buildEditorialReviewRequest(buildView(), false), null);
  assert.equal(
    buildEditorialReviewRequest(
      { ...buildView(), currentDraft: null } as unknown as DeepPreparationView,
      true
    ),
    null
  );
});

test("the rendered consent surface is unchecked, disabled and shows the real scope", () => {
  const view = buildView();
  const markup = renderToStaticMarkup(
    <EditorialConsentPanel
      busy={null}
      consentGiven={false}
      copy={student500DeepCopy.en}
      onConsentChange={() => undefined}
      onRequest={() => undefined}
      view={view}
    />
  );
  assert.match(markup, /data-testid="student500-deep-consent-draft"/u);
  assert.match(markup, /v7/u, "the draft version comes from the server view");
  assert.match(markup, /a{12}/u);
  assert.match(markup, /data-testid="student500-deep-consent-facts"/u);
  assert.match(
    markup,
    /student500-deep-consent-facts"[^>]*>[^<]*(<!-- -->)?2</u,
    "both dependent facts are in scope"
  );
  assert.match(markup, /data-testid="student500-deep-consent-checkbox"/u);
  assert.doesNotMatch(markup, /checked/u, "consent must start unchecked");
  assert.match(
    markup,
    /data-testid="student500-deep-request-review"[^>]*disabled/u,
    "the request must be blocked until consent is given"
  );
  assert.doesNotMatch(markup, /submission_ready|approved/u);
});

test("consent given renders an enabled request and no draft renders none", () => {
  const enabled = renderToStaticMarkup(
    <EditorialConsentPanel
      busy={null}
      consentGiven
      copy={student500DeepCopy.en}
      onConsentChange={() => undefined}
      onRequest={() => undefined}
      view={buildView()}
    />
  );
  assert.doesNotMatch(
    enabled,
    /data-testid="student500-deep-request-review"[^>]*disabled/u
  );
  const noDraft = renderToStaticMarkup(
    <EditorialConsentPanel
      busy={null}
      consentGiven={false}
      copy={student500DeepCopy.en}
      onConsentChange={() => undefined}
      onRequest={() => undefined}
      view={
        { ...buildView(), currentDraft: null } as unknown as DeepPreparationView
      }
    />
  );
  assert.match(
    noDraft,
    new RegExp(student500DeepCopy.en.consentNeedsDraft, "u")
  );
  assert.doesNotMatch(noDraft, /student500-deep-request-review/u);
});

test("the section locale follows the rendered document, including Chinese", () => {
  assert.equal(
    sectionLocaleFor({ documentElement: { lang: "zh-Hans" } }),
    "zh-Hans"
  );
  assert.equal(
    sectionLocaleFor({ documentElement: { lang: "zh-Hant" } }),
    "zh-Hant"
  );
  assert.equal(sectionLocaleFor({ documentElement: { lang: "en" } }), "en");
  assert.equal(sectionLocaleFor(null), "en");
  // The Chinese consent surface is really rendered, not just present in a copy map.
  const zhMarkup = renderToStaticMarkup(
    <EditorialConsentPanel
      busy={null}
      consentGiven={false}
      copy={
        student500DeepCopy[
          sectionLocaleFor({ documentElement: { lang: "zh-Hans" } })
        ]
      }
      onConsentChange={() => undefined}
      onRequest={() => undefined}
      view={buildView()}
    />
  );
  assert.match(
    zhMarkup,
    new RegExp(student500DeepCopy["zh-Hans"].consentHeading, "u")
  );
  assert.doesNotMatch(
    zhMarkup,
    new RegExp(student500DeepCopy.en.consentHeading, "u")
  );
});
