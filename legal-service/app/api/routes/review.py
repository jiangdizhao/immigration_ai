from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.api.deps import DBSession, verify_api_key, verify_lawyer_review_assertion
from app.schemas.review import (
    AnswerReviewCreate,
    AnswerReviewOut,
    AnswerReviewUpdate,
    AnswerTraceOut,
    EvaluationBankCaseOut,
    MaterializeLearningRequest,
    MatterReviewOut,
    ReviewConversationItem,
    ReviewQueueItem,
)
from app.services.review_service import ReviewService
from app.services.evaluation_bank_service import EvaluationBankService, EvaluationBankValidationError

router = APIRouter(dependencies=[Depends(verify_api_key)])
service = ReviewService()
evaluation_bank_service = EvaluationBankService()


@router.get("/conversations", response_model=list[ReviewConversationItem])
def list_review_conversations(
    db: DBSession,
    status_filter: str | None = Query(default="active", alias="status"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> list[ReviewConversationItem]:
    return service.list_review_conversations(db, status=status_filter, limit=limit, offset=offset)


@router.get("/queue", response_model=list[ReviewQueueItem])
def list_review_queue(
    db: DBSession,
    status_filter: str | None = Query(default="unreviewed", alias="status"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> list[ReviewQueueItem]:
    return service.list_review_queue(db, status=status_filter, limit=limit, offset=offset)


@router.get("/matters/{matter_id}", response_model=MatterReviewOut)
def get_matter_review(matter_id: str, db: DBSession) -> MatterReviewOut:
    result = service.get_matter_review(db, matter_id)
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Matter not found")
    return result


@router.get("/traces/{trace_id}", response_model=AnswerTraceOut)
def get_answer_trace(trace_id: str, db: DBSession) -> AnswerTraceOut:
    trace = service.get_answer_trace(db, trace_id)
    if trace is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Answer trace not found")
    return AnswerTraceOut.model_validate(trace)


@router.post("/traces/{trace_id}/reviews", response_model=AnswerReviewOut)
def create_answer_review(
    trace_id: str,
    payload: AnswerReviewCreate,
    db: DBSession,
    trusted_lawyer_review: bool = Depends(verify_lawyer_review_assertion),
) -> AnswerReviewOut:
    try:
        result = service.create_answer_review(
            db,
            trace_id=trace_id,
            payload=payload,
            trusted_lawyer_review=trusted_lawyer_review,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Answer trace not found")
    return result


@router.patch("/reviews/{review_id}", response_model=AnswerReviewOut)
def update_answer_review(
    review_id: str,
    payload: AnswerReviewUpdate,
    db: DBSession,
    trusted_lawyer_review: bool = Depends(verify_lawyer_review_assertion),
) -> AnswerReviewOut:
    try:
        result = service.update_answer_review(
            db,
            review_id=review_id,
            payload=payload,
            trusted_lawyer_review=trusted_lawyer_review,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Review not found")
    return result


@router.get("/matters/{matter_id}/reviews", response_model=list[AnswerReviewOut])
def list_reviews_for_matter(matter_id: str, db: DBSession) -> list[AnswerReviewOut]:
    return service.list_reviews_for_matter(db, matter_id)


@router.post("/reviews/{review_id}/materialize", response_model=AnswerReviewOut)
def materialize_learning_artifacts(
    review_id: str,
    payload: MaterializeLearningRequest,
    db: DBSession,
    trusted_lawyer_review: bool = Depends(verify_lawyer_review_assertion),
) -> AnswerReviewOut:
    try:
        result = service.materialize_learning_artifacts(
            db,
            review_id=review_id,
            options=payload,
            trusted_lawyer_review=trusted_lawyer_review,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Review not found")
    return result


@router.get("/evaluation-bank", response_model=list[EvaluationBankCaseOut])
def list_evaluation_bank(
    db: DBSession,
    artifact_status: str | None = Query(default="active"),
    provenance: str | None = Query(default="lawyer_reviewed"),
    review_outcome: str | None = Query(default=None),
    origin: str | None = Query(default=None),
    include_synthetic: bool = Query(default=False),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> list[EvaluationBankCaseOut]:
    try:
        if (
            artifact_status == "active"
            and provenance == "lawyer_reviewed"
            and review_outcome is None
            and origin is None
            and not include_synthetic
        ):
            rows = evaluation_bank_service.list_default_regression_cases(
                db, limit=limit, offset=offset
            )
        else:
            rows = evaluation_bank_service.list_cases(
                db,
                artifact_status=artifact_status,
                provenance=provenance,
                review_outcome=review_outcome,
                origin=origin,
                include_synthetic=include_synthetic,
                limit=limit,
                offset=offset,
            )
    except EvaluationBankValidationError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    return [EvaluationBankCaseOut.model_validate(row) for row in rows]


@router.get("/evaluation-bank/{case_id}", response_model=EvaluationBankCaseOut)
def get_evaluation_case(case_id: str, db: DBSession) -> EvaluationBankCaseOut:
    try:
        row = evaluation_bank_service.get_case(db, case_id)
    except EvaluationBankValidationError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evaluation case not found")
    return EvaluationBankCaseOut.model_validate(row)
