import { ipAddress } from "@vercel/functions";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { allowedModelIds } from "@/lib/ai/models";
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

const widgetRequestBodySchema = z.object({
  id: z.string().uuid(),
  frontendChatId: z.string().uuid().optional(),
  matterId: z.string().uuid().nullable().optional(),
  messages: z.array(messageSchema).min(1),
  selectedChatModel: z.string(),
  intakeFacts: z.record(z.string(), z.any()).optional().default({}),
  responseLanguage: z.enum(["en", "zh"]).optional(),
  answerPreference: z
    .enum(["auto", "answer_first", "continue_intake", "final_recommendation"])
    .optional()
    .default("answer_first"),
});

type ResponseLanguage = "en" | "zh";

type LegalCitation = {
  title?: string;
  authority?: string | null;
  section_ref?: string | null;
  url?: string | null;
  quote_text?: string | null;
  source_id?: string | null;
  source_type?: string | null;
  used_for?: string | null;
};

type LegalServiceResponse = {
  answer?: string;
  response_language?: string | null;
  citations?: LegalCitation[];
  compact_sources?: string[];
  user_display_mode?: string | null;
  follow_up_questions?: string[];
  missing_facts?: string[];
  confidence?: string | null;
  escalate?: boolean;
  next_action?: string | null;
  matter_id?: string | null;
  conversation_state?: string | null;
  case_hypothesis?: {
    issue_type?: string | null;
    visa_type?: string | null;
    primary_operation_type?: string | null;
    candidates?: Array<{
      operation_type?: string | null;
      score?: number | null;
      why_it_fits?: string | null;
    }> | null;
    decisive_next_facts?: string[] | null;
  } | null;
  fact_slot_states?: Array<{
    fact_key?: string | null;
    label?: string | null;
    status?: string | null;
    value?: unknown;
    value_display?: string | null;
    source?: string | null;
    required?: boolean;
    blocking?: boolean;
    why_needed?: string | null;
  }> | null;
  interaction_plan?: {
    mode?: string | null;
    answer_mode?: string | null;
    next_action?: string | null;
    primary_prompt?: string | null;
    requested_facts?: Array<{
      fact_key?: string | null;
      label?: string | null;
      prompt?: string | null;
      input_type?: string | null;
      options?: string[] | null;
      required?: boolean;
      blocking?: boolean;
      why_needed?: string | null;
    }> | null;
    missing_required_facts?: string[] | null;
    warnings?: string[] | null;
    known_facts_summary?: Record<string, unknown> | null;
    progress?: {
      collected_required?: number | null;
      total_required?: number | null;
    } | null;
  } | null;
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

function fallbackText(
  data: LegalServiceResponse,
  responseLanguage: ResponseLanguage
): string {
  if (data.answer?.trim()) {
    return data.answer.trim();
  }
  return responseLanguage === "zh"
    ? "抱歉，我现在无法生成回复。"
    : "Sorry, I could not generate a response right now.";
}

const FORBIDDEN_PUBLIC_ANSWER_PATTERNS = [
  /retrieval_debug/i,
  /proposal_first_verification_depth/i,
  /CustomerAnswerPlan JSON/i,
  /Original rich proposal JSON/i,
  /Verification JSON:/i,
  /raw_model_output/i,
  /internal JSON/i,
  /```json/i,
];

function hasForbiddenPublicAnswerText(text: string): boolean {
  return FORBIDDEN_PUBLIC_ANSWER_PATTERNS.some((pattern) => pattern.test(text));
}

function firstRequestedFactPrompt(data: LegalServiceResponse): string | null {
  const prompt = data.interaction_plan?.requested_facts?.[0]?.prompt;
  return typeof prompt === "string" && prompt.trim() ? prompt.trim() : null;
}

function publicFallbackAnswer(
  data: LegalServiceResponse,
  responseLanguage: ResponseLanguage
): string {
  const nextPrompt = firstRequestedFactPrompt(data);
  const operation = data.case_hypothesis?.primary_operation_type ?? "";
  const is485 =
    operation.startsWith("485") || operation.includes("temporary_graduate");

  if (responseLanguage === "zh") {
    let answer = is485
      ? "根据你提供的信息，这看起来是一个 Subclass 485 Temporary Graduate visa 问题。我可以先给你一般性方向，但还需要一个关键信息才能更准确判断。"
      : "我可以先给你一般性方向，但还需要一个关键信息，才能把说明更准确地对应到你的情况。";
    if (nextPrompt) {
      answer += `

一个简单问题：${nextPrompt}`;
    }
    return answer;
  }

  let answer = is485
    ? "Based on what you told me, this appears to be a Subclass 485 Temporary Graduate visa question. I can give a cautious first view, but I need one key detail before making it more specific."
    : "I can give general guidance, but I need one key detail before making it more specific to your situation.";
  if (nextPrompt) {
    answer += `

One quick question: ${nextPrompt}`;
  }
  return answer;
}

function publicSafeText(
  data: LegalServiceResponse,
  responseLanguage: ResponseLanguage
): string {
  const text = fallbackText(data, responseLanguage);
  return hasForbiddenPublicAnswerText(text)
    ? publicFallbackAnswer(data, responseLanguage)
    : text;
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
  return "ask_followup";
}

function uniqueStrings(values: string[]) {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter(Boolean))
  );
}

function _pfvdLiveChunkCount(debug: Record<string, any>) {
  const value =
    debug.proposal_first_verification_depth?.evidence_summary?.live_chunk_count;
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function pfvdEvidenceSummaryFromDebug(dbg: Record<string, any>) {
  return dbg.proposal_first_verification_depth?.evidence_summary ?? null;
}

function pfvdLiveChunkCountFromDebug(dbg: Record<string, any>) {
  const count = pfvdEvidenceSummaryFromDebug(dbg)?.live_chunk_count;
  return typeof count === "number" && Number.isFinite(count) ? count : 0;
}

function normalizedLiveFetchUsedFromDebug(dbg: Record<string, any>) {
  return Boolean(dbg.live_fetch_used) || pfvdLiveChunkCountFromDebug(dbg) > 0;
}

function normalizedLiveResultCountFromDebug(dbg: Record<string, any>) {
  if (
    typeof dbg.live_result_count === "number" &&
    Number.isFinite(dbg.live_result_count)
  ) {
    return dbg.live_result_count;
  }
  return pfvdLiveChunkCountFromDebug(dbg);
}

function normalizeCompactSources(data: LegalServiceResponse) {
  const fromBackend = uniqueStrings(
    (data.compact_sources ?? []).filter(
      (item): item is string => typeof item === "string"
    )
  );
  if (fromBackend.length > 0) {
    return fromBackend.slice(0, 4);
  }

  const fromCitations = uniqueStrings(
    (data.citations ?? [])
      .map((citation) => {
        const title = citation.title?.trim();
        const authority = citation.authority?.trim();
        if (authority && title) {
          return `${authority} — ${title}`;
        }
        return title || authority || "";
      })
      .filter(Boolean)
  );
  return fromCitations.slice(0, 4);
}

function normalizeCaseHypothesis(
  caseHypothesis: LegalServiceResponse["case_hypothesis"]
) {
  if (!caseHypothesis) {
    return null;
  }
  return {
    issue_type: caseHypothesis.issue_type ?? null,
    visa_type: caseHypothesis.visa_type ?? null,
    primary_operation_type: caseHypothesis.primary_operation_type ?? null,
    candidate_operations: (caseHypothesis.candidates ?? [])
      .filter((candidate) => candidate?.operation_type)
      .map((candidate) => ({
        operation_type: candidate.operation_type ?? "",
        score: candidate.score ?? null,
        reason: candidate.why_it_fits ?? null,
      })),
    decisive_next_facts: caseHypothesis.decisive_next_facts ?? [],
  };
}

function normalizeFactSlotStates(
  factSlotStates: LegalServiceResponse["fact_slot_states"]
) {
  return (factSlotStates ?? [])
    .filter((slot) => slot?.fact_key)
    .map((slot) => ({
      key: slot.fact_key ?? "",
      fact_key: slot.fact_key ?? "",
      label: slot.label ?? slot.fact_key ?? "",
      status: slot.status ?? null,
      value:
        typeof slot.value === "string" ||
        typeof slot.value === "number" ||
        typeof slot.value === "boolean"
          ? slot.value
          : null,
      valueDisplay:
        slot.value_display ??
        (typeof slot.value === "string" ||
        typeof slot.value === "number" ||
        typeof slot.value === "boolean"
          ? String(slot.value)
          : null),
      source: slot.source ?? null,
      required: Boolean(slot.required),
      blocking: Boolean(slot.blocking),
      why_needed: slot.why_needed ?? null,
      input_type: null,
      options: [],
    }));
}

function normalizeInteractionPlan(
  interactionPlan: LegalServiceResponse["interaction_plan"]
) {
  if (!interactionPlan) {
    return null;
  }

  const completed = interactionPlan.progress?.collected_required ?? 0;
  const total = interactionPlan.progress?.total_required ?? 0;

  return {
    mode: interactionPlan.mode ?? null,
    answer_mode: interactionPlan.answer_mode ?? null,
    next_action: normalizeNextAction(interactionPlan.next_action),
    primary_prompt: interactionPlan.primary_prompt ?? null,
    requested_facts: (interactionPlan.requested_facts ?? [])
      .filter((fact) => fact?.fact_key)
      .map((fact) => ({
        key: fact.fact_key ?? "",
        fact_key: fact.fact_key ?? "",
        label: fact.label ?? fact.fact_key ?? "",
        prompt: fact.prompt ?? null,
        why_needed: fact.why_needed ?? null,
        required: Boolean(fact.required),
        blocking: Boolean(fact.blocking),
        input_type: fact.input_type ?? "short_text",
        options: fact.options ?? [],
      })),
    missing_required_facts: interactionPlan.missing_required_facts ?? [],
    warnings: interactionPlan.warnings ?? [],
    known_facts_summary: (interactionPlan.known_facts_summary ?? {}) as Record<
      string,
      string | number | boolean | null
    >,
    progress: {
      completed,
      total,
      ratio: total > 0 ? completed / total : 0,
    },
  };
}

function normalizeRetrievalDebug(
  retrievalDebug: LegalServiceResponse["retrieval_debug"]
) {
  const dbg = retrievalDebug ?? {};
  const pfvd = dbg.proposal_first_verification_depth ?? {};
  const customerQuality = dbg.customer_answer_quality ?? {};
  const customerPlan = customerQuality.customer_answer_plan ?? {};
  return {
    effective_question:
      (typeof dbg.effective_question === "string" && dbg.effective_question) ||
      (typeof dbg.contextualization?.standalone_question === "string" &&
        dbg.contextualization.standalone_question) ||
      null,
    local_sufficient: dbg.sufficiency_gate?.local_sufficient ?? null,
    need_live_fetch: dbg.sufficiency_gate?.need_live_fetch ?? null,
    live_fetch_used: normalizedLiveFetchUsedFromDebug(dbg),
    live_result_count: normalizedLiveResultCountFromDebug(dbg),
    top_titles: Array.isArray(dbg.top_titles) ? dbg.top_titles : [],
    stageTiming: dbg.stage_timing ?? pfvd.stage_timing ?? null,
    pfvdStageTiming: pfvd.stage_timing ?? null,
    pfvdEvidenceSummary: pfvd.evidence_summary ?? null,
    answerScopeContract:
      pfvd.answer_scope_contract ??
      customerQuality.answer_scope_contract ??
      customerPlan.answer_scope_contract ??
      null,
    coverageAudit:
      pfvd.coverage_audit ??
      customerQuality.coverage_audit ??
      customerPlan.coverage_audit ??
      null,
    publicOptionCoverageMap:
      pfvd.public_option_coverage_map ??
      customerQuality.public_option_coverage_map ??
      customerPlan.public_option_coverage_map ??
      [],
  };
}

function extractEvidenceGaps(
  retrievalDebug: LegalServiceResponse["retrieval_debug"]
) {
  if (!SHOW_WIDGET_DEBUG) {
    return [];
  }
  const dbg = retrievalDebug ?? {};
  if (Array.isArray(dbg.evidence_gaps)) {
    return dbg.evidence_gaps.filter(
      (item: unknown): item is string => typeof item === "string"
    );
  }
  if (Array.isArray(dbg.internal_evidence_gaps)) {
    return dbg.internal_evidence_gaps.filter(
      (item: unknown): item is string => typeof item === "string"
    );
  }
  return [];
}

function logWidgetDebug(params: {
  sessionId: string;
  question: string;
  matterId?: string | null;
  response: LegalServiceResponse;
  responseLanguage: ResponseLanguage;
}) {
  const dbg = params.response.retrieval_debug ?? {};
  const pfvd = dbg.proposal_first_verification_depth ?? null;
  const customerQuality = dbg.customer_answer_quality ?? null;
  const unified =
    dbg.unified_context ?? dbg.proposal_first_exhaustive_discovery ?? null;
  console.log("\n=== widget-chat debug ===");
  console.log("sessionId:", params.sessionId);
  console.log("matterId(in):", params.matterId ?? null);
  console.log("matterId(out):", params.response.matter_id ?? null);
  console.log("responseLanguage:", params.responseLanguage);
  console.log("originalQuestion:", dbg.original_question ?? params.question);
  console.log(
    "effectiveQuestion:",
    dbg.effective_question ??
      dbg.contextualization?.standalone_question ??
      params.question
  );
  console.log("usedHistory:", dbg.contextualization?.used_history ?? false);
  console.log("contextReason:", dbg.contextualization?.reason ?? null);
  console.log(
    "localSufficient:",
    dbg.sufficiency_gate?.local_sufficient ?? null
  );
  console.log("sufficiencyReason:", dbg.sufficiency_gate?.reason ?? null);
  console.log("needLiveFetch:", dbg.sufficiency_gate?.need_live_fetch ?? null);
  console.log(
    "initialLocalSufficient:",
    dbg.initial_sufficiency_gate?.local_sufficient ?? null
  );
  console.log(
    "initialSufficiencyReason:",
    dbg.initial_sufficiency_gate?.reason ?? null
  );
  console.log("liveFetchUsed:", normalizedLiveFetchUsedFromDebug(dbg));
  console.log("liveDomainsUsed:", dbg.live_domains_used ?? []);
  console.log("liveResultCount:", normalizedLiveResultCountFromDebug(dbg));
  console.log("topTitles:", dbg.top_titles ?? []);
  console.log("sourceTypeCounts:", dbg.source_type_counts ?? {});
  console.log("authorityCounts:", dbg.authority_counts ?? {});
  console.log("bucketCounts:", dbg.bucket_counts ?? {});
  console.log("sourceClassCounts:", dbg.source_class_counts ?? {});
  console.log(
    "answerabilityProfile:",
    dbg.sufficiency_gate?.answerability?.profile_name ?? null
  );
  console.log(
    "answerMode:",
    dbg.sufficiency_gate?.answerability?.answer_mode ?? null
  );
  console.log(
    "missingRequiredFacts:",
    dbg.sufficiency_gate?.answerability?.required_facts_missing ?? []
  );
  console.log(
    "missingRequiredSourceClasses:",
    dbg.sufficiency_gate?.answerability?.required_source_classes_missing ?? []
  );
  console.log("policy:", dbg.policy ?? {});
  console.log("conversationAction:", dbg.conversation_action ?? null);
  console.log("taskFulfillment:", dbg.task_fulfillment ?? null);
  console.log("semanticTurnAnalysis:", dbg.semantic_turn_analysis ?? null);
  console.log("legalDecisionObject:", dbg.legal_decision_object ?? null);
  console.log("communicationPlan:", dbg.communication_plan ?? null);
  console.log("naturalResponse:", dbg.natural_response ?? null);
  console.log("stageTiming:", dbg.stage_timing ?? null);
  console.log("liveTrigger:", dbg.sufficiency_gate?.live_trigger ?? null);
  console.log("riskFlags:", dbg.risk_flags ?? {});
  console.log(
    "interactionMode:",
    params.response.interaction_plan?.mode ?? null
  );
  console.log(
    "requestedFacts:",
    (params.response.interaction_plan?.requested_facts ?? []).map(
      (fact) => fact?.fact_key ?? null
    )
  );
  console.log("conversationIdentity:", unified?.conversation_identity ?? null);
  console.log("memoryPacket:", unified?.memory_packet ?? null);
  console.log("reasoningTier:", unified?.reasoning_depth ?? null);
  console.log("pfvdStageTiming:", pfvd?.stage_timing ?? null);
  console.log("pfvdEvidenceSummary:", pfvd?.evidence_summary ?? null);
  console.log(
    "answerScopeContract:",
    pfvd?.answer_scope_contract ??
      customerQuality?.answer_scope_contract ??
      customerQuality?.customer_answer_plan?.answer_scope_contract ??
      null
  );
  console.log(
    "coverageAudit:",
    pfvd?.coverage_audit ??
      customerQuality?.coverage_audit ??
      customerQuality?.customer_answer_plan?.coverage_audit ??
      null
  );
  console.log(
    "publicOptionCoverageMap:",
    pfvd?.public_option_coverage_map ??
      customerQuality?.public_option_coverage_map ??
      customerQuality?.customer_answer_plan?.public_option_coverage_map ??
      []
  );
  console.log(
    "rankedCandidateMap:",
    pfvd?.ranked_candidate_map ??
      customerQuality?.customer_answer_plan?.ranked_candidate_map ??
      null
  );
  console.log(
    "answerCompositionPlan:",
    pfvd?.answer_composition_plan ??
      customerQuality?.answer_composition_plan ??
      customerQuality?.customer_answer_plan?.answer_composition_plan ??
      null
  );
  console.log(
    "customerVisibleSourceRefs:",
    pfvd?.customer_visible_source_refs ??
      customerQuality?.customer_visible_source_refs ??
      []
  );
  console.log(
    "debugHiddenSourceRefs:",
    pfvd?.debug_hidden_source_refs ??
      customerQuality?.debug_hidden_source_refs ??
      []
  );
  console.log(
    "legacySchedule2Exhaustive:",
    pfvd?.legacy_schedule2_exhaustive_discovery ??
      unified?.legacy_schedule2_exhaustive_discovery ??
      unified?.schedule2_exhaustive_discovery ??
      null
  );
  console.log("compactSources:", params.response.compact_sources ?? []);
  console.log("userDisplayMode:", params.response.user_display_mode ?? null);
  console.log("confidence:", params.response.confidence ?? null);
  console.log("nextAction:", params.response.next_action ?? null);
  console.log("escalate:", params.response.escalate ?? false);
  console.log("answerPreview:", (params.response.answer ?? "").slice(0, 300));
  console.log("=== end widget-chat debug ===\n");
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
    userDisplayMode: null,
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

type LegalServiceJsonResult =
  | { ok: true; data: LegalServiceResponse }
  | { ok: false; response: Response };

function legalServiceFallbackText(responseLanguage: ResponseLanguage): string {
  return responseLanguage === "zh"
    ? "抱歉，法律服务暂时不可用。请稍后再试，或联系律师人工确认。"
    : "Sorry, the legal service is temporarily unavailable. Please try again shortly, or contact the lawyer for manual confirmation.";
}

function previewResponseBody(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 500);
}

async function fetchLegalServiceJson(params: {
  url: string;
  apiKey?: string;
  payload: Record<string, unknown>;
  responseLanguage: ResponseLanguage;
  matterId: string | null;
}): Promise<LegalServiceJsonResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 150_000);

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
    console.error("legal-service fetch failed:", error);
    return {
      ok: false,
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

  if (!response.ok) {
    console.error(
      "legal-service error:",
      response.status,
      response.statusText,
      previewResponseBody(bodyText)
    );
    return {
      ok: false,
      response: emptyWidgetResponse(
        legalServiceFallbackText(params.responseLanguage),
        params.matterId,
        params.responseLanguage
      ),
    };
  }

  if (!contentType.toLowerCase().includes("application/json")) {
    console.error(
      "legal-service returned non-JSON response:",
      contentType,
      previewResponseBody(bodyText)
    );
    return {
      ok: false,
      response: emptyWidgetResponse(
        legalServiceFallbackText(params.responseLanguage),
        params.matterId,
        params.responseLanguage
      ),
    };
  }

  try {
    return { ok: true, data: JSON.parse(bodyText) as LegalServiceResponse };
  } catch (error) {
    console.error(
      "legal-service JSON parse failed:",
      error,
      previewResponseBody(bodyText)
    );
    return {
      ok: false,
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
      selectedChatModel,
      intakeFacts,
      responseLanguage: requestedResponseLanguage,
      answerPreference,
    } = widgetRequestBodySchema.parse(json);

    if (!allowedModelIds.has(selectedChatModel)) {
      return new ChatbotError("bad_request:api").toResponse();
    }

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
      return Response.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
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
    const sourceTypes = (
      process.env.LEGAL_SERVICE_SOURCE_TYPES ?? "guidance,legislation,procedure"
    )
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const legalServiceResult = await fetchLegalServiceJson({
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
        preferred_source_types: sourceTypes,
        intake_facts: intakeFacts ?? {},
        top_k: 8,
        answer_preference: answerPreference,
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
    const finalText = publicSafeText(data, finalResponseLanguage);
    const normalizedCitations = (data.citations ?? []).map((c) => ({
      source_id: c.source_id ?? null,
      title: c.title ?? "",
      authority: c.authority ?? null,
      url: c.url ?? null,
      quote: c.quote_text ?? null,
      source_type: c.source_type ?? null,
      used_for: c.used_for ?? null,
    }));
    const compactSources = normalizeCompactSources(data);
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
        console.warn("Failed to persist immigration workspace messages", error);
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

    logWidgetDebug({
      sessionId: id,
      question,
      matterId,
      response: data,
      responseLanguage: finalResponseLanguage,
    });

    return Response.json({
      text: finalText,
      responseLanguage: finalResponseLanguage,
      citations: normalizedCitations,
      compactSources,
      userDisplayMode:
        data.user_display_mode ?? data.interaction_plan?.answer_mode ?? null,
      followUpQuestions: data.follow_up_questions ?? [],
      missingFacts: SHOW_WIDGET_DEBUG ? (data.missing_facts ?? []) : [],
      evidenceGaps: extractEvidenceGaps(data.retrieval_debug),
      escalate: Boolean(data.escalate),
      nextAction: normalizeNextAction(data.next_action),
      confidence: data.confidence ?? null,
      matterId: data.matter_id ?? matterId ?? null,
      conversationState: data.conversation_state ?? null,
      caseHypothesis: normalizeCaseHypothesis(data.case_hypothesis),
      factSlotStates: normalizeFactSlotStates(data.fact_slot_states),
      interactionPlan: normalizeInteractionPlan(data.interaction_plan),
      retrievalDebug: SHOW_WIDGET_DEBUG
        ? normalizeRetrievalDebug(data.retrieval_debug)
        : null,
    });
  } catch (error) {
    console.error("widget-chat error:", error);
    if (error instanceof ChatbotError) {
      return error.toResponse();
    }

    return Response.json(
      {
        text: "Sorry, I could not generate a response right now.",
        responseLanguage: "en",
        citations: [],
        compactSources: [],
        userDisplayMode: null,
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
