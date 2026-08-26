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
    ReviewConversationItem,
    ReviewQueueItem,
)
from app.services.phase7_artifact_service import Phase7ArtifactError, Phase7ArtifactService


class ReviewService:
    """Read/write service for lawyer answer reviews.

    This service is intentionally passive. It never calls the chatbot inference
    pipeline, retrieval, Schedule reasoning, or LLM services.
    """

    def __init__(self, phase7_artifact_service: Phase7ArtifactService | None = None) -> None:
        self.phase7_artifact_service = phase7_artifact_service or Phase7ArtifactService()

    def list_review_conversations(
        self,
        db: Session,
        *,
        status: str | None = "active",
        limit: int = 50,
        offset: int = 0,
    ) -> list[ReviewConversationItem]:
        limit = max(1, min(int(limit or 50), 200))
        offset = max(0, int(offset or 0))

        status_filter = (status or "uncommented").strip().lower()
        query = db.query(Matter).order_by(
            Matter.last_user_message_at.desc().nullslast(),
            Matter.created_at.desc(),
        )

        # Keep old matter-status filters available for compatibility, but the
        # lawyer-review page now uses comment-status filters.
        if status_filter in {"open", "closed"}:
            query = query.filter(Matter.status == status_filter)
        elif status_filter == "active":
            query = query.filter(Matter.status != "closed")

        matters = query.offset(offset).limit(limit).all()
        out: list[ReviewConversationItem] = []

        for matter in matters:
            traces = (
                db.query(AnswerTrace)
                .filter(AnswerTrace.matter_id == matter.id)
                .order_by(AnswerTrace.created_at.asc())
                .all()
            )
            if not traces:
                # Matters created before ENABLE_LAWYER_REVIEW_TRACE was enabled
                # cannot be reviewed at turn level, so hide them from the lawyer
                # queue instead of showing confusing "0 unreviewed" rows.
                continue

            trace_ids = [trace.id for trace in traces]
            reviews = (
                db.query(AnswerReview)
                .filter(AnswerReview.answer_trace_id.in_(trace_ids))
                .all()
                if trace_ids
                else []
            )

            first_trace = traces[0]
            latest_trace = traces[-1]
            reviewed_trace_ids = {review.answer_trace_id for review in reviews}
            reviewed_trace_count = sum(
                1
                for trace in traces
                if trace.id in reviewed_trace_ids or trace.review_status == "reviewed"
            )
            unreviewed_trace_count = sum(
                1
                for trace in traces
                if trace.id not in reviewed_trace_ids and trace.review_status != "reviewed"
            )
            if reviewed_trace_count <= 0:
                comment_status = "uncommented"
            elif unreviewed_trace_count <= 0:
                comment_status = "fully_commented"
            else:
                comment_status = "partially_commented"

            if status_filter == "uncommented" and reviewed_trace_count > 0:
                continue
            if status_filter == "commented" and reviewed_trace_count <= 0:
                continue
            if status_filter in {"fully_commented", "reviewed"} and unreviewed_trace_count > 0:
                continue
            if status_filter == "partially_commented" and comment_status != "partially_commented":
                continue

            out.append(
                ReviewConversationItem(
                    matter_id=matter.id,
                    session_id=matter.session_id,
                    frontend_chat_id=getattr(matter, "frontend_chat_id", None),
                    issue_summary=matter.issue_summary,
                    issue_type=matter.issue_type,
                    visa_type=matter.visa_type,
                    risk_level=matter.risk_level,
                    first_user_message=first_trace.user_message,
                    latest_user_message=latest_trace.user_message,
                    latest_assistant_answer_preview=(latest_trace.assistant_answer or "")[:260],
                    trace_count=len(traces),
                    reviewed_trace_count=reviewed_trace_count,
                    unreviewed_trace_count=unreviewed_trace_count,
                    critical_review_count=sum(1 for review in reviews if review.severity == "critical"),
                    comment_status=comment_status,
                    created_at=matter.created_at,
                    last_trace_at=latest_trace.created_at,
                )
            )

        return out

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
        trusted_lawyer_review: bool = False,
    ) -> AnswerReviewOut | None:
        trace = db.get(AnswerTrace, trace_id)
        if trace is None:
            return None

        phase7_requested = self._phase7_requested(payload)
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
            should_create_eval_case=payload.should_create_eval_case or payload.add_to_evaluation_bank,
            should_create_lesson=payload.should_create_lesson,
            should_create_patch_task=payload.should_create_patch_task,
            review_status=payload.review_status,
        )
        db.add(review)
        trace.review_status = "reviewed"
        artifact_results: dict[str, Any] = {}
        if phase7_requested:
            try:
                db.flush()
                artifact_results["phase7_review_record"] = self.phase7_artifact_service.ensure_review_record(
                    db,
                    review=review,
                    trace=trace,
                    options=payload,
                    trusted_lawyer_review=trusted_lawyer_review,
                )
                db.commit()
            except (Phase7ArtifactError, ValueError) as exc:
                db.rollback()
                raise ValueError(f"Phase-7 review artifact was not recorded: {exc}") from exc
            artifact_results.update(
                self._materialize_optional_artifacts(
                    db,
                    review=review,
                    trace=trace,
                    options=payload,
                    trusted_lawyer_review=trusted_lawyer_review,
                )
            )
        else:
            db.commit()
        db.refresh(review)
        return self._review_out(review, artifact_results=artifact_results)

    def update_answer_review(
        self,
        db: Session,
        *,
        review_id: str,
        payload: AnswerReviewUpdate,
        trusted_lawyer_review: bool = False,
    ) -> AnswerReviewOut | None:
        review = db.get(AnswerReview, review_id)
        if review is None:
            return None
        phase7_keys = {
            "review_provenance",
            "review_outcome",
            "review_origin",
            "affected_claim_ids",
            "preferred_reasoning_or_research_approach",
            "add_to_evaluation_bank",
            "create_reasoning_lesson_candidate",
            "expected_claim_ids",
            "prohibited_claim_ids",
            "expected_evidence_characteristics",
            "expected_checker_behavior",
            "prohibited_behaviors",
            "max_latency_ms",
            "max_tool_calls",
            "tags",
            "phase7_metadata",
        }
        raw_updates = payload.model_dump(exclude_unset=True)
        phase7_requested = bool(phase7_keys.intersection(raw_updates))
        updates = {key: value for key, value in raw_updates.items() if key not in phase7_keys}
        if "error_categories" in updates and updates["error_categories"] is not None:
            updates["error_categories"] = list(updates["error_categories"])
        for key, value in updates.items():
            setattr(review, key, value)
        artifact_results: dict[str, Any] = {}
        if phase7_requested:
            trace = db.get(AnswerTrace, review.answer_trace_id)
            if trace is None:
                raise ValueError("Answer trace for review was not found")
            try:
                db.flush()
                artifact_results["phase7_review_record"] = self.phase7_artifact_service.ensure_review_record(
                    db,
                    review=review,
                    trace=trace,
                    options=payload,
                    trusted_lawyer_review=trusted_lawyer_review,
                )
                db.commit()
            except (Phase7ArtifactError, ValueError) as exc:
                db.rollback()
                raise ValueError(f"Phase-7 review artifact was not recorded: {exc}") from exc
            artifact_results.update(
                self._materialize_optional_artifacts(
                    db,
                    review=review,
                    trace=trace,
                    options=payload,
                    trusted_lawyer_review=trusted_lawyer_review,
                )
            )
        else:
            db.commit()
        db.refresh(review)
        return self._review_out(review, artifact_results=artifact_results)

    def list_reviews_for_matter(self, db: Session, matter_id: str) -> list[AnswerReviewOut]:
        reviews = (
            db.query(AnswerReview)
            .filter(AnswerReview.matter_id == matter_id)
            .order_by(AnswerReview.created_at.asc())
            .all()
        )
        return [self._review_out(review) for review in reviews]

    def materialize_learning_artifacts(
        self,
        db: Session,
        *,
        review_id: str,
        options: Any,
        trusted_lawyer_review: bool = False,
    ) -> AnswerReviewOut | None:
        review = db.get(AnswerReview, review_id)
        if review is None:
            return None
        trace = db.get(AnswerTrace, review.answer_trace_id)
        if trace is None:
            raise ValueError("Answer trace for review was not found")
        try:
            db.flush()
            review_result = self.phase7_artifact_service.ensure_review_record(
                db,
                review=review,
                trace=trace,
                options=options,
                trusted_lawyer_review=trusted_lawyer_review,
            )
            db.commit()
        except (Phase7ArtifactError, ValueError) as exc:
            db.rollback()
            raise ValueError(f"Phase-7 review artifact was not recorded: {exc}") from exc
        results = {"phase7_review_record": review_result}
        results.update(
            self._materialize_optional_artifacts(
                db,
                review=review,
                trace=trace,
                options=options,
                trusted_lawyer_review=trusted_lawyer_review,
            )
        )
        db.refresh(review)
        return self._review_out(review, artifact_results=results)

    def _materialize_optional_artifacts(
        self,
        db: Session,
        *,
        review: AnswerReview,
        trace: AnswerTrace,
        options: Any,
        trusted_lawyer_review: bool,
    ) -> dict[str, Any]:
        results: dict[str, Any] = {}
        for artifact_type, method, requested in (
            (
                "phase7_evaluation_case",
                self.phase7_artifact_service.materialize_evaluation_case,
                bool(getattr(options, "add_to_evaluation_bank", False)),
            ),
            (
                "phase7_reasoning_lesson_candidate",
                self.phase7_artifact_service.materialize_lesson_candidate,
                bool(getattr(options, "create_reasoning_lesson_candidate", False)),
            ),
        ):
            if not requested:
                results[artifact_type] = {"status": "skipped"}
                continue
            try:
                result = method(
                    db,
                    review=review,
                    trace=trace,
                    options=options,
                    trusted_lawyer_review=trusted_lawyer_review,
                )
                db.commit()
                results[artifact_type] = {
                    "status": result.status,
                    "artifact_id": result.artifact.id if result.artifact is not None else None,
                    "warning": result.warning,
                }
            except (Phase7ArtifactError, ValueError) as exc:
                db.rollback()
                results[artifact_type] = {"status": "failed", "warning": str(exc)}
        return results

    @staticmethod
    def _phase7_requested(payload: Any) -> bool:
        return any(
            (
                getattr(payload, "review_provenance", None) is not None,
                getattr(payload, "review_outcome", None) is not None,
                getattr(payload, "review_origin", None) is not None,
                bool(getattr(payload, "add_to_evaluation_bank", False)),
                bool(getattr(payload, "create_reasoning_lesson_candidate", False)),
                bool(getattr(payload, "preferred_reasoning_or_research_approach", None)),
            )
        )

    def _review_out(self, review: AnswerReview, *, artifact_results: dict[str, Any] | None = None) -> AnswerReviewOut:
        artifact_statuses = []
        phase7_provenance = None
        phase7_outcome = None
        for value in (artifact_results or {}).values():
            if hasattr(value, "status"):
                if value.artifact is not None and value.artifact.artifact_type == "phase7_review_record":
                    payload = value.artifact.artifact_payload or {}
                    phase7_provenance = payload.get("provenance")
                    phase7_outcome = payload.get("review_outcome")
                artifact_statuses.append(
                    {
                        "status": value.status,
                        "artifact_id": value.artifact.id if value.artifact is not None else None,
                        "warning": value.warning,
                    }
                )
            else:
                artifact_statuses.append(value)
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
            phase7_provenance=phase7_provenance,
            phase7_review_outcome=phase7_outcome,
            phase7_artifacts=artifact_statuses,
            created_at=review.created_at,
            updated_at=review.updated_at,
        )
