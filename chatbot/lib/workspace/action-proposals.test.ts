import assert from "node:assert/strict";
import { test } from "node:test";
import {
  resolveSchoolApplicationTarget,
  SchoolApplicationError,
} from "@/lib/school-applications/contracts";
import type { SchoolApplicationDetailView } from "@/lib/school-applications/service";
import type { Student500Context } from "@/lib/student-500/contracts";
import {
  schoolApplicationFieldsWithIntakeLabel,
  schoolApplicationTargetWithCandidate,
  student500ContextDiffersOnlyByApplicationPlace,
  student500ContextWithApplicationPlace,
} from "./action-proposal-adapters";
import {
  type ActionConfirmationClaimsV1,
  actionProposalV1Schema,
  isSingleProposalTargetRevisionAdvance,
  issueActionConfirmationToken,
  proposalFromClaims,
  verifyActionConfirmationToken,
} from "./action-proposals";
import type { ActiveStepSelectionV1 } from "./active-step-context";

const projectId = "123e4567-e89b-42d3-a456-426614174000";
const chatId = "123e4567-e89b-42d3-a456-426614174001";
const targetId = "123e4567-e89b-42d3-a456-426614174002";
const operationId = "e3-123e4567-e89b-42d3-a456-426614174003";
const actorUserId = "owner-user";
const now = 1_795_478_400_000;
const selection = {
  schemaVersion: "phase15.active-step-selection.v1" as const,
  projectId,
  taskId:
    "phase15.project-workflows.v1:school_application:school_discovery:school_application:school-a",
  workflowKind: "school_application" as const,
  definitionVersion: "phase15.project-workflows.v1" as const,
  stepKey: "school_discovery" as const,
  targetKind: "school_application" as const,
  targetId,
  sourceRevisions: [
    { targetKind: "school_application" as const, targetId, revision: 6 },
  ],
};

function claims(overrides: Partial<ActionConfirmationClaimsV1> = {}) {
  return {
    schemaVersion: "phase15.action-confirmation.v1" as const,
    actorUserId,
    projectId,
    chatId,
    targetKind: "school_application" as const,
    targetId,
    workflowKind: "school_application" as const,
    stepKey: "school_discovery" as const,
    fieldPath: "schoolApplication.intakeLabel" as const,
    oldValue: "March 2027",
    proposedValue: "July 2027",
    baseRevision: 6,
    selection,
    operationId,
    issuedAt: now,
    expiresAt: now + 600_000,
    ...overrides,
  } as ActionConfirmationClaimsV1;
}

test("confirmation token binds actor, Project, target, field, revision and expiry", () => {
  const token = issueActionConfirmationToken(claims(), "test-secret");
  assert.ok(
    verifyActionConfirmationToken({
      token,
      secret: "test-secret",
      actorUserId,
      now: now + 1,
    })
  );
  assert.equal(
    verifyActionConfirmationToken({
      token,
      secret: "test-secret",
      actorUserId: "another-user",
      now: now + 1,
    }),
    null
  );
  assert.equal(
    verifyActionConfirmationToken({
      token: `${token.slice(0, -1)}x`,
      secret: "test-secret",
      actorUserId,
      now: now + 1,
    }),
    null
  );
  assert.equal(
    verifyActionConfirmationToken({
      token,
      secret: "test-secret",
      actorUserId,
      now: now + 600_000,
    }),
    null
  );
  assert.throws(() => issueActionConfirmationToken(claims(), "  "));
});

test("claim schema rejects a token whose embedded selection targets a different record", () => {
  const tampered = {
    ...claims(),
    targetId: chatId,
  };
  assert.equal(
    verifyActionConfirmationToken({
      token: issueActionConfirmationToken(claims(), "test-secret"),
      secret: "test-secret",
      actorUserId,
      now: now + 1,
    })?.targetId,
    targetId
  );
  assert.throws(() =>
    issueActionConfirmationToken(
      tampered as ActionConfirmationClaimsV1,
      "test-secret"
    )
  );
});

test("typed School proposal reports one allowlisted field and binds the exact old revision", () => {
  const proposal = proposalFromClaims(claims(), {
    assumptions: ["Customer-entered value."],
    affectedDependencies: ["Package freshness is re-evaluated."],
  });
  assert.ok("fieldPath" in proposal);
  assert.equal(proposal.fieldPath, "schoolApplication.intakeLabel");
  assert.equal(proposal.targetId, targetId);
  assert.equal(proposal.baseRevision, 6);
  assert.equal(proposal.status, "awaiting_confirmation");
  assert.equal(actionProposalV1Schema.safeParse(proposal).success, true);
  assert.equal(
    actionProposalV1Schema.safeParse({ ...proposal, fieldPath: "users.role" })
      .success,
    false
  );
});

test("whole-object adapters preserve School target fields and Student 500 context", () => {
  const school = {
    institution: { name: "Northbridge", catalogId: "institution-1" },
    course: { title: "Recorded course", catalogId: "course-1" },
    deliveryId: "delivery-1",
    intake: { id: "intake-1", label: "March 2027" },
  } as SchoolApplicationDetailView;
  assert.deepEqual(
    schoolApplicationFieldsWithIntakeLabel(school, "July 2027"),
    {
      institutionName: "Northbridge",
      institutionId: "institution-1",
      courseTitle: "Recorded course",
      courseId: "course-1",
      deliveryId: "delivery-1",
      intakeId: "intake-1",
      intakeLabel: "July 2027",
    }
  );

  const before: Student500Context = {
    applicantAgeBand: "under_18",
    applicationPlace: "unknown",
    asOfDate: "2026-11-24",
    coeStatus: "reported_not_held",
    currentVisaSubclass: "600",
    dependants: "one_or_more",
    englishEvidence: "reported_held",
    entryRoute: "offer_only",
    financialEvidence: "reported_not_held",
    historyDeclaration: "declared_some",
    historyFlags: [{ flag: "prior_visa_refusal", reportedOn: "2020-02-03" }],
    oshcEvidence: "unknown",
    schoolApplicationId: targetId,
  };
  const after = student500ContextWithApplicationPlace(before, "offshore");
  assert.equal(after.applicationPlace, "offshore");
  assert.equal(
    student500ContextDiffersOnlyByApplicationPlace(before, after, "offshore"),
    true
  );
  assert.equal(
    student500ContextDiffersOnlyByApplicationPlace(
      before,
      { ...after, coeStatus: "unknown" },
      "offshore"
    ),
    false
  );
});

test("course candidate always becomes a normalized customer-reported School target", () => {
  const scenarios = [
    {
      institutionName: "Example University",
      courseTitle: "New Course",
      intakeLabel: null,
    },
    {
      institutionName: "Example University",
      courseTitle: "Existing Course",
      intakeLabel: "March 2027",
    },
    {
      institutionName: "Example University",
      courseTitle: "Existing Course",
      intakeLabel: "July 2027",
    },
    {
      institutionName: "Another University",
      courseTitle: "Existing Course",
      intakeLabel: null,
    },
  ];
  for (const scenario of scenarios) {
    const target = schoolApplicationTargetWithCandidate(scenario);
    assert.deepEqual(target, {
      ...scenario,
      institutionName: scenario.institutionName,
      institutionId: null,
      courseTitle: scenario.courseTitle,
      courseId: null,
      deliveryId: null,
      intakeId: null,
    });
    const businessTarget = resolveSchoolApplicationTarget({
      fields: target,
      resolution: { status: "unresolved" },
    });
    assert.equal(businessTarget.sourceStatus, "unverified_customer_declared");
    assert.deepEqual(businessTarget.target, target);
  }

  const normalized = schoolApplicationTargetWithCandidate({
    institutionName: "  Example   University ",
    courseTitle: "  Master of\u3000Example Studies ",
    intakeLabel: "  July   2027 ",
  });
  assert.equal(normalized.institutionName, "Example University");
  assert.equal(normalized.courseTitle, "Master of Example Studies");
  assert.equal(normalized.intakeLabel, "July 2027");
  assert.throws(
    () =>
      schoolApplicationTargetWithCandidate({
        institutionName: "Example University",
        courseTitle: "x".repeat(201),
        intakeLabel: null,
      }),
    SchoolApplicationError
  );
});

test("confirmation replay accepts only one exact target revision increment", () => {
  const original: ActiveStepSelectionV1 = {
    ...selection,
    sourceRevisions: [
      { targetKind: "school_application", targetId, revision: 6 },
      {
        targetKind: "school_application",
        targetId: "123e4567-e89b-42d3-a456-426614174009",
        revision: 3,
      },
    ],
  };
  const input = {
    original,
    targetKind: "school_application",
    targetId,
    baseRevision: 6,
  } as const;
  assert.equal(
    isSingleProposalTargetRevisionAdvance({
      ...input,
      current: [
        { ...original.sourceRevisions[0], revision: 7 },
        original.sourceRevisions[1],
      ],
    }),
    true
  );
  assert.equal(
    isSingleProposalTargetRevisionAdvance({
      ...input,
      current: [
        { ...original.sourceRevisions[0], revision: 8 },
        original.sourceRevisions[1],
      ],
    }),
    false
  );
  assert.equal(
    isSingleProposalTargetRevisionAdvance({
      ...input,
      current: [
        { ...original.sourceRevisions[0], revision: 7 },
        { ...original.sourceRevisions[1], revision: 4 },
      ],
    }),
    false
  );
  assert.equal(
    isSingleProposalTargetRevisionAdvance({
      ...input,
      current: [original.sourceRevisions[0]],
    }),
    false
  );
});
