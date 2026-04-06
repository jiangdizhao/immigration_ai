from __future__ import annotations

from datetime import datetime, timezone

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

    def run(self, db: Session, payload: QueryRequest) -> QueryResponse:
        return self.handle_query(db, payload)

    def handle_query(self, db: Session, payload: QueryRequest) -> QueryResponse:
        matter = self._get_or_create_matter(db, payload)

        chunks, retrieval_debug = self.retrieval_service.retrieve(db, payload)

        response = self.reasoning_service.answer_from_chunks(
            payload=payload,
            chunks=chunks,
            retrieval_debug=retrieval_debug,
        )

        response.matter_id = matter.id

        self._update_matter_from_query(db, matter, payload, response)
        self._persist_citations(db, matter, response)

        db.commit()
        db.refresh(matter)

        return response

    def _get_or_create_matter(self, db: Session, payload: QueryRequest) -> Matter:
        if payload.matter_id:
            matter = db.get(Matter, payload.matter_id)
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
                "initial_question": payload.question,
            },
        )
        db.add(matter)
        db.flush()
        return matter

    def _update_matter_from_query(
        self,
        db: Session,
        matter: Matter,
        payload: QueryRequest,
        response: QueryResponse,
    ) -> None:
        matter.session_id = payload.session_id or matter.session_id
        matter.issue_summary = self._build_issue_summary(payload.question)
        matter.last_user_message_at = self._now_utc()

        if response.issue_type:
            matter.issue_type = response.issue_type
        else:
            inferred = self._infer_issue_type(payload.question)
            if inferred:
                matter.issue_type = inferred

        inferred_visa_type = self._infer_visa_type(payload.question)
        if inferred_visa_type:
            matter.visa_type = inferred_visa_type

        matter.risk_level = self._map_risk_level(response)

        existing_meta = matter.metadata_json or {}
        existing_meta.update(
            {
                "preferred_jurisdiction": payload.preferred_jurisdiction,
                "preferred_source_types": payload.preferred_source_types or [],
                "intake_facts": payload.intake_facts or {},
                "latest_question": payload.question,
                "next_action": response.next_action,
                "escalate": response.escalate,
                "confidence": response.confidence,
            }
        )
        matter.metadata_json = existing_meta

        db.add(matter)

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
        if "student visa" in lowered:
            return "student"
        if "partner visa" in lowered:
            return "partner"
        if "visitor visa" in lowered:
            return "visitor"
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