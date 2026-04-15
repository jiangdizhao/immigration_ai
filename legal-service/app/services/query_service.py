from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.db.models import Citation, Matter
from app.schemas.query import QueryRequest, QueryResponse
from app.services.reasoning_service import ReasoningService
from app.services.retrieval_service import RetrievalService


class QueryService:
    def __init__(
        self,
        retrieval_service: RetrievalService | None = None,
        reasoning_service: ReasoningService | None = None,
    ) -> None:
        self.retrieval_service = retrieval_service or RetrievalService()
        self.reasoning_service = reasoning_service or ReasoningService()
        self.max_history_turns = 12

    def run(self, db: Session, payload: QueryRequest) -> QueryResponse:
        return self.handle_query(db, payload)

    def handle_query(self, db: Session, payload: QueryRequest) -> QueryResponse:
        matter = self._get_or_create_matter(db, payload)

        conversation_history = self._conversation_history(matter)
        carried_intake_facts = self._carried_intake_facts(matter)
        merged_intake_facts = self._merge_intake_facts(carried_intake_facts, payload.intake_facts or {})

        contextualized = self.reasoning_service.contextualize_question(
            question=payload.question,
            conversation_history=conversation_history,
            issue_summary=matter.issue_summary,
            issue_type=matter.issue_type,
            visa_type=matter.visa_type,
            intake_facts=merged_intake_facts,
        )
        effective_question = contextualized.get("standalone_question") or payload.question
        contextualized_facts = contextualized.get("carried_facts") or {}
        merged_intake_facts = self._merge_intake_facts(merged_intake_facts, contextualized_facts)

        effective_payload = QueryRequest(
            **{
                **payload.model_dump(),
                "matter_id": matter.id,
                "question": effective_question,
                "intake_facts": merged_intake_facts,
            }
        )

        chunks, retrieval_debug = self.retrieval_service.retrieve(db, effective_payload)
        retrieval_debug = {
            **retrieval_debug,
            "contextualization": contextualized,
            "original_question": payload.question,
            "effective_question": effective_question,
        }

        response = self.reasoning_service.answer_from_chunks(
            payload=payload,
            chunks=chunks,
            retrieval_debug=retrieval_debug,
            conversation_context={
                "history": conversation_history,
                "issue_summary": matter.issue_summary,
                "issue_type": matter.issue_type,
                "visa_type": matter.visa_type,
                "intake_facts": merged_intake_facts,
                "effective_question": effective_question,
            },
        )

        response.matter_id = matter.id

        self._update_matter_from_query(
            matter=matter,
            payload=payload,
            response=response,
            effective_question=effective_question,
            merged_intake_facts=merged_intake_facts,
        )
        self._persist_citations(db, matter, response)

        db.commit()
        db.refresh(matter)

        return response

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

    def _update_matter_from_query(
        self,
        matter: Matter,
        payload: QueryRequest,
        response: QueryResponse,
        effective_question: str,
        merged_intake_facts: dict[str, Any],
    ) -> None:
        matter.session_id = payload.session_id or matter.session_id
        issue_summary_basis = effective_question if len(payload.question.strip()) < 24 else payload.question
        matter.issue_summary = self._build_issue_summary(issue_summary_basis)
        matter.last_user_message_at = self._now_utc()

        if response.issue_type:
            matter.issue_type = response.issue_type
        else:
            inferred = self._infer_issue_type(effective_question)
            if inferred:
                matter.issue_type = inferred

        inferred_visa_type = self._infer_visa_type(effective_question)
        if inferred_visa_type:
            matter.visa_type = inferred_visa_type

        matter.risk_level = self._map_risk_level(response)

        existing_meta = deepcopy(matter.metadata_json or {})
        history = list(existing_meta.get("conversation_history") or [])
        history.extend(
            [
                {
                    "role": "user",
                    "content": payload.question,
                    "effective_question": effective_question,
                    "timestamp": self._now_utc().isoformat(),
                },
                {
                    "role": "assistant",
                    "content": response.answer,
                    "next_action": response.next_action,
                    "confidence": response.confidence,
                    "timestamp": self._now_utc().isoformat(),
                },
            ]
        )
        history = history[-self.max_history_turns :]

        existing_meta.update(
            {
                "preferred_jurisdiction": payload.preferred_jurisdiction,
                "preferred_source_types": payload.preferred_source_types or [],
                "intake_facts": payload.intake_facts or {},
                "carried_intake_facts": merged_intake_facts,
                "latest_question": payload.question,
                "last_contextualized_question": effective_question,
                "next_action": response.next_action,
                "escalate": response.escalate,
                "confidence": response.confidence,
                "conversation_history": history,
            }
        )
        matter.metadata_json = existing_meta

    def _persist_citations(
        self,
        db: Session,
        matter: Matter,
        response: QueryResponse,
    ) -> None:
        db.query(Citation).filter(Citation.matter_id == matter.id).delete(synchronize_session=False)

        for item in response.citations:
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

    def _conversation_history(self, matter: Matter) -> list[dict[str, Any]]:
        metadata = matter.metadata_json or {}
        history = metadata.get("conversation_history") or []
        return [item for item in history if isinstance(item, dict)][-self.max_history_turns :]

    def _carried_intake_facts(self, matter: Matter) -> dict[str, Any]:
        metadata = matter.metadata_json or {}
        carried = metadata.get("carried_intake_facts") or metadata.get("intake_facts") or {}
        return carried if isinstance(carried, dict) else {}

    def _merge_intake_facts(self, base: dict[str, Any], new: dict[str, Any]) -> dict[str, Any]:
        merged = dict(base or {})
        for key, value in (new or {}).items():
            if value is None:
                continue
            merged[key] = value
        return merged

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

    def _map_risk_level(self, response: QueryResponse) -> str:
        if response.escalate:
            return "high"
        if response.confidence == "high":
            return "low"
        return "medium"

    def _now_utc(self) -> datetime:
        return datetime.now(timezone.utc)