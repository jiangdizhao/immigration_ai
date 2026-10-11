import { ipAddress } from "@vercel/functions";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { allowedModelIds } from "@/lib/ai/models";
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
  touchImmigrationConversation,
  updateImmigrationConversation,
} from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";
import { createImmigrationAnswerTraceLink } from "@/lib/lawyer-requests/service";
import { buildImmigrationAnswerTraceLinkValues } from "@/lib/lawyer-requests/trace-link";
import { requestLegalService } from "@/lib/legal-service-transport";
import {
  buildConversationMatterDocumentEvidence,
  type CustomerDocumentEvidence,
  type CustomerDocumentManifest,
  customerDocumentSources,
} from "@/lib/matter-documents/ai-evidence";
import { acknowledgedCustomerDocumentProvenance } from "@/lib/matter-documents/customer-document-provenance";
import { getPolicyTopicContextEntry } from "@/lib/policy-intelligence-server";
import {
  blockedResponseForLocale,
  evaluateWidgetSubmission,
  sanitizePoliticalHistory,
} from "@/lib/political-gate";
import { checkIpRateLimit } from "@/lib/ratelimit";
import { FAST_LEGAL_SERVICE_TIMEOUT_MS } from "@/lib/server-http-timeouts";

export const maxDuration = 60;

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

const requestSchema = z.object({
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
  messages: z.array(messageSchema).min(1),
  selectedChatModel: z.string().optional(),
  assistantMode: z.enum(["fast"]).default("fast"),
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
  trace_id?: string | null;
  answer?: string;
  response_language?: string | null;
  research_status?: "not_required" | "complete" | "incomplete" | null;
  citations?: Array<{
    source_id?: string | null;
    title?: string | null;
    authority?: string | null;
    section_ref?: string | null;
    url?: string | null;
    quote_text?: string | null;
    source_type?: string | null;
    used_for?: string | null;
  }>;
  compact_sources?: string[];
  follow_up_questions?: string[];
  missing_facts?: string[];
  confidence?: string | null;
  escalate?: boolean;
  next_action?: string | null;
  matter_id?: string | null;
  user_display_mode?: string | null;
  conversation_state?: unknown;
  retrieval_debug?: Record<string, unknown>;
};

function serializeMessages(messages: z.infer<typeof messageSchema>[]) {
  return messages.map((message, index) => ({
    id: message.id,
    role: message.role,
    index,
    text: message.parts
      .filter(
        (part): part is { type: "text"; text: string } =>
          typeof part === "object" && part !== null && part.type === "text"
      )
      .map((part) => part.text)
      .join("\n")
      .trim(),
  }));
}

function latestQuestion(messages: z.infer<typeof messageSchema>[]) {
  const message = [...messages].reverse().find((item) => item.role === "user");
  if (!message) {
    return null;
  }
  const text = message.parts
    .filter(
      (part): part is { type: "text"; text: string } =>
        typeof part === "object" && part !== null && part.type === "text"
    )
    .map((part) => part.text)
    .join("\n")
    .trim();
  return text || null;
}

function latestUserMessageId(
  messages: z.infer<typeof messageSchema>[]
): string | null {
  const message = [...messages].reverse().find((item) => item.role === "user");
  const id = message?.id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

function detectLanguage(text: string): ResponseLanguage {
  return /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/.test(text) ? "zh" : "en";
}

function normalizeLanguage(
  value: string | null | undefined,
  fallback: ResponseLanguage
): ResponseLanguage {
  return value?.toLowerCase().startsWith("zh") ? "zh" : fallback;
}

function normalizeNextAction(value: string | null | undefined) {
  if (value === "answer") {
    return "provide_answer";
  }
  return [
    "ask_followup",
    "suggest_consultation",
    "provide_answer",
    "wait_for_user",
    "none",
  ].includes(value ?? "")
    ? value
    : "provide_answer";
}

function uniqueStrings(values: string[]) {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter(Boolean))
  );
}

function emptyResponse(
  text: string,
  responseLanguage: ResponseLanguage,
  matterId: string | null = null,
  retrievalDebug: Record<string, unknown> | null = null,
  persistence: WidgetTurnPersistence | null = null
) {
  return Response.json({
    text,
    customerDocumentEvidenceUsed: false,
    responseLanguage,
    researchStatus: "incomplete",
    citations: [],
    compactSources: [],
    userDisplayMode: "general_with_warning",
    followUpQuestions: [],
    missingFacts: [],
    evidenceGaps: [],
    escalate: false,
    nextAction: "ask_followup",
    confidence: "low",
    matterId,
    conversationState: null,
    caseHypothesis: null,
    factSlotStates: [],
    interactionPlan: null,
    retrievalDebug,
    persistence,
  });
}

function fallbackText(language: ResponseLanguage) {
  return language === "zh"
    ? "快速答复暂时不可用。请稍后重试；如需更深入的来源核对，请登录后切换到 Legal Check，或安排律师咨询。"
    : "Quick Answer is temporarily unavailable. Please try again shortly. If you need deeper source checking, sign in and switch to Legal Check, or arrange a lawyer consultation.";
}

function normalizeDebug(debug: Record<string, unknown> | undefined) {
  if (!SHOW_WIDGET_DEBUG) {
    return null;
  }
  return debug ?? null;
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  const started = performance.now();
  let failedTurn: {
    userId: string;
    chatId: string;
    clientTurnId: string;
    executionOwnerId?: string | null;
    executionAttempt?: number | null;
  } | null = null;
  let heartbeat: WidgetTurnHeartbeat | null = null;
  const finish = (response: Response) => {
    // Every exit path stops lease renewal, so a finished request never keeps
    // extending ownership of its turn.
    if (heartbeat) {
      heartbeat.stop();
      heartbeat = null;
    }
    response.headers.set("X-Request-ID", requestId);
    return response;
  };
  try {
    const parsed = requestSchema.parse(await request.json());
    if (
      parsed.selectedChatModel &&
      !allowedModelIds.has(parsed.selectedChatModel)
    ) {
      return finish(new ChatbotError("bad_request:api").toResponse());
    }

    const gateDecision = evaluateWidgetSubmission({
      messages: parsed.messages,
      currentIntakeFacts: parsed.currentIntakeFacts,
    });
    if (gateDecision.decision === "block") {
      const blocked = blockedResponseForLocale(gateDecision.locale);
      return finish(emptyResponse(blocked.text, blocked.responseLanguage));
    }

    const session = await auth();
    if (!session?.user) {
      return finish(new ChatbotError("unauthorized:chat").toResponse());
    }
    await checkIpRateLimit(ipAddress(request));

    const safeMessages = sanitizePoliticalHistory(
      parsed.messages
    ) as typeof parsed.messages;
    const chatId = parsed.frontendChatId ?? parsed.id;
    const ownedConversation = parsed.frontendChatId
      ? await getImmigrationConversationByChatId({
          chatId: parsed.frontendChatId,
          userId: session.user.id,
        })
      : null;
    if (parsed.frontendChatId && !ownedConversation) {
      return finish(
        Response.json({ error: "Conversation not found" }, { status: 404 })
      );
    }

    const matterId = ownedConversation?.legalMatterId ?? null;
    const question = latestQuestion(safeMessages);
    if (!question) {
      return finish(
        emptyResponse("Please enter a question so I can help.", "en", matterId)
      );
    }

    // Phase 12 Stage 1: durable pre-generation user turn, shared with the
    // Legal Check and Premium routes.
    const assistantMode = normalizeAssistantMode(parsed.assistantMode);
    const clientTurnId = resolveClientTurnId({
      clientTurnId: parsed.clientTurnId ?? null,
      userMessageId: latestUserMessageId(safeMessages),
      fallbackId: `srv-${requestId}`,
    });
    const turnStart: WidgetTurnStart = parsed.frontendChatId
      ? await beginWidgetTurn({
          userId: session.user.id,
          chatId: parsed.frontendChatId,
          clientTurnId,
          question,
          userMessageId: latestUserMessageId(safeMessages),
          assistantMode,
        })
      : { status: "unscoped" };

    if (parsed.frontendChatId) {
      failedTurn = {
        userId: session.user.id,
        chatId: parsed.frontendChatId,
        clientTurnId,
        executionOwnerId:
          turnStart.status === "proceed" ? turnStart.executionOwnerId : null,
        executionAttempt:
          turnStart.status === "proceed" ? turnStart.executionAttempt : null,
      };
    }

    if (turnStart.status === "unauthorized") {
      return finish(new ChatbotError("unauthorized:chat").toResponse());
    }
    if (turnStart.status === "persistence_failed") {
      return finish(
        Response.json(
          {
            error:
              "Your message could not be saved to your account yet. Nothing was lost, please send it again.",
            code: "conversation_turn_not_persisted",
            persistence: turnStart.persistence,
          },
          { status: 503 }
        )
      );
    }
    if (turnStart.status === "in_progress") {
      // Another request owns this turn and is still producing the answer. This
      // request must not run the model and must not create a second answer.
      return finish(
        Response.json(
          {
            error:
              "This message is already being answered. Please wait a moment for the saved answer.",
            code: "client_turn_in_progress",
            persistence: turnStart.persistence,
            retryAfterMs: turnStart.persistence.retryAfterMs,
          },
          { status: 409 }
        )
      );
    }
    if (turnStart.status === "conflict") {
      return finish(
        Response.json(
          {
            error:
              "This turn identifier was already used for a different message. Send the message again as a new turn.",
            code: "client_turn_conflict",
            persistence: turnStart.persistence,
          },
          { status: 409 }
        )
      );
    }
    if (
      (turnStart.status === "replay" || turnStart.status === "resume") &&
      parsed.frontendChatId
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
              userId: session.user.id,
              chatId: parsed.frontendChatId,
              clientTurnId,
              parts: turnStart.parts,
              userTurnPersisted: turnStart.persistence.userTurnPersisted,
              attempts: turnStart.persistence.attempts,
              executionOwnerId: turnStart.executionOwnerId,
              executionAttempt: turnStart.executionAttempt,
            });
      return finish(
        Response.json({
          requestId,
          text: storedFields.text,
          assistantMessageId: storedPersistence.assistantMessageId,
          responseLanguage: detectLanguage(storedFields.text),
          researchStatus: storedFields.metadata.researchStatus,
          citations: storedFields.metadata.citations,
          customerDocumentEvidenceUsed:
            storedFields.metadata.customerDocumentEvidenceUsed,
          customerDocumentSources:
            storedFields.metadata.customerDocumentSources,
          compactSources: storedFields.metadata.compactSources,
          userDisplayMode: null,
          followUpQuestions: storedFields.metadata.followUpQuestions,
          missingFacts: [],
          evidenceGaps: [],
          escalate: false,
          nextAction: "ask_followup",
          confidence: storedFields.metadata.confidence,
          matterId: storedFields.metadata.matterId ?? matterId,
          conversationState: null,
          caseHypothesis: null,
          factSlotStates: [],
          interactionPlan: null,
          retrievalDebug: storedFields.metadata.retrievalDebug ?? null,
          persistence: storedPersistence,
          replayed: true,
        })
      );
    }
    let customerDocumentEvidence: CustomerDocumentEvidence = { documents: [] };
    let customerDocumentManifest: CustomerDocumentManifest[] = [];
    if (turnStart.status === "proceed") {
      // Only the lease holder reaches the model stage; renew the lease while it
      // runs so a crashed attempt cannot hold the turn forever.
      heartbeat = startWidgetTurnHeartbeat({
        turnId: turnStart.turnId,
        executionOwnerId: turnStart.executionOwnerId,
        executionAttempt: turnStart.executionAttempt,
      });
    }
    if (ownedConversation) {
      const built = await buildConversationMatterDocumentEvidence({
        userId: session.user.id,
        chatId: ownedConversation.chatId,
      });
      customerDocumentEvidence = built.evidence;
      customerDocumentManifest = built.manifest;
    }
    const responseLanguage =
      parsed.responseLanguage ?? detectLanguage(question);
    const policyTopicContext = await getPolicyTopicContextEntry(
      parsed.policySlug
    );
    const result = await requestLegalService({
      url: `${process.env.LEGAL_SERVICE_URL ?? "http://127.0.0.1:8000"}/api/v1/query`,
      apiKey: process.env.LEGAL_SERVICE_API_KEY,
      requestId,
      timeoutMs: FAST_LEGAL_SERVICE_TIMEOUT_MS,
      payload: {
        client_turn_id: requestId,
        question,
        response_language: responseLanguage,
        matter_id: matterId,
        session_id: parsed.id,
        frontend_chat_id: chatId,
        frontend_user_id: session.user.id,
        preferred_jurisdiction: process.env.LEGAL_SERVICE_JURISDICTION ?? "Cth",
        preferred_source_types: [],
        intake_facts: parsed.intakeFacts,
        top_k: 1,
        answer_preference: parsed.answerPreference,
        assistant_mode: assistantMode,
        political_gate_version: gateDecision.policyVersion,
        political_gate_decision_id: gateDecision.decisionId,
        current_intake_facts: parsed.currentIntakeFacts ?? null,
        frontend_messages: [
          ...serializeMessages(safeMessages),
          ...(policyTopicContext ? [policyTopicContext] : []),
        ],
        customer_document_evidence: customerDocumentEvidence,
      },
    });

    if (!result.ok) {
      return finish(
        emptyResponse(
          fallbackText(responseLanguage),
          responseLanguage,
          matterId,
          {
            fastDirectLuna: {
              completion_status: "transport_error",
              elapsed_ms: Math.round(performance.now() - started),
            },
          }
        )
      );
    }

    const data = result.data as LegalServiceResponse;
    const backendAnswerPreserved = Boolean(data.answer?.trim());
    const documentProvenance = acknowledgedCustomerDocumentProvenance(
      customerDocumentManifest,
      data.customer_document_evidence_used,
      backendAnswerPreserved
    );
    const customerDocumentEvidenceUsed = documentProvenance.used;
    const answeredCustomerDocumentManifest = documentProvenance.manifest;
    const finalLanguage = normalizeLanguage(
      data.response_language,
      responseLanguage
    );
    const finalText = data.answer?.trim() || fallbackText(finalLanguage);
    const citations = (data.citations ?? [])
      .filter(
        (citation) =>
          typeof citation.url === "string" &&
          citation.url.startsWith("https://")
      )
      .map((citation) => ({
        source_id: citation.source_id ?? null,
        title: citation.title ?? citation.url ?? "",
        authority: citation.authority ?? null,
        section_ref: citation.section_ref ?? null,
        url: citation.url ?? null,
        quote: citation.quote_text ?? null,
        source_type: citation.source_type ?? null,
        used_for: citation.used_for ?? null,
      }));
    const compactSources = uniqueStrings(
      (data.compact_sources ?? []).filter(
        (item): item is string => typeof item === "string"
      )
    );
    const metadata = {
      type: "metadata",
      compactSources,
      citations,
      customerDocumentEvidenceUsed,
      ...(customerDocumentEvidenceUsed
        ? { customerDocumentManifest: answeredCustomerDocumentManifest }
        : {}),
      confidence: data.confidence ?? null,
      researchStatus: data.research_status ?? null,
      followUpQuestions: data.follow_up_questions ?? [],
      matterId: data.matter_id ?? matterId,
      retrievalDebug: normalizeDebug(data.retrieval_debug),
    };

    let persistence: WidgetTurnPersistence | null = null;
    let assistantMessageId: string | null = null;
    if (parsed.frontendChatId && turnStart.status === "proceed") {
      persistence = await completeWidgetTurn({
        userId: session.user.id,
        chatId: parsed.frontendChatId,
        clientTurnId,
        text: finalText,
        metadata,
        userTurnPersisted: turnStart.persistence.userTurnPersisted,
        attempts: turnStart.persistence.attempts,
        executionOwnerId: turnStart.executionOwnerId,
        executionAttempt: turnStart.executionAttempt,
      });
      assistantMessageId = persistence.assistantMessageId;
      if (assistantMessageId) {
        const traceLink = buildImmigrationAnswerTraceLinkValues({
          chatId: parsed.frontendChatId,
          assistantMessageId,
          legalMatterId: data.matter_id ?? matterId,
          answerTraceId: data.trace_id,
        });
        if (traceLink) {
          try {
            await createImmigrationAnswerTraceLink(traceLink);
          } catch {
            console.warn(
              JSON.stringify({
                event: "widget_trace_link_failed",
                request_id: requestId,
              })
            );
          }
        }
      }

      // Conversation bookkeeping must never replace a generated answer.
      try {
        if (data.matter_id) {
          await updateImmigrationConversation({
            chatId: parsed.frontendChatId,
            userId: session.user.id,
            legalMatterId: data.matter_id,
            title: question.slice(0, 80) || "Immigration conversation",
          });
        } else {
          await touchImmigrationConversation({
            chatId: parsed.frontendChatId,
            userId: session.user.id,
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

    const response = Response.json({
      requestId,
      text: finalText,
      assistantMessageId,
      persistence,
      responseLanguage: finalLanguage,
      researchStatus: data.research_status ?? "not_required",
      citations,
      customerDocumentEvidenceUsed,
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
      matterId: data.matter_id ?? matterId,
      conversationState: data.conversation_state ?? null,
      caseHypothesis: null,
      factSlotStates: [],
      interactionPlan: null,
      retrievalDebug: normalizeDebug(data.retrieval_debug),
    });
    return finish(response);
  } catch (error) {
    console.error("widget-chat-fast error:", error);
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
      return finish(error.toResponse());
    }
    return finish(
      emptyResponse(
        fallbackText("en"),
        "en",
        null,
        {
          fastDirectLuna: {
            completion_status: "route_error",
            elapsed_ms: Math.round(performance.now() - started),
          },
        },
        failedTurn
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
          : null
      )
    );
  }
}
