import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  SchoolApplicationLinkField,
  Student500Panel,
} from "@/components/student-500-panel";
import {
  normalizeStudent500Context,
  STUDENT_500_DISCLOSURE_CODES,
  STUDENT_500_HISTORY_FLAGS,
  STUDENT_500_HUMAN_REVIEW_REASONS,
  STUDENT_500_MISSING_FACT_CODES,
  STUDENT_500_NEXT_ACTIONS,
  STUDENT_500_REASON_CODES,
  STUDENT_500_REQUIREMENT_KEYS,
  type Student500ContextInput,
} from "@/lib/student-500/contracts";
import { createDeclaredStudent500LegalSourceProvider } from "@/lib/student-500/legal-source-provider";
import { resolveStudent500Screening } from "@/lib/student-500/requirement-resolver";
import { getWorkspaceCopy } from "@/lib/workspace-copy";
import {
  buildStudent500CreateBody,
  buildStudent500UpdateBody,
  classifyStudent500Error,
  createStudent500Controller,
  EMPTY_STUDENT_500_DRAFT,
  loadLinkableSchoolApplications,
  parseStudent500Application,
  parseStudent500Detail,
  type Student500Draft,
} from "./student-500";

/**
 * Phase 13 M6.1 Project UI/transport tests (offline, no browser).
 *
 * The response fixtures are produced by the real resolver, so the client parser is
 * tested against the actual server shape rather than a hand-written guess.
 */

const projectId = "22222222-2222-4222-8222-222222222201";
const applicationId = "44444444-4444-4444-8444-444444444401";

const fullContext: Student500ContextInput = {
  applicantAgeBand: "adult",
  applicationPlace: "onshore",
  asOfDate: "2026-11-03",
  coeStatus: "reported_held",
  currentVisaSubclass: "500",
  dependants: "none",
  englishEvidence: "reported_held",
  entryRoute: "existing_coe",
  financialEvidence: "reported_held",
  historyDeclaration: "declared_none",
  oshcEvidence: "reported_held",
};

async function serverPayload(
  input: Student500ContextInput = fullContext,
  overrides: Record<string, unknown> = {}
) {
  const context = normalizeStudent500Context(input);
  const screening = await resolveStudent500Screening({
    context,
    provider: createDeclaredStudent500LegalSourceProvider(),
  });
  return {
    applicationId,
    archivedAt: null,
    context,
    createdAt: "2026-11-03T00:00:00.000Z",
    events: [
      {
        applicationRevision: 1,
        createdAt: "2026-11-03T00:00:00.000Z",
        eventType: "student_500_created",
        subjectId: applicationId,
        subjectKind: "student_500_application",
      },
    ],
    projectId,
    revision: 1,
    screening,
    status: "draft",
    updatedAt: "2026-11-03T00:00:00.000Z",
    ...overrides,
  };
}

test("the client parses the real server payload and rejects tampering", async () => {
  const payload = await serverPayload();
  const parsed = parseStudent500Detail(payload);
  assert.ok(parsed);
  assert.equal(parsed.applicationId, applicationId);
  assert.equal(parsed.screening.submissionStatus, "not_submission_ready");
  assert.equal(parsed.screening.requirements.length, 14);

  assert.equal(parseStudent500Detail(null), null);
  assert.equal(parseStudent500Detail({ ...payload, status: "approved" }), null);
  assert.equal(
    parseStudent500Detail({
      ...payload,
      screening: { ...payload.screening, submissionStatus: "ready" },
    }),
    null
  );
  assert.equal(
    parseStudent500Detail({
      ...payload,
      screening: {
        ...payload.screening,
        requirements: [{ ...payload.screening.requirements[0], status: "met" }],
      },
    }),
    null
  );
  assert.equal(
    parseStudent500Detail({
      ...payload,
      screening: {
        ...payload.screening,
        requirements: [
          {
            ...payload.screening.requirements[0],
            sourceVerification: "verified",
          },
        ],
      },
    }),
    null
  );
  assert.equal(parseStudent500Detail({ ...payload, revision: "1" }), null);
  assert.equal(
    parseStudent500Application({
      ...payload,
      context: { ...payload.context, entryRoute: "magic" },
    }),
    null
  );
});

test("request bodies carry only authored fields", () => {
  const create = buildStudent500CreateBody({
    draft: { ...EMPTY_STUDENT_500_DRAFT, applicationPlace: "offshore" },
    operationId: "op-ui-1",
  });
  assert.deepEqual(Object.keys(create).sort(), ["context", "operationId"]);
  const update = buildStudent500UpdateBody({
    draft: EMPTY_STUDENT_500_DRAFT,
    expectedRevision: 3,
    operationId: "op-ui-2",
  });
  assert.equal(update.expectedRevision, 3);
  const serialized = JSON.stringify(create);
  for (const forbidden of [
    "ownerUserId",
    "applicantUserId",
    "projectId",
    "verified",
  ]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});

test("HTTP errors map to bounded client states", () => {
  assert.equal(classifyStudent500Error(401), "authentication_required");
  assert.equal(classifyStudent500Error(404), "not_found");
  assert.equal(classifyStudent500Error(409), "state_changed");
  assert.equal(classifyStudent500Error(400), "invalid_request");
  assert.equal(classifyStudent500Error(503), "unavailable");
  assert.equal(classifyStudent500Error(500), "request_failed");
});

type Recorded = { url: string; method: string; body: unknown };

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

test("the controller drives the real journey: create, list, reopen, update", async () => {
  const payload = await serverPayload();
  let revision = 1;
  const { calls, fetchImpl } = fakeFetch((request) => {
    if (request.method === "GET") {
      // Detail reads address one application; the list read addresses the Project.
      return request.url.endsWith(applicationId)
        ? { body: { application: { ...payload, revision } }, status: 200 }
        : { body: { applications: [{ ...payload, revision }] }, status: 200 };
    }
    if (request.method === "POST") {
      return {
        body: { application: { ...payload, revision }, replayed: false },
        status: 201,
      };
    }
    if (request.method === "PATCH") {
      revision += 1;
      return {
        body: { application: { ...payload, revision }, replayed: false },
        status: 200,
      };
    }
    return { body: {}, status: 500 };
  });
  const newOperationId = () => "op-fixed";
  const controller = createStudent500Controller({ fetchImpl, newOperationId });

  assert.equal(await controller.load(projectId), null);
  assert.equal(controller.getSnapshot().applications.length, 1);
  assert.equal(
    calls[0]?.url,
    `/api/projects/${projectId}/student-500-applications`
  );

  assert.equal(
    await controller.create(projectId, EMPTY_STUDENT_500_DRAFT),
    null
  );
  assert.equal(controller.getSnapshot().detail?.applicationId, applicationId);
  const createCall = calls.find((call) => call.method === "POST");
  assert.deepEqual(Object.keys(createCall?.body as object).sort(), [
    "context",
    "operationId",
  ]);

  const current = controller.getSnapshot().detail;
  assert.ok(current);
  assert.equal(await controller.open(projectId, applicationId), null);
  assert.equal(controller.getSnapshot().loadingDetail, false);

  assert.equal(
    await controller.update(projectId, current, EMPTY_STUDENT_500_DRAFT),
    null
  );
  assert.equal(controller.getSnapshot().detail?.revision, 2);
  const patchCall = calls.find((call) => call.method === "PATCH");
  assert.equal(
    (patchCall?.body as { expectedRevision: number }).expectedRevision,
    1
  );
});

test("a server error becomes a bounded client error, never a fake success", async () => {
  const { fetchImpl } = fakeFetch(() => ({ body: {}, status: 409 }));
  const controller = createStudent500Controller({ fetchImpl });
  assert.equal(await controller.load(projectId), "state_changed");
  assert.equal(controller.getSnapshot().error, "state_changed");
  assert.equal(controller.getSnapshot().applications.length, 0);

  const malformed = createStudent500Controller({
    fetchImpl: fakeFetch(() => ({
      body: { applications: [{ bogus: true }] },
      status: 200,
    })).fetchImpl,
  });
  assert.equal(await malformed.load(projectId), "request_failed");
});

test("bilingual copy covers every server code the panel can render", () => {
  const zh = getWorkspaceCopy("zh-CN").student500;
  const en = getWorkspaceCopy("en").student500;

  const maps: ReadonlyArray<
    readonly [string, Record<string, string>, readonly string[]]
  > = [
    ["requirementLabels", zh.requirementLabels, STUDENT_500_REQUIREMENT_KEYS],
    [
      "requirementStatus",
      zh.requirementStatus,
      ["applicable", "conditional", "not_applicable", "unknown"],
    ],
    [
      "sourceVerification",
      zh.sourceVerification,
      [
        "verified_official_corpus",
        "declared_pending_verification",
        "insufficient_authority",
        "unavailable",
      ],
    ],
    [
      "evidencePreparation",
      zh.evidencePreparation,
      ["reported_held", "reported_not_held", "not_declared", "not_applicable"],
    ],
    ["missing", zh.missing, STUDENT_500_MISSING_FACT_CODES],
    ["humanReview", zh.humanReview, STUDENT_500_HUMAN_REVIEW_REASONS],
    ["nextAction", zh.nextAction, STUDENT_500_NEXT_ACTIONS],
    ["disclosure", zh.disclosure, STUDENT_500_DISCLOSURE_CODES],
  ];
  for (const [name, map, keys] of maps) {
    for (const key of keys) {
      assert.ok(map[key]?.trim().length, `zh.student500.${name}.${key}`);
    }
  }
  const enMaps: ReadonlyArray<
    readonly [string, Record<string, string>, readonly string[]]
  > = [
    ["requirementLabels", en.requirementLabels, STUDENT_500_REQUIREMENT_KEYS],
    ["missing", en.missing, STUDENT_500_MISSING_FACT_CODES],
    ["humanReview", en.humanReview, STUDENT_500_HUMAN_REVIEW_REASONS],
    ["nextAction", en.nextAction, STUDENT_500_NEXT_ACTIONS],
    ["disclosure", en.disclosure, STUDENT_500_DISCLOSURE_CODES],
  ];
  for (const [name, map, keys] of enMaps) {
    for (const key of keys) {
      assert.ok(map[key]?.trim().length, `en.student500.${name}.${key}`);
    }
  }
  for (const flag of STUDENT_500_HISTORY_FLAGS) {
    assert.ok(zh.historyFlag[flag]?.trim().length, flag);
    assert.ok(en.historyFlag[flag]?.trim().length, flag);
  }
  // Reason codes are intentionally internal to the screening contract; the panel
  // renders their effect (status + human-review reasons) rather than raw codes.
  assert.equal("reasonCodes" in zh, false);
  assert.ok(STUDENT_500_REASON_CODES.length >= 20);

  // The surface must not promise outcomes.
  const combined = `${Object.values(zh).join(" ")} ${Object.values(en).join(" ")}`;
  assert.doesNotMatch(combined, /guarantee|guaranteed|一定获批|保证获批/iu);
});

test("the panel renders in both locales with honest status labels", () => {
  for (const locale of ["zh-CN", "en"] as const) {
    const copy = getWorkspaceCopy(locale);
    const markup = renderToStaticMarkup(
      React.createElement(Student500Panel, {
        copy: copy.student500,
        enabled: true,
        projectId,
      })
    );
    assert.match(markup, /data-testid="student500-panel"/u);
    assert.match(markup, /data-testid="student500-create-open"/u);
    assert.match(markup, /data-testid="student500-empty"/u);
    assert.ok(markup.includes(copy.student500.title));
    assert.doesNotMatch(markup, /guaranteed|approved|eligible/iu);
  }
  // Disabled capability renders nothing at all.
  const disabled = renderToStaticMarkup(
    React.createElement(Student500Panel, {
      copy: getWorkspaceCopy("en").student500,
      enabled: false,
      projectId,
    })
  );
  assert.equal(disabled, "");
});

const schoolApplicationId = "55555555-5555-4555-8555-555555555501";

/** A payload shaped exactly like the existing M5.1 Project-scoped list item. */
function schoolApplicationPayload(overrides: Record<string, unknown> = {}) {
  return {
    applicationId: schoolApplicationId,
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
    revision: 2,
    source: {
      catalogRecordClass: null,
      catalogSnapshotToken: null,
      independentlyVerified: false,
      status: "unverified_customer_declared",
    },
    staleReasonCodes: [],
    status: "preparing",
    updatedAt: "2026-10-30T00:00:00.000Z",
    ...overrides,
  };
}

test("linkable school applications come from the authorized M5.1 Project list", async () => {
  const { calls, fetchImpl } = fakeFetch(() => ({
    body: { applications: [schoolApplicationPayload()] },
    status: 200,
  }));
  const result = await loadLinkableSchoolApplications({ fetchImpl, projectId });
  assert.equal(calls[0]?.url, `/api/projects/${projectId}/school-applications`);
  assert.equal(calls[0]?.method, "GET");
  assert.ok(result.ok);
  assert.deepEqual(result.applications, [
    {
      courseTitle: "Bachelor of Nursing",
      institutionName: "Example University",
      revision: 2,
      schoolApplicationId,
      sourceStatus: "unverified_customer_declared",
      status: "preparing",
    },
  ]);
});

test("a tampered or unauthorized school-application list is rejected, never coerced", async () => {
  const tampered = createStudent500Controller({
    fetchImpl: fakeFetch(() => ({
      body: {
        applications: [schoolApplicationPayload({ status: "approved" })],
      },
      status: 200,
    })).fetchImpl,
  });
  // The controller itself never surfaces these options, and the loader refuses.
  assert.equal(tampered.getSnapshot().detail, null);
  assert.deepEqual(
    await loadLinkableSchoolApplications({
      fetchImpl: fakeFetch(() => ({
        body: {
          applications: [schoolApplicationPayload({ status: "approved" })],
        },
        status: 200,
      })).fetchImpl,
      projectId,
    }),
    { error: "request_failed", ok: false }
  );
  assert.deepEqual(
    await loadLinkableSchoolApplications({
      fetchImpl: fakeFetch(() => ({ body: {}, status: 404 })).fetchImpl,
      projectId,
    }),
    { error: "not_found", ok: false }
  );
  assert.deepEqual(
    await loadLinkableSchoolApplications({
      fetchImpl: fakeFetch(() => ({ body: { applications: [] }, status: 503 }))
        .fetchImpl,
      projectId,
    }),
    { error: "unavailable", ok: false }
  );
});

function renderLinkField(input: {
  entryRoute: Student500Draft["entryRoute"];
  linkState: "idle" | "loading" | "loaded" | "error";
  links?: {
    schoolApplicationId: string;
    institutionName: string;
    courseTitle: string;
    status: string;
    sourceStatus: string;
    revision: number;
  }[];
  schoolApplicationId?: string | null;
}) {
  return renderToStaticMarkup(
    React.createElement(SchoolApplicationLinkField, {
      copy: getWorkspaceCopy("en").student500,
      draft: {
        ...EMPTY_STUDENT_500_DRAFT,
        entryRoute: input.entryRoute,
        schoolApplicationId: input.schoolApplicationId ?? null,
      },
      idPrefix: "test-link",
      linkState: input.linkState,
      links: input.links ?? [],
      onChange: () => undefined,
      onLoadLinks: () => undefined,
    })
  );
}

const linkOption = {
  courseTitle: "Bachelor of Nursing",
  institutionName: "Example University",
  revision: 2,
  schoolApplicationId,
  sourceStatus: "unverified_customer_declared",
  status: "preparing",
};

test("the link selector offers only the authorized records and no free-text id", () => {
  const markup = renderLinkField({
    entryRoute: "school_application_in_progress",
    links: [linkOption],
    linkState: "loaded",
  });
  assert.match(markup, /data-testid="test-link-school-application-field"/u);
  assert.match(markup, /<select/u);
  assert.match(
    markup,
    /Example University · Bachelor of Nursing \(preparing\)/u
  );
  assert.match(markup, new RegExp(schoolApplicationId, "u"));
  // No text input: the customer cannot type an arbitrary (possibly foreign) id.
  assert.doesNotMatch(markup, /<input/u);
  assert.doesNotMatch(markup, /type="text"/u);
  // The authorization boundary is stated on the control itself.
  assert.match(markup, /only select a school application you own/u);
  // The empty option is the explicit "no link" choice, not a fabricated record.
  assert.match(markup, /<option value="" selected="">Not linked<\/option>/u);
});

test("the link selector stays honest when empty, loading, failing or stale", () => {
  const empty = renderLinkField({
    entryRoute: "school_application_in_progress",
    linkState: "loaded",
  });
  assert.match(empty, /no school applications yet/u);
  assert.match(empty, /disabled=""/u);
  assert.match(empty, /needs one linked school application/u);

  const loading = renderLinkField({
    entryRoute: "school_application_in_progress",
    linkState: "loading",
  });
  assert.match(loading, /Loading…/u);

  const failed = renderLinkField({
    entryRoute: "school_application_in_progress",
    linkState: "error",
  });
  assert.match(failed, /Could not load the school application list/u);

  // A saved link that is no longer in the authorized list stays visible/removable
  // instead of silently disappearing.
  const stale = renderLinkField({
    entryRoute: "school_application_in_progress",
    linkState: "loaded",
    schoolApplicationId,
  });
  assert.match(stale, /currently unavailable/u);
});

test("CoE and offer routes show no link selector at all", () => {
  for (const route of [
    "existing_coe",
    "offer_only",
    "no_school_application",
  ] as const) {
    assert.equal(
      renderLinkField({ entryRoute: route, linkState: "loaded" }),
      "",
      route
    );
  }
});

const appA = "66666666-6666-4666-8666-666666666601";
const appB = "66666666-6666-4666-8666-666666666602";

/**
 * Deferred-response fake fetch: each call parks until the test resolves it, so
 * response order can be inverted deterministically.
 */
function deferredFetch() {
  const pending: {
    url: string;
    method: string;
    resolve: (body: unknown, status?: number) => void;
  }[] = [];
  const fetchImpl = (
    input: string | URL | Request,
    init?: RequestInit
  ): Promise<Response> =>
    new Promise((resolve) => {
      pending.push({
        method: init?.method ?? "GET",
        resolve: (body, status = 200) =>
          resolve(Response.json(body, { status })),
        url: String(input),
      });
    });
  return { fetchImpl, pending };
}

async function payloadFor(
  applicationIdValue: string,
  revision = 1
): Promise<Record<string, unknown>> {
  const base = await serverPayload();
  return { ...base, applicationId: applicationIdValue, revision };
}

async function loadedController() {
  const detailA = await payloadFor(appA);
  const detailB = await payloadFor(appB, 3);
  const deferred = deferredFetch();
  const controller = createStudent500Controller({
    fetchImpl: deferred.fetchImpl,
    newOperationId: () => "op-race",
  });
  const loading = controller.load(projectId);
  deferred.pending[0]?.resolve({ applications: [detailA, detailB] });
  await loading;
  return { controller, deferred, detailA, detailB };
}

test("switching A -> B never shows A's stale detail under B", async () => {
  const { controller, deferred, detailA } = await loadedController();

  const openA = controller.open(projectId, appA);
  // A is selected but not yet loaded: no previous detail may survive.
  assert.equal(controller.getSnapshot().detail, null);
  assert.equal(controller.getSnapshot().selectedApplicationId, appA);
  deferred.pending[1]?.resolve({ application: detailA });
  await openA;
  assert.equal(controller.getSnapshot().detail?.applicationId, appA);

  const openB = controller.open(projectId, appB);
  // Opening B clears A immediately instead of showing A while B loads.
  assert.equal(controller.getSnapshot().detail, null);
  assert.equal(controller.getSnapshot().selectedApplicationId, appB);
  deferred.pending[2]?.resolve({ application: await payloadFor(appB, 3) });
  await openB;
  assert.equal(controller.getSnapshot().detail?.applicationId, appB);
  // A's data is gone entirely; only B remains visible.
  assert.equal(controller.getSnapshot().detail?.revision, 3);
});

test("an out-of-order detail response never overwrites the newer selection", async () => {
  const { controller, deferred, detailA, detailB } = await loadedController();

  const openA = controller.open(projectId, appA);
  const openB = controller.open(projectId, appB);
  // B is requested second but answers first.
  deferred.pending[2]?.resolve({ application: detailB });
  await openB;
  // A's late answer must be discarded, including its selection side effects.
  deferred.pending[1]?.resolve({ application: detailA });
  assert.equal(await openA, null);

  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.selectedApplicationId, appB);
  assert.equal(snapshot.detail?.applicationId, appB);
  assert.equal(snapshot.detail?.revision, 3);
  assert.equal(snapshot.loadingDetail, false);
});

test("a detail response describing another application is never displayed", async () => {
  const { controller, deferred, detailA } = await loadedController();
  const open = controller.open(projectId, appB);
  deferred.pending[1]?.resolve({ application: detailA });
  assert.equal(await open, "request_failed");
  assert.equal(controller.getSnapshot().detail, null);
  assert.equal(controller.getSnapshot().selectedApplicationId, appB);
});

test("a mutation against a superseded detail is refused, not sent", async () => {
  const { controller, deferred, detailA, detailB } = await loadedController();
  const openA = controller.open(projectId, appA);
  deferred.pending[1]?.resolve({ application: detailA });
  await openA;
  const staleA = controller.getSnapshot().detail;
  assert.ok(staleA);

  const openB = controller.open(projectId, appB);
  deferred.pending[2]?.resolve({ application: detailB });
  await openB;

  const callsBefore = deferred.pending.length;
  assert.equal(
    await controller.update(projectId, staleA, EMPTY_STUDENT_500_DRAFT),
    "state_changed"
  );
  assert.equal(await controller.archive(projectId, staleA), "state_changed");
  // Nothing was sent to the server for the stale record.
  assert.equal(deferred.pending.length, callsBefore);
  assert.equal(controller.getSnapshot().detail?.applicationId, appB);
  assert.equal(controller.getSnapshot().error, "state_changed");
});

test("a list refresh never clobbers or resurrects the visible detail", async () => {
  const { controller, deferred, detailA } = await loadedController();
  const openA = controller.open(projectId, appA);
  deferred.pending[1]?.resolve({ application: detailA });
  await openA;
  assert.equal(controller.getSnapshot().detail?.applicationId, appA);

  const refresh = controller.load(projectId);
  deferred.pending[2]?.resolve({ applications: [detailA] });
  await refresh;
  assert.equal(controller.getSnapshot().detail?.applicationId, appA);
  assert.equal(controller.getSnapshot().selectedApplicationId, appA);

  // If the record disappears from the list, the stale detail is dropped.
  const second = controller.load(projectId);
  deferred.pending[3]?.resolve({ applications: [] });
  await second;
  assert.equal(controller.getSnapshot().detail, null);
  assert.equal(controller.getSnapshot().selectedApplicationId, null);
});
