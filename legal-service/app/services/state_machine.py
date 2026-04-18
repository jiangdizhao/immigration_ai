
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable

from app.schemas.state import (
    AnswerPackage,
    CaseHypothesis,
    ContextualizationResult,
    ConversationTurn,
    EvidencePackage,
    FactExtractionResult,
    FactSlotState,
    InteractionPlan,
    IssueAndOperation,
    LiveRetrievalResult,
    MatterState,
    PolicyDecision,
    RiskFlags,
    SufficiencyGateResult,
)


@dataclass(slots=True)
class TurnInput:
    question: str
    preferred_jurisdiction: str | None = None
    preferred_source_types: list[str] | None = None
    intake_facts: dict[str, Any] = field(default_factory=dict)
    issue_summary: str | None = None


@dataclass(slots=True)
class TurnWorkflowArtifacts:
    contextualization: ContextualizationResult | None = None
    issue_and_operation: IssueAndOperation | None = None
    fact_extraction: FactExtractionResult | None = None
    sufficiency_gate: SufficiencyGateResult | None = None
    live_retrieval: LiveRetrievalResult | None = None
    evidence_package: EvidencePackage | None = None
    policy_decision: PolicyDecision | None = None
    answer_package: AnswerPackage | None = None
    retrieval_debug: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class StateMachineResult:
    state: MatterState
    effective_question: str
    merged_intake_facts: dict[str, Any]
    artifacts: TurnWorkflowArtifacts


class StateMachine:
    """
    Deterministic workflow helper for the legal-service reasoning pipeline.

    Main responsibilities:
    - hydrate/persist MatterState
    - deterministic turn preparation
    - fact merging / fact status tracking
    - risk flag inference
    - conversation-state transitions
    """

    def __init__(self, max_history_turns: int = 12) -> None:
        self.max_history_turns = max_history_turns

    # ------------------------------------------------------------------
    # Hydration / persistence
    # ------------------------------------------------------------------
    def hydrate_state(self, metadata_json: dict[str, Any] | None) -> MatterState:
        metadata = dict(metadata_json or {})
        history = [
            self._coerce_turn(item)
            for item in (metadata.get("conversation_history") or [])
            if isinstance(item, dict)
        ]

        risk_flags_raw = metadata.get("risk_flags") or {}
        if isinstance(risk_flags_raw, RiskFlags):
            risk_flags = risk_flags_raw
        elif isinstance(risk_flags_raw, dict):
            risk_flags = RiskFlags(**risk_flags_raw)
        else:
            risk_flags = RiskFlags()

        fact_status = metadata.get("fact_status") or {}
        if not isinstance(fact_status, dict):
            fact_status = {}

        carried_facts = metadata.get("carried_intake_facts") or metadata.get("intake_facts") or {}
        if not isinstance(carried_facts, dict):
            carried_facts = {}

        case_hypothesis_raw = metadata.get("case_hypothesis") or {}
        if isinstance(case_hypothesis_raw, CaseHypothesis):
            case_hypothesis = case_hypothesis_raw
        elif isinstance(case_hypothesis_raw, dict):
            case_hypothesis = CaseHypothesis(**case_hypothesis_raw)
        else:
            case_hypothesis = CaseHypothesis()

        fact_slot_states_raw = metadata.get("fact_slot_states") or []
        fact_slot_states = [
            item if isinstance(item, FactSlotState) else FactSlotState(**item)
            for item in fact_slot_states_raw
            if isinstance(item, (dict, FactSlotState))
        ]

        interaction_plan_raw = metadata.get("interaction_plan") or {}
        if isinstance(interaction_plan_raw, InteractionPlan):
            interaction_plan = interaction_plan_raw
        elif isinstance(interaction_plan_raw, dict):
            interaction_plan = InteractionPlan(**interaction_plan_raw)
        else:
            interaction_plan = InteractionPlan()

        conversation_state = metadata.get("conversation_state") or self._infer_legacy_state(metadata, history)

        return MatterState(
            conversation_state=conversation_state,
            issue_type=metadata.get("issue_type"),
            operation_type=metadata.get("operation_type"),
            visa_type=metadata.get("visa_type"),
            carried_intake_facts=carried_facts,
            fact_status=fact_status,
            risk_flags=risk_flags,
            latest_question=metadata.get("latest_question"),
            last_contextualized_question=metadata.get("last_contextualized_question"),
            last_answer_type=metadata.get("last_answer_type"),
            next_action=metadata.get("next_action"),
            conversation_history=history[-self.max_history_turns :],
            case_hypothesis=case_hypothesis,
            fact_slot_states=fact_slot_states,
            interaction_plan=interaction_plan,
        )

    def to_metadata_json(
        self,
        state: MatterState,
        base_metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        metadata = dict(base_metadata or {})
        metadata.update(
            {
                "conversation_state": state.conversation_state,
                "issue_type": state.issue_type,
                "operation_type": state.operation_type,
                "visa_type": state.visa_type,
                "carried_intake_facts": dict(state.carried_intake_facts),
                "fact_status": dict(state.fact_status),
                "risk_flags": state.risk_flags.model_dump(),
                "latest_question": state.latest_question,
                "last_contextualized_question": state.last_contextualized_question,
                "last_answer_type": state.last_answer_type,
                "next_action": state.next_action,
                "conversation_history": [turn.model_dump() for turn in state.conversation_history[-self.max_history_turns :]],
                "case_hypothesis": state.case_hypothesis.model_dump(),
                "fact_slot_states": [slot.model_dump() for slot in state.fact_slot_states],
                "interaction_plan": state.interaction_plan.model_dump(),
            }
        )
        return metadata

    # ------------------------------------------------------------------
    # New explicit step 1: prepare turn before retrieval/reasoning
    # ------------------------------------------------------------------
    def prepare_turn(
        self,
        *,
        current_state: MatterState,
        turn_input: TurnInput,
        contextualize_fn: Callable[..., ContextualizationResult | dict[str, Any]],
        classify_fn: Callable[..., IssueAndOperation | dict[str, Any]],
        fact_extract_fn: Callable[..., FactExtractionResult | dict[str, Any]],
    ) -> StateMachineResult:
        state = current_state.model_copy(deep=True)
        artifacts = TurnWorkflowArtifacts()

        raw_context = contextualize_fn(
            question=turn_input.question,
            conversation_history=[turn.model_dump() for turn in state.conversation_history],
            issue_summary=turn_input.issue_summary,
            issue_type=state.issue_type,
            visa_type=state.visa_type,
            intake_facts=dict(state.carried_intake_facts),
        )
        artifacts.contextualization = (
            raw_context
            if isinstance(raw_context, ContextualizationResult)
            else ContextualizationResult(**raw_context)
        )

        effective_question = (
            artifacts.contextualization.standalone_question.strip()
            if artifacts.contextualization.standalone_question
            else turn_input.question.strip()
        )
        state.latest_question = turn_input.question
        state.last_contextualized_question = effective_question

        merged_facts = self.merge_facts(
            state.carried_intake_facts,
            turn_input.intake_facts,
            artifacts.contextualization.carried_facts,
        )

        raw_issue_op = classify_fn(
            question=effective_question,
            intake_facts=merged_facts,
            current_issue_type=state.issue_type,
            current_operation_type=state.operation_type,
            current_visa_type=state.visa_type,
            preferred_jurisdiction=turn_input.preferred_jurisdiction,
        )
        artifacts.issue_and_operation = (
            raw_issue_op
            if isinstance(raw_issue_op, IssueAndOperation)
            else IssueAndOperation(**raw_issue_op)
        )

        state.issue_type = artifacts.issue_and_operation.issue_type or state.issue_type
        state.operation_type = artifacts.issue_and_operation.operation_type or state.operation_type
        state.visa_type = artifacts.issue_and_operation.visa_type or state.visa_type

        raw_fact_update = fact_extract_fn(
            question=turn_input.question,
            effective_question=effective_question,
            issue_type=state.issue_type,
            operation_type=state.operation_type,
            visa_type=state.visa_type,
            prior_facts=merged_facts,
        )
        artifacts.fact_extraction = (
            raw_fact_update
            if isinstance(raw_fact_update, FactExtractionResult)
            else FactExtractionResult(**raw_fact_update)
        )

        merged_facts = self.merge_facts(merged_facts, artifacts.fact_extraction.new_facts)
        state.carried_intake_facts = merged_facts
        state.fact_status = self.update_fact_status(
            state.fact_status,
            merged_facts,
            artifacts.fact_extraction.fact_confidence,
        )
        state.risk_flags = self.infer_risk_flags(
            question=effective_question,
            issue_type=state.issue_type,
            operation_type=state.operation_type,
            known_facts=merged_facts,
        )

        if state.conversation_state == "NEW":
            state.conversation_state = "FACT_GATHERING"

        return StateMachineResult(
            state=state,
            effective_question=effective_question,
            merged_intake_facts=merged_facts,
            artifacts=artifacts,
        )

    # ------------------------------------------------------------------
    # Existing full workflow entrypoint (kept for future use)
    # ------------------------------------------------------------------
    def run(
        self,
        *,
        current_state: MatterState,
        turn_input: TurnInput,
        contextualize_fn: Callable[..., ContextualizationResult],
        classify_fn: Callable[..., IssueAndOperation],
        fact_extract_fn: Callable[..., FactExtractionResult],
        sufficiency_gate_fn: Callable[..., SufficiencyGateResult] | None = None,
        live_retrieval_fn: Callable[..., LiveRetrievalResult] | None = None,
        evidence_fn: Callable[..., EvidencePackage] | None = None,
        policy_fn: Callable[..., PolicyDecision] | None = None,
        draft_answer_fn: Callable[..., AnswerPackage] | None = None,
        retrieval_debug: dict[str, Any] | None = None,
    ) -> StateMachineResult:
        prepared = self.prepare_turn(
            current_state=current_state,
            turn_input=turn_input,
            contextualize_fn=contextualize_fn,
            classify_fn=classify_fn,
            fact_extract_fn=fact_extract_fn,
        )
        state = prepared.state
        artifacts = prepared.artifacts
        effective_question = prepared.effective_question
        merged_facts = prepared.merged_intake_facts
        artifacts.retrieval_debug = dict(retrieval_debug or {})

        if sufficiency_gate_fn is not None:
            artifacts.sufficiency_gate = sufficiency_gate_fn(
                question=effective_question,
                issue_type=state.issue_type,
                operation_type=state.operation_type,
                known_facts=merged_facts,
                retrieval_debug=artifacts.retrieval_debug,
            )
        else:
            artifacts.sufficiency_gate = self.default_sufficiency_gate(
                question=effective_question,
                issue_type=state.issue_type,
                operation_type=state.operation_type,
                known_facts=merged_facts,
            )

        if artifacts.sufficiency_gate.need_live_fetch and live_retrieval_fn is not None:
            artifacts.live_retrieval = live_retrieval_fn(
                question=effective_question,
                preferred_domains=artifacts.sufficiency_gate.preferred_domains,
                issue_type=state.issue_type,
                operation_type=state.operation_type,
                known_facts=merged_facts,
            )
        else:
            artifacts.live_retrieval = LiveRetrievalResult()

        if evidence_fn is not None:
            artifacts.evidence_package = evidence_fn(
                question=effective_question,
                state=state.model_dump(),
                sufficiency_gate=artifacts.sufficiency_gate.model_dump(),
                live_retrieval=artifacts.live_retrieval.model_dump(),
            )
        else:
            artifacts.evidence_package = EvidencePackage(
                is_in_domain=True,
                is_context_sufficient=artifacts.sufficiency_gate.local_sufficient,
                issue_type=state.issue_type,
                operation_type=state.operation_type,
            )

        if policy_fn is not None:
            artifacts.policy_decision = policy_fn(
                question=effective_question,
                state=state.model_dump(),
                sufficiency_gate=artifacts.sufficiency_gate.model_dump(),
                evidence_package=artifacts.evidence_package.model_dump(),
                live_retrieval=artifacts.live_retrieval.model_dump(),
            )
        else:
            artifacts.policy_decision = self.default_policy_decision(
                state=state,
                evidence=artifacts.evidence_package,
            )

        if draft_answer_fn is not None:
            artifacts.answer_package = draft_answer_fn(
                question=effective_question,
                state=state.model_dump(),
                evidence_package=artifacts.evidence_package.model_dump(),
                policy_decision=artifacts.policy_decision.model_dump(),
            )
        else:
            artifacts.answer_package = AnswerPackage(
                answer_type="followup_only",
                answer="Further facts are needed before a reliable answer can be drafted.",
                confidence=artifacts.policy_decision.confidence_cap or "low",
                issue_type=state.issue_type,
                operation_type=state.operation_type,
                escalate=artifacts.policy_decision.escalate,
                next_action=artifacts.policy_decision.next_action,
            )

        state = self.advance_state(
            state=state,
            policy=artifacts.policy_decision,
            evidence=artifacts.evidence_package,
        )
        state.last_answer_type = artifacts.answer_package.answer_type
        state.next_action = artifacts.answer_package.next_action

        return StateMachineResult(
            state=state,
            effective_question=effective_question,
            merged_intake_facts=merged_facts,
            artifacts=artifacts,
        )

    # ------------------------------------------------------------------
    # New explicit step 2: finalize after actual reasoning response
    # ------------------------------------------------------------------
    def finalize_after_reasoning(
        self,
        *,
        state: MatterState,
        turn_input: TurnInput,
        effective_question: str,
        policy: PolicyDecision,
        evidence: EvidencePackage,
        answer_package: AnswerPackage | None,
        assistant_answer: str,
        confidence: str,
        next_action: str,
        issue_type: str | None = None,
        visa_type: str | None = None,
        timestamp_iso: str | None = None,
    ) -> MatterState:
        finalized = state.model_copy(deep=True)

        if issue_type:
            finalized.issue_type = issue_type
        if visa_type:
            finalized.visa_type = visa_type

        finalized = self.append_turn_pair(
            state=finalized,
            user_question=turn_input.question,
            effective_question=effective_question,
            assistant_answer=assistant_answer,
            next_action=next_action,
            confidence=confidence,
            timestamp_iso=timestamp_iso,
        )

        finalized = self.advance_state(
            state=finalized,
            policy=policy,
            evidence=evidence,
        )
        finalized.last_answer_type = answer_package.answer_type if answer_package is not None else "general_guidance"
        finalized.next_action = next_action

        return finalized

    # ------------------------------------------------------------------
    # Deterministic update helpers
    # ------------------------------------------------------------------
    def append_turn_pair(
        self,
        *,
        state: MatterState,
        user_question: str,
        effective_question: str,
        assistant_answer: str,
        next_action: str,
        confidence: str,
        timestamp_iso: str | None = None,
    ) -> MatterState:
        timestamp = timestamp_iso or self._iso_now()
        state.conversation_history.extend(
            [
                ConversationTurn(
                    role="user",
                    content=user_question,
                    effective_question=effective_question,
                    timestamp=timestamp,
                ),
                ConversationTurn(
                    role="assistant",
                    content=assistant_answer,
                    next_action=next_action,  # type: ignore[arg-type]
                    confidence=confidence,  # type: ignore[arg-type]
                    timestamp=timestamp,
                ),
            ]
        )
        state.conversation_history = state.conversation_history[-self.max_history_turns :]
        return state

    def merge_facts(self, *fact_dicts: dict[str, Any] | None) -> dict[str, Any]:
        merged: dict[str, Any] = {}
        for fact_dict in fact_dicts:
            if not isinstance(fact_dict, dict):
                continue
            for key, value in fact_dict.items():
                if value is None:
                    continue
                merged[key] = value
        return merged

    def update_fact_status(
        self,
        existing_status: dict[str, str] | None,
        known_facts: dict[str, Any],
        fact_confidence: dict[str, str] | None,
    ) -> dict[str, str]:
        status = dict(existing_status or {})
        for key, value in known_facts.items():
            normalized = self._normalize_fact_status(key, value, status.get(key))
            status[key] = normalized
        for key, conf in (fact_confidence or {}).items():
            if key in known_facts and known_facts.get(key) not in (None, "") and status.get(key) == "known":
                status[key] = f"known:{conf}"
        return status

    def infer_risk_flags(
        self,
        *,
        question: str,
        issue_type: str | None,
        operation_type: str | None,
        known_facts: dict[str, Any],
    ) -> RiskFlags:
        q = question.lower()
        return RiskFlags(
            deadline_sensitive=any(term in q for term in ["review", "deadline", "time limit", "refusal", "cancellation"]) or bool(known_facts.get("refusal_date")),
            cancellation_related="cancel" in q or (issue_type == "visa_cancellation"),
            detention_related="detention" in q or bool(known_facts.get("in_detention")),
            character_issue=("character" in q or "criminal" in q or "501" in q),
            pic4020_issue=("4020" in q or "misleading" in q or "false information" in q),
            review_related=("review" in q or "tribunal" in q or operation_type in {"review_rights", "review_deadline"}),
        )

    def advance_state(
        self,
        *,
        state: MatterState,
        policy: PolicyDecision,
        evidence: EvidencePackage,
    ) -> MatterState:
        if policy.escalate:
            state.conversation_state = "ESCALATION_READY"
            return state

        if policy.next_action == "suggest_consultation":
            state.conversation_state = "ESCALATION_READY"
            return state

        if policy.next_action == "ask_followup":
            if evidence.missing_information:
                state.conversation_state = "FOLLOW_UP_PENDING"
            else:
                state.conversation_state = "FACT_GATHERING"
            return state

        if policy.next_action == "answer":
            if evidence.is_context_sufficient:
                state.conversation_state = "ANSWERED_GENERAL"
            else:
                state.conversation_state = "READY_FOR_ANALYSIS"
            return state

        return state

    # ------------------------------------------------------------------
    # Safe defaults
    # ------------------------------------------------------------------
    def default_sufficiency_gate(
        self,
        *,
        question: str,
        issue_type: str | None,
        operation_type: str | None,
        known_facts: dict[str, Any],
    ) -> SufficiencyGateResult:
        q = question.lower()

        preferred_domains: list[str] = []
        preferred_source_types: list[str] = []
        need_live_fetch = False
        reason = None

        if operation_type in {"review_rights", "review_deadline"}:
            preferred_domains = ["art.gov.au", "legislation.gov.au"]
            preferred_source_types = ["procedure", "legislation"]
            if not known_facts.get("notification_date"):
                reason = "missing_notification_date"
        elif operation_type in {"student_refusal_next_steps", "student_visa"} or issue_type == "student_visa":
            preferred_domains = ["immi.homeaffairs.gov.au", "art.gov.au"]
            preferred_source_types = ["guidance", "procedure"]
            if not known_facts.get("refusal_reason"):
                reason = "missing_refusal_reason"
        elif operation_type == "bridging_travel":
            preferred_domains = ["immi.homeaffairs.gov.au"]
            preferred_source_types = ["guidance"]
            if not known_facts.get("current_visa"):
                reason = "missing_current_visa"

        if "current" in q or "latest" in q or "recent" in q:
            need_live_fetch = True
            reason = reason or "freshness_requested"

        return SufficiencyGateResult(
            local_sufficient=not need_live_fetch,
            reason=reason,
            need_live_fetch=need_live_fetch,
            preferred_domains=preferred_domains,
            preferred_source_types=preferred_source_types,
        )

    def default_policy_decision(
        self,
        *,
        state: MatterState,
        evidence: EvidencePackage,
    ) -> PolicyDecision:
        reasons: list[str] = []
        confidence_cap: str | None = None

        if state.risk_flags.deadline_sensitive:
            confidence_cap = "low"
            reasons.append("deadline_sensitive")

        if state.risk_flags.cancellation_related or state.risk_flags.detention_related or state.risk_flags.character_issue:
            return PolicyDecision(
                answer_allowed=True,
                escalate=True,
                next_action="suggest_consultation",
                confidence_cap="low",
                reasons=[*reasons, "high_risk_issue"],
            )

        if evidence.missing_information:
            return PolicyDecision(
                answer_allowed=True,
                escalate=False,
                next_action="ask_followup",
                confidence_cap=confidence_cap or "low",
                reasons=[*reasons, "missing_information"],
            )

        if not evidence.is_context_sufficient:
            return PolicyDecision(
                answer_allowed=True,
                escalate=False,
                next_action="ask_followup",
                confidence_cap=confidence_cap or "low",
                reasons=[*reasons, "context_insufficient"],
            )

        return PolicyDecision(
            answer_allowed=True,
            escalate=False,
            next_action="answer",
            confidence_cap=confidence_cap,
            reasons=reasons,
        )

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------
    def _coerce_turn(self, item: dict[str, Any]) -> ConversationTurn:
        return item if isinstance(item, ConversationTurn) else ConversationTurn(**item)

    def _infer_legacy_state(
        self,
        metadata: dict[str, Any],
        history: list[ConversationTurn],
    ) -> str:
        if metadata.get("escalate"):
            return "ESCALATION_READY"
        if metadata.get("next_action") == "ask_followup":
            return "FOLLOW_UP_PENDING"
        if history:
            return "FACT_GATHERING"
        return "NEW"

    def _normalize_fact_status(
        self,
        key: str,
        value: Any,
        previous: str | None,
    ) -> str:
        lowered_previous = str(previous or "").strip().lower()
        if lowered_previous in {"user_unsure", "document_unavailable", "not_applicable", "conflicting"}:
            return lowered_previous
        if value in (None, ""):
            return lowered_previous or "missing"
        if isinstance(value, str):
            lowered = value.strip().lower()
            if lowered in {"not_sure", "unknown", "unsure", "don't know", "dont know"}:
                return "user_unsure"
            if lowered in {"n/a", "na", "not_applicable"}:
                return "not_applicable"
            if key.endswith("_available") and lowered in {"no", "false"}:
                return "document_unavailable"
            return "known"
        if isinstance(value, bool):
            if key.endswith("_available") and value is False:
                return "document_unavailable"
            return "known"
        return "known"

    def _iso_now(self) -> str:
        from datetime import datetime, timezone
        return datetime.now(timezone.utc).isoformat()