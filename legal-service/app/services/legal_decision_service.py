from __future__ import annotations

from typing import Any

from app.schemas.query import QueryResponse
from app.schemas.semantic_contracts import (
    ActionRecommendation,
    EvidenceCoverage,
    KnownFact,
    LegalDecisionObject,
    LegalPosition,
    MissingFact,
    RiskAssessment,
    SemanticTurnAnalysis,
)
from app.schemas.state import MatterState


class LegalDecisionService:
    """Build the public-answer control object from validated backend state.

    This service does not infer flexible user meaning from raw phrases. It only
    organizes existing structured state, semantic-turn output, retrieval debug,
    policy flags, and the draft response into a LegalDecisionObject that the
    communication generator can safely follow.
    """

    INTERNAL_FACT_KEYS = {
        "active_case_frame_id",
        "case_family",
        "operation_type",
        "answer_preference",
        "answer_tier",
        "pending_offer",
    }

    HIGH_URGENCY_OPERATIONS = {
        "485_student_visa_expired_or_status_risk",
        "500_expiry_or_extension",
        "student_500_expiry_extension_or_status_risk",
        "student_500_transition_to_485",
        "student_500_cancellation_noicc_or_s48_risk",
        "student_refusal_next_steps",
        "review_deadline",
    }

    def build(
        self,
        *,
        response: QueryResponse,
        state: MatterState,
        semantic_turn: dict[str, Any] | None,
        original_question: str,
        effective_question: str,
        retrieval_debug: dict[str, Any] | None,
    ) -> LegalDecisionObject:
        facts = dict(state.carried_intake_facts or {})
        semantic = self._coerce_semantic(semantic_turn)
        operation_type = state.operation_type or str(facts.get("operation_type") or "") or None
        case_frame_id = str(facts.get("active_case_frame_id") or "") or None

        known_facts = self._known_facts(facts)
        missing_facts = self._missing_facts(response)
        evidence = self._evidence_coverage(response=response, retrieval_debug=retrieval_debug or {})
        risk = self._risk_assessment(state=state, operation_type=operation_type, semantic=semantic, response=response)
        legal_position = self._legal_position(response=response, risk=risk)
        action = self._action_recommendation(response=response, operation_type=operation_type, risk=risk)

        answer_mode = self._answer_mode(response=response, risk=risk)
        confidence = response.confidence if response.confidence in {"low", "medium", "high"} else "low"

        return LegalDecisionObject(
            matter_id=response.matter_id,
            case_frame_id=case_frame_id,
            issue_type=state.issue_type or response.issue_type,
            visa_type=state.visa_type,
            operation_type=operation_type,
            answer_mode=answer_mode,
            confidence=confidence,  # type: ignore[arg-type]
            known_facts=known_facts,
            missing_facts=missing_facts,
            criterion_assessments=[],
            evidence_coverage=evidence,
            legal_position=legal_position,
            risk_assessment=risk,
            action_recommendation=action,
            public_answer_constraints=[
                "Do not provide a final legal conclusion unless supported by facts and sources.",
                "Do not invent deadlines, risk percentages, or guaranteed outcomes.",
                "Commit to facts the user has already provided.",
                "Ask at most one useful next question unless the user explicitly asks for full intake.",
            ],
            internal_debug_notes=[
                f"original_question={original_question[:180]}",
                f"effective_question={effective_question[:180]}",
            ],
            validated=True,
            validation_errors=[],
        )

    def _known_facts(self, facts: dict[str, Any]) -> list[KnownFact]:
        out: list[KnownFact] = []
        for key, value in facts.items():
            if key in self.INTERNAL_FACT_KEYS or value in (None, ""):
                continue
            out.append(KnownFact(fact_key=str(key), value=value, confidence="medium", source="conversation_history"))
        return out[:24]

    def _missing_facts(self, response: QueryResponse) -> list[MissingFact]:
        out: list[MissingFact] = []
        for idx, key in enumerate(response.missing_facts or []):
            key_s = str(key).strip()
            if not key_s:
                continue
            out.append(MissingFact(fact_key=key_s, label=key_s.replace("_", " "), blocking=False, ask_priority=idx + 1))
        if response.follow_up_questions and not out:
            out.append(MissingFact(fact_key="follow_up_detail", label="follow-up detail", user_question=response.follow_up_questions[0], ask_priority=1))
        return out[:6]

    def _evidence_coverage(self, *, response: QueryResponse, retrieval_debug: dict[str, Any]) -> EvidenceCoverage:
        counts = retrieval_debug.get("source_class_counts") or {}
        present = sorted(str(key) for key, value in counts.items() if value)
        answerability = ((retrieval_debug.get("sufficiency_gate") or {}).get("answerability") or {}) if isinstance(retrieval_debug.get("sufficiency_gate"), dict) else {}
        missing = answerability.get("required_source_classes_missing") or []
        required = answerability.get("source_classes_present") or present
        live_used = bool(retrieval_debug.get("live_fetch_used"))
        local_used = bool(retrieval_debug.get("result_count") or retrieval_debug.get("results"))
        suff = "current_official_sufficient" if live_used and response.citations else "sufficient" if response.citations else "partial" if present else "weak"
        return EvidenceCoverage(
            evidence_sufficiency=suff,  # type: ignore[arg-type]
            source_classes_required=[str(x) for x in required if x],
            source_classes_present=present,
            source_classes_missing=[str(x) for x in missing if x],
            local_retrieval_used=local_used,
            live_retrieval_used=live_used,
            current_official_source_used=live_used,
            citation_ids=[str(getattr(c, "source_id", "") or "") for c in response.citations or [] if getattr(c, "source_id", None)],
            citation_titles=[str(getattr(c, "title", "") or "") for c in response.citations or [] if getattr(c, "title", None)],
            evidence_gaps=[str(x) for x in missing if x],
        )

    def _risk_assessment(
        self,
        *,
        state: MatterState,
        operation_type: str | None,
        semantic: SemanticTurnAnalysis | None,
        response: QueryResponse,
    ) -> RiskAssessment:
        flags = state.risk_flags
        semantic_risk = semantic.risk_signals if semantic else None
        high_by_operation = operation_type in self.HIGH_URGENCY_OPERATIONS
        should_escalate = bool(response.escalate or high_by_operation or (semantic_risk and semantic_risk.requires_lawyer_handoff))
        deadline = bool(flags.deadline_sensitive or (semantic_risk and semantic_risk.deadline_sensitive))
        status = bool(high_by_operation or (semantic_risk and (semantic_risk.possible_unlawful_status or semantic_risk.visa_expiry_or_status_problem)))
        cancellation = bool(flags.cancellation_related or (semantic_risk and semantic_risk.cancellation_or_noicc))
        review = bool(flags.review_related or (semantic_risk and semantic_risk.refusal_or_review))
        urgency = "urgent" if should_escalate and (deadline or status or cancellation) else "high" if should_escalate else "medium"
        risk_band = "high" if should_escalate else "medium" if (deadline or status or review) else "unknown"
        return RiskAssessment(
            urgency=urgency,  # type: ignore[arg-type]
            risk_band=risk_band,  # type: ignore[arg-type]
            deadline_sensitive=deadline,
            status_sensitive=status,
            cancellation_sensitive=cancellation,
            review_sensitive=review,
            current_policy_sensitive=bool(semantic and semantic.current_policy_need.requires_current_policy_check),
            should_escalate_to_lawyer=should_escalate,
            escalation_reason="High-risk or time-sensitive immigration matter." if should_escalate else None,
            user_safe_warning="This should be checked promptly with a lawyer or registered migration agent." if should_escalate else None,
        )

    def _legal_position(self, *, response: QueryResponse, risk: RiskAssessment) -> LegalPosition:
        can_say = []
        if response.answer:
            can_say.append("A provisional, general response can be provided from the current known facts and evidence.")
        cannot_say = [
            "Do not say the user definitely is or is not eligible unless the validated legal decision supports it.",
            "Do not give exact deadlines unless the required notice/date and source are available.",
            "Do not guarantee visa grant, review success, or lawful status.",
        ]
        caveats = []
        if risk.should_escalate_to_lawyer:
            caveats.append("A lawyer or registered migration agent should verify documents, dates, and current status.")
        if response.missing_facts:
            caveats.append("Some case-specific details remain missing, so the answer should stay provisional.")
        return LegalPosition(
            provisional_conclusion=None,
            can_say=can_say,
            cannot_say=cannot_say,
            uncertainty_reasons=list(response.missing_facts or []),
            required_caveats=caveats,
            forbidden_overclaims=cannot_say,
        )

    def _action_recommendation(self, *, response: QueryResponse, operation_type: str | None, risk: RiskAssessment) -> ActionRecommendation:
        next_action = "suggest_consultation" if risk.should_escalate_to_lawyer else "ask_one_fact" if (response.follow_up_questions or response.missing_facts) else "answer"
        pending = None
        if risk.should_escalate_to_lawyer:
            pending = {"offer_type": "lawyer_brief", "label_en": "prepare a lawyer consultation summary", "label_zh": "整理一份给律师看的案情摘要"}
        elif operation_type == "document_checklist":
            pending = {"offer_type": "document_checklist", "label_en": "prepare a document checklist", "label_zh": "整理材料清单"}
        elif operation_type in {"485_student_visa_expired_or_status_risk", "500_expiry_or_extension", "student_500_transition_to_485"}:
            pending = {"offer_type": "status_action_plan", "label_en": "prepare a next-step action plan", "label_zh": "整理下一步行动清单"}

        return ActionRecommendation(
            next_best_action=next_action,  # type: ignore[arg-type]
            today_actions=[],
            document_preparation=[],
            one_next_question=(response.follow_up_questions or [None])[0],
            one_next_fact_key=(response.missing_facts or [None])[0],
            pending_offer_to_create=pending,
        )

    def _answer_mode(self, *, response: QueryResponse, risk: RiskAssessment) -> str:
        if risk.should_escalate_to_lawyer:
            return "lawyer_handoff"
        if response.follow_up_questions or response.missing_facts:
            return "answer_then_ask"
        return "answer_with_warning" if risk.urgency in {"high", "urgent"} else "qualified_general"

    def _coerce_semantic(self, value: dict[str, Any] | None) -> SemanticTurnAnalysis | None:
        if not isinstance(value, dict):
            return None
        try:
            return SemanticTurnAnalysis(**value)
        except Exception:
            return None
