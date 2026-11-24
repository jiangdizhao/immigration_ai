import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildAssistantMessageParts,
  extractAssistantMetadata,
  extractTextFromParts,
  isMetadataPart,
  latestCourseResearchResults,
  MAX_PERSISTED_LOCATORS,
  MAX_PERSISTED_MANIFEST_SOURCES,
  sanitizeCustomerDocumentSources,
} from "./message-parts";

const courseProjectId = "11111111-1111-4111-8111-111111111111";
const courseChatId = "22222222-2222-4222-8222-222222222222";
const courseSchoolAId = "33333333-3333-4333-8333-333333333333";
const courseSchoolBId = "44444444-4444-4444-8444-444444444444";

function courseResult(messageId: string, targetId = courseSchoolAId) {
  return {
    schemaVersion: "phase15.course-research-result.v1",
    projectId: courseProjectId,
    chatId: courseChatId,
    taskId: `phase15.project-workflows.v1:school_application:school_discovery:school_application:${targetId}`,
    definitionVersion: "phase15.project-workflows.v1",
    workflowKind: "school_application",
    stepKey: "school_discovery",
    targetKind: "school_application",
    targetId,
    sourceRevisions: [
      { targetKind: "school_application", targetId, revision: 1 },
    ],
    observedAt: "2026-11-24T00:00:00.000000Z",
    candidates: [
      {
        candidateId:
          targetId === courseSchoolAId
            ? "55555555-5555-4555-8555-555555555555"
            : "66666666-6666-4666-8666-666666666666",
        institutionName: "Example University",
        courseTitle: "Master of Example Studies",
        identityEvidenceLevel: "model_research_lead",
        identitySourceIds: [],
        fields: [],
        sources: [],
        limitations: ["Model research lead; unverified."],
        verificationState: "not_requested",
      },
    ],
    limitations: ["Research is exploratory."],
    diagnostics: { invalidCandidateCount: 0 },
    assistantMessageId: messageId,
  };
}

test("course history retains the latest bound result per target across ordinary turns", () => {
  const schoolAFirstId = "77777777-7777-4777-8777-777777777777";
  const schoolBMessageId = "88888888-8888-4888-8888-888888888888";
  const schoolASecondId = "99999999-9999-4999-8999-999999999999";
  const results = latestCourseResearchResults([
    {
      id: schoolAFirstId,
      role: "assistant",
      courseResearchResult: courseResult(schoolAFirstId),
    },
    {
      id: schoolBMessageId,
      role: "assistant",
      courseResearchResult: courseResult(schoolBMessageId, courseSchoolBId),
    },
    { id: "user-turn", role: "user" },
    {
      id: schoolASecondId,
      role: "assistant",
      courseResearchResult: courseResult(schoolASecondId),
    },
    { id: "later-ordinary-assistant-turn", role: "assistant" },
    {
      id: "mismatched-message",
      role: "assistant",
      courseResearchResult: courseResult(schoolAFirstId),
    },
  ]);
  assert.equal(results.length, 2);
  assert.equal(
    results.find((result) => result.targetId === courseSchoolAId)
      ?.assistantMessageId,
    schoolASecondId
  );
  assert.equal(
    results.find((result) => result.targetId === courseSchoolBId)
      ?.assistantMessageId,
    schoolBMessageId
  );
});

test("assistant parts keep the text and metadata part order used by the reload route", () => {
  const parts = buildAssistantMessageParts({
    text: "Condition 8501 requires health cover.",
    metadata: {
      compactSources: ["Migration Regulations 1994 Sch 8"],
      confidence: "high",
    },
  });
  assert.equal(parts.length, 2);
  assert.deepEqual(parts[0], {
    type: "text",
    text: "Condition 8501 requires health cover.",
  });
  assert.equal(isMetadataPart(parts[1]), true);
  assert.equal(
    extractTextFromParts(parts),
    "Condition 8501 requires health cover."
  );
});

test("only a server-bound AI action suggestion survives assistant history reload", () => {
  const bound = {
    schemaVersion: "phase15.bound-ai-action-suggestion.v1",
    suggestion: {
      schemaVersion: "phase15.ai-action-suggestion.v1",
      operation: "set_customer_reported_field",
      fieldPath: "schoolApplication.intakeLabel",
      proposedValue: "July 2027",
      targetReference: null,
      sourceOrAssumption: "The user requested July 2027.",
      explanation: "This records a customer-reported intake label.",
    },
    projectId: "11111111-1111-4111-8111-111111111111",
    chatId: "22222222-2222-4222-8222-222222222222",
    taskId: "school_application:school_discovery:school-1",
    definitionVersion: "phase15.project-workflows.v1",
    workflowKind: "school_application",
    stepKey: "school_discovery",
    targetKind: "school_application",
    targetId: "33333333-3333-4333-8333-333333333333",
    sourceRevisions: [
      {
        targetKind: "school_application",
        targetId: "33333333-3333-4333-8333-333333333333",
        revision: 5,
      },
    ],
  };
  const metadata = extractAssistantMetadata([
    { type: "metadata", aiActionSuggestion: bound },
  ]);
  assert.deepEqual(metadata.aiActionSuggestion, bound);
  assert.equal(
    extractAssistantMetadata([
      {
        type: "metadata",
        // The model-facing suggestion alone has no server-bound Chat, Project,
        // task, target or source-revision envelope and cannot become actionable
        // when encountered as persisted assistant metadata.
        aiActionSuggestion: bound.suggestion,
      },
    ]).aiActionSuggestion,
    null
  );
});

test("acceptance-critical metadata survives a reload unchanged", () => {
  const parts = [
    { type: "text", text: "Answer" },
    {
      type: "metadata",
      compactSources: ["Migration Act 1958 s 476", "Home Affairs guidance"],
      citations: [
        {
          source_id: "source-1",
          title: "Migration Act 1958",
          authority: "Cth",
          section_ref: "s 476",
          url: "https://example.test/act",
          quote: "quote",
          source_type: "legislation",
          used_for: "review rights",
        },
      ],
      customerDocumentEvidenceUsed: true,
      customerDocumentManifest: [
        {
          documentId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
          runId: "rrrrrrrr-rrrr-4rrr-8rrr-rrrrrrrrrrrr",
          originalFilename: "passport.pdf",
          runStatus: "partial",
          extractionMethod: "mixed",
          truncated: true,
          locators: [{ kind: "page", pageNumber: 3 }],
        },
      ],
      confidence: "medium",
      researchStatus: "incomplete",
      followUpQuestions: ["What is the decision date?"],
      matterId: "matter-42",
      retrievalDebug: { queries: ["8501"] },
    },
  ];

  const metadata = extractAssistantMetadata(parts);
  assert.equal(metadata.compactSources.length, 2);
  assert.equal(metadata.citations.length, 1);
  assert.equal(metadata.customerDocumentEvidenceUsed, true);
  assert.equal(metadata.customerDocumentSources.length, 1);
  assert.equal(
    metadata.customerDocumentSources[0]?.originalFilename,
    "passport.pdf"
  );
  assert.equal(metadata.customerDocumentSources[0]?.runStatus, "partial");
  assert.equal(metadata.customerDocumentSources[0]?.truncated, true);
  assert.deepEqual(metadata.customerDocumentSources[0]?.locators, [
    { kind: "page", pageNumber: 3 },
  ]);
  assert.equal(metadata.confidence, "medium");
  assert.equal(metadata.researchStatus, "incomplete");
  assert.deepEqual(metadata.followUpQuestions, ["What is the decision date?"]);
  assert.equal(metadata.matterId, "matter-42");
  assert.deepEqual(metadata.retrievalDebug, { queries: ["8501"] });
});

test("a document manifest is not surfaced when evidence use is not acknowledged", () => {
  const metadata = extractAssistantMetadata([
    { type: "text", text: "Answer" },
    {
      type: "metadata",
      customerDocumentEvidenceUsed: false,
      customerDocumentManifest: [
        {
          documentId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
          runId: "rrrrrrrr-rrrr-4rrr-8rrr-rrrrrrrrrrrr",
          originalFilename: "private.pdf",
          runStatus: "complete",
          extractionMethod: "native",
          truncated: false,
          locators: [],
        },
      ],
    },
  ]);
  assert.equal(metadata.customerDocumentEvidenceUsed, false);
  assert.deepEqual(metadata.customerDocumentSources, []);
});

test("R1: a supplied-but-unconfirmed packet reloads as unconfirmed", () => {
  const metadata = extractAssistantMetadata([
    { type: "text", text: "Answer" },
    {
      type: "metadata",
      customerDocumentEvidenceUsed: false,
      customerDocumentUsage: "supplied_unconfirmed",
      customerDocumentManifest: [],
    },
  ]);
  assert.equal(metadata.customerDocumentEvidenceUsed, false);
  assert.equal(metadata.customerDocumentUsage, "supplied_unconfirmed");
  // The visible evidence card stays hidden without verified use.
  assert.deepEqual(metadata.customerDocumentSources, []);
});

test("R1: legacy metadata without a usage state reloads as not supplied", () => {
  const metadata = extractAssistantMetadata([
    { type: "text", text: "Answer" },
    { type: "metadata", customerDocumentEvidenceUsed: false },
  ]);
  assert.equal(metadata.customerDocumentUsage, "not_supplied");
  assert.equal(metadata.customerDocumentEvidenceUsed, false);
});

test("R1: a stored confirmed usage still requires the verified boolean", () => {
  const untrusted = extractAssistantMetadata([
    { type: "text", text: "Answer" },
    { type: "metadata", customerDocumentUsage: "confirmed" },
  ]);
  assert.equal(untrusted.customerDocumentUsage, "not_supplied");
  assert.equal(untrusted.customerDocumentEvidenceUsed, false);

  const verified = extractAssistantMetadata([
    { type: "text", text: "Answer" },
    {
      type: "metadata",
      customerDocumentEvidenceUsed: true,
      customerDocumentUsage: "confirmed",
      customerDocumentManifest: [
        {
          documentId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
          runId: "rrrrrrrr-rrrr-4rrr-8rrr-rrrrrrrrrrrr",
          originalFilename: "grant.pdf",
          runStatus: "complete",
          extractionMethod: "native",
          truncated: false,
          locators: [],
        },
      ],
    },
  ]);
  assert.equal(verified.customerDocumentUsage, "confirmed");
  assert.equal(verified.customerDocumentEvidenceUsed, true);
  assert.equal(verified.customerDocumentSources.length, 1);
});

test("stored document sources are bounded and sanitized", () => {
  const sources = sanitizeCustomerDocumentSources(
    Array.from({ length: MAX_PERSISTED_MANIFEST_SOURCES + 6 }, (_, index) => ({
      documentId: `document-${index}`,
      runId: `run-${index}`,
      originalFilename: "x".repeat(400),
      runStatus: "unknown-status",
      extractionMethod: "native",
      truncated: "yes",
      locators: Array.from(
        { length: MAX_PERSISTED_LOCATORS + 4 },
        (_, locator) => ({
          kind: "page",
          pageNumber: locator,
          injected: "y".repeat(500),
        })
      ),
    }))
  );
  assert.equal(sources.length, MAX_PERSISTED_MANIFEST_SOURCES);
  for (const source of sources) {
    assert.equal(source.originalFilename.length, 255);
    assert.equal(source.runStatus, "complete");
    assert.equal(source.truncated, false);
    assert.ok(source.locators.length <= MAX_PERSISTED_LOCATORS);
    for (const locator of source.locators) {
      for (const value of Object.values(locator)) {
        assert.ok(typeof value !== "string" || value.length <= 256);
      }
    }
  }
});

test("malformed or missing parts degrade to an empty answer instead of throwing", () => {
  assert.equal(extractTextFromParts(null), "");
  assert.equal(
    extractTextFromParts({ type: "text", text: "not an array" }),
    ""
  );
  const metadata = extractAssistantMetadata([null, "string", 42]);
  assert.deepEqual(metadata.compactSources, []);
  assert.equal(metadata.matterId, null);
  assert.equal(metadata.customerDocumentEvidenceUsed, false);
});

test("R2: reload exposes only the acknowledged document subset", () => {
  const source = (documentId: string) => ({
    documentId,
    runId: `run-${documentId}`,
    originalFilename: `${documentId}.pdf`,
    runStatus: "complete",
    extractionMethod: "native",
    truncated: false,
    locators: [{ kind: "page", page: 1 }],
  });
  const parts = [
    {
      type: "metadata",
      compactSources: [],
      citations: [],
      customerDocumentEvidenceUsed: true,
      customerDocumentManifest: [
        source("doc-1"),
        source("doc-2"),
        source("doc-3"),
      ],
      customerDocumentUsedIds: ["doc-2", "doc-99"],
    },
  ];
  const metadata = extractAssistantMetadata(parts);
  // Only the acknowledged, request-authorized document is exposed as used.
  assert.deepEqual(
    metadata.customerDocumentSources.map((entry) => entry.documentId),
    ["doc-2"]
  );

  // No acknowledged ids: nothing may be reported as used, even when the stored
  // manifest and the verified boolean are present.
  const unacknowledged = extractAssistantMetadata([
    {
      type: "metadata",
      compactSources: [],
      citations: [],
      customerDocumentEvidenceUsed: true,
      customerDocumentManifest: [source("doc-1")],
      customerDocumentUsedIds: [],
    },
  ]);
  assert.deepEqual(unacknowledged.customerDocumentSources, []);

  // Legacy answers (stored before per-document acknowledgements) keep what they
  // stored; no new answer can reach this path.
  const legacy = extractAssistantMetadata([
    {
      type: "metadata",
      compactSources: [],
      citations: [],
      customerDocumentEvidenceUsed: true,
      customerDocumentManifest: [source("doc-1")],
    },
  ]);
  assert.deepEqual(
    legacy.customerDocumentSources.map((entry) => entry.documentId),
    ["doc-1"]
  );
});
