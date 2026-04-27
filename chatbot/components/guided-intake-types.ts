export type ConfidenceLevel = "low" | "medium" | "high";

export type InputType =
  | "boolean"
  | "single_select"
  | "date"
  | "short_text"
  | "long_text"
  | "document";

export type InteractionMode =
  | "guided_intake"
  | "analysis_ready"
  | "answer"
  | "escalation";

export type NextAction =
  | "ask_followup"
  | "suggest_consultation"
  | "provide_answer"
  | "wait_for_user"
  | "none";

export interface CitationItem {
  source_id?: string | null;
  title?: string | null;
  quote?: string | null;
  used_for?: string | null;
  url?: string | null;
  source_type?: string | null;
  authority?: string | null;
}

export interface FactSlotState {
  key: string;
  label?: string | null;
  status?: string | null;
  value?: string | number | boolean | null;
  source?: string | null;
  required?: boolean;
  blocking?: boolean;
  why_needed?: string | null;
  input_type?: InputType | null;
  options?: string[] | null;
}

export interface CaseHypothesis {
  issue_type?: string | null;
  visa_type?: string | null;
  primary_operation_type?: string | null;
  candidate_operations?: Array<{
    operation_type: string;
    score?: number | null;
    reason?: string | null;
  }> | null;
  decisive_next_facts?: string[] | null;
}

export interface InteractionFactRequest {
  key: string;
  label: string;
  prompt?: string | null;
  why_needed?: string | null;
  required?: boolean;
  blocking?: boolean;
  input_type?: InputType | null;
  options?: string[] | null;
}

export interface InteractionPlan {
  mode?: InteractionMode | null;
  answer_mode?: string | null;
  next_action?: NextAction | null;
  primary_prompt?: string | null;
  requested_facts?: InteractionFactRequest[] | null;
  missing_required_facts?: string[] | null;
  warnings?: string[] | null;
  known_facts_summary?: Record<string, string | number | boolean | null> | null;
  progress?: {
    completed?: number;
    total?: number;
    ratio?: number;
  } | null;
}

export interface RetrievalDebug {
  effective_question?: string | null;
  local_sufficient?: boolean | null;
  need_live_fetch?: boolean | null;
  live_fetch_used?: boolean | null;
  top_titles?: string[] | null;
}

export interface WidgetAssistantMessage {
  id: string;
  role: "assistant";
  text: string;
  isStreaming?: boolean;
  citations?: CitationItem[];
  followUpQuestions?: string[];
  missingFacts?: string[];
  evidenceGaps?: string[];
  confidence?: ConfidenceLevel | null;
  escalate?: boolean;
  nextAction?: NextAction | null;
  matterId?: string | null;
  conversationState?: string | null;
  caseHypothesis?: CaseHypothesis | null;
  factSlotStates?: FactSlotState[] | null;
  interactionPlan?: InteractionPlan | null;
  retrievalDebug?: RetrievalDebug | null;
}

export interface WidgetUserMessage {
  id: string;
  role: "user";
  text: string;
}

export type WidgetMessage = WidgetAssistantMessage | WidgetUserMessage;

export interface WidgetRouteResponse {
  text: string;
  citations?: CitationItem[];
  followUpQuestions?: string[];
  missingFacts?: string[];
  evidenceGaps?: string[];
  confidence?: ConfidenceLevel | null;
  escalate?: boolean;
  nextAction?: NextAction | null;
  matterId?: string | null;
  conversationState?: string | null;
  caseHypothesis?: CaseHypothesis | null;
  factSlotStates?: FactSlotState[] | null;
  interactionPlan?: InteractionPlan | null;
  retrievalDebug?: RetrievalDebug | null;
}

export type IntakeFacts = Record<string, string | number | boolean | null>;