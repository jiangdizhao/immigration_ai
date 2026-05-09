from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, timedelta
import re
from typing import Any, Literal

from app.schemas.state import ContextualizationResult, FactExtractionResult, IssueAndOperation, MatterState

TurnType = Literal[
    "greeting",
    "booking_request",
    "guided_intake_update",
    "simple_definition_query",
    "basic_requirements_query",
    "document_checklist_query",
    "complex_case_question",
    "high_risk_escalation",
]

DisplayMode = Literal[
    "direct_short",
    "general_with_warning",
    "answer_then_ask",
    "ask_one_question",
    "escalate_with_brief_reason",
    "booking_handoff",
]


@dataclass(slots=True)
class RuleExtractionResult:
    facts: dict[str, Any] = field(default_factory=dict)
    fact_confidence: dict[str, str] = field(default_factory=dict)
    issue_type: str | None = None
    operation_type: str | None = None
    visa_type: str | None = None
    jurisdiction: str | None = None
    intents: set[str] = field(default_factory=set)
    evidence: dict[str, Any] = field(default_factory=dict)

    def to_fact_result(self) -> FactExtractionResult:
        return FactExtractionResult(new_facts=dict(self.facts), fact_confidence=dict(self.fact_confidence))

    def to_issue_operation(self, fallback: IssueAndOperation | None = None) -> IssueAndOperation:
        fallback = fallback or IssueAndOperation()
        return IssueAndOperation(
            issue_type=self.issue_type or fallback.issue_type,
            operation_type=self.operation_type or fallback.operation_type,
            visa_type=self.visa_type or fallback.visa_type,
            jurisdiction=self.jurisdiction or fallback.jurisdiction,
        )


@dataclass(slots=True)
class PreLLMTurnAnalysis:
    turn_type: TurnType = "complex_case_question"
    display_mode: DisplayMode = "answer_then_ask"
    extraction: RuleExtractionResult = field(default_factory=RuleExtractionResult)
    can_skip_contextualization_llm: bool = False
    can_skip_classification_llm: bool = False
    can_skip_fact_extraction_llm: bool = False
    can_skip_answer_llm: bool = False
    retrieval_needed: bool = True
    live_fetch_allowed: bool = True
    reasons: list[str] = field(default_factory=list)

    @property
    def no_llm_needed(self) -> bool:
        return (
            self.can_skip_contextualization_llm
            and self.can_skip_classification_llm
            and self.can_skip_fact_extraction_llm
            and self.can_skip_answer_llm
        )


class RuleBasedExtractionService:
    """
    Deterministic, domain-specific extraction before any LLM call.

    This is intentionally narrow. It is not a legal reasoning engine; it only extracts
    explicit facts and strong intent cues that are cheap and reliable to identify.
    """

    VISA_PATTERNS: dict[str, re.Pattern[str]] = {
        "500": re.compile(r"\b(?:subclass\s*)?500\b|\bstudent\s+visa\b", re.I),
        "485": re.compile(r"\b(?:subclass\s*)?485\b|\btemporary\s+graduate\b|\bgraduate\s+visa\b", re.I),
        "010": re.compile(r"\b(?:subclass\s*)?010\b|\bbva\b|\bbridging\s+visa\s+a\b", re.I),
        "020": re.compile(r"\b(?:subclass\s*)?020\b|\bbvb\b|\bbridging\s+visa\s+b\b", re.I),
        "030": re.compile(r"\b(?:subclass\s*)?030\b|\bbvc\b|\bbridging\s+visa\s+c\b", re.I),
        "050": re.compile(r"\b(?:subclass\s*)?050\b|\bbve\b|\bbridging\s+visa\s+e\b", re.I),
    }

    CONDITION_PATTERN = re.compile(r"\b(?:visa\s+)?condition\s*(\d{4})\b|\b(\d{4})\s*(?:visa\s*)?condition\b", re.I)

    def extract(self, *, text: str, current_state: MatterState | None = None, intake_facts: dict[str, Any] | None = None) -> RuleExtractionResult:
        current_state = current_state or MatterState()
        intake_facts = intake_facts or {}
        q = (text or "").strip()
        lowered = q.lower()
        result = RuleExtractionResult(jurisdiction="Cth")

        self._extract_visa_and_issue(lowered, result)
        self._extract_operation(lowered, result, current_state=current_state)
        self._extract_location(lowered, result)
        self._extract_documents(lowered, result)
        self._extract_dates(lowered, result)
        self._extract_condition(lowered, result)
        self._extract_current_visa(lowered, result)
        self._extract_refusal_reason(lowered, result)
        self._extract_booking_and_smalltalk(lowered, result)
        self._extract_structured_key_value_lines(q, result)

        # Explicit structured frontend facts are trusted more than free-text extraction.
        for key, value in intake_facts.items():
            if value is None or value == "":
                continue
            result.facts[key] = value
            result.fact_confidence[key] = "high"

        if result.issue_type:
            result.facts.setdefault("issue_type", result.issue_type)
            result.fact_confidence.setdefault("issue_type", "high")
        if result.operation_type:
            result.facts.setdefault("operation_type", result.operation_type)
            result.fact_confidence.setdefault("operation_type", "high")
        if result.visa_type:
            result.facts.setdefault("visa_type", result.visa_type)
            result.fact_confidence.setdefault("visa_type", "high")

        return result

    def _extract_visa_and_issue(self, lowered: str, result: RuleExtractionResult) -> None:
        for subclass, pattern in self.VISA_PATTERNS.items():
            if not pattern.search(lowered):
                continue
            result.facts["visa_subclass"] = subclass
            result.fact_confidence["visa_subclass"] = "high"
            if subclass == "500":
                result.visa_type = "student"
                result.issue_type = result.issue_type or "student_visa"
            elif subclass == "485":
                result.visa_type = "temporary_graduate"
                result.issue_type = result.issue_type or "temporary_graduate_visa"
            elif subclass in {"010", "020", "030", "050"}:
                result.visa_type = "bridging"
                result.issue_type = result.issue_type or "bridging_visa"
                result.facts.setdefault("current_visa", {"010": "BVA", "020": "BVB", "030": "BVC", "050": "BVE"}[subclass])
                result.fact_confidence.setdefault("current_visa", "high")
            break

        if "student visa" in lowered and not result.visa_type:
            result.visa_type = "student"
            result.issue_type = result.issue_type or "student_visa"
        if "temporary graduate" in lowered and not result.visa_type:
            result.visa_type = "temporary_graduate"
            result.issue_type = result.issue_type or "temporary_graduate_visa"
        if "bridging visa" in lowered and not result.visa_type:
            result.visa_type = "bridging"
            result.issue_type = result.issue_type or "bridging_visa"

        if re.search(r"\brefus(?:ed|al|e)\b", lowered):
            result.intents.add("visa_refusal")
            if result.issue_type is None:
                result.issue_type = "visa_refusal"
            result.facts["has_refusal"] = True
            result.fact_confidence["has_refusal"] = "high"
        if re.search(r"\bcancel(?:led|lation|ling)?\b", lowered):
            result.intents.add("visa_cancellation")
            result.issue_type = "visa_cancellation"
            result.facts["has_cancellation"] = True
            result.fact_confidence["has_cancellation"] = "high"
        if "4020" in lowered or "misleading" in lowered or "false information" in lowered or "incorrect information" in lowered:
            result.intents.add("pic4020")
            result.issue_type = "pic4020_issue"

    def _extract_operation(self, lowered: str, result: RuleExtractionResult, *, current_state: MatterState) -> None:
        if re.search(r"\b(review|appeal|tribunal|art)\b", lowered):
            result.intents.add("review")
            result.facts["seeking_review"] = True
            result.fact_confidence["seeking_review"] = "high"
            if re.search(r"\b(deadline|time\s+limit|how\s+many\s+days|last\s+day|still|late)\b", lowered):
                result.operation_type = "review_deadline"
            else:
                result.operation_type = "review_rights"

        if ("bridging" in lowered or current_state.visa_type == "bridging") and re.search(r"\b(travel|leave|return|come\s+back|re-enter|reenter)\b", lowered):
            result.operation_type = "bridging_travel"
            result.issue_type = result.issue_type or "bridging_visa"
            result.visa_type = result.visa_type or "bridging"

        if result.operation_type is None and re.search(r"\b(document|documents|checklist|prepare|evidence|upload)\b", lowered):
            result.operation_type = "document_checklist"

        if result.operation_type is None and ("485" in lowered or "temporary graduate" in lowered) and re.search(r"\b(eligible|eligibility|requirement|requirements|can\s+i\s+apply|apply)\b", lowered):
            result.operation_type = "485_eligibility_overview"

        if result.operation_type is None and "4020" in lowered:
            result.operation_type = "pic4020_risk"

        if result.operation_type is None and "refus" in lowered and ("student" in lowered or result.visa_type == "student" or current_state.visa_type == "student"):
            result.operation_type = "student_refusal_next_steps"

    def _extract_location(self, lowered: str, result: RuleExtractionResult) -> None:
        if re.search(r"\b(in\s+australia|inside\s+australia|onshore|currently\s+in\s+(?:sydney|melbourne|brisbane|perth|adelaide|canberra|darwin|hobart))\b", lowered):
            result.facts["in_australia"] = True
            result.facts["onshore_offshore"] = "in_australia"
            result.fact_confidence["in_australia"] = "high"
            result.fact_confidence["onshore_offshore"] = "high"
        if re.search(r"\b(outside\s+australia|offshore|overseas)\b", lowered):
            result.facts["in_australia"] = False
            result.facts["onshore_offshore"] = "outside_australia"
            result.fact_confidence["in_australia"] = "high"
            result.fact_confidence["onshore_offshore"] = "high"

    def _extract_documents(self, lowered: str, result: RuleExtractionResult) -> None:
        if not ("refusal notice" in lowered or "decision letter" in lowered):
            return
        if re.search(r"\b(do\s+not|don't|dont|haven't|have\s+not|no)\b.{0,50}\b(refusal\s+notice|decision\s+letter)\b", lowered):
            result.facts["refusal_notice_available"] = False
            result.fact_confidence["refusal_notice_available"] = "high"
        elif re.search(r"\b(have|got|received|uploaded|with\s+me)\b.{0,50}\b(refusal\s+notice|decision\s+letter)\b", lowered):
            result.facts["refusal_notice_available"] = True
            result.fact_confidence["refusal_notice_available"] = "high"
        elif "not sure" in lowered or "unsure" in lowered or "don't know" in lowered or "dont know" in lowered:
            result.facts["refusal_notice_available"] = "not_sure"
            result.fact_confidence["refusal_notice_available"] = "medium"

    def _extract_dates(self, lowered: str, result: RuleExtractionResult) -> None:
        parsed = self._extract_date(lowered)
        if not parsed:
            return
        if "notif" in lowered or "received" in lowered or "got" in lowered:
            result.facts["notification_date"] = parsed
            result.fact_confidence["notification_date"] = "medium" if result.evidence.get("relative_date") else "high"
            if result.evidence.get("relative_date"):
                result.facts["notification_date_needs_confirmation"] = True
        elif "decision" in lowered:
            result.facts["decision_date"] = parsed
            result.fact_confidence["decision_date"] = "medium"
        elif "refus" in lowered:
            result.facts["refusal_date"] = parsed
            result.fact_confidence["refusal_date"] = "medium"

    def _extract_condition(self, lowered: str, result: RuleExtractionResult) -> None:
        match = self.CONDITION_PATTERN.search(lowered)
        if not match:
            # User often asks "what is 8501" without the word condition.
            if re.search(r"\bwhat\s+(?:is|does)\s+\d{4}\b", lowered):
                m = re.search(r"\b(\d{4})\b", lowered)
                if not m:
                    return
                number = m.group(1)
            else:
                return
        else:
            number = match.group(1) or match.group(2)
        result.facts["visa_condition_number"] = number
        result.fact_confidence["visa_condition_number"] = "high"
        result.issue_type = "visa_conditions"
        result.operation_type = "visa_condition_explainer"
        result.intents.add("visa_condition_explainer")

    def _extract_current_visa(self, lowered: str, result: RuleExtractionResult) -> None:
        if "bridging visa" in lowered and "current_visa" not in result.facts:
            result.facts["current_visa"] = "bridging_visa"
            result.fact_confidence["current_visa"] = "medium"
        if re.search(r"\b(leave|travel|return|come\s+back|re-enter|reenter)\b", lowered):
            result.facts["travel_need"] = "international_travel"
            result.fact_confidence["travel_need"] = "medium"

    def _extract_refusal_reason(self, lowered: str, result: RuleExtractionResult) -> None:
        mapping = {
            "genuine student": "genuine_student",
            "gs requirement": "genuine_student",
            "financial": "financial",
            "english": "english",
            "identity": "identity",
            "incorrect information": "incorrect_information",
            "misleading": "incorrect_information",
            "4020": "pic4020",
        }
        for needle, value in mapping.items():
            if needle in lowered:
                result.facts["refusal_reason_hint"] = value
                result.fact_confidence["refusal_reason_hint"] = "medium"
                return

    def _extract_booking_and_smalltalk(self, lowered: str, result: RuleExtractionResult) -> None:
        if lowered.strip() in {"hi", "hello", "hey", "good morning", "good afternoon", "good evening"}:
            result.intents.add("greeting")
        if re.search(r"\b(book|booking|appointment|consultation|lawyer|agent)\b", lowered) and re.search(r"\b(book|schedule|arrange|appointment|consultation)\b", lowered):
            result.intents.add("booking_request")


    def _extract_structured_key_value_lines(self, text: str, result: RuleExtractionResult) -> None:
        # The frontend sends guided-intake submissions as lines like:
        # Guided intake update:
        # refusal_notice_available: False
        # notification_date: 2026-04-20
        for raw_line in (text or "").splitlines():
            if ":" not in raw_line:
                continue
            key, raw_value = raw_line.split(":", 1)
            key = key.strip()
            if not re.fullmatch(r"[a-zA-Z_][a-zA-Z0-9_]*", key):
                continue
            value_text = raw_value.strip()
            if value_text == "":
                continue
            lowered_value = value_text.lower()
            if lowered_value in {"true", "yes", "available"}:
                value: Any = True
            elif lowered_value in {"false", "no", "unavailable"}:
                value = False
            elif lowered_value in {"not_sure", "not sure", "unknown", "unsure"}:
                value = "not_sure"
            else:
                value = value_text
            result.facts[key] = value
            result.fact_confidence[key] = "high"

    def _extract_date(self, lowered: str) -> str | None:
        if not lowered:
            return None
        today = date.today()
        relative = {
            "today": today,
            "yesterday": today - timedelta(days=1),
            "tomorrow": today + timedelta(days=1),
        }
        for key, value in relative.items():
            if re.search(rf"\b{key}\b", lowered):
                return value.isoformat()
        m = re.search(r"\b(\d{4}-\d{2}-\d{2})\b", lowered)
        if m:
            return m.group(1)
        m = re.search(r"\b(\d{1,2})/(\d{1,2})/(\d{4})\b", lowered)
        if m:
            day, month, year = m.groups()
            return f"{int(year):04d}-{int(month):02d}-{int(day):02d}"
        m = re.search(r"\b(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})\b", lowered, flags=re.I)
        if m:
            day, month_name, year = m.groups()
            months = {
                "january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6,
                "july": 7, "august": 8, "september": 9, "october": 10, "november": 11, "december": 12,
            }
            return f"{int(year):04d}-{months[month_name.lower()]:02d}-{int(day):02d}"
        return None


class PreLLMRouterService:
    """
    Cheap turn router. It decides which parts of the pipeline can safely avoid LLM calls.
    The answerability and legal safety gates still run downstream.
    """

    SIMPLE_MAX_WORDS = 18

    def __init__(self, extractor: RuleBasedExtractionService | None = None) -> None:
        self.extractor = extractor or RuleBasedExtractionService()

    def analyze(
        self,
        *,
        question: str,
        current_state: MatterState,
        intake_facts: dict[str, Any] | None = None,
        conversation_history: list[dict[str, Any]] | None = None,
    ) -> PreLLMTurnAnalysis:
        extraction = self.extractor.extract(text=question, current_state=current_state, intake_facts=intake_facts)
        lowered = (question or "").strip().lower()
        words = lowered.split()
        reasons: list[str] = []

        if "greeting" in extraction.intents:
            return PreLLMTurnAnalysis(
                turn_type="greeting",
                display_mode="direct_short",
                extraction=extraction,
                can_skip_contextualization_llm=True,
                can_skip_classification_llm=True,
                can_skip_fact_extraction_llm=True,
                can_skip_answer_llm=True,
                retrieval_needed=False,
                live_fetch_allowed=False,
                reasons=["smalltalk_greeting"],
            )

        if "booking_request" in extraction.intents and len(words) <= 24:
            return PreLLMTurnAnalysis(
                turn_type="booking_request",
                display_mode="booking_handoff",
                extraction=extraction,
                can_skip_contextualization_llm=True,
                can_skip_classification_llm=True,
                can_skip_fact_extraction_llm=True,
                can_skip_answer_llm=True,
                retrieval_needed=False,
                live_fetch_allowed=False,
                reasons=["booking_request"],
            )

        if lowered.startswith("guided intake update"):
            return PreLLMTurnAnalysis(
                turn_type="guided_intake_update",
                display_mode="answer_then_ask",
                extraction=extraction,
                can_skip_contextualization_llm=True,
                can_skip_classification_llm=True,
                can_skip_fact_extraction_llm=True,
                can_skip_answer_llm=True,
                retrieval_needed=False,
                live_fetch_allowed=False,
                reasons=["structured_guided_intake_update"],
            )

        high_risk = any(term in lowered for term in ["detention", "section 501", "criminal", "cancelled", "cancellation", "4020"])
        if high_risk:
            reasons.append("high_risk_cue")
            return PreLLMTurnAnalysis(
                turn_type="high_risk_escalation",
                display_mode="escalate_with_brief_reason",
                extraction=extraction,
                can_skip_contextualization_llm=len(words) <= 30,
                can_skip_classification_llm=True,
                can_skip_fact_extraction_llm=True,
                can_skip_answer_llm=False,
                retrieval_needed=True,
                live_fetch_allowed=True,
                reasons=reasons,
            )

        if extraction.operation_type == "visa_condition_explainer" and len(words) <= self.SIMPLE_MAX_WORDS:
            return PreLLMTurnAnalysis(
                turn_type="simple_definition_query",
                display_mode="direct_short",
                extraction=extraction,
                can_skip_contextualization_llm=True,
                can_skip_classification_llm=True,
                can_skip_fact_extraction_llm=True,
                can_skip_answer_llm=True,
                retrieval_needed=True,
                live_fetch_allowed=True,
                reasons=["simple_condition_definition"],
            )

        if extraction.operation_type == "document_checklist" and len(words) <= 28:
            return PreLLMTurnAnalysis(
                turn_type="document_checklist_query",
                display_mode="answer_then_ask",
                extraction=extraction,
                can_skip_contextualization_llm=True,
                can_skip_classification_llm=True,
                can_skip_fact_extraction_llm=True,
                can_skip_answer_llm=False,
                retrieval_needed=True,
                live_fetch_allowed=True,
                reasons=["document_checklist_fast_classification"],
            )

        if extraction.operation_type == "485_eligibility_overview" and len(words) <= 24:
            return PreLLMTurnAnalysis(
                turn_type="basic_requirements_query",
                display_mode="general_with_warning",
                extraction=extraction,
                can_skip_contextualization_llm=True,
                can_skip_classification_llm=True,
                can_skip_fact_extraction_llm=True,
                can_skip_answer_llm=False,
                retrieval_needed=True,
                live_fetch_allowed=True,
                reasons=["basic_requirements_fast_classification"],
            )

        # Default: still use the deterministic extraction as hints, but allow LLM refinement.
        return PreLLMTurnAnalysis(
            turn_type="complex_case_question",
            display_mode="answer_then_ask",
            extraction=extraction,
            can_skip_contextualization_llm=self._can_skip_contextualization(lowered, conversation_history),
            can_skip_classification_llm=bool(extraction.issue_type or extraction.operation_type or extraction.visa_type) and len(words) <= 35,
            can_skip_fact_extraction_llm=False,
            can_skip_answer_llm=False,
            retrieval_needed=True,
            live_fetch_allowed=True,
            reasons=["default_complex_or_ambiguous"],
        )

    def _can_skip_contextualization(self, lowered: str, conversation_history: list[dict[str, Any]] | None) -> bool:
        if not conversation_history:
            return True
        reference_terms = ["it", "that", "this", "still", "above", "same", "the refusal", "the visa", "deadline"]
        return not any(term in lowered for term in reference_terms)
