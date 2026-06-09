from __future__ import annotations

from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db.models import AnswerReview, AnswerTrace, Matter
from app.schemas.review import (
    AnswerReviewCreate,
    AnswerReviewOut,
    AnswerReviewUpdate,
    AnswerTraceOut,
    MatterReviewOut,
    ReviewQueueItem,
)


class ReviewService:
    """Read/write service for lawyer answer reviews.

    This service is intentionally passive. It never calls the chatbot inference
    pipeline, retrieval, Schedule reasoning, or LLM services.
    """

    def list_review_queue(
        self,
        db: Session,
        *,
        status: str | None = "unreviewed",
        limit: int = 50,
        offset: int = 0,
    ) -> list[ReviewQueueItem]:
        limit = max(1, min(int(limit or 50), 200))
        offset = max(0, int(offset or 0))

        latest_review_subq = (
            db.query(
                AnswerReview.answer_trace_id.label("trace_id"),
                func.count(AnswerReview.id).label("review_count"),
                func.max(AnswerReview.created_at).label("latest_review_at"),
            )
            .group_by(AnswerReview.answer_trace_id)
            .subquery()
        )

        query = (
            db.query(AnswerTrace, latest_review_subq.c.review_count)
            .outerjoin(latest_review_subq, latest_review_subq.c.trace_id == AnswerTrace.id)
            .order_by(AnswerTrace.created_at.desc())
        )
        if status and status != "all":
            query = query.filter(AnswerTrace.review_status == status)

        rows = query.offset(offset).limit(limit).all()
        out: list[ReviewQueueItem] = []
        for trace, review_count in rows:
            latest_review = (
                db.query(AnswerReview)
                .filter(AnswerReview.answer_trace_id == trace.id)
                .order_by(AnswerReview.created_at.desc())
                .first()
            )
            item = ReviewQueueItem.model_validate(trace)
            item.review_count = int(review_count or 0)
            item.latest_review_rating = latest_review.rating if latest_review else None
            item.latest_review_severity = latest_review.severity if latest_review else None
            out.append(item)
        return out

    def get_answer_trace(self, db: Session, trace_id: str) -> AnswerTrace | None:
        return db.get(AnswerTrace, trace_id)

    def get_matter_review(self, db: Session, matter_id: str) -> MatterReviewOut | None:
        matter = db.get(Matter, matter_id)
        if matter is None:
            return None

        traces = (
            db.query(AnswerTrace)
            .filter(AnswerTrace.matter_id == matter_id)
            .order_by(AnswerTrace.created_at.asc())
            .all()
        )
        reviews = (
            db.query(AnswerReview)
            .filter(AnswerReview.matter_id == matter_id)
            .order_by(AnswerReview.created_at.asc())
            .all()
        )
        metadata = dict(matter.metadata_json or {})
        conversation_history = metadata.get("conversation_history") or []
        if not isinstance(conversation_history, list):
            conversation_history = []

        return MatterReviewOut(
            matter_id=matter_id,
            matter={
                "id": matter.id,
                "session_id": matter.session_id,
                "issue_summary": matter.issue_summary,
                "status": matter.status,
                "issue_type": matter.issue_type,
                "visa_type": matter.visa_type,
                "risk_level": matter.risk_level,
                "last_user_message_at": matter.last_user_message_at.isoformat() if matter.last_user_message_at else None,
                "metadata_json": metadata,
            },
            conversation_history=[item for item in conversation_history if isinstance(item, dict)],
            traces=[AnswerTraceOut.model_validate(trace) for trace in traces],
            reviews=[self._review_out(review) for review in reviews],
        )

    def create_answer_review(
        self,
        db: Session,
        *,
        trace_id: str,
        payload: AnswerReviewCreate,
    ) -> AnswerReviewOut | None:
        trace = db.get(AnswerTrace, trace_id)
        if trace is None:
            return None

        review = AnswerReview(
            answer_trace_id=trace.id,
            matter_id=trace.matter_id,
            reviewer_name=payload.reviewer_name,
            reviewer_role=payload.reviewer_role,
            rating=payload.rating,
            severity=payload.severity,
            error_categories=list(payload.error_categories or []),
            lawyer_comment=payload.lawyer_comment,
            corrected_answer=payload.corrected_answer,
            lesson_candidate=payload.lesson_candidate,
            should_create_eval_case=payload.should_create_eval_case,
            should_create_lesson=payload.should_create_lesson,
            should_create_patch_task=payload.should_create_patch_task,
            review_status=payload.review_status,
        )
        db.add(review)
        trace.review_status = "reviewed"
        db.commit()
        db.refresh(review)
        return self._review_out(review)

    def update_answer_review(
        self,
        db: Session,
        *,
        review_id: str,
        payload: AnswerReviewUpdate,
    ) -> AnswerReviewOut | None:
        review = db.get(AnswerReview, review_id)
        if review is None:
            return None
        updates = payload.model_dump(exclude_unset=True)
        if "error_categories" in updates and updates["error_categories"] is not None:
            updates["error_categories"] = list(updates["error_categories"])
        for key, value in updates.items():
            setattr(review, key, value)
        db.commit()
        db.refresh(review)
        return self._review_out(review)

    def list_reviews_for_matter(self, db: Session, matter_id: str) -> list[AnswerReviewOut]:
        reviews = (
            db.query(AnswerReview)
            .filter(AnswerReview.matter_id == matter_id)
            .order_by(AnswerReview.created_at.asc())
            .all()
        )
        return [self._review_out(review) for review in reviews]

    def _review_out(self, review: AnswerReview) -> AnswerReviewOut:
        return AnswerReviewOut(
            id=review.id,
            answer_trace_id=review.answer_trace_id,
            matter_id=review.matter_id,
            reviewer_name=review.reviewer_name,
            reviewer_role=review.reviewer_role,
            rating=review.rating,
            severity=review.severity,
            error_categories=list(review.error_categories or []),
            lawyer_comment=review.lawyer_comment,
            corrected_answer=review.corrected_answer,
            lesson_candidate=review.lesson_candidate,
            should_create_eval_case=bool(review.should_create_eval_case),
            should_create_lesson=bool(review.should_create_lesson),
            should_create_patch_task=bool(review.should_create_patch_task),
            review_status=review.review_status,
            created_at=review.created_at,
            updated_at=review.updated_at,
        )
