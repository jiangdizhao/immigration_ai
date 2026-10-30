import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SchoolApplicationsPanel } from "@/components/school-applications-panel";
import { getWorkspaceCopy } from "@/lib/workspace-copy";
import {
  buildSchoolApplicationCreateBody,
  buildSchoolApplicationReferenceBody,
  buildSchoolApplicationUpdateBody,
  classifySchoolApplicationError,
  createSchoolApplicationsController,
  parseSchoolApplication,
  schoolApplicationStatusLabelKey,
} from "./school-applications";

const projectId = "22222222-2222-4222-8222-222222222201";
const applicationId = "44444444-4444-4444-8444-444444444401";
const referenceRecordId = "55555555-5555-4555-8555-555555555501";
const factId = "33333333-3333-4333-8333-333333333301";

function payload(overrides: Record<string, unknown> = {}) {
  return {
    applicationId,
    archivedAt: null,
    course: { catalogId: null, title: "Bachelor of Nursing" },
    createdAt: "2026-10-30T00:00:00.000Z",
    currentPackage: null,
    deliveryId: null,
    disclosures: ["not_a_school_submission"],
    institution: {
      catalogId: null,
      catalogRecordClass: null,
      catalogSnapshotToken: null,
      name: "Example University",
    },
    intake: { id: null, label: "February 2027" },
    missingDataCodes: ["source_not_independently_verified"],
    packageStale: false,
    packages: [],
    projectId,
    referenceCheckPerformed: true,
    references: [],
    revision: 1,
    source: {
      catalogRecordClass: null,
      catalogSnapshotToken: null,
      independentlyVerified: false,
      status: "unverified_customer_declared",
    },
    staleReasonCodes: [],
    status: "draft",
    updatedAt: "2026-10-30T00:00:00.000Z",
    ...overrides,
  };
}

type Recorded = {
  url: string;
  method: string;
  body: unknown;
};

function fakeFetch(
  responder: (request: Recorded) => { status: number; body: unknown }
) {
  const calls: Recorded[] = [];
  const fetchImpl = (
    input: string | URL | Request,
    init?: RequestInit
  ): Promise<Response> => {
    const recorded: Recorded = {
      body: init?.body ? JSON.parse(String(init.body)) : null,
      method: init?.method ?? "GET",
      url: String(input),
    };
    calls.push(recorded);
    const result = responder(recorded);
    return Promise.resolve(
      Response.json(result.body, { status: result.status })
    );
  };
  return { calls, fetchImpl };
}

test("strict parsing rejects tampered or unexpected application payloads", () => {
  const parsed = parseSchoolApplication(payload());
  assert.equal(parsed?.applicationId, applicationId);
  assert.equal(parsed?.sourceStatus, "unverified_customer_declared");

  assert.equal(parseSchoolApplication(null), null);
  assert.equal(
    parseSchoolApplication({ ...payload(), status: "approved" }),
    null
  );
  assert.equal(
    parseSchoolApplication({
      ...payload(),
      source: { ...payload().source, status: "verified" },
    }),
    null
  );
  assert.equal(
    parseSchoolApplication({ ...payload(), references: [{ bogus: true }] }),
    null
  );
  assert.equal(
    parseSchoolApplication({
      ...payload(),
      packages: [{ packageId: "x", version: 1, status: "current" }],
    }),
    null
  );
  assert.equal(parseSchoolApplication({ ...payload(), revision: "1" }), null);
});

test("status labels and HTTP error classification are exhaustive", () => {
  assert.equal(schoolApplicationStatusLabelKey("draft"), "statusDraft");
  assert.equal(
    schoolApplicationStatusLabelKey("package_prepared"),
    "statusPackagePrepared"
  );
  assert.equal(schoolApplicationStatusLabelKey("stale"), "statusStale");
  assert.equal(schoolApplicationStatusLabelKey("archived"), "statusArchived");
  assert.equal(classifySchoolApplicationError(401), "authentication_required");
  assert.equal(classifySchoolApplicationError(404), "not_found");
  assert.equal(classifySchoolApplicationError(409), "state_changed");
  assert.equal(classifySchoolApplicationError(400), "invalid_request");
  assert.equal(classifySchoolApplicationError(503), "unavailable");
  assert.equal(classifySchoolApplicationError(500), "request_failed");
});

test("request bodies carry only customer-editable target fields", () => {
  const draft = {
    courseId: null,
    courseTitle: "Bachelor of Nursing",
    deliveryId: null,
    institutionId: null,
    institutionName: "Example University",
    intakeId: null,
    intakeLabel: "February 2027",
  };
  const create = buildSchoolApplicationCreateBody({
    draft,
    operationId: "op-1",
  });
  assert.deepEqual(Object.keys(create).sort(), [
    "courseId",
    "courseTitle",
    "deliveryId",
    "institutionId",
    "institutionName",
    "intakeId",
    "intakeLabel",
    "operationId",
  ]);
  const update = buildSchoolApplicationUpdateBody({
    draft,
    expectedRevision: 4,
    operationId: "op-2",
  });
  assert.equal(update.expectedRevision, 4);
  const reference = buildSchoolApplicationReferenceBody({
    expectedRevision: 5,
    kind: "fact",
    operationId: "op-3",
    referenceId: factId,
  });
  assert.deepEqual(reference, {
    expectedRevision: 5,
    kind: "fact",
    operationId: "op-3",
    referenceId: factId,
  });
  const serialized = JSON.stringify([create, update, reference]);
  for (const forbidden of [
    "actorUserId",
    "ownerUserId",
    '"status"',
    '"revision":',
  ]) {
    assert.ok(!serialized.includes(forbidden), forbidden);
  }
});

test("the controller drives three concurrent applications through the real endpoints", async () => {
  let counter = 0;
  const { calls, fetchImpl } = fakeFetch((request) => {
    if (
      request.method === "GET" &&
      request.url.endsWith("/school-applications")
    ) {
      return {
        body: {
          applications: [
            payload({ applicationId: `${applicationId.slice(0, -1)}1` }),
            payload({
              applicationId: `${applicationId.slice(0, -1)}2`,
              course: { catalogId: null, title: "Master of Data Science" },
              institution: {
                catalogId: null,
                catalogRecordClass: null,
                catalogSnapshotToken: null,
                name: "Second University",
              },
            }),
            payload({
              applicationId: `${applicationId.slice(0, -1)}3`,
              intake: { id: null, label: "July 2027" },
            }),
          ],
        },
        status: 200,
      };
    }
    if (request.method === "GET") {
      return {
        body: {
          application: payload({
            currentPackage: {
              contentSha256: "a".repeat(64),
              createdAt: "2026-10-30T00:00:00.000Z",
              inputsSha256: "b".repeat(64),
              integrityVerified: true,
              packageId: referenceRecordId,
              staleReasonCodes: [],
              status: "current",
              targetBindingSha256: "c".repeat(64),
              usable: true,
              version: 1,
            },
            packages: [
              {
                contentSha256: "a".repeat(64),
                createdAt: "2026-10-30T00:00:00.000Z",
                inputsSha256: "b".repeat(64),
                integrityVerified: true,
                packageId: referenceRecordId,
                staleReasonCodes: [],
                status: "current",
                targetBindingSha256: "c".repeat(64),
                usable: true,
                version: 1,
              },
            ],
            revision: 3,
            status: "package_prepared",
          }),
        },
        status: 200,
      };
    }
    return {
      body: { application: payload({ revision: 2 }), replayed: false },
      status: 201,
    };
  });
  const controller = createSchoolApplicationsController({
    fetchImpl,
    newOperationId: () => `op-${++counter}`,
  });

  assert.equal(await controller.load(projectId), null);
  assert.equal(controller.getSnapshot().applications.length, 3);

  assert.equal(
    await controller.open(projectId, `${applicationId.slice(0, -1)}1`),
    null
  );
  assert.equal(controller.getSnapshot().detail?.revision, 3);
  assert.equal(controller.getSnapshot().detail?.currentPackage?.version, 1);

  const detail = controller.getSnapshot().detail;
  assert.ok(detail);

  const draft = {
    courseId: null,
    courseTitle: "Bachelor of Nursing",
    deliveryId: null,
    institutionId: null,
    institutionName: "Example University",
    intakeId: null,
    intakeLabel: "February 2027",
  };
  assert.equal(await controller.create(projectId, draft), null);
  assert.equal(
    await controller.update(projectId, detail, {
      ...draft,
      courseTitle: "Bachelor of Nursing (Honours)",
    }),
    null
  );
  assert.equal(await controller.buildPackage(projectId, detail), null);
  assert.equal(await controller.archive(projectId, detail), null);
  assert.equal(
    await controller.bindReference(projectId, detail, {
      kind: "fact",
      referenceId: factId,
    }),
    null
  );
  assert.equal(
    await controller.revokeReference(projectId, detail, referenceRecordId),
    null
  );

  const mutations = calls.filter((call) => call.method !== "GET");
  assert.deepEqual(
    mutations.map(
      (call) => `${call.method} ${call.url.replace(projectId, ":project")}`
    ),
    [
      "POST /api/projects/:project/school-applications",
      `PATCH /api/projects/:project/school-applications/${applicationId}`,
      `POST /api/projects/:project/school-applications/${applicationId}/packages`,
      `POST /api/projects/:project/school-applications/${applicationId}/archive`,
      `POST /api/projects/:project/school-applications/${applicationId}/references`,
      `POST /api/projects/:project/school-applications/${applicationId}/references/${referenceRecordId}/revoke`,
    ]
  );
  for (const call of mutations) {
    const body = call.body as Record<string, unknown>;
    assert.equal(typeof body.operationId, "string");
    assert.ok(!("actorUserId" in body));
    assert.ok(!("projectId" in body));
    assert.ok(!("status" in body));
  }
  assert.equal(
    (mutations[1]?.body as { expectedRevision: number }).expectedRevision,
    3
  );
});

test("controller surfaces server denials without inventing local state", async () => {
  const denied = fakeFetch(() => ({
    body: { error: "School application not found." },
    status: 404,
  }));
  const controller = createSchoolApplicationsController({
    fetchImpl: denied.fetchImpl,
    newOperationId: () => "op-x",
  });
  assert.equal(await controller.load(projectId), "not_found");
  assert.equal(controller.getSnapshot().error, "not_found");
  assert.deepEqual(controller.getSnapshot().applications, []);

  const conflicts = fakeFetch(() => ({
    body: { error: "School application state changed." },
    status: 409,
  }));
  const second = createSchoolApplicationsController({
    fetchImpl: conflicts.fetchImpl,
    newOperationId: () => "op-y",
  });
  const detail = parseSchoolApplication(payload());
  assert.ok(detail);
  assert.equal(
    await second.update(projectId, detail, {
      courseId: null,
      courseTitle: "Changed",
      deliveryId: null,
      institutionId: null,
      institutionName: "Example University",
      intakeId: null,
      intakeLabel: null,
    }),
    "state_changed"
  );
  assert.equal(second.getSnapshot().detail, null);

  const authRequired = fakeFetch(() => ({
    body: { error: "Authentication required." },
    status: 401,
  }));
  const third = createSchoolApplicationsController({
    fetchImpl: authRequired.fetchImpl,
    newOperationId: () => "op-z",
  });
  assert.equal(await third.load(projectId), "authentication_required");
});

test("the School Application panel is absent when the flag is OFF and bilingual when ON", () => {
  for (const locale of ["zh-CN", "en"] as const) {
    const copy = getWorkspaceCopy(locale).schoolApplications;
    const hidden = renderToStaticMarkup(
      React.createElement(SchoolApplicationsPanel, {
        copy,
        enabled: false,
        projectId,
      })
    );
    assert.equal(hidden, "");

    const markup = renderToStaticMarkup(
      React.createElement(SchoolApplicationsPanel, {
        copy,
        enabled: true,
        projectId,
      })
    );
    assert.match(markup, /data-testid="school-applications-panel"/u);
    assert.ok(markup.includes(copy.title));
    assert.ok(markup.includes(copy.notice));
    assert.ok(markup.includes(copy.create));
    assert.ok(markup.includes(copy.empty));
    // Detail-only preparation actions appear once an application is selected, and
    // are therefore absent from the empty first render.
    assert.ok(!markup.includes(copy.buildPackage));
    for (const forbidden of [
      "Submitted",
      "Approved",
      "Offer received",
      "CoE issued",
    ]) {
      assert.ok(!markup.includes(forbidden), forbidden);
    }
  }
  // Chinese remains the default locale for this surface.
  assert.equal(
    getWorkspaceCopy("zh-CN").schoolApplications.title,
    "我的学校申请"
  );
});
