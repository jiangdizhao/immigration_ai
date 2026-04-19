import { ipAddress } from "@vercel/functions";
import { z } from "zod";
import { allowedModelIds } from "@/lib/ai/models";
import { ChatbotError } from "@/lib/errors";
import { checkIpRateLimit } from "@/lib/ratelimit";

export const maxDuration = 60;

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
  matterId: z.string().uuid().nullable().optional(),
  messages: z.array(messageSchema).min(1),
  selectedChatModel: z.string(),
  intakeFacts: z.record(z.string(), z.any()).optional().default({}),
});

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
  citations?: LegalCitation[];
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

function extractLatestUserText(messages: Array<z.infer<typeof messageSchema>>): string | null {
  const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUserMessage) return null;

  const text = lastUserMessage.parts
    .filter((part): part is { type: "text"; text: string } => {
      return typeof part === "object" && part !== null && part.type === "text";
    })
    .map((part) => part.text)
    .join("\n")
    .trim();

  return text.length > 0 ? text : null;
}

function fallbackText(data: LegalServiceResponse): string {
  if (data.answer?.trim()) return data.answer.trim();
  return "Sorry, I could not generate a response right now.";
}

function normalizeNextAction(nextAction: string | null | undefined) {
  if (nextAction === "answer") return "provide_answer";
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

function normalizeCaseHypothesis(caseHypothesis: LegalServiceResponse["case_hypothesis"]) {
  if (!caseHypothesis) return null;
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

function normalizeFactSlotStates(factSlotStates: LegalServiceResponse["fact_slot_states"]) {
  return (factSlotStates ?? [])
    .filter((slot) => slot?.fact_key)
    .map((slot) => ({
      key: slot.fact_key ?? "",
      label: slot.label ?? slot.fact_key ?? "",
      status: slot.status ?? null,
      value:
        slot.value_display ??
        (typeof slot.value === "string" ||
        typeof slot.value === "number" ||
        typeof slot.value === "boolean"
          ? slot.value
          : null),
      source: slot.source ?? null,
      required: Boolean(slot.required),
      blocking: Boolean(slot.blocking),
      why_needed: slot.why_needed ?? null,
      input_type: null,
      options: [],
    }));
}

function normalizeInteractionPlan(interactionPlan: LegalServiceResponse["interaction_plan"]) {
  if (!interactionPlan) return null;

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

function normalizeRetrievalDebug(retrievalDebug: LegalServiceResponse["retrieval_debug"]) {
  const dbg = retrievalDebug ?? {};
  return {
    effective_question:
      (typeof dbg.effective_question === "string" && dbg.effective_question) ||
      (typeof dbg.contextualization?.standalone_question === "string" &&
        dbg.contextualization.standalone_question) ||
      null,
    local_sufficient: dbg.sufficiency_gate?.local_sufficient ?? null,
    need_live_fetch: dbg.sufficiency_gate?.need_live_fetch ?? null,
    live_fetch_used: dbg.live_fetch_used ?? null,
    top_titles: Array.isArray(dbg.top_titles) ? dbg.top_titles : [],
  };
}

function extractEvidenceGaps(retrievalDebug: LegalServiceResponse["retrieval_debug"]) {
  const dbg = retrievalDebug ?? {};
  if (Array.isArray(dbg.evidence_gaps)) {
    return dbg.evidence_gaps.filter((item: unknown): item is string => typeof item === "string");
  }
  return [];
}

function logWidgetDebug(params: {
  sessionId: string;
  question: string;
  matterId?: string | null;
  response: LegalServiceResponse;
}) {
  const dbg = params.response.retrieval_debug ?? {};
  console.log("\n=== widget-chat debug ===");
  console.log("sessionId:", params.sessionId);
  console.log("matterId(in):", params.matterId ?? null);
  console.log("matterId(out):", params.response.matter_id ?? null);
  console.log("originalQuestion:", dbg.original_question ?? params.question);
  console.log("effectiveQuestion:", dbg.effective_question ?? dbg.contextualization?.standalone_question ?? params.question);
  console.log("usedHistory:", dbg.contextualization?.used_history ?? false);
  console.log("contextReason:", dbg.contextualization?.reason ?? null);
  console.log("localSufficient:", dbg.sufficiency_gate?.local_sufficient ?? null);
  console.log("sufficiencyReason:", dbg.sufficiency_gate?.reason ?? null);
  console.log("needLiveFetch:", dbg.sufficiency_gate?.need_live_fetch ?? null);
  console.log("initialLocalSufficient:", dbg.initial_sufficiency_gate?.local_sufficient ?? null);
  console.log("initialSufficiencyReason:", dbg.initial_sufficiency_gate?.reason ?? null);
  console.log("liveFetchUsed:", dbg.live_fetch_used ?? false);
  console.log("liveDomainsUsed:", dbg.live_domains_used ?? []);
  console.log("liveResultCount:", dbg.live_result_count ?? 0);
  console.log("topTitles:", dbg.top_titles ?? []);
  console.log("sourceTypeCounts:", dbg.source_type_counts ?? {});
  console.log("authorityCounts:", dbg.authority_counts ?? {});
  console.log("bucketCounts:", dbg.bucket_counts ?? {});
  console.log("sourceClassCounts:", dbg.source_class_counts ?? {});
  console.log("answerabilityProfile:", dbg.sufficiency_gate?.answerability?.profile_name ?? null);
  console.log("answerMode:", dbg.sufficiency_gate?.answerability?.answer_mode ?? null);
  console.log("missingRequiredFacts:", dbg.sufficiency_gate?.answerability?.required_facts_missing ?? []);
  console.log(
    "missingRequiredSourceClasses:",
    dbg.sufficiency_gate?.answerability?.required_source_classes_missing ?? []
  );
  console.log("policy:", dbg.policy ?? {});
  console.log("liveTrigger:", dbg.sufficiency_gate?.live_trigger ?? null);
  console.log("riskFlags:", dbg.risk_flags ?? {});
  console.log("interactionMode:", params.response.interaction_plan?.mode ?? null);
  console.log(
    "requestedFacts:",
    (params.response.interaction_plan?.requested_facts ?? []).map((fact) => fact?.fact_key ?? null)
  );
  console.log("confidence:", params.response.confidence ?? null);
  console.log("nextAction:", params.response.next_action ?? null);
  console.log("escalate:", params.response.escalate ?? false);
  console.log("answerPreview:", (params.response.answer ?? "").slice(0, 300));
  console.log("=== end widget-chat debug ===\n");
}

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const { id, matterId, messages, selectedChatModel, intakeFacts } =
      widgetRequestBodySchema.parse(json);

    if (!allowedModelIds.has(selectedChatModel)) {
      return new ChatbotError("bad_request:api").toResponse();
    }

    await checkIpRateLimit(ipAddress(request));

    const question = extractLatestUserText(messages);
    if (!question) {
      return Response.json({
        text: "Please enter a question so I can help.",
        citations: [],
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

    const legalServiceUrl = process.env.LEGAL_SERVICE_URL ?? "http://127.0.0.1:8000";
    const apiKey = process.env.LEGAL_SERVICE_API_KEY;
    const jurisdiction = process.env.LEGAL_SERVICE_JURISDICTION ?? "Cth";
    const sourceTypes = (process.env.LEGAL_SERVICE_SOURCE_TYPES ?? "guidance,legislation,procedure")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const legalResponse = await fetch(`${legalServiceUrl}/api/v1/query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { "X-API-Key": apiKey } : {}),
      },
      body: JSON.stringify({
        question,
        matter_id: matterId ?? null,
        session_id: id,
        preferred_jurisdiction: jurisdiction,
        preferred_source_types: sourceTypes,
        intake_facts: intakeFacts ?? {},
        top_k: 8,
      }),
      cache: "no-store",
    });

    if (!legalResponse.ok) {
      const errorText = await legalResponse.text();
      console.error("legal-service error:", legalResponse.status, errorText);
      return Response.json({
        text: "Sorry, the legal service is unavailable right now.",
        citations: [],
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

    const data = (await legalResponse.json()) as LegalServiceResponse;
    logWidgetDebug({ sessionId: id, question, matterId, response: data });

    return Response.json({
      text: fallbackText(data),
      citations: (data.citations ?? []).map((c) => ({
        source_id: c.source_id ?? null,
        title: c.title ?? "",
        authority: c.authority ?? null,
        url: c.url ?? null,
        quote: c.quote_text ?? null,
        source_type: c.source_type ?? null,
        used_for: c.used_for ?? null,
      })),
      followUpQuestions: data.follow_up_questions ?? [],
      missingFacts: data.missing_facts ?? [],
      evidenceGaps: extractEvidenceGaps(data.retrieval_debug),
      escalate: Boolean(data.escalate),
      nextAction: normalizeNextAction(data.next_action),
      confidence: data.confidence ?? null,
      matterId: data.matter_id ?? matterId ?? null,
      conversationState: data.conversation_state ?? null,
      caseHypothesis: normalizeCaseHypothesis(data.case_hypothesis),
      factSlotStates: normalizeFactSlotStates(data.fact_slot_states),
      interactionPlan: normalizeInteractionPlan(data.interaction_plan),
      retrievalDebug: normalizeRetrievalDebug(data.retrieval_debug),
    });
  } catch (error) {
    console.error("widget-chat error:", error);
    if (error instanceof ChatbotError) {
      return error.toResponse();
    }

    return Response.json(
      {
        text: "Sorry, I could not generate a response right now.",
        citations: [],
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