import assert from "node:assert/strict";
import { test } from "node:test";
import { hashProjectOperationRequest } from "@/lib/db/project-foundation-utils";
import { ProjectStaffAssignmentError } from "./errors";
import { createProjectStaffAssignmentHandlers } from "./http";
import {
  buildStaffAssignmentOperationRequest,
  PROJECT_STAFF_ASSIGNMENT_NOTICE_SHA256,
  PROJECT_STAFF_ASSIGNMENT_NOTICE_VERSION,
} from "./policy";

const actorId = "11111111-1111-4111-8111-111111111111";
const projectId = "22222222-2222-4222-8222-222222222222";
const assignmentId = "33333333-3333-4333-8333-333333333333";
const staffUserId = "44444444-4444-4444-8444-444444444444";
const otherProjectId = "77777777-7777-4777-8777-777777777777";
const otherStaffUserId = "88888888-8888-4888-8888-888888888888";

function claimOperation(
  records: Map<string, string>,
  actorUserId: string,
  operationId: string,
  requestHash: string
) {
  const key = `${actorUserId}:${operationId}`;
  const existingHash = records.get(key);
  if (existingHash && existingHash !== requestHash) {
    throw new ProjectStaffAssignmentError("idempotency_conflict");
  }
  records.set(key, requestHash);
  return { replayed: existingHash !== undefined };
}

function request(body?: unknown, method = "POST") {
  return new Request("https://example.test/api/project-staff", {
    method,
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function handlers(
  options: {
    enabled?: boolean;
    rateLimit?: (input: {
      actorUserId: string;
      ipAddress: string | null;
      action: Parameters<
        Parameters<typeof createProjectStaffAssignmentHandlers>[0]["rateLimit"]
      >[0]["action"];
    }) => Promise<boolean>;
    session?: { userId: string; type: "guest" | "regular" } | null;
    repository?: Record<string, unknown>;
  } = {}
) {
  const calls: Array<{ name: string; input?: unknown }> = [];
  const repository = {
    propose: (input: unknown) => {
      calls.push({ name: "propose", input });
      return Promise.resolve({ accepted: true, replayed: false });
    },
    listAdminAssignments: (input: unknown) => {
      calls.push({ name: "listAdminAssignments", input });
      return Promise.resolve([]);
    },
    listOwnerAssignments: (input: unknown) => {
      calls.push({ name: "listOwnerAssignments", input });
      return Promise.resolve([]);
    },
    listLawyerInvitations: (input: unknown) => {
      calls.push({ name: "listLawyerInvitations", input });
      return Promise.resolve([]);
    },
    getStaffShell: (input: unknown) => {
      calls.push({ name: "getStaffShell", input });
      return Promise.resolve({
        projectId,
        assignmentId,
        assignmentRole: "lawyer",
        assignmentStatus: "active",
        projectLifecycle: "active",
        createdAt: new Date("2026-10-01T00:00:00.000Z"),
        updatedAt: new Date("2026-10-02T00:00:00.000Z"),
        acceptedAt: new Date("2026-10-02T00:00:00.000Z"),
      });
    },
    transition: (input: unknown) => {
      calls.push({ name: "transition", input });
      return Promise.resolve({
        replayed: false,
        assignment: { assignmentId, assignmentStatus: "active" },
      });
    },
    ...options.repository,
  } as unknown as Parameters<
    typeof createProjectStaffAssignmentHandlers
  >[0]["repository"];
  const result = createProjectStaffAssignmentHandlers({
    authenticate: () =>
      Promise.resolve(
        options.session === undefined
          ? { userId: actorId, type: "regular" }
          : options.session
      ),
    enabled: () => options.enabled ?? true,
    schemaAvailable: () => Promise.resolve(true),
    rateLimit: options.rateLimit ?? (() => Promise.resolve(true)),
    repository,
  });
  return { handlers: result, calls };
}

test("default-off routes return indistinguishable not-found before auth or schema access", async () => {
  let authCalls = 0;
  const result = createProjectStaffAssignmentHandlers({
    authenticate: () => {
      authCalls += 1;
      return Promise.resolve(null);
    },
    enabled: () => false,
    schemaAvailable: () =>
      Promise.reject(new Error("schema must not be checked while disabled")),
    rateLimit: () => Promise.resolve(true),
    repository: {} as Parameters<
      typeof createProjectStaffAssignmentHandlers
    >[0]["repository"],
  });
  const response = await result.staffShell(
    request(undefined, "GET"),
    projectId
  );
  assert.equal(response.status, 404);
  assert.equal(authCalls, 0);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
});

test("all assignment actions require a regular authenticated session", async () => {
  const result = handlers({ session: null });
  const response = await result.handlers.lawyerInbox(request(undefined, "GET"));
  assert.equal(response.status, 401);
  assert.deepEqual(result.calls, []);

  const guest = handlers({ session: { userId: actorId, type: "guest" } });
  const guestResponse = await guest.handlers.adminPropose(
    request({ projectId, staffUserId, operationId: "proposal-1" })
  );
  assert.equal(guestResponse.status, 401);
  assert.deepEqual(guest.calls, []);
});

test("strict proposal input rejects client claimed authority and role fields", async () => {
  const result = handlers();
  const response = await result.handlers.adminPropose(
    request({
      projectId,
      staffUserId,
      operationId: "proposal-1",
      actorUserId: staffUserId,
      role: "admin",
      ownerApprovedByUserId: actorId,
    })
  );
  assert.equal(response.status, 400);
  assert.deepEqual(result.calls, []);
});

test("unknown, inaccessible, closed, and duplicate admin proposals share an empty 202", async () => {
  const result = handlers({
    repository: {
      propose: (input: unknown) => {
        const value = input as { projectId: string };
        return Promise.reject(
          new ProjectStaffAssignmentError(
            value.projectId === otherProjectId ? "forbidden" : "not_found"
          )
        );
      },
    },
  });
  const responses = await Promise.all([
    ...["closed", "duplicate"].map((suffix) =>
      result.handlers.adminPropose(
        request({ projectId, staffUserId, operationId: `proposal-${suffix}` })
      )
    ),
    result.handlers.adminPropose(
      request({
        projectId,
        staffUserId,
        operationId: "proposal-unknown",
      })
    ),
    result.handlers.adminPropose(
      request({
        projectId: otherProjectId,
        staffUserId,
        operationId: "proposal-inaccessible",
      })
    ),
  ]);
  for (const response of responses) {
    assert.equal(response.status, 202);
    assert.equal(await response.text(), "");
    assert.equal(response.headers.get("cache-control"), "private, no-store");
  }
  assert.deepEqual(
    responses.map((response) => response.status),
    [202, 202, 202, 202]
  );
});

test("admin proposal idempotency accepts identical requests and conflicts on changed project or assignee", async () => {
  const operations = new Map<string, string>();
  const result = handlers({
    repository: {
      propose: (input: unknown) => {
        const value = input as {
          actorUserId: string;
          operationId: string;
          projectId: string;
          staffUserId: string;
        };
        const requestHash = hashProjectOperationRequest({
          assignmentRole: "lawyer",
          noticeSha256: PROJECT_STAFF_ASSIGNMENT_NOTICE_SHA256,
          noticeVersion: PROJECT_STAFF_ASSIGNMENT_NOTICE_VERSION,
          projectId: value.projectId,
          purpose: "project_staff_collaboration",
          staffUserId: value.staffUserId,
        });
        const replay = claimOperation(
          operations,
          value.actorUserId,
          value.operationId,
          requestHash
        );
        return { accepted: true, replayed: replay.replayed };
      },
    },
  });

  const identical = {
    projectId,
    staffUserId,
    operationId: "proposal-replay-identical",
  };
  const first = await result.handlers.adminPropose(request(identical));
  const replay = await result.handlers.adminPropose(request(identical));
  assert.equal(first.status, 202);
  assert.equal(replay.status, 202);
  assert.equal(await replay.text(), "");

  const changedRequests = [
    {
      operationId: "proposal-replay-project",
      changed: { projectId: otherProjectId },
    },
    {
      operationId: "proposal-replay-assignee",
      changed: { staffUserId: otherStaffUserId },
    },
  ];
  for (const { operationId, changed } of changedRequests) {
    const baseline = { ...identical, operationId };
    assert.equal(
      (
        await result.handlers.adminPropose(
          request({ projectId, staffUserId, operationId })
        )
      ).status,
      202
    );
    const conflict = await result.handlers.adminPropose(
      request({ ...baseline, ...changed })
    );
    assert.equal(conflict.status, 409);
    assert.deepEqual(await conflict.json(), {
      error: "This operation ID was used with a different request.",
    });
  }
});

test("admin transition idempotency conflicts when a key is reused for another action", async () => {
  const operations = new Map<string, string>();
  const result = handlers({
    repository: {
      transition: (input: unknown) => {
        const value = input as {
          actorUserId: string;
          action: "admin_withdraw" | "admin_revoke";
          assignmentId: string;
          operationId: string;
          projectId: string;
        };
        const requestHash = hashProjectOperationRequest(
          buildStaffAssignmentOperationRequest(value)
        );
        const replay = claimOperation(
          operations,
          value.actorUserId,
          value.operationId,
          requestHash
        );
        return {
          replayed: replay.replayed,
          assignment: { assignmentId: value.assignmentId },
        };
      },
    },
  });
  const operationId = "admin-transition-replay-action";
  const first = await result.handlers.adminTransition(
    request({ projectId, action: "withdraw", operationId }),
    assignmentId
  );
  const conflict = await result.handlers.adminTransition(
    request({ projectId, action: "revoke", operationId }),
    assignmentId
  );
  assert.equal(first.status, 202);
  assert.equal(conflict.status, 409);
  assert.deepEqual(await conflict.json(), {
    error: "This operation ID was used with a different request.",
  });
});

test("admin must supply an opaque Project ID and receives only scoped records", async () => {
  const result = handlers();
  const missing = await result.handlers.adminList(
    request(undefined, "GET"),
    null
  );
  assert.equal(missing.status, 400);
  const listed = await result.handlers.adminList(
    request(undefined, "GET"),
    projectId
  );
  assert.equal(listed.status, 200);
  assert.deepEqual(result.calls[0], {
    name: "listAdminAssignments",
    input: { actorUserId: actorId, projectId },
  });
});

test("owner approval requires the exact proposal hash and notice version", async () => {
  const result = handlers();
  const response = await result.handlers.ownerTransition(
    request({
      action: "approve",
      operationId: "approve-1",
      expectedProjectRevision: 2,
    }),
    projectId,
    assignmentId
  );
  assert.equal(response.status, 400);
  assert.deepEqual(result.calls, []);
});

test("routes enforce propose, exact owner approval, lawyer acceptance, then shell", async () => {
  const ownerId = "55555555-5555-4555-8555-555555555555";
  const wrongLawyerId = "66666666-6666-4666-8666-666666666666";
  const proposalSha256 = "a".repeat(64);
  let actorUserId = actorId;
  let status: "none" | "proposed" | "owner_approved" | "active" | "declined" =
    "none";
  let revision = 10;
  const result = createProjectStaffAssignmentHandlers({
    authenticate: () =>
      Promise.resolve({ userId: actorUserId, type: "regular" }),
    enabled: () => true,
    schemaAvailable: () => Promise.resolve(true),
    rateLimit: () => Promise.resolve(true),
    repository: {
      propose: (input: unknown) => {
        assert.deepEqual(input, {
          actorUserId,
          projectId,
          staffUserId,
          operationId: "proposal-chain",
        });
        status = "proposed";
        revision += 1;
        return { accepted: true, replayed: false };
      },
      listOwnerAssignments: () => {
        if (actorUserId !== ownerId || status === "none") {
          throw new ProjectStaffAssignmentError("not_found");
        }
        return [
          {
            assignmentId,
            projectId,
            purpose: "project_staff_collaboration",
            assignmentRole: "lawyer",
            assignmentStatus: status,
            staffUserId,
            staffAccountIdentifierMasked: "l***@example.com",
            staffIdentityCurrent: true,
            noticeVersion: "m4-002-staff-assignment-notice-v1",
            notice: "owner-facing exact notice",
            proposalSha256,
            expectedProjectRevision: revision,
          },
        ];
      },
      listLawyerInvitations: () => {
        if (actorUserId !== staffUserId || status !== "owner_approved") {
          return [];
        }
        return [
          {
            assignmentId,
            projectId,
            assignmentRole: "lawyer",
            assignmentStatus: status,
            proposalSha256,
            expectedProjectRevision: revision,
          },
        ];
      },
      transition: (input: unknown) => {
        const value = input as {
          actorUserId: string;
          projectId: string;
          assignmentId: string;
          action: string;
          expectedProjectRevision: number;
          proposalSha256?: string;
        };
        assert.equal(value.projectId, projectId);
        assert.equal(value.assignmentId, assignmentId);
        assert.equal(value.expectedProjectRevision, revision);
        if (
          value.action === "owner_approve" &&
          value.actorUserId === ownerId &&
          status === "proposed" &&
          value.proposalSha256 === proposalSha256
        ) {
          status = "owner_approved";
          revision += 1;
        } else if (
          value.action === "lawyer_accept" &&
          value.actorUserId === staffUserId &&
          status === "owner_approved"
        ) {
          status = "active";
          revision += 1;
        } else {
          throw new ProjectStaffAssignmentError("not_found");
        }
        return {
          replayed: false,
          assignment: { assignmentId, projectId, assignmentStatus: status },
        };
      },
      getStaffShell: (input: { actorUserId: string; projectId: string }) => {
        if (
          input.actorUserId !== staffUserId ||
          input.projectId !== projectId ||
          status !== "active"
        ) {
          throw new ProjectStaffAssignmentError("not_found");
        }
        return {
          projectId,
          assignmentId,
          assignmentRole: "lawyer",
          assignmentStatus: "active",
          projectLifecycle: "active",
          createdAt: new Date("2026-10-01T00:00:00.000Z"),
          updatedAt: new Date("2026-10-02T00:00:00.000Z"),
          acceptedAt: new Date("2026-10-02T00:00:00.000Z"),
        };
      },
      listAdminAssignments: () => Promise.resolve([]),
    } as unknown as Parameters<
      typeof createProjectStaffAssignmentHandlers
    >[0]["repository"],
  });

  const proposed = await result.adminPropose(
    request({ projectId, staffUserId, operationId: "proposal-chain" })
  );
  assert.equal(proposed.status, 202);
  assert.equal(status, "proposed");

  actorUserId = staffUserId;
  assert.equal(
    (await result.staffShell(request(undefined, "GET"), projectId)).status,
    404
  );
  assert.deepEqual(
    await (await result.lawyerInbox(request(undefined, "GET"))).json(),
    { invitations: [] }
  );

  actorUserId = ownerId;
  const ownerList = await result.ownerList(
    request(undefined, "GET"),
    projectId
  );
  const [proposal] = (await ownerList.json()).assignments;
  assert.equal(proposal.staffUserId, staffUserId);
  const approval = await result.ownerTransition(
    request({
      action: "approve",
      operationId: "owner-approve-chain",
      expectedProjectRevision: revision,
      proposalSha256,
      noticeVersion: "m4-002-staff-assignment-notice-v1",
    }),
    projectId,
    assignmentId
  );
  assert.equal(approval.status, 200);
  assert.equal(status, "owner_approved");

  actorUserId = wrongLawyerId;
  assert.deepEqual(
    await (await result.lawyerInbox(request(undefined, "GET"))).json(),
    { invitations: [] }
  );
  assert.equal(
    (
      await result.lawyerTransition(
        request({
          projectId,
          action: "accept",
          operationId: "wrong-lawyer-accept",
          expectedProjectRevision: revision,
        }),
        assignmentId
      )
    ).status,
    404
  );
  assert.equal(
    (await result.staffShell(request(undefined, "GET"), projectId)).status,
    404
  );

  actorUserId = staffUserId;
  const inbox = await result.lawyerInbox(request(undefined, "GET"));
  const [invitation] = (await inbox.json()).invitations;
  assert.equal(invitation.projectId, projectId);
  const accepted = await result.lawyerTransition(
    request({
      projectId,
      action: "accept",
      operationId: "lawyer-accept-chain",
      expectedProjectRevision: revision,
    }),
    assignmentId
  );
  assert.equal(accepted.status, 200);
  assert.equal(status, "active");
  const shell = await result.staffShell(request(undefined, "GET"), projectId);
  assert.equal(shell.status, 200);
  const shellBody = await shell.json();
  assert.deepEqual(Object.keys(shellBody.shell).sort(), [
    "acceptedAt",
    "assignmentId",
    "assignmentRole",
    "assignmentStatus",
    "createdAt",
    "projectId",
    "projectLifecycle",
    "updatedAt",
  ]);
});

test("staff shell response is a bounded projection from the repository", async () => {
  const result = handlers();
  const response = await result.handlers.staffShell(
    request(undefined, "GET"),
    projectId
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(Object.keys(body.shell).sort(), [
    "acceptedAt",
    "assignmentId",
    "assignmentRole",
    "assignmentStatus",
    "createdAt",
    "projectId",
    "projectLifecycle",
    "updatedAt",
  ]);
  assert.equal("ownerUserId" in body.shell, false);
  assert.equal("title" in body.shell, false);
  assert.equal("documents" in body.shell, false);
  assert.equal("facts" in body.shell, false);
  assert.equal("chats" in body.shell, false);
});

test("unknown and inaccessible admin transitions share empty anti-enumeration responses", async () => {
  const result = handlers({
    repository: {
      transition: (input: unknown) => {
        const value = input as { projectId: string };
        return Promise.reject(
          new ProjectStaffAssignmentError(
            value.projectId === projectId ? "not_found" : "forbidden"
          )
        );
      },
    },
  });
  const responses = await Promise.all(
    [projectId, otherProjectId].map((requestedProjectId, index) =>
      result.handlers.adminTransition(
        request({
          projectId: requestedProjectId,
          action: "revoke",
          operationId: `revoke-${index}`,
        }),
        assignmentId
      )
    )
  );
  for (const response of responses) {
    assert.equal(response.status, 202);
    assert.equal(await response.text(), "");
  }
  assert.equal(responses[0].status, responses[1].status);
});

test("assignment rate limits deny exhausted and unavailable requests before repository access", async () => {
  let repositoryCalls = 0;
  const limited = createProjectStaffAssignmentHandlers({
    authenticate: () => Promise.resolve({ userId: actorId, type: "regular" }),
    enabled: () => true,
    schemaAvailable: () => Promise.resolve(true),
    rateLimit: () => Promise.resolve(false),
    repository: {
      propose: () => {
        repositoryCalls += 1;
        return Promise.resolve({ accepted: true, replayed: false });
      },
    } as unknown as Parameters<
      typeof createProjectStaffAssignmentHandlers
    >[0]["repository"],
  });
  const exhausted = await limited.adminPropose(
    request({ projectId, staffUserId, operationId: "limited-proposal" })
  );
  assert.equal(exhausted.status, 429);

  const unavailable = createProjectStaffAssignmentHandlers({
    authenticate: () => Promise.resolve({ userId: actorId, type: "regular" }),
    enabled: () => true,
    schemaAvailable: () => Promise.resolve(true),
    rateLimit: () => Promise.reject(new Error("limiter unavailable")),
    repository: {
      propose: () => {
        repositoryCalls += 1;
        return Promise.resolve({ accepted: true, replayed: false });
      },
    } as unknown as Parameters<
      typeof createProjectStaffAssignmentHandlers
    >[0]["repository"],
  });
  const failedClosed = await unavailable.adminPropose(
    request({ projectId, staffUserId, operationId: "limiter-failure" })
  );
  assert.equal(failedClosed.status, 503);
  assert.equal(repositoryCalls, 0);
});
