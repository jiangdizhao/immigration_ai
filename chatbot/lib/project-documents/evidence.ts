import { createHash, randomUUID } from "node:crypto";
import {
  extractCsv,
  extractJson,
  extractTextDocument,
} from "@/lib/matter-documents/processing/text";
import type { SourceLocator } from "@/lib/matter-documents/processing/types";

export type ProjectEvidenceLocator =
  | { kind: "line"; start: number; end: number }
  | { kind: "row"; start: number; end: number }
  | { kind: "json_path"; path: string }
  | { kind: "unsupported" };

export type ProjectEvidenceCandidate = {
  ordinal: number;
  locator: ProjectEvidenceLocator;
  excerpt: string;
  excerptSha256: string;
  extractionMethod: "native";
  provenance: Record<string, string | number | boolean | null>;
};

export type ProjectEvidenceRunStatus =
  | "complete"
  | "partial"
  | "unsupported"
  | "failed";

export type ProjectEvidenceRun = {
  id: string;
  projectId: string;
  assetId: string;
  versionId: string;
  generation: number;
  sourceSha256: string;
  parserVersion: string;
  status: ProjectEvidenceRunStatus;
  errorCode: string | null;
  candidates: readonly ProjectEvidenceCandidate[];
};

export type VerifiedEvidenceSource = {
  projectId: string;
  assetId: string;
  versionId: string;
  generation: number;
  lifecycle: "active" | "withdrawn" | "deletion_pending" | "deleted";
  storageStatus: "pending" | "stored" | "failed" | "cleanup_pending";
  securityStatus: "pending" | "clean" | "rejected" | "failed";
  storageKey: string;
  objectVersionId: string | null;
  sha256: string;
  byteSize: number;
  canonicalMime: string;
};

export type AuthenticatedScanAttestation = {
  projectId: string;
  versionId: string;
  generation: number;
  objectVersionId: string;
  sha256: string;
  verdict: "clean";
  authenticated: true;
};

export interface ProjectDocumentEvidencePersistence {
  findSource(input: {
    projectId: string;
    assetId: string;
    versionId: string;
  }): Promise<VerifiedEvidenceSource | null>;
  canExtract(input: {
    actorUserId: string;
    projectId: string;
    assetId: string;
    versionId: string;
  }): Promise<boolean>;
  findReplay(input: {
    projectId: string;
    versionId: string;
    generation: number;
    parserVersion: string;
    sourceSha256: string;
  }): Promise<ProjectEvidenceRun | null>;
  findRunForReferenceIssue(input: {
    actorUserId: string;
    projectId: string;
    runId: string;
  }): Promise<ProjectEvidenceRun | null>;
  saveRun(input: {
    run: ProjectEvidenceRun;
    actorUserId: string;
    operationId: string;
    expectedProjectRevision: number;
  }): Promise<ProjectEvidenceRun>;
  issueReference(input: {
    actorUserId: string;
    projectId: string;
    runId: string;
    candidateOrdinal: number;
  }): Promise<string>;
  resolveReference(input: {
    actorUserId: string;
    projectId: string;
    evidenceRef: string;
  }): Promise<{
    run: ProjectEvidenceRun;
    candidate: ProjectEvidenceCandidate;
  } | null>;
}

export interface ExactProjectDocumentReader {
  readExactVersion(input: {
    storageKey: string;
    objectVersionId: string;
    expectedSha256: string;
    expectedByteSize: number;
  }): Promise<Uint8Array>;
}

/** This verifier must be composed only with an authenticated scan attestation source. */
export type AuthenticatedScanVerifier = (input: {
  source: VerifiedEvidenceSource;
}) => Promise<AuthenticatedScanAttestation | null>;

export class ProjectEvidenceError extends Error {
  readonly code:
    | "forbidden"
    | "source_unavailable"
    | "scan_unverified"
    | "integrity_mismatch"
    | "stale_source"
    | "invalid_request"
    | "recovery_needed";

  constructor(code: ProjectEvidenceError["code"]) {
    super(code);
    this.name = "ProjectEvidenceError";
    this.code = code;
  }
}

const PARSER_VERSION = "native_text_json_csv_v1";
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_CANDIDATES = 500;
const MAX_EXCERPT_CHARS = 2000;

function digest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function mapLocator(locator: SourceLocator): ProjectEvidenceLocator {
  if (locator.kind === "lines") {
    return { kind: "line", start: locator.lineStart, end: locator.lineEnd };
  }
  if (locator.kind === "rows") {
    return { kind: "row", start: locator.rowStart, end: locator.rowEnd };
  }
  if (locator.kind === "json_path") {
    return { kind: "json_path", path: locator.path };
  }
  return { kind: "unsupported" };
}

function parse(bytes: Uint8Array, mime: string) {
  if (mime === "text/plain" || mime === "text/markdown") {
    return extractTextDocument(bytes);
  }
  if (mime === "application/json") {
    return extractJson(bytes);
  }
  if (mime === "text/csv") {
    return extractCsv(bytes);
  }
  return null;
}

function isAttestationForSource(
  proof: AuthenticatedScanAttestation | null,
  source: VerifiedEvidenceSource
): proof is AuthenticatedScanAttestation {
  return (
    proof?.authenticated === true &&
    proof.verdict === "clean" &&
    proof.projectId === source.projectId &&
    proof.versionId === source.versionId &&
    proof.generation === source.generation &&
    proof.objectVersionId === source.objectVersionId &&
    proof.sha256 === source.sha256
  );
}

export function createProjectDocumentEvidenceService(input: {
  persistence: ProjectDocumentEvidencePersistence;
  reader: ExactProjectDocumentReader;
  verifyAuthenticatedScan?: AuthenticatedScanVerifier;
  parserVersion?: string;
}) {
  const parserVersion = input.parserVersion ?? PARSER_VERSION;
  if (!/^[a-z0-9_.-]{1,64}$/u.test(parserVersion)) {
    throw new TypeError("invalid_parser_version");
  }

  return {
    async extract(inputValue: {
      actorUserId: string;
      projectId: string;
      assetId: string;
      versionId: string;
      operationId: string;
      expectedProjectRevision: number;
    }): Promise<ProjectEvidenceRun> {
      if (
        !inputValue.actorUserId ||
        !inputValue.projectId ||
        !inputValue.assetId ||
        !inputValue.versionId ||
        !inputValue.operationId ||
        !Number.isSafeInteger(inputValue.expectedProjectRevision) ||
        inputValue.expectedProjectRevision < 1
      ) {
        throw new ProjectEvidenceError("invalid_request");
      }
      const source = await input.persistence.findSource(inputValue);
      if (
        !source ||
        source.projectId !== inputValue.projectId ||
        source.assetId !== inputValue.assetId ||
        source.versionId !== inputValue.versionId ||
        source.lifecycle !== "active" ||
        source.storageStatus !== "stored" ||
        source.securityStatus !== "clean" ||
        !source.objectVersionId
      ) {
        throw new ProjectEvidenceError("source_unavailable");
      }
      if (
        !input.verifyAuthenticatedScan ||
        !isAttestationForSource(
          await input.verifyAuthenticatedScan({ source }),
          source
        )
      ) {
        throw new ProjectEvidenceError("scan_unverified");
      }
      if (
        !(await input.persistence.canExtract({
          actorUserId: inputValue.actorUserId,
          projectId: source.projectId,
          assetId: source.assetId,
          versionId: source.versionId,
        }))
      ) {
        throw new ProjectEvidenceError("forbidden");
      }
      const replay = await input.persistence.findReplay({
        projectId: source.projectId,
        versionId: source.versionId,
        generation: source.generation,
        parserVersion,
        sourceSha256: source.sha256,
      });
      if (replay) {
        return replay;
      }
      if (
        source.byteSize < 1 ||
        source.byteSize > MAX_BYTES ||
        !/^[0-9a-f]{64}$/u.test(source.sha256)
      ) {
        throw new ProjectEvidenceError("source_unavailable");
      }
      const bytes = await input.reader.readExactVersion({
        storageKey: source.storageKey,
        objectVersionId: source.objectVersionId,
        expectedSha256: source.sha256,
        expectedByteSize: source.byteSize,
      });
      if (
        bytes.byteLength !== source.byteSize ||
        digest(bytes) !== source.sha256
      ) {
        throw new ProjectEvidenceError("integrity_mismatch");
      }
      // Recheck the independent scan and permission after I/O to close revocation races.
      const [currentSource, stillAllowed, currentProof] = await Promise.all([
        input.persistence.findSource(inputValue),
        input.persistence.canExtract({
          actorUserId: inputValue.actorUserId,
          projectId: source.projectId,
          assetId: source.assetId,
          versionId: source.versionId,
        }),
        input.verifyAuthenticatedScan({ source }),
      ]);
      if (
        !currentSource ||
        currentSource.lifecycle !== "active" ||
        currentSource.generation !== source.generation ||
        currentSource.objectVersionId !== source.objectVersionId ||
        currentSource.sha256 !== source.sha256 ||
        currentSource.securityStatus !== "clean"
      ) {
        throw new ProjectEvidenceError("stale_source");
      }
      if (!stillAllowed) {
        throw new ProjectEvidenceError("forbidden");
      }
      if (!isAttestationForSource(currentProof, source)) {
        throw new ProjectEvidenceError("scan_unverified");
      }

      let parsed: ReturnType<typeof parse> = null;
      let errorCode: string | null = null;
      try {
        parsed = parse(bytes, source.canonicalMime);
      } catch (error) {
        errorCode =
          error instanceof Error && error.message === "malformed_document"
            ? "malformed_document"
            : "processing_failed";
      }
      const status: ProjectEvidenceRunStatus = errorCode
        ? "failed"
        : parsed
          ? parsed.truncated || parsed.status !== "complete"
            ? "partial"
            : "complete"
          : "unsupported";
      const candidates: ProjectEvidenceCandidate[] = (parsed?.units ?? [])
        .slice(0, MAX_CANDIDATES)
        .map((unit, index) => {
          const excerpt = unit.extractedText.slice(0, MAX_EXCERPT_CHARS);
          return {
            ordinal: index + 1,
            locator: mapLocator(unit.locator),
            excerpt,
            excerptSha256: digest(Buffer.from(excerpt, "utf8")),
            extractionMethod: "native",
            provenance: { ...unit.provenance, contentUntrusted: true },
          };
        });
      return input.persistence.saveRun({
        actorUserId: inputValue.actorUserId,
        operationId: inputValue.operationId,
        expectedProjectRevision: inputValue.expectedProjectRevision,
        run: {
          id: randomUUID(),
          projectId: source.projectId,
          assetId: source.assetId,
          versionId: source.versionId,
          generation: source.generation,
          sourceSha256: source.sha256,
          parserVersion,
          status,
          errorCode,
          candidates,
        },
      });
    },

    async issueEvidenceRefs(inputValue: {
      actorUserId: string;
      projectId: string;
      runId: string;
    }) {
      const run = await input.persistence.findRunForReferenceIssue(inputValue);
      if (
        !run ||
        run.projectId !== inputValue.projectId ||
        (run.status !== "complete" && run.status !== "partial")
      ) {
        throw new ProjectEvidenceError("forbidden");
      }
      return Promise.all(
        run.candidates.map((candidate) =>
          input.persistence.issueReference({
            actorUserId: inputValue.actorUserId,
            projectId: inputValue.projectId,
            runId: run.id,
            candidateOrdinal: candidate.ordinal,
          })
        )
      );
    },

    resolveEvidenceRef(inputValue: {
      actorUserId: string;
      projectId: string;
      evidenceRef: string;
    }) {
      return input.persistence.resolveReference(inputValue);
    },
  };
}
