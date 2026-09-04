from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.db.models import (
    AnswerReview,
    AnswerTrace,
    ExperienceRecord,
    Phase8LearningBridgeReceipt,
)
from app.schemas.review import MaterializeLearningRequest, Phase8LearningBridgeRequest
from app.services.phase7_artifact_service import Phase7ArtifactError, Phase7ArtifactService


class Phase8LearningBridgeService:
    """Atomically materialize one trusted Phase-8 finalization into Phase 7."""

    def __init__(self, artifact_service: Phase7ArtifactService | None = None) -> None:
        self.artifact_service = artifact_service or Phase7ArtifactService()

    def materialize(
        self,
        db: Session,
        *,
        payload: Phase8LearningBridgeRequest,
        trusted_lawyer_review: bool,
    ) -> dict[str, Any]:
        if not trusted_lawyer_review:
            raise PermissionError("Trusted lawyer review assertion required")
        if payload.outcome == "corrected" and not (payload.corrected_answer or "").strip():
            raise ValueError("A corrected answer is required for a corrected outcome")
        if payload.create_reasoning_lesson_candidate and not (
            payload.preferred_reasoning_or_research_approach or ""
        ).strip():
            raise ValueError("An explicit procedural strategy is required for a lesson candidate")

        receipt = (
            db.query(Phase8LearningBridgeReceipt)
            .filter(Phase8LearningBridgeReceipt.external_request_id == payload.phase8_request_id)
            .with_for_update()
            .one_or_none()
        )
        if receipt is not None:
            if receipt.answer_trace_id != payload.answer_trace_id:
                raise ValueError("Phase-8 bridge idempotency key was reused for another answer trace")
            if receipt.status in {"completed", "failed_permanent"}:
                return self._receipt_out(receipt)
        else:
            receipt = Phase8LearningBridgeReceipt(
                external_request_id=payload.phase8_request_id,
                answer_trace_id=payload.answer_trace_id,
                status="pending",
            )
            db.add(receipt)
            try:
                db.flush()
            except IntegrityError:
                # Another request may have won the idempotency insert while
                # this request was waiting on the unique constraint.
                db.rollback()
                receipt = (
                    db.query(Phase8LearningBridgeReceipt)
                    .filter(
                        Phase8LearningBridgeReceipt.external_request_id
                        == payload.phase8_request_id
                    )
                    .with_for_update()
                    .one_or_none()
                )
                if receipt is None:
                    raise
                if receipt.answer_trace_id != payload.answer_trace_id:
                    raise ValueError(
                        "Phase-8 bridge idempotency key was reused for another answer trace"
                    )

        receipt.status = "pending"
        receipt.last_error_code = None
        trace = db.get(AnswerTrace, payload.answer_trace_id)
        if trace is None:
            raise ValueError("AnswerTrace was not found")

        records = (
            db.query(ExperienceRecord)
            .filter(ExperienceRecord.answer_trace_id == trace.id)
            .order_by(ExperienceRecord.created_at.asc())
            .all()
        )
        if len(records) != 1:
            receipt.status = "blocked_missing_experience"
            receipt.last_error_code = "missing_or_ambiguous_experience_record"
            db.commit()
            return self._receipt_out(receipt)
        experience = records[0]
        if experience.origin != "live_interaction":
            receipt.status = "failed_permanent"
            receipt.last_error_code = "experience_origin_not_live_interaction"
            db.commit()
            return self._receipt_out(receipt)
        if self.artifact_service.snapshot_sha256(experience.snapshot_json) != experience.snapshot_sha256:
            receipt.status = "failed_permanent"
            receipt.last_error_code = "experience_snapshot_hash_mismatch"
            db.commit()
            return self._receipt_out(receipt)

        source_assistant_mode = None
        snapshot_request = experience.snapshot_json.get("request")
        if isinstance(snapshot_request, dict):
            candidate_mode = snapshot_request.get("assistant_mode")
            if isinstance(candidate_mode, str) and candidate_mode:
                source_assistant_mode = candidate_mode

        options = MaterializeLearningRequest(
            review_provenance="lawyer_reviewed",
            review_outcome="correct" if payload.outcome == "confirmed" else "unclassified",
            review_origin="live_interaction",
            add_to_evaluation_bank=True,
            create_reasoning_lesson_candidate=payload.create_reasoning_lesson_candidate,
            preferred_reasoning_or_research_approach=payload.preferred_reasoning_or_research_approach,
            phase7_metadata={
                "source_system": "phase8_lawyer_clarification",
                "phase8_request_id": payload.phase8_request_id,
                "chatbot_chat_id": payload.chatbot_chat_id,
                "chatbot_assistant_message_id": payload.chatbot_assistant_message_id,
                "legal_matter_id": payload.legal_matter_id,
                "acting_staff_role": payload.acting_staff_role,
                "source_integrity": "experience_record",
                "source_assistant_mode": source_assistant_mode,
            },
        )
        review = AnswerReview(
            answer_trace_id=trace.id,
            matter_id=trace.matter_id,
            reviewer_name=payload.reviewer_id,
            reviewer_role=payload.acting_staff_role,
            rating="good" if payload.outcome == "confirmed" else "unrated",
            severity="low" if payload.outcome == "confirmed" else "medium",
            lawyer_comment=(payload.lawyer_comment or "").strip() or None,
            corrected_answer=(payload.corrected_answer or "").strip() or None,
            should_create_eval_case=True,
            should_create_lesson=payload.create_reasoning_lesson_candidate,
            review_status="submitted",
        )
        db.add(review)
        trace.review_status = "reviewed"
        db.flush()
        results = self.artifact_service.materialize_requested(
            db,
            review=review,
            trace=trace,
            options=options,
            trusted_lawyer_review=True,
        )
        if any(result.status == "failed" for result in results.values()):
            raise Phase7ArtifactError("Phase-7 artifact materialization failed")

        receipt.experience_record_id = experience.id
        receipt.answer_review_id = review.id
        receipt.evaluation_artifact_id = self._artifact_id(results, "phase7_evaluation_case")
        receipt.lesson_artifact_id = self._artifact_id(
            results, "phase7_reasoning_lesson_candidate"
        )
        receipt.status = "completed"
        receipt.last_error_code = None
        db.commit()
        db.refresh(receipt)
        return self._receipt_out(receipt)

    @staticmethod
    def _artifact_id(results: dict[str, Any], artifact_type: str) -> str | None:
        result = results.get(artifact_type)
        artifact = getattr(result, "artifact", None)
        return getattr(artifact, "id", None)

    @staticmethod
    def _receipt_out(receipt: Phase8LearningBridgeReceipt) -> dict[str, Any]:
        return {
            "status": receipt.status,
            "answer_trace_id": receipt.answer_trace_id,
            "experience_record_id": receipt.experience_record_id,
            "answer_review_id": receipt.answer_review_id,
            "evaluation_artifact_id": receipt.evaluation_artifact_id,
            "lesson_artifact_id": receipt.lesson_artifact_id,
            "last_error_code": receipt.last_error_code,
        }
