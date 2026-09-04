"""Passive, append-only Phase 7.1 Experience Archive writer."""

from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import threading
from concurrent.futures import ThreadPoolExecutor
from contextvars import ContextVar
from dataclasses import dataclass
from typing import Any
from uuid import uuid4

from sqlalchemy.exc import IntegrityError

from app.core.config import get_settings
from app.db.models import ExperienceRecord, Matter
from app.db.session import SessionLocal
from app.schemas.learning import ExperienceOrigin, ExperienceSnapshot
from app.schemas.query import QueryRequest, QueryResponse

logger = logging.getLogger(__name__)

_SENSITIVE_KEY = re.compile(
    r"(?:password|passwd|secret|api[_-]?key|access[_-]?key|private[_-]?key|authorization|bearer|credential|(?:^|_)(?:access|refresh|session|csrf)?[_-]?token$)",
    re.IGNORECASE,
)
_NON_ARCHIVE_KEY = re.compile(
    r"(?:chain[_ -]?of[_ -]?thought|hidden[_ -]?reasoning|scratchpad|raw[_ -]?model[_ -]?output)",
    re.IGNORECASE,
)

_ARCHIVE_EXECUTOR = ThreadPoolExecutor(max_workers=2, thread_name_prefix="phase7-archive")
_ARCHIVE_SLOTS = threading.BoundedSemaphore(34)
_CAPTURED_REQUEST_ID: ContextVar[str | None] = ContextVar(
    "phase7_experience_capture_request_id", default=None
)

LIVE_EXPERIENCE_ARCHIVE_MODES = frozenset(
    {
        "default",
        "default_legal_pipeline",
        "premium",
        "premium_direct_gpt55_high",
    }
)


def is_eligible_live_experience_archive_mode(mode: object) -> bool:
    return isinstance(mode, str) and mode in LIVE_EXPERIENCE_ARCHIVE_MODES


@dataclass(frozen=True, slots=True)
class ExperiencePersistencePayload:
    """Pure data crossing the bounded async persistence boundary."""

    record_id: str
    experience_schema_version: str
    request_id: str | None
    matter_id: str | None
    session_id: str | None
    answer_trace_id: str | None
    origin: str
    snapshot_json: dict[str, Any]
    snapshot_sha256: str


class ExperienceArchiveService:
    """Build and safely persist one immutable experience snapshot."""

    def __init__(self, *, session_factory=None, settings=None) -> None:
        self.session_factory = session_factory or SessionLocal
        self.settings = settings or get_settings()

    def safe_capture(
        self,
        *,
        payload: QueryRequest,
        response: QueryResponse,
        matter: Matter | Any | None = None,
        state: Any | None = None,
        answer_trace_id: str | None = None,
        request_id: str | None = None,
        original_question: str | None = None,
        effective_question: str | None = None,
        stage_timing: dict[str, Any] | None = None,
        execution_metrics: Any | None = None,
        evidence_registry: Any | None = None,
        origin: ExperienceOrigin = "live_interaction",
    ) -> str | None:
        """Capture without allowing an archive failure to affect serving."""

        if not getattr(self.settings, "phase7_experience_archive_enabled", False):
            return None
        if origin == "live_interaction" and not is_eligible_live_experience_archive_mode(
            getattr(payload, "assistant_mode", None)
        ):
            return None

        stable_request_id = self._request_id(payload, request_id)
        try:
            persistence = self._build_persistence_payload(
                payload=payload,
                response=response,
                matter=matter,
                state=state,
                request_id=stable_request_id,
                original_question=original_question,
                effective_question=effective_question,
                stage_timing=stage_timing,
                execution_metrics=execution_metrics,
                evidence_registry=evidence_registry,
                answer_trace_id=answer_trace_id,
                origin=origin,
            )
            return self._persist_snapshot(persistence)
        except Exception:
            logger.exception("Experience archive write failed; public response is unchanged.")
            return None

    def safe_capture_async(self, **kwargs: Any) -> None:
        """Build the snapshot now, then persist pure data asynchronously."""

        if not getattr(self.settings, "phase7_experience_archive_enabled", False):
            return
        payload: QueryRequest = kwargs["payload"]
        origin = kwargs.get("origin", "live_interaction")
        if origin == "live_interaction" and not is_eligible_live_experience_archive_mode(
            getattr(payload, "assistant_mode", None)
        ):
            return
        request_id = self._request_id(kwargs["payload"], kwargs.get("request_id"))
        if request_id and self.capture_scheduled_for(request_id):
            return
        if not _ARCHIVE_SLOTS.acquire(blocking=False):
            logger.warning("Experience archive queue is full; skipping passive capture.")
            return
        try:
            persistence = self._build_persistence_payload(**kwargs)
            if request_id:
                _CAPTURED_REQUEST_ID.set(request_id)
            _ARCHIVE_EXECUTOR.submit(self._persist_and_release, persistence)
        except Exception:
            _ARCHIVE_SLOTS.release()
            logger.exception("Experience snapshot construction failed; public response is unchanged.")

    def _persist_and_release(self, persistence: ExperiencePersistencePayload) -> None:
        try:
            self._persist_snapshot(persistence)
        finally:
            _ARCHIVE_SLOTS.release()

    @staticmethod
    def capture_scheduled_for(request_id: str | None) -> bool:
        return bool(request_id) and _CAPTURED_REQUEST_ID.get() == request_id

    def _build_persistence_payload(self, **kwargs: Any) -> ExperiencePersistencePayload:
        payload: QueryRequest = kwargs["payload"]
        response: QueryResponse = kwargs["response"]
        matter = kwargs.get("matter")
        request_id = self._request_id(payload, kwargs.get("request_id"))
        snapshot = self.build_snapshot(
            payload=payload,
            response=response,
            matter=matter,
            state=kwargs.get("state"),
            request_id=request_id,
            original_question=kwargs.get("original_question"),
            effective_question=kwargs.get("effective_question"),
            stage_timing=kwargs.get("stage_timing"),
            execution_metrics=kwargs.get("execution_metrics"),
            evidence_registry=kwargs.get("evidence_registry"),
            origin=kwargs.get("origin", "live_interaction"),
        )
        snapshot_json = snapshot.model_dump(mode="json")
        return ExperiencePersistencePayload(
            record_id=str(uuid4()),
            experience_schema_version=snapshot.schema_version,
            request_id=request_id,
            matter_id=getattr(matter, "id", None) or response.matter_id,
            session_id=getattr(matter, "session_id", None) or payload.session_id,
            answer_trace_id=kwargs.get("answer_trace_id"),
            origin=kwargs.get("origin", "live_interaction"),
            snapshot_json=snapshot_json,
            snapshot_sha256=self.snapshot_sha256(snapshot_json),
        )

    def _persist_snapshot(self, persistence: ExperiencePersistencePayload) -> str | None:
        try:
            with self.session_factory() as db:
                if persistence.request_id:
                    existing = (
                        db.query(ExperienceRecord)
                        .filter(ExperienceRecord.request_id == persistence.request_id)
                        .one_or_none()
                    )
                    if existing is not None:
                        return existing.id

                record = ExperienceRecord(
                    id=persistence.record_id,
                    experience_schema_version=persistence.experience_schema_version,
                    request_id=persistence.request_id,
                    matter_id=persistence.matter_id,
                    session_id=persistence.session_id,
                    answer_trace_id=persistence.answer_trace_id,
                    origin=persistence.origin,
                    snapshot_json=persistence.snapshot_json,
                    snapshot_sha256=persistence.snapshot_sha256,
                )
                db.add(record)
                try:
                    db.commit()
                except IntegrityError:
                    db.rollback()
                    if persistence.request_id:
                        existing = (
                            db.query(ExperienceRecord)
                            .filter(ExperienceRecord.request_id == persistence.request_id)
                            .one_or_none()
                        )
                        if existing is not None:
                            return existing.id
                    raise
                return record.id
        except Exception:
            logger.exception("Experience archive persistence failed; public response is unchanged.")
            return None

    def build_snapshot(
        self,
        *,
        payload: QueryRequest,
        response: QueryResponse,
        matter: Matter | Any | None = None,
        state: Any | None = None,
        request_id: str | None = None,
        original_question: str | None = None,
        effective_question: str | None = None,
        stage_timing: dict[str, Any] | None = None,
        execution_metrics: Any | None = None,
        evidence_registry: Any | None = None,
        origin: ExperienceOrigin = "live_interaction",
    ) -> ExperienceSnapshot:
        observability = self._current_observability()
        metrics = execution_metrics or (
            observability.get("execution_metrics") if observability else None
        )
        effective_request_id = request_id or (
            observability.get("request_id") if observability else None
        )
        matter_id = getattr(matter, "id", None) or response.matter_id or payload.matter_id
        response_debug = self._safe_json(response.retrieval_debug or {})
        response_trace = self._safe_json(response.legal_reasoning_trace or {})
        claims = self._extract_claims(response_trace, response_debug)
        reported_refs = self._extract_values_by_key(
            [response_trace, response_debug], {"evidence_ref", "evidence_refs"}
        )
        registry_evidence = self._registry_evidence(evidence_registry)

        return ExperienceSnapshot(
            request={
                "request_id": effective_request_id,
                "matter_id": matter_id,
                "session_id": getattr(matter, "session_id", None) or payload.session_id,
                "client_turn_id": payload.client_turn_id,
                "original_question": original_question or payload.question,
                "effective_question": effective_question or payload.question,
                "response_language": response.response_language,
                "assistant_mode": payload.assistant_mode,
                "as_of_date": self._first_value(response_debug, "as_of_date"),
            },
            matter={
                "matter_id": matter_id,
                "session_id": getattr(matter, "session_id", None) or payload.session_id,
                "issue_type": response.issue_type or getattr(matter, "issue_type", None),
                "visa_type": getattr(matter, "visa_type", None),
                "status": getattr(matter, "status", None),
                "compact_state": self._safe_json(state),
                "relevant_facts": self._relevant_facts(state),
            },
            answer={
                "accepted_customer_answer": response.answer,
                "confidence": response.confidence,
                "next_action": response.next_action,
                "missing_facts": list(response.missing_facts or []),
                "follow_up_questions": list(response.follow_up_questions or []),
                "claims": claims,
                "claim_dependencies": [
                    {"claim_id": item["claim_id"], "depends_on": item["depends_on"]}
                    for item in claims
                    if item.get("claim_id") and item.get("depends_on")
                ],
                "citations": self._safe_json(response.citations or []),
                "research_status": response.research_status,
                "legal_reasoning_trace": response_trace,
            },
            research={
                "tool_names": [row["tool_name"] for row in self._research_tool_rows(response_debug, metrics) if row.get("tool_name")],
                "tool_calls": self._research_tool_rows(response_debug, metrics),
                "stage_timing": self._safe_json(
                    stage_timing if stage_timing is not None else self._first_value(response_debug, "stage_timing")
                ),
                "reported_evidence_refs": reported_refs[:256],
                "observability": self._safe_json(metrics),
            },
            evidence={
                # Only these entries are registry-authoritative.  Reported refs
                # are retained separately and never promoted to legal evidence.
                "registered_evidence_refs": [item["evidence_ref"] for item in registry_evidence],
                "registered_evidence": registry_evidence,
                "reported_evidence_refs": reported_refs[:256],
            },
            phase6=self._phase6_snapshot(response, response_debug),
            system={
                "architecture_version": (
                    observability.get("architecture_version")
                    if observability
                    else getattr(response, "architecture_version", None)
                ),
                "git_commit_sha": os.getenv("GIT_COMMIT_SHA") or os.getenv("APP_GIT_SHA"),
                "answer_model": self._answer_model(metrics, response_debug),
                "answer_reasoning_effort": self._answer_effort(metrics),
                "feature_flags": {
                    "phase7_experience_archive_enabled": bool(
                        getattr(self.settings, "phase7_experience_archive_enabled", False)
                    ),
                    "compact_checker_enabled": bool(getattr(self.settings, "compact_checker_enabled", False)),
                },
                "execution_metrics": self._safe_json(metrics),
                "latency_total_ms": self._metric(metrics, "total_latency_ms"),
                "provider_api_call_count": self._metric(metrics, "provider_api_call_count"),
                "tool_call_count": self._metric(metrics, "tool_call_count"),
            },
            provenance={"schema_version": "phase7.experience.v1", "origin": origin},
        )

    @staticmethod
    def snapshot_sha256(snapshot: ExperienceSnapshot | dict[str, Any]) -> str:
        data = snapshot.model_dump(mode="json") if hasattr(snapshot, "model_dump") else snapshot
        canonical = json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(canonical.encode("utf-8")).hexdigest()

    def _current_observability(self) -> dict[str, Any] | None:
        try:
            from app.services.agent_observability_service import AgentObservabilityService

            return AgentObservabilityService().trace_payload()
        except Exception:
            return None

    def _request_id(self, payload: QueryRequest, explicit: str | None) -> str | None:
        if explicit:
            return explicit
        observability = self._current_observability()
        return (observability or {}).get("request_id") or getattr(payload, "client_turn_id", None)

    def _safe_json(self, value: Any, *, depth: int = 0) -> Any:
        if value is None:
            return None
        if depth > 8:
            return "[depth-limited]"
        if hasattr(value, "model_dump"):
            value = value.model_dump(mode="json")
        if isinstance(value, dict):
            return {
                str(key): self._safe_json(item, depth=depth + 1)
                for key, item in value.items()
                if not _SENSITIVE_KEY.search(str(key)) and not _NON_ARCHIVE_KEY.search(str(key))
            }
        if isinstance(value, (list, tuple)):
            return [self._safe_json(item, depth=depth + 1) for item in value]
        if isinstance(value, (str, int, float, bool)):
            return value
        try:
            return json.loads(json.dumps(value, ensure_ascii=False, default=str))
        except Exception:
            return str(value)

    def _relevant_facts(self, state: Any | None) -> dict[str, Any]:
        data = self._safe_json(state)
        if not isinstance(data, dict):
            return {}
        keys = ("carried_intake_facts", "fact_slot_states", "case_hypothesis", "issue_type", "visa_type")
        return {key: data.get(key) for key in keys if data.get(key) not in (None, {}, [])}

    def _extract_claims(self, *containers: Any) -> list[dict[str, Any]]:
        claims: list[dict[str, Any]] = []
        for container in containers:
            for value in self._values_for_keys(container, {"claims", "material_claims", "accepted_claims"}):
                if not isinstance(value, list):
                    continue
                for raw in value:
                    if not isinstance(raw, dict):
                        continue
                    allowed = {
                        key: self._safe_json(raw[key])
                        for key in ("claim_id", "claim_type", "materiality", "text", "claim", "draft_start", "draft_end", "evidence_refs", "depends_on")
                        if key in raw
                    }
                    if allowed and allowed not in claims:
                        claims.append(allowed)
        return claims[:100]

    def _registry_evidence(self, registry: Any | None) -> list[dict[str, Any]]:
        if registry is None:
            return []
        rows: list[dict[str, Any]] = []
        try:
            for evidence_ref in list(registry.get_all_refs())[:64]:
                try:
                    entry = registry.resolve(evidence_ref)
                    if getattr(entry, "tool_name", "") in {"schedule2_navigation", "lightrag_search"}:
                        continue
                    rows.append({
                        "evidence_ref": evidence_ref,
                        "tool_name": getattr(entry, "tool_name", None),
                        "tool_call_id": getattr(entry, "tool_call_id", None),
                        "registered_at": self._safe_json(getattr(entry, "registered_at", None)),
                        "unresolved_cross_references": list(
                            getattr(entry, "unresolved_cross_references", ()) or ()
                        ),
                        "evidence": self._safe_json(getattr(entry, "evidence_record", None)),
                    })
                except Exception:
                    logger.warning("Could not snapshot one request evidence entry; skipping it.")
        except Exception:
            logger.warning("Could not snapshot request evidence registry; continuing without it.")
        return rows

    def _research_tool_rows(self, debug: Any, metrics: Any) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        data = self._safe_json(metrics)
        if isinstance(data, dict):
            for raw in data.get("tool_calls") or []:
                if isinstance(raw, dict):
                    rows.append({key: raw[key] for key in ("tool_name", "tool_call_id", "round_index", "status", "duration_ms", "result_count", "governor_denied", "is_retry") if key in raw})
        for value in self._values_for_keys(debug, {"retrieval_runs"}):
            if not isinstance(value, list):
                continue
            for item in value:
                if not isinstance(item, dict):
                    continue
                row = {key: self._safe_json(item[key]) for key in ("tool_name", "tool", "type", "status", "duration_ms", "result_count", "local_chunk_count", "live_chunk_count", "call_id") if key in item}
                if row and row not in rows:
                    rows.append(row)
        return rows[:64]

    def _phase6_snapshot(self, response: QueryResponse, debug: Any) -> dict[str, Any]:
        explicit = self._first_mapping(debug, {"phase6", "phase6_checker", "compact_checker", "checker"})
        if explicit:
            allowed = {key: self._safe_json(explicit[key]) for key in ("status", "checker_status", "checker_required", "skip_reason", "error_code", "error", "result", "checker_result", "verdicts", "decisions", "reason_codes", "material_omission_suspected", "material_omission_evidence_refs", "duration_ms", "latency_ms", "model", "reasoning_effort", "checker_packet") if key in explicit}
            if "status" not in allowed and "checker_status" in allowed:
                allowed["status"] = allowed["checker_status"]
            allowed.setdefault("status", "unavailable")
            return allowed
        status = self._first_value(debug, "checker_status")
        if status is not None:
            return {"status": status, "result": self._first_value(debug, "checker_result")}
        # QueryResponse.fact_check_status belongs to the legacy fact-checking
        # contract and is intentionally not interpreted as Phase-6 metadata.
        return {"status": "disabled" if not getattr(self.settings, "compact_checker_enabled", False) else "unavailable", "result": None}

    def _answer_model(self, metrics: Any, debug: Any) -> str | None:
        data = self._safe_json(metrics)
        if isinstance(data, dict):
            calls = data.get("provider_calls") or []
            if calls and isinstance(calls[0], dict):
                return calls[0].get("model")
        return self._first_value(debug, "reasoning_model")

    def _answer_effort(self, metrics: Any) -> str | None:
        data = self._safe_json(metrics)
        if isinstance(data, dict):
            calls = data.get("provider_calls") or []
            if calls and isinstance(calls[0], dict):
                return calls[0].get("effort")
        return None

    def _metric(self, metrics: Any, key: str) -> Any:
        data = self._safe_json(metrics)
        return data.get(key) if isinstance(data, dict) else None

    def _values_for_keys(self, value: Any, keys: set[str]) -> list[Any]:
        found: list[Any] = []
        if isinstance(value, dict):
            for key, item in value.items():
                if str(key) in keys:
                    found.append(item)
                found.extend(self._values_for_keys(item, keys))
        elif isinstance(value, list):
            for item in value:
                found.extend(self._values_for_keys(item, keys))
        return found

    def _extract_values_by_key(self, containers: list[Any], keys: set[str]) -> list[str]:
        found: list[str] = []
        for container in containers:
            for value in self._values_for_keys(container, keys):
                values = value if isinstance(value, list) else [value]
                for item in values:
                    if isinstance(item, str) and item and item not in found:
                        found.append(item)
        return found

    def _first_value(self, value: Any, key: str) -> Any:
        values = self._values_for_keys(value, {key})
        return values[0] if values else None

    def _first_mapping(self, value: Any, keys: set[str]) -> dict[str, Any] | None:
        values = self._values_for_keys(value, keys)
        return next((item for item in values if isinstance(item, dict)), None)
