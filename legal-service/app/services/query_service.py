
from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass
from datetime import datetime, timezone
from types import SimpleNamespace
from typing import Any

from sqlalchemy.orm import Session

from app.db.models import Citation, Matter
from app.schemas.query import QueryRequest, QueryResponse
from app.schemas.state import (
    AnswerPackage,
    ContextualizationResult,
    EvidencePackage,
    FactExtractionResult,
    IssueAndOperation,
    LiveRetrievalResult,
    MatterState,
    PolicyDecision,
    SufficiencyGateResult,
)
from app.services.fact_extraction_service import FactExtractionService
from app.services.live_retrieval_service import LiveRetrievalService
from app.services.policy_rules import PolicyRules
from app.services.reasoning_service import ReasoningService
from app.services.retrieval_service import RetrievalService
from app.services.state_machine import StateMachine, TurnInput


@dataclass(slots=True)
class _LiveSourceShim:
    id: str
    title: str
    authority: str
    citation_text: str | None
    url: str
    source_type: str
    metadata_json: dict[str, Any]


@dataclass(slots=True)
class _LiveChunkShim:
    id: str
    source_id: str
    section_ref: str | None
    heading: str | None
    text: str
    source: _LiveSourceShim


class QueryService:
    def __init__(
        self,
        retrieval_service: RetrievalService | None = None,
        reasoning_service: ReasoningService | None = None,
        fact_extraction_service: FactExtractionService | None = None,
        policy_rules: PolicyRules | None = None,
        live_retrieval_service: LiveRetrievalService | None = None,
        state_machine: StateMachine | None = None,
    ) -> None:
        self.retrieval_service = retrieval_service or RetrievalService()
        self.reasoning_service = reasoning_service or ReasoningService()
        self.fact_extraction_service = fact_extraction_service or FactExtractionService()
        self.policy_rules = policy_rules or PolicyRules()
        self.live_retrieval_service = live_retrieval_service or LiveRetrievalService()
        self.state_machine = state_machine or StateMachine(max_history_turns=12)
        self.max_history_turns = 12

    def run(self, db: Session, payload: QueryRequest) -> QueryResponse:
        return self.handle_query(db, payload)

    def handle_query(self, db: Session, payload: QueryRequest) -> QueryResponse:
        matter = self._get_or_create_matter(db, payload)

        current_state = self.state_machine.hydrate_state(matter.metadata_json)
        turn_input = TurnInput(
            question=payload.question,
            preferred_jurisdiction=payload.preferred_jurisdiction,
            preferred_source_types=payload.preferred_source_types,
            intake_facts=payload.intake_facts or {},
            issue_summary=matter.issue_summary,
        )

        prepared = self.state_machine.prepare_turn(
            current_state=current_state,
            turn_input=turn_input,
            contextualize_fn=self._contextualize_turn,
            classify_fn=self._classify_issue_and_operation,
            fact_extract_fn=self._extract_fact_updates,
        )

        state = prepared.state
        artifacts = prepared.artifacts
        effective_question = prepared.effective_question
        merged_intake_facts = prepared.merged_intake_facts

        effective_payload = QueryRequest(
            **{
                **payload.model_dump(),
                "matter_id": matter.id,
                "question": effective_question,
                "intake_facts": merged_intake_facts,
            }
        )

        local_chunks, retrieval_debug = self.retrieval_service.retrieve(db, effective_payload)
        artifacts.retrieval_debug = retrieval_debug

        sufficiency_gate = self.policy_rules.judge_local_sufficiency(
            question=effective_question,
            issue_type=state.issue_type,
            operation_type=state.operation_type,
            known_facts=merged_intake_facts,
            retrieval_debug=retrieval_debug,
        )
        artifacts.sufficiency_gate = sufficiency_gate

        live_result = LiveRetrievalResult()
        live_chunks: list[_LiveChunkShim] = []
        if sufficiency_gate.need_live_fetch:
            live_result = self.live_retrieval_service.retrieve(
                question=effective_question,
                preferred_domains=sufficiency_gate.preferred_domains,
                issue_type=state.issue_type,
                operation_type=state.operation_type,
                known_facts=merged_intake_facts,
            )
            live_chunks = self._live_chunks_to_shims(live_result)
        artifacts.live_retrieval = live_result

        merged_chunks = self._merge_chunks(local_chunks, live_chunks)

        enriched_debug = self._enrich_retrieval_debug(
            retrieval_debug=retrieval_debug,
            contextualization=artifacts.contextualization,
            original_question=payload.question,
            effective_question=effective_question,
            live_result=live_result,
            sufficiency_gate=sufficiency_gate,
        )

        response = self.reasoning_service.answer_from_chunks(
            payload=payload,
            chunks=merged_chunks,
            retrieval_debug=enriched_debug,
            conversation_context={
                "history": [turn.model_dump() for turn in state.conversation_history],
                "issue_summary": matter.issue_summary,
                "issue_type": state.issue_type,
                "visa_type": state.visa_type,
                "intake_facts": merged_intake_facts,
                "effective_question": effective_question,
            },
        )
        response.matter_id = matter.id

        evidence = self._evidence_from_response(response, state)
        policy = self.policy_rules.apply_policy_rules(
            question=effective_question,
            state=state,
            sufficiency_gate=sufficiency_gate,
            evidence_package=evidence,
            live_retrieval=live_result.model_dump(),
        )
        artifacts.evidence_package = evidence
        artifacts.policy_decision = policy

        response = self._apply_policy_to_response(response, policy, state)

        state = self.state_machine.finalize_after_reasoning(
            state=state,
            turn_input=turn_input,
            effective_question=effective_question,
            policy=policy,
            evidence=evidence,
            answer_package=AnswerPackage(
                answer_type="specific_grounded" if response.next_action == "answer" else "general_guidance",
                answer=response.answer,
                confidence=response.confidence,  # type: ignore[arg-type]
                issue_type=response.issue_type,
                operation_type=state.operation_type,
                escalate=response.escalate,
                next_action=response.next_action,  # type: ignore[arg-type]
            ),
            assistant_answer=response.answer,
            confidence=response.confidence,
            next_action=response.next_action,
            issue_type=response.issue_type or state.issue_type,
            visa_type=state.visa_type,
        )

        self._update_matter_from_state(
            matter=matter,
            payload=payload,
            state=state,
            effective_question=effective_question,
        )
        self._persist_citations(db, matter, response)

        db.commit()
        db.refresh(matter)

        return response

    # ------------------------------------------------------------------
    # Matter lifecycle
    # ------------------------------------------------------------------
    def _get_or_create_matter(self, db: Session, payload: QueryRequest) -> Matter:
        if payload.matter_id:
            matter = db.get(Matter, payload.matter_id)
            if matter is not None:
                return matter

        if payload.session_id:
            matter = (
                db.query(Matter)
                .filter(Matter.session_id == payload.session_id)
                .order_by(Matter.last_user_message_at.desc().nullslast(), Matter.created_at.desc())
                .first()
            )
            if matter is not None:
                return matter

        matter = Matter(
            session_id=payload.session_id,
            issue_summary=self._build_issue_summary(payload.question),
            status="open",
            issue_type=self._infer_issue_type(payload.question),
            visa_type=self._infer_visa_type(payload.question),
            risk_level="medium",
            last_user_message_at=self._now_utc(),
            metadata_json={
                "preferred_jurisdiction": payload.preferred_jurisdiction,
                "preferred_source_types": payload.preferred_source_types or [],
                "intake_facts": payload.intake_facts or {},
                "carried_intake_facts": payload.intake_facts or {},
                "initial_question": payload.question,
                "conversation_history": [],
            },
        )
        db.add(matter)
        db.flush()
        return matter

    def _update_matter_from_state(
        self,
        *,
        matter: Matter,
        payload: QueryRequest,
        state: MatterState,
        effective_question: str,
    ) -> None:
        matter.session_id = payload.session_id or matter.session_id
        issue_summary_basis = effective_question if len(payload.question.strip()) < 24 else payload.question
        matter.issue_summary = self._build_issue_summary(issue_summary_basis)
        matter.last_user_message_at = self._now_utc()

        if state.issue_type:
            matter.issue_type = state.issue_type
        else:
            inferred = self._infer_issue_type(effective_question)
            if inferred:
                matter.issue_type = inferred

        if state.visa_type:
            matter.visa_type = state.visa_type
        else:
            inferred_visa_type = self._infer_visa_type(effective_question)
            if inferred_visa_type:
                matter.visa_type = inferred_visa_type

        matter.risk_level = self._map_risk_level(
            next_action=state.next_action,
            confidence=(state.last_answer_type or "general_guidance"),
            risk_flags=state.risk_flags.model_dump(),
        )

        existing_meta = deepcopy(matter.metadata_json or {})
        existing_meta.update(
            {
                "preferred_jurisdiction": payload.preferred_jurisdiction,
                "preferred_source_types": payload.preferred_source_types or [],
                "intake_facts": payload.intake_facts or {},
                "initial_question": existing_meta.get("initial_question") or payload.question,
            }
        )
        matter.metadata_json = self.state_machine.to_metadata_json(state, base_metadata=existing_meta)

    # ------------------------------------------------------------------
    # Node adapters
    # ------------------------------------------------------------------
    def _contextualize_turn(
        self,
        *,
        question: str,
        conversation_history: list[dict[str, Any]],
        issue_summary: str | None,
        issue_type: str | None,
        visa_type: str | None,
        intake_facts: dict[str, Any],
    ) -> ContextualizationResult:
        raw = self.reasoning_service.contextualize_question(
            question=question,
            conversation_history=conversation_history,
            issue_summary=issue_summary,
            issue_type=issue_type,
            visa_type=visa_type,
            intake_facts=intake_facts,
        )
        if isinstance(raw, ContextualizationResult):
            return raw
        return ContextualizationResult(**raw)

    def _classify_issue_and_operation(
        self,
        *,
        question: str,
        intake_facts: dict[str, Any],
        current_issue_type: str | None,
        current_operation_type: str | None,
        current_visa_type: str | None,
        preferred_jurisdiction: str | None,
    ) -> IssueAndOperation:
        return self.fact_extraction_service.classify_issue_and_operation(
            question=question,
            intake_facts=intake_facts,
            current_issue_type=current_issue_type,
            current_operation_type=current_operation_type,
            current_visa_type=current_visa_type,
            preferred_jurisdiction=preferred_jurisdiction,
        )

    def _extract_fact_updates(
        self,
        *,
        question: str,
        effective_question: str,
        issue_type: str | None,
        operation_type: str | None,
        visa_type: str | None,
        prior_facts: dict[str, Any],
    ) -> FactExtractionResult:
        return self.fact_extraction_service.extract_fact_updates(
            question=question,
            effective_question=effective_question,
            issue_type=issue_type,
            operation_type=operation_type,
            visa_type=visa_type,
            prior_facts=prior_facts,
        )

    # ------------------------------------------------------------------
    # Response / evidence / policy helpers
    # ------------------------------------------------------------------
    def _evidence_from_response(self, response: QueryResponse, state: MatterState) -> EvidencePackage:
        raw = {}
        if getattr(response, "retrieval_debug", None):
            raw = (response.retrieval_debug or {}).get("evidence") or {}
        if isinstance(raw, EvidencePackage):
            return raw
        if isinstance(raw, dict) and raw:
            try:
                return EvidencePackage(**raw)
            except Exception:
                pass

        return EvidencePackage(
            is_in_domain=True,
            is_context_sufficient=False,
            issue_type=response.issue_type or state.issue_type,
            operation_type=state.operation_type,
            missing_information=list(response.missing_facts or []),
            follow_up_questions=list(response.follow_up_questions or []),
        )

    def _apply_policy_to_response(
        self,
        response: QueryResponse,
        policy: PolicyDecision,
        state: MatterState,
    ) -> QueryResponse:
        response.escalate = response.escalate or policy.escalate
        if policy.next_action:
            response.next_action = policy.next_action
        if policy.confidence_cap:
            response.confidence = self._cap_confidence(response.confidence, policy.confidence_cap)
        if not response.issue_type:
            response.issue_type = state.issue_type
        if getattr(response, "retrieval_debug", None) is not None:
            debug = dict(response.retrieval_debug or {})
            debug["policy"] = policy.model_dump()
            response.retrieval_debug = debug
        return response

    def _cap_confidence(self, current: str, cap: str) -> str:
        order = {"low": 0, "medium": 1, "high": 2}
        current_norm = current if current in order else "low"
        cap_norm = cap if cap in order else "low"
        return current_norm if order[current_norm] <= order[cap_norm] else cap_norm

    # ------------------------------------------------------------------
    # Live retrieval helpers
    # ------------------------------------------------------------------
    def _live_chunks_to_shims(self, live_result: LiveRetrievalResult) -> list[_LiveChunkShim]:
        shims: list[_LiveChunkShim] = []
        for idx, chunk in enumerate(live_result.chunks):
            source_id = f"live-source-{idx}-{abs(hash(chunk.url))}"
            source = _LiveSourceShim(
                id=source_id,
                title=chunk.title,
                authority=chunk.authority,
                citation_text=chunk.title,
                url=chunk.url,
                source_type=chunk.source_type,
                metadata_json={
                    **(chunk.metadata_json or {}),
                    "bucket": chunk.bucket or "live_official",
                    "sub_type": chunk.sub_type or "live_official",
                },
            )
            shims.append(
                _LiveChunkShim(
                    id=f"live-chunk-{idx}-{abs(hash((chunk.url, chunk.section_ref, chunk.heading or '')))}",
                    source_id=source_id,
                    section_ref=chunk.section_ref,
                    heading=chunk.heading,
                    text=chunk.text,
                    source=source,
                )
            )
        return shims

    def _merge_chunks(self, local_chunks: list[Any], live_chunks: list[Any]) -> list[Any]:
        merged: list[Any] = []
        seen: set[str] = set()

        for chunk in [*live_chunks, *local_chunks]:
            title = getattr(getattr(chunk, "source", None), "title", "") or ""
            key = "|".join(
                [
                    title,
                    str(getattr(chunk, "section_ref", "") or ""),
                    str(getattr(chunk, "heading", "") or ""),
                    str((getattr(chunk, "text", "") or "")[:120]),
                ]
            )
            if key in seen:
                continue
            seen.add(key)
            merged.append(chunk)
        return merged

    def _enrich_retrieval_debug(
        self,
        *,
        retrieval_debug: dict[str, Any],
        contextualization: ContextualizationResult | None,
        original_question: str,
        effective_question: str,
        live_result: LiveRetrievalResult,
        sufficiency_gate: SufficiencyGateResult,
    ) -> dict[str, Any]:
        live_rows = [
            {
                "title": chunk.title,
                "authority": chunk.authority,
                "url": chunk.url,
                "source_type": chunk.source_type,
                "bucket": chunk.bucket,
                "sub_type": chunk.sub_type,
                "section_ref": chunk.section_ref,
                "heading": chunk.heading,
            }
            for chunk in live_result.chunks[:8]
        ]

        return {
            **retrieval_debug,
            "contextualization": contextualization.model_dump() if contextualization else None,
            "original_question": original_question,
            "effective_question": effective_question,
            "sufficiency_gate": sufficiency_gate.model_dump(),
            "live_fetch_used": live_result.used_live_fetch,
            "live_domains_used": live_result.domains_used,
            "live_result_count": len(live_result.chunks),
            "live_results": live_rows,
            "live_debug": live_result.debug,
        }

    # ------------------------------------------------------------------
    # Persistence helpers
    # ------------------------------------------------------------------
    def _persist_citations(
        self,
        db: Session,
        matter: Matter,
        response: QueryResponse,
    ) -> None:
        db.query(Citation).filter(Citation.matter_id == matter.id).delete(synchronize_session=False)

        for item in response.citations:
            source_id = item.source_id or ""
            chunk_id = item.chunk_id or ""

            # Skip ephemeral live-retrieval citations; they are not in legal_sources/source_chunks
            if source_id.startswith("live-source-") or chunk_id.startswith("live-chunk-"):
                continue

            citation = Citation(
                matter_id=matter.id,
                source_id=item.source_id,
                chunk_id=item.chunk_id,
                case_id=item.case_id,
                quote_text=item.quote_text,
                rationale=item.rationale,
                confidence_score=item.confidence_score,
                used_for="query_response",
            )
            db.add(citation)

    # ------------------------------------------------------------------
    # Legacy helper logic
    # ------------------------------------------------------------------
    def _build_issue_summary(self, question: str) -> str:
        text = (question or "").strip()
        if len(text) <= 240:
            return text
        return text[:237].rstrip() + "..."

    def _infer_issue_type(self, question: str) -> str | None:
        lowered = question.lower()
        if "refusal" in lowered:
            return "visa_refusal"
        if "cancel" in lowered or "cancellation" in lowered:
            return "visa_cancellation"
        if "student visa" in lowered:
            return "student_visa"
        if "partner visa" in lowered:
            return "partner_visa"
        if "skilled" in lowered:
            return "skilled_migration"
        return None

    def _infer_visa_type(self, question: str) -> str | None:
        lowered = question.lower()
        if "student visa" in lowered or "subclass 500" in lowered:
            return "student"
        if "485" in lowered or "temporary graduate" in lowered:
            return "temporary_graduate"
        if "partner visa" in lowered:
            return "partner"
        if "visitor visa" in lowered:
            return "visitor"
        if "bridging visa" in lowered or "bva" in lowered or "bvb" in lowered or "bvc" in lowered or "bve" in lowered:
            return "bridging"
        if "skilled visa" in lowered or "skilled migration" in lowered:
            return "skilled"
        return None

    def _map_risk_level(self, *, next_action: str | None, confidence: str | None, risk_flags: dict[str, Any] | None = None) -> str:
        risk_flags = risk_flags or {}
        if next_action == "suggest_consultation":
            return "high"
        if any(bool(v) for v in risk_flags.values()):
            return "high"
        if confidence == "high":
            return "low"
        return "medium"

    def _now_utc(self) -> datetime:
        return datetime.now(timezone.utc)