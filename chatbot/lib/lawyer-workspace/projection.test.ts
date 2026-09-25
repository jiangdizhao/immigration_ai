import assert from "node:assert/strict";
import test from "node:test";
import {
  projectLawyerContextItems,
  projectLawyerDetailSource,
  projectLawyerEvidence,
  projectLawyerQueueItem,
} from "./projection";

test("queue projection excludes raw database and snapshot internals", () => {
  const item = projectLawyerQueueItem(
    {
      id: "request-1",
      status: "pending",
      assistantMode: "default",
      legalMatterId: "matter-1",
      questionSnapshot: "Can I apply for this visa?",
      userId: "customer-1",
      reviewerUserId: "reviewer-1",
    },
    "customer@example.test"
  );
  assert.ok(item);
  assert.deepEqual(Object.keys(item ?? {}).sort(), [
    "assignedAt",
    "assistantMode",
    "bucket",
    "createdAt",
    "customerEmail",
    "id",
    "legalMatterId",
    "questionPreview",
    "status",
    "updatedAt",
  ]);
  assert.equal(item?.bucket, "needs_action");
  assert.equal(item?.questionPreview, "Can I apply for this visa?");
});

test("context projection preserves role and order within a bound", () => {
  const raw = Array.from({ length: 10 }, (_, index) => ({
    role: index % 2 === 0 ? "user" : "assistant",
    text: `message ${index}`,
  }));
  const items = projectLawyerContextItems(raw);
  assert.equal(items.length, 8);
  assert.deepEqual(
    items.map((item) => item.order),
    [0, 1, 2, 3, 4, 5, 6, 7]
  );
  assert.equal(items[0].role, "user");
  assert.equal(items[1].role, "assistant");
});

test("legacy context fails soft without raw JSON", () => {
  const items = projectLawyerContextItems([
    { role: "user", text: "  hello  " },
    { role: "system", text: "should not leak" },
    null,
  ]);
  assert.equal(items.length, 3);
  assert.equal(items[0].text, "hello");
  assert.equal(items[1].role, "unsupported");
  assert.equal(items[1].text, "");
});

test("evidence classes remain separate and private fields do not leak", () => {
  const projected = projectLawyerEvidence([
    {
      kind: "citation",
      title: "Migration Act",
      quote: "A bounded quote.",
      url: "https://example.test/act",
      storageKey: "private-key",
    },
    { kind: "compact_source", title: "Regulations overview" },
    {
      kind: "customer_document",
      filename: "letter.pdf",
      quote: "Customer excerpt.",
      locator: { kind: "page", pageNumber: 2 },
      storageKey: "private-key",
    },
    { kind: "future_kind", raw: { secret: true } },
  ]);
  assert.equal(projected.official.length, 2);
  assert.equal(projected.customerDocuments.length, 1);
  assert.equal(projected.unsupportedCount, 1);
  assert.equal(
    projected.customerDocuments[0].locator,
    "kind: page · pageNumber: 2"
  );
  const serialized = JSON.stringify(projected);
  assert.equal(serialized.includes("private-key"), false);
  assert.equal(serialized.includes("secret"), false);
});

test("learning feedback remains secondary and hides internal artifact IDs", () => {
  const withBridge = projectLawyerDetailSource({
    request: {
      id: "request-1",
      status: "confirmed",
      assistantMode: "default",
      legalMatterId: null,
      questionSnapshot: "Question?",
      answerSnapshot: "Answer.",
      contextSnapshot: [],
      evidenceSnapshot: [],
      customerNote: null,
      lawyerResponse: "Checked.",
      correctedAnswer: null,
    },
    customerEmail: "customer@example.test",
    messages: [],
    learningBridge: {
      preferredReasoningOrResearchApproach: "Keep procedure notes.",
      createReasoningLessonCandidate: true,
      answerTraceId: "trace-secret",
      experienceRecordId: "experience-secret",
    },
  });
  assert.ok(withBridge);
  assert.equal(
    withBridge?.lawyerDisposition.preferredReasoningOrResearchApproach,
    "Keep procedure notes."
  );
  assert.equal(
    withBridge?.lawyerDisposition.createReasoningLessonCandidate,
    true
  );
  const serialized = JSON.stringify(withBridge);
  assert.equal(serialized.includes("trace-secret"), false);
  assert.equal(serialized.includes("experience-secret"), false);

  const withoutBridge = projectLawyerDetailSource({
    request: {
      id: "request-1",
      status: "confirmed",
      assistantMode: "default",
      legalMatterId: null,
      questionSnapshot: "Question?",
      answerSnapshot: "Answer.",
      contextSnapshot: [],
      evidenceSnapshot: [],
      customerNote: null,
      lawyerResponse: "Checked.",
      correctedAnswer: null,
      preferredReasoningOrResearchApproach: "Request field must not leak.",
    },
    customerEmail: "customer@example.test",
    messages: [],
  });
  assert.equal(
    withoutBridge?.lawyerDisposition.preferredReasoningOrResearchApproach,
    null
  );
  assert.equal(
    JSON.stringify(withoutBridge).includes("Request field must not leak."),
    false
  );
});

test("long locators and quotes stay bounded and safe", () => {
  const projected = projectLawyerEvidence([
    {
      kind: "citation",
      title: `Title ${"x".repeat(5000)}`,
      quote: `Quote ${"y".repeat(5000)}`,
      url: "https://example.test/very/long/path",
      source_id: "source-1",
    },
    {
      kind: "customer_document",
      filename: `evidence-${"f".repeat(500)}.pdf`,
      quote: `Excerpt ${"z".repeat(5000)}`,
      locator: {
        kind: "page",
        pageNumber: 12,
        nested: { deep: true },
        overlong: "v".repeat(500),
      },
    },
  ]);
  assert.ok((projected.official[0].title ?? "").length <= 300);
  assert.ok((projected.official[0].quote ?? "").length <= 2000);
  assert.equal(projected.customerDocuments[0].filename.length <= 200, true);
  assert.ok((projected.customerDocuments[0].locator ?? "").length <= 500);
  assert.ok(projected.customerDocuments[0].quote.length <= 2000);
  const serialized = JSON.stringify(projected);
  assert.equal(serialized.includes("deep"), false);
});

test("messages remain chronological and detail hides raw snapshots", () => {
  const detail = projectLawyerDetailSource({
    request: {
      id: "request-1",
      status: "pending",
      assistantMode: "default",
      legalMatterId: "matter-1",
      questionSnapshot: "Question?",
      answerSnapshot: "Answer.",
      contextSnapshot: [],
      evidenceSnapshot: [],
      customerNote: null,
      lawyerResponse: null,
      correctedAnswer: null,
    },
    customerEmail: "customer@example.test",
    messages: [
      {
        id: "message-2",
        authorRole: "customer",
        body: "Second reply",
        createdAt: "2026-09-02T00:00:00.000Z",
      },
      {
        id: "message-1",
        authorRole: "lawyer",
        body: "First question",
        createdAt: "2026-09-01T00:00:00.000Z",
      },
    ],
  });
  assert.ok(detail);
  assert.deepEqual(
    detail?.messages.map((message) => message.id),
    ["message-1", "message-2"]
  );
  const detailJson = JSON.stringify(detail);
  assert.equal(detailJson.includes("contextSnapshot"), false);
  assert.equal(detailJson.includes("evidenceSnapshot"), false);
});
