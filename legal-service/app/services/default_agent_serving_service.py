"""Phase 2 customer-serving adapter for the bounded Default Luna runtime.

This module deliberately contains orchestration only.  AgentRuntimeService
owns the provider/tool loop and mechanical submission contract; this adapter
connects its accepted submission to the existing Matter, response, review,
and archive lifecycle without invoking the legacy PFVD handler.
"""

from __future__ import annotations

import asyncio
import logging
import time
from datetime import date
from typing import Any
from uuid import uuid4

from app.core.config import get_settings
from app.schemas.agent import AgentRuntimeRequest, ExecutionBudget
from app.schemas.query import QueryRequest, QueryResponse
from app.schemas.source import CitationOut
from app.services.agent_observability_service import AbsoluteTurnDeadline, AgentObservabilityService
from app.services.evidence_salvage_finalizer import EvidenceSalvageFinalizer
from app.services.request_evidence_registry import RequestEvidenceRegistry, create_registry

logger = logging.getLogger(__name__)


class DefaultAgentServingService:
    """Run one Default Luna request and adapt its accepted submission."""

    RUNTIME_ARCHITECTURE = "phase2.default_agent_runtime"
    RUNTIME_ARM = "N"

    def answer(
        self,
        *,
        query_service: Any,
        db: Any,
        payload: QueryRequest,
        deadline: AbsoluteTurnDeadline | None = None,
        observability: AgentObservabilityService | None = None,
    ) -> QueryResponse:
        settings = get_settings()
        original_question = payload.question
        response_language = query_service.language_service.detect_response_language(
            original_question,
            payload.response_language,
        )
        matter_id = payload.matter_id
        registry: RequestEvidenceRegistry | None = None
        result: Any | None = None
        request_id = (observability.trace_payload() or {}).get("request_id") if observability else None
        request_id = request_id or str(uuid4())
        turn_id = payload.client_turn_id or str(uuid4())

        try:
            matter = query_service._get_or_create_matter(db, payload)
            matter_id = matter.id
            current_state = query_service.state_machine.hydrate_state(matter.metadata_json)

            if deadline is None:
                deadline = AbsoluteTurnDeadline(
                    started_at=time.perf_counter(),
                    turn_deadline_ms=settings.default_turn_deadline_ms,
                )
            budget = ExecutionBudget(
                max_tool_rounds=settings.agent_max_tool_rounds,
                max_provider_calls=settings.agent_max_provider_calls,
                max_retries=settings.agent_max_retries,
                turn_deadline_ms=settings.default_turn_deadline_ms,
                answer_research_target_ms=settings.default_answer_research_target_ms,
                checker_target_ms=settings.legal_fact_check_target_ms,
                max_flat_rag_calls=settings.agent_max_flat_rag_calls,
                max_schedule2_navigation_calls=settings.agent_max_schedule2_navigation_calls,
                max_exact_legal_lookup_calls=settings.agent_max_exact_legal_lookup_calls,
                retry_viability_threshold_ms=settings.agent_retry_viability_threshold_ms,
                terminal_synthesis_target_ms=settings.default_terminal_synthesis_target_ms,
                final_response_reserve_ms=settings.default_final_response_reserve_ms,
                terminal_synthesis_min_start_budget_ms=settings.terminal_synthesis_min_start_budget_ms,
            )

            runtime_state = self._compact_state(
                current_state=current_state,
                matter=matter,
                query_service=query_service,
            )
            runtime_request = AgentRuntimeRequest(
                request_id=request_id,
                turn_id=turn_id,
                mode="default",
                user_text=original_question,
                response_language=response_language,
                as_of_date=date.today(),
                matter_state=runtime_state,
                execution_budget=budget,
                experiment_arm=self.RUNTIME_ARM,
                applicability_protocol_enabled=(
                    settings.default_applicability_protocol_enabled
                ),
            )
            registry = create_registry(request_id)

            from app.services.agent_runtime_service import AgentRuntimeService
            from app.services.openai_responses_adapter import OpenAIResponsesAdapter

            flat_rag_search_fn = None
            flat_tool = None
            if settings.flat_rag_tool_enabled:
                from app.tools.flat_rag_search import FlatRagSearchTool

                flat_tool = FlatRagSearchTool(db)
                flat_rag_search_fn = flat_tool.search

            runtime = AgentRuntimeService(provider=OpenAIResponsesAdapter())
            result = asyncio.run(
                runtime.run(
                    runtime_request,
                    deadline=deadline,
                    registry=registry,
                    flat_rag_search_fn=flat_rag_search_fn,
                    db_session=db,
                )
            )
            if observability is not None:
                observability.record_agent_execution_metrics(result.metrics)

            if result.submission is None:
                response = self._failure_response(
                    matter_id=matter_id,
                    response_language=response_language,
                    result=result,
                    registry=registry,
                )
                self._record_trace(
                    query_service=query_service,
                    matter=matter,
                    payload=payload,
                    response=response,
                    state=current_state,
                    original_question=original_question,
                    effective_question=original_question,
                    result=result,
                    registry=registry,
                )
                return response

            response = self._response_from_submission(
                matter_id=matter_id,
                response_language=response_language,
                submission=result.submission,
                result=result,
                registry=registry,
            )
            state = self._state_after_answer(
                query_service=query_service,
                current_state=current_state,
                question=original_question,
                response=response,
            )
            query_service._update_matter_from_state(
                matter=matter,
                payload=payload,
                state=state,
                effective_question=original_question,
            )
            db.commit()
            db.refresh(matter)
            response.matter_id = matter.id
            response.conversation_state = state.conversation_state
            response.case_hypothesis = state.case_hypothesis
            response.fact_slot_states = state.fact_slot_states
            response.interaction_plan = state.interaction_plan
            self._record_trace(
                query_service=query_service,
                matter=matter,
                payload=payload,
                response=response,
                state=state,
                original_question=original_question,
                effective_question=original_question,
                result=result,
                registry=registry,
            )
            return response
        except Exception as exc:
            logger.exception("Default AgentRuntime serving path failed")
            return self._failure_response(
                matter_id=matter_id,
                response_language=response_language,
                result=result,
                error=exc,
                registry=registry,
            )
        finally:
            if registry is not None:
                registry.dispose()

    def _compact_state(self, *, current_state: Any, matter: Any, query_service: Any) -> dict[str, Any]:
        """Return bounded state only; no hidden reasoning or raw trace."""

        settings = get_settings()
        if settings.compact_matter_state_enabled:
            try:
                compact = query_service.compact_matter_state_service.load_or_create(
                    metadata_json=matter.metadata_json,
                    matter_id=str(matter.id),
                    session_id=matter.session_id,
                    frontend_chat_id=matter.frontend_chat_id,
                )
                if compact is not None:
                    projected = compact.model_dump(mode="json")
                    # Prior evidence refs are request-scoped and must never be
                    # presented as reusable evidence to a later turn.
                    projected.pop("research_ledger", None)
                    return projected
            except Exception:
                logger.warning("Compact matter state unavailable; using bounded legacy projection")

        facts = dict(current_state.carried_intake_facts or {})
        return {
            "schema_version": "matter_state.v2",
            "active_thread": {
                "issue_type": current_state.issue_type,
                "operation_type": current_state.operation_type,
                "status": current_state.conversation_state,
            },
            "confirmed_facts": dict(list(facts.items())[:40]),
            "fact_status": dict(list((current_state.fact_status or {}).items())[:40]),
            "risk_flags": current_state.risk_flags.model_dump(mode="json"),
            "latest_question": current_state.latest_question,
            "last_contextualized_question": current_state.last_contextualized_question,
            "visa_type": current_state.visa_type,
            "next_action": current_state.next_action,
            "recent_turns": [turn.model_dump(mode="json") for turn in current_state.conversation_history[-8:]],
        }

    def _response_from_submission(
        self,
        *,
        matter_id: str | None,
        response_language: str,
        submission: Any,
        result: Any,
        registry: RequestEvidenceRegistry,
    ) -> QueryResponse:
        citations: list[CitationOut] = []
        compact_sources: list[str] = []
        seen: set[str] = set()
        for citation in submission.citations:
            if citation.evidence_ref in seen:
                continue
            try:
                entry = registry.resolve(citation.evidence_ref)
                record = entry.evidence_record
                if record is None:
                    continue
                if entry.evidence_origin == "openai_web_native":
                    title = getattr(record, "title", None) or citation.display_label
                    url = getattr(record, "url", "") or ""
                    output = CitationOut(
                        source_id=citation.evidence_ref,
                        chunk_id=entry.search_call_id,
                        title=title,
                        authority="web",
                        citation_text=citation.display_label,
                        url=url,
                        rationale="Request-scoped provider-native web evidence",
                    )
                else:
                    title = citation.display_label
                    url = getattr(record, "canonical_url", None) or getattr(record, "url", None) or ""
                    output = CitationOut(
                        source_id=entry.canonical_source_id or citation.evidence_ref,
                        chunk_id=entry.canonical_chunk_id,
                        title=title,
                        authority=getattr(record, "authority_kind", "canonical_local"),
                        citation_text=citation.display_label,
                        section_ref=entry.provision_or_span,
                        url=url,
                        quote_text=(getattr(record, "text", None) or "")[:1000] or None,
                        rationale="Request-scoped canonical legal evidence",
                    )
                citations.append(output)
                compact_sources.append(
                    f"{output.title} ({output.url})" if output.url else output.title
                )
                seen.add(citation.evidence_ref)
            except Exception:
                logger.warning("Dropping an unresolvable serving citation", exc_info=True)

        metrics = result.metrics.model_dump(mode="json")
        debug = self._debug_payload(result=result, metrics=metrics, registry=registry)
        is_safety = submission.answer_class == "safety_blocked"
        next_action = "suggest_consultation" if is_safety else submission.next_action
        display_mode = submission.user_display_mode or (
            "escalate_with_brief_reason" if next_action == "suggest_consultation" else "direct_short"
        )
        return QueryResponse(
            matter_id=matter_id,
            answer=submission.draft_markdown,
            response_language="zh" if response_language == "zh" else "en",
            confidence="medium" if submission.answer_class == "substantive_legal" else "high",
            user_display_mode=display_mode,
            issue_type="agent_runtime_default",
            missing_facts=[],
            follow_up_questions=[],
            citations=citations,
            compact_sources=compact_sources,
            escalate=is_safety or next_action == "suggest_consultation",
            next_action=next_action,
            retrieval_debug=debug,
            architecture_version=self.RUNTIME_ARCHITECTURE,
            research_status=submission.research_status,
            fact_check_status=self._fact_check_status(result),
        )

    def _failure_response(
        self,
        *,
        matter_id: str | None,
        response_language: str,
        result: Any | None,
        error: Exception | None = None,
        registry: RequestEvidenceRegistry | None = None,
    ) -> QueryResponse:
        is_zh = response_language == "zh"
        metrics = result.metrics.model_dump(mode="json") if result is not None else {}
        recovery_triggered = bool(
            result is not None
            and (
                metrics.get("terminal_recovery_triggered", False)
                or getattr(result, "terminal_continuation_triggered", False)
            )
        )
        if recovery_triggered and registry is not None and result is not None:
            entries = []
            for evidence_ref in registry.get_all_refs():
                try:
                    entries.append(registry.resolve(evidence_ref))
                except Exception:
                    continue
            salvage = EvidenceSalvageFinalizer.build(
                is_zh=is_zh,
                local_entries=entries,
                citation_count=sum(
                    bool(getattr(entry, "native_web_citation", None))
                    for entry in entries
                    if getattr(entry, "evidence_origin", None) == "openai_web_native"
                ),
                web_sources=[
                    {
                        "title": getattr(entry.evidence_record, "title", None),
                        "url": getattr(entry, "url", None),
                        "evidence_ref": entry.evidence_ref,
                        "search_call_id": getattr(entry, "search_call_id", None)
                        or getattr(entry, "tool_call_id", None),
                    }
                    for entry in entries
                    if getattr(entry, "evidence_origin", None)
                    in {"openai_web_native", "fetched_web"}
                ],
            )
            if salvage is not None:
                result.completion_status = "evidence_salvage"
                result.metrics = result.metrics.model_copy(
                    update={
                        "completion_status": "evidence_salvage",
                        **salvage.telemetry,
                    }
                )
                metrics = result.metrics.model_dump(mode="json")
                debug = self._debug_payload(
                    result=result,
                    metrics=metrics,
                    registry=registry,
                )
                debug.update({
                    "completion_status": "evidence_salvage",
                    "evidence_salvage": salvage.telemetry,
                    "execution_metrics": metrics,
                })
                return QueryResponse(
                    matter_id=matter_id,
                    answer=salvage.answer,
                    response_language="zh" if is_zh else "en",
                    confidence="low",
                    user_display_mode="escalate_with_brief_reason",
                    issue_type="agent_runtime_default",
                    citations=salvage.citations,
                    compact_sources=salvage.compact_sources,
                    escalate=True,
                    next_action="suggest_consultation",
                    retrieval_debug=debug,
                    architecture_version=self.RUNTIME_ARCHITECTURE,
                    research_status="incomplete",
                    fact_check_status="uncertain",
                )
        return QueryResponse(
            matter_id=matter_id,
            answer=(
                "我未能在可用时间内完成研究，因此没有足够的已核实材料给出完整答复。你可以重试、缩小问题范围，"
                "或安排律师咨询。"
                if is_zh
                else "I couldn't complete the research within the available time, so I don't have enough verified material to give you a complete answer. You can retry the question, narrow its scope, or arrange a lawyer consultation."
            ),
            response_language="zh" if is_zh else "en",
            confidence="low",
            user_display_mode="escalate_with_brief_reason",
            issue_type="agent_runtime_default",
            citations=[],
            compact_sources=[],
            escalate=True,
            next_action="suggest_consultation",
            retrieval_debug={
                "agent_runtime_serving": True,
                "runtime_architecture": self.RUNTIME_ARCHITECTURE,
                "legacy_pfvd_skipped": True,
                "fallback_to_pfvd": False,
                "failure_neutral": True,
                "error_type": error.__class__.__name__ if error else None,
                "execution_metrics": metrics,
            },
            architecture_version=self.RUNTIME_ARCHITECTURE,
            research_status="incomplete",
            fact_check_status="failed" if result is not None else "not_required",
        )

    def _state_after_answer(self, *, query_service: Any, current_state: Any, question: str, response: QueryResponse) -> Any:
        state = current_state.model_copy(deep=True)
        state.latest_question = question
        state.last_contextualized_question = question
        state.operation_type = "agent_runtime_default"
        state.next_action = response.next_action
        state.last_answer_type = "agent_runtime_default"
        state.conversation_state = "ESCALATION_READY" if response.escalate else "ANSWERED_GENERAL"
        return query_service.state_machine.append_turn_pair(
            state=state,
            user_question=question,
            effective_question=question,
            assistant_answer=response.answer,
            next_action=response.next_action,
            confidence=response.confidence,
        )

    def _record_trace(self, *, query_service: Any, matter: Any, payload: QueryRequest, response: QueryResponse, state: Any, original_question: str, effective_question: str, result: Any, registry: RequestEvidenceRegistry) -> str | None:
        try:
            trace_id = query_service.review_trace_service.safe_record_answer_trace(
                matter=matter,
                payload=payload,
                response=response,
                state=state,
                original_question=original_question,
                effective_question=effective_question,
                stage_timing={
                    "engine": self.RUNTIME_ARCHITECTURE,
                    "workflow": "bounded_agent_runtime_luna",
                },
                extra_debug={"runtime_patch": "unified_context_runtime_patch"},
                execution_metrics=result.metrics,
                evidence_registry=registry,
            )
            if trace_id:
                response.trace_id = trace_id
            return trace_id
        except Exception:
            logger.exception("Default AgentRuntime answer trace recording failed")
            return None

    def _debug_payload(self, *, result: Any, metrics: dict[str, Any], registry: RequestEvidenceRegistry) -> dict[str, Any]:
        settings = get_settings()
        checker_decisions = list(getattr(result, "checker_decisions", []) or [])
        checker_packet_manifest = dict(
            getattr(result, "checker_packet_manifest", {}) or {}
        )
        checker_public_decisions = [
            {
                "claim_id": item.get("claim_id"),
                "verdict": item.get("verdict"),
                "reason_codes": list(item.get("reason_codes") or []),
                "evidence_refs": list(item.get("evidence_refs") or []),
            }
            for item in checker_decisions[:100]
            if isinstance(item, dict)
        ]
        checker_packet_summary = {
            key: checker_packet_manifest.get(key)
            for key in (
                "material_claim_count",
                "checker_evidence_count",
                "canonical_local_count",
                "native_web_count",
                "evidence_with_backend_text_count",
                "checker_evidence_text_chars",
                "matter_fact_chars",
                "serialized_packet_chars",
            )
            if key in checker_packet_manifest
        }
        terminal_recovery_triggered = bool(
            metrics.get("terminal_recovery_triggered", False)
            or getattr(result, "terminal_continuation_triggered", False)
        )
        # Keep the nested recovery event and its execution-metrics mirror on a
        # single canonical value.  This also repairs older result doubles that
        # expose only terminal_continuation_triggered.
        metrics["terminal_recovery_triggered"] = terminal_recovery_triggered
        return {
            "agent_runtime_serving": True,
            "runtime_architecture": self.RUNTIME_ARCHITECTURE,
            "model": result.model,
            "reasoning_effort": settings.default_agent_reasoning_effort,
            "experiment_arm": self.RUNTIME_ARM,
            "applicability_protocol_enabled": metrics.get(
                "applicability_protocol_enabled", True
            ),
            "legacy_pfvd_skipped": True,
            "fallback_to_pfvd": False,
            "tool_policy": {
                "tool_choice": settings.agent_tool_choice,
                "max_tool_rounds": settings.agent_max_tool_rounds,
                "max_provider_calls": settings.agent_max_provider_calls,
                "max_retries": settings.agent_max_retries,
                "max_flat_rag_calls": settings.agent_max_flat_rag_calls,
                "native_web_enabled": settings.web_search_enabled,
                "flat_rag_enabled": settings.flat_rag_tool_enabled,
                "exact_lookup_enabled": settings.exact_legal_lookup_enabled,
                "graph_navigation_only": True,
            },
            "evidence_registry": {
                "request_scoped": True,
                "total_refs": len(registry.get_all_refs()),
                "canonical_local_refs": len(registry.get_refs_by_origin("canonical_local")),
                "native_web_refs": len(registry.get_refs_by_origin("openai_web_native")),
                "graph_evidence_count": 0,
            },
            "reasoning_bank": result.reasoning_bank_telemetry,
            "checker": {
                "status": result.checker_status,
                "provider_call_count": result.checker_provider_call_count,
                "tool_call_count": result.checker_result_tool_call_count,
                "checker_error_code": getattr(result, "checker_error_code", None),
                "checker_latency_ms": getattr(result, "checker_latency_ms", 0.0),
                "checker_timeout_allocated_ms": getattr(
                    result, "checker_timeout_allocated_ms", 0.0
                ),
                "checker_remaining_budget_before_ms": getattr(
                    result, "checker_remaining_budget_before_ms", 0.0
                ),
                "checker_remaining_budget_after_ms": getattr(
                    result, "checker_remaining_budget_after_ms", 0.0
                ),
                "customer_text_mutated": False,
                "keep_count": metrics.get("checker_keep_count", 0),
                "flag_count": metrics.get("checker_flag_count", 0),
                "block_count": metrics.get("checker_block_count", 0),
                "dependency_block_count": metrics.get("checker_dependency_block_count", 0),
                "material_omission_suspected": getattr(
                    result, "checker_material_omission_suspected", False
                ),
                "material_omission_evidence_refs": list(
                    getattr(result, "checker_material_omission_evidence_refs", []) or []
                ),
                "decisions": checker_public_decisions,
            },
            "phase6": {
                "status": result.checker_status,
                "checker_required": bool(checker_decisions or checker_packet_manifest),
                "error_code": getattr(result, "checker_error_code", None),
                "latency_ms": getattr(result, "checker_latency_ms", 0.0),
                "model": getattr(result, "checker_model", None),
                "reasoning_effort": getattr(result, "checker_reasoning_effort", None),
                "decisions": checker_decisions,
                "material_omission_suspected": getattr(
                    result, "checker_material_omission_suspected", False
                ),
                "material_omission_evidence_refs": list(
                    getattr(result, "checker_material_omission_evidence_refs", []) or []
                ),
                "checker_packet": checker_packet_manifest,
            },
            "checker_packet": checker_packet_summary,
            "terminal_recovery": {
                "triggered": terminal_recovery_triggered,
                "reason": getattr(result, "terminal_continuation_reason", None),
                "model": getattr(result, "terminal_model", None),
                "timeout_allocated_ms": getattr(result, "terminal_timeout_allocated_ms", 0.0),
                "web_search_enabled": getattr(result, "terminal_web_search_enabled", False),
                "research_stage_exhausted": getattr(result, "research_stage_exhausted", False),
                "completion_status": getattr(result, "completion_status", None),
            },
            "execution_metrics": metrics,
        }

    @staticmethod
    def _fact_check_status(result: Any) -> str:
        if result.checker_status == "completed":
            return "pass"
        if result.checker_status == "failed":
            return "failed"
        if result.checker_status == "skipped":
            return "uncertain"
        return "not_required"
