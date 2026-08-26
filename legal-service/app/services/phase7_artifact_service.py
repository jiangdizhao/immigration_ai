"""Phase 7.2 control-plane artifact materialization.

This module deliberately accepts an injected SQLAlchemy session and has no
provider, retrieval, evidence-registry, checker, or serving dependency.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Callable, Type
from uuid import uuid4

from sqlalchemy.orm import Session

from app.db.models import AnswerReview, AnswerTrace, ExperienceRecord, ReviewArtifact
from app.schemas.learning import EvaluationCase, ReasoningLessonCandidate, ReviewRecord

_SENSITIVE_KEY = re.compile(
    r"(?:password|passwd|secret|api[_-]?key|access[_-]?key|private[_-]?key|authorization|bearer|credential|token)",
    re.IGNORECASE,
)
_HIDDEN_KEY = re.compile(
    r"(?:chain[_ -]?of[_ -]?thought|hidden[_ -]?reasoning|scratchpad|raw[_ -]?model[_ -]?output)",
    re.IGNORECASE,
)
_SEMANTIC_FINGERPRINT_FIELDS = {
    "canonical_payload_sha256",
    "artifact_version",
    "artifact_created_at",
    "supersedes_artifact_id",
}


class Phase7ArtifactError(ValueError):
    """A typed artifact could not be safely constructed or validated."""


@dataclass(frozen=True)
class MaterializationResult:
    artifact: ReviewArtifact | None
    status: str
    warning: str | None = None


class Phase7ArtifactService:
    """Build, validate, version, and materialize typed ReviewArtifact rows."""

    _CONTRACTS: dict[str, Type[Any]] = {
        "phase7_review_record": ReviewRecord,
        "phase7_evaluation_case": EvaluationCase,
        "phase7_reasoning_lesson_candidate": ReasoningLessonCandidate,
    }

    def ensure_review_record(
        self,
        db: Session,
        *,
        review: AnswerReview,
        trace: AnswerTrace,
        options: Any,
        trusted_lawyer_review: bool = False,
    ) -> MaterializationResult:
        record, _experience, integrity_warning = self._review_record_payload(
            db,
            review=review,
            trace=trace,
            options=options,
            trusted_lawyer_review=trusted_lawyer_review,
        )
        status = "active" if record.provenance == "lawyer_reviewed" else "draft"
        result = self._upsert_payload(
            db,
            review_id=review.id,
            artifact_type="phase7_review_record",
            contract_type=ReviewRecord,
            status=status,
            builder=lambda version, supersedes: self._with_version(
                record, version=version, supersedes_artifact_id=supersedes
            ),
        )
        if integrity_warning and result.warning is None:
            return MaterializationResult(result.artifact, result.status, integrity_warning)
        return result

    def materialize_requested(
        self,
        db: Session,
        *,
        review: AnswerReview,
        trace: AnswerTrace,
        options: Any,
        trusted_lawyer_review: bool = False,
    ) -> dict[str, MaterializationResult]:
        results: dict[str, MaterializationResult] = {}
        review_result = self.ensure_review_record(
            db,
            review=review,
            trace=trace,
            options=options,
            trusted_lawyer_review=trusted_lawyer_review,
        )
        results["phase7_review_record"] = review_result

        if bool(getattr(options, "add_to_evaluation_bank", False)):
            results["phase7_evaluation_case"] = self.materialize_evaluation_case(
                db,
                review=review,
                trace=trace,
                options=options,
                trusted_lawyer_review=trusted_lawyer_review,
            )
        else:
            results["phase7_evaluation_case"] = MaterializationResult(None, "skipped")

        if bool(getattr(options, "create_reasoning_lesson_candidate", False)):
            results["phase7_reasoning_lesson_candidate"] = self.materialize_lesson_candidate(
                db,
                review=review,
                trace=trace,
                options=options,
                trusted_lawyer_review=trusted_lawyer_review,
            )
        else:
            results["phase7_reasoning_lesson_candidate"] = MaterializationResult(None, "skipped")
        return results

    def materialize_evaluation_case(
        self,
        db: Session,
        *,
        review: AnswerReview,
        trace: AnswerTrace,
        options: Any,
        trusted_lawyer_review: bool = False,
    ) -> MaterializationResult:
        self._lock_parent_review(db, review.id)
        record, integrity_warning = self._linked_experience(db, trace)
        if integrity_warning:
            return MaterializationResult(None, "failed", integrity_warning)

        review_record = self._latest_contract(db, review.id, "phase7_review_record", ReviewRecord)
        provenance = self._effective_provenance(
            options,
            trusted_lawyer_review=trusted_lawyer_review,
            previous=review_record,
        )
        origin = (
            record.origin
            if record is not None
            else getattr(options, "review_origin", None) or "live_interaction"
        )
        source = self._evaluation_source(trace, record)
        if not source["question"]:
            return MaterializationResult(None, "failed", "EvaluationCase requires a source question")

        expectations = self._expectations(options)
        case_data = {
            "case_id": f"eval-{review.id}",
            "source_experience_id": record.id if record is not None else None,
            "source_experience_snapshot_sha256": record.snapshot_sha256 if record is not None else None,
            "source_review_id": review.id,
            "source_answer_trace_id": trace.id,
            "provenance": provenance,
            "origin": origin,
            "review_outcome": getattr(options, "review_outcome", None)
            or (review_record.review_outcome if review_record else "unclassified"),
            "question": source["question"],
            "relevant_matter_state": source["matter_state"],
            "source_customer_answer": source["answer"],
            "reference_answer": self._reference_answer(review, source["answer"], options),
            "source_material_claims": source["claims"],
            "source_claim_dependencies": source["dependencies"],
            "affected_claim_ids": list(getattr(options, "affected_claim_ids", []) or []),
            "issue_categories": list(review.error_categories or []),
            "expected_evidence_characteristics": expectations["expected_evidence_characteristics"],
            "expected_checker_behavior": expectations["expected_checker_behavior"],
            "prohibited_behaviors": expectations["prohibited_behaviors"],
            "expected_claim_ids": expectations["expected_claim_ids"],
            "prohibited_claim_ids": expectations["prohibited_claim_ids"],
            "max_latency_ms": expectations["max_latency_ms"],
            "max_tool_calls": expectations["max_tool_calls"],
            "tags": expectations["tags"],
            "system_version_reviewed": self._system_version(record, trace),
            "source_integrity": "experience_record" if record is not None else "legacy_trace_only",
            "metadata": self._metadata(
                options,
                source_integrity="experience_record" if record is not None else "legacy_trace_only",
            ),
        }
        status = "active" if record is not None and provenance in {"lawyer_reviewed", "synthetic_test"} else "draft"
        return self._upsert_payload(
            db,
            review_id=review.id,
            artifact_type="phase7_evaluation_case",
            contract_type=EvaluationCase,
            status=status,
            builder=lambda version, supersedes: self._finalize_payload(
                EvaluationCase,
                case_data,
                version=version,
                supersedes_artifact_id=supersedes,
            ),
        )

    def materialize_lesson_candidate(
        self,
        db: Session,
        *,
        review: AnswerReview,
        trace: AnswerTrace,
        options: Any,
        trusted_lawyer_review: bool = False,
    ) -> MaterializationResult:
        self._lock_parent_review(db, review.id)
        lesson_text = (
            getattr(options, "preferred_reasoning_or_research_approach", None)
            or review.lesson_candidate
            or ""
        ).strip()
        if not lesson_text:
            return MaterializationResult(None, "skipped", "No explicit lesson strategy was supplied")
        record, integrity_warning = self._linked_experience(db, trace)
        if integrity_warning:
            return MaterializationResult(None, "failed", integrity_warning)
        review_record = self._latest_contract(db, review.id, "phase7_review_record", ReviewRecord)
        lesson_data = {
            "candidate_id": f"lesson-{review.id}",
            "source_review_id": review.id,
            "source_answer_trace_id": trace.id,
            "source_experience_record_id": record.id if record is not None else None,
            "source_experience_snapshot_sha256": record.snapshot_sha256 if record is not None else None,
            "provenance": self._effective_provenance(
                options,
                trusted_lawyer_review=trusted_lawyer_review,
                previous=review_record,
            ),
            "origin": record.origin if record is not None else getattr(options, "review_origin", None) or "live_interaction",
            "lesson_text": lesson_text,
            "supporting_experience_ids": [record.id] if record is not None else [],
            "affected_claim_ids": list(getattr(options, "affected_claim_ids", []) or []),
            "issue_categories": list(review.error_categories or []),
            "scope_applicability": self._metadata(options).get("scope_applicability", {}),
            "system_version_reviewed": self._system_version(record, trace),
            "metadata": self._metadata(options),
        }
        return self._upsert_payload(
            db,
            review_id=review.id,
            artifact_type="phase7_reasoning_lesson_candidate",
            contract_type=ReasoningLessonCandidate,
            status="draft",
            builder=lambda version, supersedes: self._finalize_payload(
                ReasoningLessonCandidate,
                lesson_data,
                version=version,
                supersedes_artifact_id=supersedes,
            ),
        )

    def _review_record_payload(
        self,
        db: Session,
        *,
        review: AnswerReview,
        trace: AnswerTrace,
        options: Any,
        trusted_lawyer_review: bool = False,
    ) -> tuple[ReviewRecord, ExperienceRecord | None, str | None]:
        self._lock_parent_review(db, review.id)
        record, integrity_warning = self._linked_experience(db, trace)
        previous = self._latest_contract(db, review.id, "phase7_review_record", ReviewRecord)
        provenance = self._effective_provenance(
            options,
            trusted_lawyer_review=trusted_lawyer_review,
            previous=previous,
        )
        origin = record.origin if record is not None else getattr(options, "review_origin", None) or (
            previous.origin if previous is not None else "live_interaction"
        )
        data = {
            "review_id": review.id,
            "source_review_id": review.id,
            "source_answer_trace_id": trace.id,
            "experience_record_id": record.id if record is not None else None,
            "answer_trace_id": trace.id,
            "source_experience_record_id": record.id if record is not None else None,
            "source_experience_snapshot_sha256": record.snapshot_sha256 if record is not None else None,
            "provenance": provenance,
            "origin": origin,
            "review_outcome": getattr(options, "review_outcome", None) or (
                previous.review_outcome if previous is not None else "unclassified"
            ),
            "review_status": getattr(review, "review_status", None) or "submitted",
            "reviewer_name": review.reviewer_name,
            "reviewer_role": review.reviewer_role,
            "rating": review.rating,
            "severity": review.severity,
            "issue_categories": list(review.error_categories or []),
            "affected_claim_ids": list(
                getattr(options, "affected_claim_ids", None)
                if getattr(options, "affected_claim_ids", None) is not None
                else (previous.affected_claim_ids if previous is not None else [])
            ),
            "lawyer_comment": review.lawyer_comment,
            "comment": review.lawyer_comment,
            "corrected_answer": review.corrected_answer,
            "preferred_reasoning_or_research_approach": getattr(options, "preferred_reasoning_or_research_approach", None)
            or review.lesson_candidate
            or (previous.preferred_reasoning_or_research_approach if previous is not None else None),
            "system_version_reviewed": self._system_version(record, trace),
            "metadata": self._metadata(options, experience_integrity=integrity_warning),
        }
        return ReviewRecord.model_validate(data), record, integrity_warning

    def _upsert_payload(
        self,
        db: Session,
        *,
        review_id: str,
        artifact_type: str,
        contract_type: Type[Any],
        status: str,
        builder: Callable[[int, str | None], Any],
    ) -> MaterializationResult:
        self._lock_parent_review(db, review_id)
        rows = self._artifact_rows(db, review_id, artifact_type)
        latest: ReviewArtifact | None = None
        latest_version = 0
        for row in rows:
            try:
                parsed = contract_type.model_validate(row.artifact_payload or {})
            except Exception as exc:
                raise Phase7ArtifactError(
                    f"Malformed {artifact_type} artifact {row.id}: {exc}"
                ) from exc
            if not self.verify_payload_hash(row.artifact_payload or {}):
                raise Phase7ArtifactError(
                    f"Invalid canonical hash for {artifact_type} artifact {row.id}"
                )
            latest_version = max(latest_version, int(parsed.artifact_version or 1))
            if latest is None or parsed.artifact_version >= self._artifact_version(latest):
                latest = row

        version = 1 if latest is None else latest_version + 1
        payload = builder(version, latest.id if latest is not None else None)
        payload_dict = payload.model_dump(mode="json")
        payload_fingerprint = self.semantic_fingerprint(payload_dict)
        for row in rows:
            if self.semantic_fingerprint(row.artifact_payload or {}) == payload_fingerprint:
                return MaterializationResult(row, row.artifact_status)

        if latest is not None:
            latest.artifact_status = "superseded"
        artifact = ReviewArtifact(
            id=str(uuid4()),
            answer_review_id=review_id,
            artifact_type=artifact_type,
            artifact_payload=payload_dict,
            artifact_status=status,
        )
        db.add(artifact)
        return MaterializationResult(artifact, status)

    @staticmethod
    def _lock_parent_review(db: Session, review_id: str) -> AnswerReview:
        """Serialize materialization for one review on PostgreSQL."""

        locked = db.get(AnswerReview, review_id, with_for_update=True)
        if locked is None:
            raise Phase7ArtifactError(f"AnswerReview {review_id} was not found")
        return locked

    def _finalize_payload(
        self,
        contract_type: Type[Any],
        data: dict[str, Any],
        *,
        version: int,
        supersedes_artifact_id: str | None,
    ) -> Any:
        return self._with_version(
            contract_type.model_validate(
                {
                    **data,
                    "artifact_version": version,
                    "artifact_created_at": datetime.now(timezone.utc).isoformat(),
                    "supersedes_artifact_id": supersedes_artifact_id,
                    "canonical_payload_sha256": None,
                }
            ),
            version=version,
            supersedes_artifact_id=supersedes_artifact_id,
        )

    def _with_version(self, payload: Any, *, version: int, supersedes_artifact_id: str | None) -> Any:
        raw = payload.model_dump(mode="json")
        raw["artifact_version"] = version
        created_at = payload.artifact_created_at or datetime.now(timezone.utc).isoformat()
        raw["artifact_created_at"] = created_at
        raw["supersedes_artifact_id"] = supersedes_artifact_id
        raw["canonical_payload_sha256"] = None
        digest = self.payload_hash(raw)
        return payload.model_copy(
            update={
                "artifact_version": version,
                "artifact_created_at": created_at,
                "supersedes_artifact_id": supersedes_artifact_id,
                "canonical_payload_sha256": digest,
            }
        )

    def _artifact_rows(self, db: Session, review_id: str, artifact_type: str) -> list[ReviewArtifact]:
        return (
            db.query(ReviewArtifact)
            .filter(
                ReviewArtifact.answer_review_id == review_id,
                ReviewArtifact.artifact_type == artifact_type,
            )
            .order_by(ReviewArtifact.created_at.asc())
            .all()
        )

    def _latest_contract(self, db: Session, review_id: str, artifact_type: str, contract_type: Type[Any]) -> Any | None:
        rows = self._artifact_rows(db, review_id, artifact_type)
        if not rows:
            return None
        latest = rows[-1]
        if not self.verify_payload_hash(latest.artifact_payload or {}):
            raise Phase7ArtifactError(f"Invalid canonical hash for {artifact_type} artifact {latest.id}")
        try:
            return contract_type.model_validate(latest.artifact_payload or {})
        except Exception as exc:
            raise Phase7ArtifactError(f"Malformed {artifact_type} artifact {latest.id}: {exc}") from exc

    def _next_version(self, db: Session, review_id: str, artifact_type: str) -> int:
        rows = self._artifact_rows(db, review_id, artifact_type)
        versions = [int((row.artifact_payload or {}).get("artifact_version") or 1) for row in rows]
        return max(versions, default=0) + 1

    @staticmethod
    def _artifact_version(row: ReviewArtifact) -> int:
        return int((row.artifact_payload or {}).get("artifact_version") or 1)

    def _linked_experience(self, db: Session, trace: AnswerTrace) -> tuple[ExperienceRecord | None, str | None]:
        trace_matches = self._experience_matches(
            db.query(ExperienceRecord)
            .filter(ExperienceRecord.answer_trace_id == trace.id)
            .order_by(ExperienceRecord.created_at.asc())
        )
        if len(trace_matches) > 1:
            return None, f"Ambiguous ExperienceRecord link for answer_trace_id {trace.id}"
        record = trace_matches[0] if trace_matches else None
        if record is None:
            request_id = self._trace_request_id(trace)
            if request_id:
                request_matches = self._experience_matches(
                    db.query(ExperienceRecord)
                    .filter(ExperienceRecord.request_id == request_id)
                    .order_by(ExperienceRecord.created_at.asc())
                )
                if len(request_matches) > 1:
                    return None, f"Ambiguous ExperienceRecord link for request_id {request_id}"
                record = request_matches[0] if request_matches else None
        if record is None:
            return None, None
        expected = self.snapshot_sha256(record.snapshot_json)
        if expected != record.snapshot_sha256:
            return record, (
                f"ExperienceRecord {record.id} snapshot SHA mismatch; "
                "no active EvaluationCase or lesson candidate was created"
            )
        return record, None

    @staticmethod
    def _experience_matches(query: Any) -> list[ExperienceRecord]:
        return list(query.all())

    def _evaluation_source(self, trace: AnswerTrace, record: ExperienceRecord | None) -> dict[str, Any]:
        if record is not None:
            snapshot = record.snapshot_json or {}
            request = snapshot.get("request") if isinstance(snapshot.get("request"), dict) else {}
            matter = snapshot.get("matter") if isinstance(snapshot.get("matter"), dict) else {}
            answer = snapshot.get("answer") if isinstance(snapshot.get("answer"), dict) else {}
            claims = self._allowlisted_claims(answer.get("claims"))
            dependencies = self._allowlisted_dependencies(answer.get("claim_dependencies"))
            return {
                "question": str(request.get("original_question") or request.get("effective_question") or "").strip(),
                "answer": str(answer.get("accepted_customer_answer") or ""),
                "matter_state": self._safe_json(matter),
                "claims": claims,
                "dependencies": dependencies,
            }
        trace_json = trace.trace_json if isinstance(trace.trace_json, dict) else {}
        return {
            "question": str(trace.user_message or "").strip(),
            "answer": str(trace.assistant_answer or ""),
            "matter_state": {
                key: self._safe_json(getattr(trace, key, None))
                for key in ("matter_id", "session_id", "turn_index", "response_language", "confidence", "issue_type", "visa_type", "conversation_state")
                if getattr(trace, key, None) is not None
            },
            "claims": self._allowlisted_claims(self._find_key(trace_json, "claims")),
            "dependencies": self._allowlisted_dependencies(self._find_key(trace_json, "claim_dependencies")),
        }

    def _reference_answer(self, review: AnswerReview, source_answer: str, options: Any) -> str | None:
        if review.corrected_answer:
            return review.corrected_answer
        if getattr(options, "review_outcome", None) == "correct":
            return source_answer or None
        return None

    def _expectations(self, options: Any) -> dict[str, Any]:
        return {
            "expected_claim_ids": list(getattr(options, "expected_claim_ids", []) or []),
            "prohibited_claim_ids": list(getattr(options, "prohibited_claim_ids", []) or []),
            "expected_evidence_characteristics": self._safe_json(getattr(options, "expected_evidence_characteristics", {}) or {}),
            "expected_checker_behavior": self._safe_json(getattr(options, "expected_checker_behavior", {}) or {}),
            "prohibited_behaviors": list(getattr(options, "prohibited_behaviors", []) or []),
            "max_latency_ms": getattr(options, "max_latency_ms", None),
            "max_tool_calls": getattr(options, "max_tool_calls", None),
            "tags": list(getattr(options, "tags", []) or []),
        }

    def _metadata(self, options: Any, **extra: Any) -> dict[str, Any]:
        supplied = getattr(options, "phase7_metadata", {}) or {}
        allowed = {"scope_applicability", "notes", "source_integrity", "evaluation_name"}
        metadata = {
            key: self._safe_json(supplied[key])
            for key in allowed
            if isinstance(supplied, dict) and key in supplied
        }
        metadata.update({key: value for key, value in extra.items() if value is not None})
        return metadata

    def _system_version(self, record: ExperienceRecord | None, trace: AnswerTrace) -> str | None:
        if record and isinstance(record.snapshot_json, dict):
            system = record.snapshot_json.get("system")
            if isinstance(system, dict) and system.get("architecture_version"):
                return str(system["architecture_version"])
        trace_json = trace.trace_json if isinstance(trace.trace_json, dict) else {}
        return str(trace_json.get("architecture_version")) if trace_json.get("architecture_version") else None

    def _trace_request_id(self, trace: AnswerTrace) -> str | None:
        data = trace.trace_json if isinstance(trace.trace_json, dict) else {}
        candidates = [data.get("agent_observability")]
        request = data.get("request")
        if isinstance(request, dict):
            candidates.append(request.get("agent_observability"))
        for candidate in candidates:
            if isinstance(candidate, dict) and candidate.get("request_id"):
                return str(candidate["request_id"])
        return None

    @staticmethod
    def _effective_provenance(options: Any, *, trusted_lawyer_review: bool, previous: Any | None) -> str:
        if trusted_lawyer_review:
            return "lawyer_reviewed"
        if (
            getattr(options, "review_origin", None) == "synthetic_test"
            and getattr(options, "review_provenance", None) == "synthetic_test"
        ):
            return "synthetic_test"
        return "system_generated"

    def _find_key(self, value: Any, key: str) -> Any:
        if isinstance(value, dict):
            if key in value:
                return value[key]
            for item in value.values():
                found = self._find_key(item, key)
                if found is not None:
                    return found
        elif isinstance(value, list):
            for item in value:
                found = self._find_key(item, key)
                if found is not None:
                    return found
        return None

    def _allowlisted_claims(self, values: Any) -> list[dict[str, Any]]:
        if not isinstance(values, list):
            return []
        allowed = ("claim_id", "claim_type", "materiality", "text", "claim", "draft_start", "draft_end", "depends_on")
        return [
            {key: self._safe_json(item[key]) for key in allowed if key in item}
            for item in values[:100]
            if isinstance(item, dict) and any(key in item for key in allowed)
        ]

    def _allowlisted_dependencies(self, values: Any) -> list[dict[str, Any]]:
        if not isinstance(values, list):
            return []
        return [
            {"claim_id": str(item.get("claim_id")), "depends_on": [str(x) for x in item.get("depends_on", []) if x]}
            for item in values[:100]
            if isinstance(item, dict) and item.get("claim_id")
        ]

    def _safe_json(self, value: Any, depth: int = 0) -> Any:
        if depth > 6:
            return "[depth-limited]"
        if isinstance(value, dict):
            return {
                str(key): self._safe_json(item, depth + 1)
                for key, item in value.items()
                if not _SENSITIVE_KEY.search(str(key)) and not _HIDDEN_KEY.search(str(key))
            }
        if isinstance(value, list):
            return [self._safe_json(item, depth + 1) for item in value[:100]]
        if isinstance(value, (str, int, float, bool)) or value is None:
            return value
        return str(value)

    @staticmethod
    def snapshot_sha256(snapshot: dict[str, Any]) -> str:
        return hashlib.sha256(Phase7ArtifactService.canonical_json_bytes(snapshot)).hexdigest()

    @staticmethod
    def canonical_json_bytes(value: Any) -> bytes:
        return json.dumps(
            value,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")

    @classmethod
    def semantic_fingerprint(cls, payload: dict[str, Any]) -> str:
        semantic = {
            key: value
            for key, value in payload.items()
            if key not in _SEMANTIC_FINGERPRINT_FIELDS
        }
        return hashlib.sha256(cls.canonical_json_bytes(semantic)).hexdigest()

    @classmethod
    def payload_hash(cls, payload: dict[str, Any]) -> str:
        complete = {
            key: value
            for key, value in payload.items()
            if key != "canonical_payload_sha256"
        }
        return hashlib.sha256(cls.canonical_json_bytes(complete)).hexdigest()

    @classmethod
    def verify_payload_hash(cls, payload: dict[str, Any]) -> bool:
        stored = payload.get("canonical_payload_sha256")
        if not isinstance(stored, str) or len(stored) != 64:
            return False
        try:
            expected = cls.payload_hash(payload)
        except (TypeError, ValueError):
            return False
        return hmac.compare_digest(stored, expected)
