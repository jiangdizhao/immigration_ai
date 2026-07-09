import { ipAddress } from "@vercel/functions";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import {
  getImmigrationConversationByChatId,
  getOrCreateLocalImmigrationUserId,
  saveMessages,
  touchImmigrationConversation,
  updateImmigrationConversation,
} from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";
import { checkIpRateLimit } from "@/lib/ratelimit";

export const maxDuration = 180;

const SHOW_WIDGET_DEBUG = process.env.NEXT_PUBLIC_WIDGET_DEBUG === "true";

const textPartSchema = z.object({
  type: z.literal("text"),
  text: z.string().min(1).max(4000),
});

const filePartSchema = z.object({
  type: z.literal("file"),
  mediaType: z.enum(["image/jpeg", "image/png"]),
  name: z.string().min(1).max(100),
  url: z.string().url(),
});

const messageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant", "system"]),
  parts: z.array(z.union([textPartSchema, filePartSchema, z.any()])),
});

const widgetDirectRequestBodySchema = z.object({
  id: z.string().uuid(),
  frontendChatId: z.string().uuid().optional(),
  matterId: z.string().uuid().nullable().optional(),
  messages: z.array(messageSchema).min(1),
  selectedChatModel: z.string().optional(),
  assistantMode: z.literal("premium_direct_gpt55_high").optional(),
  intakeFacts: z.record(z.string(), z.any()).optional().default({}),
  responseLanguage: z.enum(["en", "zh"]).optional(),
  answerPreference: z
    .enum(["auto", "answer_first", "continue_intake", "final_recommendation"])
    .optional()
    .default("answer_first"),
});

type ResponseLanguage = "en" | "zh";

type LegalServiceResponse = {
  answer?: string;
  response_language?: string | null;
  citations?: Array<Record<string, any>>;
  compact_sources?: string[];
  user_display_mode?: string | null;
  follow_up_questions?: string[];
  missing_facts?: string[];
  confidence?: string | null;
  escalate?: boolean;
  next_action?: string | null;
  matter_id?: string | null;
  conversation_state?: string | null;
  case_hypothesis?: Record<string, any> | null;
  fact_slot_states?: Array<Record<string, any>> | null;
  interaction_plan?: Record<string, any> | null;
  retrieval_debug?: Record<string, any>;
};

function serializeFrontendMessages(messages: z.infer<typeof messageSchema>[]) {
  return messages.map((message, index) => ({
    id: message.id,
    role: message.role,
    index,
    text: message.parts
      .filter((part): part is { type: "text"; text: string } => {
        return (
          typeof part === "object" && part !== null && part.type === "text"
        );
      })
      .map((part) => part.text)
      .join("\n")
      .trim(),
  }));
}

function extractLatestUserText(
  messages: z.infer<typeof messageSchema>[]
): string | null {
  const lastUserMessage = [...messages]
    .reverse()
    .find((m) => m.role === "user");
  if (!lastUserMessage) {
    return null;
  }

  const text = lastUserMessage.parts
    .filter((part): part is { type: "text"; text: string } => {
      return typeof part === "object" && part !== null && part.type === "text";
    })
    .map((part) => part.text)
    .join("\n")
    .trim();

  return text.length > 0 ? text : null;
}

function detectResponseLanguage(text: string): ResponseLanguage {
  return /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/.test(text) ? "zh" : "en";
}

function normalizeResponseLanguage(
  value: string | null | undefined,
  fallback: ResponseLanguage
): ResponseLanguage {
  return value?.toLowerCase().startsWith("zh") ? "zh" : fallback;
}

function normalizeNextAction(nextAction: string | null | undefined) {
  if (nextAction === "answer") {
    return "provide_answer";
  }
  if (
    nextAction === "ask_followup" ||
    nextAction === "suggest_consultation" ||
    nextAction === "provide_answer" ||
    nextAction === "wait_for_user" ||
    nextAction === "none"
  ) {
    return nextAction;
  }
  return "provide_answer";
}

function normalizeRetrievalDebug(
  retrievalDebug: LegalServiceResponse["retrieval_debug"]
) {
  const dbg = retrievalDebug ?? {};
  return {
    effective_question:
      (typeof dbg.effective_question === "string" && dbg.effective_question) ||
      null,
    premiumDirectAnswer: dbg.premium_direct_answer ?? null,
    semanticTurnAnalysis: dbg.semantic_turn_analysis ?? null,
    local_sufficient: null,
    need_live_fetch: false,
    live_fetch_used: false,
    live_result_count: 0,
    top_titles: [],
  };
}

function emptyWidgetResponse(
  text: string,
  matterId?: string | null,
  responseLanguage: ResponseLanguage = detectResponseLanguage(text)
) {
  return Response.json({
    text,
    responseLanguage,
    citations: [],
    compactSources: [],
    userDisplayMode: "general_with_warning",
    followUpQuestions: [],
    missingFacts: [],
    evidenceGaps: [],
    escalate: false,
    nextAction: "ask_followup",
    matterId: matterId ?? null,
    conversationState: null,
    caseHypothesis: null,
    factSlotStates: [],
    interactionPlan: null,
    retrievalDebug: null,
  });
}

function legalServiceFallbackText(responseLanguage: ResponseLanguage): string {
  return responseLanguage === "zh"
    ? "抱歉，GPT-5.5 High 快速答复暂时不可用。请切换到默认法律核对模式，或联系律师人工确认。"
    : "Sorry, the GPT-5.5 High quick answer is temporarily unavailable. Please switch to the default legal-check mode, or contact the lawyer for manual confirmation.";
}

function previewResponseBody(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 500);
}

async function fetchLegalServiceDirect(params: {
  url: string;
  apiKey?: string;
  payload: Record<string, unknown>;
  responseLanguage: ResponseLanguage;
  matterId: string | null;
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);

  let response: Response;
  try {
    response = await fetch(params.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(params.apiKey ? { "X-API-Key": params.apiKey } : {}),
      },
      body: JSON.stringify(params.payload),
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeout);
    console.error("premium direct legal-service fetch failed:", error);
    return {
      ok: false as const,
      response: emptyWidgetResponse(
        legalServiceFallbackText(params.responseLanguage),
        params.matterId,
        params.responseLanguage
      ),
    };
  } finally {
    clearTimeout(timeout);
  }

  const contentType = response.headers.get("content-type") ?? "";
  const bodyText = await response.text();

  if (!response.ok || !contentType.toLowerCase().includes("application/json")) {
    console.error(
      "premium direct legal-service invalid response:",
      response.status,
      response.statusText,
      contentType,
      previewResponseBody(bodyText)
    );
    return {
      ok: false as const,
      response: emptyWidgetResponse(
        legalServiceFallbackText(params.responseLanguage),
        params.matterId,
        params.responseLanguage
      ),
    };
  }

  try {
    return { ok: true as const, data: JSON.parse(bodyText) as LegalServiceResponse };
  } catch (error) {
    console.error(
      "premium direct legal-service JSON parse failed:",
      error,
      previewResponseBody(bodyText)
    );
    return {
      ok: false as const,
      response: emptyWidgetResponse(
        legalServiceFallbackText(params.responseLanguage),
        params.matterId,
        params.responseLanguage
      ),
    };
  }
}

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const {
      id,
      frontendChatId,
      matterId,
      messages,
      intakeFacts,
      responseLanguage: requestedResponseLanguage,
      answerPreference,
    } = widgetDirectRequestBodySchema.parse(json);

    await checkIpRateLimit(ipAddress(request));

    const session = await auth();
    const frontendUserId =
      session?.user?.id ?? (await getOrCreateLocalImmigrationUserId());
    const activeFrontendChatId = frontendChatId ?? id;
    const ownedConversation = frontendChatId
      ? await getImmigrationConversationByChatId({
          chatId: frontendChatId,
          userId: frontendUserId,
        })
      : null;

    if (frontendChatId && !ownedConversation) {
      return Response.json({ error: "Conversation not found" }, { status: 404 });
    }

    const question = extractLatestUserText(messages);
    if (!question) {
      return emptyWidgetResponse(
        "Please enter a question so I can help.",
        matterId ?? null,
        "en"
      );
    }

    const responseLanguage: ResponseLanguage =
      requestedResponseLanguage ?? detectResponseLanguage(question);

    const legalServiceUrl =
      process.env.LEGAL_SERVICE_URL ?? "http://127.0.0.1:8000";
    const apiKey = process.env.LEGAL_SERVICE_API_KEY;
    const jurisdiction = process.env.LEGAL_SERVICE_JURISDICTION ?? "Cth";

    const legalServiceResult = await fetchLegalServiceDirect({
      url: `${legalServiceUrl}/api/v1/query`,
      apiKey,
      responseLanguage,
      matterId: matterId ?? null,
      payload: {
        question,
        response_language: responseLanguage,
        matter_id: matterId ?? ownedConversation?.legalMatterId ?? null,
        session_id: id,
        frontend_chat_id: activeFrontendChatId,
        frontend_user_id: frontendUserId,
        preferred_jurisdiction: jurisdiction,
        preferred_source_types: [],
        intake_facts: intakeFacts ?? {},
        top_k: 1,
        answer_preference: answerPreference,
        assistant_mode: "premium_direct_gpt55_high",
        frontend_messages: serializeFrontendMessages(messages),
      },
    });

    if (!legalServiceResult.ok) {
      return legalServiceResult.response;
    }

    const data = legalServiceResult.data;
    const finalResponseLanguage = normalizeResponseLanguage(
      data.response_language,
      responseLanguage
    );
    const finalText = data.answer?.trim() || legalServiceFallbackText(finalResponseLanguage);
    const compactSources = data.compact_sources ?? [];
    const normalizedCitations: Array<Record<string, any>> = [];
    const persistedAssistantMetadata = {
      type: "metadata",
      compactSources,
      citations: normalizedCitations,
      confidence: data.confidence ?? null,
      followUpQuestions: data.follow_up_questions ?? [],
      matterId: data.matter_id ?? matterId ?? null,
      retrievalDebug: SHOW_WIDGET_DEBUG
        ? normalizeRetrievalDebug(data.retrieval_debug)
        : null,
    };

    if (frontendChatId) {
      try {
        const latestUserMessage = [...messages]
          .reverse()
          .find((message) => message.role === "user");
        const userMessageId = latestUserMessage?.id ?? crypto.randomUUID();
        const userCreatedAt = new Date();
        const assistantCreatedAt = new Date(userCreatedAt.getTime() + 1);
        await saveMessages({
          messages: [
            {
              chatId: frontendChatId,
              id: userMessageId,
              role: "user",
              parts: [{ type: "text", text: question }],
              attachments: [],
              createdAt: userCreatedAt,
            },
            {
              chatId: frontendChatId,
              id: crypto.randomUUID(),
              role: "assistant",
              parts: [
                { type: "text", text: finalText },
                persistedAssistantMetadata,
              ],
              attachments: [],
              createdAt: assistantCreatedAt,
            },
          ],
        });
      } catch (error) {
        console.warn("Failed to persist premium direct workspace messages", error);
      }

      if (data.matter_id) {
        await updateImmigrationConversation({
          chatId: frontendChatId,
          userId: frontendUserId,
          legalMatterId: data.matter_id,
          title: question.slice(0, 80) || "Immigration conversation",
        });
      } else {
        await touchImmigrationConversation({
          chatId: frontendChatId,
          userId: frontendUserId,
        });
      }
    }

    if (SHOW_WIDGET_DEBUG) {
      console.log("premiumDirectAnswer:", data.retrieval_debug?.premium_direct_answer ?? null);
      console.log("premiumDirectAnswerPreview:", finalText.slice(0, 300));
    }

    return Response.json({
      text: finalText,
      responseLanguage: finalResponseLanguage,
      citations: normalizedCitations,
      compactSources,
      userDisplayMode: data.user_display_mode ?? "general_with_warning",
      followUpQuestions: data.follow_up_questions ?? [],
      missingFacts: SHOW_WIDGET_DEBUG ? (data.missing_facts ?? []) : [],
      evidenceGaps: [],
      escalate: Boolean(data.escalate),
      nextAction: normalizeNextAction(data.next_action),
      confidence: data.confidence ?? "medium",
      matterId: data.matter_id ?? matterId ?? null,
      conversationState: data.conversation_state ?? null,
      caseHypothesis: null,
      factSlotStates: [],
      interactionPlan: null,
      retrievalDebug: SHOW_WIDGET_DEBUG
        ? normalizeRetrievalDebug(data.retrieval_debug)
        : null,
    });
  } catch (error) {
    console.error("widget-chat-direct error:", error);
    if (error instanceof ChatbotError) {
      return error.toResponse();
    }

    return Response.json(
      {
        text: "Sorry, I could not generate a GPT-5.5 High quick answer right now.",
        responseLanguage: "en",
        citations: [],
        compactSources: [],
        userDisplayMode: "general_with_warning",
        followUpQuestions: [],
        missingFacts: [],
        evidenceGaps: [],
        escalate: false,
        nextAction: "ask_followup",
        matterId: null,
        conversationState: null,
        caseHypothesis: null,
        factSlotStates: [],
        interactionPlan: null,
        retrievalDebug: null,
      },
      { status: 200 }
    );
  }
}
