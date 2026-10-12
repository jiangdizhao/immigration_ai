import { ipAddress } from "@vercel/functions";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { normalizeAssistantMode } from "@/lib/assistant-mode";
import {
  beginWidgetTurn,
  completeWidgetTurn,
  completeWidgetTurnFromParts,
  failWidgetTurn,
  resolveClientTurnId,
  startWidgetTurnHeartbeat,
  type WidgetTurnHeartbeat,
  type WidgetTurnPersistence,
  type WidgetTurnStart,
  widgetFieldsFromAssistantParts,
} from "@/lib/conversations/widget-turn";
import {
  getImmigrationConversationByChatId,
  getUserEntitlementById,
  touchImmigrationConversation,
  updateImmigrationConversation,
} from "@/lib/db/queries";
import { defaultAgentRuntimeDebug } from "@/lib/default-agent-runtime-debug";
import { ChatbotError } from "@/lib/errors";
import { createImmigrationAnswerTraceLink } from "@/lib/lawyer-requests/service";
import { buildImmigrationAnswerTraceLinkValues } from "@/lib/lawyer-requests/trace-link";
import {
  type CustomerDocumentEvidence,
  type CustomerDocumentManifest,
  customerDocumentSources,
} from "@/lib/matter-documents/ai-evidence";
import {
  acknowledgedCustomerDocumentProvenance,
  customerDocumentUsageState,
  persistedCustomerDocumentUsedIds,
} from "@/lib/matter-documents/customer-document-provenance";
import { resolveConversationPolicyTopicContextEntry } from "@/lib/policy-intelligence-server";
import {
  blockedResponseForLocale,
  evaluateWidgetSubmission,
  sanitizePoliticalHistory,
} from "@/lib/political-gate";
import { checkIpRateLimit } from "@/lib/ratelimit";
import { isPremiumAllowed, premiumDeniedResponse } from "@/lib/vip/entitlement";
import { resolveWorkspaceContext } from "@/lib/workspace/context-resolver";

export const maxDuration = 390;

const SHOW_WIDGET_DEBUG = process.env.NEXT_PUBLIC_WIDGET_DEBUG === "true";
const LEGAL_SERVICE_DIRECT_TIMEOUT_MS = 370_000;

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
  clientTurnId: z
    .string()
    .min(8)
    .max(128)
    .regex(/^[A-Za-z0-9._:-]+$/u)
    .optional(),
  policySlug: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]{0,119}$/u)
    .optional(),
  matterId: z.string().uuid().nullable().optional(),
  messages: z.array(messageSchema).min(1),
  selectedChatModel: z.string().optional(),
  assistantMode: z
    .enum(["premium", "premium_direct_gpt55_high"])
    .optional()
    .default("premium"),
  intakeFacts: z.record(z.string(), z.any()).optional().default({}),
  currentIntakeFacts: z.record(z.string(), z.any()).optional(),
  responseLanguage: z.enum(["en", "zh"]).optional(),
  answerPreference: z
    .enum(["auto", "answer_first", "continue_intake", "final_recommendation"])
    .optional()
    .default("answer_first"),
});

type ResponseLanguage = "en" | "zh";

type LegalServiceResponse = {
  customer_document_evidence_used?: boolean;
  customer_document_usage?: string;
  /** R2: bounded, request-authorized acknowledged document ids. */
  customer_document_used_ids?: string[];
  trace_id?: string | null;
  answer?: string;
  response_language?: string | null;
  research_status?: "not_required" | "complete" | "incomplete" | null;
  citations?: Record<string, any>[];
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
  fact_slot_states?: Record<string, any>[] | null;
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

function latestUserMessageId(
  messages: z.infer<typeof messageSchema>[]
): string | null {
  const lastUserMessage = [...messages]
    .reverse()
    .find((message) => message.role === "user");
  const id = lastUserMessage?.id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

async function requirePremiumAccess() {
  const session = await auth();
  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  if (session.user.type === "guest") {
    return Response.json(
      {
        error: "Premium AI requires a registered account with active VIP.",
        loginPath: "/login",
      },
      { status: 401 }
    );
  }

  const entitlement = await getUserEntitlementById(session.user.id);
  if (!entitlement) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  if (!isPremiumAllowed(entitlement)) {
    return premiumDeniedResponse();
  }

  return { session, entitlement };
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
  const normalized = {
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
  const runtimeDebug = defaultAgentRuntimeDebug(dbg);
  return runtimeDebug
    ? { ...normalized, defaultAgentRuntime: runtimeDebug }
    : normalized;
}

function emptyWidgetResponse(
  text: string,
  matterId?: string | null,
  responseLanguage: ResponseLanguage = detectResponseLanguage(text),
  userDisplayMode = "general_with_warning"
) {
  return Response.json({
    text,
    customerDocumentEvidenceUsed: false,
    responseLanguage,
    citations: [],
    compactSources: [],
    userDisplayMode,
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
    ? "抱歉，GPT-5.5 快速答复暂时不可用。请切换到默认法律核对模式，或联系律师人工确认。"
    : "Sorry, the GPT-5.5 quick answer is temporarily unavailable. Please switch to the default legal-check mode, or contact the lawyer for manual confirmation.";
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
  const timeout = setTimeout(
    () => controller.abort(),
    LEGAL_SERVICE_DIRECT_TIMEOUT_MS
  );

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
    return {
      ok: true as const,
      data: JSON.parse(bodyText) as LegalServiceResponse,
    };
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
  const requestId = crypto.randomUUID();
  let failedTurn: {
    userId: string;
    chatId: string;
    clientTurnId: string;
    executionOwnerId?: string | null;
    executionAttempt?: number | null;
  } | null = null;
  let heartbeat: WidgetTurnHeartbeat | null = null;
  const stopHeartbeat = () => {
    if (heartbeat) {
      heartbeat.stop();
      heartbeat = null;
    }
  };
  try {
    const json = await request.json();
    const {
      id,
      frontendChatId,
      clientTurnId: parsedClientTurnId,
      policySlug,
      messages,
      assistantMode: requestedAssistantMode,
      intakeFacts,
      responseLanguage: requestedResponseLanguage,
      answerPreference,
      currentIntakeFacts,
    } = widgetDirectRequestBodySchema.parse(json);

    // Defence in depth for direct or stale clients. This must stay ahead of
    // rate limiting, authentication, database access, FastAPI, and message
    // persistence so the blocked text cannot enter a normal server path.
    const gateDecision = evaluateWidgetSubmission({
      messages,
      currentIntakeFacts,
    });
    if (gateDecision.decision === "block") {
      const blockedResponse = blockedResponseForLocale(gateDecision.locale);
      return emptyWidgetResponse(
        blockedResponse.text,
        null,
        blockedResponse.responseLanguage,
        "political_gate_blocked"
      );
    }

    // Premium authorization is database-authoritative and deliberately runs
    // before rate limiting, ownership work, or any legal-service call.
    const premiumAccess = await requirePremiumAccess();
    if (premiumAccess instanceof Response) {
      return premiumAccess;
    }

    const safeMessages = sanitizePoliticalHistory(messages) as typeof messages;

    const assistantMode = normalizeAssistantMode(requestedAssistantMode);

    await checkIpRateLimit(ipAddress(request));

    const { session } = premiumAccess;
    const frontendUserId = session.user.id;
    const activeFrontendChatId = frontendChatId ?? id;
    const ownedConversation = frontendChatId
      ? await getImmigrationConversationByChatId({
          chatId: frontendChatId,
          userId: frontendUserId,
        })
      : null;

    if (frontendChatId && !ownedConversation) {
      return Response.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    // Matter identity is server-owned just like conversation identity. A
    // client-provided matterId may never select another customer's matter.
    const effectiveMatterId = ownedConversation?.legalMatterId ?? null;

    const question = extractLatestUserText(safeMessages);
    if (!question) {
      return emptyWidgetResponse(
        "Please enter a question so I can help.",
        effectiveMatterId,
        "en"
      );
    }

    // Phase 12 Stage 1: durable pre-generation user turn, shared with Fast and
    // Legal Check. Premium keeps its own answer policy but the same persistence
    // contract.
    const clientTurnId = resolveClientTurnId({
      clientTurnId: parsedClientTurnId ?? null,
      userMessageId: latestUserMessageId(safeMessages),
      fallbackId: `srv-${requestId}`,
    });
    const turnStart: WidgetTurnStart = frontendChatId
      ? await beginWidgetTurn({
          userId: frontendUserId,
          chatId: frontendChatId,
          clientTurnId,
          question,
          userMessageId: latestUserMessageId(safeMessages),
          assistantMode,
        })
      : { status: "unscoped" };
    if (frontendChatId) {
      failedTurn = {
        userId: frontendUserId,
        chatId: frontendChatId,
        clientTurnId,
        executionOwnerId:
          turnStart.status === "proceed" ? turnStart.executionOwnerId : null,
        executionAttempt:
          turnStart.status === "proceed" ? turnStart.executionAttempt : null,
      };
    }

    if (turnStart.status === "unauthorized") {
      return new ChatbotError("unauthorized:chat").toResponse();
    }
    if (turnStart.status === "persistence_failed") {
      return Response.json(
        {
          error:
            "Your message could not be saved to your account yet. Nothing was lost, please send it again.",
          code: "conversation_turn_not_persisted",
          persistence: turnStart.persistence,
        },
        { status: 503 }
      );
    }
    if (turnStart.status === "in_progress") {
      // A duplicate request must never generate a second Premium answer.
      return Response.json(
        {
          error:
            "This message is already being answered. Please wait a moment for the saved answer.",
          code: "client_turn_in_progress",
          persistence: turnStart.persistence,
          retryAfterMs: turnStart.persistence.retryAfterMs,
        },
        { status: 409 }
      );
    }
    if (turnStart.status === "conflict") {
      return Response.json(
        {
          error:
            "This turn identifier was already used for a different message. Send the message again as a new turn.",
          code: "client_turn_conflict",
          persistence: turnStart.persistence,
        },
        { status: 409 }
      );
    }
    if (
      (turnStart.status === "replay" || turnStart.status === "resume") &&
      frontendChatId
    ) {
      const storedParts =
        turnStart.status === "replay"
          ? turnStart.replay.parts
          : turnStart.parts;
      const storedFields = widgetFieldsFromAssistantParts(storedParts);
      const storedPersistence =
        turnStart.status === "replay"
          ? turnStart.persistence
          : await completeWidgetTurnFromParts({
              userId: frontendUserId,
              chatId: frontendChatId,
              clientTurnId,
              parts: turnStart.parts,
              userTurnPersisted: turnStart.persistence.userTurnPersisted,
              attempts: turnStart.persistence.attempts,
              executionOwnerId: turnStart.executionOwnerId,
              executionAttempt: turnStart.executionAttempt,
            });
      return Response.json({
        text: storedFields.text,
        assistantMessageId: storedPersistence.assistantMessageId,
        responseLanguage: detectResponseLanguage(storedFields.text),
        researchStatus: storedFields.metadata.researchStatus,
        citations: storedFields.metadata.citations,
        customerDocumentEvidenceUsed:
          storedFields.metadata.customerDocumentEvidenceUsed,
        customerDocumentUsage: storedFields.metadata.customerDocumentUsage,
        customerDocumentSources: storedFields.metadata.customerDocumentSources,
        compactSources: storedFields.metadata.compactSources,
        userDisplayMode: null,
        followUpQuestions: storedFields.metadata.followUpQuestions,
        missingFacts: [],
        evidenceGaps: [],
        escalate: false,
        nextAction: "ask_followup",
        confidence: storedFields.metadata.confidence,
        matterId: storedFields.metadata.matterId ?? effectiveMatterId,
        conversationState: null,
        caseHypothesis: null,
        factSlotStates: [],
        interactionPlan: null,
        retrievalDebug: storedFields.metadata.retrievalDebug ?? null,
        persistence: storedPersistence,
        replayed: true,
      });
    }

    /**
     * Phase 12 Stage 2: Premium reads the same authenticated, conversation-scoped
     * context as Fast and Legal Check. Premium keeps its own direct-web answer
     * policy, but it must not get a different view of the customer's own files or
     * of the policy topic the conversation was started from.
     */
    const workspaceContext = await resolveWorkspaceContext({
      userId: frontendUserId,
      chatId: ownedConversation?.chatId ?? null,
      clientPolicySlug: policySlug,
    });
    const customerDocumentEvidence: CustomerDocumentEvidence =
      workspaceContext.documents.evidence;
    const customerDocumentManifest: CustomerDocumentManifest[] =
      workspaceContext.documents.manifest;
    const customerDocumentStatus = workspaceContext.documents.status;

    if (turnStart.status === "proceed") {
      // Premium runs one long direct-web stage; renew the lease while it runs.
      heartbeat = startWidgetTurnHeartbeat({
        turnId: turnStart.turnId,
        executionOwnerId: turnStart.executionOwnerId,
        executionAttempt: turnStart.executionAttempt,
      });
    }

    const responseLanguage: ResponseLanguage =
      requestedResponseLanguage ?? detectResponseLanguage(question);
    /**
     * R1: the topic hint comes from the persisted binding snapshot, not from a
     * live lookup of the bound slug. An archived, withdrawn or superseded
     * publication must not erase the conversation's topic, and a newer revision
     * is reported separately instead of silently replacing it.
     */
    const policyTopicContext = await resolveConversationPolicyTopicContextEntry(
      {
        binding: workspaceContext.policyBinding,
      }
    );

    const legalServiceUrl =
      process.env.LEGAL_SERVICE_URL ?? "http://127.0.0.1:8000";
    const apiKey = process.env.LEGAL_SERVICE_API_KEY;
    const jurisdiction = process.env.LEGAL_SERVICE_JURISDICTION ?? "Cth";

    const legalServiceResult = await fetchLegalServiceDirect({
      url: `${legalServiceUrl}/api/v1/query`,
      apiKey,
      responseLanguage,
      matterId: effectiveMatterId,
      payload: {
        question,
        response_language: responseLanguage,
        matter_id: effectiveMatterId,
        session_id: id,
        frontend_chat_id: activeFrontendChatId,
        frontend_user_id: frontendUserId,
        preferred_jurisdiction: jurisdiction,
        preferred_source_types: [],
        intake_facts: intakeFacts ?? {},
        top_k: 1,
        answer_preference: answerPreference,
        assistant_mode: assistantMode,
        political_gate_version: gateDecision.policyVersion,
        political_gate_decision_id: gateDecision.decisionId,
        current_intake_facts: currentIntakeFacts ?? null,
        frontend_messages: [
          ...serializeFrontendMessages(safeMessages),
          ...(policyTopicContext ? [policyTopicContext] : []),
        ],
        customer_document_evidence: customerDocumentEvidence,
        /**
         * Bounded availability counts + filenames of this conversation's files.
         * Not evidence: it prevents an answer from implying it read a file whose
         * extraction produced nothing usable.
         */
        customer_document_summary: customerDocumentStatus,
      },
    });

    if (!legalServiceResult.ok) {
      return legalServiceResult.response;
    }

    const data = legalServiceResult.data;
    const backendAnswerPreserved = Boolean(data.answer?.trim());
    const documentProvenance = acknowledgedCustomerDocumentProvenance(
      customerDocumentManifest,
      data.customer_document_evidence_used,
      backendAnswerPreserved,
      data.customer_document_used_ids
    );
    const customerDocumentEvidenceUsed = documentProvenance.used;
    const answeredCustomerDocumentManifest = documentProvenance.manifest;
    /**
     * R1: the backend tri-state distinguishes "no file supplied" from "file
     * supplied but use unverified". The customer-visible used-claim stays gated
     * on the verified boolean, and this state is never upgraded client-side.
     */
    const customerDocumentUsage = customerDocumentUsageState(
      data.customer_document_usage,
      customerDocumentEvidenceUsed
    );
    const finalResponseLanguage = normalizeResponseLanguage(
      data.response_language,
      responseLanguage
    );
    const finalText =
      data.answer?.trim() || legalServiceFallbackText(finalResponseLanguage);
    const compactSources = data.compact_sources ?? [];
    const normalizedCitations: Record<string, any>[] = [];
    const persistedAssistantMetadata = {
      type: "metadata",
      compactSources,
      citations: normalizedCitations,
      customerDocumentEvidenceUsed,
      customerDocumentUsage,
      /**
       * R2: persist the *packaged* manifest this turn's request carried, plus
       * the acknowledged id subset. Lawyer review can then show which files were
       * attached to the conversation while never claiming an unacknowledged
       * file was used by the answer.
       */
      ...(customerDocumentManifest.length > 0
        ? {
            customerDocumentManifest,
            customerDocumentUsedIds: persistedCustomerDocumentUsedIds(
              answeredCustomerDocumentManifest,
              customerDocumentEvidenceUsed
            ),
          }
        : {}),
      confidence: data.confidence ?? null,
      researchStatus: data.research_status ?? null,
      followUpQuestions: data.follow_up_questions ?? [],
      matterId: data.matter_id ?? effectiveMatterId,
      retrievalDebug: SHOW_WIDGET_DEBUG
        ? normalizeRetrievalDebug(data.retrieval_debug)
        : null,
    };

    let persistence: WidgetTurnPersistence | null = null;
    let persistedAssistantMessageId: string | null = null;
    if (frontendChatId && turnStart.status === "proceed") {
      persistence = await completeWidgetTurn({
        userId: frontendUserId,
        chatId: frontendChatId,
        clientTurnId,
        text: finalText,
        metadata: persistedAssistantMetadata,
        userTurnPersisted: turnStart.persistence.userTurnPersisted,
        attempts: turnStart.persistence.attempts,
        executionOwnerId: turnStart.executionOwnerId,
        executionAttempt: turnStart.executionAttempt,
      });
      persistedAssistantMessageId = persistence.assistantMessageId;
      if (persistedAssistantMessageId) {
        const traceLink = buildImmigrationAnswerTraceLinkValues({
          chatId: frontendChatId,
          assistantMessageId: persistedAssistantMessageId,
          legalMatterId: data.matter_id ?? effectiveMatterId,
          answerTraceId: data.trace_id,
        });
        if (traceLink) {
          try {
            await createImmigrationAnswerTraceLink(traceLink);
          } catch {
            console.warn(
              JSON.stringify({
                event: "widget_trace_link_failed",
                request_id: request.headers.get("x-request-id") ?? null,
              })
            );
          }
        }
      }

      // Conversation bookkeeping must never replace a generated answer.
      try {
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
      } catch {
        if (persistence) {
          persistence = {
            ...persistence,
            errorCode: persistence.errorCode ?? "conversation_touch_failed",
          };
        }
      }
    }

    if (SHOW_WIDGET_DEBUG) {
      console.log(
        "premiumDirectAnswer:",
        data.retrieval_debug?.premium_direct_answer ?? null
      );
      console.log("premiumDirectAnswerPreview:", finalText.slice(0, 300));
    }

    return Response.json({
      text: finalText,
      assistantMessageId: persistedAssistantMessageId,
      persistence,
      responseLanguage: finalResponseLanguage,
      researchStatus: data.research_status ?? null,
      citations: normalizedCitations,
      customerDocumentEvidenceUsed,
      customerDocumentUsage,
      customerDocumentSources: customerDocumentSources(
        answeredCustomerDocumentManifest
      ),
      compactSources,
      userDisplayMode: data.user_display_mode ?? "general_with_warning",
      followUpQuestions: data.follow_up_questions ?? [],
      missingFacts: SHOW_WIDGET_DEBUG ? (data.missing_facts ?? []) : [],
      evidenceGaps: [],
      escalate: Boolean(data.escalate),
      nextAction: normalizeNextAction(data.next_action),
      confidence: data.confidence ?? "medium",
      matterId: data.matter_id ?? effectiveMatterId,
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
    if (failedTurn) {
      await failWidgetTurn({
        userId: failedTurn.userId,
        chatId: failedTurn.chatId,
        clientTurnId: failedTurn.clientTurnId,
        errorCode: "assistant_generation_failed",
        executionOwnerId: failedTurn.executionOwnerId ?? null,
        executionAttempt: failedTurn.executionAttempt ?? null,
      });
    }
    if (error instanceof ChatbotError) {
      return error.toResponse();
    }

    return Response.json(
      {
        text: "Sorry, I could not generate a GPT-5.5 quick answer right now.",
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
        persistence: failedTurn
          ? {
              clientTurnId: failedTurn.clientTurnId,
              userTurnPersisted: false,
              assistantTurnPersisted: false,
              assistantMessageId: null,
              errorCode: "assistant_generation_failed",
              replayed: false,
              attempts: 1,
              saved: false,
              retryable: true,
              retryAfterMs: null,
            }
          : null,
      },
      { status: 200 }
    );
  } finally {
    stopHeartbeat();
  }
}
