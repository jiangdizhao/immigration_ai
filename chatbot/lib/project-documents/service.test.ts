// biome-ignore-all lint/suspicious/noMisplacedAssertion: helpers are called only by tests.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { hashProjectOperationRequest } from "@/lib/db/project-foundation-utils";
import { MAX_MATTER_DOCUMENT_BYTES } from "@/lib/matter-documents/validation";
import {
  createProjectDocumentService,
  type ProjectDocumentService,
} from "./service";
import {
  InMemoryProjectDocumentAuthorization,
  InMemoryProjectDocumentObjectStore,
  InMemoryProjectDocumentRepository,
  InMemoryProjectDocumentSource,
  InMemoryTrustedProjectDocumentScanVerifier,
} from "./testing";
import type {
  ProjectAuthorizationDecision,
  ProjectDocumentActor,
  ProjectDocumentOperationReceipt,
  ProjectDocumentPurpose,
  ProjectDocumentScanAttestation,
  ProjectDocumentVersionRecord,
  VerifiedProjectDocumentScanAttestation,
} from "./types";

const OWNER: ProjectDocumentActor = {
  kind: "registered_customer",
  userId: "user-owner",
};
const MEMBER: ProjectDocumentActor = {
  kind: "registered_customer",
  userId: "user-member",
};
const PROJECT_A = "project-a";
const PROJECT_B = "project-b";
const SAMPLE_BYTES = new TextEncoder().encode("Synthetic Project document.\n");

function digest(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

function activeDecision(
  actor: ProjectDocumentActor,
  projectId: string,
  relationship: "owner" | "active_member" = "owner"
): ProjectAuthorizationDecision {
  if (actor.kind !== "registered_customer") {
    throw new Error("Expected a registered customer fixture");
  }
  return {
    kind: "authorized",
    projectId,
    actorUserId: actor.userId,
    projectStatus: "active",
    registeredCustomer: true,
    relationship,
    revision: 1,
  };
}

function deniedDecision(
  actor: ProjectDocumentActor,
  projectId: string,
  reason: Extract<ProjectAuthorizationDecision, { kind: "denied" }>["reason"]
): ProjectAuthorizationDecision {
  if (actor.kind !== "registered_customer") {
    throw new Error("Expected a registered customer fixture");
  }
  return { kind: "denied", projectId, actorUserId: actor.userId, reason };
}

function makeHarness(
  options: {
    beforePut?: () => void | Promise<void>;
    createId?: (kind: "asset" | "version" | "grant" | "run") => string;
  } = {}
) {
  const repository = new InMemoryProjectDocumentRepository();
  const objectStore = new InMemoryProjectDocumentObjectStore(options);
  const authorization = new InMemoryProjectDocumentAuthorization();
  const sources = new InMemoryProjectDocumentSource();
  const attestationVerifier = new InMemoryTrustedProjectDocumentScanVerifier();
  authorization.setDecision(activeDecision(OWNER, PROJECT_A));
  authorization.setDecision(activeDecision(MEMBER, PROJECT_A, "active_member"));
  let nextId = 1;
  let nextTimestamp = 1;
  const service = createProjectDocumentService({
    repository,
    objectStore,
    authorization,
    sources,
    attestationVerifier,
    createId: options.createId ?? ((kind) => `${kind}-test-${nextId++}`),
    clock: () =>
      `2026-10-25T00:00:${String(nextTimestamp++ % 60).padStart(2, "0")}.000Z`,
  });
  return {
    repository,
    objectStore,
    authorization,
    sources,
    attestationVerifier,
    service,
  };
}

function upload(
  service: ProjectDocumentService,
  options: {
    actor?: ProjectDocumentActor;
    projectId?: string;
    operationId?: string;
    bytes?: Uint8Array;
    filename?: string;
    declaredMimeType?: string;
  } = {}
) {
  return service.createDirectUploadIntent({
    actor: options.actor ?? OWNER,
    projectId: options.projectId ?? PROJECT_A,
    operationId: options.operationId ?? "operation-1",
    filename: options.filename ?? "notes.txt",
    declaredMimeType: options.declaredMimeType ?? "text/plain",
    bytes: options.bytes ?? SAMPLE_BYTES,
  });
}

function operationValue(
  result: Awaited<ReturnType<typeof upload>>
): ProjectDocumentOperationReceipt {
  if (!result.ok) {
    throw new Error(`Expected success, received ${result.error}`);
  }
  return result.value;
}

function currentVersion(
  repository: InMemoryProjectDocumentRepository,
  receipt: ProjectDocumentOperationReceipt
): ProjectDocumentVersionRecord {
  const version = repository.getVersion(receipt.versionId);
  assert.ok(version);
  if (!version) {
    throw new Error("Expected a stored Project document version");
  }
  return version;
}

function scanPayload(
  version: ProjectDocumentVersionRecord,
  changes: Partial<VerifiedProjectDocumentScanAttestation> = {}
): VerifiedProjectDocumentScanAttestation {
  assert.ok(version.objectIdentity);
  if (!version.objectIdentity) {
    throw new Error("Expected an immutable object identity");
  }
  return {
    providerCode: "synthetic-scanner",
    providerEventId: "event-1",
    projectId: version.projectId,
    versionId: version.versionId,
    generation: version.processingGeneration,
    objectIdentity: { ...version.objectIdentity },
    result: "clean",
    occurredAt: "2026-10-25T00:00:00.000Z",
    ...changes,
  };
}

function reconcile(
  service: ProjectDocumentService,
  verifier: InMemoryTrustedProjectDocumentScanVerifier,
  payload: VerifiedProjectDocumentScanAttestation
) {
  const candidate: ProjectDocumentScanAttestation = verifier.issue(payload);
  return service.reconcileScan({ candidate });
}

test("direct upload stores a new private version and leaves malware status pending", async () => {
  const harness = makeHarness();
  const result = await upload(harness.service);
  const receipt = operationValue(result);
  const version = currentVersion(harness.repository, receipt);

  assert.equal(receipt.storageStatus, "stored");
  assert.equal(receipt.securityStatus, "pending");
  assert.equal(version.storageStatus, "stored");
  assert.equal(version.securityStatus, "pending");
  assert.equal(harness.repository.snapshot().assets.length, 1);
  assert.equal(harness.repository.snapshot().grants.length, 0);
  assert.equal(harness.objectStore.objectCount(), 1);
  assert.equal("storageKey" in receipt, false);
  const metadata = await harness.service.listMetadata({
    actor: OWNER,
    projectId: PROJECT_A,
  });
  assert.deepEqual(metadata, { ok: true, value: [], replayed: false });
});

test("imports copy only an individually owned Chat document into the selected Project", async () => {
  const harness = makeHarness();
  const memberBytes = new TextEncoder().encode("Member-owned source.\n");
  harness.sources.register({
    ownerUserId: "user-member",
    chatId: "chat-member",
    documentId: "document-member",
    filename: "member.txt",
    declaredMimeType: "text/plain",
    byteSize: memberBytes.byteLength,
    sha256: digest(memberBytes),
    bytes: memberBytes,
  });

  const denied = await harness.service.importOwnedChatDocument({
    actor: OWNER,
    projectId: PROJECT_A,
    operationId: "owner-cannot-import-member-file",
    sourceChatId: "chat-member",
    sourceDocumentId: "document-member",
    consentAccepted: true,
  });
  assert.deepEqual(denied, { ok: false, error: "source_not_owned" });
  assert.equal(harness.sources.readCount, 0);
  assert.equal(harness.repository.snapshot().assets.length, 0);

  harness.authorization.setDecision(
    deniedDecision(OWNER, PROJECT_B, "unrelated_actor")
  );
  harness.authorization.setDecision(
    deniedDecision(MEMBER, PROJECT_B, "unrelated_actor")
  );
  const crossProject = await harness.service.importOwnedChatDocument({
    actor: MEMBER,
    projectId: PROJECT_B,
    operationId: "cross-project-import",
    sourceChatId: "chat-member",
    sourceDocumentId: "document-member",
    consentAccepted: true,
  });
  assert.deepEqual(crossProject, { ok: false, error: "project_forbidden" });
  assert.equal(harness.sources.readCount, 0);

  const imported = await harness.service.importOwnedChatDocument({
    actor: MEMBER,
    projectId: PROJECT_A,
    operationId: "member-imports-own-file",
    sourceChatId: "chat-member",
    sourceDocumentId: "document-member",
    consentAccepted: true,
  });
  const receipt = operationValue(imported);
  const version = currentVersion(harness.repository, receipt);
  assert.equal(version.origin.kind, "explicit_chat_import");
  assert.equal(
    version.origin.kind === "explicit_chat_import" &&
      version.origin.sourceDocumentId,
    "document-member"
  );
  const operation = harness.repository
    .snapshot()
    .operations.find((item) => item.operationId === "member-imports-own-file");
  assert.ok(operation);
  assert.equal(
    operation?.requestHash,
    hashProjectOperationRequest({
      actorUserId: "user-member",
      projectId: PROJECT_A,
      operationType: "chat_document_import",
      consentAccepted: true,
      sourceChatId: "chat-member",
      sourceDocumentId: "document-member",
      sourceSha256: digest(memberBytes),
      sourceByteSize: memberBytes.byteLength,
      filename: "member.txt",
      canonicalMime: "text/plain",
      formatId: "txt",
    })
  );
  assert.deepEqual(
    await harness.sources
      .readAuthorizedSource({
        actorUserId: "user-member",
        chatId: "chat-member",
        documentId: "document-member",
      })
      .then((source) => source?.bytes),
    memberBytes
  );
  assert.equal(harness.objectStore.objectCount(), 1);
  assert.equal(version.securityStatus, "pending");
});

test("Chat import consent is required before source access and all state or storage changes", async () => {
  const harness = makeHarness();
  harness.sources.register({
    ownerUserId: "user-owner",
    chatId: "chat-owner",
    documentId: "document-owner",
    filename: "owned.txt",
    declaredMimeType: "text/plain",
    byteSize: SAMPLE_BYTES.byteLength,
    sha256: digest(SAMPLE_BYTES),
    bytes: SAMPLE_BYTES,
  });
  const baseInput = {
    actor: OWNER,
    projectId: PROJECT_A,
    sourceChatId: "chat-owner",
    sourceDocumentId: "document-owner",
  };
  type ImportInput = Parameters<
    ProjectDocumentService["importOwnedChatDocument"]
  >[0];
  const withoutConsent = {
    ...baseInput,
    operationId: "missing-import-consent",
  } as ImportInput;
  const cases: ImportInput[] = [
    {
      ...baseInput,
      operationId: "false-import-consent",
      consentAccepted: false,
    },
    withoutConsent,
    {
      ...baseInput,
      operationId: "invalid-import-consent",
      consentAccepted: "accepted" as unknown as boolean,
    },
  ];

  for (const input of cases) {
    assert.deepEqual(await harness.service.importOwnedChatDocument(input), {
      ok: false,
      error: "invalid_request",
    });
  }
  assert.equal(harness.sources.ownershipCheckCount, 0);
  assert.equal(harness.sources.readCount, 0);
  const snapshot = harness.repository.snapshot();
  assert.equal(snapshot.assets.length, 0);
  assert.equal(snapshot.versions.length, 0);
  assert.equal(snapshot.operations.length, 0);
  assert.equal(harness.objectStore.objectCount(), 0);
});

test("Chat import verifies source byte length and digest before creating an intent", async () => {
  const harness = makeHarness();
  harness.sources.register({
    ownerUserId: "user-owner",
    chatId: "chat-owner",
    documentId: "document-owner",
    filename: "owned.txt",
    declaredMimeType: "text/plain",
    byteSize: SAMPLE_BYTES.byteLength,
    sha256: "0".repeat(64),
    bytes: SAMPLE_BYTES,
  });
  const result = await harness.service.importOwnedChatDocument({
    actor: OWNER,
    projectId: PROJECT_A,
    operationId: "source-integrity-mismatch",
    sourceChatId: "chat-owner",
    sourceDocumentId: "document-owner",
    consentAccepted: true,
  });
  assert.deepEqual(result, { ok: false, error: "integrity_mismatch" });
  assert.equal(harness.sources.ownershipCheckCount, 1);
  assert.equal(harness.sources.readCount, 1);
  const snapshot = harness.repository.snapshot();
  assert.equal(snapshot.assets.length, 0);
  assert.equal(snapshot.versions.length, 0);
  assert.equal(snapshot.operations.length, 0);
  assert.equal(harness.objectStore.objectCount(), 0);
});

test("missing, pending, revoked, guest, anonymous, closed, and unrelated Project access fails closed", async () => {
  const harness = makeHarness();
  const pending = {
    kind: "registered_customer",
    userId: "pending-user",
  } as const;
  const revoked = {
    kind: "registered_customer",
    userId: "revoked-user",
  } as const;
  const noMembership = {
    kind: "registered_customer",
    userId: "no-membership-user",
  } as const;
  harness.authorization.setDecision(
    deniedDecision(pending, PROJECT_A, "pending_membership")
  );
  harness.authorization.setDecision(
    deniedDecision(revoked, PROJECT_A, "revoked_membership")
  );
  harness.authorization.setDecision(
    deniedDecision(OWNER, PROJECT_B, "project_closed")
  );
  harness.authorization.setDecision(
    deniedDecision(noMembership, PROJECT_A, "not_registered")
  );
  const cases: [ProjectDocumentActor, string, string][] = [
    [pending, PROJECT_A, "project_forbidden"],
    [revoked, PROJECT_A, "project_forbidden"],
    [noMembership, PROJECT_A, "project_forbidden"],
    [{ kind: "guest", userId: "user-owner" }, PROJECT_A, "invalid_actor"],
    [
      { kind: "unregistered_customer", userId: "user-owner" },
      PROJECT_A,
      "invalid_actor",
    ],
    [{ kind: "anonymous" }, PROJECT_A, "invalid_actor"],
    [OWNER, PROJECT_B, "project_closed"],
    [MEMBER, "missing-project", "project_not_found"],
  ];
  for (const [actor, projectId, error] of cases) {
    const result = await upload(harness.service, {
      actor,
      projectId,
      operationId: `denied-${error}-${projectId}`,
    });
    assert.deepEqual(result, { ok: false, error });
  }
  assert.equal(harness.repository.snapshot().assets.length, 0);
  assert.equal(harness.objectStore.objectCount(), 0);
});

test("Project membership does not grant access to another member's private asset", async () => {
  const harness = makeHarness();
  const receipt = operationValue(await upload(harness.service));

  assert.deepEqual(
    await harness.service.listMetadata({ actor: MEMBER, projectId: PROJECT_A }),
    { ok: true, value: [], replayed: false }
  );
  const content = await harness.service.readContent({
    actor: MEMBER,
    assetId: receipt.assetId,
    versionId: receipt.versionId,
  });
  const download = await harness.service.download({
    actor: MEMBER,
    assetId: receipt.assetId,
    versionId: receipt.versionId,
  });
  assert.deepEqual(content, { ok: false, error: "not_found" });
  assert.deepEqual(download, { ok: false, error: "not_found" });
  assert.equal(
    (
      await harness.service.grantCreatorPurpose({
        actor: MEMBER,
        assetId: receipt.assetId,
        versionId: receipt.versionId,
        purpose: "download",
        consentAccepted: true,
      })
    ).ok,
    false
  );
});

test("purpose grants are independent, consented, revocable, and never include AI context", async () => {
  const harness = makeHarness();
  const receipt = operationValue(await upload(harness.service));
  const initialRead = await harness.service.grantCreatorPurpose({
    actor: OWNER,
    assetId: receipt.assetId,
    versionId: receipt.versionId,
    purpose: "metadata_read",
    consentAccepted: false,
  });
  assert.deepEqual(initialRead, { ok: false, error: "project_forbidden" });

  const metadataGrant = await harness.service.grantCreatorPurpose({
    actor: OWNER,
    assetId: receipt.assetId,
    versionId: receipt.versionId,
    purpose: "metadata_read",
    consentAccepted: true,
  });
  assert.equal(metadataGrant.ok, true);
  const listing = await harness.service.listMetadata({
    actor: OWNER,
    projectId: PROJECT_A,
  });
  assert.equal(listing.ok, true);
  if (listing.ok) {
    assert.equal(listing.value.length, 1);
    const metadata = listing.value[0];
    assert.ok(metadata);
    if (metadata) {
      assert.equal("storageKey" in metadata, false);
    }
  }
  assert.deepEqual(
    await harness.service.download({
      actor: OWNER,
      assetId: receipt.assetId,
      versionId: receipt.versionId,
    }),
    { ok: false, error: "not_found" }
  );

  const invalidPurpose = await harness.service.grantCreatorPurpose({
    actor: OWNER,
    assetId: receipt.assetId,
    versionId: receipt.versionId,
    purpose: "ai_context" as ProjectDocumentPurpose,
    consentAccepted: true,
  });
  assert.deepEqual(invalidPurpose, { ok: false, error: "purpose_forbidden" });

  const revoked = await harness.service.revokeGrant({
    actor: OWNER,
    grantId: metadataGrant.ok ? metadataGrant.value.grantId : "missing",
  });
  assert.equal(revoked.ok, true);
  assert.deepEqual(
    await harness.service.listMetadata({ actor: OWNER, projectId: PROJECT_A }),
    { ok: true, value: [], replayed: false }
  );
});

test("clean scan is separately required for content and download grants", async () => {
  const harness = makeHarness();
  const receipt = operationValue(await upload(harness.service));
  const version = currentVersion(harness.repository, receipt);
  await harness.service.grantCreatorPurpose({
    actor: OWNER,
    assetId: receipt.assetId,
    versionId: receipt.versionId,
    purpose: "content_read",
    consentAccepted: true,
  });
  await harness.service.grantCreatorPurpose({
    actor: OWNER,
    assetId: receipt.assetId,
    versionId: receipt.versionId,
    purpose: "download",
    consentAccepted: true,
  });
  assert.deepEqual(
    await harness.service.readContent({
      actor: OWNER,
      assetId: receipt.assetId,
      versionId: receipt.versionId,
    }),
    { ok: false, error: "document_not_clean" }
  );
  const scan = await reconcile(
    harness.service,
    harness.attestationVerifier,
    scanPayload(version)
  );
  assert.equal(scan.ok, true);
  const content = await harness.service.readContent({
    actor: OWNER,
    assetId: receipt.assetId,
    versionId: receipt.versionId,
  });
  const download = await harness.service.download({
    actor: OWNER,
    assetId: receipt.assetId,
    versionId: receipt.versionId,
  });
  assert.deepEqual(content, { ok: true, value: SAMPLE_BYTES, replayed: false });
  assert.deepEqual(download, {
    ok: true,
    value: SAMPLE_BYTES,
    replayed: false,
  });
});

test("reads recheck current Project authority and exact-purpose grant after bytes are read", async () => {
  const revokedAuthority = makeHarness();
  const authorityReceipt = operationValue(
    await upload(revokedAuthority.service)
  );
  await revokedAuthority.service.grantCreatorPurpose({
    actor: OWNER,
    assetId: authorityReceipt.assetId,
    versionId: authorityReceipt.versionId,
    purpose: "content_read",
    consentAccepted: true,
  });
  const authorityVersion = currentVersion(
    revokedAuthority.repository,
    authorityReceipt
  );
  assert.equal(
    (
      await reconcile(
        revokedAuthority.service,
        revokedAuthority.attestationVerifier,
        scanPayload(authorityVersion)
      )
    ).ok,
    true
  );
  revokedAuthority.objectStore.setBeforeRead(() => {
    revokedAuthority.authorization.setDecision(
      deniedDecision(OWNER, PROJECT_A, "revoked_membership")
    );
  });
  const authorityDenied = await revokedAuthority.service.readContent({
    actor: OWNER,
    assetId: authorityReceipt.assetId,
    versionId: authorityReceipt.versionId,
  });
  assert.deepEqual(authorityDenied, { ok: false, error: "project_forbidden" });

  const revokedGrant = makeHarness();
  const grantReceipt = operationValue(await upload(revokedGrant.service));
  const grant = await revokedGrant.service.grantCreatorPurpose({
    actor: OWNER,
    assetId: grantReceipt.assetId,
    versionId: grantReceipt.versionId,
    purpose: "content_read",
    consentAccepted: true,
  });
  const grantVersion = currentVersion(revokedGrant.repository, grantReceipt);
  assert.equal(
    (
      await reconcile(
        revokedGrant.service,
        revokedGrant.attestationVerifier,
        scanPayload(grantVersion)
      )
    ).ok,
    true
  );
  if (!grant.ok) {
    throw new Error("Expected the explicit content-read grant");
  }
  revokedGrant.objectStore.setBeforeRead(() => {
    revokedGrant.repository.revokeGrant({
      grantId: grant.value.grantId,
      actorUserId: "user-owner",
      revokedAt: "2026-10-25T00:00:01.000Z",
    });
  });
  const grantDenied = await revokedGrant.service.readContent({
    actor: OWNER,
    assetId: grantReceipt.assetId,
    versionId: grantReceipt.versionId,
  });
  assert.deepEqual(grantDenied, { ok: false, error: "not_found" });
});

test("scan reconciliation rechecks Project authorization immediately before state mutation", async () => {
  const harness = makeHarness();
  const receipt = operationValue(await upload(harness.service));
  const version = currentVersion(harness.repository, receipt);
  const candidate = harness.attestationVerifier.issue(scanPayload(version));
  harness.objectStore.setBeforeRead(() => {
    harness.authorization.setDecision(
      deniedDecision(OWNER, PROJECT_A, "revoked_membership")
    );
  });

  const result = await harness.service.reconcileScan({ candidate });
  assert.deepEqual(result, { ok: false, error: "project_forbidden" });
  assert.equal(harness.repository.snapshot().runs.length, 0);
  assert.equal(
    currentVersion(harness.repository, receipt).securityStatus,
    "pending"
  );
});

test("forged, mismatched, stale, duplicate, and conflicting scan events are bounded", async () => {
  const harness = makeHarness();
  const receipt = operationValue(await upload(harness.service));
  const version = currentVersion(harness.repository, receipt);
  const forged = await harness.service.reconcileScan({
    candidate: {
      ...scanPayload(version),
      proofToken: "invented-provider-event",
    },
  });
  assert.deepEqual(forged, { ok: false, error: "scan_unverified" });

  const objectIdentity = version.objectIdentity;
  assert.ok(objectIdentity);
  if (!objectIdentity) {
    throw new Error("Expected an immutable object identity");
  }
  const mismatch = await reconcile(
    harness.service,
    harness.attestationVerifier,
    scanPayload(version, {
      objectIdentity: {
        ...objectIdentity,
        objectVersionId: "other-version",
      },
    })
  );
  assert.deepEqual(mismatch, { ok: false, error: "scan_identity_mismatch" });
  for (const [providerEventId, changes] of [
    ["wrong-project", { projectId: "project-other" }],
    ["wrong-key", { objectIdentity: { ...objectIdentity, key: "other/key" } }],
    [
      "wrong-digest",
      { objectIdentity: { ...objectIdentity, sha256: "0".repeat(64) } },
    ],
  ] as const) {
    const result = await reconcile(
      harness.service,
      harness.attestationVerifier,
      scanPayload(version, { providerEventId, ...changes })
    );
    assert.deepEqual(result, { ok: false, error: "scan_identity_mismatch" });
  }

  const stalePayload = scanPayload(version, {
    providerEventId: "stale-generation",
  });
  assert.equal(
    harness.repository.advanceGenerationForTest(version.versionId, 1),
    true
  );
  const stale = await reconcile(
    harness.service,
    harness.attestationVerifier,
    stalePayload
  );
  assert.deepEqual(stale, { ok: false, error: "stale_generation" });
});

test("terminal scanner outcomes remain immutable and exact event replays are idempotent", async () => {
  for (const result of ["clean", "rejected", "failed"] as const) {
    const harness = makeHarness();
    const receipt = operationValue(await upload(harness.service));
    const version = currentVersion(harness.repository, receipt);
    const payload = scanPayload(version, { result });
    const first = await reconcile(
      harness.service,
      harness.attestationVerifier,
      payload
    );
    assert.equal(first.ok, true);
    const replay = await reconcile(
      harness.service,
      harness.attestationVerifier,
      payload
    );
    assert.equal(replay.ok, true);
    if (first.ok && replay.ok) {
      assert.equal(first.value.processingRunId, replay.value.processingRunId);
      assert.equal(replay.replayed, true);
    }
    const conflict = await reconcile(
      harness.service,
      harness.attestationVerifier,
      { ...payload, result: result === "clean" ? "rejected" : "clean" }
    );
    assert.deepEqual(conflict, { ok: false, error: "scan_event_conflict" });
    const after = currentVersion(harness.repository, receipt);
    assert.equal(after.securityStatus, result);
    const runs = harness.repository.snapshot().runs;
    assert.equal(runs.length, 1);
    if (result === "failed") {
      assert.equal(runs[0]?.status, "failed");
      assert.equal(runs[0]?.verdict, null);
      assert.equal(runs[0]?.errorCode, "scanner_failed");
    }
  }
});

test("same idempotency key replays one asset, conflicts on changed bytes, and coalesces concurrent calls", async () => {
  let releasePut: () => void = () => {
    throw new Error("Put gate has not been initialized");
  };
  let signalEntered: () => void = () => {
    throw new Error("Put entry signal has not been initialized");
  };
  const entered = new Promise<void>((resolve) => {
    signalEntered = resolve;
  });
  const held = new Promise<void>((resolve) => {
    releasePut = resolve;
  });
  const harness = makeHarness({
    beforePut: async () => {
      signalEntered();
      await held;
    },
  });
  const firstPromise = upload(harness.service, {
    operationId: "same-operation",
  });
  await entered;
  const replayPromise = upload(harness.service, {
    operationId: "same-operation",
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  releasePut();
  const [first, replay] = await Promise.all([firstPromise, replayPromise]);
  const firstReceipt = operationValue(first);
  const replayReceipt = operationValue(replay);
  assert.equal(firstReceipt.assetId, replayReceipt.assetId);
  assert.equal(replay.replayed, true);
  assert.equal(harness.repository.snapshot().assets.length, 1);
  assert.equal(harness.objectStore.objectCount(), 1);

  const changed = await upload(harness.service, {
    operationId: "same-operation",
    bytes: new TextEncoder().encode("different bytes\n"),
  });
  assert.deepEqual(changed, { ok: false, error: "idempotency_conflict" });
  assert.equal(harness.repository.snapshot().assets.length, 1);
});

test("a pending operation recovers only after exact existing bytes are verified", async () => {
  const harness = makeHarness();
  const operationId = "pending-recovery";
  const assetId = "asset-seeded";
  const versionId = "version-seeded";
  const requestHash = hashProjectOperationRequest({
    actorUserId: "user-owner",
    projectId: PROJECT_A,
    operationType: "direct_upload",
    filename: "notes.txt",
    declaredMimeType: "text/plain",
    canonicalMime: "text/plain",
    formatId: "txt",
    sha256: digest(SAMPLE_BYTES),
    byteSize: SAMPLE_BYTES.byteLength,
  });
  const storageKey = `project-documents/${assetId}/${versionId}/bytes`;
  const seeded = harness.repository.claimIntent({
    operation: {
      actorUserId: "user-owner",
      projectId: PROJECT_A,
      operationId,
      operationType: "direct_upload",
      requestHash,
      assetId,
      versionId,
      status: "intent_created",
      errorCode: null,
      createdAt: "2026-10-25T00:00:00.000Z",
      completedAt: null,
    },
    asset: {
      id: assetId,
      projectId: PROJECT_A,
      createdByUserId: "user-owner",
      lifecycle: "active",
      createdAt: "2026-10-25T00:00:00.000Z",
    },
    version: {
      projectId: PROJECT_A,
      assetId,
      versionId,
      versionNumber: 1,
      storageKey,
      sha256: digest(SAMPLE_BYTES),
      byteSize: SAMPLE_BYTES.byteLength,
      canonicalMime: "text/plain",
      formatId: "txt",
      origin: { kind: "direct_upload" },
      uploadedByUserId: "user-owner",
      createdAt: "2026-10-25T00:00:00.000Z",
      storageStatus: "pending",
      securityStatus: "pending",
      processingGeneration: 1,
      objectIdentity: null,
    },
  });
  assert.equal(seeded.kind, "created");
  assert.equal(
    (
      await harness.objectStore.putNew({
        key: storageKey,
        bytes: SAMPLE_BYTES,
        expectedSha256: digest(SAMPLE_BYTES),
        contentType: "text/plain",
      })
    ).kind,
    "created"
  );

  const recovered = await upload(harness.service, { operationId });
  const receipt = operationValue(recovered);
  assert.equal(receipt.assetId, assetId);
  assert.equal(receipt.storageStatus, "stored");
  assert.equal(receipt.securityStatus, "pending");
  assert.equal(recovered.replayed, true);
  assert.equal(harness.repository.snapshot().assets.length, 1);
  assert.equal(harness.objectStore.objectCount(), 1);
});

test("invalid content, oversize bytes, storage integrity failures, and failed cleanup never return usable files", async () => {
  const invalid = makeHarness();
  assert.deepEqual(
    await upload(invalid.service, {
      filename: "bad.txt",
      bytes: new Uint8Array([0, 1, 2]),
    }),
    { ok: false, error: "invalid_document" }
  );
  assert.deepEqual(
    await upload(invalid.service, {
      filename: "large.txt",
      bytes: new Uint8Array(MAX_MATTER_DOCUMENT_BYTES + 1),
      operationId: "oversize",
    }),
    { ok: false, error: "invalid_document" }
  );
  assert.deepEqual(
    await upload(invalid.service, {
      filename: "wrong.pdf",
      declaredMimeType: "application/pdf",
      operationId: "mime-mismatch",
    }),
    { ok: false, error: "invalid_document" }
  );

  const corruptedReceipt = makeHarness();
  corruptedReceipt.objectStore.corruptNextPutReceipt();
  const integrity = await upload(corruptedReceipt.service);
  assert.equal(integrity.ok, false);
  assert.equal(
    corruptedReceipt.repository.snapshot().operations[0]?.status,
    "cleanup_pending"
  );
  assert.equal(corruptedReceipt.objectStore.objectCount(), 1);

  const failedWrite = makeHarness();
  failedWrite.objectStore.failNextPut("before_write");
  const failure = await upload(failedWrite.service, {
    operationId: "write-failed",
  });
  assert.equal(failure.ok, false);
  assert.equal(failedWrite.objectStore.objectCount(), 0);
  assert.equal(
    failedWrite.repository.snapshot().operations[0]?.status,
    "failed"
  );

  const cleanup = makeHarness();
  cleanup.objectStore.failNextPut("after_write");
  cleanup.objectStore.failNextRemove();
  const pending = await upload(cleanup.service, {
    operationId: "cleanup-needed",
  });
  assert.equal(pending.ok, false);
  assert.equal(
    cleanup.repository.snapshot().operations[0]?.status,
    "cleanup_pending"
  );
  assert.equal(cleanup.objectStore.objectCount(), 1);
  if (pending.ok || !pending.operation) {
    throw new Error("Expected a cleanup-pending operation receipt");
  }
  assert.equal(
    (
      await cleanup.service.readContent({
        actor: OWNER,
        assetId: pending.operation.assetId,
        versionId: pending.operation.versionId,
      })
    ).ok,
    false
  );
});

test("generated storage-key segments reject path spoofing", async () => {
  const harness = makeHarness({ createId: () => "../outside-prefix" });
  const result = await upload(harness.service, { operationId: "spoofed-key" });
  assert.deepEqual(result, { ok: false, error: "invalid_request" });
  assert.equal(harness.repository.snapshot().assets.length, 0);
  assert.equal(harness.objectStore.objectCount(), 0);
});

test("post-storage byte drift revokes storage usability without changing scan semantics", async () => {
  const harness = makeHarness();
  const receipt = operationValue(await upload(harness.service));
  await harness.service.grantCreatorPurpose({
    actor: OWNER,
    assetId: receipt.assetId,
    versionId: receipt.versionId,
    purpose: "content_read",
    consentAccepted: true,
  });
  const version = currentVersion(harness.repository, receipt);
  assert.equal(
    (
      await reconcile(
        harness.service,
        harness.attestationVerifier,
        scanPayload(version)
      )
    ).ok,
    true
  );
  assert.equal(
    harness.objectStore.corruptBytesForTest(
      version.storageKey,
      new TextEncoder().encode("drifted")
    ),
    true
  );
  const result = await harness.service.readContent({
    actor: OWNER,
    assetId: receipt.assetId,
    versionId: receipt.versionId,
  });
  assert.deepEqual(result, { ok: false, error: "integrity_mismatch" });
  const after = currentVersion(harness.repository, receipt);
  assert.equal(after.storageStatus, "failed");
  assert.equal(after.securityStatus, "clean");
  const replay = await upload(harness.service, { operationId: "operation-1" });
  assert.equal(replay.ok, false);
  if (!replay.ok) {
    assert.equal(replay.error, "document_not_stored");
    assert.equal(replay.operation?.storageStatus, "failed");
  }
});

test("closure, membership revocation, and withdrawal stop reads and scan effects", async () => {
  const harness = makeHarness();
  const receipt = operationValue(await upload(harness.service));
  const version = currentVersion(harness.repository, receipt);
  await harness.service.grantCreatorPurpose({
    actor: OWNER,
    assetId: receipt.assetId,
    versionId: receipt.versionId,
    purpose: "download",
    consentAccepted: true,
  });
  harness.authorization.setDecision(
    deniedDecision(OWNER, PROJECT_A, "project_closed")
  );
  assert.deepEqual(
    await harness.service.download({
      actor: OWNER,
      assetId: receipt.assetId,
      versionId: receipt.versionId,
    }),
    { ok: false, error: "project_closed" }
  );
  assert.deepEqual(
    await reconcile(
      harness.service,
      harness.attestationVerifier,
      scanPayload(version)
    ),
    { ok: false, error: "project_closed" }
  );
  assert.equal(harness.repository.snapshot().runs.length, 0);

  harness.authorization.setDecision(activeDecision(OWNER, PROJECT_A));
  const withdrawn = await harness.service.withdrawAsset({
    actor: OWNER,
    assetId: receipt.assetId,
  });
  assert.deepEqual(withdrawn, {
    ok: true,
    value: { assetId: receipt.assetId, lifecycle: "withdrawn" },
    replayed: false,
  });
  assert.deepEqual(
    await harness.service.download({
      actor: OWNER,
      assetId: receipt.assetId,
      versionId: receipt.versionId,
    }),
    { ok: false, error: "not_found" }
  );
  assert.deepEqual(
    await reconcile(
      harness.service,
      harness.attestationVerifier,
      scanPayload(version)
    ),
    { ok: false, error: "state_conflict" }
  );
});

test("authorization lost during a storage write cleans up and records a failed operation", async () => {
  let harness: ReturnType<typeof makeHarness>;
  harness = makeHarness({
    beforePut: () => {
      harness.authorization.setDecision(
        deniedDecision(OWNER, PROJECT_A, "revoked_membership")
      );
    },
  });
  const result = await upload(harness.service, {
    operationId: "revoke-during-write",
  });
  assert.equal(result.ok, false);
  if (result.ok) {
    throw new Error("Revoked Project access must not report upload success");
  }
  assert.equal(result.error, "project_forbidden");
  assert.equal(result.operation?.storageStatus, "failed");
  assert.equal(harness.objectStore.objectCount(), 0);
  assert.equal(harness.repository.snapshot().operations[0]?.status, "failed");
  assert.equal(harness.repository.snapshot().assets.length, 1);
});

test("source Chat ownership revoked during import is rechecked before storage finalization", async () => {
  let harness: ReturnType<typeof makeHarness>;
  harness = makeHarness({
    beforePut: () => {
      harness.sources.remove("chat-owner", "document-owner");
    },
  });
  harness.sources.register({
    ownerUserId: "user-owner",
    chatId: "chat-owner",
    documentId: "document-owner",
    filename: "source.txt",
    declaredMimeType: "text/plain",
    byteSize: SAMPLE_BYTES.byteLength,
    sha256: digest(SAMPLE_BYTES),
    bytes: SAMPLE_BYTES,
  });
  const result = await harness.service.importOwnedChatDocument({
    actor: OWNER,
    projectId: PROJECT_A,
    operationId: "source-revoked-during-copy",
    sourceChatId: "chat-owner",
    sourceDocumentId: "document-owner",
    consentAccepted: true,
  });
  assert.equal(result.ok, false);
  if (result.ok) {
    throw new Error("Import must fail after source ownership is revoked");
  }
  assert.equal(result.error, "source_not_owned");
  assert.equal(result.operation?.storageStatus, "failed");
  assert.equal(harness.objectStore.objectCount(), 0);
  assert.equal(harness.repository.snapshot().assets.length, 1);
});

function listSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const resolved = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return listSourceFiles(resolved);
    }
    return /\.(?:ts|tsx|js|jsx)$/u.test(entry.name) ? [resolved] : [];
  });
}

test("internal Project document modules have no API/widget consumer or live AWS/scanner adapter", () => {
  const appRoot = process.cwd();
  const consumerRoots = ["app", "components", "lib"]
    .map((relative) => path.join(appRoot, relative))
    .filter((directory) => {
      try {
        readdirSync(directory);
        return true;
      } catch {
        return false;
      }
    });
  const externalFiles = consumerRoots
    .flatMap(listSourceFiles)
    .filter(
      (file) =>
        !file.startsWith(path.join(appRoot, "lib/project-documents") + path.sep)
    );
  for (const file of externalFiles) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(
      source,
      /(?:@\/lib\/project-documents|\.\/project-documents\/service)/u,
      file
    );
  }

  const moduleFiles = ["types.ts", "ports.ts", "testing.ts", "service.ts"].map(
    (file) => path.join(appRoot, "lib/project-documents", file)
  );
  const moduleSource = moduleFiles
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");
  assert.doesNotMatch(
    moduleSource,
    /@aws-sdk|S3Client|GuardDuty|guardduty-malware/u
  );
  assert.match(moduleSource, /validateMatterDocument/u);
  assert.doesNotMatch(
    moduleSource,
    /from ["'][^"']*matter-documents\/(?:service|processing)["']/u
  );
});
