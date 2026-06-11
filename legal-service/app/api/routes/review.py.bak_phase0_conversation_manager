from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.api.deps import DBSession, verify_api_key
from app.schemas.review import (
    AnswerReviewCreate,
    AnswerReviewOut,
    AnswerReviewUpdate,
    AnswerTraceOut,
    MatterReviewOut,
    ReviewQueueItem,
)
from app.services.review_service import ReviewService

router = APIRouter(dependencies=[Depends(verify_api_key)])
service = ReviewService()


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
def create_answer_review(trace_id: str, payload: AnswerReviewCreate, db: DBSession) -> AnswerReviewOut:
    result = service.create_answer_review(db, trace_id=trace_id, payload=payload)
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Answer trace not found")
    return result


@router.patch("/reviews/{review_id}", response_model=AnswerReviewOut)
def update_answer_review(review_id: str, payload: AnswerReviewUpdate, db: DBSession) -> AnswerReviewOut:
    result = service.update_answer_review(db, review_id=review_id, payload=payload)
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Review not found")
    return result


@router.get("/matters/{matter_id}/reviews", response_model=list[AnswerReviewOut])
def list_reviews_for_matter(matter_id: str, db: DBSession) -> list[AnswerReviewOut]:
    return service.list_reviews_for_matter(db, matter_id)
