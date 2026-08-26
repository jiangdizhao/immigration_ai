from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
import hashlib
import json
import os
import re
import time
from typing import Any, Literal

from openai import OpenAI
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.models import Matter, SourceChunk
from app.schemas.query import QueryRequest, QueryResponse
from app.schemas.source import CitationOut
from app.schemas.state import LiveSourceChunk
from app.services.live_retrieval_service import LiveRetrievalService
from app.services.retrieval_service import RetrievalService
from app.services.review_trace_service import ReviewTraceService

ResponseLanguage = Literal["en", "zh"]
Confidence = Literal["low", "medium", "high"]


class V2ScopeResult(BaseModel):
    in_scope: bool
    scope: str = "unknown"
    response_language: ResponseLanguage = "en"
    reason: str | None = None
    refusal_text: str | None = None
    matched_terms: list[str] = Field(default_factory=list)


class V2LawyerLesson(BaseModel):
    lesson_id: str
    trigger: str
    instruction: str
    must_include: list[str] = Field(default_factory=list)
    must_not_include: list[str] = Field(default_factory=list)
    source: Literal["seed"] = "seed"
    score: float = 0.0


class V2Context(BaseModel):
    matter_id: str | None = None
    frontend_chat_id: str | None = None
    session_id: str | None = None
    previous_topic: str | None = None
    recent_history: list[dict[str, Any]] = Field(default_factory=list)
    known_facts: dict[str, Any] = Field(default_factory=dict)
    topic_carryover_allowed: bool = True
    topic_carryover_reason: str | None = None


class V2KnownFact(BaseModel):
    key: str
    value: str | int | float | bool | None = None
    source: Literal["latest_user_message", "conversation_history", "intake_facts", "system_inferred", "unknown"] = "unknown"
    confidence: Confidence = "medium"


class V2LegalClaim(BaseModel):
    claim_id: str
    claim: str
    topic: str | None = None
    subclass: str | None = None
    stream: str | None = None
    importance: Literal["decisive", "supporting", "background"] = "decisive"
    source_priority: list[Literal["schedule_1", "schedule_2", "home_affairs", "legislation", "policy", "case_law", "local_guidance"]] = Field(default_factory=list)


class V2DecisiveCondition(BaseModel):
    condition_id: str
    condition: str
    known_status: Literal["known", "unknown", "contradicted", "not_required"] = "unknown"
    known_value: str | None = None
    required_for: Literal["general_rule_answer", "case_specific_preliminary", "case_specific_conclusion", "deadline_advice"] = "case_specific_conclusion"
    effect_if_missing: str | None = None


class V2RiskFlags(BaseModel):
    deadline_sensitive: bool = False
    possible_unlawful_status: bool = False
    refusal_or_review: bool = False
    cancellation_or_noicc: bool = False
    character_or_integrity: bool = False
    requires_lawyer_handoff: bool = False
    evidence: list[str] = Field(default_factory=list)

    def any_high_risk(self) -> bool:
        return any([
            self.deadline_sensitive,
            self.possible_unlawful_status,
            self.refusal_or_review,
            self.cancellation_or_noicc,
            self.character_or_integrity,
            self.requires_lawyer_handoff,
        ])


class V2TopicControl(BaseModel):
    explicit_topic: str | None = None
    previous_topic_used: bool = False
    topic_switch_detected: bool = False
    must_not_use_previous_topics: list[str] = Field(default_factory=list)


class V2AnswerDraft(BaseModel):
    direct_answer: str
    explanation: str | None = None
    practical_meaning: str | None = None
    caution: str | None = None
    one_next_question: str | None = None


class V2AnswerContract(BaseModel):
    response_language: ResponseLanguage = "en"
    answer_draft: V2AnswerDraft
    answer_scope: Literal["general_rule", "case_specific_preliminary", "case_specific_conclusion", "cannot_answer"] = "general_rule"
    case_specific_yes_no_given: bool = False
    legal_claims_to_verify: list[V2LegalClaim] = Field(default_factory=list)
    decisive_conditions: list[V2DecisiveCondition] = Field(default_factory=list)
    known_facts: list[V2KnownFact] = Field(default_factory=list)
    risk_flags: V2RiskFlags = Field(default_factory=V2RiskFlags)
    topic_control: V2TopicControl = Field(default_factory=V2TopicControl)
    confidence_before_verification: Confidence = "medium"
    raw_model_output: dict[str, Any] = Field(default_factory=dict)


class V2SourceSupport(BaseModel):
    title: str
    authority: str
    source_type: str
    url: str | None = None
    section_ref: str | None = None
    quote_or_summary: str | None = None
    source_id: str | None = None
    chunk_id: str | None = None


class V2ClaimVerdict(BaseModel):
    claim_id: str
    verdict: Literal["supported", "partially_supported", "contradicted", "not_found"] = "not_found"
    confidence: Confidence = "low"
    supporting_sources: list[V2SourceSupport] = Field(default_factory=list)
    required_correction: str | None = None


class V2ConditionVerdict(BaseModel):
    condition_id: str
    blocks_general_rule_answer: bool = False
    blocks_case_specific_conclusion: bool = True
    required_next_question: str | None = None
    explanation: str | None = None


class V2VerificationResult(BaseModel):
    claim_verdicts: list[V2ClaimVerdict] = Field(default_factory=list)
    condition_verdicts: list[V2ConditionVerdict] = Field(default_factory=list)
    wrong_topic_or_frame_detected: bool = False
    missing_decisive_keywords: list[str] = Field(default_factory=list)
    overall_verdict: Literal["pass", "repair", "ask_decisive_question", "escalate", "cannot_verify"] = "cannot_verify"
    final_confidence: Confidence = "low"
    coverage_report: dict[str, Any] = Field(default_factory=dict)
    raw_model_output: dict[str, Any] = Field(default_factory=dict)


class V2GuardResult(BaseModel):
    action: Literal["pass", "repair", "ask_decisive_question", "escalate"] = "pass"
    reasons: list[str] = Field(default_factory=list)
    required_next_question: str | None = None
    blocked_case_specific_conclusion: bool = False


class V2RenderedAnswer(BaseModel):
    answer: str
    confidence: Confidence = "medium"
    next_action: Literal["answer", "ask_followup", "suggest_consultation"] = "answer"
    escalate: bool = False
    follow_up_questions: list[str] = Field(default_factory=list)
    missing_facts: list[str] = Field(default_factory=list)
    user_display_mode: Literal["direct_short", "general_with_warning", "answer_then_ask", "ask_one_question", "escalate_with_brief_reason", "booking_handoff"] | None = "direct_short"
    issue_type: str | None = "immigration_law"
    compact_sources: list[str] = Field(default_factory=list)


def _extract_json_object(text: str) -> dict[str, Any] | None:
    if not text:
        return None
    stripped = text.strip()
    stripped = re.sub(r"^```(?:json)?", "", stripped, flags=re.I).strip()
    stripped = re.sub(r"```$", "", stripped).strip()
    try:
        parsed = json.loads(stripped)
        return parsed if isinstance(parsed, dict) else None
    except Exception:
        pass
    start = stripped.find("{")
    if start < 0:
        return None
    depth = 0
    in_string = False
    escape = False
    for idx in range(start, len(stripped)):
        ch = stripped[idx]
        if in_string:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_string = False
            continue
        if ch == '"':
            in_string = True
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                try:
                    parsed = json.loads(stripped[start : idx + 1])
                    return parsed if isinstance(parsed, dict) else None
                except Exception:
                    return None
    return None


class QueryServiceV2:
    """Opt-in V2: answer first, verify claims/conditions, repair only when needed."""

    LEGAL_TERMS = {
        "visa", "subclass", "immigration", "migration", "home affairs", "sponsor", "sponsorship", "partner visa", "parent visa", "student visa", "temporary graduate", "bridging visa", "bva", "bvb", "art", "aat", "review", "refusal", "refused", "cancellation", "noicc", "condition", "8501", "188", "188a", "485", "500", "820", "801", "309", "100", "870", "103", "143", "864", "884", "lawyer", "legal", "appointment", "consultation", "澳洲签证", "澳洲簽證", "签证", "簽證", "移民", "移民局", "内政部", "內政部", "担保", "擔保", "拒签", "拒簽", "复审", "復審", "上诉", "上訴", "取消签证", "取消簽證", "过桥签", "過橋簽", "学生签", "學生簽", "配偶签", "配偶簽", "父母签", "父母簽", "律师", "律師", "法律", "预约", "預約",
    }
    GREETINGS = {"hi", "hello", "hey", "你好", "您好"}
    # V2 no longer refuses ordinary non-law questions. Only politically sensitive
    # / Great-Firewall-risk topics are refused early. Weather, stocks, movies,
    # programming, recipes, and similar general topics are allowed and handled by
    # a lightweight general-answer path rather than the legal verifier.
    DEFAULT_POLITICALLY_SENSITIVE_TERMS = {
        "politics", "political", "election", "president", "prime minister",
        "war", "invasion", "sanction", "communist party", "ccp",
        "xi jinping", "mao zedong", "tiananmen", "falun gong",
        "taiwan independence", "hong kong protest", "xinjiang", "uyghur", "tibet",
        "共产党", "共產黨", "习近平", "習近平", "毛泽东", "毛澤東",
        "天安门", "天安門", "六四", "法轮功", "法輪功", "台独", "台獨",
        "香港抗议", "香港抗議", "新疆", "维吾尔", "維吾爾", "西藏",
        "政治", "战争", "戰爭", "制裁",
    }
    BANNED_PUBLIC = [r"A provisional, general response can be provided\.?", r"retrieved material", r"source classes?", r"evidence package", r"operation answerability", r"local corpus", r"context insufficient", r"fully grounded answer"]

    def __init__(self) -> None:
        self.settings = get_settings()
        self.retrieval_service = RetrievalService()
        self.live_retrieval_service = LiveRetrievalService()
        self.review_trace_service = ReviewTraceService()
        self.draft_model = os.getenv("V2_DRAFT_MODEL", os.getenv("GENERAL_QA_MODEL", os.getenv("REASONING_MODEL", "gpt-5.4-mini")))
        self.verifier_model = os.getenv("V2_VERIFIER_MODEL", self.draft_model)
        self.general_model = os.getenv("V2_GENERAL_MODEL", os.getenv("GENERAL_QA_MODEL", self.draft_model))
        self.sensitive_terms = self._configured_sensitive_terms()
        self.max_chunks = int(os.getenv("V2_VERIFIER_MAX_CHUNKS", "8"))
        self.online_enabled = os.getenv("V2_ONLINE_VERIFICATION_ENABLED", "false").lower() in {"1", "true", "yes"}
        self._client: OpenAI | None = None

    @property
    def client(self) -> OpenAI:
        if self._client is None:
            if not self.settings.openai_api_key:
                raise RuntimeError("OPENAI_API_KEY is missing from backend settings.")
            self._client = OpenAI(api_key=self.settings.openai_api_key, max_retries=int(os.getenv("OPENAI_MAX_RETRIES", "0")), timeout=float(os.getenv("OPENAI_TIMEOUT_SECONDS", "20")))
        return self._client

    def run(self, db: Session, payload: QueryRequest) -> QueryResponse:
        return self.handle_query(db, payload)

    def handle_query(self, db: Session, payload: QueryRequest) -> QueryResponse:
        started = time.perf_counter()
        timing: dict[str, Any] = {"engine": "v2_verified_answer"}
        matter = self._get_or_create_matter(db, payload)
        self._mark(timing, "matter_load", started)

        scope = self._scope(payload.question, payload.response_language)
        self._mark(timing, "scope_gate", started)
        if not scope.in_scope:
            rendered = V2RenderedAnswer(answer=scope.refusal_text or self._sensitive_refusal(scope.response_language), confidence="high", issue_type="politically_sensitive_refusal")
            response = self._to_response(payload, matter, rendered, [])
            response.response_language = scope.response_language
            self._update_matter(matter, payload, response, {"engine_version": "v2_verified_answer", "scope_gate": scope.model_dump(), "latest_topic": "politically_sensitive_refusal"})
            db.commit(); db.refresh(matter)
            self._trace(matter, payload, response, timing, {"trace_path": "v2_sensitive_scope_refusal", "scope_gate": scope.model_dump()})
            return response

        if scope.scope in {"general_allowed", "service_greeting"}:
            rendered, general_debug = self._general_response(payload, scope)
            response = self._to_response(payload, matter, rendered, [])
            response.response_language = scope.response_language
            response.retrieval_debug = {
                "engine_version": "v2_verified_answer",
                "scope_gate": scope.model_dump(),
                "general_response": general_debug,
                "stage_timing": timing,
            }
            self._update_matter(matter, payload, response, {"engine_version": "v2_verified_answer", "scope_gate": scope.model_dump(), "latest_topic": scope.scope})
            db.commit(); db.refresh(matter)
            self._trace(matter, payload, response, timing, {"trace_path": "v2_general_allowed", "scope_gate": scope.model_dump(), "general_response": general_debug})
            return response

        context = self._context(matter, payload)
        lessons = self._lessons(db, payload.question)
        self._mark(timing, "context_lessons", started)

        contract, draft_debug = self._draft_contract(payload, context, scope.response_language, lessons)
        self._mark(timing, "draft_contract", started)

        verification, citations, verifier_debug = self._verify(db, payload, contract)
        self._mark(timing, "targeted_verification", started)

        guard = self._guard(contract, verification)
        rendered = self._render(contract, verification, guard)
        self._mark(timing, "guard_render", started)

        response = self._to_response(payload, matter, rendered, citations)
        response.response_language = contract.response_language
        response.retrieval_debug = {
            "engine_version": "v2_verified_answer",
            "scope_gate": scope.model_dump(),
            "context": context.model_dump(),
            "lawyer_lessons": [lesson.model_dump() for lesson in lessons],
            "answer_contract": contract.model_dump(),
            "draft_debug": draft_debug,
            "verification": verification.model_dump(),
            "verifier_debug": verifier_debug,
            "condition_guard": guard.model_dump(),
            "stage_timing": timing,
        }
        response.legal_reasoning_trace = {
            "engine_version": "v2_verified_answer",
            "claims": [claim.model_dump() for claim in contract.legal_claims_to_verify],
            "claim_verdicts": [v.model_dump() for v in verification.claim_verdicts],
            "condition_verdicts": [v.model_dump() for v in verification.condition_verdicts],
            "coverage_report": verification.coverage_report,
        }
        self._update_matter(matter, payload, response, {
            "engine_version": "v2_verified_answer",
            "latest_topic": contract.topic_control.explicit_topic or context.previous_topic,
            "latest_answer_scope": contract.answer_scope,
            "v2_known_facts": [fact.model_dump() for fact in contract.known_facts],
            "v2_risk_flags": contract.risk_flags.model_dump(),
            "v2_topic_control": contract.topic_control.model_dump(),
        })
        db.commit(); db.refresh(matter)
        self._trace(matter, payload, response, timing, {"trace_path": "v2_verified_answer", "answer_contract": contract.model_dump(), "verification": verification.model_dump(), "condition_guard": guard.model_dump()})
        return response

    # ---------- scope / context / lessons ----------
    def _scope(self, question: str, response_language: str | None) -> V2ScopeResult:
        lang = self._detect_lang(question, response_language)
        text = (question or "").strip()
        lowered = text.lower()
        sensitive = sorted(t for t in self.sensitive_terms if t.lower() in lowered or t in text)
        if sensitive:
            return V2ScopeResult(
                in_scope=False,
                scope="politically_sensitive_refusal",
                response_language=lang,
                reason="matched_politically_sensitive_terms",
                matched_terms=sensitive[:8],
                refusal_text=self._sensitive_refusal(lang),
            )
        legal = sorted(t for t in self.LEGAL_TERMS if t.lower() in lowered or t in text)
        greet = sorted(t for t in self.GREETINGS if t.lower() == lowered or t in text)
        if legal:
            return V2ScopeResult(in_scope=True, scope="australian_immigration_law", response_language=lang, reason="matched_legal_terms", matched_terms=legal[:8])
        if greet and len(text) <= 40:
            return V2ScopeResult(in_scope=True, scope="service_greeting", response_language=lang, reason="greeting_allowed", matched_terms=greet)
        return V2ScopeResult(in_scope=True, scope="general_allowed", response_language=lang, reason="general_non_sensitive_topic_allowed", matched_terms=[])

    def _general_response(self, payload: QueryRequest, scope: V2ScopeResult) -> tuple[V2RenderedAnswer, dict[str, Any]]:
        lang = scope.response_language
        if scope.scope == "service_greeting":
            text = (
                "你好，我可以协助澳洲移民法律、预约律师，也可以回答一般非政治敏感问题。你想咨询什么？"
                if lang == "zh"
                else "Hi — I can help with Australian immigration-law questions, lawyer appointments, and ordinary non-politically-sensitive general questions. What would you like to ask?"
            )
            return V2RenderedAnswer(answer=text, confidence="high", issue_type="general_allowed"), {"mode": "deterministic_greeting"}
        try:
            result = self.client.responses.create(
                model=self.general_model,
                input=[
                    {"role": "system", "content": self._general_prompt(lang)},
                    {"role": "user", "content": payload.question},
                ],
            )
            text = (result.output_text or "").strip()
            if not text:
                raise ValueError("empty general response")
            return V2RenderedAnswer(answer=self._clean(text), confidence="medium", issue_type="general_allowed"), {"mode": "general_llm", "model": self.general_model}
        except Exception as exc:
            fallback = (
                "这个问题可以讨论，但我现在无法生成可靠回复。你也可以继续咨询澳洲移民法律或预约律师相关问题。"
                if lang == "zh"
                else "This topic is allowed, but I could not generate a reliable response right now. You can also ask about Australian immigration law or lawyer appointments."
            )
            return V2RenderedAnswer(answer=fallback, confidence="low", issue_type="general_allowed"), {"mode": "general_fallback", "error": str(exc)[:500]}

    def _general_prompt(self, lang: str) -> str:
        language_rule = "Write in Simplified Chinese." if lang == "zh" else "Write in English."
        return (
            "You are a concise website assistant. The site mainly provides Australian immigration-law services, but ordinary non-politically-sensitive general questions are allowed. "
            "Answer the user's general question helpfully and briefly. Do not discuss politically sensitive topics, political figures, elections, wars, state ideology, or China-sensitive political issues. "
            "If the user asks for current weather, stock prices, exchange rates, or other live data and no live data is provided, say you do not have real-time data in this channel and give general guidance only. "
            "If the question is actually about Australian immigration law, answer briefly and suggest asking a more specific visa/legal question if needed. "
            + language_rule
        )

    def _context(self, matter: Matter, payload: QueryRequest) -> V2Context:
        meta = dict(matter.metadata_json or {})
        history = [x for x in (meta.get("conversation_history") or []) if isinstance(x, dict)][-4:]
        history = [{"role": x.get("role"), "content": str(x.get("content") or "")[:900], "next_action": x.get("next_action"), "confidence": x.get("confidence")} for x in history]
        facts: dict[str, Any] = {}
        for key in ("carried_intake_facts", "intake_facts"):
            if isinstance(meta.get(key), dict):
                facts.update(meta[key])
        facts.update(payload.intake_facts or {})
        previous_topic = meta.get("latest_topic") or meta.get("operation_type") or meta.get("issue_type") or meta.get("visa_type")
        latest_topic = self._explicit_topic(payload.question)
        carry = not (latest_topic and previous_topic and latest_topic not in str(previous_topic).lower())
        reason = "no_explicit_topic_switch_detected" if carry else f"latest topic {latest_topic} differs from previous {previous_topic}"
        return V2Context(matter_id=matter.id, frontend_chat_id=payload.frontend_chat_id or matter.frontend_chat_id, session_id=payload.session_id or matter.session_id, previous_topic=str(previous_topic) if previous_topic else None, recent_history=history, known_facts=facts, topic_carryover_allowed=carry, topic_carryover_reason=reason)

    def _lessons(self, db: Session, question: str) -> list[V2LawyerLesson]:
        seed = [
            V2LawyerLesson(lesson_id="direct_answer_first", trigger="all legal questions", instruction="Start with the direct answer. Put caveats after the answer. Never start with 'A provisional, general response can be provided'.", must_not_include=["A provisional, general response can be provided"]),
            V2LawyerLesson(lesson_id="parent_sponsor_settled_resident", trigger="parent visa sponsor child sponsor requirement", instruction="For parent visa child-sponsor requirements, normally check and mention that the sponsor must be settled and resident in Australia, in addition to status/age/relationship requirements.", must_include=["settled", "resident in Australia"], must_not_include=["subclass 820"]),
            V2LawyerLesson(lesson_id="avoid_wrong_frame_carryover", trigger="topic switch subclass parent partner visa", instruction="If the latest question explicitly names a new visa subclass/topic, do not carry over the previous visa frame unless the user says it is the same matter."),
            V2LawyerLesson(lesson_id="general_rule_vs_personal_eligibility", trigger="can I apply eligible need valid visa extension", instruction="Distinguish a general legal rule from a personal eligibility conclusion. Answer the general rule first, but do not give a personal yes/no unless decisive facts are known."),
        ]
        terms = self._terms(question)
        scored = []
        for lesson in seed:
            hay = " ".join([lesson.trigger, lesson.instruction, *lesson.must_include, *lesson.must_not_include]).lower()
            score = sum(1 for term in terms if term in hay)
            if lesson.lesson_id == "direct_answer_first": score += 0.5
            if score > 0: scored.append(lesson.model_copy(update={"score": float(score)}))
        return sorted(scored, key=lambda x: x.score, reverse=True)[:3]

    # ---------- draft / verify / guard / render ----------
    def _draft_contract(self, payload: QueryRequest, context: V2Context, language: str, lessons: list[V2LawyerLesson]) -> tuple[V2AnswerContract, dict[str, Any]]:
        data = {"latest_user_question": payload.question, "response_language_hint": language, "answer_preference": payload.answer_preference, "intake_facts": payload.intake_facts or {}, "minimal_conversation_context": context.model_dump(), "relevant_lawyer_lessons": [x.model_dump() for x in lessons]}
        try:
            result = self.client.responses.create(model=self.draft_model, input=[{"role": "system", "content": self._draft_prompt()}, {"role": "user", "content": json.dumps(data, ensure_ascii=False)}])
            raw = result.output_text or ""
            parsed = _extract_json_object(raw)
            if not isinstance(parsed, dict): raise ValueError("no JSON object")
            normalized = self._normalize_contract(parsed, payload, language)
            contract = V2AnswerContract.model_validate(normalized)
            contract.raw_model_output = parsed
            return contract, {"model": self.draft_model, "fallback": False, "raw_text_preview": raw[:1000]}
        except Exception as exc:
            lang = "zh" if language == "zh" else "en"
            contract = V2AnswerContract(response_language=lang, answer_draft=V2AnswerDraft(direct_answer=("我可以协助澳洲移民法律相关问题，但需要先核对关键法律依据后才能给出可靠回答。" if lang == "zh" else "I can help with Australian immigration-law questions, but I need to verify the key legal basis before giving a reliable answer.")), answer_scope="cannot_answer", legal_claims_to_verify=[V2LegalClaim(claim_id="c1", claim=f"Fallback legal-source check for: {payload.question}", importance="decisive", source_priority=["home_affairs", "legislation", "local_guidance"])], confidence_before_verification="low", raw_model_output={"fallback_reason": str(exc)[:1000]})
            return contract, {"model": self.draft_model, "fallback": True, "error": str(exc)[:1000]}

    def _draft_prompt(self) -> str:
        return (
            "You are the primary answer drafter for an Australian immigration-law website assistant. Answer directly, but expose the legal claims and decisive conditions behind the answer.\n"
            "Rules: start with the direct answer; never write 'A provisional, general response can be provided'; answer general legal rules before asking for facts; do not give a personal yes/no unless decisive facts are known; if the latest question names a new visa/topic, do not carry over a previous frame; ask at most one decisive next question.\n"
            "Return ONLY valid JSON with this exact shape: {\n"
            "\"response_language\": \"en|zh\", \"answer_draft\": {\"direct_answer\": string, \"explanation\": string|null, \"practical_meaning\": string|null, \"caution\": string|null, \"one_next_question\": string|null}, \"answer_scope\": \"general_rule|case_specific_preliminary|case_specific_conclusion|cannot_answer\", \"case_specific_yes_no_given\": boolean, \"legal_claims_to_verify\": [{\"claim_id\": string, \"claim\": string, \"topic\": string|null, \"subclass\": string|null, \"stream\": string|null, \"importance\": \"decisive|supporting|background\", \"source_priority\": [\"schedule_1\"|\"schedule_2\"|\"home_affairs\"|\"legislation\"|\"policy\"|\"case_law\"|\"local_guidance\"]}], \"decisive_conditions\": [{\"condition_id\": string, \"condition\": string, \"known_status\": \"known|unknown|contradicted|not_required\", \"known_value\": string|null, \"required_for\": \"general_rule_answer|case_specific_preliminary|case_specific_conclusion|deadline_advice\", \"effect_if_missing\": string|null}], \"known_facts\": [{\"key\": string, \"value\": string|number|boolean|null, \"source\": \"latest_user_message|conversation_history|intake_facts|system_inferred|unknown\", \"confidence\": \"low|medium|high\"}], \"risk_flags\": {\"deadline_sensitive\": boolean, \"possible_unlawful_status\": boolean, \"refusal_or_review\": boolean, \"cancellation_or_noicc\": boolean, \"character_or_integrity\": boolean, \"requires_lawyer_handoff\": boolean, \"evidence\": string[]}, \"topic_control\": {\"explicit_topic\": string|null, \"previous_topic_used\": boolean, \"topic_switch_detected\": boolean, \"must_not_use_previous_topics\": string[]}, \"confidence_before_verification\": \"low|medium|high\"}\n"
        )

    def _verify(self, db: Session, payload: QueryRequest, contract: V2AnswerContract) -> tuple[V2VerificationResult, list[CitationOut], dict[str, Any]]:
        chunks, local_debug = self._retrieve_chunks(db, payload, contract)
        live_chunks: list[LiveSourceChunk] = []
        live_debug: dict[str, Any] = {"used_live_fetch": False}
        if self.online_enabled and (not chunks or any("home_affairs" in c.source_priority or "policy" in c.source_priority for c in contract.legal_claims_to_verify)):
            try:
                live = self.live_retrieval_service.retrieve(question=self._verification_query(payload, contract), preferred_domains=["immi.homeaffairs.gov.au", "legislation.gov.au"], known_facts={"v2_contract": contract.model_dump()}, max_urls=4, max_chunks=6)
                live_chunks = live.chunks; live_debug = live.model_dump()
            except Exception as exc:
                live_debug = {"used_live_fetch": False, "error": str(exc)[:500]}
        pack = self._source_pack(chunks, live_chunks)
        citations = self._citations(chunks, live_chunks)
        if not pack:
            result = V2VerificationResult(claim_verdicts=[V2ClaimVerdict(claim_id=c.claim_id, verdict="not_found", confidence="low") for c in contract.legal_claims_to_verify], overall_verdict="cannot_verify", final_confidence="low", coverage_report={"source_pack_available": False})
            return result, citations, {"local_retrieval": local_debug, "live_retrieval": live_debug, "source_pack": []}
        try:
            msg = {"answer_contract": contract.model_dump(exclude={"raw_model_output"}), "numbered_sources": pack}
            res = self.client.responses.create(model=self.verifier_model, input=[{"role": "system", "content": self._verifier_prompt()}, {"role": "user", "content": json.dumps(msg, ensure_ascii=False)}])
            parsed = _extract_json_object(res.output_text or "")
            if not isinstance(parsed, dict): raise ValueError("no JSON object")
            result = V2VerificationResult.model_validate(parsed); result.raw_model_output = parsed
        except Exception as exc:
            supports = [self._support_from_pack(x) for x in pack[:3]]
            result = V2VerificationResult(claim_verdicts=[V2ClaimVerdict(claim_id=c.claim_id, verdict="partially_supported", confidence="low", supporting_sources=supports) for c in contract.legal_claims_to_verify], overall_verdict="repair", final_confidence="low", coverage_report={"verifier_fallback": True, "error": str(exc)[:500]})
        result.coverage_report.update({"local_chunk_count": len(chunks), "live_chunk_count": len(live_chunks), "online_enabled": self.online_enabled, "checked_claim_count": len(contract.legal_claims_to_verify)})
        return result, citations, {"local_retrieval": local_debug, "live_retrieval": live_debug, "source_pack": pack}

    def _verifier_prompt(self) -> str:
        return (
            "You are a strict verification layer for an Australian immigration-law assistant. You do not write the final answer. Work only from numbered sources and the answer contract. If a claim is not supported by numbered sources, mark not_found or partially_supported. If a personal yes/no conclusion lacks decisive facts, set ask_decisive_question or repair. Return ONLY JSON: {\"claim_verdicts\": [{\"claim_id\": string, \"verdict\": \"supported|partially_supported|contradicted|not_found\", \"confidence\": \"low|medium|high\", \"supporting_sources\": [{\"title\": string, \"authority\": string, \"source_type\": string, \"url\": string|null, \"section_ref\": string|null, \"quote_or_summary\": string|null, \"source_id\": string|null, \"chunk_id\": string|null}], \"required_correction\": string|null}], \"condition_verdicts\": [{\"condition_id\": string, \"blocks_general_rule_answer\": boolean, \"blocks_case_specific_conclusion\": boolean, \"required_next_question\": string|null, \"explanation\": string|null}], \"wrong_topic_or_frame_detected\": boolean, \"missing_decisive_keywords\": string[], \"overall_verdict\": \"pass|repair|ask_decisive_question|escalate|cannot_verify\", \"final_confidence\": \"low|medium|high\", \"coverage_report\": object}"
        )

    def _guard(self, contract: V2AnswerContract, verification: V2VerificationResult) -> V2GuardResult:
        reasons: list[str] = []
        question = None
        blocked = False
        if contract.risk_flags.requires_lawyer_handoff:
            return V2GuardResult(action="escalate", reasons=["requires_lawyer_handoff"], blocked_case_specific_conclusion=True)
        if contract.risk_flags.any_high_risk(): reasons.append("high_risk_signal_detected")
        bad_claims = [v.verdict for v in verification.claim_verdicts if v.verdict in {"contradicted", "not_found"}]
        if bad_claims: reasons.append("unsupported_or_contradicted_claims:" + ",".join(sorted(set(bad_claims))))
        if verification.wrong_topic_or_frame_detected or (contract.topic_control.previous_topic_used and contract.topic_control.topic_switch_detected): reasons.append("wrong_or_stale_topic_frame_detected")
        for cond in contract.decisive_conditions:
            if cond.known_status in {"unknown", "contradicted"} and cond.required_for in {"case_specific_conclusion", "deadline_advice"}:
                blocked = True; reasons.append(f"missing_decisive_condition:{cond.condition_id}")
                if not question: question = self._condition_question(contract.response_language, cond.condition)
        for verdict in verification.condition_verdicts:
            if verdict.blocks_case_specific_conclusion:
                blocked = True
                if verdict.required_next_question and not question: question = verdict.required_next_question
        if contract.case_specific_yes_no_given and blocked:
            return V2GuardResult(action="ask_decisive_question", reasons=[*reasons, "case_specific_yes_no_blocked_by_missing_condition"], required_next_question=question, blocked_case_specific_conclusion=True)
        if contract.risk_flags.any_high_risk(): return V2GuardResult(action="repair", reasons=reasons, required_next_question=question, blocked_case_specific_conclusion=blocked)
        if verification.overall_verdict in {"repair", "cannot_verify"} or bad_claims: return V2GuardResult(action="repair", reasons=reasons or [f"verification:{verification.overall_verdict}"], required_next_question=question, blocked_case_specific_conclusion=blocked)
        if verification.overall_verdict == "ask_decisive_question" or blocked: return V2GuardResult(action="ask_decisive_question", reasons=reasons or ["decisive_question_needed"], required_next_question=question, blocked_case_specific_conclusion=blocked)
        if verification.overall_verdict == "escalate": return V2GuardResult(action="escalate", reasons=reasons or ["verification_requested_escalation"])
        return V2GuardResult(action="pass", reasons=reasons)

    def _render(self, contract: V2AnswerContract, verification: V2VerificationResult, guard: V2GuardResult) -> V2RenderedAnswer:
        lang = contract.response_language
        direct = self._clean(contract.answer_draft.direct_answer)
        if guard.action == "ask_decisive_question" and contract.case_specific_yes_no_given:
            direct = "我可以先说明一般法律规则，但不能仅凭目前信息确认这个人的最终资格。还需要先确认一个关键条件。" if lang == "zh" else "I can explain the general legal rule, but I cannot confirm this person’s final eligibility from the current facts alone. One decisive condition still needs to be checked."
        explanation = self._clean(contract.answer_draft.explanation or "")
        practical = self._clean(contract.answer_draft.practical_meaning or "")
        caution = self._clean(contract.answer_draft.caution or "")
        if guard.action == "repair": caution = self._join(caution, self._correction(lang, verification))
        if verification.overall_verdict == "cannot_verify": caution = self._join(caution, "我没有在当前可用的法律资料中充分核实所有关键依据，所以这部分应作为谨慎的一般说明，而不是最终法律意见。" if lang == "zh" else "I could not fully verify every decisive point from the currently available legal sources, so this should be treated as cautious general information rather than final legal advice.")
        if guard.action == "escalate": caution = self._join(caution, "由于这可能涉及期限、身份或较高风险，建议尽快让移民律师看完整事实后再行动。" if lang == "zh" else "Because this may involve status, deadlines, or higher legal risk, it is sensible to have an immigration lawyer check the full facts before taking action.")
        q = guard.required_next_question or contract.answer_draft.one_next_question
        parts = [self._section(lang, "Short answer", "简短回答", direct)]
        if explanation: parts.append(self._section(lang, "Why", "原因", explanation))
        if practical: parts.append(self._section(lang, "Practical meaning", "实际影响", practical))
        if caution: parts.append(self._section(lang, "Important caution", "重要提醒", caution))
        if q and guard.action in {"ask_decisive_question", "repair", "pass"}: parts.append(self._section(lang, "One key question", "一个关键问题", self._clean(q)))
        next_action = "answer"; follow = []; missing = []
        confidence = verification.final_confidence
        if guard.action == "ask_decisive_question": next_action = "ask_followup"; follow = [q] if q else []; missing = follow; confidence = "medium" if confidence == "high" else confidence
        if guard.action == "escalate": next_action = "suggest_consultation"; confidence = "low" if confidence == "medium" else confidence
        return V2RenderedAnswer(answer="\n\n".join(p for p in parts if p.strip()), confidence=confidence, next_action=next_action, escalate=guard.action == "escalate" or contract.risk_flags.requires_lawyer_handoff, follow_up_questions=follow, missing_facts=missing, user_display_mode="ask_one_question" if next_action == "ask_followup" else ("escalate_with_brief_reason" if next_action == "suggest_consultation" else "direct_short"), compact_sources=self._compact_sources(verification))

    # ---------- retrieval helpers ----------
    def _retrieve_chunks(self, db: Session, payload: QueryRequest, contract: V2AnswerContract) -> tuple[list[SourceChunk], dict[str, Any]]:
        by_id: dict[str, SourceChunk] = {}; debug = []
        claims = contract.legal_claims_to_verify or [V2LegalClaim(claim_id="c1", claim=payload.question, source_priority=["home_affairs", "legislation", "local_guidance"])]
        for claim in claims[:4]:
            query = " ".join(x for x in [claim.claim, claim.topic or "", claim.subclass or "", claim.stream or "", payload.question] if x)
            try:
                qp = QueryRequest(**{**payload.model_dump(), "question": query, "top_k": min(max(payload.top_k or self.max_chunks, 4), self.max_chunks)})
                chunks, dbg = self.retrieval_service.retrieve(db, qp); debug.append({"query": query, "debug": dbg})
                for chunk in chunks:
                    by_id[chunk.id] = chunk
                    if len(by_id) >= self.max_chunks: break
            except Exception as exc:
                debug.append({"query": query, "error": str(exc)[:500]})
            if len(by_id) >= self.max_chunks: break
        return list(by_id.values())[:self.max_chunks], {"queries": debug}

    def _source_pack(self, chunks: list[SourceChunk], live_chunks: list[LiveSourceChunk]) -> list[dict[str, Any]]:
        pack = []
        for i, chunk in enumerate(chunks, 1):
            source = chunk.source
            pack.append({"number": i, "kind": "local", "title": source.title if source else "", "authority": source.authority if source else "", "source_type": source.source_type if source else "", "url": source.url if source else None, "source_id": chunk.source_id, "chunk_id": chunk.id, "section_ref": chunk.section_ref, "heading": chunk.heading, "text": (chunk.text or "")[:2200]})
        offset = len(pack)
        for i, chunk in enumerate(live_chunks, 1):
            live_id = "live:" + hashlib.sha1(f"{chunk.url}|{chunk.heading}|{i}".encode()).hexdigest()[:12]
            pack.append({"number": offset+i, "kind": "live", "title": chunk.title, "authority": chunk.authority, "source_type": chunk.source_type, "url": chunk.url, "source_id": live_id, "chunk_id": live_id, "section_ref": chunk.section_ref, "heading": chunk.heading, "text": (chunk.text or "")[:2200]})
        return pack[:self.max_chunks]

    def _citations(self, chunks: list[SourceChunk], live_chunks: list[LiveSourceChunk]) -> list[CitationOut]:
        out = []
        for chunk in chunks[:self.max_chunks]:
            s = chunk.source
            if not s: continue
            out.append(CitationOut(source_id=chunk.source_id, chunk_id=chunk.id, title=s.title, authority=s.authority, citation_text=s.citation_text, section_ref=chunk.section_ref, url=s.url, quote_text=(chunk.text or "")[:500], rationale="V2 targeted verification source", confidence_score=0.75))
        for i, chunk in enumerate(live_chunks[:4], 1):
            live_id = "live:" + hashlib.sha1(f"{chunk.url}|{chunk.heading}|{i}".encode()).hexdigest()[:12]
            out.append(CitationOut(source_id=live_id, chunk_id=live_id, title=chunk.title, authority=chunk.authority, citation_text=None, section_ref=chunk.section_ref, url=chunk.url, quote_text=(chunk.text or "")[:500], rationale="V2 official live verification source", confidence_score=0.65))
        return out

    # ---------- matter / trace helpers ----------
    def _get_or_create_matter(self, db: Session, payload: QueryRequest) -> Matter:
        if payload.matter_id:
            m = db.get(Matter, payload.matter_id)
            if m is not None: self._attach(m, payload); return m
        if payload.frontend_chat_id:
            m = db.query(Matter).filter(Matter.frontend_chat_id == payload.frontend_chat_id).order_by(Matter.last_user_message_at.desc().nullslast(), Matter.created_at.desc()).first()
            if m is not None: self._attach(m, payload); return m
        if payload.session_id:
            m = db.query(Matter).filter(Matter.session_id == payload.session_id).order_by(Matter.last_user_message_at.desc().nullslast(), Matter.created_at.desc()).first()
            if m is not None: self._attach(m, payload); return m
        m = Matter(session_id=payload.session_id, frontend_chat_id=payload.frontend_chat_id, frontend_user_id=payload.frontend_user_id, issue_summary=self._summary(payload.question), status="open", issue_type=None, visa_type=None, risk_level="medium", last_user_message_at=self._now(), metadata_json={"engine_version": "v2_verified_answer", "frontend_chat_id": payload.frontend_chat_id, "frontend_user_id": payload.frontend_user_id, "initial_question": payload.question, "conversation_history": [], "carried_intake_facts": payload.intake_facts or {}})
        db.add(m); db.flush(); return m

    def _attach(self, matter: Matter, payload: QueryRequest) -> None:
        if payload.session_id and not matter.session_id: matter.session_id = payload.session_id
        if payload.frontend_chat_id and not matter.frontend_chat_id: matter.frontend_chat_id = payload.frontend_chat_id
        if payload.frontend_user_id and not matter.frontend_user_id: matter.frontend_user_id = payload.frontend_user_id
        meta = dict(matter.metadata_json or {})
        changed = False
        for k, v in {"frontend_chat_id": payload.frontend_chat_id, "frontend_user_id": payload.frontend_user_id}.items():
            if v and meta.get(k) != v: meta[k] = v; changed = True
        if changed: matter.metadata_json = meta

    def _update_matter(self, matter: Matter, payload: QueryRequest, response: QueryResponse, extra: dict[str, Any]) -> None:
        matter.session_id = payload.session_id or matter.session_id; matter.frontend_chat_id = payload.frontend_chat_id or matter.frontend_chat_id; matter.frontend_user_id = payload.frontend_user_id or matter.frontend_user_id
        matter.issue_summary = self._summary(payload.question); matter.last_user_message_at = self._now(); matter.issue_type = response.issue_type or matter.issue_type; matter.risk_level = "high" if response.escalate else ("low" if response.confidence == "high" else "medium")
        meta = deepcopy(matter.metadata_json or {})
        hist = [x for x in (meta.get("conversation_history") or []) if isinstance(x, dict)]
        hist.extend([{"role": "user", "content": payload.question, "timestamp": self._now().isoformat()}, {"role": "assistant", "content": response.answer, "next_action": response.next_action, "confidence": response.confidence, "timestamp": self._now().isoformat()}])
        meta.update({"latest_question": payload.question, "last_answer_type": "specific_grounded" if response.next_action == "answer" else "general_guidance", "next_action": response.next_action, "conversation_state": "ESCALATION_READY" if response.escalate else ("FOLLOW_UP_PENDING" if response.next_action == "ask_followup" else "ANSWERED_GENERAL"), "carried_intake_facts": {**(meta.get("carried_intake_facts") or {}), **(payload.intake_facts or {})}, "conversation_history": hist[-12:], **extra})
        matter.metadata_json = meta

    def _trace(self, matter: Matter, payload: QueryRequest, response: QueryResponse, timing: dict[str, Any], extra: dict[str, Any]) -> None:
        self.review_trace_service.safe_record_answer_trace(matter=matter, payload=payload, response=response, state=None, semantic_turn=None, original_question=payload.question, effective_question=payload.question, stage_timing=timing, legal_decision=None, communication_plan=None, extra_debug=extra)

    def _to_response(self, payload: QueryRequest, matter: Matter, rendered: V2RenderedAnswer, citations: list[CitationOut]) -> QueryResponse:
        return QueryResponse(matter_id=matter.id, answer=rendered.answer, response_language="zh" if self._looks_zh(rendered.answer) else (payload.response_language or "en"), confidence=rendered.confidence, user_display_mode=rendered.user_display_mode, issue_type=rendered.issue_type, missing_facts=rendered.missing_facts, follow_up_questions=rendered.follow_up_questions, citations=citations, compact_sources=rendered.compact_sources, escalate=rendered.escalate, next_action=rendered.next_action, retrieval_debug={})

    # ---------- misc helpers ----------
    def _normalize_contract(self, parsed: dict[str, Any], payload: QueryRequest, lang: str) -> dict[str, Any]:
        out = dict(parsed); out["response_language"] = "zh" if str(out.get("response_language") or lang).lower().startswith("zh") else "en"
        if not isinstance(out.get("answer_draft"), dict): out["answer_draft"] = {"direct_answer": str(out.get("answer") or out.get("direct_answer") or "").strip() or ("我可以协助澳洲移民法律相关问题，但需要先核对关键法律依据后才能给出可靠回答。" if out["response_language"] == "zh" else "I can help with Australian immigration-law questions, but I need to verify the key legal basis before giving a reliable answer."), "explanation": out.get("explanation"), "practical_meaning": out.get("practical_meaning"), "caution": out.get("caution"), "one_next_question": out.get("one_next_question")}
        if not out.get("legal_claims_to_verify"): out["legal_claims_to_verify"] = [V2LegalClaim(claim_id="c1", claim=f"Answer the legal rule or guidance relevant to: {payload.question}", importance="decisive", source_priority=["home_affairs", "legislation", "local_guidance"]).model_dump()]
        return out

    def _explicit_topic(self, q: str) -> str | None:
        low = (q or "").lower(); m = re.search(r"\b(?:subclass\s*)?([0-9]{3}[a-z]?)\b", low)
        if m: return f"subclass_{m.group(1)}"
        for key, topic in {"parent": "parent_visa", "父母": "parent_visa", "partner": "partner_visa", "配偶": "partner_visa", "student": "student_visa", "学生": "student_visa", "graduate": "temporary_graduate_485", "188": "business_innovation_188", "485": "temporary_graduate_485", "820": "partner_visa_820", "870": "sponsored_parent_870", "bridging": "bridging_visa", "过桥": "bridging_visa", "refusal": "refusal_review", "refused": "refusal_review", "拒签": "refusal_review", "cancellation": "cancellation", "取消": "cancellation"}.items():
            if key in low or key in q: return topic
        return None

    def _verification_query(self, payload: QueryRequest, contract: V2AnswerContract) -> str: return f"{payload.question}\n" + " ".join(c.claim for c in contract.legal_claims_to_verify[:3])
    def _support_from_pack(self, item: dict[str, Any]) -> V2SourceSupport: return V2SourceSupport(title=str(item.get("title") or ""), authority=str(item.get("authority") or ""), source_type=str(item.get("source_type") or ""), url=item.get("url"), section_ref=item.get("section_ref"), quote_or_summary=str(item.get("text") or "")[:400], source_id=item.get("source_id"), chunk_id=item.get("chunk_id"))
    def _condition_question(self, lang: str, condition: str) -> str: return f"一个关键问题：{condition} 的具体情况是什么？" if lang == "zh" else f"One key question: what is the situation for this condition — {condition}?"
    def _section(self, lang: str, en: str, zh: str, text: str) -> str: return f"### {zh if lang == 'zh' else en}\n{text.strip()}"
    def _clean(self, text: str) -> str:
        out = (text or "").strip()
        for p in self.BANNED_PUBLIC: out = re.sub(p, "", out, flags=re.I).strip()
        return re.sub(r"\n{3,}", "\n\n", out)
    def _join(self, a: str, b: str) -> str: return b if not a else (a if not b else f"{a}\n\n{b}")
    def _correction(self, lang: str, v: V2VerificationResult) -> str:
        corrections = [x.required_correction for x in v.claim_verdicts if x.required_correction and x.verdict in {"contradicted", "partially_supported", "not_found"}]
        if corrections: return ("核对后需要修正/补充：" if lang == "zh" else "Verification indicates this correction/qualification is needed: ") + ("；" if lang == "zh" else "; ").join(corrections[:3])
        if v.missing_decisive_keywords: return ("核对时发现答案需要补充关键点：" if lang == "zh" else "The verification step indicates that the answer should include these key points: ") + ", ".join(v.missing_decisive_keywords[:5])
        return ""
    def _compact_sources(self, v: V2VerificationResult) -> list[str]:
        out=[]; seen=set()
        for cv in v.claim_verdicts:
            for s in cv.supporting_sources:
                label = " — ".join(x for x in [s.authority, s.title] if x)
                if label and label not in seen: out.append(label); seen.add(label)
                if len(out) >= 4: return out
        return out
    def _terms(self, q: str) -> set[str]:
        low = (q or "").lower(); terms = set(low.replace("/", " ").replace("-", " ").split())
        for fixed in ["parent visa", "partner visa", "188a", "485", "820", "valid visa", "sponsor", "extension", "refusal"]:
            if fixed in low: terms.add(fixed)
        return {t for t in terms if len(t) >= 2}
    def _detect_lang(self, q: str, requested: str | None) -> ResponseLanguage:
        if requested and requested.lower().startswith("zh"): return "zh"
        return "zh" if re.search(r"[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]", q or "") else "en"
    def _looks_zh(self, text: str) -> bool: return any("\u3400" <= ch <= "\u9fff" for ch in text or "")
    def _configured_sensitive_terms(self) -> set[str]:
        extra = os.getenv("V2_POLITICALLY_SENSITIVE_TERMS", "").strip()
        terms = set(self.DEFAULT_POLITICALLY_SENSITIVE_TERMS)
        if extra:
            terms.update(x.strip() for x in extra.split(",") if x.strip())
        return terms
    def _sensitive_refusal(self, lang: str) -> str: return "抱歉，这个问题涉及政治敏感内容，我不能在这里展开讨论。我可以继续协助澳洲移民法律、签证、担保、拒签复审、取消签证、过桥签证、预约律师，或其他普通非政治敏感问题。" if lang == "zh" else "Sorry, I can’t discuss politically sensitive topics here. I can still help with Australian immigration law, visas, sponsorship, refusals, reviews, cancellations, bridging visas, lawyer appointments, or ordinary non-politically-sensitive general questions."
    def _summary(self, q: str) -> str: return " ".join((q or "").split())[:160] or "Immigration question"
    def _now(self) -> datetime: return datetime.now(timezone.utc)
    def _mark(self, timing: dict[str, Any], name: str, start: float) -> None: timing[name] = round(time.perf_counter() - start, 4)
