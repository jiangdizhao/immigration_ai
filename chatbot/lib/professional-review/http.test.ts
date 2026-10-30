import assert from "node:assert/strict";
import { test } from "node:test";
import { denyAllProfessionalReviewAuthority } from "./authority";
import { createProfessionalReviewHandlers } from "./http";
import { createProfessionalReviewService } from "./service";
import { createInMemoryProfessionalReviewStore } from "./store";
import {
  createSyntheticManagedTargetProvider,
  createSyntheticProfessionalCredentialVerifier,
  createSyntheticProfessionalReviewAuthority,
} from "./synthetic-authorities";

/**
 * REV-10 and the bounded HTTP contract: authentication, feature gate, project
 * scoping, body validation and non-disclosure of unauthorized records.
 */
const PROJECT = "11111111-1111-4111-8111-111111111111";
const REVIEWER = "22222222-2222-4222-8222-222222222222";
const STRANGER = "33333333-3333-4333-8333-333333333333";
const TARGET_ID = "school-package-001";
const TARGET_KIND = "managed_school_application";
const HASH = "a".repeat(64);
const IDENTITY = {
  projectId: PROJECT,
  targetId: TARGET_ID,
  targetKind: TARGET_KIND as "managed_school_application",
  targetSha256: HASH,
  targetVersion: 3,
};

function handlers(
  options: {
    enabled?: boolean;
    session?: { userId: string } | null;
    authority?: "synthetic" | "deny_all";
    rateLimit?: boolean;
    scopedActors?: readonly string[];
  } = {}
) {
  const scoped = options.scopedActors ?? [REVIEWER];
  const service = createProfessionalReviewService({
    authority:
      options.authority === "deny_all"
        ? denyAllProfessionalReviewAuthority
        : createSyntheticProfessionalReviewAuthority({
            scopes: scoped.map((actorUserId) => ({
              actions: [
                "request_review",
                "record_decision",
                "read_review",
              ] as const,
              actorUserId,
              projectId: PROJECT,
              targetId: TARGET_ID,
              targetKind: IDENTITY.targetKind,
              targetVersion: 3,
            })),
          }),
    credentialVerifier: createSyntheticProfessionalCredentialVerifier({
      mode: "verified",
      verifiedActorUserIds: scoped,
    }),
    now: () => new Date("2026-10-30T00:00:00.000Z"),
    store: createInMemoryProfessionalReviewStore(),
    targetProvider: createSyntheticManagedTargetProvider({
      fixtures: [{ identity: IDENTITY }],
    }),
  });
  return createProfessionalReviewHandlers({
    actorContext: async ({ actorUserId }) => ({
      actorRole: "lawyer",
      reviewerAssignmentId: "assignment-1",
      reviewerAssignmentStatus: actorUserId === REVIEWER ? "active" : "missing",
    }),
    authenticate: async () =>
      options.session === undefined ? { userId: REVIEWER } : options.session,
    enabled: () => options.enabled ?? true,
    rateLimit: async () => options.rateLimit ?? true,
    service,
  });
}

function createBody(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    operationId: "op-create-1",
    reviewPurpose: "managed_handoff_authorization",
    reviewScope: ["eligibility_review"],
    targetId: TARGET_ID,
    targetKind: TARGET_KIND,
    targetSha256: HASH,
    targetVersion: 3,
    ...overrides,
  });
}

function post(body: unknown) {
  return new Request(
    `http://localhost/api/projects/${PROJECT}/professional-reviews`,
    {
      body: typeof body === "string" ? body : JSON.stringify(body),
      headers: { "content-type": "application/json" },
      method: "POST",
    }
  );
}

test("REV-10: unauthenticated, disabled and malformed calls disclose nothing", async () => {
  const unauthenticated = handlers({ session: null });
  const anonymous = await unauthenticated.createReviewRequest(
    post(createBody()),
    PROJECT
  );
  assert.equal(anonymous.status, 401);

  const disabled = handlers({ enabled: false });
  const hidden = await disabled.createReviewRequest(
    post(createBody()),
    PROJECT
  );
  assert.equal(hidden.status, 404);

  const ok = handlers();
  const badProject = await ok.createReviewRequest(
    post(createBody()),
    "not-a-uuid"
  );
  assert.equal(badProject.status, 404);

  const badBody = await ok.createReviewRequest(
    post({ anything: true }),
    PROJECT
  );
  assert.equal(badBody.status, 400);

  const unknownKind = await ok.createReviewRequest(
    post(createBody({ targetKind: "visa_application" })),
    PROJECT
  );
  assert.equal(unknownKind.status, 400);

  const wrongTarget = await ok.createReviewRequest(
    post(createBody({ targetVersion: 9 })),
    PROJECT
  );
  assert.equal(wrongTarget.status, 409);

  const throttle = handlers({ rateLimit: false });
  assert.equal(
    (await throttle.createReviewRequest(post(createBody()), PROJECT)).status,
    429
  );
});

test("REV-02/REV-10: the production composition refuses everything", async () => {
  const production = handlers({ authority: "deny_all" });
  const response = await production.createReviewRequest(
    post(createBody()),
    PROJECT
  );
  assert.equal(response.status, 503);
  const payload = (await response.json()) as Record<string, unknown>;
  assert.deepEqual(Object.keys(payload), ["error"]);
});

test("an authorized reviewer can create, decide and read a bounded projection", async () => {
  const api = handlers();
  const created = await api.createReviewRequest(post(createBody()), PROJECT);
  assert.equal(created.status, 201);
  const createdBody = (await created.json()) as Record<string, unknown>;
  assert.equal(createdBody.state, "requested");
  assert.equal(createdBody.revision, 1);
  const reviewRequestId = createdBody.reviewRequestId as string;
  assert.equal(typeof reviewRequestId, "string");

  const replay = await api.createReviewRequest(post(createBody()), PROJECT);
  assert.equal(replay.status, 200);
  assert.equal(
    ((await replay.json()) as Record<string, unknown>).reviewRequestId,
    reviewRequestId
  );

  const decide = (body: Record<string, unknown>) =>
    api.recordDecision(
      new Request(
        `http://localhost/api/projects/${PROJECT}/professional-reviews/${reviewRequestId}/decisions`,
        {
          body: JSON.stringify(body),
          headers: { "content-type": "application/json" },
          method: "POST",
        }
      ),
      PROJECT,
      reviewRequestId
    );

  const started = await decide({
    action: "start_review",
    boundTargetSha256: HASH,
    boundTargetVersion: 3,
    expectedRevision: 1,
    operationId: "op-start-1",
  });
  assert.equal(started.status, 200);
  assert.equal(
    ((await started.json()) as Record<string, unknown>).state,
    "in_review"
  );

  const approved = await decide({
    action: "approve",
    boundTargetSha256: HASH,
    boundTargetVersion: 3,
    comment: "synthetic note that must not be echoed",
    expectedRevision: 2,
    operationId: "op-approve-1",
  });
  assert.equal(approved.status, 200);

  const stale = await decide({
    action: "approve",
    boundTargetSha256: HASH,
    boundTargetVersion: 3,
    expectedRevision: 2,
    operationId: "op-approve-2",
  });
  assert.equal(stale.status, 409);

  const read = await api.getReview(
    new Request(
      `http://localhost/api/projects/${PROJECT}/professional-reviews/${reviewRequestId}`
    ),
    PROJECT,
    reviewRequestId
  );
  assert.equal(read.status, 200);
  const readBody = (await read.json()) as Record<string, unknown>;
  const serialized = JSON.stringify(readBody);
  assert.equal(serialized.includes("synthetic note"), false);
  assert.equal(/content|packageText|document/i.test(serialized), false);
  assert.equal(
    (readBody.decision as Record<string, unknown>).action,
    "approve"
  );

  const history = await api.getReviewHistory(
    new Request(
      `http://localhost/api/projects/${PROJECT}/professional-reviews/${reviewRequestId}/history`
    ),
    PROJECT,
    reviewRequestId
  );
  assert.equal(history.status, 200);
  const rows = ((await history.json()) as { history: unknown[] }).history;
  assert.equal(rows.length, 3);

  // A stranger is refused and cannot distinguish absence from denial.
  const stranger = handlers({ session: { userId: STRANGER } });
  const denied = await stranger.getReview(
    new Request(
      `http://localhost/api/projects/${PROJECT}/professional-reviews/${reviewRequestId}`
    ),
    PROJECT,
    reviewRequestId
  );
  assert.ok([403, 404].includes(denied.status));
  assert.deepEqual(
    Object.keys((await denied.json()) as Record<string, unknown>),
    ["error"]
  );
});
