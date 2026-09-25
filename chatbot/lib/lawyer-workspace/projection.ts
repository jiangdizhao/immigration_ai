import type { LawyerWorkspaceQueueItem } from "./queue";
import { bucketForLawyerStatus, buildQuestionPreview } from "./queue";
import type {
  LawyerWorkspaceContextItem,
  LawyerWorkspaceCustomerDocumentItem,
  LawyerWorkspaceDetail,
  LawyerWorkspaceMessage,
  LawyerWorkspaceOfficialEvidenceItem,
} from "./types";

export const LAWYER_WORKSPACE_CONTEXT_LIMIT = 8;
export const LAWYER_WORKSPACE_CONTEXT_TEXT_CHARS = 8000;
export const LAWYER_WORKSPACE_OFFICIAL_EVIDENCE_LIMIT = 40;
export const LAWYER_WORKSPACE_CUSTOMER_DOCUMENT_LIMIT = 24;
export const LAWYER_WORKSPACE_EVIDENCE_TEXT_CHARS = 2000;
export const LAWYER_WORKSPACE_MESSAGE_LIMIT = 100;

function boundedText(value: unknown, maxChars: number): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const text = Array.from(value)
    .filter((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code >= 32 && code !== 127;
    })
    .join("")
    .trim();
  if (!text) {
    return null;
  }
  return text.slice(0, maxChars);
}

export function projectLawyerContextItems(
  raw: unknown,
  limit = LAWYER_WORKSPACE_CONTEXT_LIMIT,
  textChars = LAWYER_WORKSPACE_CONTEXT_TEXT_CHARS
): LawyerWorkspaceContextItem[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const items: LawyerWorkspaceContextItem[] = [];
  const bounded = raw.slice(0, Math.max(0, limit));
  for (let index = 0; index < bounded.length; index += 1) {
    const record =
      bounded[index] && typeof bounded[index] === "object"
        ? (bounded[index] as Record<string, unknown>)
        : null;
    const role =
      record?.role === "user" || record?.role === "assistant"
        ? record.role
        : "unsupported";
    const text = boundedText(record?.text, textChars) ?? "";
    if (role === "unsupported" || !text) {
      items.push({ role: "unsupported", text: "", order: index });
      continue;
    }
    items.push({ role, text, order: index });
  }
  return items;
}

function safeUrl(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const text = value.trim().slice(0, 2000);
  if (!/^https?:\/\/[^\s]+$/i.test(text)) {
    return null;
  }
  return text;
}

function formatLocator(locator: unknown): string | null {
  if (typeof locator === "string") {
    return boundedText(locator, 500);
  }
  if (!locator || typeof locator !== "object" || Array.isArray(locator)) {
    return null;
  }
  const entries = Object.entries(locator as Record<string, unknown>)
    .filter(([key, value]) => {
      if (typeof key !== "string" || key.length > 48) {
        return false;
      }
      return (
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
      );
    })
    .slice(0, 8)
    .map(([key, value]) => `${key}: ${String(value).slice(0, 120)}`);
  if (!entries.length) {
    return null;
  }
  return entries.join(" · ").slice(0, 500);
}

export type LawyerWorkspaceEvidenceProjection = {
  official: LawyerWorkspaceOfficialEvidenceItem[];
  customerDocuments: LawyerWorkspaceCustomerDocumentItem[];
  unsupportedCount: number;
};

export function projectLawyerEvidence(
  raw: unknown
): LawyerWorkspaceEvidenceProjection {
  const official: LawyerWorkspaceOfficialEvidenceItem[] = [];
  const customerDocuments: LawyerWorkspaceCustomerDocumentItem[] = [];
  let unsupportedCount = 0;
  if (!Array.isArray(raw)) {
    return { official, customerDocuments, unsupportedCount };
  }
  for (const entry of raw) {
    const record =
      entry && typeof entry === "object" && !Array.isArray(entry)
        ? (entry as Record<string, unknown>)
        : null;
    if (!record || typeof record.kind !== "string") {
      unsupportedCount += 1;
      continue;
    }
    if (record.kind === "citation" || record.kind === "compact_source") {
      if (official.length >= LAWYER_WORKSPACE_OFFICIAL_EVIDENCE_LIMIT) {
        continue;
      }
      official.push({
        kind: record.kind,
        title: boundedText(record.title, 300),
        authority: boundedText(record.authority, 200),
        sourceType: boundedText(record.source_type, 120),
        usedFor: boundedText(record.used_for, 300),
        quote: boundedText(record.quote, LAWYER_WORKSPACE_EVIDENCE_TEXT_CHARS),
        url: record.kind === "citation" ? safeUrl(record.url) : null,
        sourceId:
          record.kind === "citation"
            ? boundedText(record.source_id, 120)
            : null,
      });
      continue;
    }
    if (record.kind === "customer_document") {
      if (
        customerDocuments.length >= LAWYER_WORKSPACE_CUSTOMER_DOCUMENT_LIMIT
      ) {
        continue;
      }
      const quote = boundedText(
        record.quote,
        LAWYER_WORKSPACE_EVIDENCE_TEXT_CHARS
      );
      const filename = boundedText(record.filename, 200) ?? "Customer document";
      if (!quote) {
        unsupportedCount += 1;
        continue;
      }
      customerDocuments.push({
        filename,
        runStatus: boundedText(record.run_status, 80),
        extractionMethod: boundedText(record.extraction_method, 80),
        locator: formatLocator(record.locator),
        quote,
        truncated: record.truncated === true,
      });
      continue;
    }
    unsupportedCount += 1;
  }
  return { official, customerDocuments, unsupportedCount };
}

export function projectLawyerMessages(raw: unknown): LawyerWorkspaceMessage[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const sorted = raw
    .map((entry) => {
      const record =
        entry && typeof entry === "object" && !Array.isArray(entry)
          ? (entry as Record<string, unknown> & {
              id?: unknown;
              authorRole?: unknown;
              body?: unknown;
              createdAt?: unknown;
            })
          : null;
      return record;
    })
    .filter(
      (
        record
      ): record is Record<string, unknown> & {
        id: unknown;
        authorRole: unknown;
        body: unknown;
        createdAt: unknown;
      } => record !== null
    )
    .sort((left, right) => {
      const leftTime =
        left.createdAt instanceof Date
          ? left.createdAt.getTime()
          : new Date(String(left.createdAt ?? "")).getTime();
      const rightTime =
        right.createdAt instanceof Date
          ? right.createdAt.getTime()
          : new Date(String(right.createdAt ?? "")).getTime();
      if (
        Number.isFinite(leftTime) &&
        Number.isFinite(rightTime) &&
        leftTime !== rightTime
      ) {
        return leftTime - rightTime;
      }
      return String(left.id ?? "").localeCompare(String(right.id ?? ""));
    })
    .slice(0, LAWYER_WORKSPACE_MESSAGE_LIMIT);
  return sorted.map((record) => {
    const role =
      record.authorRole === "customer" ||
      record.authorRole === "lawyer" ||
      record.authorRole === "admin"
        ? record.authorRole
        : "unsupported";
    const body = boundedText(record.body, 8000) ?? "";
    return {
      id: typeof record.id === "string" ? record.id : "",
      authorRole: role,
      body: role === "unsupported" ? "" : body,
      createdAt:
        record.createdAt instanceof Date || typeof record.createdAt === "string"
          ? (record.createdAt as string | Date)
          : null,
    };
  });
}

function safeNullableText(value: unknown, maxChars: number): string | null {
  return boundedText(value, maxChars);
}

function safeRequiredText(value: unknown, maxChars: number): string {
  return boundedText(value, maxChars) ?? "";
}

export type LawyerWorkspaceQueueSource = {
  id: unknown;
  status: unknown;
  assistantMode?: unknown;
  legalMatterId?: unknown;
  questionSnapshot?: unknown;
  questionPreview?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
  assignedAt?: unknown;
};

export function projectLawyerQueueItem(
  source: LawyerWorkspaceQueueSource,
  customerEmail: unknown
): LawyerWorkspaceQueueItem | null {
  if (typeof source.id !== "string" || !source.id) {
    return null;
  }
  if (typeof source.status !== "string" || !source.status) {
    return null;
  }
  const email =
    typeof customerEmail === "string" && customerEmail ? customerEmail : "";
  const previewSource =
    typeof source.questionSnapshot === "string"
      ? source.questionSnapshot
      : source.questionPreview;
  return {
    id: source.id,
    customerEmail: email,
    status: source.status,
    assistantMode:
      typeof source.assistantMode === "string" ? source.assistantMode : null,
    legalMatterId:
      typeof source.legalMatterId === "string" ? source.legalMatterId : null,
    questionPreview: buildQuestionPreview(previewSource),
    createdAt: toDateOrNull(source.createdAt),
    updatedAt: toDateOrNull(source.updatedAt),
    assignedAt: toDateOrNull(source.assignedAt),
    bucket: bucketForLawyerStatus(source.status),
  };
}

function toDateOrNull(value: unknown): string | Date | null {
  if (value instanceof Date || typeof value === "string") {
    return value;
  }
  return null;
}

export function projectLawyerDetailSource(input: {
  request: Record<string, unknown>;
  customerEmail: unknown;
  messages: unknown;
  learningBridge?: unknown;
}): LawyerWorkspaceDetail | null {
  const request = input.request;
  if (typeof request.id !== "string" || !request.id) {
    return null;
  }
  if (typeof request.status !== "string" || !request.status) {
    return null;
  }
  const evidence = projectLawyerEvidence(request.evidenceSnapshot);
  const context = projectLawyerContextItems(request.contextSnapshot);
  const bridgeRecord =
    input.learningBridge && typeof input.learningBridge === "object"
      ? (input.learningBridge as Record<string, unknown>)
      : null;
  return {
    request: {
      id: request.id,
      status: request.status,
      assistantMode:
        typeof request.assistantMode === "string"
          ? request.assistantMode
          : null,
      legalMatterId:
        typeof request.legalMatterId === "string"
          ? request.legalMatterId
          : null,
      createdAt: toDateOrNull(request.createdAt),
      updatedAt: toDateOrNull(request.updatedAt),
      assignedAt: toDateOrNull(request.assignedAt),
      reviewedAt: toDateOrNull(request.reviewedAt),
      closedAt: toDateOrNull(request.closedAt),
    },
    customerEmail:
      typeof input.customerEmail === "string" ? input.customerEmail : "",
    question: safeRequiredText(request.questionSnapshot, 8000),
    aiAnswer: safeRequiredText(request.answerSnapshot, 12_000),
    customerNote: safeNullableText(request.customerNote, 4000),
    handoffContext: context,
    officialEvidence: evidence.official,
    customerDocumentEvidence: evidence.customerDocuments,
    unsupportedEvidenceCount: evidence.unsupportedCount,
    messages: projectLawyerMessages(input.messages),
    lawyerDisposition: {
      lawyerResponse: safeNullableText(request.lawyerResponse, 8000),
      correctedAnswer: safeNullableText(request.correctedAnswer, 12_000),
      preferredReasoningOrResearchApproach: safeNullableText(
        bridgeRecord?.preferredReasoningOrResearchApproach,
        8000
      ),
      createReasoningLessonCandidate:
        bridgeRecord?.createReasoningLessonCandidate === true,
    },
  };
}
