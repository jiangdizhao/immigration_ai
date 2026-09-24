"use client";

import {
  Bot,
  CalendarDays,
  Clock3,
  Loader2,
  Send,
  Sparkles,
  UserRound,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { DEFAULT_CHAT_MODEL } from "@/lib/ai/models";
import {
  type AssistantMode,
  widgetRouteForAssistantMode,
} from "@/lib/assistant-mode";
import { ChatbotError } from "@/lib/errors";
import { persistedAssistantMessageIdForReview } from "@/lib/lawyer-requests/message-identity";
import { customerDocumentSelectionAfterSubmission } from "@/lib/matter-documents/customer-document-provenance";
import {
  blockedResponseForLocale,
  evaluateWidgetSubmission,
  type PoliticalGateResult,
  sanitizePoliticalHistory,
} from "@/lib/political-gate";
import { cn, fetchWithErrorHandlers, generateUUID } from "@/lib/utils";
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
} from "./guided-intake-types";
import { LawyerRequestAction } from "./lawyer-request-action";
import { MatterDocumentsPanel } from "./matter-documents-panel";
import { useSiteLocale } from "./site-locale-provider";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { Textarea } from "./ui/textarea";

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

function formatKey(
  value: string | null | undefined,
  copy: ReturnType<typeof getWorkspaceCopy>
) {
  if (!value) {
    return copy.answerValues.not_classified_yet;
  }
  return copy.answerValues[value] ?? value.replaceAll("_", " ");
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

function _confidencePercent(confidence?: string | null) {
  if (confidence === "high") {
    return 92;
  }
  if (confidence === "medium") {
    return 66;
  }
  if (confidence === "low") {
    return 36;
  }
  return 18;
}

function valuePreview(
  value: string | number | boolean | null | undefined,
  locale: "zh-CN" | "en"
) {
  if (value === true) {
    return locale === "zh-CN" ? "是" : "Yes";
  }
  if (value === false) {
    return locale === "zh-CN" ? "否" : "No";
  }
  if (value === null || value === undefined || value === "") {
    return "—";
  }
  return String(value);
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
  customerDocumentSources?: WidgetAssistantMessage["customerDocumentSources"];
};

type ImmigrationConversationDetail = ImmigrationConversationSummary & {
  messages: ImmigrationStoredMessage[];
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

function setWorkspaceChatParam(chatId: string) {
  if (typeof window === "undefined") {
    return;
  }
  const url = new URL(window.location.href);
  url.searchParams.set("chatId", chatId);
  window.history.replaceState(null, "", url.toString());
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
}: {
  assistantMode?: AssistantMode;
}) {
  const { locale } = useSiteLocale();
  const copy = getWorkspaceCopy(locale);
  const quickQuestions = copy.quickQuestions;
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  const [conversations, setConversations] = useState<
    ImmigrationConversationSummary[]
  >([]);
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
  const listRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);

  const latestAssistant = useMemo(
    () => [...messages].reverse().find(isAssistantMessage) ?? null,
    [messages]
  );
  const latestSources = compactSourcesForMessage(latestAssistant);
  const latestKnownFacts =
    latestAssistant?.interactionPlan?.known_facts_summary ?? {};
  const latestRequestedFact =
    latestAssistant?.interactionPlan?.requested_facts?.[0] ?? null;
  const confidence = latestAssistant?.confidence ?? null;

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
    const response = await fetchWithErrorHandlers(
      "/api/immigration-conversations",
      {
        method: "GET",
      }
    );
    const data = (await response.json()) as {
      conversations?: ImmigrationConversationSummary[];
    };
    setConversations(data.conversations ?? []);
    return data.conversations ?? [];
  }, []);

  const loadConversation = useCallback(
    async (chatIdToLoad: string) => {
      setConversationLoading(true);
      try {
        const response = await fetchWithErrorHandlers(
          `/api/immigration-conversations/${chatIdToLoad}`,
          { method: "GET" }
        );
        const data = (await response.json()) as ImmigrationConversationDetail;
        setConversationId(data.chatId);
        setSelectedDocumentIds([]);
        setWorkspaceChatParam(data.chatId);
        setMatterId(data.legalMatterId ?? null);
        setMessages(
          sanitizePoliticalHistory(
            (data.messages ?? []).map(widgetMessageFromStoredMessage)
          ) as WidgetMessage[]
        );
        setDraftFacts({});
        setIntakeFacts({});
        setConversationReady(true);
        await refreshConversationList();
      } finally {
        setConversationLoading(false);
      }
    },
    [refreshConversationList]
  );

  const createConversation = useCallback(async () => {
    setConversationLoading(true);
    try {
      const response = await fetchWithErrorHandlers(
        "/api/immigration-conversations",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "New immigration conversation" }),
        }
      );
      const data = (await response.json()) as ImmigrationConversationSummary;
      setConversationId(data.chatId);
      setSelectedDocumentIds([]);
      setWorkspaceChatParam(data.chatId);
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
  }, [refreshConversationList]);

  useEffect(() => {
    let cancelled = false;

    async function initializeConversation() {
      try {
        const conversationsFromApi = await refreshConversationList();
        if (cancelled) {
          return;
        }
        const url = new URL(window.location.href);
        const requestedChatId = url.searchParams.get("chatId");
        const target =
          requestedChatId ||
          conversationsFromApi[0]?.chatId ||
          (await createConversation());
        if (!cancelled && target) {
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

    return () => {
      cancelled = true;
    };
  }, [createConversation, loadConversation, refreshConversationList]);

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
    selectedIds: string[] = selectedDocumentIds
  ) => {
    const stableConversationId =
      activeConversationId ?? conversationId ?? generateUUID();
    const response = await fetchWithErrorHandlers(
      widgetRouteForAssistantMode(assistantMode),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: stableConversationId,
          frontendChatId: stableConversationId,
          matterId,
          intakeFacts: facts,
          currentIntakeFacts: currentFacts,
          answerPreference,
          selectedChatModel: DEFAULT_CHAT_MODEL,
          assistantMode,
          selectedDocumentIds: selectedIds,
          messages: nextMessages.map((message) => ({
            id: message.id,
            role: message.role,
            parts: [{ type: "text", text: message.text }],
          })),
        }),
      }
    );

    return (await response.json()) as WidgetRouteResponse;
  };

  const handleDocumentSelectionAfterSubmission = (
    submittedDocumentIds: string[],
    customerDocumentEvidenceUsed: unknown,
    submissionKind: "message" | "guided_intake" | "political_block"
  ) => {
    const result = customerDocumentSelectionAfterSubmission({
      selectedCount: submittedDocumentIds.length,
      customerDocumentEvidenceUsed,
      submissionKind,
    });
    if (result.clearSelection) {
      setSelectedDocumentIds([]);
    } else if (result.warnUnused) {
      setSelectedDocumentIds(submittedDocumentIds);
      toast.warning(copy.documents.notUsed);
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

    const submittedDocumentIds = [...selectedDocumentIds];
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
      handleDocumentSelectionAfterSubmission(
        [...selectedDocumentIds],
        false,
        "political_block"
      );
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
    const requestStartedAt = Date.now();
    setStatus("submitted");
    setSubmittedAt(requestStartedAt);
    setProgressNow(requestStartedAt);
    setError(null);

    try {
      const data = await sendToWidgetRoute(
        nextMessages,
        intakeFacts,
        {},
        answerPreference,
        activeConversationId,
        submittedDocumentIds
      );
      await appendAssistantMessage(data, nextUserMessage.id);
      handleDocumentSelectionAfterSubmission(
        submittedDocumentIds,
        data.customerDocumentEvidenceUsed,
        "message"
      );
    } catch (requestError) {
      const message =
        requestError instanceof ChatbotError
          ? requestError.message
          : requestError instanceof Error
            ? requestError.message
            : "Unable to reach the assistant right now.";
      setError(message);
      toast.error(message);
    } finally {
      setStatus("ready");
      setSubmittedAt(null);
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

    const submittedDocumentIds = [...selectedDocumentIds];
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
      handleDocumentSelectionAfterSubmission(
        submittedDocumentIds,
        false,
        "political_block"
      );
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
        activeConversationId,
        submittedDocumentIds
      );
      await appendAssistantMessage(data, visibleUserMessage.id);
      handleDocumentSelectionAfterSubmission(
        submittedDocumentIds,
        data.customerDocumentEvidenceUsed,
        "guided_intake"
      );
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
  const handleBookConsultation = (responseLanguage?: string | null) => {
    toast.info(
      isZhLanguage(responseLanguage)
        ? "如需进一步个案支持，请使用此答复下方的律师审阅请求。"
        : "For case-specific support, use the lawyer review request shown with this answer."
    );
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
      className="mx-auto w-full max-w-[1600px] px-3 pb-4 pt-3 sm:px-6 lg:px-8"
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

      <div className="grid min-w-0 grid-cols-1 gap-3 xl:h-[calc(100dvh-176px)] xl:min-h-[620px] xl:max-h-[860px] xl:grid-cols-[250px_minmax(0,1fr)_290px] xl:gap-0 xl:overflow-hidden xl:rounded-2xl xl:bg-white xl:shadow-[0_24px_48px_-12px_rgba(0,23,54,0.12)]">
        <aside className="order-2 min-w-0 rounded-2xl bg-[#f3f4f5] p-4 xl:order-1 xl:min-h-0 xl:overflow-y-auto xl:rounded-none xl:p-4">
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

          <div className="space-y-2 xl:max-h-none xl:overflow-visible">
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
              </button>
            ))}
            {!conversationLoading && conversations.length === 0 ? (
              <p className="rounded-xl bg-white p-3 text-xs text-slate-500">
                {copy.history.empty}
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
                disabled={status !== "ready" || !conversationReady}
                key={question}
                onClick={() => submitMessage(question)}
                type="button"
              >
                {question}
              </button>
            ))}
          </div>
        </aside>

        <div className="order-1 flex h-[min(72dvh,780px)] min-h-[560px] min-w-0 flex-col overflow-hidden rounded-2xl bg-white shadow-sm xl:order-2 xl:h-auto xl:min-h-0 xl:rounded-none xl:shadow-none">
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

          <MatterDocumentsPanel
            chatId={conversationId}
            copy={copy}
            disabled={status !== "ready" || !conversationReady}
            onSelectionChange={setSelectedDocumentIds}
            selectedDocumentIds={selectedDocumentIds}
          />
          <div
            className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] px-4 py-4 sm:px-5"
            data-testid="workspace-message-list"
            onScroll={handleMessageListScroll}
            ref={listRef}
          >
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
                        className="rounded-full bg-slate-100 px-3 py-2 text-left text-xs leading-5 text-slate-700 transition hover:bg-cyan-50"
                        disabled={status !== "ready" || !conversationReady}
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
                        !message.isStreaming ? (
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

          <div className="border-t border-slate-100 bg-white p-3 sm:p-4">
            <div className="rounded-2xl bg-slate-100/80 p-3">
              <Textarea
                className="min-h-[76px] max-h-40 resize-none overflow-y-auto border-0 bg-transparent px-1 py-1 text-sm shadow-none focus-visible:ring-0"
                data-testid="workspace-input"
                disabled={status !== "ready"}
                onChange={(event) => setInput(event.target.value)}
                placeholder={copy.consultation.placeholder}
                value={input}
              />
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs leading-5 text-slate-500">
                  {copy.consultation.composerHelp}
                </p>
                <Button
                  className="rounded-xl bg-[#001736] px-5 text-white hover:bg-[#002b5b]"
                  data-testid="workspace-send"
                  disabled={
                    !input.trim() || status !== "ready" || !conversationReady
                  }
                  onClick={() => submitMessage(input)}
                  type="button"
                >
                  {status === "ready" ? (
                    <Send className="mr-2 size-4" />
                  ) : (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  )}
                  {copy.consultation.send}
                </Button>
              </div>
            </div>
          </div>
        </div>

        <aside className="order-3 min-w-0 space-y-3 rounded-2xl bg-[#f3f4f5] p-4 xl:min-h-0 xl:overflow-y-auto xl:rounded-none xl:p-4">
          <section className="rounded-xl bg-white p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                  {copy.matter.title}
                </p>
                <h3 className="mt-1 font-semibold text-slate-950">
                  {copy.matter.currentMatter}
                </h3>
              </div>
              <div className="rounded-xl bg-cyan-50 p-2 text-[#002b5b]">
                <Clock3 className="size-4" />
              </div>
            </div>
            <dl className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">{copy.matter.operation}</dt>
                <dd className="max-w-[150px] truncate text-right font-medium capitalize text-slate-800">
                  {formatKey(
                    latestAssistant?.caseHypothesis?.primary_operation_type,
                    copy
                  )}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">{copy.matter.nextAction}</dt>
                <dd className="font-medium capitalize text-slate-800">
                  {formatKey(latestAssistant?.nextAction, copy)}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-slate-500">{copy.matter.confidence}</dt>
                <dd className="text-right font-medium capitalize text-slate-800">
                  {confidence
                    ? formatKey(confidence, copy)
                    : copy.matter.pending}
                </dd>
              </div>
            </dl>
            <p className="mt-3 text-[11px] leading-5 text-slate-500">
              {copy.matter.confidenceNote}
            </p>
          </section>

          <section className="rounded-xl bg-white p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                  {copy.matter.knownFacts}
                </p>
                <h3 className="mt-1 font-semibold text-slate-950">
                  {copy.matter.intakeSummary}
                </h3>
              </div>
              <Badge
                className="rounded-full bg-slate-100 text-[10px] text-slate-600 hover:bg-slate-100"
                variant="secondary"
              >
                {copy.matter.factsCount(Object.keys(latestKnownFacts).length)}
              </Badge>
            </div>
            {Object.keys(latestKnownFacts).length ? (
              <div className="space-y-2">
                {Object.entries(latestKnownFacts)
                  .slice(0, 6)
                  .map(([key, value]) => (
                    <div
                      className="rounded-lg bg-slate-50 p-3 text-sm"
                      key={key}
                    >
                      <p className="text-xs text-slate-500">
                        {copy.factLabels[key] ?? key.replaceAll("_", " ")}
                      </p>
                      <p className="mt-1 font-medium text-slate-800">
                        {valuePreview(value, locale)}
                      </p>
                    </div>
                  ))}
              </div>
            ) : (
              <p className="text-sm leading-6 text-slate-500">
                {copy.matter.noFacts}
              </p>
            )}
          </section>

          <section className="rounded-xl bg-white p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              {copy.matter.sources}
            </p>
            <h3 className="mt-1 font-semibold text-slate-950">
              {copy.matter.latestSources}
            </h3>
            {latestSources.length ? (
              <CollapsibleSourceList
                className="mt-3 rounded-lg bg-slate-50 p-2"
                items={latestSources}
                label={copy.matter.latestSources}
              />
            ) : (
              <p className="mt-2 text-sm leading-6 text-slate-500">
                {copy.matter.noSources}
              </p>
            )}
          </section>

          <section className="rounded-xl bg-[#001736] p-4 text-white">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-200">
              {copy.matter.lawyerHandoff}
            </p>
            <h3 className="mt-2 text-base font-semibold">
              {copy.matter.lawyerTitle}
            </h3>
            <p className="mt-2 text-xs leading-5 text-slate-200">
              {copy.matter.lawyerDescription}
            </p>
          </section>

          {latestRequestedFact ? (
            <div className="rounded-xl bg-cyan-50 p-4 text-sm leading-6 text-cyan-900">
              <p className="font-medium">{copy.consultation.requestedFact}</p>
              <p className="mt-1">
                {latestRequestedFact.prompt ?? latestRequestedFact.label}
              </p>
            </div>
          ) : null}
        </aside>
      </div>
      <p className="mt-3 px-1 text-xs leading-5 text-slate-500">
        {copy.legalDisclaimer}
      </p>
    </section>
  );
}
