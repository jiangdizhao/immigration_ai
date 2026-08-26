from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import SQLAlchemyError

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
from app.schemas.learning import (
    ReasoningRuleDecisionRequest,
    ReasoningRuleRetirementRequest,
    ReasoningBankRuntimeQuery,
    ReasoningBankRuntimeResult,
    RuleCompilerSubmission,
)
from app.services.phase7_3a_reasoning_bank import (
    CandidatePoolService,
    Phase73RuleCompilerService,
    ReasoningBankManager,
    ReasoningBankService,
    RuleFormationError,
)
from app.services.review_service import ReviewService
from app.services.reasoning_bank_runtime_service import ReasoningBankRuntimeService
from app.services.evaluation_bank_service import (
    EvaluationBankService,
    EvaluationBankValidationError,
)

router = APIRouter(dependencies=[Depends(verify_api_key)])
service = ReviewService()
evaluation_bank_service = EvaluationBankService()
candidate_pool_service = CandidatePoolService()
reasoning_bank_service = ReasoningBankService()
reasoning_bank_manager = ReasoningBankManager()
rule_compiler_service = Phase73RuleCompilerService()
reasoning_bank_runtime_service = ReasoningBankRuntimeService()


def _commit_or_rollback(db: DBSession) -> None:
    """Keep database failures out of the successful-request transaction."""
    try:
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        raise


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
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc
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
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc
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
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc
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
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc
    return [EvaluationBankCaseOut.model_validate(row) for row in rows]


@router.get("/evaluation-bank/{case_id}", response_model=EvaluationBankCaseOut)
def get_evaluation_case(case_id: str, db: DBSession) -> EvaluationBankCaseOut:
    try:
        row = evaluation_bank_service.get_case(db, case_id)
    except EvaluationBankValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Evaluation case not found"
        )
    return EvaluationBankCaseOut.model_validate(row)


# Phase 7.3A control-plane inspection/governance only.  These routes are
# deliberately below /review, never /query, and do not expose simulation
# writes.  Real writes require the same private server assertion used by
# lawyer-review materialization.
@router.get("/reasoning-bank/candidates")
def list_reasoning_candidates(
    db: DBSession,
    processed: bool | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> list[dict]:
    candidates = candidate_pool_service.list_candidates(db, processed=processed)
    return [candidate.model_dump(mode="json") for candidate in candidates[offset : offset + limit]]


@router.get("/reasoning-bank/proposals")
def list_reasoning_proposals(
    db: DBSession,
    bank_namespace: str | None = Query(default=None, pattern="^(real|simulation)$"),
) -> list[dict]:
    return [
        item.model_dump(mode="json")
        for item in reasoning_bank_service.list_proposals(db, bank_namespace=bank_namespace)
    ]


@router.get("/reasoning-bank/rules")
def list_reasoning_rules(
    db: DBSession,
    bank_namespace: str | None = Query(default=None, pattern="^(real|simulation)$"),
) -> list[dict]:
    return [
        item.model_dump(mode="json")
        for item in reasoning_bank_service.list_rules(db, bank_namespace=bank_namespace)
    ]


@router.get("/reasoning-bank/rules/{rule_key}")
def get_reasoning_rule(rule_key: str, db: DBSession) -> dict:
    rule = reasoning_bank_service.get_rule(db, rule_key)
    if rule is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Reasoning rule not found"
        )
    return rule.model_dump(mode="json")


@router.get("/reasoning-bank/state")
def get_reasoning_bank_state(
    db: DBSession,
    bank_namespace: str = Query(default="real", pattern="^(real|simulation)$"),
) -> dict:
    return reasoning_bank_service.state(db, bank_namespace=bank_namespace).model_dump(mode="json")


@router.post("/reasoning-bank/shadow-retrieve", response_model=ReasoningBankRuntimeResult)
def shadow_retrieve_reasoning_bank(
    payload: ReasoningBankRuntimeQuery,
    db: DBSession,
    trusted_lawyer_review: bool = Depends(verify_lawyer_review_assertion),
) -> ReasoningBankRuntimeResult:
    """Return real-bank runtime telemetry; never enters the customer answer path."""
    if not trusted_lawyer_review:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="trusted lawyer assertion required"
        )
    return reasoning_bank_runtime_service.retrieve(db, payload)


@router.post("/reasoning-bank/compiler-output")
def create_reasoning_proposals(
    payload: RuleCompilerSubmission,
    db: DBSession,
    trusted_lawyer_review: bool = Depends(verify_lawyer_review_assertion),
) -> dict:
    if not trusted_lawyer_review:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="trusted real-bank assertion required"
        )
    try:
        artifacts = rule_compiler_service.create_proposals_from_output(
            db,
            source_candidate_ids=payload.source_candidate_ids,
            compiler_output=payload.compiler_output,
            namespace="real",
            trusted_lawyer_review=trusted_lawyer_review,
        )
        _commit_or_rollback(db)
    except (RuleFormationError, ValueError) as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc
    except SQLAlchemyError:
        db.rollback()
        raise
    return [artifact.artifact_payload for artifact in artifacts]


@router.post("/reasoning-bank/decisions")
def apply_reasoning_decision(
    payload: ReasoningRuleDecisionRequest,
    db: DBSession,
    trusted_lawyer_review: bool = Depends(verify_lawyer_review_assertion),
) -> dict:
    try:
        proposal = next(
            (
                item
                for item in reasoning_bank_service.list_proposals(db)
                if item.proposal_id == payload.proposal_id
            ),
            None,
        )
        if proposal is None:
            raise RuleFormationError("proposal not found")
        if proposal.bank_namespace != "real" or not trusted_lawyer_review:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="trusted real-bank assertion required"
            )
        result = reasoning_bank_manager.apply_decision(
            db,
            proposal_id=payload.proposal_id,
            action=payload.action,
            target_rule_key=payload.target_rule_key,
            decided_by=payload.decided_by,
            decision_reason_code=payload.decision_reason_code,
            trusted_lawyer_review=trusted_lawyer_review,
            case_erasure_confirmed=payload.case_erasure_confirmed,
            procedural_only_confirmed=payload.procedural_only_confirmed,
        )
        _commit_or_rollback(db)
    except (RuleFormationError, ValueError) as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc
    except SQLAlchemyError:
        db.rollback()
        raise
    return (
        result.model_dump(mode="json")
        if hasattr(result, "model_dump")
        else {"rules": [item.model_dump(mode="json") for item in result]}
    )


@router.post("/reasoning-bank/rules/{rule_key}/retire")
def retire_reasoning_rule(
    rule_key: str,
    payload: ReasoningRuleRetirementRequest,
    db: DBSession,
    trusted_lawyer_review: bool = Depends(verify_lawyer_review_assertion),
) -> dict:
    # The route is real-bank-only in practice: simulation retirement remains
    # an internal/offline service operation and is not a browser API.
    try:
        target = reasoning_bank_service.get_rule(db, rule_key)
        if target is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Reasoning rule not found"
            )
        if target.bank_namespace != "real" or not trusted_lawyer_review:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="trusted real-bank assertion required"
            )
        rule = reasoning_bank_manager.retire(
            db,
            rule_key=rule_key,
            reason_code=payload.reason_code,
            decided_by=payload.decided_by,
            trusted_lawyer_review=trusted_lawyer_review,
        )
        _commit_or_rollback(db)
    except (RuleFormationError, ValueError) as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc
    except SQLAlchemyError:
        db.rollback()
        raise
    return rule.model_dump(mode="json")
