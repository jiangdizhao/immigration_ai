from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.schemas.query import QueryRequest
from app.schemas.state import MatterState
from app.schedule.criterion_pack_resolver import CriterionPackResolver
from app.schedule.schedule2_candidate_service import Schedule2CandidateSearchService
from app.schedule.schedule2_index_service import ScheduleIndexService
from app.services.retrieval_service import RetrievalService
from app.services.subclass_485_criterion_pack import Subclass485CriterionPack
from app.services.subclass_500_criterion_pack import Subclass500CriterionPack
from app.services.targeted_evidence_retriever import TargetedEvidenceRetriever


class ScheduleAwareReasoningService:
    """Schedule-2-first criterion reasoning entry point.

    This service keeps existing enhanced 485/500 packs, but inserts a generic
    Schedule 2 candidate-search layer before pack selection. For subclasses that
    do not yet have a hand-built tree, it creates a rough generic Schedule 2
    criterion pack instead of falling back to broad RAG.
    """

    def __init__(
        self,
        *,
        subclass_485_pack: Subclass485CriterionPack | None = None,
        subclass_500_pack: Subclass500CriterionPack | None = None,
        targeted_retriever: TargetedEvidenceRetriever | None = None,
        index_service: ScheduleIndexService | None = None,
        candidate_service: Schedule2CandidateSearchService | None = None,
        pack_resolver: CriterionPackResolver | None = None,
    ) -> None:
        self.index_service = index_service or ScheduleIndexService()
        self.subclass_485_pack = subclass_485_pack or Subclass485CriterionPack()
        self.subclass_500_pack = subclass_500_pack or Subclass500CriterionPack()
        self.targeted_retriever = targeted_retriever or TargetedEvidenceRetriever()
        self.candidate_service = candidate_service or Schedule2CandidateSearchService(index_service=self.index_service)
        self.pack_resolver = pack_resolver or CriterionPackResolver(
            index_service=self.index_service,
            subclass_485_pack=self.subclass_485_pack,
            subclass_500_pack=self.subclass_500_pack,
        )

    def assess(
        self,
        *,
        db: Session,
        payload: QueryRequest,
        question: str,
        known_facts: dict[str, Any],
        current_state: MatterState | None,
        retrieval_service: RetrievalService,
    ) -> tuple[dict[str, Any] | None, list[Any], dict[str, Any]]:
        visa_type = getattr(current_state, "visa_type", None) if current_state is not None else None
        facts = dict(known_facts or {})

        candidates = self.candidate_service.search(question=question, known_facts=facts)
        pack, pack_name, resolver_debug = self.pack_resolver.resolve(
            candidates=candidates,
            question=question,
            known_facts=facts,
            visa_type=visa_type,
        )

        if pack is None:
            debug = {
                "is_active": False,
                "reason": "no_schedule2_candidate_or_supported_pack",
                "schedule2_candidates": [candidate.model_dump() for candidate in candidates],
                "resolver": resolver_debug,
            }
            return None, [], debug

        active_nodes = pack.active_nodes_preview(question=question, facts=facts, visa_type=visa_type)
        targeted = self.targeted_retriever.retrieve_for_nodes(
            db=db,
            base_payload=payload,
            nodes=active_nodes,
            retrieval_service=retrieval_service,
        )

        assessment = pack.assess(
            question=question,
            facts=facts,
            evidence_by_node=targeted.evidence_by_node,
            visa_type=visa_type,
        )
        assessment_dict = assessment.to_dict()
        assessment_dict["targeted_retrieval"] = targeted.to_debug_dict()
        assessment_dict["active_pack"] = pack_name
        assessment_dict["schedule2_candidates"] = [candidate.model_dump() for candidate in candidates]
        assessment_dict["pack_resolver"] = resolver_debug
        assessment_dict["schedule2_first"] = True

        return assessment_dict, targeted.chunks, {
            "is_active": True,
            "active_pack": pack_name,
            "assessment": assessment_dict,
            "targeted_retrieval": targeted.to_debug_dict(),
            "schedule2_candidates": [candidate.model_dump() for candidate in candidates],
            "pack_resolver": resolver_debug,
        }

    def _choose_pack(self, *, question: str, known_facts: dict[str, Any], visa_type: str | None) -> str | None:
        """Backward-compatible helper retained for old tests.

        New code should use Schedule 2 candidates plus CriterionPackResolver.
        """
        candidates = self.candidate_service.search(question=question, known_facts=known_facts)
        _pack, pack_name, _debug = self.pack_resolver.resolve(
            candidates=candidates,
            question=question,
            known_facts=known_facts,
            visa_type=visa_type,
        )
        return pack_name

    def merge_targeted_chunks(self, local_chunks: list[Any], targeted_chunks: list[Any]) -> list[Any]:
        merged: list[Any] = []
        seen: set[str] = set()
        for chunk in [*targeted_chunks, *local_chunks]:
            chunk_id = str(getattr(chunk, "id", "") or "")
            if chunk_id and chunk_id in seen:
                continue
            if chunk_id:
                seen.add(chunk_id)
            merged.append(chunk)
        return merged

    def answerability_context(self, assessment: dict[str, Any] | None) -> dict[str, Any]:
        if not assessment:
            return {}
        missing = assessment.get("missing_facts") or []
        risk_flags = assessment.get("risk_flags") or []
        policy_overlays = assessment.get("policy_overlays") or []
        current_policy_flags = assessment.get("current_policy_flags") or []
        return {
            "schedule_aware_active": bool(assessment.get("is_active")),
            "schedule2_first": bool(assessment.get("schedule2_first")),
            "subclass": assessment.get("subclass"),
            "active_pack": assessment.get("active_pack"),
            "active_pathway": assessment.get("active_pathway"),
            "candidate_pathways": assessment.get("candidate_pathways") or [],
            "schedule2_candidates": assessment.get("schedule2_candidates") or [],
            "recommended_next_fact": assessment.get("recommended_next_fact"),
            "recommended_next_question": assessment.get("recommended_next_question"),
            "missing_facts": missing,
            "risk_flags": risk_flags,
            "policy_overlays": policy_overlays,
            "current_policy_flags": current_policy_flags,
            "answer_blocking_missing_facts": assessment.get("answer_blocking_missing_facts") or [],
            "answerable_provisionally": assessment.get("answerable_provisionally", True),
            "criteria": assessment.get("criteria") or [],
            "instruction": (
                "Use Schedule 2 candidate search as the legal anchor. "
                "Use enhanced 485/500 packs when selected; otherwise use the generic Schedule 2 frame. "
                "Schedule 1 is a validity gateway, not the primary grant-criteria tree. "
                "Special Schedule 3, PIC 4000-series, health/character, and Schedule 8 condition issues are deferred lawyer-check dependencies unless specifically supported. "
                "Always give a bounded partial answer first, then ask at most one decisive fact selected by the criterion engine."
            ),
        }
