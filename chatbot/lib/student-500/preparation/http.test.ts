import assert from "node:assert/strict";
import { test } from "node:test";
import { createStudent500PreparationHandlers } from "./http";
import type { Student500PreparationService } from "./service";

const PROJECT = "22222222-2222-4222-8222-222222222301";
const APPLICATION = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01";

function handler(
  options: {
    enabled?: boolean;
    schema?: boolean;
    session?: { userId: string; type: "guest" | "regular" } | null;
    service?: Partial<Student500PreparationService>;
    writes?: boolean;
  } = {}
) {
  const calls: string[] = [];
  const service = {
    createDraft: async () => {
      calls.push("createDraft");
      return { draft: { id: "d" }, replayed: false };
    },
    createSnapshot: async () => {
      calls.push("createSnapshot");
      return { replayed: false, snapshot: { id: "s" } };
    },
    get: async () => {
      calls.push("get");
      return { applicationId: APPLICATION };
    },
    getDraft: async () => {
      calls.push("getDraft");
      return { id: "d" };
    },
    getSnapshot: async () => {
      calls.push("getSnapshot");
      return { id: "s" };
    },
    saveDraft: async () => {
      calls.push("saveDraft");
      return { draft: { id: "d2" }, replayed: false };
    },
    selectFact: async () => {
      calls.push("selectFact");
      return { reference: { id: "r" }, replayed: false };
    },
    setSchoolContext: async () => {
      calls.push("setSchoolContext");
      return { replayed: false, schoolContext: { id: "c" } };
    },
    unselectFact: async () => {
      calls.push("unselectFact");
      return { reference: { id: "r" }, replayed: false };
    },
    ...options.service,
  } as unknown as Student500PreparationService;
  return {
    calls,
    handlers: createStudent500PreparationHandlers({
      authenticate: async () =>
        options.session === undefined
          ? { type: "regular", userId: "11111111-1111-4111-8111-111111111201" }
          : options.session,
      enabled: () => options.enabled ?? true,
      projectWritesEnabled: () => options.writes ?? true,
      schemaAvailable: async () => options.schema ?? true,
      service,
    }),
  };
}

function jsonRequest(body: unknown): Request {
  return new Request("https://example.invalid/api", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

test("feature-off, guest, anonymous and schema-missing all fail closed", async () => {
  const off = handler({ enabled: false });
  const offResponse = await off.handlers.get(
    new Request("https://x"),
    PROJECT,
    APPLICATION
  );
  assert.equal(offResponse.status, 404);

  const guest = handler({
    session: { type: "guest", userId: "11111111-1111-4111-8111-111111111201" },
  });
  assert.equal(
    (await guest.handlers.get(new Request("https://x"), PROJECT, APPLICATION))
      .status,
    404
  );

  const anonymous = handler({ session: null });
  assert.equal(
    (
      await anonymous.handlers.get(
        new Request("https://x"),
        PROJECT,
        APPLICATION
      )
    ).status,
    401
  );

  const noSchema = handler({ schema: false });
  assert.equal(
    (
      await noSchema.handlers.get(
        new Request("https://x"),
        PROJECT,
        APPLICATION
      )
    ).status,
    503
  );

  const writesOff = handler({ writes: false });
  assert.equal(
    (
      await writesOff.handlers.act(
        jsonRequest({ action: "create_gs_draft", operationId: "op-1" }),
        PROJECT,
        APPLICATION
      )
    ).status,
    503
  );
});

test("invalid identifiers and bodies are rejected before the service", async () => {
  const { calls, handlers } = handler();
  assert.equal(
    (await handlers.get(new Request("https://x"), "not-a-uuid", APPLICATION))
      .status,
    400
  );
  assert.equal(
    (await handlers.get(new Request("https://x"), PROJECT, "nope")).status,
    400
  );
  assert.equal(
    (
      await handlers.act(
        new Request("https://x", { body: "{}", method: "POST" }),
        PROJECT,
        APPLICATION
      )
    ).status,
    415
  );
  for (const body of [
    { action: "unknown_action", operationId: "op-1" },
    { operationId: "op-1" },
    { action: "create_gs_draft" },
    {
      action: "select_fact",
      factAssertionId: "nope",
      factVersion: 1,
      operationId: "op-1",
    },
    {
      action: "select_fact",
      factAssertionId: APPLICATION,
      factVersion: 0,
      operationId: "op-1",
    },
    {
      action: "save_gs_draft",
      baseDraftId: APPLICATION,
      edits: [],
      operationId: "op-1",
    },
    { action: "create_gs_draft", operationId: "bad id" },
  ]) {
    const response = await handlers.act(
      jsonRequest(body),
      PROJECT,
      APPLICATION
    );
    assert.equal(response.status, 400, JSON.stringify(body));
  }
  assert.deepEqual(calls, []);
});

test("a payload cannot supply verification, provenance or approval", async () => {
  const { calls, handlers } = handler();
  for (const body of [
    {
      action: "set_school_context",
      kind: "customer_reported_coe",
      operationId: "op-1",
      studyEvidenceKind: "coe_independently_verified",
    },
    {
      action: "set_school_context",
      kind: "admission_case",
      admissionCaseId: APPLICATION,
      operationId: "op-1",
      admissionOutcomeVerified: true,
    },
    {
      action: "create_gs_draft",
      operationId: "op-1",
      professionallyReviewed: true,
    },
    {
      action: "create_gs_draft",
      operationId: "op-1",
      ownerUserId: APPLICATION,
    },
  ]) {
    const response = await handlers.act(
      jsonRequest(body),
      PROJECT,
      APPLICATION
    );
    assert.equal(response.status, 400, JSON.stringify(body));
  }
  assert.deepEqual(calls, []);
});

test("valid actions reach the service exactly once", async () => {
  const { calls, handlers } = handler();
  const read = await handlers.get(
    new Request("https://x"),
    PROJECT,
    APPLICATION
  );
  assert.equal(read.status, 200);
  assert.equal((await read.json()).preparation.applicationId, APPLICATION);

  const select = await handlers.act(
    jsonRequest({
      action: "select_fact",
      factAssertionId: APPLICATION,
      factVersion: 2,
      operationId: "op-2",
    }),
    PROJECT,
    APPLICATION
  );
  assert.equal(select.status, 201);
  const snapshot = await handlers.act(
    jsonRequest({ action: "create_preparation_snapshot", operationId: "op-3" }),
    PROJECT,
    APPLICATION
  );
  assert.equal(snapshot.status, 201);
  assert.deepEqual(calls, ["get", "selectFact", "createSnapshot"]);
});

test("service errors map to bounded statuses without leaking existence", async () => {
  const { Student500PreparationError } = await import("./contracts");
  for (const [code, status] of [
    ["application_not_found", 404],
    ["draft_not_found", 404],
    ["project_forbidden", 404],
    ["revision_conflict", 409],
    ["version_conflict", 409],
    ["idempotency_conflict", 409],
    ["limit_exceeded", 409],
    ["fact_not_available", 409],
    ["school_context_unavailable", 409],
    ["school_context_invalid", 400],
  ] as const) {
    const { handlers } = handler({
      service: {
        get: async () => {
          throw new Student500PreparationError(code);
        },
      },
    });
    const response = await handlers.get(
      new Request("https://x"),
      PROJECT,
      APPLICATION
    );
    assert.equal(response.status, status, code);
  }
});

test("HTTP mutation responses withhold revoked private fact content", async () => {
  const { createHarness, fact, MEMBER, OWNER } = await import("./testing");
  const SHARED = "55555555-5555-4555-8555-5555555555b1";
  const OWN = "55555555-5555-4555-8555-5555555555b2";
  const SHARED_VALUE = "Advanced Diploma of Renewable Energy";
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
        valueDisplay: "Bayside College",
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
      operationId: `op-http-select-${index}`,
      projectId: PROJECT,
    });
  }
  const created = await harness.service.createDraft({
    actorUserId: OWNER,
    applicationId: application.id,
    operationId: "op-http-draft",
    projectId: PROJECT,
  });
  const snapshot = await harness.service.createSnapshot({
    actorUserId: OWNER,
    applicationId: application.id,
    operationId: "op-http-snap",
    projectId: PROJECT,
  });

  // Member A revokes; nothing about the private fact may leave through HTTP again.
  harness.setFacts([
    fact({
      factAssertionId: OWN,
      key: "study.institution",
      valueDisplay: "Bayside College",
    }),
  ]);

  const transport = createStudent500PreparationHandlers({
    authenticate: async () => ({ type: "regular", userId: OWNER }),
    enabled: () => true,
    projectWritesEnabled: () => true,
    schemaAvailable: async () => true,
    service: harness.service,
  });

  const assertWithheld = (label: string, text: string) => {
    assert.doesNotMatch(text, new RegExp(SHARED_VALUE, "u"), label);
    assert.doesNotMatch(text, /study\.course_name/u, label);
  };

  // 1. create_gs_draft exact replay.
  const draftReplay = await transport.act(
    jsonRequest({ action: "create_gs_draft", operationId: "op-http-draft" }),
    PROJECT,
    application.id
  );
  assert.equal(draftReplay.status, 201);
  const draftReplayBody = await draftReplay.text();
  assert.match(draftReplayBody, /"replayed":true/u);
  assertWithheld("create_gs_draft replay", draftReplayBody);
  assert.match(draftReplayBody, /restricted_source_withheld/u);

  // 2. save_gs_draft exact replay.
  const saveReplay = await transport.act(
    jsonRequest({
      action: "save_gs_draft",
      baseDraftId: created.draft.id,
      edits: [{ sectionKey: "future_plans", text: "Customer sentence." }],
      operationId: "op-http-save",
    }),
    PROJECT,
    application.id
  );
  assert.equal(saveReplay.status, 201);
  const savedBody = await saveReplay.text();
  assert.match(savedBody, /Customer sentence\./u);

  const saveReplayAgain = await transport.act(
    jsonRequest({
      action: "save_gs_draft",
      baseDraftId: created.draft.id,
      edits: [{ sectionKey: "future_plans", text: "Customer sentence." }],
      operationId: "op-http-save",
    }),
    PROJECT,
    application.id
  );
  assert.equal(saveReplayAgain.status, 201);
  const saveReplayBody = await saveReplayAgain.text();
  assert.match(saveReplayBody, /"replayed":true/u);
  assertWithheld("save_gs_draft replay", saveReplayBody);

  // 3. create_preparation_snapshot exact replay.
  const snapshotReplay = await transport.act(
    jsonRequest({
      action: "create_preparation_snapshot",
      operationId: "op-http-snap",
    }),
    PROJECT,
    application.id
  );
  assert.equal(snapshotReplay.status, 201);
  const snapshotBody = await snapshotReplay.text();
  assert.match(snapshotBody, /"replayed":true/u);
  assertWithheld("create_preparation_snapshot replay", snapshotBody);

  // 4. GET paths stay equivalent.
  const view = await transport.get(
    new Request("https://x"),
    PROJECT,
    application.id
  );
  assertWithheld("preparation GET", await view.text());
  const draftGet = await transport.getDraft(
    new Request("https://x"),
    PROJECT,
    application.id,
    created.draft.id
  );
  assertWithheld("draft GET", await draftGet.text());
  const snapshotGet = await transport.getSnapshot(
    new Request("https://x"),
    PROJECT,
    application.id,
    snapshot.snapshot.id
  );
  assertWithheld("snapshot GET", await snapshotGet.text());
});

test("HTTP fact metadata is withheld from the view and mutation replays", async () => {
  const { createHarness, fact, MEMBER, OWNER } = await import("./testing");
  const SHARED = "55555555-5555-4555-8555-5555555555b9";
  const OWN = "55555555-5555-4555-8555-5555555555ba";
  const harness = createHarness({
    facts: [
      fact({
        authorizationActorUserId: MEMBER,
        factAssertionId: SHARED,
        key: "study.course_name",
        valueDisplay: "Certificate III in Commercial Cookery",
      }),
      fact({
        factAssertionId: OWN,
        key: "study.institution",
        valueDisplay: "Rivergum College",
      }),
    ],
  });
  const application = await harness.seedApplication();
  const shared = await harness.service.selectFact({
    actorUserId: OWNER,
    applicationId: application.id,
    factAssertionId: SHARED,
    factVersion: 1,
    operationId: "op-httpmeta-select",
    projectId: PROJECT,
  });
  await harness.service.unselectFact({
    actorUserId: OWNER,
    applicationId: application.id,
    factReferenceId: shared.reference.id,
    operationId: "op-httpmeta-unselect",
    projectId: PROJECT,
  });
  await harness.service.selectFact({
    actorUserId: OWNER,
    applicationId: application.id,
    factAssertionId: OWN,
    factVersion: 1,
    operationId: "op-httpmeta-own",
    projectId: PROJECT,
  });

  harness.setFacts([
    fact({
      factAssertionId: OWN,
      key: "study.institution",
      valueDisplay: "Rivergum College",
    }),
  ]);

  const transport = createStudent500PreparationHandlers({
    authenticate: async () => ({ type: "regular", userId: OWNER }),
    enabled: () => true,
    projectWritesEnabled: () => true,
    schemaAvailable: async () => true,
    service: harness.service,
  });
  const assertWithheld = (label: string, body: string) => {
    assert.doesNotMatch(body, new RegExp(SHARED, "u"), label);
    assert.doesNotMatch(body, /study\.course_name/u, label);
    assert.doesNotMatch(body, /Certificate III in Commercial Cookery/u, label);
  };

  // 1. Preparation view: reconciliation ids and fact metadata are narrowed.
  const view = await transport.get(
    new Request("https://x"),
    PROJECT,
    application.id
  );
  const viewBody = await view.text();
  assertWithheld("preparation view", viewBody);
  assert.match(viewBody, /study\.institution/u);

  // 2. Exact select replay after revocation.
  const selectReplay = await transport.act(
    jsonRequest({
      action: "select_fact",
      factAssertionId: SHARED,
      factVersion: 1,
      operationId: "op-httpmeta-select",
    }),
    PROJECT,
    application.id
  );
  assert.equal(selectReplay.status, 201);
  const selectBody = await selectReplay.text();
  assert.match(selectBody, /"replayed":true/u);
  assert.match(selectBody, /"readable":false/u);
  assertWithheld("select replay", selectBody);

  // 3. Exact unselect replay after revocation.
  const unselectReplay = await transport.act(
    jsonRequest({
      action: "unselect_fact",
      factReferenceId: shared.reference.id,
      operationId: "op-httpmeta-unselect",
    }),
    PROJECT,
    application.id
  );
  assert.equal(unselectReplay.status, 200);
  const unselectBody = await unselectReplay.text();
  assert.match(unselectBody, /"replayed":true/u);
  assertWithheld("unselect replay", unselectBody);

  // 4. Authorized references keep working through HTTP.
  const ownSelect = await transport.act(
    jsonRequest({
      action: "select_fact",
      factAssertionId: OWN,
      factVersion: 1,
      operationId: "op-httpmeta-own",
    }),
    PROJECT,
    application.id
  );
  const ownBody = await ownSelect.text();
  assert.match(ownBody, /"readable":true/u);
  assert.match(ownBody, /study\.institution/u);
});
