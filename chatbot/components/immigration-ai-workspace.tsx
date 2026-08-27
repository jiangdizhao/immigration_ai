"use client";

import {
  ArrowRight,
  Bot,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  ExternalLink,
  FileText,
  Loader2,
  MessageSquareText,
  Send,
  ShieldCheck,
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
import {
  blockedResponseForLocale,
  evaluateWidgetSubmission,
  type PoliticalGateResult,
  sanitizePoliticalHistory,
} from "@/lib/political-gate";
import { cn, fetchWithErrorHandlers, generateUUID } from "@/lib/utils";
import { AssistantRichMarkdown } from "./assistant-rich-markdown";
import { GuidedIntakeCard } from "./guided-intake-card";
import type {
  AnswerPreference,
  IntakeFacts,
  WidgetAssistantMessage,
  WidgetMessage,
  WidgetRouteResponse,
} from "./guided-intake-types";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { Progress } from "./ui/progress";
import { Textarea } from "./ui/textarea";

const TYPEWRITER_TICK_MS = 38;
const TYPEWRITER_WORDS_PER_TICK = 3;
const SHOW_WORKSPACE_DEBUG = process.env.NEXT_PUBLIC_WIDGET_DEBUG === "true";

const quickQuestions = [
  "I am 36 and finished a master by coursework. Can I still apply for a 485 visa?",
  "My student visa was refused. What should I do next?",
  "Can I still apply for review?",
  "Can I leave Australia and come back if I only hold a bridging visa?",
  "What does visa condition 8501 mean?",
  "I want to book a lawyer consultation.",
];

const processSteps = [
  {
    icon: MessageSquareText,
    title: "Ask your question",
    text: "Start with a plain-English migration question or choose a suggested scenario.",
  },
  {
    icon: FileText,
    title: "Clarify key facts",
    text: "The assistant asks one decisive follow-up at a time instead of exposing backend state.",
  },
  {
    icon: ShieldCheck,
    title: "Escalate safely",
    text: "Urgent or case-specific issues are routed toward a real lawyer consultation.",
  },
];

const FACT_DISPLAY_LABELS: Record<string, string> = {
  completion_date: "course completion date",
  qualification_level: "qualification level",
  course_cricos_registered: "CRICOS course status",
  australian_study_requirement_met: "Australian Study Requirement status",
  first_485_or_subsequent: "first/subsequent 485 status",
  current_visa: "current visa/status",
  current_location: "current location",
  application_timing: "application timing",
  refusal_notice_available: "refusal notice availability",
  notification_date: "notification date",
  onshore_offshore: "location at decision",
  refusal_reason_if_known: "refusal reason",
  age: "age",
  qualification: "qualification",
  visa_subclass: "visa subclass",
};

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

function buildGuidedIntakeDisplaySummary(draftFacts: IntakeFacts) {
  const populatedEntries = Object.entries(draftFacts).filter(
    ([, value]) => value !== null && value !== undefined && value !== ""
  );

  if (!populatedEntries.length) {
    return "I updated the intake details.";
  }

  const labels = populatedEntries.map(
    ([key]) => FACT_DISPLAY_LABELS[key] ?? key.replaceAll("_", " ")
  );
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
    return message.compactSources.slice(0, 4);
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

  return Array.from(new Set(fallback)).slice(0, 4);
}

function formatKey(value?: string | null) {
  if (!value) {
    return "Not classified yet";
  }
  return value.replaceAll("_", " ");
}

function statusText(status: "ready" | "submitted" | "typing") {
  if (status === "submitted") {
    return "Checking sources";
  }
  if (status === "typing") {
    return "Drafting answer";
  }
  return "Ready";
}

function confidencePercent(confidence?: string | null) {
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

function valuePreview(value: string | number | boolean | null | undefined) {
  if (value === true) {
    return "Yes";
  }
  if (value === false) {
    return "No";
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

function looksChineseText(text: string) {
  return /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/.test(text);
}

function workspaceProgressStage(elapsedMs: number, isZh: boolean) {
  const stages = isZh
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
  followUpQuestions?: string[];
  matterId?: string | null;
  retrievalDebug?: WidgetAssistantMessage["retrievalDebug"];
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
    isStreaming: false,
    responseLanguage: looksChineseText(message.text) ? "zh" : "en",
    citations: message.citations ?? [],
    compactSources: message.compactSources ?? [],
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
}: {
  elapsedMs: number;
  isZh: boolean;
}) {
  const stage = workspaceProgressStage(elapsedMs, isZh);
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
  const [conversationId, setConversationId] = useState<string | null>(null);
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

    const assistantMessageId = generateUUID();
    const assistantMessage: WidgetAssistantMessage = {
      id: assistantMessageId,
      role: "assistant",
      text: "",
      isStreaming: true,
      responseLanguage: data.responseLanguage ?? null,
      citations: data.citations ?? [],
      compactSources: data.compactSources ?? [],
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
    activeConversationId: string | null = conversationId
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

  const submitMessage = async (
    messageText: string,
    answerPreference: AnswerPreference = "answer_first"
  ) => {
    const trimmed = messageText.trim();
    if (!trimmed || status !== "ready") {
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
        activeConversationId
      );
      await appendAssistantMessage(data, nextUserMessage.id);
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

    const mergedFacts = { ...intakeFacts, ...draftFacts };
    const syntheticText = buildGuidedIntakeSummary(draftFacts);
    const visibleText = buildGuidedIntakeDisplaySummary(draftFacts);

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
  const handleBookConsultation = () => {
    toast.info(
      "Booking flow placeholder. Connect this to your lawyer's calendar or booking page next."
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
      className="relative mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8"
      id="ai-workspace"
    >
      <div className="pointer-events-none absolute inset-0 -z-10 rounded-[48px] bg-[radial-gradient(circle_at_18%_20%,rgba(125,211,252,0.28),transparent_32%),radial-gradient(circle_at_84%_12%,rgba(168,85,247,0.25),transparent_30%),linear-gradient(135deg,#001736_0%,#002b5b_48%,#0f172a_100%)]" />

      <div className="mb-7 flex flex-col justify-between gap-5 px-2 text-white md:flex-row md:items-end">
        <div className="max-w-3xl">
          <Badge
            className="mb-4 rounded-full border-white/15 bg-white/10 px-4 py-1.5 text-white hover:bg-white/10"
            variant="outline"
          >
            <Sparkles className="mr-2 size-3.5 text-cyan-200" />
            AI-powered first contact · Lawyer handoff ready
          </Badge>
          <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">
            Ask the AI Legal Desk in a full workspace, not a tiny chat bubble.
          </h2>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-200 sm:text-base">
            This central workspace follows the Stitch template direction:
            premium legal-tech branding, rich context panels, guided intake,
            compact sources, and a clear consultation path.
          </p>
        </div>

        <div className="grid min-w-[220px] gap-2 rounded-3xl border border-white/10 bg-white/10 p-4 text-sm text-white shadow-2xl backdrop-blur-xl">
          <div className="flex items-center justify-between gap-3">
            <span className="text-slate-300">Assistant status</span>
            <span className="inline-flex items-center gap-2 font-medium">
              <span className="size-2 rounded-full bg-emerald-300" />
              {statusText(status)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-slate-300">Conversation</span>
            <span className="font-mono text-xs text-cyan-100">
              {conversationId ? conversationId.slice(0, 8) : "loading"}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-slate-300">Matter</span>
            <span className="font-mono text-xs text-cyan-100">
              {matterId ? matterId.slice(0, 8) : "none yet"}
            </span>
          </div>
        </div>
      </div>

      <div className="grid min-w-0 h-[calc(100vh-170px)] min-h-[680px] max-h-[860px] overflow-hidden rounded-[36px] border border-white/15 bg-white/95 shadow-[0_32px_120px_-32px_rgba(0,0,0,0.65)] backdrop-blur-xl lg:grid-cols-[280px_minmax(0,1fr)_320px]">
        <aside className="hidden min-h-0 overflow-y-auto border-r border-slate-200 bg-slate-50/90 p-5 lg:block">
          <div className="mb-6 flex items-center gap-3">
            <div className="rounded-2xl bg-[#001736] p-2 text-white">
              <Bot className="size-5" />
            </div>
            <div>
              <p className="font-semibold text-slate-950">Sovereign Nexus AI</p>
              <p className="text-xs text-slate-500">
                Migration intake workspace
              </p>
            </div>
          </div>

          <div className="mb-6 space-y-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="space-y-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Conversations
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Start a clean matter or reopen an earlier test conversation.
                </p>
              </div>
              <button
                className="flex w-full items-center justify-center rounded-2xl bg-[#001736] px-3 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#002b5b] disabled:opacity-50"
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
                + New conversation
              </button>
            </div>

            <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
              {conversationLoading ? (
                <p className="rounded-2xl bg-slate-50 p-3 text-xs text-slate-500">
                  Loading conversations...
                </p>
              ) : null}
              {conversations.map((conversation) => (
                <button
                  className={cn(
                    "w-full rounded-2xl border p-3 text-left text-xs leading-5 shadow-sm transition",
                    conversation.chatId === conversationId
                      ? "border-[#001736] bg-[#001736] text-white"
                      : "border-slate-200 bg-slate-50 text-slate-700 hover:border-[#002b5b]/40 hover:bg-white"
                  )}
                  disabled={status !== "ready" || conversationLoading}
                  key={conversation.chatId}
                  onClick={() => loadConversation(conversation.chatId)}
                  type="button"
                >
                  <span className="block truncate font-semibold">
                    {conversation.title || "Immigration conversation"}
                  </span>
                  <span className="mt-1 block font-mono text-[11px] opacity-75">
                    chat {conversation.chatId.slice(0, 8)} · matter{" "}
                    {conversation.legalMatterId
                      ? conversation.legalMatterId.slice(0, 8)
                      : "none yet"}
                  </span>
                </button>
              ))}
              {!conversationLoading && conversations.length === 0 ? (
                <p className="rounded-2xl bg-slate-50 p-3 text-xs text-slate-500">
                  No conversations yet.
                </p>
              ) : null}
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Try a scenario
            </p>
            {quickQuestions.map((question) => (
              <button
                className="group w-full rounded-2xl border border-slate-200 bg-white p-3 text-left text-sm leading-6 text-slate-700 shadow-sm transition hover:border-[#002b5b]/30 hover:bg-[#001736] hover:text-white"
                disabled={status !== "ready" || !conversationReady}
                key={question}
                onClick={() => submitMessage(question)}
                type="button"
              >
                <span>{question}</span>
                <ChevronRight className="mt-2 size-4 text-slate-400 transition group-hover:translate-x-1 group-hover:text-cyan-200" />
              </button>
            ))}
          </div>

          <div className="mt-8 space-y-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Process
            </p>
            {processSteps.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  className="flex gap-3 rounded-2xl bg-white p-3 shadow-sm"
                  key={item.title}
                >
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-[#002b5b]">
                    <Icon className="size-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-950">
                      {item.title}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      {item.text}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-col bg-white">
          <div className="border-b border-slate-200 px-5 py-4 sm:px-6">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div>
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <span className="inline-flex size-2 rounded-full bg-emerald-400" />
                  Live AI legal assistant
                </div>
                <h3 className="mt-1 text-xl font-semibold text-slate-950">
                  Immigration consultation workspace
                </h3>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge
                  className="rounded-full bg-slate-100 text-slate-700 hover:bg-slate-100"
                  variant="secondary"
                >
                  General information only
                </Badge>
                <Badge
                  className="rounded-full bg-cyan-50 text-cyan-800 hover:bg-cyan-50"
                  variant="secondary"
                >
                  AU migration focus
                </Badge>
              </div>
            </div>
          </div>

          <div
            className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] px-4 py-5 sm:px-6"
            data-testid="workspace-message-list"
            onScroll={handleMessageListScroll}
            ref={listRef}
          >
            {messages.length === 0 ? (
              <div className="flex h-full min-h-[440px] items-center justify-center">
                <div className="mx-auto max-w-2xl text-center">
                  <div className="mx-auto mb-5 flex size-16 items-center justify-center rounded-3xl bg-[#001736] text-white shadow-xl">
                    <Sparkles className="size-7" />
                  </div>
                  <h4 className="text-2xl font-semibold tracking-tight text-slate-950">
                    Start with a visa question, refusal issue, condition, or
                    consultation request.
                  </h4>
                  <p className="mt-3 text-sm leading-7 text-slate-600">
                    The assistant will answer in a customer-friendly way, ask
                    one decisive follow-up when needed, and keep technical state
                    in the background.
                  </p>
                  <div className="mt-6 flex flex-wrap justify-center gap-2">
                    {quickQuestions.slice(0, 3).map((question) => (
                      <button
                        className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 shadow-sm transition hover:border-[#002b5b]/40 hover:bg-slate-50"
                        disabled={status !== "ready" || !conversationReady}
                        key={question}
                        onClick={() => submitMessage(question)}
                        type="button"
                      >
                        {question.length > 58
                          ? `${question.slice(0, 58)}...`
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
                        <div className="mt-1 flex size-9 shrink-0 items-center justify-center rounded-2xl bg-[#001736] text-white shadow-sm">
                          <Bot className="size-4" />
                        </div>
                      ) : null}

                      <div
                        className={cn(
                          "min-w-0 space-y-3",
                          isAssistant
                            ? "min-w-0 w-full max-w-full"
                            : "max-w-[86%] flex flex-col items-end"
                        )}
                      >
                        <div
                          className={cn(
                            "min-w-0 max-w-full overflow-hidden rounded-[24px] px-4 py-3 text-sm leading-7 shadow-sm",
                            isAssistant
                              ? "border border-slate-200 bg-white text-slate-700"
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
                              Drafting...
                            </div>
                          ) : null}
                        </div>

                        {isAssistant &&
                        !message.isStreaming &&
                        compactSourcesForMessage(message).length ? (
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                              Sources considered
                            </p>
                            <div className="space-y-1.5">
                              {compactSourcesForMessage(message).map(
                                (source) => (
                                  <div
                                    className="flex items-start gap-2 text-xs leading-5 text-slate-600"
                                    key={source}
                                  >
                                    <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
                                    <span>{source}</span>
                                  </div>
                                )
                              )}
                            </div>
                          </div>
                        ) : null}

                        {isAssistant &&
                        !message.isStreaming &&
                        message.escalate ? (
                          <Card className="rounded-2xl border-amber-200 bg-amber-50 shadow-sm">
                            <CardContent className="flex items-start gap-3 p-4 text-sm leading-6 text-amber-900">
                              <CalendarDays className="mt-0.5 size-5 shrink-0" />
                              <div>
                                <p className="font-medium">
                                  A lawyer consultation is recommended.
                                </p>
                                <p className="mt-1 text-amber-800">
                                  This matter may depend on deadlines,
                                  documents, or case-specific facts.
                                </p>
                              </div>
                            </CardContent>
                          </Card>
                        ) : null}

                        {isAssistant &&
                        isLatestAssistant &&
                        !message.isStreaming ? (
                          <GuidedIntakeCard
                            draftFacts={draftFacts}
                            factSlotStates={message.factSlotStates}
                            interactionPlan={message.interactionPlan}
                            isSubmitting={status !== "ready"}
                            onBookConsultation={handleBookConsultation}
                            onDraftChange={handleDraftChange}
                            onSubmitDraftFacts={handleSubmitDraftFacts}
                            responseLanguage={message.responseLanguage}
                          />
                        ) : null}

                        {SHOW_WORKSPACE_DEBUG &&
                        isAssistant &&
                        message.retrievalDebug ? (
                          <details className="rounded-2xl border border-slate-200 bg-white p-3 text-xs text-slate-500">
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
                        <div className="mt-1 flex size-9 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-600">
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
            <div className="px-0 pb-4">
              <WorkspaceProcessingCard
                elapsedMs={pendingElapsedMs}
                isZh={pendingIsZh}
              />
            </div>
          ) : null}

          {error ? (
            <div className="border-t border-red-100 bg-red-50 px-5 py-3 text-sm text-red-700 sm:px-6">
              {error}
            </div>
          ) : null}

          <div className="border-t border-slate-200 bg-white p-4 sm:p-5">
            <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-3 shadow-sm">
              <Textarea
                className="min-h-[96px] max-h-48 resize-none overflow-y-auto border-0 bg-transparent px-1 py-1 text-sm shadow-none focus-visible:ring-0"
                data-testid="workspace-input"
                disabled={status !== "ready"}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Type your question. Press Enter for a new paragraph; click Send to submit."
                value={input}
              />
              <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs leading-5 text-slate-500">
                  Press Enter for a new paragraph. Click Send to submit. General
                  information only, not legal advice.
                </p>
                <Button
                  className="rounded-full bg-[#001736] px-5 text-white hover:bg-[#002b5b]"
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
                  Send
                </Button>
              </div>
            </div>
          </div>
        </div>

        <aside className="hidden min-h-0 overflow-y-auto border-l border-slate-200 bg-slate-50/90 p-5 xl:block">
          <div className="space-y-5">
            <Card className="rounded-[28px] border-slate-200 bg-white shadow-sm">
              <CardContent className="p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Case snapshot
                    </p>
                    <h4 className="mt-1 font-semibold text-slate-950">
                      Current matter
                    </h4>
                  </div>
                  <div className="rounded-2xl bg-cyan-50 p-2 text-[#002b5b]">
                    <Clock3 className="size-4" />
                  </div>
                </div>

                <div className="space-y-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-500">Operation</span>
                    <span className="max-w-[150px] truncate font-medium capitalize text-slate-800">
                      {formatKey(
                        latestAssistant?.caseHypothesis?.primary_operation_type
                      )}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-500">Next action</span>
                    <span className="font-medium capitalize text-slate-800">
                      {formatKey(latestAssistant?.nextAction)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-500">Confidence</span>
                    <span className="font-medium capitalize text-slate-800">
                      {confidence ?? "pending"}
                    </span>
                  </div>
                </div>

                <Progress
                  className="mt-4"
                  value={confidencePercent(confidence)}
                />
              </CardContent>
            </Card>

            <Card className="rounded-[28px] border-slate-200 bg-white shadow-sm">
              <CardContent className="p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Known facts
                    </p>
                    <h4 className="mt-1 font-semibold text-slate-950">
                      Intake summary
                    </h4>
                  </div>
                  <Badge
                    className="rounded-full bg-slate-100 text-slate-600 hover:bg-slate-100"
                    variant="secondary"
                  >
                    {Object.keys(latestKnownFacts).length} facts
                  </Badge>
                </div>

                {Object.keys(latestKnownFacts).length ? (
                  <div className="space-y-2">
                    {Object.entries(latestKnownFacts)
                      .slice(0, 6)
                      .map(([key, value]) => (
                        <div
                          className="rounded-2xl bg-slate-50 p-3 text-sm"
                          key={key}
                        >
                          <p className="text-xs text-slate-500">
                            {FACT_DISPLAY_LABELS[key] ??
                              key.replaceAll("_", " ")}
                          </p>
                          <p className="mt-1 font-medium text-slate-800">
                            {valuePreview(value)}
                          </p>
                        </div>
                      ))}
                  </div>
                ) : (
                  <p className="text-sm leading-6 text-slate-500">
                    Facts gathered through guided intake will appear here after
                    the first assistant response.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-[28px] border-slate-200 bg-white shadow-sm">
              <CardContent className="p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Sources
                </p>
                <h4 className="mt-1 font-semibold text-slate-950">
                  Latest authorities
                </h4>
                {latestSources.length ? (
                  <div className="mt-4 space-y-2">
                    {latestSources.map((source) => (
                      <div
                        className="flex items-start gap-2 rounded-2xl bg-slate-50 p-3 text-xs leading-5 text-slate-600"
                        key={source}
                      >
                        <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
                        <span>{source}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm leading-6 text-slate-500">
                    Relevant source titles will appear after retrieval-backed
                    answers.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className="overflow-hidden rounded-[28px] border-0 bg-gradient-to-br from-[#001736] via-[#002b5b] to-[#1d0052] text-white shadow-xl">
              <CardContent className="p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">
                  Human lawyer handoff
                </p>
                <h4 className="mt-2 text-xl font-semibold">
                  Need case-specific advice?
                </h4>
                <p className="mt-3 text-sm leading-6 text-slate-200">
                  Convert qualified users into a real consultation once
                  deadlines, documents, or risk factors appear.
                </p>
                <Button
                  className="mt-5 rounded-full bg-white text-[#001736] hover:bg-slate-100"
                  onClick={handleBookConsultation}
                >
                  Book consultation
                  <ArrowRight className="ml-2 size-4" />
                </Button>
              </CardContent>
            </Card>

            {latestRequestedFact ? (
              <div className="rounded-[28px] border border-cyan-200 bg-cyan-50 p-4 text-sm leading-6 text-cyan-900">
                <p className="font-medium">Current follow-up</p>
                <p className="mt-1">
                  {latestRequestedFact.prompt ?? latestRequestedFact.label}
                </p>
              </div>
            ) : null}
          </div>
        </aside>
      </div>

      <div className="mt-5 flex flex-col gap-3 px-2 text-xs leading-5 text-slate-200 md:flex-row md:items-center md:justify-between">
        <span>
          Designed for customer mode: answer, one quick question, compact
          sources, lawyer handoff.
        </span>
        <a
          className="inline-flex items-center gap-1 text-cyan-200 hover:text-white"
          href="#contact"
        >
          Connect booking workflow later
          <ExternalLink className="size-3.5" />
        </a>
      </div>
    </section>
  );
}
