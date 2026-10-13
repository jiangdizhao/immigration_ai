import {
  POLICY_SLUG_PATTERN,
  type PolicyWorkspaceReference,
  type PublicPolicyProduct,
} from "../policy-intelligence-product";

/**
 * Phase 12 Stage 2 — durable policy-to-conversation binding contract.
 *
 * A policy launch must survive reloads, history reopening, a second device and
 * client-side navigation, so the binding lives in PostgreSQL next to the owned
 * conversation instead of in transient React state. Everything in this module is
 * deterministic and free of I/O so the contract can be tested directly.
 *
 * Two rules matter for correctness:
 *
 * 1. The stored snapshot is a *topic reference* captured at bind time. It is not
 *    verified current law and must never be rendered as one. When the live
 *    policy later receives a new revision or disappears, the snapshot stays
 *    valid as "the topic this conversation started from".
 * 2. The client may only *request* a binding by slug. The server resolves the
 *    slug into this snapshot, so a forged, mismatched or cross-user slug cannot
 *    create or read an authoritative binding.
 */

export const POLICY_LAUNCH_ID_PATTERN = /^[A-Za-z0-9._:-]{8,64}$/u;

export type ConversationPolicyBindingOrigin = "automated" | "manual";

/** Row-shaped binding as persisted in `ConversationPolicyBinding`. */
export type ConversationPolicyBindingRow = {
  chatId: string;
  userId: string;
  policySlug: string;
  policyOrigin: string;
  policyItemId: string | null;
  policyRevisionNumber: number | null;
  policyPublishedAt: Date | string | null;
  policySourceStatus: string | null;
  policyRevisionToken: string | null;
  titleZh: string;
  titleEn: string;
  officialTitle: string;
  officialUrl: string;
  launchId: string | null;
  boundAt: Date | string;
};

/** Client-facing binding payload returned by the conversation HTTP API. */
export type ConversationPolicyBindingView = {
  chatId: string;
  policySlug: string;
  policyOrigin: ConversationPolicyBindingOrigin;
  policyItemId: string | null;
  policyRevisionNumber: number | null;
  policyPublishedAt: string | null;
  policySourceStatus: string | null;
  policyRevisionToken: string | null;
  title: { "zh-CN": string; en: string };
  /**
   * Official source title/URL. Null for lawyer-authored commentary that
   * deliberately has no official source; the binding row stores '' in that case.
   */
  officialTitle: string | null;
  officialUrl: string | null;
  boundAt: string;
  /**
   * Always true in Stage 2: the snapshot was captured when the conversation was
   * created and is displayed as a topic reference, never as current law.
   */
  snapshot: true;
};

/** Values written when a conversation is created from a policy topic. */
export type ConversationPolicyBindingDraft = {
  policySlug: string;
  policyOrigin: ConversationPolicyBindingOrigin;
  policyItemId: string | null;
  policyRevisionNumber: number | null;
  policyPublishedAt: string | null;
  policySourceStatus: string | null;
  policyRevisionToken: string;
  titleZh: string;
  titleEn: string;
  officialTitle: string;
  officialUrl: string;
  launchId: string | null;
};

export type PolicyLaunchRequestState = "requested" | "resolved" | "unavailable";

export function normalizePolicyBindingOrigin(
  value: unknown
): ConversationPolicyBindingOrigin {
  return value === "manual" ? "manual" : "automated";
}

/** '' in a NOT NULL column means "no official source was provided". */
export function nullableBindingText(
  value: string | null | undefined
): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizePolicyLaunchId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return POLICY_LAUNCH_ID_PATTERN.test(trimmed) ? trimmed : null;
}

export function policyRevisionToken(input: {
  policySlug: string;
  policyRevisionNumber: number | null;
  policyPublishedAt: string | null;
}): string {
  return [
    input.policySlug,
    `r${input.policyRevisionNumber ?? 0}`,
    input.policyPublishedAt ?? "unpublished",
  ]
    .join("@")
    .slice(0, 160);
}

export function toIsoTimestamp(value: Date | string | null): string | null {
  if (value === null) {
    return null;
  }
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/**
 * Builds the persisted snapshot from a server-resolved published policy.
 *
 * The caller must already have resolved the slug through the trusted
 * publication read path: this function never fetches and never validates a
 * client-claimed slug.
 */
export function conversationPolicyBindingDraft(input: {
  policy: PublicPolicyProduct;
  launchId?: string | null;
}): ConversationPolicyBindingDraft | null {
  const { policy } = input;
  // An official source is optional (lawyer-authored commentary may have none),
  // but the topic identity (bilingual title) must exist for the card to be
  // meaningful. Nothing is invented to fill the gap: absent source fields are
  // stored as '' and normalized back to null on read.
  const officialUrl = policy.source.officialUrl?.trim() ?? "";
  const officialTitle = policy.source.officialTitle?.trim() ?? "";
  const titleZh = policy.copy["zh-CN"]?.title?.trim();
  const titleEn = policy.copy.en?.title?.trim();
  if (!(titleZh && titleEn)) {
    return null;
  }
  const publishedAt = toIsoTimestamp(policy.revision.publishedAt);
  const revisionNumber =
    typeof policy.revision.number === "number" ? policy.revision.number : null;
  return {
    policySlug: policy.slug,
    policyOrigin: normalizePolicyBindingOrigin(policy.origin),
    policyItemId: policy.id ? policy.id.slice(0, 64) : null,
    policyRevisionNumber: revisionNumber,
    policyPublishedAt: publishedAt,
    policySourceStatus: policy.sourceStatus ?? null,
    policyRevisionToken: policyRevisionToken({
      policySlug: policy.slug,
      policyRevisionNumber: revisionNumber,
      policyPublishedAt: publishedAt,
    }),
    titleZh: titleZh.slice(0, 400),
    titleEn: titleEn.slice(0, 400),
    officialTitle: officialTitle.slice(0, 400),
    officialUrl,
    launchId: normalizePolicyLaunchId(input.launchId),
  };
}

export function projectPolicyBindingView(
  row: ConversationPolicyBindingRow
): ConversationPolicyBindingView {
  return {
    chatId: row.chatId,
    policySlug: row.policySlug,
    policyOrigin: normalizePolicyBindingOrigin(row.policyOrigin),
    policyItemId: row.policyItemId ?? null,
    policyRevisionNumber: row.policyRevisionNumber ?? null,
    policyPublishedAt: toIsoTimestamp(row.policyPublishedAt),
    policySourceStatus: row.policySourceStatus ?? null,
    policyRevisionToken: row.policyRevisionToken ?? null,
    title: { "zh-CN": row.titleZh, en: row.titleEn },
    officialTitle: nullableBindingText(row.officialTitle),
    officialUrl: nullableBindingText(row.officialUrl),
    boundAt: toIsoTimestamp(row.boundAt) ?? new Date(0).toISOString(),
    snapshot: true,
  };
}

/**
 * A binding may only be displayed for the conversation it belongs to. This is
 * the client-side counterpart of the server's owner-scoped read: a delayed
 * response from an earlier conversation can never paint the card onto a newly
 * selected one.
 */
export function shouldApplyPolicyBinding(input: {
  binding: ConversationPolicyBindingView | null;
  activeChatId: string | null;
  requestedChatId: string | null;
}): boolean {
  if (!input.binding) {
    return false;
  }
  return Boolean(
    input.activeChatId &&
      input.requestedChatId &&
      input.activeChatId === input.requestedChatId &&
      input.binding.chatId === input.requestedChatId
  );
}

/**
 * Converts the persisted snapshot into the workspace topic reference used for
 * the visible card and the request-scoped topic hint.
 */
export function policyWorkspaceReferenceFromBinding(
  binding: ConversationPolicyBindingView
): PolicyWorkspaceReference {
  return {
    slug: binding.policySlug,
    title: { "zh-CN": binding.title["zh-CN"], en: binding.title.en },
    officialTitle: binding.officialTitle,
    officialUrl: binding.officialUrl,
    revision: {
      number: binding.policyRevisionNumber,
      publishedAt: binding.policyPublishedAt,
      sourceStatus: binding.policySourceStatus,
      snapshot: true,
    },
  };
}

/**
 * Reads the trusted binding out of a conversation HTTP payload. The client
 * accepts the payload only when it is well-formed and names its own chat, so a
 * malformed or foreign object cannot paint a policy card.
 */
export function normalizePolicyBindingView(
  value: unknown
): ConversationPolicyBindingView | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  const title = candidate.title as Record<string, unknown> | undefined;
  if (
    typeof candidate.chatId !== "string" ||
    typeof candidate.policySlug !== "string" ||
    !(
      candidate.officialTitle === null ||
      candidate.officialTitle === undefined ||
      typeof candidate.officialTitle === "string"
    ) ||
    !(
      candidate.officialUrl === null ||
      candidate.officialUrl === undefined ||
      typeof candidate.officialUrl === "string"
    ) ||
    typeof candidate.boundAt !== "string" ||
    !title ||
    typeof title["zh-CN"] !== "string" ||
    typeof title.en !== "string"
  ) {
    return null;
  }
  return {
    chatId: candidate.chatId,
    policySlug: candidate.policySlug,
    policyOrigin: normalizePolicyBindingOrigin(candidate.policyOrigin),
    policyItemId:
      typeof candidate.policyItemId === "string"
        ? candidate.policyItemId
        : null,
    policyRevisionNumber:
      typeof candidate.policyRevisionNumber === "number"
        ? candidate.policyRevisionNumber
        : null,
    policyPublishedAt:
      typeof candidate.policyPublishedAt === "string"
        ? candidate.policyPublishedAt
        : null,
    policySourceStatus:
      typeof candidate.policySourceStatus === "string"
        ? candidate.policySourceStatus
        : null,
    policyRevisionToken:
      typeof candidate.policyRevisionToken === "string"
        ? candidate.policyRevisionToken
        : null,
    title: { "zh-CN": title["zh-CN"], en: title.en },
    officialTitle: nullableBindingText(
      typeof candidate.officialTitle === "string"
        ? candidate.officialTitle
        : null
    ),
    officialUrl: nullableBindingText(
      typeof candidate.officialUrl === "string" ? candidate.officialUrl : null
    ),
    boundAt: candidate.boundAt,
    snapshot: true,
  };
}

/**
 * Model-side topic context for a policy-bound conversation.
 *
 * Reviewer finding R1-2: the widget routes rebuilt the topic hint from a *live*
 * lookup of the bound slug, so once the original policy was withdrawn from
 * publication, archived or superseded, the model lost the conversation's topic
 * entirely and follow-ups such as "这项政策" / "this policy" stopped resolving.
 *
 * The persisted binding is the durable record of the topic this conversation
 * started from, so it is always rendered. The historical revision is labelled as
 * a creation-time snapshot and never as current law; when the live publication
 * still resolves, the current revision is added as a *separate* line so the two
 * are never silently conflated.
 */
export type ConversationPolicyTopicContextInput = {
  /** `null` means the conversation has no persisted policy binding. */
  binding: ConversationPolicyBindingView | null;
  /**
   * The currently published revision, when it still resolves. `null` means the
   * original publication is no longer in the published index (withdrawn,
   * archived or superseded) — never that the topic is unknown.
   */
  current?: PolicyWorkspaceReference | null;
};

function boundedTopicText(value: string, limit: number): string {
  return [...value]
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code >= 32 && code !== 127;
    })
    .join("")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, limit);
}

export function buildConversationPolicyTopicContext(
  input: ConversationPolicyTopicContextInput
): string | null {
  const binding = input.binding;
  if (!binding || !POLICY_SLUG_PATTERN.test(binding.policySlug)) {
    return null;
  }
  const titleZh = boundedTopicText(binding.title["zh-CN"], 180);
  const titleEn = boundedTopicText(binding.title.en, 180);
  const officialTitle = boundedTopicText(
    binding.officialTitle ?? binding.title.en,
    240
  );
  // Lawyer-authored commentary may carry no official URL; that is recorded
  // honestly rather than dropping the durable topic.
  let officialUrl: string | null = null;
  if (binding.officialUrl) {
    try {
      const parsed = new URL(binding.officialUrl);
      if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
        return null;
      }
      officialUrl = parsed.toString();
      if (officialUrl.length > 500) {
        return null;
      }
    } catch {
      return null;
    }
  }
  if (!titleZh || !titleEn || !officialTitle) {
    return null;
  }
  const snapshotRevision = [
    `revision ${binding.policyRevisionNumber ?? "unknown"}`,
    binding.policyPublishedAt
      ? `published ${binding.policyPublishedAt}`
      : "publication date unavailable",
    binding.policySourceStatus
      ? `publication status ${binding.policySourceStatus}`
      : "publication status unavailable",
  ].join(", ");
  const lines = [
    "This conversation was created from the Legal Update topic below. Resolve references such as 'this policy' or '这项政策' to that topic. It is topic context only — never proof of current law and never legal evidence. Independently verify the current status and wording in official sources before any substantive legal conclusion.",
    `Topic slug: ${binding.policySlug}`,
    `Topic title (English): ${titleEn}`,
    `Topic title (Chinese): ${titleZh}`,
    `Official source title: ${officialTitle}`,
    officialUrl
      ? `Official source URL: ${officialUrl}`
      : "Official source URL: none provided by the author (lawyer-authored commentary)",
    `Topic snapshot captured when this conversation was created: ${snapshotRevision}`,
  ];
  const current = input.current;
  if (current) {
    const currentRevision = current.revision
      ? `revision ${current.revision.number ?? "unknown"}, ${
          current.revision.publishedAt
            ? `published ${current.revision.publishedAt}`
            : "publication date unavailable"
        }`
      : "revision identity unavailable";
    lines.push(
      `Currently published revision of this topic (separate from the conversation snapshot above): ${currentRevision}.`
    );
    if (
      current.revision &&
      !current.revision.snapshot &&
      current.revision.number !== binding.policyRevisionNumber
    ) {
      lines.push(
        "The topic has been revised since this conversation started. The conversation snapshot is not the current revision; check the current revision before relying on any rule, date or status."
      );
    }
  } else {
    lines.push(
      "The originally referenced publication is not currently available in the published index (it may have been withdrawn, archived or superseded). The conversation topic above is unchanged; verify the current position from official sources and say plainly that the original publication could not be re-confirmed."
    );
  }
  return lines.join("\n");
}

export function conversationPolicyTopicContextEntry(
  input: ConversationPolicyTopicContextInput
): {
  id: string;
  role: "system";
  policy_topic_reference: true;
  text: string;
} | null {
  const text = buildConversationPolicyTopicContext(input);
  return text
    ? {
        id: "policy-topic-reference",
        role: "system",
        policy_topic_reference: true,
        text,
      }
    : null;
}

/**
 * The launch identity of a policy workspace entry.
 *
 * Initialization may only run again when this identity changes, which is what
 * makes a hot client-side navigation to a different policy actually launch that
 * policy instead of leaving the previously mounted workspace untouched.
 */
export function policyLaunchKey(input: {
  chatId: string | null;
  launchIntent: string | null;
  policySlug: string | null;
}): string {
  return [
    input.launchIntent ?? "none",
    input.policySlug ?? "none",
    input.chatId ?? "none",
  ].join("|");
}

export function isPolicyLaunchRequested(input: {
  launchIntent: string | null;
  policySlug: string | null;
}): boolean {
  return Boolean(input.policySlug && input.launchIntent === "policy");
}

export type ConversationPolicyBindingCatalogRow = {
  bindingRelation: string | null;
};

/**
 * Pure decision over the `to_regclass` catalog probe. A missing relation is an
 * explicit, expected state before migration `0026` is applied; an unreadable
 * probe fails closed with an error rather than guessing.
 */
export function conversationPolicyBindingSchemaAvailableFromCatalogRows(
  rows: readonly ConversationPolicyBindingCatalogRow[]
): boolean {
  if (rows.length !== 1) {
    throw new Error(
      "Unable to determine ConversationPolicyBinding schema availability"
    );
  }
  const value = rows[0].bindingRelation;
  if (value === undefined) {
    throw new Error(
      "Unable to determine ConversationPolicyBinding schema availability"
    );
  }
  return value !== null;
}

/**
 * Conversation-scoped policy identity, resolved from the persisted binding.
 *
 * The binding is authoritative because it was written by the server from the
 * published policy list at creation time. A client-supplied slug is only used
 * while the binding table is absent from the deployed schema, and even then
 * only for a conversation the caller actually owns.
 */
export type ConversationPolicyTopicResolution = {
  slug: string | null;
  source: "binding" | "client_fallback" | "none";
  bindingAvailable: boolean;
};

/**
 * Deterministic precedence for the request-scoped policy topic hint:
 *
 * 1. the persisted binding for the owned conversation (authoritative);
 * 2. otherwise, while the binding schema is absent, a syntactically valid
 *    client slug for a conversation the caller owns (pre-migration continuity);
 * 3. otherwise nothing.
 *
 * A client slug is never accepted for a conversation the caller does not own,
 * and never overrides a stored binding.
 */
export function resolveConversationPolicyTopic(input: {
  binding: ConversationPolicyBindingView | null;
  bindingSchemaAvailable: boolean;
  ownedConversation: boolean;
  clientSlug?: unknown;
}): ConversationPolicyTopicResolution {
  if (input.binding?.policySlug) {
    return {
      slug: input.binding.policySlug,
      source: "binding",
      bindingAvailable: true,
    };
  }
  if (!input.bindingSchemaAvailable && input.ownedConversation) {
    const clientSlug =
      typeof input.clientSlug === "string" ? input.clientSlug.trim() : "";
    if (clientSlug && POLICY_SLUG_PATTERN.test(clientSlug)) {
      return {
        slug: clientSlug,
        source: "client_fallback",
        bindingAvailable: false,
      };
    }
  }
  return {
    slug: null,
    source: "none",
    bindingAvailable: input.bindingSchemaAvailable,
  };
}
