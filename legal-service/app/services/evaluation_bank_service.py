"""Read-only offline Evaluation Bank over typed ReviewArtifact rows."""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.db.models import ReviewArtifact
from app.schemas.learning import EvaluationCase
from app.services.phase7_artifact_service import Phase7ArtifactService


class EvaluationBankValidationError(ValueError):
    """A historical evaluation artifact is malformed and cannot be scored."""


class EvaluationBankService:
    """List/get only; this service never feeds customer-serving code."""

    def list_cases(
        self,
        db: Session,
        *,
        artifact_status: str | None = "active",
        provenance: str | None = "lawyer_reviewed",
        review_outcome: str | None = None,
        origin: str | None = None,
        include_synthetic: bool = False,
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict]:
        effective_provenance = provenance or "lawyer_reviewed"
        rows = (
            db.query(ReviewArtifact)
            .filter(ReviewArtifact.artifact_type == "phase7_evaluation_case")
            .order_by(ReviewArtifact.created_at.desc())
            .all()
        )
        selected: list[dict] = []
        for row in rows:
            item = self._validated_row(row)
            case = item["case"]
            if artifact_status and row.artifact_status != artifact_status:
                continue
            if case.get("provenance") != effective_provenance:
                continue
            if review_outcome and case.get("review_outcome") != review_outcome:
                continue
            if origin and case.get("origin") != origin:
                continue
            if not include_synthetic and (
                case.get("provenance") == "synthetic_test"
                or case.get("origin") in {"synthetic_test", "manual_fixture"}
            ):
                continue
            selected.append(item)
        start = max(0, offset)
        return selected[start : start + max(1, min(limit, 200))]

    def list_default_regression_cases(
        self, db: Session, *, limit: int = 50, offset: int = 0
    ) -> list[dict]:
        """Non-bypassable default release/regression selection."""

        rows = self.list_cases(
            db,
            artifact_status="active",
            provenance="lawyer_reviewed",
            include_synthetic=False,
            limit=limit,
            offset=offset,
        )
        return [
            row
            for row in rows
            if row["case"].get("provenance") == "lawyer_reviewed"
            and row["case"].get("origin") not in {"synthetic_test", "manual_fixture"}
        ]

    def get_case(self, db: Session, case_id: str) -> dict | None:
        rows = (
            db.query(ReviewArtifact)
            .filter(ReviewArtifact.artifact_type == "phase7_evaluation_case")
            .order_by(ReviewArtifact.created_at.desc())
            .all()
        )
        for row in rows:
            case = self._validated_row(row)
            if row.id == case_id or case["case"].get("case_id") == case_id:
                return case
        return None

    @staticmethod
    def _validated_row(row: ReviewArtifact) -> dict:
        try:
            case = EvaluationCase.model_validate(row.artifact_payload or {})
        except Exception as exc:
            raise EvaluationBankValidationError(
                f"Malformed evaluation artifact {row.id}: {exc}"
            ) from exc
        if not Phase7ArtifactService.verify_payload_hash(row.artifact_payload or {}):
            raise EvaluationBankValidationError(
                f"Invalid canonical hash for evaluation artifact {row.id}"
            )
        return {
            "artifact_id": row.id,
            "artifact_status": row.artifact_status,
            "eligible_for_default_regression": (
                row.artifact_status == "active"
                and case.provenance == "lawyer_reviewed"
                and case.origin not in {"synthetic_test", "manual_fixture"}
            ),
            "case": case.model_dump(mode="json"),
        }
