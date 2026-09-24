import type { SiteLocale } from "@/lib/site-locale";
import type {
  PortalDocument,
  PortalFact,
  PortalLawyerRequest,
  PortalMatterSnapshot,
  PortalMembership,
} from "./types";

const CONFIRMED_VALUE_SOURCES = new Set(["user_input", "carried_context"]);
const TO_CONFIRM_STATUSES = new Set([
  "missing",
  "user_unsure",
  "document_unavailable",
  "conflicting",
]);

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function safeText(value: unknown, maxLength: number): string | null {
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
  return text ? text.slice(0, maxLength) : null;
}

function scalarDisplay(value: unknown, locale: SiteLocale): string | null {
  if (typeof value === "string") {
    return safeText(value, 200);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === "boolean") {
    return locale === "zh-CN" ? (value ? "是" : "否") : value ? "Yes" : "No";
  }
  return null;
}

export function projectMatterSnapshot(
  raw: unknown,
  expectedMatterId: string,
  locale: SiteLocale
): PortalMatterSnapshot | null {
  const matter = record(raw);
  if (
    !matter ||
    matter.id !== expectedMatterId ||
    typeof matter.status !== "string"
  ) {
    return null;
  }
  const metadata = record(matter.metadata_json) ?? {};
  const compact = record(metadata.compact_state_v2) ?? {};
  const confirmedSource = record(compact.confirmed_facts) ?? {};
  const confirmedFacts: PortalFact[] = [];
  for (const [key, value] of Object.entries(confirmedSource)) {
    const fact = record(value);
    if (fact?.status !== "confirmed") {
      continue;
    }
    const keyText = safeText(key, 100);
    const valueDisplay = scalarDisplay(fact.value, locale);
    if (!keyText || !valueDisplay) {
      continue;
    }
    confirmedFacts.push({ factKey: keyText, label: keyText, valueDisplay });
    if (confirmedFacts.length === 12) {
      break;
    }
  }

  const slots = Array.isArray(metadata.fact_slot_states)
    ? metadata.fact_slot_states
    : [];
  const toConfirm: PortalFact[] = [];
  for (const rawSlot of slots) {
    const slot = record(rawSlot);
    if (
      !slot ||
      typeof slot.status !== "string" ||
      !TO_CONFIRM_STATUSES.has(slot.status)
    ) {
      continue;
    }
    const factKey = safeText(slot.fact_key, 100);
    const label = safeText(slot.label, 120);
    if (!factKey || !label) {
      continue;
    }
    const item: PortalFact = { factKey, label, status: slot.status };
    if (
      typeof slot.source === "string" &&
      CONFIRMED_VALUE_SOURCES.has(slot.source)
    ) {
      const valueDisplay = scalarDisplay(
        slot.value_display ?? slot.value,
        locale
      );
      if (valueDisplay) {
        item.valueDisplay = valueDisplay;
      }
    }
    const whyNeeded = safeText(slot.why_needed, 200);
    if (whyNeeded) {
      item.whyNeeded = whyNeeded;
    }
    if (typeof slot.required === "boolean") {
      item.required = slot.required;
    }
    if (typeof slot.blocking === "boolean") {
      item.blocking = slot.blocking;
    }
    toConfirm.push(item);
    if (toConfirm.length === 12) {
      break;
    }
  }

  const plan = record(metadata.interaction_plan) ?? {};
  const progress = record(plan.progress);
  const total = progress?.total_required;
  const collected = progress?.collected_required;
  const interactionProgress =
    Number.isInteger(total) &&
    Number.isInteger(collected) &&
    Number(total) >= 0 &&
    Number(collected) >= 0 &&
    Number(collected) <= Number(total)
      ? { collectedRequired: Number(collected), totalRequired: Number(total) }
      : null;
  const nextAction =
    plan.next_action === "answer" ||
    plan.next_action === "ask_followup" ||
    plan.next_action === "suggest_consultation"
      ? plan.next_action
      : null;

  return {
    matterId: expectedMatterId,
    backendMatterStatus: safeText(matter.status, 48) ?? "unknown",
    issueSummary: safeText(matter.issue_summary, 500),
    issueType: safeText(matter.issue_type, 120),
    visaType: safeText(matter.visa_type, 120),
    confirmedFacts,
    toConfirm,
    interactionProgress,
    nextAction,
  };
}

type DocumentRecord = {
  id: string;
  userId: string;
  chatId: string;
  legalMatterId: string | null;
  originalFilename: string;
  mimeType: string;
  byteSize: number;
  processingStatus: PortalDocument["processingStatus"];
  securityStatus: PortalDocument["securityStatus"];
  createdAt: PortalDocument["createdAt"];
  updatedAt: PortalDocument["updatedAt"];
};

export function projectPortalDocuments(
  rows: DocumentRecord[],
  {
    userId,
    chatIds,
    groupLegalMatterIdByChat,
  }: {
    userId: string;
    chatIds: Set<string>;
    groupLegalMatterIdByChat: Map<string, string | null>;
  }
): PortalDocument[] {
  return rows.slice(0, 500).flatMap((row) => {
    if (row.userId !== userId || !chatIds.has(row.chatId)) {
      return [];
    }
    const filename = safeText(row.originalFilename, 255);
    if (!filename || !Number.isFinite(row.byteSize) || row.byteSize < 0) {
      return [];
    }
    const processing = [
      "not_started",
      "processing",
      "complete",
      "failed",
    ].includes(row.processingStatus)
      ? row.processingStatus
      : "failed";
    const security = ["pending", "clean", "rejected", "failed"].includes(
      row.securityStatus
    )
      ? row.securityStatus
      : "pending";
    return [
      {
        documentId: row.id,
        chatId: row.chatId,
        legalMatterId: groupLegalMatterIdByChat.get(row.chatId) ?? null,
        originalFilename: filename,
        mimeType: safeText(row.mimeType, 100) ?? "application/octet-stream",
        byteSize: row.byteSize,
        processingStatus: processing as PortalDocument["processingStatus"],
        securityStatus: security as PortalDocument["securityStatus"],
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      },
    ];
  });
}

type LawyerRequestRecord = {
  id: string;
  userId: string;
  chatId: string | null;
  legalMatterId: string | null;
  status: string;
  assignedLawyerUserId: string | null;
  customerLastViewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  reviewedAt: Date | null;
};

export function projectLawyerRequests(
  rows: LawyerRequestRecord[],
  {
    userId,
    chatIds,
    legalMatterIds,
  }: { userId: string; chatIds: Set<string>; legalMatterIds: Set<string> }
): PortalLawyerRequest[] {
  const projected = rows.slice(0, 100).flatMap((row) => {
    const ownedLink = row.chatId
      ? chatIds.has(row.chatId)
      : Boolean(row.legalMatterId && legalMatterIds.has(row.legalMatterId));
    if (row.userId !== userId || !ownedLink) {
      return [];
    }
    return [
      {
        requestId: row.id,
        chatId: row.chatId,
        legalMatterId: row.legalMatterId,
        status: safeText(row.status, 48) ?? "unknown",
        assigned: Boolean(row.assignedLawyerUserId),
        unread: Boolean(
          row.updatedAt &&
            (!row.customerLastViewedAt ||
              row.updatedAt > row.customerLastViewedAt)
        ),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        reviewedAt: row.reviewedAt,
      },
    ];
  });
  const priority = (request: PortalLawyerRequest) => {
    if (request.status === "needs_more_information") {
      return 0;
    }
    if (request.unread) {
      return 1;
    }
    if (request.status === "pending" || request.status === "in_review") {
      return 2;
    }
    if (request.status === "confirmed" || request.status === "corrected") {
      return 3;
    }
    if (request.status === "closed") {
      return 4;
    }
    return 5;
  };
  return projected.sort((a, b) => priority(a) - priority(b));
}

export function projectMembership(
  input: {
    role: string;
    membershipTier: string;
    vipExpiresAt: Date | string | null;
    cancelAtPeriodEnd: boolean;
    currentPeriodEnd: Date | null;
  },
  now = new Date()
): PortalMembership {
  const expiry = input.vipExpiresAt ? new Date(input.vipExpiresAt) : null;
  const active =
    input.role === "user" &&
    input.membershipTier === "vip" &&
    Boolean(expiry && expiry > now);
  return {
    tier: input.membershipTier === "vip" ? "vip" : "free",
    active,
    expired: input.membershipTier === "vip" && Boolean(expiry && expiry <= now),
    vipExpiresAt: input.vipExpiresAt,
    cancelAtPeriodEnd: input.cancelAtPeriodEnd,
    currentPeriodEnd: input.currentPeriodEnd,
    premiumAllowed: active,
  };
}
