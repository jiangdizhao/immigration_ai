from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.schemas.query import QueryRequest
from app.schemas.state import MatterState
from app.services.retrieval_service import RetrievalService
from app.services.subclass_485_criterion_pack import Subclass485CriterionPack
from app.services.targeted_evidence_retriever import TargetedEvidenceRetriever


class ScheduleAwareReasoningService:
    """
    Schedule-aware criterion reasoning entry point.

    This service is intentionally conservative:
    - it currently activates only for Subclass 485 / Temporary Graduate questions;
    - it does not replace the existing RAG pipeline;
    - it adds targeted criterion evidence and structured reasoning trace.
    """

    def __init__(
        self,
        *,
        subclass_485_pack: Subclass485CriterionPack | None = None,
        targeted_retriever: TargetedEvidenceRetriever | None = None,
    ) -> None:
        self.subclass_485_pack = subclass_485_pack or Subclass485CriterionPack()
        self.targeted_retriever = targeted_retriever or TargetedEvidenceRetriever()

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
        if not self.subclass_485_pack.is_relevant(question=question, facts=known_facts, visa_type=visa_type):
            return None, [], {"is_active": False, "reason": "not_subclass_485_or_temporary_graduate"}

        active_nodes = self.subclass_485_pack.active_nodes_preview(
            question=question,
            facts=known_facts,
            visa_type=visa_type,
        )

        targeted = self.targeted_retriever.retrieve_for_nodes(
            db=db,
            base_payload=payload,
            nodes=active_nodes,
            retrieval_service=retrieval_service,
        )

        assessment = self.subclass_485_pack.assess(
            question=question,
            facts=known_facts,
            evidence_by_node=targeted.evidence_by_node,
            visa_type=visa_type,
        )
        assessment_dict = assessment.to_dict()
        assessment_dict["targeted_retrieval"] = targeted.to_debug_dict()

        return assessment_dict, targeted.chunks, {
            "is_active": True,
            "assessment": assessment_dict,
            "targeted_retrieval": targeted.to_debug_dict(),
        }

    def merge_targeted_chunks(self, local_chunks: list[Any], targeted_chunks: list[Any]) -> list[Any]:
        # Put targeted Schedule evidence first, but preserve existing local RAG results.
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
            "subclass": assessment.get("subclass"),
            "active_pathway": assessment.get("active_pathway"),
            "candidate_pathways": assessment.get("candidate_pathways") or [],
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
                "Use this criterion trace as the legal structure for schedule-aware reasoning. "
                "Treat Schedule 1 as validity and Schedule 2 as grant criteria. "
                "Treat current_policy_overlay criteria as freshness-sensitive policy checks, not as ordinary missing facts. "
                "Do not expose every missing criterion to customers; answer first and ask at most one high-priority question."
            ),
        }

