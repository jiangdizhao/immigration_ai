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
});

type LegalCitation = {
  title?: string;
  authority?: string | null;
  section_ref?: string | null;
  url?: string | null;
  quote_text?: string | null;
};

type RetrievalDebug = {
  effective_question?: string;
  original_question?: string;
  contextualization?: {
    standalone_question?: string;
    used_history?: boolean;
    reason?: string;
  };
  sufficiency_gate?: {
    local_sufficient?: boolean;
    reason?: string | null;
    need_live_fetch?: boolean;
    preferred_domains?: string[];
    preferred_source_types?: string[];
    answerability?: {
      profile_name?: string | null;
      answer_mode?: string;
      required_facts_missing?: string[];
      required_source_classes_missing?: string[];
      source_classes_present?: string[];
    };
    live_trigger?: {
      should_live_fetch?: boolean;
      reasons?: string[];
      matched_condition_number?: string | null;
      source_classes_present?: string[];
      required_source_classes_missing?: string[];
    };
  };
  risk_flags?: {
    deadline_sensitive?: boolean;
    cancellation_related?: boolean;
    detention_related?: boolean;
    character_issue?: boolean;
    pic4020_issue?: boolean;
    review_related?: boolean;
  };
  initial_sufficiency_gate?: {
    local_sufficient?: boolean;
    reason?: string | null;
    need_live_fetch?: boolean;
  };
  live_fetch_used?: boolean;
  live_domains_used?: string[];
  live_result_count?: number;
  top_titles?: string[];
  source_type_counts?: Record<string, number>;
  authority_counts?: Record<string, number>;
  bucket_counts?: Record<string, number>;
  source_class_counts?: Record<string, number>;
  policy?: {
    answer_allowed?: boolean;
    escalate?: boolean;
    next_action?: string;
    confidence_cap?: string | null;
    reasons?: string[];
  };
};

type LegalServiceResponse = {
  answer?: string;
  citations?: LegalCitation[];
  follow_up_questions?: string[];
  missing_facts?: string[];
  escalate?: boolean;
  next_action?: string;
  confidence?: string;
  matter_id?: string;
  retrieval_debug?: RetrievalDebug;
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
  console.log("effectiveQuestion:", dbg.effective_question ?? params.question);
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
  console.log("missingRequiredSourceClasses:", dbg.sufficiency_gate?.answerability?.required_source_classes_missing ?? []);
  console.log("policy:", dbg.policy ?? {});
  console.log("liveTrigger:", dbg.sufficiency_gate?.live_trigger ?? null);
  console.log("riskFlags:", dbg.risk_flags ?? {});
  console.log("confidence:", params.response.confidence ?? null);
  console.log("nextAction:", params.response.next_action ?? null);
  console.log("escalate:", params.response.escalate ?? false);
  console.log("answerPreview:", (params.response.answer ?? "").slice(0, 300));
  console.log("=== end widget-chat debug ===\n");
}

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const { id, matterId, messages, selectedChatModel } = widgetRequestBodySchema.parse(json);

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
        escalate: false,
        nextAction: "ask_followup",
        matterId: matterId ?? null,
        debug: {
          sessionId: id,
          matterId: matterId ?? null,
          originalQuestion: null,
          effectiveQuestion: null,
          contextualized: null,
        },
      });
    }

    const legalServiceUrl = process.env.LEGAL_SERVICE_URL ?? "http://127.0.0.1:8000";
    const apiKey = process.env.LEGAL_SERVICE_API_KEY;
    const jurisdiction = process.env.LEGAL_SERVICE_JURISDICTION ?? "Cth";
    const sourceTypes = (process.env.LEGAL_SERVICE_SOURCE_TYPES ?? "guidance,legislation")
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
        intake_facts: {},
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
        escalate: false,
        nextAction: "ask_followup",
        matterId: matterId ?? null,
        debug: {
          sessionId: id,
          matterId: matterId ?? null,
          originalQuestion: question,
          effectiveQuestion: null,
          contextualized: null,
        },
      });
    }

    const data = (await legalResponse.json()) as LegalServiceResponse;
    logWidgetDebug({ sessionId: id, question, matterId, response: data });

    return Response.json({
      text: fallbackText(data),
      citations: (data.citations ?? []).map((c) => ({
        title: c.title ?? "",
        authority: c.authority ?? null,
        sectionRef: c.section_ref ?? null,
        url: c.url ?? null,
        quoteText: c.quote_text ?? null,
      })),
      followUpQuestions: data.follow_up_questions ?? [],
      missingFacts: data.missing_facts ?? [],
      escalate: Boolean(data.escalate),
      nextAction: data.next_action ?? "ask_followup",
      confidence: data.confidence ?? null,
      matterId: data.matter_id ?? matterId ?? null,
      debug: {
        sessionId: id,
        matterId: data.matter_id ?? matterId ?? null,
        originalQuestion: data.retrieval_debug?.original_question ?? question,
        effectiveQuestion: data.retrieval_debug?.effective_question ?? question,
        contextualized: data.retrieval_debug?.contextualization ?? null,
        sufficiencyGate: data.retrieval_debug?.sufficiency_gate ?? null,
        liveFetchUsed: data.retrieval_debug?.live_fetch_used ?? false,
        liveDomainsUsed: data.retrieval_debug?.live_domains_used ?? [],
        liveResultCount: data.retrieval_debug?.live_result_count ?? 0,
        topTitles: data.retrieval_debug?.top_titles ?? [],
      },
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
        escalate: false,
        nextAction: "ask_followup",
        matterId: null,
        debug: null,
      },
      { status: 200 }
    );
  }
}