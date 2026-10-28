import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canAccessProjectHumanThread,
  canOwnerSendToCurrentLawyer,
  hashHumanMessageRequest,
  hashThreadConsentRequest,
  isProjectHumanMessagingEnabled,
  PROJECT_HUMAN_MESSAGING_NOTICE,
  PROJECT_HUMAN_MESSAGING_NOTICE_SHA256,
  PROJECT_HUMAN_MESSAGING_NOTICE_VERSION,
  PROJECT_HUMAN_MESSAGING_PURPOSE,
  parseMessagePagination,
  parseThreadPagination,
  resolveProjectHumanThreadListScope,
} from "./policy";

const authority = {
  projectId: "project-a",
  projectActive: true,
  ownerUserId: "owner-a",
  ownerEligible: true,
  threadId: "thread-a",
  threadProjectId: "project-a",
  threadActive: true,
  assignmentId: "assignment-a",
  assignmentProjectId: "project-a",
  assignmentStaffUserId: "lawyer-a",
  assignmentActive: true,
  assignedLawyerEligible: true,
  consentStatus: "active" as const,
};

const owner = {
  userId: "owner-a",
  role: "user" as const,
  nonGuest: true,
  emailVerified: false,
};
const lawyer = {
  userId: "lawyer-a",
  role: "lawyer" as const,
  nonGuest: true,
  emailVerified: true,
};

test("human messaging feature flag defaults off and is independently gated", () => {
  assert.equal(isProjectHumanMessagingEnabled(undefined), false);
  assert.equal(isProjectHumanMessagingEnabled("false"), false);
  assert.equal(isProjectHumanMessagingEnabled(" TRUE "), true);
});

test("consent notice is exact, versioned, and limited to one-to-one messages", () => {
  assert.equal(
    PROJECT_HUMAN_MESSAGING_NOTICE_VERSION,
    "m4-003-thread-participation-v1"
  );
  assert.equal(
    PROJECT_HUMAN_MESSAGING_PURPOSE,
    "one_to_one_plain_text_project_collaboration"
  );
  assert.match(PROJECT_HUMAN_MESSAGING_NOTICE_SHA256, /^[0-9a-f]{64}$/u);
  for (const protectedResource of [
    "Project Facts",
    "Documents",
    "private AI Chats",
    "member Chats",
  ]) {
    assert.ok(PROJECT_HUMAN_MESSAGING_NOTICE.includes(protectedResource));
  }
  assert.match(PROJECT_HUMAN_MESSAGING_NOTICE, /Attachments.*not permitted/u);
});

test("only the exact current owner and assigned lawyer can read and send", () => {
  assert.equal(canAccessProjectHumanThread(owner, authority, "read"), true);
  assert.equal(canOwnerSendToCurrentLawyer(owner, authority), true);
  assert.equal(canAccessProjectHumanThread(lawyer, authority, "read"), true);
  assert.equal(canAccessProjectHumanThread(lawyer, authority, "send"), true);
  for (const otherActor of [
    { ...owner, userId: "member-a" },
    { ...lawyer, userId: "lawyer-b" },
    { ...lawyer, role: "admin" as const, userId: "admin-a" },
    { ...owner, nonGuest: false, userId: "guest-a" },
  ]) {
    assert.equal(
      canAccessProjectHumanThread(otherActor, authority, "read"),
      false
    );
    assert.equal(
      canAccessProjectHumanThread(otherActor, authority, "send"),
      false
    );
  }
});

test("lawyer access ends on consent, assignment, account, or Project state change", () => {
  const changed = [
    { ...authority, consentStatus: "withdrawn" as const },
    { ...authority, assignmentActive: false },
    { ...authority, assignedLawyerEligible: false },
    { ...authority, ownerEligible: false },
    { ...authority, threadActive: false },
    { ...authority, projectActive: false },
    { ...authority, threadProjectId: "project-b" },
    { ...authority, assignmentProjectId: "project-b" },
  ];
  for (const state of changed) {
    assert.equal(canAccessProjectHumanThread(lawyer, state, "read"), false);
    assert.equal(canAccessProjectHumanThread(lawyer, state, "send"), false);
    assert.equal(canOwnerSendToCurrentLawyer(owner, state), false);
  }
  assert.equal(
    canAccessProjectHumanThread(
      { ...lawyer, emailVerified: false },
      authority,
      "read"
    ),
    false
  );
});

test("owner can retain active-Project history after assignment or consent ends", () => {
  assert.equal(
    canAccessProjectHumanThread(
      owner,
      { ...authority, consentStatus: "withdrawn", assignmentActive: false },
      "read"
    ),
    true
  );
  assert.equal(
    canAccessProjectHumanThread(
      owner,
      { ...authority, projectActive: false },
      "read"
    ),
    false
  );
  assert.equal(
    canAccessProjectHumanThread(owner, authority, "withdraw_consent"),
    true
  );
});

test("thread-list scopes are owner-only or current verified lawyer scopes", () => {
  const base = {
    projectId: "project-a",
    projectActive: true,
    ownerUserId: "owner-a",
    ownerEligible: true,
    staffEmailSha256: "a".repeat(64),
  };
  assert.deepEqual(
    resolveProjectHumanThreadListScope({ ...base, actor: owner }),
    { kind: "owner_history", projectId: "project-a" }
  );
  assert.deepEqual(
    resolveProjectHumanThreadListScope({ ...base, actor: lawyer }),
    {
      kind: "assigned_active",
      projectId: "project-a",
      lawyerUserId: "lawyer-a",
      staffEmailSha256: "a".repeat(64),
    }
  );
  for (const candidate of [
    { ...lawyer, role: "admin" as const },
    { ...lawyer, nonGuest: false },
    { ...lawyer, emailVerified: false },
  ]) {
    assert.equal(
      resolveProjectHumanThreadListScope({ ...base, actor: candidate }),
      null
    );
  }
  assert.equal(
    resolveProjectHumanThreadListScope({
      ...base,
      actor: lawyer,
      ownerEligible: false,
    }),
    null
  );
  assert.equal(
    resolveProjectHumanThreadListScope({
      ...base,
      actor: lawyer,
      projectActive: false,
    }),
    null
  );
});

test("lawyer list fixtures filter revoked, withdrawn, and foreign rows before paging", () => {
  const createdAt = (day: number) => new Date(`2026-10-${day}T00:00:00.000Z`);
  const candidates = [
    {
      id: "thread-newest-foreign",
      createdAt: createdAt(28),
      authority: { ...authority, threadProjectId: "project-b" },
    },
    {
      id: "thread-withdrawn",
      createdAt: createdAt(27),
      authority: { ...authority, consentStatus: "withdrawn" as const },
    },
    {
      id: "thread-revoked",
      createdAt: createdAt(26),
      authority: { ...authority, assignmentActive: false },
    },
    {
      id: "thread-unassigned",
      createdAt: createdAt(26),
      authority: {
        ...authority,
        assignmentStaffUserId: "lawyer-other",
        assignedLawyerEligible: false,
      },
    },
    {
      id: "thread-accessible-newer",
      createdAt: createdAt(25),
      authority,
    },
    {
      id: "thread-accessible-older",
      createdAt: createdAt(24),
      authority: { ...authority, threadId: "thread-b" },
    },
  ];
  const visible = candidates
    .filter(({ authority: candidate }) =>
      canAccessProjectHumanThread(lawyer, candidate, "read")
    )
    .sort(
      (left, right) =>
        right.createdAt.getTime() - left.createdAt.getTime() ||
        right.id.localeCompare(left.id)
    );
  const firstPage = visible.slice(0, 1);
  const secondPage = visible.slice(1, 2);
  assert.deepEqual(
    firstPage.map(({ id }) => id),
    ["thread-accessible-newer"]
  );
  assert.deepEqual(
    secondPage.map(({ id }) => id),
    ["thread-accessible-older"]
  );
  assert.equal(visible.length > 1, true);

  const onlyForeignAndDenied = candidates.filter(
    ({ id }) =>
      id !== "thread-accessible-newer" && id !== "thread-accessible-older"
  );
  assert.equal(
    onlyForeignAndDenied.filter(({ authority: candidate }) =>
      canAccessProjectHumanThread(lawyer, candidate, "read")
    ).length,
    0
  );
});

test("canonical request hashes bind message body and consent scope", () => {
  const message = {
    projectId: "project-a",
    threadId: "thread-a",
    body: "Please send the appointment time.",
  };
  assert.equal(
    hashHumanMessageRequest(message),
    hashHumanMessageRequest({ ...message })
  );
  assert.notEqual(
    hashHumanMessageRequest(message),
    hashHumanMessageRequest({ ...message, body: "Changed request." })
  );
  const consent = {
    action: "create" as const,
    assignmentId: "assignment-a",
    expectedProjectRevision: 4,
    lawyerUserId: "lawyer-a",
    noticeSha256: PROJECT_HUMAN_MESSAGING_NOTICE_SHA256,
    noticeVersion: PROJECT_HUMAN_MESSAGING_NOTICE_VERSION,
    operationId: "op-1",
    projectId: "project-a",
    purpose: PROJECT_HUMAN_MESSAGING_PURPOSE,
  };
  assert.equal(
    hashThreadConsentRequest(consent),
    hashThreadConsentRequest({ ...consent })
  );
  assert.notEqual(
    hashThreadConsentRequest(consent),
    hashThreadConsentRequest({ ...consent, lawyerUserId: "lawyer-b" })
  );
});

test("message pagination is bounded and stable", () => {
  assert.deepEqual(parseMessagePagination({}), {
    limit: 25,
    beforeSequence: undefined,
  });
  assert.deepEqual(
    parseMessagePagination({ limit: "50", beforeSequence: "6" }),
    {
      limit: 50,
      beforeSequence: 6,
    }
  );
  for (const page of [
    { limit: "0" },
    { limit: "51" },
    { limit: "NaN" },
    { beforeSequence: "0" },
    { beforeSequence: "1.5" },
  ]) {
    assert.equal(parseMessagePagination(page), null);
  }
});

test("thread pagination requires a paired stable cursor and enforces page bounds", () => {
  assert.deepEqual(parseThreadPagination({}), {
    beforeCreatedAt: undefined,
    beforeThreadId: undefined,
    limit: 25,
  });
  assert.deepEqual(
    parseThreadPagination({
      beforeCreatedAt: "2026-10-28T00:00:00.000Z",
      beforeThreadId: "123e4567-e89b-42d3-a456-426614174002",
      limit: "50",
    }),
    {
      beforeCreatedAt: "2026-10-28T00:00:00.000Z",
      beforeThreadId: "123e4567-e89b-42d3-a456-426614174002",
      limit: 50,
    }
  );
  assert.equal(
    parseThreadPagination({
      beforeThreadId: "123e4567-e89b-42d3-a456-426614174002",
    }),
    null
  );
  assert.equal(parseThreadPagination({ limit: "51" }), null);
  assert.equal(
    parseThreadPagination({
      beforeCreatedAt: "not-a-date",
      beforeThreadId: "123e4567-e89b-42d3-a456-426614174002",
    }),
    null
  );
});
