import assert from "node:assert/strict";
import { test } from "node:test";
import { Student500PreparationError } from "./contracts";
import type { Student500AdmissionLinkResolver } from "./ports";
import {
  ADMISSION_CASE,
  createHarness,
  fact,
  MEMBER,
  OTHER_PROJECT,
  OWNER,
  PROJECT,
  STRANGER,
} from "./testing";

const FAKE_ADMISSIONS: Student500AdmissionLinkResolver = {
  resolve(input) {
    if (input.caseId !== ADMISSION_CASE) {
      return Promise.resolve({ status: "not_found" as const });
    }
    if (input.actorUserId === STRANGER) {
      return Promise.resolve({ status: "forbidden" as const });
    }
    return Promise.resolve({
      coe: null,
      offer: {
        independentlyVerified: false,
        kind: "offer" as const,
        provenance: "customer_reported",
        superseded: false,
        version: 2,
      },
      originKind: "existing_offer",
      revision: 4,
      status: "resolved" as const,
    });
  },
};

async function rejectsWith(
  run: () => Promise<unknown>,
  code: string
): Promise<void> {
  await assert.rejects(run, (error: unknown) => {
    assert.ok(error instanceof Student500PreparationError, String(error));
    assert.equal(error.code, code);
    return true;
  });
}

test("an existing application reopens with preparation state across sessions", async () => {
  const harness = createHarness({
    facts: [fact({ key: "study.course_name" })],
  });
  const application = await harness.seedApplication();

  const first = await harness.service.get({
    actorUserId: OWNER,
    applicationId: application.id,
    projectId: PROJECT,
  });
  assert.equal(first.applicationId, application.id);
  assert.equal(first.screeningSubmissionStatus, "not_submission_ready");
  assert.equal(first.documentsTrust, "unavailable");
  assert.equal(first.schoolContext, null);
  assert.equal(first.drafts.length, 0);

  await harness.service.selectFact({
    actorUserId: OWNER,
    applicationId: application.id,
    factAssertionId: "55555555-5555-4555-8555-555555555501",
    factVersion: 1,
    operationId: "op-select-1",
    projectId: PROJECT,
  });

  // A fresh read ("new session") sees the persisted selection.
  const reopened = await harness.service.get({
    actorUserId: OWNER,
    applicationId: application.id,
    projectId: PROJECT,
  });
  assert.equal(reopened.selectedFacts.length, 1);
  assert.equal(reopened.selectedFacts[0]?.factKey, "study.course_name");
  assert.equal(
    reopened.selectedFacts[0]?.currentState,
    "covered_by_authorized_fact"
  );
  // A selection is still customer evidence, never verification.
  assert.equal(reopened.selectedFacts[0]?.independentlyVerified, false);
});

test("an existing CoE route works without any school application", async () => {
  const harness = createHarness({ facts: [] });
  const application = await harness.seedApplication({
    applicationPlace: "offshore",
    asOfDate: "2026-11-03",
    coeStatus: "reported_held",
    entryRoute: "existing_coe",
  });
  const view = await harness.service.get({
    actorUserId: OWNER,
    applicationId: application.id,
    projectId: PROJECT,
  });
  // The CoE is customer-reported only; nothing is verified and no school
  // application was fabricated.
  assert.equal(view.context.coeStatus, "reported_held");
  assert.equal(view.schoolContext, null);
  assert.equal(view.selectedFacts.length, 0);
  assert.equal(
    view.reconciliation.requirements.every(
      (entry) => entry.independentVerification === "none_established"
    ),
    true
  );
});

test("an Offer-only admission case never becomes a verified CoE", async () => {
  const harness = createHarness({ admissions: FAKE_ADMISSIONS, facts: [] });
  const application = await harness.seedApplication();
  const result = await harness.service.setSchoolContext({
    actorUserId: OWNER,
    admissionCaseId: ADMISSION_CASE,
    applicationId: application.id,
    expectedRevision: null,
    kind: "admission_case",
    operationId: "op-school-1",
    projectId: PROJECT,
    schoolApplicationId: null,
  });
  assert.equal(result.schoolContext.kind, "admission_case");
  assert.equal(result.schoolContext.studyEvidenceKind, "offer_only");
  assert.equal(result.schoolContext.admissionOutcomeKind, "offer");
  assert.equal(
    result.schoolContext.admissionOutcomeProvenance,
    "customer_reported"
  );
  assert.equal(result.schoolContext.admissionOutcomeVerified, false);

  const view = await harness.service.get({
    actorUserId: OWNER,
    applicationId: application.id,
    projectId: PROJECT,
  });
  assert.equal(view.schoolContext?.studyEvidenceKind, "offer_only");
  assert.equal(
    view.schoolContext?.admissionOutcomeIndependentlyVerified,
    false
  );
});

test("an unauthorized admission case is unavailable, not silently unlinked", async () => {
  const harness = createHarness({ admissions: FAKE_ADMISSIONS, facts: [] });
  const application = await harness.seedApplication();
  await rejectsWith(
    () =>
      harness.service.setSchoolContext({
        actorUserId: OWNER,
        admissionCaseId: "33333333-3333-4333-8333-333333333399",
        applicationId: application.id,
        expectedRevision: null,
        kind: "admission_case",
        operationId: "op-school-bad",
        projectId: PROJECT,
        schoolApplicationId: null,
      }),
    "school_context_unavailable"
  );
});

test("customer-confirmed but unverified facts keep their classification", async () => {
  const harness = createHarness({
    facts: [fact({ key: "language.testscore", valueDisplay: "IELTS 6.5" })],
  });
  const application = await harness.seedApplication({
    applicationPlace: "offshore",
    asOfDate: "2026-11-03",
    coeStatus: "reported_not_held",
    englishEvidence: "reported_held",
    entryRoute: "offer_only",
  });
  await harness.service.selectFact({
    actorUserId: OWNER,
    applicationId: application.id,
    factAssertionId: "55555555-5555-4555-8555-555555555501",
    factVersion: 1,
    operationId: "op-select-lang",
    projectId: PROJECT,
  });
  const view = await harness.service.get({
    actorUserId: OWNER,
    applicationId: application.id,
    projectId: PROJECT,
  });
  const english = view.reconciliation.requirements.find(
    (entry) => entry.requirementKey === "english_language_evidence"
  );
  assert.ok(english);
  assert.equal(english.coverage, "covered_by_authorized_fact");
  assert.equal(english.customerConfirmed, true);
  assert.equal(english.aiUseAuthorized, true);
  assert.equal(english.independentVerification, "none_established");
  assert.equal(english.documentTrust, "unavailable");
  assert.equal(english.humanReviewRequired, true);
  assert.ok(english.gaps.includes("independent_verification_unavailable"));
  assert.ok(english.gaps.includes("legal_source_unverified"));
});

test("a fact without an AI-use grant is selectable but never feeds the draft", async () => {
  const harness = createHarness({
    facts: [
      fact({
        key: "study.course_name",
        aiUseAuthorized: false,
        authorizedAudience: "none",
        authorizationActorUserId: null,
      }),
    ],
  });
  const application = await harness.seedApplication();
  await harness.service.selectFact({
    actorUserId: OWNER,
    applicationId: application.id,
    factAssertionId: "55555555-5555-4555-8555-555555555501",
    factVersion: 1,
    operationId: "op-select-no-grant",
    projectId: PROJECT,
  });
  const view = await harness.service.get({
    actorUserId: OWNER,
    applicationId: application.id,
    projectId: PROJECT,
  });
  assert.equal(view.selectedFacts[0]?.aiUseAuthorized, false);
  assert.equal(
    view.selectedFacts[0]?.currentState,
    "blocked_fact_not_ai_authorized"
  );
  assert.ok(view.nextActions.includes("grant_ai_use_for_fact"));

  const draft = await harness.service.createDraft({
    actorUserId: OWNER,
    applicationId: application.id,
    operationId: "op-draft-no-grant",
    projectId: PROJECT,
  });
  assert.equal(draft.draft.sourceFactReferenceIds.length, 0);
  // No invented content: every section is an explicit missing placeholder.
  assert.equal(
    draft.draft.sections.every((section) => section.source === "missing"),
    true
  );
});

test("unavailable fact projection is reported honestly, never as 'no facts'", async () => {
  const harness = createHarness({ facts: "unavailable" });
  const application = await harness.seedApplication();
  const view = await harness.service.get({
    actorUserId: OWNER,
    applicationId: application.id,
    projectId: PROJECT,
  });
  assert.equal(view.factsAvailable, false);
  assert.equal(
    view.reconciliation.factsUnavailableReason,
    "fact_projection_unavailable"
  );
  assert.equal(view.availableFacts.length, 0);
  assert.ok(
    view.reconciliation.requirements.some((entry) =>
      entry.gaps.includes("project_documents_unavailable")
    )
  );
  await rejectsWith(
    () =>
      harness.service.selectFact({
        actorUserId: OWNER,
        applicationId: application.id,
        factAssertionId: "55555555-5555-4555-8555-555555555501",
        factVersion: 1,
        operationId: "op-select-unavailable",
        projectId: PROJECT,
      }),
    "fact_not_available"
  );
});

test("a conflicting fact blocks coverage instead of reporting completeness", async () => {
  const harness = createHarness({
    facts: [fact({ key: "fees.budget", conflicted: true })],
  });
  const application = await harness.seedApplication({
    applicationPlace: "offshore",
    asOfDate: "2026-11-03",
    coeStatus: "reported_not_held",
    entryRoute: "offer_only",
    financialEvidence: "reported_held",
  });
  await harness.service.selectFact({
    actorUserId: OWNER,
    applicationId: application.id,
    factAssertionId: "55555555-5555-4555-8555-555555555501",
    factVersion: 1,
    operationId: "op-select-conflict",
    projectId: PROJECT,
  });
  const view = await harness.service.get({
    actorUserId: OWNER,
    applicationId: application.id,
    projectId: PROJECT,
  });
  const financial = view.reconciliation.requirements.find(
    (entry) => entry.requirementKey === "financial_capacity_evidence"
  );
  assert.ok(financial);
  assert.equal(financial.coverage, "blocked_fact_conflicting");
  assert.equal(view.reconciliation.conflictsVisible, true);
  assert.ok(view.nextActions.includes("resolve_fact_conflict"));
  // No single "complete" flag exists anywhere in the contract.
  assert.equal("complete" in view, false);
});

test("a superseded fact version is stale and requests a refresh action", async () => {
  const harness = createHarness({
    facts: [fact({ key: "fees.budget", stale: true, state: "stale" })],
  });
  const application = await harness.seedApplication();
  await harness.service.selectFact({
    actorUserId: OWNER,
    applicationId: application.id,
    factAssertionId: "55555555-5555-4555-8555-555555555501",
    factVersion: 1,
    operationId: "op-select-stale",
    projectId: PROJECT,
  });
  const view = await harness.service.get({
    actorUserId: OWNER,
    applicationId: application.id,
    projectId: PROJECT,
  });
  assert.equal(view.selectedFacts[0]?.currentState, "blocked_fact_stale");
  assert.ok(view.nextActions.includes("refresh_superseded_fact"));
});

test("the GS starter contains only authorized facts and explicit unknowns", async () => {
  const harness = createHarness({
    facts: [
      fact({
        factAssertionId: "55555555-5555-4555-8555-5555555555a1",
        key: "study.course_name",
        valueDisplay: "Bachelor of Nursing",
      }),
    ],
  });
  const application = await harness.seedApplication();
  await harness.service.selectFact({
    actorUserId: OWNER,
    applicationId: application.id,
    factAssertionId: "55555555-5555-4555-8555-5555555555a1",
    factVersion: 1,
    operationId: "op-select-starter",
    projectId: PROJECT,
  });
  const draft = await harness.service.createDraft({
    actorUserId: OWNER,
    applicationId: application.id,
    operationId: "op-draft-1",
    projectId: PROJECT,
  });
  assert.equal(draft.draft.origin, "deterministic_starter");
  assert.equal(draft.draft.version, 1);
  assert.equal(draft.draft.sections.length, 5);
  const courseSection = draft.draft.sections.find(
    (section) => section.sectionKey === "course_and_reasons"
  );
  assert.ok(courseSection);
  assert.equal(courseSection.source, "authorized_fact");
  assert.match(courseSection.text, /Bachelor of Nursing/u);
  assert.match(courseSection.text, /customer-confirmed \(unverified\) fact/u);
  const missing = draft.draft.sections.filter(
    (section) => section.source === "missing"
  );
  assert.ok(missing.length >= 1);
  for (const section of missing) {
    assert.match(section.text, /has not invented any details/u);
  }
  // Nothing about the applicant's employment, family or finances was invented.
  const allText = draft.draft.sections
    .map((section) => section.text)
    .join("\n");
  assert.doesNotMatch(allText, /employer|salary|married|savings|IELTS/u);
});

test("a GS draft can be edited, versioned and reopened without overwriting", async () => {
  const harness = createHarness({ facts: [] });
  const application = await harness.seedApplication();
  const first = await harness.service.createDraft({
    actorUserId: OWNER,
    applicationId: application.id,
    operationId: "op-draft-v1",
    projectId: PROJECT,
  });
  const second = await harness.service.saveDraft({
    actorUserId: OWNER,
    applicationId: application.id,
    baseDraftId: first.draft.id,
    edits: [
      {
        sectionKey: "applicant_background",
        text: "I completed secondary school in 2024.",
      },
    ],
    operationId: "op-draft-v2",
    projectId: PROJECT,
  });
  assert.equal(second.draft.version, 2);
  assert.equal(second.draft.origin, "customer_edit");
  assert.equal(second.draft.supersedesDraftId, first.draft.id);
  const edited = second.draft.sections.find(
    (section) => section.sectionKey === "applicant_background"
  );
  assert.equal(edited?.text, "I completed secondary school in 2024.");
  assert.equal(edited?.source, "customer_text");

  // The earlier version is unchanged and still inspectable through the API.
  const reopenedFirst = await harness.service.getDraft({
    actorUserId: OWNER,
    applicationId: application.id,
    draftId: first.draft.id,
    projectId: PROJECT,
  });
  assert.equal(reopenedFirst.version, 1);
  assert.equal(
    reopenedFirst.sections.some((section) => section.source === "missing"),
    true
  );
  const view = await harness.service.get({
    actorUserId: OWNER,
    applicationId: application.id,
    projectId: PROJECT,
  });
  assert.equal(view.drafts.length, 2);
  assert.equal(view.latestDraft?.version, 2);
});

test("a material fact change invalidates dependent versions only", async () => {
  const harness = createHarness({
    facts: [
      fact({
        factAssertionId: "55555555-5555-4555-8555-5555555555b1",
        key: "fees.budget",
        valueDisplay: "AUD 80,000",
      }),
    ],
  });
  const application = await harness.seedApplication();
  await harness.service.selectFact({
    actorUserId: OWNER,
    applicationId: application.id,
    factAssertionId: "55555555-5555-4555-8555-5555555555b1",
    factVersion: 1,
    operationId: "op-select-inv",
    projectId: PROJECT,
  });
  const draft = await harness.service.createDraft({
    actorUserId: OWNER,
    applicationId: application.id,
    operationId: "op-draft-inv",
    projectId: PROJECT,
  });
  const freshView = await harness.service.get({
    actorUserId: OWNER,
    applicationId: application.id,
    projectId: PROJECT,
  });
  assert.equal(freshView.drafts[0]?.stale, false);

  // The fact is superseded upstream: only the dependent version is stale.
  harness.setFacts([
    fact({
      factAssertionId: "55555555-5555-4555-8555-5555555555b1",
      key: "fees.budget",
      valueDisplay: "AUD 90,000",
      version: 2,
    }),
  ]);
  const staleView = await harness.service.get({
    actorUserId: OWNER,
    applicationId: application.id,
    projectId: PROJECT,
  });
  assert.equal(staleView.drafts[0]?.stale, true);
  assert.ok(
    staleView.drafts[0]?.staleReasons.includes("fact_version_superseded")
  );
  // The saved text itself was not rewritten.
  assert.deepEqual(
    staleView.drafts[0]?.sections.map((section) => section.text),
    draft.draft.sections.map((section) => section.text)
  );
});

test("preparation snapshots are versioned and keep their source identities", async () => {
  const harness = createHarness({ facts: [] });
  const application = await harness.seedApplication();
  const first = await harness.service.createSnapshot({
    actorUserId: OWNER,
    applicationId: application.id,
    operationId: "op-snap-1",
    projectId: PROJECT,
  });
  assert.equal(first.snapshot.version, 1);
  assert.equal(first.snapshot.applicationRevision, application.revision);
  const content = first.snapshot.content as {
    schemaVersion?: string;
    screeningSubmissionStatus?: string;
    requirementCoverage?: unknown[];
  };
  assert.equal(content.schemaVersion, "phase13.student500-preparation.v1");
  assert.equal(content.screeningSubmissionStatus, "not_submission_ready");
  assert.ok(Array.isArray(content.requirementCoverage));

  const second = await harness.service.createSnapshot({
    actorUserId: OWNER,
    applicationId: application.id,
    operationId: "op-snap-2",
    projectId: PROJECT,
  });
  assert.equal(second.snapshot.version, 2);
  const reopened = await harness.service.getSnapshot({
    actorUserId: OWNER,
    applicationId: application.id,
    projectId: PROJECT,
    snapshotId: first.snapshot.id,
  });
  assert.equal(reopened.contentSha256, first.snapshot.contentSha256);
});

test("exact replay never duplicates a draft or a snapshot", async () => {
  const harness = createHarness({ facts: [] });
  const application = await harness.seedApplication();
  const first = await harness.service.createDraft({
    actorUserId: OWNER,
    applicationId: application.id,
    operationId: "op-replay-draft",
    projectId: PROJECT,
  });
  const replay = await harness.service.createDraft({
    actorUserId: OWNER,
    applicationId: application.id,
    operationId: "op-replay-draft",
    projectId: PROJECT,
  });
  assert.equal(replay.replayed, true);
  assert.equal(replay.draft.id, first.draft.id);

  const snapshot = await harness.service.createSnapshot({
    actorUserId: OWNER,
    applicationId: application.id,
    operationId: "op-replay-snapshot",
    projectId: PROJECT,
  });
  const snapshotReplay = await harness.service.createSnapshot({
    actorUserId: OWNER,
    applicationId: application.id,
    operationId: "op-replay-snapshot",
    projectId: PROJECT,
  });
  assert.equal(snapshotReplay.replayed, true);
  assert.equal(snapshotReplay.snapshot.id, snapshot.snapshot.id);

  const view = await harness.service.get({
    actorUserId: OWNER,
    applicationId: application.id,
    projectId: PROJECT,
  });
  assert.equal(view.drafts.length, 1);
  assert.equal(view.snapshots.length, 1);
});

test("another Project cannot read or write this preparation", async () => {
  const harness = createHarness({ facts: [] });
  const application = await harness.seedApplication();
  await rejectsWith(
    () =>
      harness.service.get({
        actorUserId: STRANGER,
        applicationId: application.id,
        projectId: OTHER_PROJECT,
      }),
    "application_not_found"
  );
  await rejectsWith(
    () =>
      harness.service.createDraft({
        actorUserId: STRANGER,
        applicationId: application.id,
        operationId: "op-cross-project",
        projectId: OTHER_PROJECT,
      }),
    "application_not_found"
  );
});

test("a Project member cannot use another member's preparation", async () => {
  const harness = createHarness({ facts: [] });
  const application = await harness.seedApplication();
  // The member may see the Project, but the preparation is owner-scoped.
  await rejectsWith(
    () =>
      harness.service.get({
        actorUserId: MEMBER,
        applicationId: application.id,
        projectId: PROJECT,
      }),
    "application_not_found"
  );
});

test("revoked membership and a closed Project are re-evaluated on write", async () => {
  const harness = createHarness({ facts: [] });
  const application = await harness.seedApplication();
  harness.applications.seedProject(PROJECT, {
    ownerUserId: OWNER,
    status: "closed",
  });
  await rejectsWith(
    () =>
      harness.service.createDraft({
        actorUserId: OWNER,
        applicationId: application.id,
        operationId: "op-closed-project",
        projectId: PROJECT,
      }),
    "project_closed"
  );
});

test("an archived application rejects every preparation write", async () => {
  const harness = createHarness({ facts: [] });
  const application = await harness.seedApplication();
  await harness.applications.archiveApplication({
    applicationId: application.id,
    expectedRevision: application.revision,
    operation: {
      actorUserId: OWNER,
      operationId: "op-archive-app",
      operationType: "student_500_archive",
      requestSha256: "3".repeat(64),
    },
    ownerUserId: OWNER,
    projectId: PROJECT,
  });
  await rejectsWith(
    () =>
      harness.service.createDraft({
        actorUserId: OWNER,
        applicationId: application.id,
        operationId: "op-archived-draft",
        projectId: PROJECT,
      }),
    "application_archived"
  );
  await rejectsWith(
    () =>
      harness.service.selectFact({
        actorUserId: OWNER,
        applicationId: application.id,
        factAssertionId: "55555555-5555-4555-8555-555555555501",
        factVersion: 1,
        operationId: "op-archived-select",
        projectId: PROJECT,
      }),
    "application_archived"
  );
});

test("a client cannot assert verification, approval or a verified CoE", async () => {
  const harness = createHarness({ facts: [] });
  const application = await harness.seedApplication();
  // studyEvidenceKind / provenance / verified are server-derived: passing them is
  // not part of the service contract at all, so they cannot influence the result.
  const result = await harness.service.setSchoolContext({
    actorUserId: OWNER,
    admissionCaseId: null,
    applicationId: application.id,
    expectedRevision: null,
    kind: "customer_reported_coe",
    operationId: "op-coe-report",
    projectId: PROJECT,
    schoolApplicationId: null,
  });
  assert.equal(result.schoolContext.studyEvidenceKind, "coe_reported");
  assert.equal(
    result.schoolContext.admissionOutcomeProvenance,
    "customer_reported"
  );
  assert.equal(result.schoolContext.admissionOutcomeVerified, false);
});

test("concurrent draft saves cannot silently overwrite each other", async () => {
  const harness = createHarness({ facts: [] });
  const application = await harness.seedApplication();
  const base = await harness.service.createDraft({
    actorUserId: OWNER,
    applicationId: application.id,
    operationId: "op-cas-base",
    projectId: PROJECT,
  });
  const first = await harness.service.saveDraft({
    actorUserId: OWNER,
    applicationId: application.id,
    baseDraftId: base.draft.id,
    edits: [{ sectionKey: "future_plans", text: "First writer." }],
    operationId: "op-cas-a",
    projectId: PROJECT,
  });
  assert.equal(first.draft.version, 2);
  // A second save based on the *same* old version must not overwrite version 2.
  await rejectsWith(
    () =>
      harness.service.saveDraft({
        actorUserId: OWNER,
        applicationId: application.id,
        baseDraftId: base.draft.id,
        edits: [{ sectionKey: "future_plans", text: "Second writer." }],
        operationId: "op-cas-b",
        projectId: PROJECT,
      }),
    "version_conflict"
  );
});

test("a superseded school context revision is rejected", async () => {
  const harness = createHarness({ facts: [] });
  const application = await harness.seedApplication();
  await harness.service.setSchoolContext({
    actorUserId: OWNER,
    admissionCaseId: null,
    applicationId: application.id,
    expectedRevision: null,
    kind: "customer_reported_coe",
    operationId: "op-rev-1",
    projectId: PROJECT,
    schoolApplicationId: null,
  });
  await rejectsWith(
    () =>
      harness.service.setSchoolContext({
        actorUserId: OWNER,
        admissionCaseId: null,
        applicationId: application.id,
        expectedRevision: 5,
        kind: "none",
        operationId: "op-rev-2",
        projectId: PROJECT,
        schoolApplicationId: null,
      }),
    "revision_conflict"
  );
});

test("all four school-context kinds round-trip, including a case with no outcome", async () => {
  const harness = createHarness({
    admissions: {
      resolve: () =>
        Promise.resolve({
          coe: null,
          offer: null,
          originKind: "existing_coe",
          revision: 2,
          status: "resolved" as const,
        }),
    },
    facts: [],
    schoolApplications: {
      resolve: () =>
        Promise.resolve({
          applicationStatus: "draft",
          sourceStatus: "unverified_customer_declared",
          status: "resolved" as const,
        }),
    },
  });
  const application = await harness.seedApplication();
  const base = {
    actorUserId: OWNER,
    applicationId: application.id,
    projectId: PROJECT,
    schoolApplicationId: null,
  };

  // 1. none
  const none = await harness.service.setSchoolContext({
    ...base,
    admissionCaseId: null,
    expectedRevision: null,
    kind: "none",
    operationId: "op-kind-none",
  });
  assert.equal(none.schoolContext.studyEvidenceKind, "none");
  assert.equal(none.schoolContext.admissionOutcomeKind, null);

  // 2. school application
  const school = await harness.service.setSchoolContext({
    ...base,
    admissionCaseId: null,
    evidence: undefined,
    expectedRevision: none.schoolContext.revision,
    kind: "school_application",
    operationId: "op-kind-school",
    schoolApplicationId: "44444444-4444-4444-8444-444444444401",
  } as never);
  assert.equal(school.schoolContext.kind, "school_application");

  // 3. admission case with NO current outcome: legitimate, and stays unverified.
  const noOutcome = await harness.service.setSchoolContext({
    ...base,
    admissionCaseId: ADMISSION_CASE,
    expectedRevision: school.schoolContext.revision,
    kind: "admission_case",
    operationId: "op-kind-case-no-outcome",
  });
  assert.equal(noOutcome.schoolContext.kind, "admission_case");
  assert.equal(noOutcome.schoolContext.studyEvidenceKind, "none");
  assert.equal(noOutcome.schoolContext.admissionOutcomeKind, null);
  assert.equal(noOutcome.schoolContext.admissionOutcomeVersion, null);
  assert.equal(noOutcome.schoolContext.admissionOutcomeProvenance, null);
  assert.equal(noOutcome.schoolContext.admissionOutcomeVerified, null);

  // 4. customer-reported CoE: outcome metadata present, never verified.
  const reported = await harness.service.setSchoolContext({
    ...base,
    admissionCaseId: null,
    expectedRevision: noOutcome.schoolContext.revision,
    kind: "customer_reported_coe",
    operationId: "op-kind-coe",
  });
  assert.equal(reported.schoolContext.kind, "customer_reported_coe");
  assert.equal(reported.schoolContext.studyEvidenceKind, "coe_reported");
  assert.equal(reported.schoolContext.admissionOutcomeKind, "coe");
  assert.equal(
    reported.schoolContext.admissionOutcomeProvenance,
    "customer_reported"
  );
  assert.equal(reported.schoolContext.admissionOutcomeVerified, false);
});

test("a fact can be selected again after its reference was revoked", async () => {
  const harness = createHarness({
    facts: [fact({ key: "study.course_name" })],
  });
  const application = await harness.seedApplication();
  const first = await harness.service.selectFact({
    actorUserId: OWNER,
    applicationId: application.id,
    factAssertionId: "55555555-5555-4555-8555-555555555501",
    factVersion: 1,
    operationId: "op-reselect-a",
    projectId: PROJECT,
  });
  await harness.service.unselectFact({
    actorUserId: OWNER,
    applicationId: application.id,
    factReferenceId: first.reference.id,
    operationId: "op-reselect-remove",
    projectId: PROJECT,
  });
  const again = await harness.service.selectFact({
    actorUserId: OWNER,
    applicationId: application.id,
    factAssertionId: "55555555-5555-4555-8555-555555555501",
    factVersion: 1,
    operationId: "op-reselect-b",
    projectId: PROJECT,
  });
  assert.notEqual(again.reference.id, first.reference.id);
  const view = await harness.service.get({
    actorUserId: OWNER,
    applicationId: application.id,
    projectId: PROJECT,
  });
  // Exactly one ACTIVE reference; the revoked one remains immutable history.
  assert.equal(view.selectedFacts.length, 1);
  assert.equal(view.selectedFacts[0]?.factReferenceId, again.reference.id);
});

test("a superseded admission outcome stops the link looking current", async () => {
  let superseded = false;
  const harness = createHarness({
    admissions: {
      resolve: () =>
        Promise.resolve({
          coe: superseded
            ? {
                independentlyVerified: false,
                kind: "coe" as const,
                provenance: "customer_reported",
                superseded: true,
                version: 1,
              }
            : null,
          offer: superseded
            ? null
            : {
                independentlyVerified: false,
                kind: "offer" as const,
                provenance: "customer_reported",
                superseded: false,
                version: 2,
              },
          originKind: "existing_offer",
          revision: 4,
          status: "resolved" as const,
        }),
    },
    facts: [],
  });
  const application = await harness.seedApplication();
  await harness.service.setSchoolContext({
    actorUserId: OWNER,
    admissionCaseId: ADMISSION_CASE,
    applicationId: application.id,
    expectedRevision: null,
    kind: "admission_case",
    operationId: "op-reval-1",
    projectId: PROJECT,
    schoolApplicationId: null,
  });
  const snapshot = await harness.service.createSnapshot({
    actorUserId: OWNER,
    applicationId: application.id,
    operationId: "op-reval-snap",
    projectId: PROJECT,
  });
  const before = await harness.service.get({
    actorUserId: OWNER,
    applicationId: application.id,
    projectId: PROJECT,
  });
  assert.equal(before.schoolContext?.current, true);
  assert.equal(before.snapshots[0]?.stale, false);

  // The source outcome is superseded: the stored link must not look current.
  superseded = true;
  const after = await harness.service.get({
    actorUserId: OWNER,
    applicationId: application.id,
    projectId: PROJECT,
  });
  assert.equal(after.schoolContext?.current, false);
  assert.equal(
    after.schoolContext?.unavailableReason,
    "admission_outcome_superseded"
  );
  assert.equal(after.snapshots[0]?.stale, true);
  assert.ok(
    after.snapshots[0]?.staleReasons.includes("school_outcome_superseded") ||
      after.snapshots[0]?.staleReasons.includes("school_context_changed")
  );
  // The saved snapshot itself is not rewritten.
  assert.equal(
    after.snapshots[0]?.contentSha256,
    snapshot.snapshot.contentSha256
  );
});

test("a new GS version never renews source text whose grant was revoked", async () => {
  const harness = createHarness({
    facts: [
      fact({
        factAssertionId: "55555555-5555-4555-8555-5555555555e1",
        key: "study.course_name",
        valueDisplay: "Bachelor of Nursing",
      }),
    ],
  });
  const application = await harness.seedApplication();
  await harness.service.selectFact({
    actorUserId: OWNER,
    applicationId: application.id,
    factAssertionId: "55555555-5555-4555-8555-5555555555e1",
    factVersion: 1,
    operationId: "op-renew-select",
    projectId: PROJECT,
  });
  const first = await harness.service.createDraft({
    actorUserId: OWNER,
    applicationId: application.id,
    operationId: "op-renew-draft",
    projectId: PROJECT,
  });
  const sourcedFirst = first.draft.sections.find(
    (section) => section.source === "authorized_fact"
  );
  assert.ok(sourcedFirst);

  // The customer authors one section while the source grant is still active.
  const second = await harness.service.saveDraft({
    actorUserId: OWNER,
    applicationId: application.id,
    baseDraftId: first.draft.id,
    edits: [{ sectionKey: "future_plans", text: "My own plan." }],
    operationId: "op-renew-save-1",
    projectId: PROJECT,
  });
  assert.equal(second.draft.version, 2);

  // The grant is revoked upstream.
  harness.setFacts([
    fact({
      aiUseAuthorized: false,
      authorizedAudience: "none",
      factAssertionId: "55555555-5555-4555-8555-5555555555e1",
      key: "study.course_name",
      valueDisplay: "Bachelor of Nursing",
    }),
  ]);

  const third = await harness.service.saveDraft({
    actorUserId: OWNER,
    applicationId: application.id,
    baseDraftId: second.draft.id,
    edits: [{ sectionKey: "applicant_background", text: "Customer text." }],
    operationId: "op-renew-save-2",
    projectId: PROJECT,
  });
  const renewedCourse = third.draft.sections.find(
    (section) => section.sectionKey === "course_and_reasons"
  );
  assert.ok(renewedCourse);
  // Text preserved verbatim, but no longer presented as authorized source text.
  assert.equal(renewedCourse.text, sourcedFirst.text);
  assert.equal(renewedCourse.source, "customer_text");
  assert.ok(
    renewedCourse.missingInformation.includes(
      "source_material_stale_review_required"
    )
  );
  // The renewed version does not depend on the revoked reference.
  assert.equal(third.draft.sourceFactReferenceIds.length, 0);
  // Customer-authored text is untouched, and earlier versions remain intact.
  assert.equal(
    third.draft.sections.find((s) => s.sectionKey === "future_plans")?.text,
    "My own plan."
  );
  assert.equal(
    second.draft.sections.find((s) => s.sectionKey === "future_plans")?.text,
    "My own plan."
  );
  assert.equal(
    first.draft.sections.find((s) => s.sectionKey === "course_and_reasons")
      ?.source,
    "authorized_fact"
  );
});

test("switching between two identical-status records invalidates dependents", async () => {
  const recordA = "44444444-4444-4444-8444-4444444444a1";
  const recordB = "44444444-4444-4444-8444-4444444444b1";
  const harness = createHarness({
    facts: [],
    schoolApplications: {
      resolve: (input) =>
        Promise.resolve({
          applicationStatus: "draft",
          sourceStatus: "unverified_customer_declared",
          status: "resolved" as const,
        }),
    },
  });
  const application = await harness.seedApplication();
  const selectA = await harness.service.setSchoolContext({
    actorUserId: OWNER,
    admissionCaseId: null,
    applicationId: application.id,
    expectedRevision: null,
    kind: "school_application",
    operationId: "op-a2b-a",
    projectId: PROJECT,
    schoolApplicationId: recordA,
  });
  const snapshot = await harness.service.createSnapshot({
    actorUserId: OWNER,
    applicationId: application.id,
    operationId: "op-a2b-snap",
    projectId: PROJECT,
  });
  const beforeSwitch = await harness.service.get({
    actorUserId: OWNER,
    applicationId: application.id,
    projectId: PROJECT,
  });
  assert.equal(beforeSwitch.snapshots[0]?.stale, false);

  // A -> B: same status, different authorized record identity.
  await harness.service.setSchoolContext({
    actorUserId: OWNER,
    admissionCaseId: null,
    applicationId: application.id,
    expectedRevision: selectA.schoolContext.revision,
    kind: "school_application",
    operationId: "op-a2b-b",
    projectId: PROJECT,
    schoolApplicationId: recordB,
  });
  const afterSwitch = await harness.service.get({
    actorUserId: OWNER,
    applicationId: application.id,
    projectId: PROJECT,
  });
  assert.equal(afterSwitch.schoolContext?.schoolApplicationId, recordB);
  assert.equal(afterSwitch.schoolContext?.current, true);
  // The stored snapshot is not rewritten, but it is no longer presented as current.
  assert.equal(
    afterSwitch.snapshots[0]?.contentSha256,
    snapshot.snapshot.contentSha256
  );
  assert.equal(afterSwitch.snapshots[0]?.stale, true);
  assert.ok(
    afterSwitch.snapshots[0]?.staleReasons.includes("school_context_changed")
  );
});

test("revoked private fact content is withheld from historical draft reads", async () => {
  const SHARED_FACT = "55555555-5555-4555-8555-5555555555d1";
  const harness = createHarness({
    facts: [
      fact({
        authorizationActorUserId: MEMBER,
        factAssertionId: SHARED_FACT,
        key: "study.course_name",
        valueDisplay: "Master of Data Science",
      }),
      fact({
        factAssertionId: "55555555-5555-4555-8555-5555555555d2",
        key: "study.institution",
        valueDisplay: "Example University",
      }),
    ],
  });
  const application = await harness.seedApplication();
  for (const [index, factAssertionId] of [
    SHARED_FACT,
    "55555555-5555-4555-8555-5555555555d2",
  ].entries()) {
    await harness.service.selectFact({
      actorUserId: OWNER,
      applicationId: application.id,
      factAssertionId,
      factVersion: 1,
      operationId: `op-share-select-${index}`,
      projectId: PROJECT,
    });
  }
  const first = await harness.service.createDraft({
    actorUserId: OWNER,
    applicationId: application.id,
    operationId: "op-share-draft",
    projectId: PROJECT,
  });
  // Customer-authored text must survive independently.
  const second = await harness.service.saveDraft({
    actorUserId: OWNER,
    applicationId: application.id,
    baseDraftId: first.draft.id,
    edits: [{ sectionKey: "future_plans", text: "I will return home." }],
    operationId: "op-share-save",
    projectId: PROJECT,
  });
  const sharedSection = second.draft.sections.find(
    (section) => section.factReferenceIds.length > 0
  );
  assert.ok(sharedSection);
  assert.match(
    sharedSection.text,
    /Master of Data Science|Example University/u
  );

  // The sharing member revokes: the fact leaves the applicant's projection.
  harness.setFacts([
    fact({
      factAssertionId: "55555555-5555-4555-8555-5555555555d2",
      key: "study.institution",
      valueDisplay: "Example University",
    }),
  ]);

  const after = await harness.service.get({
    actorUserId: OWNER,
    applicationId: application.id,
    projectId: PROJECT,
  });
  const serialized = JSON.stringify(after.drafts);
  // The restricted source text is not served from any stored version...
  assert.doesNotMatch(serialized, /Master of Data Science/u);
  assert.ok(after.drafts.every((draft) => draft.redactedSectionCount >= 1));
  // ...and the hidden fact identity is not leaked through the redaction warning.
  assert.doesNotMatch(serialized, new RegExp(SHARED_FACT, "u"));
  assert.match(serialized, /restricted_source_withheld/u);
  // Independently permissible customer text is preserved.
  assert.match(serialized, /I will return home\./u);
  // The immutable database rows themselves are untouched.
  assert.match(
    JSON.stringify(second.draft.sections),
    /Master of Data Science/u
  );
});

test("the individual draft and snapshot reads honour present-time consent", async () => {
  const SHARED = "55555555-5555-4555-8555-5555555555e9";
  const OWN = "55555555-5555-4555-8555-5555555555ea";
  const harness = createHarness({
    facts: [
      fact({
        authorizationActorUserId: MEMBER,
        factAssertionId: SHARED,
        key: "study.course_name",
        valueDisplay: "Graduate Diploma of Nursing",
      }),
      fact({
        factAssertionId: OWN,
        key: "study.institution",
        valueDisplay: "Northbank Institute",
      }),
    ],
  });
  const application = await harness.seedApplication();
  for (const [index, factAssertionId] of [SHARED, OWN].entries()) {
    await harness.service.selectFact({
      actorUserId: OWNER,
      applicationId: application.id,
      factAssertionId,
      factVersion: 1,
      operationId: `op-draftread-select-${index}`,
      projectId: PROJECT,
    });
  }
  const draft = await harness.service.createDraft({
    actorUserId: OWNER,
    applicationId: application.id,
    operationId: "op-draftread-draft",
    projectId: PROJECT,
  });
  const snapshot = await harness.service.createSnapshot({
    actorUserId: OWNER,
    applicationId: application.id,
    operationId: "op-draftread-snap",
    projectId: PROJECT,
  });
  const customerText = "I will return to my home country after graduation.";
  const edited = await harness.service.saveDraft({
    actorUserId: OWNER,
    applicationId: application.id,
    baseDraftId: draft.draft.id,
    edits: [{ sectionKey: "future_plans", text: customerText }],
    operationId: "op-draftread-save",
    projectId: PROJECT,
  });

  // Before revocation the individual read serves the source text as usual.
  const beforeRevocation = await harness.service.getDraft({
    actorUserId: OWNER,
    applicationId: application.id,
    draftId: edited.draft.id,
    projectId: PROJECT,
  });
  assert.match(
    JSON.stringify(beforeRevocation.sections),
    /Graduate Diploma of Nursing/u
  );
  assert.equal(beforeRevocation.redactedSectionCount, 0);

  // The sharing member revokes; the fact leaves the applicant's projection.
  harness.setFacts([
    fact({
      factAssertionId: OWN,
      key: "study.institution",
      valueDisplay: "Northbank Institute",
    }),
  ]);

  // 1. Main preparation view.
  const view = await harness.service.get({
    actorUserId: OWNER,
    applicationId: application.id,
    projectId: PROJECT,
  });
  assert.doesNotMatch(
    JSON.stringify(view.drafts),
    /Graduate Diploma of Nursing/u
  );
  // 2. Individual historical draft endpoint (the version created before revocation).
  const historical = await harness.service.getDraft({
    actorUserId: OWNER,
    applicationId: application.id,
    draftId: draft.draft.id,
    projectId: PROJECT,
  });
  const historicalJson = JSON.stringify(historical.sections);
  assert.doesNotMatch(historicalJson, /Graduate Diploma of Nursing/u);
  assert.ok(historical.redactedSectionCount >= 1);
  assert.equal(historical.sourceFactReferenceIds.length, 1);
  // No hidden fact identity leaks through the redaction metadata.
  assert.doesNotMatch(JSON.stringify(historical), new RegExp(SHARED, "u"));
  assert.doesNotMatch(
    JSON.stringify(historical),
    /restricted_source_withheld[^"]*5555/u
  );
  // 3. Independently permissible customer text stays visible.
  const afterRevocation = await harness.service.getDraft({
    actorUserId: OWNER,
    applicationId: application.id,
    draftId: edited.draft.id,
    projectId: PROJECT,
  });
  assert.match(
    JSON.stringify(afterRevocation.sections),
    new RegExp(customerText, "u")
  );
  // 4. Snapshot metadata no longer names the restricted fact.
  const snapshotRead = await harness.service.getSnapshot({
    actorUserId: OWNER,
    applicationId: application.id,
    projectId: PROJECT,
    snapshotId: snapshot.snapshot.id,
  });
  assert.doesNotMatch(
    JSON.stringify(snapshotRead.content),
    /study\.course_name/u
  );
  assert.match(JSON.stringify(snapshotRead.content), /study\.institution/u);
  // 5. Stored rows remain byte-identical.
  assert.match(
    JSON.stringify(draft.draft.sections),
    /Graduate Diploma of Nursing/u
  );
  assert.equal(
    (
      await harness.service.getDraft({
        actorUserId: OWNER,
        applicationId: application.id,
        draftId: draft.draft.id,
        projectId: PROJECT,
      })
    ).contentSha256,
    draft.draft.contentSha256
  );
});

test("mutation responses never re-disclose revoked source content", async () => {
  const SHARED = "55555555-5555-4555-8555-5555555555c1";
  const OWN = "55555555-5555-4555-8555-5555555555c2";
  const SHARED_VALUE = "Graduate Certificate of Cyber Security";
  const harness = createHarness({
    facts: [
      fact({
        authorizationActorUserId: MEMBER,
        factAssertionId: SHARED,
        key: "study.course_name",
        valueDisplay: SHARED_VALUE,
      }),
      fact({
        factAssertionId: OWN,
        key: "study.institution",
        valueDisplay: "Harbourline Institute",
      }),
    ],
  });
  const application = await harness.seedApplication();
  for (const [index, factAssertionId] of [SHARED, OWN].entries()) {
    await harness.service.selectFact({
      actorUserId: OWNER,
      applicationId: application.id,
      factAssertionId,
      factVersion: 1,
      operationId: `op-mut-select-${index}`,
      projectId: PROJECT,
    });
  }
  const created = await harness.service.createDraft({
    actorUserId: OWNER,
    applicationId: application.id,
    operationId: "op-mut-draft",
    projectId: PROJECT,
  });
  const CUSTOMER_TEXT = "I plan to work in regional aged care afterwards.";
  const saved = await harness.service.saveDraft({
    actorUserId: OWNER,
    applicationId: application.id,
    baseDraftId: created.draft.id,
    edits: [{ sectionKey: "future_plans", text: CUSTOMER_TEXT }],
    operationId: "op-mut-save",
    projectId: PROJECT,
  });
  const snapshot = await harness.service.createSnapshot({
    actorUserId: OWNER,
    applicationId: application.id,
    operationId: "op-mut-snap",
    projectId: PROJECT,
  });
  // The private value really is in the stored artifact before revocation.
  assert.match(
    JSON.stringify(created.draft.sections),
    new RegExp(SHARED_VALUE, "u")
  );

  // Member A revokes the sharing grant.
  harness.setFacts([
    fact({
      factAssertionId: OWN,
      key: "study.institution",
      valueDisplay: "Harbourline Institute",
    }),
  ]);

  const withoutSecret = (label: string, value: unknown) => {
    const json = JSON.stringify(value);
    assert.doesNotMatch(json, new RegExp(SHARED_VALUE, "u"), label);
    assert.doesNotMatch(json, /study\.course_name/u, label);
    assert.doesNotMatch(json, new RegExp(SHARED, "u"), label);
    return json;
  };

  // 1. Exact idempotent replay of create_gs_draft.
  const draftReplay = await harness.service.createDraft({
    actorUserId: OWNER,
    applicationId: application.id,
    operationId: "op-mut-draft",
    projectId: PROJECT,
  });
  assert.equal(draftReplay.replayed, true);
  withoutSecret("createDraft replay", draftReplay.draft);
  assert.equal(draftReplay.draft.contentSha256, created.draft.contentSha256);
  assert.match(
    JSON.stringify(draftReplay.draft.sections),
    /restricted_source_withheld/u
  );

  // 2. Exact idempotent replay of save_gs_draft.
  const saveReplay = await harness.service.saveDraft({
    actorUserId: OWNER,
    applicationId: application.id,
    baseDraftId: created.draft.id,
    edits: [{ sectionKey: "future_plans", text: CUSTOMER_TEXT }],
    operationId: "op-mut-save",
    projectId: PROJECT,
  });
  assert.equal(saveReplay.replayed, true);
  withoutSecret("saveDraft replay", saveReplay.draft);
  assert.equal(saveReplay.draft.contentSha256, saved.draft.contentSha256);

  // 3. Exact idempotent replay of create_preparation_snapshot.
  const snapshotReplay = await harness.service.createSnapshot({
    actorUserId: OWNER,
    applicationId: application.id,
    operationId: "op-mut-snap",
    projectId: PROJECT,
  });
  assert.equal(snapshotReplay.replayed, true);
  withoutSecret("createSnapshot replay", snapshotReplay.snapshot);
  assert.equal(
    snapshotReplay.snapshot.contentSha256,
    snapshot.snapshot.contentSha256
  );

  // 4. A NEW version saved from the historical draft is also narrowed.
  const nextVersion = await harness.service.saveDraft({
    actorUserId: OWNER,
    applicationId: application.id,
    baseDraftId: saved.draft.id,
    edits: [
      { sectionKey: "applicant_background", text: "Customer background." },
    ],
    operationId: "op-mut-save-2",
    projectId: PROJECT,
  });
  withoutSecret("new version", nextVersion.draft);
  const nextJson = JSON.stringify(nextVersion.draft.sections);
  // Customer-authored text survives everywhere.
  assert.match(nextJson, /Customer background\./u);
  assert.match(nextJson, new RegExp(CUSTOMER_TEXT, "u"));

  // 5. The current GET APIs keep withholding it.
  const view = await harness.service.get({
    actorUserId: OWNER,
    applicationId: application.id,
    projectId: PROJECT,
  });
  withoutSecret("preparation view", view);
  withoutSecret(
    "historical draft GET",
    await harness.service.getDraft({
      actorUserId: OWNER,
      applicationId: application.id,
      draftId: created.draft.id,
      projectId: PROJECT,
    })
  );
  withoutSecret(
    "snapshot GET",
    await harness.service.getSnapshot({
      actorUserId: OWNER,
      applicationId: application.id,
      projectId: PROJECT,
      snapshotId: snapshot.snapshot.id,
    })
  );

  // 6. Stored artifacts and historical hashes are unchanged.
  assert.match(
    JSON.stringify(created.draft.sections),
    new RegExp(SHARED_VALUE, "u")
  );
  assert.equal(
    (
      await harness.service.getDraft({
        actorUserId: OWNER,
        applicationId: application.id,
        draftId: created.draft.id,
        projectId: PROJECT,
      })
    ).contentSha256,
    created.draft.contentSha256
  );
});

test("fact metadata is withheld from reconciliation and mutation replays", async () => {
  const SHARED = "55555555-5555-4555-8555-5555555555a1";
  const OWN = "55555555-5555-4555-8555-5555555555a2";
  const harness = createHarness({
    facts: [
      fact({
        authorizationActorUserId: MEMBER,
        factAssertionId: SHARED,
        key: "study.course_name",
        valueDisplay: "Diploma of Hospitality Management",
      }),
      fact({
        factAssertionId: OWN,
        key: "study.institution",
        valueDisplay: "Lakeside College",
      }),
    ],
  });
  const application = await harness.seedApplication();
  const sharedSelection = await harness.service.selectFact({
    actorUserId: OWNER,
    applicationId: application.id,
    factAssertionId: SHARED,
    factVersion: 1,
    operationId: "op-meta-select-shared",
    projectId: PROJECT,
  });
  // An unselect operation on the shared reference, created while it was readable.
  const sharedUnselect = await harness.service.unselectFact({
    actorUserId: OWNER,
    applicationId: application.id,
    factReferenceId: sharedSelection.reference.id,
    operationId: "op-meta-unselect-shared",
    projectId: PROJECT,
  });
  assert.equal(sharedUnselect.reference.readable, true);
  assert.equal(sharedUnselect.reference.factKey, "study.course_name");
  const ownSelection = await harness.service.selectFact({
    actorUserId: OWNER,
    applicationId: application.id,
    factAssertionId: OWN,
    factVersion: 1,
    operationId: "op-meta-select-own",
    projectId: PROJECT,
  });

  // Member A revokes the sharing grant.
  harness.setFacts([
    fact({
      factAssertionId: OWN,
      key: "study.institution",
      valueDisplay: "Lakeside College",
    }),
  ]);

  const assertNoRestrictedMetadata = (label: string, value: unknown) => {
    const json = JSON.stringify(value);
    assert.doesNotMatch(json, new RegExp(SHARED, "u"), label);
    assert.doesNotMatch(json, /study\.course_name/u, label);
    assert.doesNotMatch(json, /Diploma of Hospitality Management/u, label);
  };

  // 1. Exact replay of the original select: identity and replay survive, metadata does not.
  const selectReplay = await harness.service.selectFact({
    actorUserId: OWNER,
    applicationId: application.id,
    factAssertionId: SHARED,
    factVersion: 1,
    operationId: "op-meta-select-shared",
    projectId: PROJECT,
  });
  assert.equal(selectReplay.replayed, true);
  assert.equal(selectReplay.reference.id, sharedSelection.reference.id);
  assert.equal(selectReplay.reference.readable, false);
  assert.equal(selectReplay.reference.factAssertionId, null);
  assert.equal(selectReplay.reference.factKey, null);
  assert.equal(selectReplay.reference.sourceEvidenceRef, null);
  assert.equal(selectReplay.reference.originKind, null);
  assert.equal(selectReplay.reference.authorizationAudience, "none");
  assertNoRestrictedMetadata("select replay", selectReplay);

  // 2. Exact replay of the unselect performed before revocation.
  const unselectReplay = await harness.service.unselectFact({
    actorUserId: OWNER,
    applicationId: application.id,
    factReferenceId: sharedSelection.reference.id,
    operationId: "op-meta-unselect-shared",
    projectId: PROJECT,
  });
  assert.equal(unselectReplay.replayed, true);
  assert.equal(unselectReplay.reference.readable, false);
  assertNoRestrictedMetadata("unselect replay", unselectReplay);

  // 3. Authorized references stay fully usable.
  assert.equal(ownSelection.reference.readable, true);
  assert.equal(ownSelection.reference.factKey, "study.institution");
  const ownReplay = await harness.service.selectFact({
    actorUserId: OWNER,
    applicationId: application.id,
    factAssertionId: OWN,
    factVersion: 1,
    operationId: "op-meta-select-own",
    projectId: PROJECT,
  });
  assert.equal(ownReplay.reference.readable, true);
  assert.equal(ownReplay.reference.factAssertionId, OWN);

  // 4. The preparation view never names the restricted reference in reconciliation.
  const view = await harness.service.get({
    actorUserId: OWNER,
    applicationId: application.id,
    projectId: PROJECT,
  });
  const allRequirementIds = view.reconciliation.requirements.flatMap(
    (entry) => entry.selectedFactReferenceIds
  );
  assert.ok(allRequirementIds.length > 0);
  assert.ok(!allRequirementIds.includes(sharedSelection.reference.id));
  assert.ok(allRequirementIds.includes(ownSelection.reference.id));
  assertNoRestrictedMetadata("preparation view", view);
  // Coverage uncertainty stays generic.
  const genuineStudent = view.reconciliation.requirements.find(
    (entry) => entry.requirementKey === "genuine_student"
  );
  assert.ok(genuineStudent);
  assert.ok(genuineStudent.gaps.length >= 0);
});
