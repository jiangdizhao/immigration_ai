// biome-ignore-all lint/suspicious/useAwait: In-memory evidence persistence returns promise values.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import {
  createProjectDocumentEvidenceService,
  type ProjectDocumentEvidencePersistence,
  type ProjectEvidenceRun,
  type VerifiedEvidenceSource,
} from "./evidence";
import { createProjectFactEvidenceProposalService } from "./evidence-to-facts";
import { buildDocx, buildPdf } from "./synthetic-fixtures";

/**
 * Phase 14-B B1/B2 integration: genuinely parsed PDF/DOCX/TXT project documents produce
 * provenance-linked evidence, and only those issued references can become proposed facts.
 *
 * The scan attestation here is an **injected synthetic attestation**. It proves the code
 * path, not that a production malware scanner works.
 */

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const COE_TEXT = [
  "Confirmation of Enrolment",
  "Student name: Lin Wei",
  "Date of birth: 04/07/2004",
  "Education provider: Example Institute of Technology",
  "Course name: Bachelor of Information Technology",
  "Campus: Sydney",
  "Course start date: 01/03/2027",
  "Course end date: 30/11/2029",
  "CoE reference: 9F7A2C1B44",
].join("\n");

const OSHC_TEXT = [
  "Overseas Student Health Cover",
  "Student name: Lin Wei",
  "OSHC start date: 20/02/2027",
  "OSHC expiry date: 19/02/2030",
].join("\n");

type Fixture = {
  bytes: Uint8Array;
  canonicalMime: string;
  versionId: string;
  assetId: string;
};

class MemoryEvidencePersistence implements ProjectDocumentEvidencePersistence {
  source: VerifiedEvidenceSource | null = null;
  runs: ProjectEvidenceRun[] = [];
  private readonly references = new Map<
    string,
    { runId: string; ordinal: number }
  >();

  async findSource() {
    return this.source;
  }
  async canExtract() {
    return true;
  }
  async findReplay() {
    return null;
  }
  async findRunForReferenceIssue(input: { runId: string }) {
    return this.runs.find((run) => run.id === input.runId) ?? null;
  }
  async saveRun(input: { run: ProjectEvidenceRun }) {
    this.runs.push(input.run);
    return input.run;
  }
  async issueReference(input: { runId: string; candidateOrdinal: number }) {
    const id = `evidence-ref-${this.references.size + 1}`;
    this.references.set(id, {
      runId: input.runId,
      ordinal: input.candidateOrdinal,
    });
    return id;
  }
  async resolveReference() {
    return null;
  }
}

function extractFixture(fixture: Fixture) {
  const persistence = new MemoryEvidencePersistence();
  const source: VerifiedEvidenceSource = {
    projectId: "project-a",
    assetId: fixture.assetId,
    versionId: fixture.versionId,
    generation: 1,
    lifecycle: "active",
    storageStatus: "stored",
    securityStatus: "clean",
    storageKey: `private/${fixture.versionId}`,
    objectVersionId: `object-${fixture.versionId}`,
    sha256: createHash("sha256").update(fixture.bytes).digest("hex"),
    byteSize: fixture.bytes.byteLength,
    canonicalMime: fixture.canonicalMime,
  };
  persistence.source = source;
  const service = createProjectDocumentEvidenceService({
    persistence,
    reader: { readExactVersion: async () => fixture.bytes },
    verifyAuthenticatedScan: async ({ source: current }) => ({
      authenticated: true,
      verdict: "clean",
      projectId: current.projectId,
      versionId: current.versionId,
      generation: current.generation,
      objectVersionId: current.objectVersionId ?? "",
      sha256: current.sha256,
    }),
  });
  return { persistence, service, source };
}

async function proposeFrom(
  fixture: Fixture,
  existing: Array<{
    assertionId: string;
    key: string;
    value: unknown;
    state: string;
  }> = []
) {
  const { persistence, service } = extractFixture(fixture);
  const run = await service.extract({
    actorUserId: "customer-1",
    projectId: "project-a",
    assetId: fixture.assetId,
    versionId: fixture.versionId,
    operationId: `extract-${fixture.versionId}`,
    expectedProjectRevision: 1,
  });
  const captured: unknown[] = [];
  const proposal = createProjectFactEvidenceProposalService({
    persistence,
    review: {
      proposeExtracted: async (input) => {
        captured.push(input.extraction);
        return { proposed: input.extraction.drafts, conflictKeys: [] };
      },
    },
    existingFacts: async () => existing,
  });
  const result = await proposal.proposeFromEvidenceRun({
    actor: {
      actorUserId: "customer-1",
      projectId: "project-a",
      expectedProjectRevision: 1,
    },
    operationId: `propose-${fixture.versionId}`,
    run,
  });
  return { run, result, captured };
}

test("a DOCX CoE is parsed, evidenced and proposed as Project Facts", async () => {
  const bytes = buildDocx(COE_TEXT.split("\n"));
  const { run, result } = await proposeFrom({
    bytes,
    canonicalMime: DOCX_MIME,
    assetId: "asset-coe",
    versionId: "version-coe",
  });
  assert.equal(run.status, "complete");
  assert.ok(run.candidates.length >= 5);
  assert.deepEqual(run.candidates[0]?.locator, {
    kind: "block",
    start: 1,
    end: 1,
  });

  const byKey = new Map(
    result.proposedDrafts.map((draft) => [draft.key, draft])
  );
  assert.equal(byKey.get("applicant.full_name")?.value, "Lin Wei");
  assert.equal(
    byKey.get("study.course")?.value,
    "Bachelor of Information Technology"
  );
  assert.equal(byKey.get("study.course_start_date")?.value, "2027-03-01");
  assert.equal(byKey.get("study.coe_reference")?.value, "9F7A2C1B44");
  for (const draft of result.proposedDrafts) {
    assert.match(draft.sourceEvidenceRef, /^evidence-ref-\d+$/u);
  }
});

test("a PDF and a TXT document are equally usable evidence sources", async () => {
  const pdf = await proposeFrom({
    bytes: buildPdf([
      "Overseas Student Health Cover",
      "Student name: Lin Wei",
      "OSHC expiry date: 19/02/2030",
    ]),
    canonicalMime: "application/pdf",
    assetId: "asset-oshc",
    versionId: "version-oshc",
  });
  assert.equal(pdf.run.status, "complete");
  assert.equal(pdf.run.candidates[0]?.locator.kind, "page");
  const pdfKeys = new Map(
    pdf.result.proposedDrafts.map((draft) => [draft.key, draft])
  );
  assert.equal(pdfKeys.get("insurance.oshc_expiry_date")?.value, "2030-02-19");

  const txt = await proposeFrom({
    bytes: new TextEncoder().encode(OSHC_TEXT),
    canonicalMime: "text/plain",
    assetId: "asset-txt",
    versionId: "version-txt",
  });
  assert.equal(txt.run.status, "complete");
  const txtKeys = new Map(
    txt.result.proposedDrafts.map((draft) => [draft.key, draft])
  );
  assert.equal(txtKeys.get("insurance.oshc_start_date")?.value, "2027-02-20");
  assert.equal(txtKeys.get("insurance.oshc_expiry_date")?.value, "2030-02-19");
});

test("no proposal is produced for an incomplete run or an unverified scan", async () => {
  const bytes = buildDocx(COE_TEXT.split("\n"));
  const { persistence, service } = extractFixture({
    bytes,
    canonicalMime: DOCX_MIME,
    assetId: "asset-blocked",
    versionId: "version-blocked",
  });
  persistence.source = {
    ...(persistence.source as VerifiedEvidenceSource),
    securityStatus: "pending",
  };
  await assert.rejects(
    service.extract({
      actorUserId: "customer-1",
      projectId: "project-a",
      assetId: "asset-blocked",
      versionId: "version-blocked",
      operationId: "extract-blocked",
      expectedProjectRevision: 1,
    }),
    { code: "source_unavailable" }
  );
});

test("a run status other than complete/partial proposes nothing", async () => {
  const persisted: unknown[] = [];
  const proposal = createProjectFactEvidenceProposalService({
    persistence: {
      issueReference: async () => {
        throw new Error("must not issue references for an unusable run");
      },
    },
    review: {
      proposeExtracted: async (input) => {
        persisted.push(input);
        return { proposed: [], conflictKeys: [] };
      },
    },
    existingFacts: async () => [],
  });
  const result = await proposal.proposeFromEvidenceRun({
    actor: {
      actorUserId: "customer-1",
      projectId: "project-a",
      expectedProjectRevision: 1,
    },
    operationId: "propose-unusable",
    run: {
      id: "run-unusable",
      projectId: "project-a",
      assetId: "asset-1",
      versionId: "version-1",
      generation: 1,
      sourceSha256: "0".repeat(64),
      parserVersion: "native_pdf_docx_text_v1",
      status: "unsupported",
      errorCode: null,
      candidates: [],
    },
  });
  assert.equal(result.skippedBecauseRunIncomplete, true);
  assert.deepEqual(result.proposedDrafts, []);
  assert.deepEqual(persisted, []);
});
