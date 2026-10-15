// biome-ignore-all lint/suspicious/useAwait: in-memory repositories implement async interfaces without external IO.
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { test } from "node:test";
import { type WorkBook, write } from "xlsx";
import yazl from "yazl";
import type { MatterDocument } from "@/lib/db/schema";
import {
  buildBoundedMatterDocumentEvidence,
  resolveConversationMatterDocumentEvidence,
} from "./ai-evidence-packet";
import { MATTER_DOCUMENT_MIME } from "./formats";
import { createMatterDocumentHandlers } from "./http";
import {
  createMatterDocumentProcessingService,
  type ProcessingRepository,
} from "./processing/service";
import { createMatterDocumentService } from "./service";
import type { MatterDocumentRepository } from "./types";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const CHAT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function makePdf(text: string) {
  const bodies = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> /Contents 4 0 R >>",
  ];
  const stream = `BT /F1 12 Tf 20 200 Td (${text}) Tj ET`;
  bodies.push(
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`
  );
  let output = "%PDF-1.4\n";
  const offsets = [0];
  bodies.forEach((body, index) => {
    offsets.push(Buffer.byteLength(output));
    output += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(output);
  output += `xref\n0 ${bodies.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) {
    output += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  output += `trailer\n<< /Size ${bodies.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Uint8Array(Buffer.from(output));
}

function makeDocx(text: string) {
  return new Promise<Uint8Array>((resolve, reject) => {
    const archive = new yazl.ZipFile();
    const chunks: Buffer[] = [];
    archive.outputStream.on("data", (chunk: Buffer) => chunks.push(chunk));
    archive.outputStream.on("error", reject);
    archive.outputStream.on("end", () =>
      resolve(new Uint8Array(Buffer.concat(chunks)))
    );
    archive.addBuffer(
      Buffer.from(
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'
      ),
      "[Content_Types].xml"
    );
    archive.addBuffer(
      Buffer.from(
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'
      ),
      "_rels/.rels"
    );
    archive.addBuffer(
      Buffer.from(
        `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`
      ),
      "word/document.xml"
    );
    archive.end();
  });
}

function makePng() {
  const bytes = new Uint8Array(24);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  new DataView(bytes.buffer).setUint32(16, 10);
  new DataView(bytes.buffer).setUint32(20, 8);
  return bytes;
}

function makeXlsx(text: string) {
  const workbook = {
    SheetNames: ["Evidence"],
    Sheets: {
      Evidence: {
        A1: { t: "s", v: text },
        A2: { t: "n", v: 42 },
        "!ref": "A1:A2",
      },
    },
  } as unknown as WorkBook;
  return new Uint8Array(write(workbook, { type: "buffer", bookType: "xlsx" }));
}

type Fixture = {
  filename: string;
  mimeType: (typeof MATTER_DOCUMENT_MIME)[keyof typeof MATTER_DOCUMENT_MIME];
  bytes: Uint8Array;
  expected: string;
  vision?: boolean;
};

const fixtures = async (): Promise<Fixture[]> => [
  {
    filename: "case.pdf",
    mimeType: MATTER_DOCUMENT_MIME.pdf,
    bytes: makePdf("FAST PDF EVIDENCE MARKER"),
    expected: "FAST PDF EVIDENCE MARKER",
  },
  {
    filename: "case.docx",
    mimeType: MATTER_DOCUMENT_MIME.docx,
    bytes: await makeDocx("FAST DOCX EVIDENCE MARKER"),
    expected: "FAST DOCX EVIDENCE MARKER",
  },
  {
    filename: "case.txt",
    mimeType: MATTER_DOCUMENT_MIME.txt,
    bytes: Buffer.from("FAST TXT EVIDENCE MARKER"),
    expected: "FAST TXT EVIDENCE MARKER",
  },
  {
    filename: "case.xlsx",
    mimeType: MATTER_DOCUMENT_MIME.xlsx,
    bytes: makeXlsx("FAST XLSX EVIDENCE MARKER"),
    expected: "FAST XLSX EVIDENCE MARKER",
  },
  {
    filename: "case.png",
    mimeType: MATTER_DOCUMENT_MIME.png,
    bytes: makePng(),
    expected: "FAST PNG VISION EVIDENCE MARKER",
    vision: true,
  },
];

// biome-ignore lint/style/noDoneCallback: the Node test context carries benchmark diagnostics.
test("uploaded PDF, DOCX, TXT, XLSX and Vision PNG reach a Fast request as persisted evidence", async (t) => {
  const stored = new Map<string, Uint8Array>();
  const records = new Map<string, MatterDocument>();
  const runs = new Map<
    string,
    { id: string; status: string; extractionMethod: string; truncated: boolean }
  >();
  const evidenceByRun = new Map<
    string,
    Array<{
      ordinal: number;
      locator: Record<string, string | number>;
      extractedText: string;
      extractionMethod: string;
    }>
  >();
  let nextDocumentId = 0;
  const pipelineMeasurements: Array<{
    format: string;
    uploadRequestMs: number;
    storageCompletionMs: number;
    processingRequestMs: number;
    evidencePersistenceMs: number;
    evidenceRetrievalMs: number;
  }> = [];
  const storagePutMs = new Map<string, number>();
  const persistenceMs = new Map<string, number>();
  const uploadRepository: MatterDocumentRepository = {
    async getOwnedConversation({ chatId, userId }) {
      return chatId === CHAT_ID && userId === USER_ID
        ? { legalMatterId: null }
        : null;
    },
    async create(input) {
      nextDocumentId += 1;
      const id = `10000000-0000-4000-8000-${String(nextDocumentId).padStart(12, "0")}`;
      const record: MatterDocument = {
        ...input,
        id,
        deletedAt: null,
        createdAt: new Date(nextDocumentId),
        updatedAt: new Date(nextDocumentId),
      };
      records.set(id, record);
      return record;
    },
    async getForStorageCleanup(documentId) {
      return records.get(documentId) ?? null;
    },
    async transitionStorageStatus({ documentId, expected, next }) {
      const record = records.get(documentId);
      if (!record || !expected.includes(record.storageStatus)) {
        return null;
      }
      const updated = {
        ...record,
        storageStatus: next,
        ...(next === "stored" ? { securityStatus: "clean" as const } : {}),
      };
      records.set(documentId, updated);
      return updated;
    },
    async list() {
      return [...records.values()];
    },
    async listForUserHistory() {
      return { documents: [], hasMore: false };
    },
    async getForOwner({ documentId, userId }) {
      const record = records.get(documentId);
      return record?.userId === userId ? record : null;
    },
    async softDelete() {
      return null;
    },
  };
  const storage = {
    async put(input: { key: string; body: Uint8Array }) {
      const startedAt = performance.now();
      stored.set(input.key, new Uint8Array(input.body));
      storagePutMs.set(input.key, performance.now() - startedAt);
    },
    async get(input: { key: string }) {
      const bytes = stored.get(input.key);
      if (!bytes) {
        throw new Error("synthetic storage missing");
      }
      return new Uint8Array(bytes);
    },
    async delete(input: { key: string }) {
      stored.delete(input.key);
    },
  };
  const uploadService = createMatterDocumentService({
    repository: uploadRepository,
    storage,
    newId: () => `upload-${nextDocumentId + 1}`,
  });
  const uploadHandlers = createMatterDocumentHandlers({
    authenticate: async () => ({
      userId: USER_ID,
      type: "regular",
      role: "user",
    }),
    service: uploadService,
  });
  const processingRepository: ProcessingRepository = {
    async getForOwner({ documentId, userId }) {
      const record = records.get(documentId);
      return record?.userId === userId ? record : null;
    },
    async latest({ documentId, userId }) {
      const record = [...records.values()].find(
        (candidate) =>
          candidate.id === documentId && candidate.userId === userId
      );
      const run = record ? runs.get(record.id) : null;
      return run ? { id: run.id, status: run.status } : null;
    },
    async begin({ documentId, userId, runId }) {
      const record = records.get(documentId);
      if (
        !record ||
        record.userId !== userId ||
        record.storageStatus !== "stored" ||
        record.securityStatus !== "clean" ||
        record.processingStatus !== "not_started"
      ) {
        return null;
      }
      record.processingStatus = "processing";
      const run = {
        id: runId,
        status: "processing",
        extractorVersion: "test",
        extractionMethod: "native",
        truncated: false,
      };
      runs.set(documentId, run);
      return { record, run: { id: runId } };
    },
    async finalize(input) {
      const startedAt = performance.now();
      const record = records.get(input.documentId);
      const run = runs.get(input.documentId);
      assert.ok(record && run);
      run.status = input.status;
      run.extractionMethod = input.extractionMethod;
      run.truncated = input.truncated;
      evidenceByRun.set(
        run.id,
        input.units.map((unit) => ({
          ordinal: unit.ordinal,
          locator: unit.locator,
          extractedText: unit.extractedText,
          extractionMethod: unit.extractionMethod,
        }))
      );
      record.processingStatus = "complete";
      persistenceMs.set(input.documentId, performance.now() - startedAt);
    },
    async fail({ documentId, errorCode }) {
      const record = records.get(documentId);
      const run = runs.get(documentId);
      if (record && run) {
        run.status = "failed";
        record.processingStatus = "failed";
      }
      throw new Error(`unexpected processing failure: ${errorCode}`);
    },
    async getEvidence({ documentId, runId }) {
      const run = runs.get(documentId);
      return {
        run,
        units:
          run && (!runId || run.id === runId)
            ? (evidenceByRun.get(run.id) ?? [])
            : [],
      };
    },
  };
  const observed = await fixtures();
  for (const fixture of observed) {
    const uploadStartedAt = performance.now();
    const uploadResponse = await uploadHandlers.upload(
      new Request(`https://app.test/api/matter-documents?chatId=${CHAT_ID}`, {
        method: "POST",
        headers: {
          "content-type": fixture.mimeType,
          "x-original-filename": encodeURIComponent(fixture.filename),
        },
        body: fixture.bytes,
      })
    );
    const uploadRequestMs = performance.now() - uploadStartedAt;
    assert.equal(uploadResponse.status, 201);
    const uploadBody = (await uploadResponse.json()) as {
      document: { id: string };
    };
    const uploaded = uploadBody.document;
    const record = records.get(uploaded.id);
    assert.ok(record);
    assert.equal(record.storageStatus, "stored");
    assert.ok(stored.has(record.storageKey));
    const visionCalls: string[] = [];
    const processingService = createMatterDocumentProcessingService({
      repository: processingRepository,
      storage,
      vision: fixture.vision
        ? {
            async extract(input) {
              visionCalls.push(input.mediaType);
              return fixture.expected;
            },
          }
        : fixture.filename.endsWith(".pdf")
          ? {
              async extract() {
                visionCalls.push("unexpected");
                return "unexpected vision call";
              },
            }
          : undefined,
    });
    const processingStartedAt = performance.now();
    const processed = await processingService.process({
      documentId: uploaded.id,
      userId: USER_ID,
    });
    const processingRequestMs = performance.now() - processingStartedAt;
    assert.equal(processed.status, "complete");
    const run = runs.get(uploaded.id);
    assert.ok(run);
    const persisted = evidenceByRun.get(run.id) ?? [];
    assert.ok(persisted.length > 0);
    assert.ok(
      persisted.some((unit) => unit.extractedText.includes(fixture.expected))
    );
    if (fixture.filename.endsWith(".pdf")) {
      assert.deepEqual(visionCalls, []);
    }

    const evidenceStartedAt = performance.now();
    const resolved = await resolveConversationMatterDocumentEvidence({
      userId: USER_ID,
      chatId: CHAT_ID,
      documents: [record],
      getLatestAttempt: async () => ({
        id: run.id,
        status: run.status,
        extractionMethod: run.extractionMethod,
        truncated: run.truncated,
      }),
      getEvidence: async (documentId, runId) => {
        if (runId !== run.id) {
          return null;
        }
        const result = (await processingService.getEvidence({
          documentId,
          userId: USER_ID,
          runId,
        })) as { units: typeof persisted } | null;
        return result?.units ?? [];
      },
    });
    const packet = buildBoundedMatterDocumentEvidence({
      documents: resolved.evidence.documents.map((document) => ({
        document: {
          id: document.documentId,
          originalFilename: document.originalFilename,
          mimeType: document.mimeType,
        },
        run: {
          id: document.runId,
          status: document.runStatus,
          extractionMethod: document.extractionMethod,
          truncated: document.truncated,
        },
        units: document.units.map((unit) => ({
          ordinal: unit.ordinal,
          locator: unit.locator,
          extractedText: unit.text,
          extractionMethod: unit.extractionMethod,
        })),
      })),
    });
    let sentRequest:
      | { mode: string; customer_document_evidence: unknown }
      | undefined;
    const mockedFastTransport = async (request: typeof sentRequest) => {
      sentRequest = request;
    };
    await mockedFastTransport({
      mode: "fast",
      customer_document_evidence: packet.evidence,
    });
    const evidenceRetrievalMs = performance.now() - evidenceStartedAt;
    assert.ok(sentRequest);
    assert.match(
      JSON.stringify(sentRequest.customer_document_evidence),
      new RegExp(fixture.expected)
    );
    assert.equal(packet.manifest.length, 1);
    assert.equal(packet.manifest[0].documentId, uploaded.id);
    t.diagnostic(
      `pipeline-stage ${fixture.filename}: single upload_request=${uploadRequestMs.toFixed(2)}ms storage_completion=${(storagePutMs.get(record.storageKey) ?? 0).toFixed(2)}ms processing_request=${processingRequestMs.toFixed(2)}ms evidence_persistence=${(persistenceMs.get(uploaded.id) ?? 0).toFixed(2)}ms evidence_retrieval=${evidenceRetrievalMs.toFixed(2)}ms`
    );
    pipelineMeasurements.push({
      format: fixture.filename.split(".").at(-1) ?? "unknown",
      uploadRequestMs,
      storageCompletionMs: storagePutMs.get(record.storageKey) ?? 0,
      processingRequestMs,
      evidencePersistenceMs: persistenceMs.get(uploaded.id) ?? 0,
      evidenceRetrievalMs,
    });
  }
  const reportPath = process.env.DOCUMENT_PROCESSING_REPORT_PATH;
  if (reportPath) {
    await writeFile(
      reportPath,
      JSON.stringify(
        {
          runtime: {
            node: process.version,
            platform: process.platform,
            arch: process.arch,
          },
          infrastructure:
            "in-memory repositories and object storage; mocked Vision and Fast transport",
          samplesPerFormat: 1,
          measurements: pipelineMeasurements,
        },
        null,
        2
      )
    );
  }
});
