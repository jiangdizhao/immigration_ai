"use client";

import {
  Bot,
  CalendarDays,
  Loader2,
  Send,
  Sparkles,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  type AssistantMode,
  widgetRouteForAssistantMode,
} from "@/lib/assistant-mode";
import { consultationCreateHref } from "@/lib/consultations/customer-ui";
import { resolveWorkspacePersistence } from "@/lib/conversations/persistence-notice";
import {
  buildWidgetTurnRequestBody,
  requestPolicySlugForConversation,
} from "@/lib/conversations/widget-turn-request";
import { ChatbotError, type ErrorCode } from "@/lib/errors";
import { persistedAssistantMessageIdForReview } from "@/lib/lawyer-requests/message-identity";
import {
  type ConversationPolicyBindingView,
  normalizePolicyBindingView,
  type PolicyLaunchRequestState,
  policyLaunchKey,
  policyWorkspaceReferenceFromBinding,
  shouldApplyPolicyBinding,
} from "@/lib/policy-intelligence/conversation-policy-binding";
import type { PolicyWorkspaceReference } from "@/lib/policy-intelligence-product";
import { getPolicyProductCopy } from "@/lib/policy-intelligence-product-copy";
import {
  blockedResponseForLocale,
  evaluateWidgetSubmission,
  type PoliticalGateResult,
  sanitizePoliticalHistory,
} from "@/lib/political-gate";
import { cn, fetchWithErrorHandlers, generateUUID } from "@/lib/utils";
import {
  type ConversationOrigin,
  normalizeConversationOrigin,
  resolveConversationInteraction,
  shouldApplyConversationDetail,
  shouldApplyOlderMessages,
} from "@/lib/workspace/conversation-origin";
import {
  clearPolicyLaunchId,
  decodePolicyLaunchFailure,
  type PolicyLaunchFailure,
  readOrCreatePolicyLaunchId,
} from "@/lib/workspace/policy-launch";
import {
  buildWorkspaceCaseSummary,
  shouldClearWorkspaceCaseSummary,
} from "@/lib/workspace-case-summary";
import { getWorkspaceCopy } from "@/lib/workspace-copy";
import {
  AssistantRichMarkdown,
  hasTerminalReferenceSection,
} from "./assistant-rich-markdown";
import { CollapsibleSourceList } from "./collapsible-source-list";
import { GuidedIntakeCard } from "./guided-intake-card";
import type {
  AnswerPreference,
  IntakeFacts,
  WidgetAssistantMessage,
  WidgetMessage,
  WidgetRouteResponse,
  WidgetTurnPersistence,
} from "./guided-intake-types";
import { LawyerRequestAction } from "./lawyer-request-action";
import {
  LegacyConversationBadge,
  LegacyConversationNotice,
} from "./legacy-conversation-notice";
import { MatterDocumentsPanel } from "./matter-documents-panel";
import { useSiteLocale } from "./site-locale-provider";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { UserDocumentHistoryPanel } from "./user-document-history-panel";

const TYPEWRITER_TICK_MS = 38;
const TYPEWRITER_WORDS_PER_TICK = 3;
const SHOW_WORKSPACE_DEBUG = process.env.NEXT_PUBLIC_WIDGET_DEBUG === "true";

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });

function splitIntoDisplayTokens(text: string) {
  return text.match(/\S+\s*/g) ?? [text];
}

function isAssistantMessage(
  message: WidgetMessage
): message is WidgetAssistantMessage {
  return message.role === "assistant";
}

function buildGuidedIntakeSummary(draftFacts: IntakeFacts) {
  const populatedEntries = Object.entries(draftFacts).filter(
    ([, value]) => value !== null && value !== undefined && value !== ""
  );

  if (!populatedEntries.length) {
    return "Guided intake update.";
  }

  const lines = populatedEntries.map(
    ([key, value]) => `${key}: ${String(value)}`
  );
  return `Guided intake update:\n${lines.join("\n")}`;
}

function buildGuidedIntakeDisplaySummary(
  draftFacts: IntakeFacts,
  copy: ReturnType<typeof getWorkspaceCopy>,
  locale: "zh-CN" | "en"
) {
  const populatedEntries = Object.entries(draftFacts).filter(
    ([, value]) => value !== null && value !== undefined && value !== ""
  );

  if (!populatedEntries.length) {
    return locale === "zh-CN"
      ? "我已更新咨询信息。"
      : "I updated the intake details.";
  }

  const labels = populatedEntries.map(
    ([key]) => copy.factLabels[key] ?? key.replaceAll("_", " ")
  );
  if (locale === "zh-CN") {
    return `我已更新以下信息：${labels.join("、")}。`;
  }
  if (labels.length === 1) {
    return `I updated my ${labels[0]}.`;
  }
  return `I updated these intake details: ${labels.join(", ")}.`;
}

function compactSourcesForMessage(message?: WidgetAssistantMessage | null) {
  if (!message) {
    return [];
  }
  if (message.compactSources?.length) {
    return message.compactSources;
  }

  const fallback = (message.citations ?? [])
    .map((citation) => {
      const title = citation.title?.trim();
      const authority = citation.authority?.trim();
      if (authority && title) {
        return `${authority} — ${title}`;
      }
      return title || authority || "";
    })
    .filter(Boolean);

  return Array.from(new Set(fallback));
}

function formatConversationUpdatedAt(
  updatedAt: string | null | undefined,
  createdAt: string | null | undefined,
  locale: "zh-CN" | "en",
  unavailable: string
) {
  const value = updatedAt ?? createdAt;
  if (!value) {
    return unavailable;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return unavailable;
  }

  const formatted = new Intl.DateTimeFormat(
    locale === "zh-CN" ? "zh-CN" : "en-AU",
    {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }
  ).format(parsed);
  return locale === "zh-CN"
    ? `更新于 ${formatted} UTC`
    : `Updated ${formatted} UTC`;
}

function statusText(
  status: "ready" | "submitted" | "typing",
  copy: ReturnType<typeof getWorkspaceCopy>
) {
  return status === "submitted"
    ? copy.status.submitted
    : status === "typing"
      ? copy.status.typing
      : copy.status.ready;
}

const WORKSPACE_PROGRESS_STAGES_ZH = [
  {
    afterMs: 0,
    title: "正在理解你的问题",
    detail: "正在识别签证类型、关键事实和当前问题焦点。",
  },
  {
    afterMs: 6000,
    title: "正在查找相关法规和官方信息",
    detail: "复杂问题可能需要核对本地资料、Schedule 2 和官方来源。",
  },
  {
    afterMs: 16_000,
    title: "正在判断风险和下一步",
    detail: "我会先给可用的一般性方向，再保留一个关键追问。",
  },
  {
    afterMs: 30_000,
    title: "正在整理最终答复",
    detail: "这个问题需要多步核对，感谢等待。",
  },
] as const;

const WORKSPACE_PROGRESS_STAGES_EN = [
  {
    afterMs: 0,
    title: "Understanding your question",
    detail: "Identifying the visa type, key facts, and current focus.",
  },
  {
    afterMs: 6000,
    title: "Checking relevant rules and official sources",
    detail:
      "Complex questions may require local sources, Schedule 2, and official guidance.",
  },
  {
    afterMs: 16_000,
    title: "Assessing risk and next steps",
    detail:
      "The answer should be useful first and keep one key follow-up question.",
  },
  {
    afterMs: 30_000,
    title: "Preparing the final answer",
    detail: "This is taking several checks. Thanks for waiting.",
  },
] as const;

const FAST_PROGRESS_STAGES_EN = [
  {
    afterMs: 0,
    title: "Preparing a quick answer",
    detail: "Keeping the response concise and focused on your question.",
  },
  {
    afterMs: 5000,
    title: "Checking whether fresh information is needed",
    detail: "Fast may use native web search when current information matters.",
  },
  {
    afterMs: 15_000,
    title: "Finishing the quick answer",
    detail:
      "For deeper source-aware verification, use Legal Check when available.",
  },
] as const;

const FAST_PROGRESS_STAGES_ZH = [
  {
    afterMs: 0,
    title: "正在准备快速答复",
    detail: "保持答复简洁，并聚焦于你的问题。",
  },
  {
    afterMs: 5000,
    title: "正在判断是否需要最新信息",
    detail: "如果问题涉及当前信息，Fast 可能使用原生网页搜索。",
  },
  {
    afterMs: 15_000,
    title: "正在完成快速答复",
    detail: "如需更深入的来源核对，请在可用时使用 Legal Check。",
  },
] as const;

function looksChineseText(text: string) {
  return /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/.test(text);
}

function isZhLanguage(responseLanguage?: string | null) {
  return (responseLanguage ?? "").toLowerCase().startsWith("zh");
}

function workspaceProgressStage(
  elapsedMs: number,
  isZh: boolean,
  assistantMode: AssistantMode
) {
  const stages =
    assistantMode === "fast"
      ? isZh
        ? FAST_PROGRESS_STAGES_ZH
        : FAST_PROGRESS_STAGES_EN
      : isZh
        ? WORKSPACE_PROGRESS_STAGES_ZH
        : WORKSPACE_PROGRESS_STAGES_EN;
  return stages.reduce((current, stage) => {
    if (elapsedMs >= stage.afterMs) {
      return stage;
    }
    return current;
  });
}

type ImmigrationConversationSummary = {
  chatId: string;
  legalMatterId?: string | null;
  title?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  /**
   * Phase 12 Stage 1 R3: `legacy_chat` marks retained history whose immigration
   * conversation record does not exist, so the chat is read-only in the UI.
   */
  origin?: ConversationOrigin;
  /** Phase 12 Stage 2: the conversation's persisted policy topic, if any. */
  policyBinding?: ConversationPolicyBindingView | null;
};

type ImmigrationStoredMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  createdAt?: string | null;
  citations?: WidgetAssistantMessage["citations"];
  compactSources?: string[];
  confidence?: WidgetAssistantMessage["confidence"];
  researchStatus?: WidgetAssistantMessage["researchStatus"];
  followUpQuestions?: string[];
  matterId?: string | null;
  retrievalDebug?: WidgetAssistantMessage["retrievalDebug"];
  customerDocumentEvidenceUsed?: boolean;
  customerDocumentUsage?: "not_supplied" | "supplied_unconfirmed" | "confirmed";
  customerDocumentSources?: WidgetAssistantMessage["customerDocumentSources"];
};

type ImmigrationConversationDetail = ImmigrationConversationSummary & {
  messages: ImmigrationStoredMessage[];
  hasOlderMessages?: boolean;
  olderMessagesCursor?: string | null;
};

type ConversationListPage = {
  conversations?: ImmigrationConversationSummary[];
  hasMore?: boolean;
  nextCursor?: string | null;
  totalCount?: number;
};

type PendingTurnSubmission = {
  clientTurnId: string;
  conversationId: string;
  messages: WidgetMessage[];
};

function assistantFromStoredMessage(
  message: ImmigrationStoredMessage
): WidgetAssistantMessage {
  return {
    id: message.id,
    role: "assistant",
    text: message.text,
    persistedAssistantMessageId: message.id,
    isStreaming: false,
    responseLanguage: looksChineseText(message.text) ? "zh" : "en",
    researchStatus: message.researchStatus ?? null,
    citations: message.citations ?? [],
    compactSources: message.compactSources ?? [],
    customerDocumentEvidenceUsed: message.customerDocumentEvidenceUsed === true,
    customerDocumentUsage: message.customerDocumentUsage ?? "not_supplied",
    customerDocumentSources: message.customerDocumentSources ?? [],
    userDisplayMode: null,
    followUpQuestions: message.followUpQuestions ?? [],
    missingFacts: [],
    evidenceGaps: [],
    confidence: message.confidence ?? null,
    escalate: false,
    nextAction: null,
    matterId: message.matterId ?? null,
    conversationState: null,
    caseHypothesis: null,
    factSlotStates: [],
    interactionPlan: null,
    retrievalDebug: message.retrievalDebug ?? null,
  };
}

function widgetMessageFromStoredMessage(
  message: ImmigrationStoredMessage
): WidgetMessage {
  if (message.role === "assistant") {
    return assistantFromStoredMessage(message);
  }
  return {
    id: message.id,
    role: "user",
    text: message.text,
  };
}

function setWorkspaceChatParam(
  chatId: string,
  policySlug: string | null = null
) {
  if (typeof window === "undefined") {
    return;
  }
  const url = new URL(window.location.href);
  url.searchParams.set("chatId", chatId);
  url.searchParams.delete("launch");
  if (policySlug) {
    url.searchParams.set("policy", policySlug);
  } else {
    url.searchParams.delete("policy");
  }
  window.history.replaceState(null, "", url.toString());
}

/**
 * Conversation requests in the workspace carry a typed reason when they fail, so
 * a refused policy launch can be explained and retried instead of being shown as
 * an apparently successful blank conversation.
 */
class WorkspaceConversationError extends Error {
  readonly failure: PolicyLaunchFailure;

  constructor(message: string, failure: PolicyLaunchFailure) {
    super(message);
    this.name = "WorkspaceConversationError";
    this.failure = failure;
  }
}

export function normalizeConversationListPage(
  page: ConversationListPage
): ImmigrationConversationSummary[] {
  return (page.conversations ?? []).map((conversation) => ({
    ...conversation,
    // The list payload carries each conversation's own persisted policy topic so
    // a reopened history entry shows the correct card without another request.
    policyBinding: normalizePolicyBindingView(conversation.policyBinding),
  }));
}

function conversationFailureFrom(error: unknown): PolicyLaunchFailure | null {
  return error instanceof WorkspaceConversationError ? error.failure : null;
}

function blockedWidgetResponse(
  decision: PoliticalGateResult
): WidgetRouteResponse {
  const blockedResponse = blockedResponseForLocale(decision.locale);
  return {
    text: blockedResponse.text,
    responseLanguage: blockedResponse.responseLanguage,
    citations: [],
    compactSources: [],
    userDisplayMode: "political_gate_blocked",
    followUpQuestions: [],
    missingFacts: [],
    evidenceGaps: [],
    confidence: null,
    escalate: false,
    nextAction: "none",
    matterId: null,
    conversationState: null,
    caseHypothesis: null,
    factSlotStates: [],
    interactionPlan: null,
    retrievalDebug: null,
  };
}

function WorkspaceProcessingCard({
  elapsedMs,
  isZh,
  assistantMode,
}: {
  elapsedMs: number;
  isZh: boolean;
  assistantMode: AssistantMode;
}) {
  const stage = workspaceProgressStage(elapsedMs, isZh, assistantMode);
  const seconds = Math.max(1, Math.floor(elapsedMs / 1000));
  return (
    <div className="flex gap-3">
      <div className="mt-1 flex size-9 shrink-0 items-center justify-center rounded-2xl bg-[#001736] text-white shadow-sm">
        <Bot className="size-4" />
      </div>
      <div className="max-w-[86%] rounded-[24px] border border-sky-100 bg-white px-4 py-3 text-sm leading-7 text-slate-700 shadow-sm">
        <div className="flex items-start gap-3">
          <Loader2 className="mt-1 size-4 shrink-0 animate-spin text-sky-600" />
          <div className="min-w-0">
            <p className="font-semibold text-slate-950">{stage.title}</p>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              {stage.detail}
            </p>
            <p className="mt-2 text-xs text-slate-400">
              {isZh ? `已等待约 ${seconds} 秒` : `Waiting about ${seconds}s`}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ImmigrationAIWorkspace({
  assistantMode = "default",
  policyReference = null,
  policyLaunch = false,
  policyLaunchState = "resolved",
  requestedPolicySlug = null,
  initialChatId = null,
  userType = "regular",
}: {
  assistantMode?: AssistantMode;
  policyReference?: PolicyWorkspaceReference | null;
  policyLaunch?: boolean;
  /** Explicit policy launch state resolved by the server page. */
  policyLaunchState?: PolicyLaunchRequestState;
  requestedPolicySlug?: string | null;
  initialChatId?: string | null;
  /**
   * Phase 12 Stage 2: the authenticated account type. A guest account cannot own
   * documents, so the workspace states that instead of surfacing an API error.
   */
  userType?: "guest" | "regular";
}) {
  const { locale } = useSiteLocale();
  const router = useRouter();
  const copy = getWorkspaceCopy(locale);
  const policyCopy = getPolicyProductCopy(locale);
  const quickQuestions = copy.quickQuestions;
  const [conversationId, setConversationId] = useState<string | null>(null);
  const conversationIdRef = useRef<string | null>(null);
  const [conversationOrigin, setConversationOrigin] =
    useState<ConversationOrigin>("immigration");
  const conversationOriginRef = useRef<ConversationOrigin>("immigration");
  /**
   * Phase 12 Stage 2: the visible policy card is driven by the server-persisted
   * binding, not by transient launch props. `policyBinding` is the conversation's
   * own recorded topic; `pendingPolicyReference` only previews a launch that has
   * not been persisted yet.
   */
  const [policyBinding, setPolicyBinding] =
    useState<ConversationPolicyBindingView | null>(null);
  const [policyLaunchFailure, setPolicyLaunchFailure] =
    useState<PolicyLaunchFailure | null>(null);
  const [launchingPolicy, setLaunchingPolicy] = useState(false);
  const policyLaunchInFlightRef = useRef<string | null>(null);
  const appliedPolicyLaunchKeyRef = useRef<string | null>(null);
  const initializationStartedRef = useRef(false);
  const [conversations, setConversations] = useState<
    ImmigrationConversationSummary[]
  >([]);
  const [conversationCursor, setConversationCursor] = useState<string | null>(
    null
  );
  const [conversationHasMore, setConversationHasMore] = useState(false);
  const [conversationTotalCount, setConversationTotalCount] = useState<
    number | null
  >(null);
  const [loadingOlderConversations, setLoadingOlderConversations] =
    useState(false);
  const [conversationLoadFailed, setConversationLoadFailed] = useState(false);
  const [olderMessagesCursor, setOlderMessagesCursor] = useState<string | null>(
    null
  );
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [persistenceNotice, setPersistenceNotice] =
    useState<WidgetTurnPersistence | null>(null);
  const [retryingPersistence, setRetryingPersistence] = useState(false);
  const conversationLoadSeqRef = useRef(0);
  const pendingSubmissionRef = useRef<PendingTurnSubmission | null>(null);
  const [conversationLoading, setConversationLoading] = useState(false);
  const [conversationReady, setConversationReady] = useState(false);
  const [matterId, setMatterId] = useState<string | null>(null);
  const [messages, setMessages] = useState<WidgetMessage[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<"ready" | "submitted" | "typing">(
    "ready"
  );
  const [submittedAt, setSubmittedAt] = useState<number | null>(null);
  const [progressNow, setProgressNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const [draftFacts, setDraftFacts] = useState<IntakeFacts>({});
  const [intakeFacts, setIntakeFacts] = useState<IntakeFacts>({});
  const [caseSummarySnapshot, setCaseSummarySnapshot] = useState<ReturnType<
    typeof buildWorkspaceCaseSummary
  > | null>(null);
  /**
   * Phase 12 Stage 2: one revision counter tells every context panel that
   * server-side document state changed (upload, delete, reprocess), so the
   * conversation file list and the account-wide file history refresh themselves
   * instead of waiting for a manual reload.
   */
  const [documentsRevision, setDocumentsRevision] = useState(0);
  const [activePanel, setActivePanel] = useState<
    "none" | "history" | "conversationFiles" | "accountFiles" | "caseSummary"
  >("none");
  const listRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const shouldAutoScrollRef = useRef(true);

  const latestAssistant = useMemo(
    () => [...messages].reverse().find(isAssistantMessage) ?? null,
    [messages]
  );
  /**
   * The card's reference: the conversation's own persisted binding once it
   * exists, otherwise the topic the current launch resolved server-side.
   */
  const activePolicyReference = useMemo<PolicyWorkspaceReference | null>(() => {
    if (policyBinding) {
      return policyWorkspaceReferenceFromBinding(policyBinding);
    }
    if (policyLaunch && policyLaunchState === "resolved") {
      return policyReference;
    }
    return null;
  }, [policyBinding, policyLaunch, policyLaunchState, policyReference]);
  const notifyDocumentsChanged = useCallback(() => {
    setDocumentsRevision((current) => current + 1);
  }, []);
  /** Guest accounts cannot own documents; files require an account. */
  const canUseDocuments = userType !== "guest";
  /**
   * Desktop keeps the three-column layout. Narrow viewports get the chat as the
   * primary area plus one labelled panel strip, instead of squeezing a
   * right-hand column into a phone width.
   */
  const [isWideViewport, setIsWideViewport] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) {
      return;
    }
    const query = window.matchMedia("(min-width: 1280px)");
    const apply = () => setIsWideViewport(query.matches);
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);
  /**
   * Phase 12 Stage 1 R3: one contract decides whether this conversation accepts
   * new work. Read-only is derived from the origin that was applied together
   * with the loaded conversation, so a stale or delayed response cannot leave
   * the workspace in the wrong mode.
   */
  const interaction = useMemo(
    () =>
      resolveConversationInteraction({
        origin: conversationOrigin,
        conversationReady,
        conversationLoading,
        turnInFlight: status !== "ready",
      }),
    [conversationOrigin, conversationReady, conversationLoading, status]
  );
  const isReadOnlyConversation = interaction.readOnly;
  const latestKnownFacts =
    latestAssistant?.interactionPlan?.known_facts_summary ?? {};
  const latestRequestedFacts =
    latestAssistant?.interactionPlan?.requested_facts ?? [];
  const latestWorkspaceCaseSummary = useMemo(
    () =>
      buildWorkspaceCaseSummary(
        latestKnownFacts,
        latestRequestedFacts,
        copy.factLabels,
        locale
      ),
    [latestKnownFacts, latestRequestedFacts, copy.factLabels, locale]
  );

  const isNearBottom = () => {
    const container = listRef.current;
    if (!container) {
      return true;
    }
    return (
      container.scrollHeight - container.scrollTop - container.clientHeight < 96
    );
  };

  const scrollToBottom = useCallback((force = false) => {
    const container = listRef.current;
    if (!container) {
      return;
    }
    if (!force && !shouldAutoScrollRef.current) {
      return;
    }

    requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight;
    });
  }, []);

  const handleMessageListScroll = () => {
    shouldAutoScrollRef.current = isNearBottom();
  };

  useEffect(() => {
    scrollToBottom();
  }, [scrollToBottom]);

  /**
   * Phase 12 Stage 2: the composer grows only as far as it needs to and then
   * scrolls internally, so a long question can never push the conversation out
   * of view. It is measured after the DOM has the new value, which also covers
   * the send/clear path.
   */
  const resizeComposer = useCallback(() => {
    window.requestAnimationFrame(() => {
      const element = composerRef.current;
      if (!element) {
        return;
      }
      element.style.height = "auto";
      element.style.height = `${Math.min(element.scrollHeight, 120)}px`;
    });
  }, []);

  useEffect(() => {
    if (status !== "submitted" || submittedAt === null) {
      return;
    }

    setProgressNow(Date.now());
    const intervalId = window.setInterval(() => {
      setProgressNow(Date.now());
      scrollToBottom(true);
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [status, submittedAt, scrollToBottom]);

  const refreshConversationList = useCallback(async () => {
    try {
      const response = await fetchWithErrorHandlers(
        "/api/immigration-conversations?limit=50",
        {
          method: "GET",
        }
      );
      const data = (await response.json()) as ConversationListPage;
      const conversationsFromPage = normalizeConversationListPage(data);
      setConversations(conversationsFromPage);
      setConversationCursor(data.nextCursor ?? null);
      setConversationHasMore(data.hasMore === true);
      setConversationTotalCount(
        typeof data.totalCount === "number" ? data.totalCount : null
      );
      setConversationLoadFailed(false);
      return conversationsFromPage;
    } catch (listError) {
      setConversationLoadFailed(true);
      throw listError;
    }
  }, []);

  /**
   * Appends the next page of older conversations. Complete history stays
   * reachable regardless of how many conversations the account has, and the
   * append is de-duplicated so a race can never show a conversation twice.
   */
  const loadOlderConversations = useCallback(async () => {
    if (!conversationCursor || loadingOlderConversations) {
      return;
    }
    setLoadingOlderConversations(true);
    try {
      const response = await fetchWithErrorHandlers(
        `/api/immigration-conversations?limit=50&cursor=${encodeURIComponent(
          conversationCursor
        )}`,
        { method: "GET" }
      );
      const data = (await response.json()) as ConversationListPage;
      const page = normalizeConversationListPage(data);
      setConversations((current) => {
        const seen = new Set(current.map((item) => item.chatId));
        return [...current, ...page.filter((item) => !seen.has(item.chatId))];
      });
      setConversationCursor(data.nextCursor ?? null);
      setConversationHasMore(data.hasMore === true);
      if (typeof data.totalCount === "number") {
        setConversationTotalCount(data.totalCount);
      }
    } catch (listError) {
      const message =
        listError instanceof Error
          ? listError.message
          : copy.history.loadFailed;
      toast.error(message);
    } finally {
      setLoadingOlderConversations(false);
    }
  }, [conversationCursor, copy.history.loadFailed, loadingOlderConversations]);

  const loadConversation = useCallback(
    async (chatIdToLoad: string) => {
      const requestSeq = conversationLoadSeqRef.current + 1;
      conversationLoadSeqRef.current = requestSeq;
      setConversationLoading(true);
      try {
        const response = await fetchWithErrorHandlers(
          `/api/immigration-conversations/${chatIdToLoad}?messageLimit=200`,
          { method: "GET" }
        );
        const data = (await response.json()) as ImmigrationConversationDetail;
        // A late response for conversation A must never replace conversation B.
        if (
          !shouldApplyConversationDetail({
            requestSeq,
            latestRequestSeq: conversationLoadSeqRef.current,
            requestedChatId: chatIdToLoad,
            loadedChatId: data.chatId ?? null,
          })
        ) {
          return;
        }
        if (
          shouldClearWorkspaceCaseSummary(
            conversationIdRef.current,
            data.chatId
          )
        ) {
          setCaseSummarySnapshot(null);
        }
        conversationIdRef.current = data.chatId;
        setConversationId(data.chatId);
        // The read-only mode is applied atomically with the conversation: this
        // origin belongs to the chat id that was just applied.
        const nextOrigin = normalizeConversationOrigin(data.origin);
        conversationOriginRef.current = nextOrigin;
        setConversationOrigin(nextOrigin);
        /**
         * Phase 12 Stage 2: the policy card is recovered from the conversation
         * itself on every read path — reload, history reopening and a second
         * device all take the same persisted binding, and a delayed response from
         * another conversation can never paint it here.
         */
        const loadedBinding = normalizePolicyBindingView(data.policyBinding);
        setPolicyBinding(
          shouldApplyPolicyBinding({
            binding: loadedBinding,
            activeChatId: data.chatId,
            requestedChatId: chatIdToLoad,
          })
            ? loadedBinding
            : null
        );
        setWorkspaceChatParam(data.chatId, loadedBinding?.policySlug ?? null);
        setMatterId(data.legalMatterId ?? null);
        setMessages(
          sanitizePoliticalHistory(
            (data.messages ?? []).map(widgetMessageFromStoredMessage)
          ) as WidgetMessage[]
        );
        setHasOlderMessages(data.hasOlderMessages === true);
        setOlderMessagesCursor(data.olderMessagesCursor ?? null);
        setDraftFacts({});
        setIntakeFacts({});
        setPersistenceNotice(null);
        setConversationReady(true);
        await refreshConversationList();
      } catch (loadError) {
        if (requestSeq === conversationLoadSeqRef.current) {
          throw loadError;
        }
      } finally {
        if (requestSeq === conversationLoadSeqRef.current) {
          setConversationLoading(false);
        }
      }
    },
    [refreshConversationList]
  );

  const loadOlderMessages = useCallback(async () => {
    const chatId = conversationIdRef.current;
    if (!chatId || !olderMessagesCursor || loadingOlderMessages) {
      return;
    }
    setLoadingOlderMessages(true);
    try {
      const response = await fetchWithErrorHandlers(
        `/api/immigration-conversations/${chatId}?messageLimit=200&olderCursor=${encodeURIComponent(
          olderMessagesCursor
        )}`,
        { method: "GET" }
      );
      const data = (await response.json()) as ImmigrationConversationDetail;
      if (
        !shouldApplyOlderMessages({
          loadedChatId: data.chatId ?? null,
          activeChatId: conversationIdRef.current,
        })
      ) {
        return;
      }
      const older = sanitizePoliticalHistory(
        (data.messages ?? []).map(widgetMessageFromStoredMessage)
      ) as WidgetMessage[];
      setMessages((current) => {
        const seen = new Set(current.map((message) => message.id));
        return [
          ...older.filter((message) => !seen.has(message.id)),
          ...current,
        ];
      });
      setHasOlderMessages(data.hasOlderMessages === true);
      setOlderMessagesCursor(data.olderMessagesCursor ?? null);
    } catch (loadError) {
      const message =
        loadError instanceof Error
          ? loadError.message
          : copy.history.loadFailed;
      toast.error(message);
    } finally {
      setLoadingOlderMessages(false);
    }
  }, [copy.history.loadFailed, loadingOlderMessages, olderMessagesCursor]);

  const createConversation = useCallback(
    async (options?: {
      title?: string;
      policySlug?: string | null;
      policyLaunchId?: string | null;
    }) => {
      setConversationLoading(true);
      try {
        /**
         * Phase 12 Stage 2: conversation creation is a plain, explicitly decoded
         * request. A policy launch that the server refuses (unresolvable topic,
         * missing binding schema, duplicate launch) must surface as a typed
         * recoverable failure — never as an apparently successful blank chat.
         */
        const response = await fetch("/api/immigration-conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: options?.title ?? "New immigration conversation",
            policySlug: options?.policySlug ?? null,
            policyLaunchId: options?.policyLaunchId ?? null,
          }),
        });
        const body = (await response.json().catch(() => null)) as
          | (ImmigrationConversationSummary & { code?: string })
          | null;
        if (!response.ok || !body?.chatId) {
          throw new WorkspaceConversationError(
            response.ok
              ? "Unable to create a new conversation."
              : copy.history.createFailed,
            decodePolicyLaunchFailure({ status: response.status, body })
          );
        }
        const data = body;
        setCaseSummarySnapshot(null);
        /**
         * The binding returned by the API is the server's own resolved snapshot.
         * It is accepted only when it names this conversation, so a malformed or
         * foreign payload cannot paint a policy card.
         */
        const createdBinding = normalizePolicyBindingView(data.policyBinding);
        setPolicyBinding(
          shouldApplyPolicyBinding({
            binding: createdBinding,
            activeChatId: data.chatId,
            requestedChatId: data.chatId,
          })
            ? createdBinding
            : null
        );
        setPolicyLaunchFailure(null);
        conversationIdRef.current = data.chatId;
        setConversationId(data.chatId);
        // A conversation created here is always a normal, writable conversation.
        conversationOriginRef.current = "immigration";
        setConversationOrigin("immigration");
        setWorkspaceChatParam(data.chatId, createdBinding?.policySlug ?? null);
        setMatterId(data.legalMatterId ?? null);
        setMessages([]);
        setDraftFacts({});
        setIntakeFacts({});
        setConversationReady(true);
        await refreshConversationList();
        return data.chatId;
      } finally {
        setConversationLoading(false);
      }
    },
    [copy.history.createFailed, refreshConversationList]
  );

  /**
   * Phase 12 Stage 1 R3: the archived-conversation screen only ever offers this
   * one mutation — an explicit new conversation. It is never triggered by merely
   * opening or reading an archived chat.
   */
  const startNewConversation = useCallback(() => {
    createConversation().catch((conversationError) => {
      const message =
        conversationError instanceof Error
          ? conversationError.message
          : "Unable to create a new conversation.";
      toast.error(message);
    });
  }, [createConversation]);

  /**
   * Phase 12 Stage 2: launch a policy conversation.
   *
   * The launch is keyed by the policy entry the workspace is currently on, so a
   * hot client-side navigation to a different policy starts that policy's
   * conversation, while a re-render of the same entry cannot create a second
   * one. The browser remembers the launch id per policy, so a retry after a
   * failed request resolves to the same server-side launch.
   */
  const launchPolicyConversation = useCallback(
    async (input: { slug: string; title: string; launchKey: string }) => {
      if (policyLaunchInFlightRef.current === input.launchKey) {
        return;
      }
      policyLaunchInFlightRef.current = input.launchKey;
      setLaunchingPolicy(true);
      setPolicyLaunchFailure(null);
      try {
        const launchId = readOrCreatePolicyLaunchId(
          window.sessionStorage,
          input.slug,
          generateUUID
        );
        await createConversation({
          title: input.title,
          policySlug: input.slug,
          policyLaunchId: launchId,
        });
        clearPolicyLaunchId(window.sessionStorage, input.slug);
      } catch (launchError) {
        const failure =
          conversationFailureFrom(launchError) ??
          decodePolicyLaunchFailure({ status: undefined, body: null });
        setPolicyLaunchFailure(failure);
        // A failed launch must not be presented as a usable workspace: the
        // conversation stays empty and the user gets an explicit recovery path.
        setMessages([]);
        setConversationReady(true);
        if (!failure.schemaUnavailable) {
          toast.error(
            failure.retryable
              ? copy.policy.launchFailedTitle
              : copy.policy.sourceUnavailableTitle
          );
        }
      } finally {
        policyLaunchInFlightRef.current = null;
        setLaunchingPolicy(false);
      }
    },
    [
      copy.policy.launchFailedTitle,
      copy.policy.sourceUnavailableTitle,
      createConversation,
    ]
  );

  /**
   * Retries a policy launch that failed. The same launch id is reused (it is
   * remembered per policy), so a retry can never create a duplicate
   * conversation for a launch the server may already have accepted.
   */
  const retryPolicyLaunch = useCallback(() => {
    const slug = requestedPolicySlug;
    if (!slug) {
      return;
    }
    const titleBase = (policyReference?.title[locale] ?? "")
      .trim()
      .slice(0, 90);
    launchPolicyConversation({
      slug,
      title: (locale === "zh-CN"
        ? `政策咨询：${titleBase || slug}`
        : `Policy question: ${titleBase || slug}`
      ).slice(0, 120),
      launchKey: policyLaunchKey({
        chatId: null,
        launchIntent: "policy",
        policySlug: slug,
      }),
    }).catch(() => undefined);
  }, [launchPolicyConversation, locale, policyReference, requestedPolicySlug]);

  useEffect(() => {
    const requestedChatId = initialChatId;
    const launchKey = policyLaunchKey({
      chatId: requestedChatId,
      launchIntent: policyLaunch ? "policy" : null,
      policySlug: policyLaunch ? (requestedPolicySlug ?? null) : null,
    });
    /**
     * Initialization runs once per launch identity instead of once per mount.
     * The previous one-shot guard meant a policy opened while the workspace was
     * already mounted never initialized, which is exactly how an unrelated
     * historical conversation stayed on screen.
     */
    const isFirstRun = !initializationStartedRef.current;
    if (isFirstRun) {
      initializationStartedRef.current = true;
    } else if (appliedPolicyLaunchKeyRef.current === launchKey) {
      return;
    }
    appliedPolicyLaunchKeyRef.current = launchKey;

    async function initializeConversation() {
      try {
        const conversationsFromApi = await refreshConversationList();
        const url =
          typeof window === "undefined" ? null : new URL(window.location.href);
        const urlChatId = url?.searchParams.get("chatId") ?? null;
        const targetChatId = requestedChatId ?? urlChatId;

        if (policyLaunch && !targetChatId) {
          if (policyLaunchState === "unavailable") {
            /**
             * The published topic could not be resolved. Never fall through to a
             * historical chat or a generic blank one: report the explicit,
             * recoverable state and stop.
             */
            setPolicyLaunchFailure({
              code: "policy_topic_unavailable",
              retryable: true,
              schemaUnavailable: false,
            });
            setConversationReady(true);
            return;
          }
          if (!requestedPolicySlug) {
            setPolicyLaunchFailure({
              code: "policy_topic_unavailable",
              retryable: true,
              schemaUnavailable: false,
            });
            setConversationReady(true);
            return;
          }
          const titleBase = (policyReference?.title[locale] ?? "")
            .trim()
            .slice(0, 90);
          const title =
            locale === "zh-CN"
              ? `政策咨询：${titleBase || requestedPolicySlug}`
              : `Policy question: ${titleBase || requestedPolicySlug}`;
          await launchPolicyConversation({
            slug: requestedPolicySlug,
            title: title.slice(0, 120),
            launchKey,
          });
          return;
        }

        const target =
          targetChatId ||
          conversationsFromApi[0]?.chatId ||
          (await createConversation());
        if (target) {
          await loadConversation(target);
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Unable to load immigration conversations.";
        setError(message);
        toast.error(message);
        setConversationReady(true);
      }
    }

    initializeConversation();
  }, [
    createConversation,
    initialChatId,
    launchPolicyConversation,
    loadConversation,
    locale,
    policyLaunch,
    policyLaunchState,
    policyReference,
    refreshConversationList,
    requestedPolicySlug,
  ]);

  const appendAssistantMessage = async (
    data: WidgetRouteResponse,
    submittedUserMessageId?: string
  ) => {
    if (
      data.userDisplayMode === "political_gate_blocked" &&
      submittedUserMessageId
    ) {
      // Next.js/FastAPI may be the layer that blocks after this user message
      // was optimistically rendered. Never retain that raw turn in browser
      // history, where it would be resent on the next submission.
      setMessages((current) =>
        current.filter((message) => message.id !== submittedUserMessageId)
      );
    }

    // Durability is reported by the backend, not assumed by the client. A turn
    // counts as saved only when the server stored and linked both messages.
    const persistence = data.persistence ?? null;
    const persistenceState = resolveWorkspacePersistence(persistence);
    if (persistence && !persistenceState.saved) {
      setPersistenceNotice(persistence);
    } else {
      setPersistenceNotice(null);
      if (persistenceState.saved) {
        pendingSubmissionRef.current = null;
      }
    }

    if (data.matterId) {
      setMatterId(data.matterId);
      refreshConversationList().catch((refreshError) => {
        console.error("Failed to refresh conversation list", refreshError);
      });
    }

    const knownFactsFromBackend =
      data.interactionPlan?.known_facts_summary ?? {};
    if (Object.keys(knownFactsFromBackend).length > 0) {
      setIntakeFacts((current) => ({
        ...current,
        ...knownFactsFromBackend,
      }));
    }

    const fullText =
      data.text?.trim() && data.text.trim().length > 0
        ? data.text.trim()
        : data.responseLanguage === "zh"
          ? "抱歉，我现在无法生成回复。"
          : "Sorry, I could not generate a response right now.";

    const persistedAssistantMessageId = data.assistantMessageId ?? null;
    const assistantMessageId = persistedAssistantMessageId ?? generateUUID();
    const assistantMessage: WidgetAssistantMessage = {
      id: assistantMessageId,
      role: "assistant",
      text: "",
      persistedAssistantMessageId,
      isStreaming: true,
      responseLanguage: data.responseLanguage ?? null,
      researchStatus: data.researchStatus ?? null,
      citations: data.citations ?? [],
      compactSources: data.compactSources ?? [],
      customerDocumentEvidenceUsed: data.customerDocumentEvidenceUsed === true,
      customerDocumentUsage: data.customerDocumentUsage ?? "not_supplied",
      customerDocumentSources: data.customerDocumentSources ?? [],
      userDisplayMode: data.userDisplayMode ?? null,
      followUpQuestions: data.followUpQuestions ?? [],
      missingFacts: data.missingFacts ?? [],
      evidenceGaps: data.evidenceGaps ?? [],
      confidence: data.confidence ?? null,
      escalate: Boolean(data.escalate),
      nextAction: data.nextAction ?? null,
      matterId: data.matterId ?? null,
      conversationState: data.conversationState ?? null,
      caseHypothesis: data.caseHypothesis ?? null,
      factSlotStates: data.factSlotStates ?? [],
      interactionPlan: data.interactionPlan ?? null,
      retrievalDebug: data.retrievalDebug ?? null,
    };

    shouldAutoScrollRef.current = true;
    setStatus("typing");
    setMessages((current) => [...current, assistantMessage]);
    scrollToBottom(true);

    const tokens = splitIntoDisplayTokens(fullText);
    let visibleTokenCount = 0;

    while (visibleTokenCount < tokens.length) {
      visibleTokenCount = Math.min(
        visibleTokenCount + TYPEWRITER_WORDS_PER_TICK,
        tokens.length
      );

      const visibleText = tokens.slice(0, visibleTokenCount).join("");
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantMessageId && message.role === "assistant"
            ? { ...message, text: visibleText }
            : message
        )
      );

      await sleep(TYPEWRITER_TICK_MS);
    }

    setMessages((current) =>
      current.map((message) =>
        message.id === assistantMessageId && message.role === "assistant"
          ? { ...message, text: fullText, isStreaming: false }
          : message
      )
    );
  };

  const appendBlockedResponse = async (decision: PoliticalGateResult) => {
    setInput("");
    resizeComposer();
    setDraftFacts({});
    setError(null);
    await appendAssistantMessage(blockedWidgetResponse(decision));
  };

  const sendToWidgetRoute = async (
    nextMessages: WidgetMessage[],
    facts: IntakeFacts,
    currentFacts: IntakeFacts = {},
    answerPreference: AnswerPreference = "answer_first",
    activeConversationId: string | null = conversationId,
    clientTurnId?: string
  ) => {
    const stableConversationId =
      activeConversationId ?? conversationId ?? generateUUID();
    /**
     * Phase 12 Stage 2: the request-scoped policy topic is the conversation's own
     * persisted binding. It is only a topic hint for the backend; the backend
     * resolves it again from the stored binding, so this value can never widen
     * access or invent a policy identity. A conversation without a binding sends
     * no `policySlug` field at all (an explicit JSON `null` used to be rejected).
     */
    const requestPolicySlug = requestPolicySlugForConversation({
      conversationId: stableConversationId,
      bindingChatId: policyBinding?.chatId ?? null,
      bindingSlug: policyBinding?.policySlug ?? null,
    });
    const body = JSON.stringify(
      buildWidgetTurnRequestBody({
        conversationId: stableConversationId,
        clientTurnId,
        matterId: matterId ?? null,
        intakeFacts: facts,
        currentIntakeFacts: currentFacts,
        answerPreference,
        assistantMode,
        policySlug: requestPolicySlug,
        messages: nextMessages.map((message) => ({
          id: message.id,
          role: message.role,
          text: message.text,
        })),
      })
    );

    /**
     * A duplicate submission (double click, network retry, second device) is
     * answered with `client_turn_in_progress` while the first request is still
     * generating. Retrying the same client turn is bounded and ends with the
     * server replaying the single saved answer instead of a second generation.
     */
    const maxAttempts = 3;
    let attempt = 0;
    while (true) {
      attempt += 1;
      let response: Response;
      try {
        response = await fetch(widgetRouteForAssistantMode(assistantMode), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        });
      } catch (fetchError) {
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          throw new ChatbotError("offline:chat");
        }
        throw fetchError;
      }
      if (response.ok) {
        return (await response.json()) as WidgetRouteResponse;
      }

      const failure = (await response.json().catch(() => null)) as {
        code?: string;
        cause?: string;
        error?: string;
        retryAfterMs?: number;
      } | null;

      if (
        failure?.code === "client_turn_in_progress" &&
        attempt < maxAttempts
      ) {
        const delay = Math.min(
          Math.max(Number(failure.retryAfterMs) || 1000, 500),
          5000
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      const localizedMessage =
        failure?.code === "client_turn_in_progress"
          ? copy.persistence.answerInProgress
          : failure?.code === "conversation_turn_not_persisted"
            ? copy.persistence.messageNotSaved
            : null;
      const failureError = new ChatbotError(
        (failure?.code ?? "bad_request:api") as ErrorCode,
        failure?.cause
      );
      const serverMessage =
        typeof failure?.error === "string" && failure.error.trim()
          ? failure.error.trim()
          : null;
      failureError.message =
        localizedMessage ?? serverMessage ?? failureError.message;
      throw failureError;
    }
  };

  const submitMessage = async (
    messageText: string,
    answerPreference: AnswerPreference = "answer_first"
  ) => {
    const trimmed = messageText.trim();
    if (!trimmed || status !== "ready") {
      return;
    }
    // Read-only archived history: the answer route requires a real immigration
    // conversation, so a new question is refused here instead of failing late.
    if (conversationOriginRef.current === "legacy_chat") {
      toast.error(copy.legacy.readOnlySubmitBlocked);
      return;
    }
    // Never send into a conversation that is still being switched away from.
    if (conversationLoading) {
      return;
    }

    const nextUserMessage: WidgetMessage = {
      id: generateUUID(),
      role: "user",
      text: trimmed,
    };

    const nextMessages = [
      ...(sanitizePoliticalHistory(messages) as WidgetMessage[]),
      nextUserMessage,
    ];
    const submissionDecision = evaluateWidgetSubmission({
      messages: nextMessages,
      currentIntakeFacts: {},
    });
    if (submissionDecision.decision === "block") {
      await appendBlockedResponse(submissionDecision);
      setStatus("ready");
      return;
    }

    const activeConversationId = conversationId ?? (await createConversation());
    if (!activeConversationId) {
      toast.error("Unable to create a new conversation.");
      return;
    }

    shouldAutoScrollRef.current = true;
    setMessages(nextMessages);
    scrollToBottom(true);
    setInput("");
    resizeComposer();
    const requestStartedAt = Date.now();
    setStatus("submitted");
    setSubmittedAt(requestStartedAt);
    setProgressNow(requestStartedAt);
    setError(null);

    try {
      // Recorded before the request so a failed or in-progress turn can be
      // retried with the same client turn id, which is what makes the server
      // replay one saved answer instead of generating another one.
      pendingSubmissionRef.current = {
        clientTurnId: nextUserMessage.id,
        conversationId: activeConversationId,
        messages: nextMessages,
      };
      const data = await sendToWidgetRoute(
        nextMessages,
        intakeFacts,
        {},
        answerPreference,
        activeConversationId,
        nextUserMessage.id
      );
      await appendAssistantMessage(data, nextUserMessage.id);
    } catch (requestError) {
      const message =
        requestError instanceof ChatbotError
          ? requestError.message
          : requestError instanceof Error
            ? requestError.message
            : "Unable to reach the assistant right now.";
      const failureCode =
        requestError instanceof ChatbotError ? String(requestError.type) : null;
      if (
        failureCode === "client_turn_in_progress" ||
        failureCode === "conversation_turn_not_persisted"
      ) {
        setPersistenceNotice({
          clientTurnId: nextUserMessage.id,
          userTurnPersisted: false,
          assistantTurnPersisted: false,
          assistantMessageId: null,
          errorCode: failureCode,
          replayed: false,
          attempts: 1,
          saved: false,
          retryable: true,
          retryAfterMs: null,
        });
      }
      setError(message);
      toast.error(message);
    } finally {
      setStatus("ready");
      setSubmittedAt(null);
    }
  };

  /**
   * Retries only the durable write of an already-generated answer by resending
   * the same client turn id. The backend completes persistence from the stored
   * payload without another model call.
   */
  const retryPersistence = async () => {
    const pending = pendingSubmissionRef.current;
    if (!pending || retryingPersistence) {
      return;
    }
    if (conversationOriginRef.current === "legacy_chat") {
      toast.error(copy.legacy.readOnlySubmitBlocked);
      return;
    }
    setRetryingPersistence(true);
    try {
      const data = await sendToWidgetRoute(
        pending.messages,
        intakeFacts,
        {},
        "answer_first",
        pending.conversationId,
        pending.clientTurnId
      );
      const persistence = data.persistence ?? null;
      const persistenceState = resolveWorkspacePersistence(persistence);
      if (persistenceState.saved) {
        setPersistenceNotice(null);
        pendingSubmissionRef.current = null;
      } else {
        setPersistenceNotice((current) => persistence ?? current);
        toast.error(copy.persistence.notSaved);
      }
    } catch (retryError) {
      const message =
        retryError instanceof Error
          ? retryError.message
          : copy.persistence.notSaved;
      toast.error(message);
    } finally {
      setRetryingPersistence(false);
    }
  };

  const handleDraftChange = (
    key: string,
    value: string | number | boolean | null
  ) => {
    setDraftFacts((current) => ({ ...current, [key]: value }));
  };

  const handleSubmitDraftFacts = async () => {
    if (status !== "ready") {
      return;
    }
    // Guided intake writes a turn into the conversation, so it is unavailable in
    // read-only archived history.
    if (conversationOriginRef.current === "legacy_chat") {
      toast.error(copy.legacy.readOnlyIntakeBlocked);
      return;
    }
    if (conversationLoading) {
      return;
    }

    const mergedFacts = { ...intakeFacts, ...draftFacts };
    const syntheticText = buildGuidedIntakeSummary(draftFacts);
    const visibleText = buildGuidedIntakeDisplaySummary(
      draftFacts,
      copy,
      locale
    );

    const visibleUserMessage: WidgetMessage = {
      id: generateUUID(),
      role: "user",
      text: visibleText,
    };
    const backendUserMessage: WidgetMessage = {
      id: generateUUID(),
      role: "user",
      text: syntheticText,
    };

    const safeHistory = sanitizePoliticalHistory(messages) as WidgetMessage[];
    const visibleMessages = [...safeHistory, visibleUserMessage];
    const backendMessages = [...safeHistory, backendUserMessage];

    const submissionDecision = evaluateWidgetSubmission({
      messages: backendMessages,
      currentIntakeFacts: draftFacts,
    });
    if (submissionDecision.decision === "block") {
      await appendBlockedResponse(submissionDecision);
      setStatus("ready");
      return;
    }

    const activeConversationId = conversationId ?? (await createConversation());
    if (!activeConversationId) {
      toast.error("Unable to create a new conversation.");
      return;
    }

    shouldAutoScrollRef.current = true;
    setMessages(visibleMessages);
    scrollToBottom(true);
    setIntakeFacts(mergedFacts);
    setDraftFacts({});
    const requestStartedAt = Date.now();
    setStatus("submitted");
    setSubmittedAt(requestStartedAt);
    setProgressNow(requestStartedAt);
    setError(null);

    try {
      const data = await sendToWidgetRoute(
        backendMessages,
        mergedFacts,
        draftFacts,
        "answer_first",
        activeConversationId
      );
      await appendAssistantMessage(data, visibleUserMessage.id);
    } catch (requestError) {
      const message =
        requestError instanceof ChatbotError
          ? requestError.message
          : requestError instanceof Error
            ? requestError.message
            : "Unable to submit the intake details right now.";
      setError(message);
      toast.error(message);
    } finally {
      setStatus("ready");
      setSubmittedAt(null);
    }
  };
  const handleBookConsultation = (_responseLanguage?: string | null) => {
    if (conversationOriginRef.current === "legacy_chat") {
      toast.error(copy.legacy.readOnlyLawyerBlocked);
      return;
    }
    router.push(consultationCreateHref(conversationId));
  };

  const pendingElapsedMs = submittedAt === null ? 0 : progressNow - submittedAt;
  const latestUserMessage = [...messages]
    .reverse()
    .find((message) => message.role === "user");
  const pendingIsZh =
    latestUserMessage?.role === "user"
      ? looksChineseText(latestUserMessage.text)
      : false;

  return (
    <section
      className="mx-auto flex min-h-0 w-full max-w-[1600px] flex-col px-3 pb-4 pt-3 sm:px-6 lg:px-8 xl:h-full"
      id="ai-workspace"
    >
      <header className="mb-3 flex flex-col gap-3 rounded-2xl bg-[#001736] px-4 py-3 text-white shadow-sm sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-cyan-200">
            <Bot className="size-4" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold">
              {copy.identity.title}
            </h1>
            <p className="truncate text-xs text-slate-300">
              {copy.identity.subtitle}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-200">
          <span aria-live="polite" className="inline-flex items-center gap-2">
            <span className="size-2 rounded-full bg-emerald-300" />
            <span>
              {copy.status.label} · {statusText(status, copy)}
            </span>
          </span>
          <span>
            {copy.history.chat}{" "}
            <span className="font-mono text-cyan-100">
              {conversationId
                ? conversationId.slice(0, 8)
                : copy.status.loading}
            </span>
          </span>
          <span>
            {copy.history.matter}{" "}
            <span className="font-mono text-cyan-100">
              {matterId ? matterId.slice(0, 8) : copy.status.noMatter}
            </span>
          </span>
        </div>
      </header>

      {/*
        Phase 12 Stage 2: below the desktop breakpoint the chat keeps the whole
        width and one labelled panel is available at a time, instead of forcing a
        narrow right-hand column. The panel components stay mounted, so switching
        tabs never refetches or loses state.
      */}
      {isWideViewport ? null : (
        <div
          aria-label={copy.panels.label}
          className="mb-2 flex min-w-0 items-center gap-1 overflow-x-auto rounded-xl bg-white p-1 shadow-sm"
          data-testid="workspace-panel-tabs"
          role="tablist"
        >
          {(
            [
              ["history", copy.panels.history],
              ["conversationFiles", copy.panels.conversationFiles],
              ["accountFiles", copy.panels.accountFiles],
              ["caseSummary", copy.panels.caseSummary],
            ] as const
          ).map(([panelId, label]) => (
            <button
              aria-selected={activePanel === panelId}
              className={cn(
                "shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                activePanel === panelId
                  ? "bg-[#001736] text-white"
                  : "text-slate-600 hover:bg-slate-100"
              )}
              data-testid={`workspace-panel-tab-${panelId}`}
              key={panelId}
              onClick={() =>
                setActivePanel((current) =>
                  current === panelId ? "none" : panelId
                )
              }
              role="tab"
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <div className="grid min-w-0 grid-cols-1 gap-3 xl:min-h-0 xl:flex-1 xl:grid-cols-[250px_minmax(0,1fr)_290px] xl:gap-0 xl:overflow-hidden xl:rounded-2xl xl:bg-white xl:shadow-[0_24px_48px_-12px_rgba(0,23,54,0.12)]">
        <aside
          className={cn(
            "order-2 min-w-0 rounded-2xl bg-[#f3f4f5] p-4 xl:order-1 xl:min-h-0 xl:overflow-y-auto xl:rounded-none xl:p-4",
            isWideViewport || activePanel === "history" ? "block" : "hidden",
            isWideViewport ? "" : "max-h-[38dvh] overflow-y-auto"
          )}
          data-testid="workspace-history-panel"
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-950">
                {copy.history.title}
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                {copy.history.quickQuestions}
              </p>
            </div>
            <button
              className="shrink-0 rounded-xl bg-[#001736] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#002b5b] disabled:opacity-50"
              disabled={status !== "ready" || conversationLoading}
              onClick={() => {
                createConversation().catch((conversationError) => {
                  const message =
                    conversationError instanceof Error
                      ? conversationError.message
                      : "Unable to create a new conversation.";
                  toast.error(message);
                });
              }}
              type="button"
            >
              + {copy.history.newConversation}
            </button>
          </div>

          <div className="space-y-2">
            {conversationLoading ? (
              <p className="rounded-xl bg-white p-3 text-xs text-slate-500">
                {copy.history.loading}
              </p>
            ) : null}
            {conversations.map((conversation) => (
              <button
                className={cn(
                  "w-full rounded-xl p-3 text-left text-xs leading-5 transition",
                  conversation.chatId === conversationId
                    ? "bg-[#001736] text-white"
                    : "bg-white text-slate-700 hover:bg-slate-100"
                )}
                disabled={status !== "ready" || conversationLoading}
                key={conversation.chatId}
                onClick={() => loadConversation(conversation.chatId)}
                type="button"
              >
                <span className="block truncate font-semibold">
                  {conversation.title || copy.history.unnamed}
                  {conversation.origin === "legacy_chat" ? (
                    <LegacyConversationBadge copy={copy} />
                  ) : null}
                  {conversation.policyBinding ? (
                    <span
                      className="ml-1 inline-flex rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-900"
                      data-testid="conversation-policy-badge"
                      title={
                        conversation.policyBinding.title[locale] ||
                        copy.history.policyTopicBadge
                      }
                    >
                      {copy.history.policyTopicBadge}
                    </span>
                  ) : null}
                </span>
                <span className="mt-1 block text-[11px] opacity-75">
                  {formatConversationUpdatedAt(
                    conversation.updatedAt,
                    conversation.createdAt,
                    locale,
                    copy.history.updatedUnavailable
                  )}
                </span>
                <span className="mt-1 block break-all font-mono text-[10px] opacity-75">
                  {copy.history.chat} {conversation.chatId.slice(0, 8)} ·{" "}
                  {copy.history.matter}{" "}
                  {conversation.legalMatterId
                    ? conversation.legalMatterId.slice(0, 8)
                    : copy.status.noMatter}
                </span>
                {conversation.origin === "legacy_chat" ? (
                  <span className="mt-1 block text-[11px] opacity-75">
                    {copy.legacy.listHint}
                  </span>
                ) : null}
              </button>
            ))}
            {!conversationLoading && conversations.length === 0 ? (
              <p className="rounded-xl bg-white p-3 text-xs text-slate-500">
                {copy.history.empty}
              </p>
            ) : null}
            {conversationLoadFailed ? (
              <p
                className="rounded-xl bg-red-50 p-3 text-xs text-red-700"
                role="alert"
              >
                {copy.history.loadFailed}
              </p>
            ) : null}
            {conversationHasMore ? (
              <button
                className="w-full rounded-xl border border-dashed border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                data-testid="load-older-conversations"
                disabled={status !== "ready" || loadingOlderConversations}
                onClick={() => loadOlderConversations()}
                type="button"
              >
                {loadingOlderConversations
                  ? copy.history.loading
                  : copy.history.loadOlder}
              </button>
            ) : conversations.length > 0 ? (
              <p className="px-1 text-[11px] text-slate-400">
                {copy.history.allLoaded}
                {conversationTotalCount === null
                  ? ""
                  : ` (${conversationTotalCount})`}
              </p>
            ) : null}
          </div>

          <div className="mt-4 space-y-2">
            <p className="text-xs font-semibold text-slate-500">
              {copy.history.quickQuestions}
            </p>
            {quickQuestions.map((question) => (
              <button
                className="w-full rounded-xl bg-white px-3 py-2 text-left text-xs leading-5 text-slate-700 transition hover:bg-cyan-50 disabled:opacity-50"
                disabled={!interaction.canUseSuggestedQuestions}
                key={question}
                onClick={() => submitMessage(question)}
                type="button"
              >
                {question}
              </button>
            ))}
          </div>
        </aside>

        <div
          className={cn(
            "order-1 flex min-w-0 flex-col overflow-hidden rounded-2xl bg-white shadow-sm xl:order-2 xl:h-auto xl:min-h-0 xl:rounded-none xl:shadow-none",
            isWideViewport
              ? "h-auto min-h-[560px] xl:h-full"
              : "h-[min(66dvh,620px)] min-h-[320px]"
          )}
        >
          <div className="border-b border-slate-100 px-4 py-3 sm:px-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="inline-flex items-center gap-2 text-xs text-slate-500">
                  <span className="inline-flex size-2 rounded-full bg-emerald-400" />
                  {copy.consultation.status}
                </p>
                <h2 className="mt-1 text-base font-semibold text-slate-950">
                  {copy.consultation.title}
                </h2>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {isReadOnlyConversation ? (
                  <Badge
                    className="rounded-full bg-amber-100 text-[10px] text-amber-900 hover:bg-amber-100"
                    data-testid="legacy-conversation-header-badge"
                    variant="secondary"
                  >
                    {copy.legacy.badge}
                  </Badge>
                ) : null}
                <Badge
                  className="rounded-full bg-slate-100 text-[10px] text-slate-700 hover:bg-slate-100"
                  variant="secondary"
                >
                  {copy.consultation.generalInformation}
                </Badge>
                <Badge
                  className="rounded-full bg-cyan-50 text-[10px] text-cyan-800 hover:bg-cyan-50"
                  variant="secondary"
                >
                  {copy.consultation.australiaFocus}
                </Badge>
              </div>
            </div>
          </div>

          <div
            className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] px-4 py-4 sm:px-5"
            data-testid="workspace-message-list"
            onScroll={handleMessageListScroll}
            ref={listRef}
          >
            {activePolicyReference &&
            shouldApplyPolicyBinding({
              binding: policyBinding,
              activeChatId: conversationId,
              requestedChatId: conversationId,
            }) ? (
              <section
                className="mb-5 rounded-xl border border-violet-200 bg-violet-50/80 px-4 py-3"
                data-policy-continuity="topic-reference-only"
              >
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-violet-800">
                      {policyCopy.askAi}
                    </p>
                    <h2 className="mt-1 break-words text-sm font-semibold text-slate-900">
                      {activePolicyReference.title[locale]}
                    </h2>
                    <p className="mt-1 text-xs leading-5 text-slate-600">
                      {policyCopy.workspaceOpener}
                    </p>
                    <p className="mt-2 text-[11px] font-medium text-violet-900">
                      {activePolicyReference.revision?.number
                        ? `${copy.policy.revision}: r${activePolicyReference.revision.number}`
                        : copy.policy.revisionUnknown}
                      {policyBinding?.boundAt
                        ? ` · ${copy.policy.boundAt}: ${formatConversationUpdatedAt(
                            policyBinding.boundAt,
                            null,
                            locale,
                            copy.history.updatedUnavailable
                          )}`
                        : null}
                    </p>
                    {/*
                      The snapshot is a topic reference, never verified current
                      law. This distinction is always visible with the card.
                    */}
                    <p className="mt-1 text-[11px] leading-4 text-violet-800/90">
                      {copy.policy.snapshotNotice}
                    </p>
                  </div>
                  {activePolicyReference.officialUrl ? (
                    <a
                      className="shrink-0 text-xs font-semibold text-violet-900 underline"
                      href={activePolicyReference.officialUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {policyCopy.officialSource}:{" "}
                      {activePolicyReference.officialTitle ??
                        activePolicyReference.title[locale]}
                    </a>
                  ) : (
                    <span className="shrink-0 text-xs text-violet-900/80">
                      {policyCopy.noOfficialSource}
                    </span>
                  )}
                </div>
              </section>
            ) : null}
            {policyLaunchFailure ? (
              /**
               * Phase 12 Stage 2: a policy launch that could not be persisted is
               * reported explicitly, with honest recovery paths. It is never
               * silently replaced by an unrelated chat or a blank one.
               */
              <section
                className="mb-5 rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm"
                data-policy-launch-state={policyLaunchFailure.code}
                role="alert"
              >
                <h2 className="font-semibold text-amber-900">
                  {policyLaunchFailure.schemaUnavailable
                    ? copy.policy.launchSchemaTitle
                    : policyLaunchFailure.retryable
                      ? copy.policy.launchFailedTitle
                      : copy.policy.sourceUnavailableTitle}
                </h2>
                <p className="mt-1 text-xs leading-5 text-amber-900/90">
                  {policyLaunchFailure.schemaUnavailable
                    ? copy.policy.launchSchemaBody
                    : policyLaunchFailure.retryable
                      ? copy.policy.launchFailedBody
                      : copy.policy.sourceUnavailableBody}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {policyLaunchFailure.retryable && requestedPolicySlug ? (
                    <Button
                      data-testid="policy-launch-retry"
                      onClick={() => retryPolicyLaunch()}
                      size="sm"
                      type="button"
                    >
                      {copy.policy.retry}
                    </Button>
                  ) : null}
                  {requestedPolicySlug ? (
                    <Button asChild size="sm" type="button" variant="outline">
                      <Link href={`/intelligence/${requestedPolicySlug}`}>
                        {copy.policy.openPolicy}
                      </Link>
                    </Button>
                  ) : null}
                  <Button
                    data-testid="policy-launch-continue-without"
                    onClick={() => {
                      // Explicit user choice: an ordinary conversation. This is
                      // the only path that may drop the policy topic.
                      setPolicyLaunchFailure(null);
                      startNewConversation();
                    }}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    {copy.policy.continueWithoutPolicy}
                  </Button>
                </div>
              </section>
            ) : null}
            {launchingPolicy ? (
              <p
                className="mb-5 rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 text-xs text-violet-900"
                data-testid="policy-launch-progress"
              >
                {copy.status.loading}
              </p>
            ) : null}
            {messages.length === 0 ? (
              <div className="flex min-h-full items-center justify-center py-8">
                <div className="mx-auto max-w-2xl text-center">
                  <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-[#001736] text-cyan-200">
                    <Sparkles className="size-5" />
                  </div>
                  <h3 className="text-xl font-semibold tracking-tight text-slate-950">
                    {copy.consultation.emptyTitle}
                  </h3>
                  <p className="mt-3 text-sm leading-7 text-slate-600">
                    {copy.consultation.emptyDescription}
                  </p>
                  <div className="mt-5 flex flex-wrap justify-center gap-2">
                    {quickQuestions.slice(0, 3).map((question) => (
                      <button
                        className="rounded-full bg-slate-100 px-3 py-2 text-left text-xs leading-5 text-slate-700 transition hover:bg-cyan-50 disabled:opacity-50"
                        disabled={!interaction.canUseSuggestedQuestions}
                        key={question}
                        onClick={() => submitMessage(question)}
                        type="button"
                      >
                        {question.length > 58
                          ? `${question.slice(0, 58)}…`
                          : question}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="min-w-0 space-y-5 pb-4">
                {hasOlderMessages ? (
                  <button
                    className="mx-auto block rounded-full border border-dashed border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                    data-testid="load-earlier-messages"
                    disabled={status !== "ready" || loadingOlderMessages}
                    onClick={() => loadOlderMessages()}
                    type="button"
                  >
                    {loadingOlderMessages
                      ? copy.messages.loadingEarlier
                      : copy.messages.loadEarlier}
                  </button>
                ) : null}
                {messages.map((message) => {
                  const isAssistant = message.role === "assistant";
                  const isLatestAssistant =
                    isAssistant && latestAssistant?.id === message.id;
                  return (
                    <div
                      className={cn(
                        "flex min-w-0 gap-3",
                        isAssistant ? "items-start" : "justify-end"
                      )}
                      key={message.id}
                    >
                      {isAssistant ? (
                        <div className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-xl bg-[#001736] text-cyan-200">
                          <Bot className="size-4" />
                        </div>
                      ) : null}
                      <div
                        className={cn(
                          "min-w-0 space-y-3",
                          isAssistant
                            ? "w-full max-w-full"
                            : "flex max-w-[86%] flex-col items-end"
                        )}
                      >
                        <div
                          className={cn(
                            "min-w-0 max-w-full overflow-hidden rounded-2xl px-4 py-3 text-sm leading-7",
                            isAssistant
                              ? "bg-[#f3f4f5] text-slate-700"
                              : "bg-[#001736] text-white"
                          )}
                          data-testid={
                            isAssistant &&
                            message.userDisplayMode === "political_gate_blocked"
                              ? "political-block-response"
                              : isAssistant
                                ? "workspace-assistant-message"
                                : "workspace-user-message"
                          }
                        >
                          {isAssistant ? (
                            <AssistantRichMarkdown text={message.text} />
                          ) : (
                            <div className="whitespace-pre-wrap">
                              {message.text}
                            </div>
                          )}
                          {isAssistant && message.isStreaming ? (
                            <div className="mt-3 flex items-center gap-2 text-xs text-slate-400">
                              <Loader2 className="size-3.5 animate-spin" />
                              {isZhLanguage(message.responseLanguage)
                                ? "正在整理答复…"
                                : "Preparing answer…"}
                            </div>
                          ) : null}
                          {isAssistant &&
                          !message.isStreaming &&
                          message.researchStatus === "incomplete" ? (
                            <div className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-900">
                              {isZhLanguage(message.responseLanguage)
                                ? "研究未完成：来源核对已达到时间限制。这是尽力答复，部分内容可能仍需进一步核实。"
                                : "Research incomplete: the source check reached its time limit. This is a best-effort answer and some points may require further verification."}
                            </div>
                          ) : null}
                        </div>

                        {isAssistant &&
                        !message.isStreaming &&
                        message.customerDocumentSources?.length ? (
                          <section
                            className="rounded-xl border border-amber-200 bg-amber-50 p-3"
                            data-testid="customer-document-sources"
                          >
                            <h4 className="text-xs font-semibold text-amber-950">
                              {copy.documents.customerEvidence}
                            </h4>
                            <ul className="mt-2 space-y-2 text-xs text-amber-950">
                              {message.customerDocumentSources.map((source) => (
                                <li
                                  key={`${source.documentId}:${source.runId}`}
                                >
                                  <p className="font-medium">
                                    {source.originalFilename} ·{" "}
                                    {source.runStatus.replaceAll("_", " ")}
                                  </p>
                                  {source.locators.map((locator) => (
                                    <p
                                      className="text-amber-800"
                                      key={JSON.stringify(locator)}
                                    >
                                      {Object.entries(locator)
                                        .map(
                                          ([key, value]) => `${key}: ${value}`
                                        )
                                        .join(" · ")}
                                    </p>
                                  ))}
                                  {source.truncated ||
                                  source.runStatus !== "complete" ? (
                                    <p className="mt-1">
                                      {copy.documents.warning}
                                    </p>
                                  ) : null}
                                </li>
                              ))}
                            </ul>
                          </section>
                        ) : null}

                        {isAssistant &&
                        !message.isStreaming &&
                        !hasTerminalReferenceSection(message.text) &&
                        compactSourcesForMessage(message).length ? (
                          <CollapsibleSourceList
                            className="rounded-xl bg-slate-50 p-3"
                            items={compactSourcesForMessage(message)}
                            label={copy.consultation.sources}
                          />
                        ) : null}

                        {isAssistant &&
                        !message.isStreaming &&
                        message.escalate ? (
                          <Card className="rounded-xl border-amber-200 bg-amber-50 shadow-none">
                            <CardContent className="flex items-start gap-3 p-4 text-sm leading-6 text-amber-900">
                              <CalendarDays className="mt-0.5 size-5 shrink-0" />
                              <div>
                                <p className="font-medium">
                                  {copy.consultation.escalationTitle}
                                </p>
                                <p className="mt-1 text-amber-800">
                                  {copy.consultation.escalationDescription}
                                </p>
                              </div>
                            </CardContent>
                          </Card>
                        ) : null}

                        {isAssistant &&
                        !message.isStreaming &&
                        interaction.canRequestLawyerReview &&
                        conversationId &&
                        persistedAssistantMessageIdForReview(message) ? (
                          <LawyerRequestAction
                            answerPreview={message.text}
                            assistantMessageId={
                              persistedAssistantMessageIdForReview(message) ??
                              ""
                            }
                            chatId={conversationId}
                          />
                        ) : null}

                        {isAssistant &&
                        isLatestAssistant &&
                        !message.isStreaming &&
                        interaction.canUseGuidedIntake ? (
                          <GuidedIntakeCard
                            draftFacts={draftFacts}
                            factSlotStates={message.factSlotStates}
                            interactionPlan={message.interactionPlan}
                            isSubmitting={status !== "ready"}
                            onBookConsultation={() =>
                              handleBookConsultation(message.responseLanguage)
                            }
                            onDraftChange={handleDraftChange}
                            onSubmitDraftFacts={handleSubmitDraftFacts}
                            responseLanguage={message.responseLanguage}
                          />
                        ) : null}

                        {SHOW_WORKSPACE_DEBUG &&
                        isAssistant &&
                        message.retrievalDebug ? (
                          <details className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-500">
                            <summary className="cursor-pointer font-medium text-slate-700">
                              Debug
                            </summary>
                            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap">
                              {JSON.stringify(message.retrievalDebug, null, 2)}
                            </pre>
                          </details>
                        ) : null}
                      </div>
                      {isAssistant ? null : (
                        <div className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                          <UserRound className="size-4" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {status === "submitted" ? (
            <div className="px-3 pb-3">
              <WorkspaceProcessingCard
                assistantMode={assistantMode}
                elapsedMs={pendingElapsedMs}
                isZh={pendingIsZh}
              />
            </div>
          ) : null}
          {error ? (
            <div className="border-t border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}
          {persistenceNotice &&
          resolveWorkspacePersistence(persistenceNotice).noticeKind !==
            "none" ? (
            <div
              className="flex flex-wrap items-center justify-between gap-2 border-t border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-900"
              data-testid="persistence-notice"
            >
              <span>
                {persistenceNotice.errorCode === "client_turn_in_progress"
                  ? copy.persistence.answerInProgress
                  : persistenceNotice.errorCode ===
                      "conversation_turn_not_persisted"
                    ? copy.persistence.messageNotSaved
                    : copy.persistence.notSaved}
              </span>
              <button
                className="shrink-0 rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-xs font-semibold text-amber-900 transition hover:bg-amber-100 disabled:opacity-50"
                disabled={retryingPersistence}
                onClick={() => retryPersistence()}
                type="button"
              >
                {retryingPersistence
                  ? copy.persistence.retrying
                  : persistenceNotice.errorCode === "client_turn_in_progress"
                    ? copy.persistence.checkSavedAnswer
                    : persistenceNotice.errorCode ===
                        "conversation_turn_not_persisted"
                      ? copy.persistence.retrySending
                      : copy.persistence.retrySave}
              </button>
            </div>
          ) : null}

          <div className="border-t border-slate-100 bg-white p-2 sm:p-3">
            {isReadOnlyConversation ? (
              // Archived history: no composer exists here, only reading and the
              // explicit path to a new conversation.
              <LegacyConversationNotice
                copy={copy}
                disabled={!interaction.canStartNewConversation}
                onStartNewConversation={startNewConversation}
              />
            ) : (
              /*
                Phase 12 Stage 2 interactive composer: one bounded auto-growing
                input, the upload control next to it and an always-reachable send
                button. Uploaded files are managed in the conversation file panel
                so no attachment list grows under the composer.
              */
              <div className="rounded-2xl border border-slate-200 bg-slate-100/80 p-1.5">
                <div className="flex min-w-0 items-end gap-1.5">
                  <MatterDocumentsPanel
                    accountAccess={canUseDocuments}
                    chatId={conversationId}
                    compact
                    copy={copy}
                    disabled={!interaction.canUploadDocuments}
                    onDocumentsChanged={notifyDocumentsChanged}
                  />
                  <textarea
                    aria-label={copy.consultation.placeholder}
                    className="max-h-[120px] min-h-[40px] min-w-0 flex-1 resize-none overflow-y-auto rounded-xl border-0 bg-transparent px-2 py-2 text-sm leading-5 text-slate-900 outline-none placeholder:text-slate-400 focus-visible:ring-0"
                    data-testid="workspace-input"
                    disabled={!interaction.canSubmitMessage}
                    onChange={(event) => {
                      setInput(event.target.value);
                      resizeComposer();
                    }}
                    onKeyDown={(event) => {
                      // Enter sends; Shift+Enter adds a line. IME composition
                      // (Chinese input) never submits a half-composed character.
                      if (
                        event.key !== "Enter" ||
                        event.shiftKey ||
                        event.nativeEvent.isComposing
                      ) {
                        return;
                      }
                      event.preventDefault();
                      submitMessage(input);
                    }}
                    placeholder={copy.consultation.placeholder}
                    ref={composerRef}
                    rows={1}
                    value={input}
                  />
                  <Button
                    aria-label={copy.consultation.send}
                    className="shrink-0 rounded-xl bg-[#001736] px-3 text-white hover:bg-[#002b5b] sm:px-4"
                    data-testid="workspace-send"
                    disabled={!input.trim() || !interaction.canSubmitMessage}
                    onClick={() => submitMessage(input)}
                    size="sm"
                    type="button"
                  >
                    {status === "ready" ? (
                      <Send className="size-4 sm:mr-2" />
                    ) : (
                      <Loader2 className="size-4 animate-spin sm:mr-2" />
                    )}
                    <span className="hidden sm:inline">
                      {copy.consultation.send}
                    </span>
                  </Button>
                </div>
                <p className="px-2 pt-1 text-[11px] leading-4 text-slate-500">
                  {status === "ready"
                    ? copy.consultation.composerHelp
                    : status === "submitted"
                      ? copy.status.submitted
                      : copy.status.typing}
                </p>
              </div>
            )}
          </div>
        </div>

        <aside
          className={cn(
            "order-3 min-w-0 space-y-3 rounded-2xl bg-[#f3f4f5] p-4 xl:min-h-0 xl:overflow-y-auto xl:rounded-none xl:p-4",
            isWideViewport ||
              activePanel === "conversationFiles" ||
              activePanel === "accountFiles" ||
              activePanel === "caseSummary"
              ? "block"
              : "hidden",
            isWideViewport ? "" : "max-h-[38dvh] overflow-y-auto"
          )}
          data-testid="workspace-context-panel"
        >
          {/*
            This conversation's own files are the AI evidence scope. They are
            managed here, next to the composer, instead of growing under it.
          */}
          <section
            className={cn(
              "rounded-xl bg-white",
              isWideViewport || activePanel === "conversationFiles"
                ? ""
                : "hidden"
            )}
            data-testid="workspace-conversation-files"
          >
            <MatterDocumentsPanel
              accountAccess={canUseDocuments}
              chatId={conversationId}
              copy={copy}
              disabled={!interaction.canUploadDocuments}
              onDocumentsChanged={notifyDocumentsChanged}
            />
            <p className="px-4 pb-3 text-[11px] leading-4 text-slate-500">
              {copy.panels.conversationFilesHint}
            </p>
          </section>

          <div
            className={cn(
              isWideViewport || activePanel === "accountFiles" ? "" : "hidden"
            )}
            data-testid="workspace-account-files"
          >
            <UserDocumentHistoryPanel
              accountAccess={canUseDocuments}
              copy={copy}
              refreshToken={documentsRevision}
            />
          </div>

          <div
            className={cn(
              "space-y-3",
              isWideViewport || activePanel === "caseSummary" ? "" : "hidden"
            )}
            data-testid="workspace-case-summary"
          >
            <section className="rounded-xl bg-white p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h3 className="mt-1 font-semibold text-slate-950">
                    {copy.matter.knownFacts}
                  </h3>
                </div>
                <Badge
                  className="rounded-full bg-slate-100 text-[10px] text-slate-600 hover:bg-slate-100"
                  variant="secondary"
                >
                  {copy.matter.factsCount(
                    latestWorkspaceCaseSummary.knownFacts.length
                  )}
                </Badge>
              </div>
              {latestWorkspaceCaseSummary.knownFacts.length ? (
                <div className="space-y-2">
                  {latestWorkspaceCaseSummary.knownFacts.map((fact) => (
                    <div
                      className="rounded-lg bg-slate-50 p-3 text-sm"
                      key={fact.key}
                    >
                      <p className="text-xs text-slate-500">{fact.label}</p>
                      <p className="mt-1 font-medium text-slate-800">
                        {fact.value}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm leading-6 text-slate-500">
                  {copy.matter.noFacts}
                </p>
              )}
              <h4 className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {copy.matter.toConfirm}
              </h4>
              {latestWorkspaceCaseSummary.requestedFacts.length ? (
                <div className="space-y-2">
                  {latestWorkspaceCaseSummary.requestedFacts.map((fact) => (
                    <div
                      className="rounded-lg bg-cyan-50 p-3 text-sm"
                      key={fact.key}
                    >
                      <p className="font-medium text-cyan-950">{fact.prompt}</p>
                      {fact.prompt !== fact.label ? (
                        <p className="mt-1 text-xs text-cyan-900">
                          {fact.label}
                        </p>
                      ) : null}
                      {fact.whyNeeded ? (
                        <p className="mt-2 text-xs leading-5 text-cyan-900">
                          <span className="font-medium">
                            {copy.matter.whyNeeded}:{" "}
                          </span>
                          {fact.whyNeeded}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm leading-6 text-slate-500">
                  {copy.matter.noRequestedFacts}
                </p>
              )}
              <Button
                className="mt-4 w-full"
                onClick={() =>
                  setCaseSummarySnapshot(latestWorkspaceCaseSummary)
                }
                type="button"
                variant="outline"
              >
                {caseSummarySnapshot
                  ? copy.matter.regenerateSummary
                  : copy.matter.generateSummary}
              </Button>
            </section>

            {caseSummarySnapshot ? (
              <section
                className="rounded-xl border border-slate-200 bg-white p-4"
                data-testid="workspace-case-summary-snapshot"
              >
                <h3 className="text-sm font-semibold text-slate-950">
                  {copy.matter.summaryGenerated}
                </h3>
                <div className="mt-3 space-y-3 text-sm">
                  <div>
                    <h4 className="font-medium text-slate-700">
                      {copy.matter.knownFacts}
                    </h4>
                    {caseSummarySnapshot.knownFacts.length ? (
                      <dl className="mt-2 space-y-2">
                        {caseSummarySnapshot.knownFacts.map((fact) => (
                          <div key={fact.key}>
                            <dt className="text-xs text-slate-500">
                              {fact.label}
                            </dt>
                            <dd className="text-slate-800">{fact.value}</dd>
                          </div>
                        ))}
                      </dl>
                    ) : (
                      <p className="mt-1 text-slate-500">
                        {copy.matter.noFacts}
                      </p>
                    )}
                  </div>
                  <div>
                    <h4 className="font-medium text-slate-700">
                      {copy.matter.toConfirm}
                    </h4>
                    {caseSummarySnapshot.requestedFacts.length ? (
                      <ul className="mt-2 space-y-2">
                        {caseSummarySnapshot.requestedFacts.map((fact) => (
                          <li key={fact.key}>
                            <p className="font-medium text-slate-800">
                              {fact.prompt}
                            </p>
                            {fact.prompt !== fact.label ? (
                              <p className="text-xs text-slate-500">
                                {fact.label}
                              </p>
                            ) : null}
                            {fact.whyNeeded ? (
                              <p className="mt-1 text-xs text-slate-600">
                                {copy.matter.whyNeeded}: {fact.whyNeeded}
                              </p>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1 text-slate-500">
                        {copy.matter.noRequestedFacts}
                      </p>
                    )}
                  </div>
                </div>
              </section>
            ) : null}
          </div>
        </aside>
      </div>
      <p className="mt-3 px-1 text-xs leading-5 text-slate-500">
        {copy.legalDisclaimer}
      </p>
    </section>
  );
}
