"""Bind optional Default course suggestions to same-request public evidence.

This module never treats native-web output as fetched text or independently
verified facts. L2 is limited to an actual provider citation on an exact official
source host with a narrow discovery-field authority scope; every other field is
an L1 lead. L3 is reserved for the separate approved-manifest acquisition path.
"""

from __future__ import annotations

import ipaddress
import json
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlsplit
from uuid import uuid4

from pydantic import ValidationError

from app.schemas.course_research import (
    CourseResearchCandidateSuggestionV1,
    CourseResearchFieldSuggestionV1,
)
from app.schemas.query import ProjectAssistantContextPacket
from app.services.native_web_locator_resolver import (
    NativeWebLocatorResolver,
    normalize_source_url,
)
from app.services.request_evidence_registry import RequestEvidenceRegistry


_MAX_SUGGESTION_BYTES = 48_000
# Reserve room for the frontend-added assistant message identity and envelope
# overhead so a valid Python result does not fail only after crossing runtimes.
_MAX_BOUND_RESULT_BYTES = 46_000
_MAX_DIAGNOSTIC_COUNTER = 504
_FIELD_AUTHORITY: dict[str, frozenset[str]] = {
    "cricos_registry": frozenset(
        {"qualification", "campus_location", "course_code", "cricos_code", "duration"}
    ),
    "study_australia": frozenset(
        {"qualification", "campus_location", "duration"}
    ),
}


def course_research_task_available(
    context: ProjectAssistantContextPacket | None,
    frontend_chat_id: str | None,
) -> bool:
    """Allow only a live selected School discovery task with a real target."""
    return course_research_activation_reason(context, frontend_chat_id)[0]


def course_research_activation_reason(
    context: ProjectAssistantContextPacket | None,
    frontend_chat_id: str | None,
) -> tuple[bool, str]:
    """Return the activation decision and a stable content-free reason code."""
    if context is None:
        return False, "active_step_context_absent"
    if context.contextOrigin != "project_chat":
        return False, "not_project_chat"
    if context.availability != "available":
        return False, "project_context_unavailable"
    if context.consistency != "live_per_source_revision":
        return False, "project_context_stale"
    if context.project is None or context.project.get("status") != "active":
        return False, "project_not_active"
    if not frontend_chat_id:
        return False, "frontend_chat_missing"
    active = context.activeStep
    if active is None:
        return False, "active_step_context_absent"
    if active.chatId != frontend_chat_id:
        return False, "chat_mismatch"
    if active.projectId != context.project.get("id"):
        return False, "project_mismatch"
    if active.workflowKind != "school_application":
        return False, "workflow_kind_mismatch"
    if active.stepKey != "school_discovery":
        return False, "step_key_mismatch"
    if active.targetKind != "school_application":
        return False, "target_kind_mismatch"
    if active.sourceCoverage not in {"complete", "unavailable"}:
        return False, "source_coverage_unavailable"
    standard = (
        active.task.applicability == "applicable"
        and active.task.actionability == "read_only"
        and active.sourceCoverage == "complete"
    )
    research_while_source_unverified = (
        active.task.applicability == "unavailable"
        and active.task.actionability == "unavailable"
        and active.task.reasonCodes == ["school_course_source_unverified"]
        and active.sourceCoverage == "unavailable"
    )
    rows = context.indexes.get("schoolApplications")
    if not (standard or research_while_source_unverified):
        return False, "task_not_researchable"
    if rows is None:
        return False, "school_index_unavailable"
    matches = [
        row
        for row in rows
        if row.get("applicationId") == active.targetId
        and row.get("status") != "archived"
    ]
    revisions = [
        item
        for item in active.sourceRevisions
        if item.targetKind == "school_application" and item.targetId == active.targetId
    ]
    if len(matches) != 1:
        return False, "school_target_unavailable"
    if (
        len(revisions) != 1
        or matches[0].get("provenanceRevision") != revisions[0].revision
    ):
        return False, "school_target_revision_mismatch"
    return True, (
        "school_course_source_unverified"
        if research_while_source_unverified
        else "school_discovery_available"
    )


def _task_scope_fingerprint(context: ProjectAssistantContextPacket | None) -> str | None:
    """Return a content-free join key for relating diagnostics to one task."""
    if context is None or context.activeStep is None or context.project is None:
        return None
    active = context.activeStep
    canonical = json.dumps(
        [
            context.project.get("id"),
            active.chatId,
            active.projectId,
            active.taskId,
            active.workflowKind,
            active.stepKey,
            active.targetKind,
            active.targetId,
            [[item.targetKind, item.targetId, item.revision] for item in active.sourceRevisions],
        ],
        ensure_ascii=False,
        separators=(",", ":"),
    ).encode("utf-8")
    value = 0xCBF29CE484222325
    for byte in canonical:
        value ^= byte
        value = (value * 0x100000001B3) & 0xFFFFFFFFFFFFFFFF
    return f"{value:016x}"


def initial_course_research_diagnostics(
    *,
    context: ProjectAssistantContextPacket | None,
    frontend_chat_id: str | None,
) -> dict[str, Any]:
    enabled, reason = course_research_activation_reason(context, frontend_chat_id)
    active = context.activeStep if context is not None else None
    return {
        "schema_version": "phase15.course-research-diagnostics.v1",
        "scope_fingerprint": _task_scope_fingerprint(context),
        "python_received_workflow_kind": (
            active.workflowKind if active is not None else None
        ),
        "python_received_step_key": active.stepKey if active is not None else None,
        "python_received_target_kind": (
            active.targetKind if active is not None else None
        ),
        "activation_failed_condition": (
            reason
            if reason
            in {
                "workflow_kind_mismatch",
                "step_key_mismatch",
                "target_kind_mismatch",
            }
            else None
        ),
        "course_research_enabled": enabled,
        "research_activation_reason": reason,
        "research_tool_exposed": False,
        "research_prompt_enabled": False,
        "provider_schema_status": "not_exposed",
        "suggestion_present": False,
        "suggestion_container_status": "not_checked",
        "diagnostic_counter_saturated": False,
        "raw_candidate_count": 0,
        "valid_candidate_count": 0,
        "rejected_candidate_count": 0,
        "rejected_field_count": 0,
        "source_locator_count": 0,
        "resolved_source_count": 0,
        "rejected_source_count": 0,
        "python_binding_status": "not_run" if enabled else "not_eligible",
        "python_binding_reason": "not_run" if enabled else reason,
        "python_bound_candidate_count": 0,
        "frontend_binding_status": "not_run",
        "frontend_binding_reason": "not_run",
        "frontend_bound_candidate_count": 0,
    }


def _source_locator_is_safe(value: Any) -> bool:
    if not isinstance(value, str) or not value or len(value) > 2_000:
        return False
    try:
        parsed = urlsplit(value)
        host = parsed.hostname
        port = parsed.port
        if (
            parsed.scheme.lower() != "https"
            or not host
            or parsed.username
            or parsed.password
            or (port is not None and port != 443)
            or host.lower() == "localhost"
            or host.lower().endswith(".local")
        ):
            return False
        try:
            ipaddress.ip_address(host)
        except ValueError:
            return True
        return False
    except ValueError:
        return False


def _sanitize_locator_list(value: Any, diagnostics: dict[str, Any]) -> list[str] | None:
    if not isinstance(value, list):
        return None
    diagnostics["source_locator_count"] = _bounded_diagnostic_add(
        diagnostics, "source_locator_count", len(value)
    )
    values = value[:6]
    _bounded_diagnostic_add(
        diagnostics, "rejected_source_count", max(0, len(value) - len(values))
    )
    kept: list[str] = []
    for locator in values:
        if _source_locator_is_safe(locator):
            kept.append(locator)
        else:
            _bounded_diagnostic_add(diagnostics, "rejected_source_count", 1)
    return kept


def _bounded_diagnostic_add(
    diagnostics: dict[str, Any], key: str, amount: int
) -> int:
    """Saturate content-free counters to the shared wire contract maximum."""
    current = diagnostics.get(key, 0)
    total = current + max(0, amount)
    if total > _MAX_DIAGNOSTIC_COUNTER:
        diagnostics["diagnostic_counter_saturated"] = True
    total = min(_MAX_DIAGNOSTIC_COUNTER, total)
    diagnostics[key] = total
    return total


def _sanitize_candidate(
    raw_candidate: Any, diagnostics: dict[str, Any]
) -> CourseResearchCandidateSuggestionV1 | None:
    if not isinstance(raw_candidate, dict):
        return None
    try:
        if len(json.dumps(raw_candidate, ensure_ascii=False, separators=(",", ":")).encode("utf-8")) > 8_000:
            return None
    except (TypeError, ValueError):
        return None
    candidate_data = dict(raw_candidate)
    for key in ("identity_source_locators", "source_locators"):
        if key in candidate_data:
            safe_locators = _sanitize_locator_list(candidate_data[key], diagnostics)
            if safe_locators is None:
                return None
            candidate_data[key] = safe_locators

    raw_fields = candidate_data.get("fields", [])
    if not isinstance(raw_fields, list) or len(raw_fields) > 12:
        return None
    safe_fields: list[dict[str, Any]] = []
    seen_keys: set[str] = set()
    for raw_field in raw_fields:
        if not isinstance(raw_field, dict):
            diagnostics["rejected_field_count"] += 1
            continue
        field_data = dict(raw_field)
        if "source_locators" in field_data:
            safe_locators = _sanitize_locator_list(field_data["source_locators"], diagnostics)
            if safe_locators is None:
                diagnostics["rejected_field_count"] += 1
                continue
            field_data["source_locators"] = safe_locators
        try:
            field = CourseResearchFieldSuggestionV1.model_validate(field_data, strict=True)
        except (ValidationError, TypeError, ValueError):
            diagnostics["rejected_field_count"] += 1
            continue
        if field.key in seen_keys:
            diagnostics["rejected_field_count"] += 1
            continue
        seen_keys.add(field.key)
        safe_fields.append(field.model_dump(mode="python"))
    candidate_data["fields"] = safe_fields
    try:
        return CourseResearchCandidateSuggestionV1.model_validate(candidate_data, strict=True)
    except (ValidationError, TypeError, ValueError):
        return None


def _official_authority(url: str) -> str | None:
    """Exact-host identity only; arbitrary .edu.au and lookalikes are excluded."""
    try:
        parsed = urlsplit(url)
        if (
            parsed.scheme.lower() != "https"
            or parsed.username
            or parsed.password
            or (parsed.port is not None and parsed.port != 443)
        ):
            return None
        host = (parsed.hostname or "").lower().rstrip(".")
    except ValueError:
        return None
    if host == "cricos.education.gov.au":
        return "cricos_registry"
    if host in {"studyaustralia.gov.au", "www.studyaustralia.gov.au"}:
        return "study_australia"
    # Institution domains need an exact, current Education Intelligence source
    # manifest. No approved institution manifest registry is deployed today.
    return None


def _presentation_url(url: str) -> str:
    """Return an exact, safe observed URL suitable for a public link.

    Query strings and fragments are rejected instead of silently removed:
    they can change resource identity, and rewriting them would create a link
    that the provider did not observe.
    """
    try:
        parsed = urlsplit(url)
        host = parsed.hostname
        if (
            parsed.scheme.lower() != "https"
            or not host
            or parsed.username
            or parsed.password
            or parsed.port is not None
            or parsed.query
            or parsed.fragment
            or host == "localhost"
            or host.endswith(".local")
        ):
            return ""
        try:
            ipaddress.ip_address(host)
        except ValueError:
            pass
        else:
            return ""
        return url
    except ValueError:
        return ""


def _canonical_utc_timestamp(value: datetime) -> str:
    """Serialize an actual aware instant as a canonical RFC 3339 UTC `Z` time."""
    if not isinstance(value, datetime) or value.tzinfo is None:
        raise ValueError("timestamp must be timezone-aware")
    try:
        if value.utcoffset() is None:
            raise ValueError("timestamp must be timezone-aware")
        return (
            value.astimezone(timezone.utc)
            .isoformat(timespec="microseconds")
            .replace("+00:00", "Z")
        )
    except (OverflowError, ValueError) as exc:
        raise ValueError("timestamp must be a valid timezone-aware instant") from exc


def _candidate_payload(raw: Any) -> tuple[list[Any], str, str | None]:
    if raw is None:
        return [], "omitted", None
    if (
        not isinstance(raw, dict)
        or set(raw) - {"schema_version", "research_status", "candidates"}
        or not {"schema_version", "candidates"}.issubset(raw)
        or raw.get("schema_version") != "phase15.course-research-suggestion.v1"
    ):
        return [], "invalid", None
    try:
        encoded = json.dumps(raw, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    except (TypeError, ValueError):
        return [], "invalid", None
    candidates = raw.get("candidates")
    research_status = raw.get("research_status", "completed")
    if (
        len(encoded) > _MAX_SUGGESTION_BYTES
        or not isinstance(candidates, list)
        or len(candidates) > 6
        or research_status not in {"not_performed", "completed"}
        or (research_status == "not_performed" and candidates)
    ):
        return [], "invalid", None
    return candidates, "empty" if not candidates else "valid", research_status


def bind_course_research_suggestion(
    *,
    raw: Any,
    context: ProjectAssistantContextPacket | None,
    frontend_chat_id: str | None,
    registry: RequestEvidenceRegistry,
) -> dict[str, Any] | None:
    """Compatibility wrapper returning only the authorized bound result."""
    result, _ = bind_course_research_suggestion_with_diagnostics(
        raw=raw,
        context=context,
        frontend_chat_id=frontend_chat_id,
        registry=registry,
    )
    return result


def bind_course_research_suggestion_with_diagnostics(
    *,
    raw: Any,
    context: ProjectAssistantContextPacket | None,
    frontend_chat_id: str | None,
    registry: RequestEvidenceRegistry,
) -> tuple[dict[str, Any] | None, dict[str, Any]]:
    """Bind a bounded result and return stable, content-free stage diagnostics."""
    diagnostics = initial_course_research_diagnostics(
        context=context, frontend_chat_id=frontend_chat_id
    )
    if not diagnostics["course_research_enabled"]:
        return None, diagnostics
    diagnostics["research_tool_exposed"] = True
    diagnostics["research_prompt_enabled"] = True
    diagnostics["provider_schema_status"] = "required"
    diagnostics["suggestion_present"] = raw is not None
    raw_candidate_count = (
        len(raw.get("candidates", []))
        if isinstance(raw, dict) and isinstance(raw.get("candidates"), list)
        else 0
    )
    diagnostics["raw_candidate_count"] = min(6, raw_candidate_count)
    if raw_candidate_count > 6:
        diagnostics["diagnostic_counter_saturated"] = True
    raw_candidates, container_status, research_status = _candidate_payload(raw)
    diagnostics["suggestion_container_status"] = container_status
    diagnostics["research_status"] = research_status
    if container_status == "omitted":
        diagnostics.update(
            python_binding_status="omitted",
            python_binding_reason="suggestion_omitted",
        )
        return None, diagnostics
    if container_status == "invalid":
        diagnostics.update(
            python_binding_status="invalid_container",
            python_binding_reason="suggestion_container_invalid",
        )
        return None, diagnostics
    assert context is not None and context.activeStep is not None
    active = context.activeStep
    resolver = NativeWebLocatorResolver(registry)
    bound_candidates: list[dict[str, Any]] = []
    invalid_candidate_count = 0

    for raw_candidate in raw_candidates:
        candidate = _sanitize_candidate(raw_candidate, diagnostics)
        if candidate is None:
            invalid_candidate_count += 1
            continue
        diagnostics["valid_candidate_count"] += 1

        locators: list[str] = list(candidate.identity_source_locators)
        locators.extend(candidate.source_locators)
        for field in candidate.fields:
            locators.extend(field.source_locators)
        locator_values = list(dict.fromkeys(locators))
        if len(locator_values) > 48:
            invalid_candidate_count += 1
            diagnostics["valid_candidate_count"] -= 1
            continue
        resolution = resolver.resolve([{"url": value} for value in locator_values])
        source_by_ref: dict[str, dict[str, Any]] = {}
        ref_by_locator: dict[str, str] = {}
        for locator in locator_values:
            ref = resolution.resolved.get(locator)
            if not ref:
                continue
            try:
                entry = registry.resolve(ref)
                evidence = registry.resolve_evidence(ref)
            except Exception:
                continue
            actual_url = getattr(evidence, "url", None)
            title = getattr(evidence, "title", None)
            if not isinstance(actual_url, str) or not isinstance(title, str):
                continue
            try:
                observed_at = _canonical_utc_timestamp(entry.registered_at)
            except (AttributeError, ValueError):
                # Never invent an observation time for an invalid registry entry.
                continue
            try:
                normalize_source_url(actual_url)
            except ValueError:
                continue
            presentation_url = _presentation_url(actual_url)
            if not presentation_url:
                continue
            source = source_by_ref.get(ref)
            if source is None:
                source = {
                    "sourceId": str(uuid4()),
                    "url": presentation_url,
                    "title": title[:240],
                    "authority": _official_authority(actual_url) or "unverified_source",
                    "association": "cited" if entry.native_web_citation else "observed_only",
                    "observedAt": observed_at,
                    "currentness": "unknown",
                }
                source_by_ref[ref] = source
            # Match normalized URL identity, never a model-supplied identifier.
            ref_by_locator[locator] = ref
        _bounded_diagnostic_add(
            diagnostics, "resolved_source_count", len(ref_by_locator)
        )
        _bounded_diagnostic_add(
            diagnostics,
            "rejected_source_count",
            sum(1 for locator in locator_values if locator not in ref_by_locator),
        )

        def source_ids_for(values: list[str]) -> list[str]:
            found: list[str] = []
            for locator in values:
                ref = ref_by_locator.get(locator)
                source = source_by_ref.get(ref or "")
                if source and source["sourceId"] not in found:
                    found.append(source["sourceId"])
            return found[:6]

        candidate_sources: list[dict[str, Any]] = []
        for locator in locator_values:
            ref = ref_by_locator.get(locator)
            source = source_by_ref.get(ref or "")
            if source and all(item["sourceId"] != source["sourceId"] for item in candidate_sources):
                candidate_sources.append(source)
        candidate_sources = candidate_sources[:6]
        _bounded_diagnostic_add(
            diagnostics,
            "rejected_source_count",
            max(0, len(source_by_ref) - len(candidate_sources)),
        )
        allowed_source_ids = {item["sourceId"] for item in candidate_sources}
        source_index = {item["sourceId"]: item for item in candidate_sources}

        identity_source_ids = [
            source_id
            for source_id in source_ids_for(candidate.identity_source_locators)
            if source_id in allowed_source_ids
        ]
        identity_l2 = any(
            source_index.get(source_id, {}).get("authority")
            in {"cricos_registry", "study_australia"}
            and source_index.get(source_id, {}).get("association") == "cited"
            for source_id in identity_source_ids
        )
        output_fields: list[dict[str, Any]] = []
        for field in candidate.fields:
            source_ids = source_ids_for(field.source_locators)
            source_ids = [value for value in source_ids if value in allowed_source_ids]
            field_l2 = any(
                (source := source_index.get(source_id)) is not None
                and source.get("authority") in _FIELD_AUTHORITY
                and source.get("association") == "cited"
                and field.key in _FIELD_AUTHORITY[str(source.get("authority"))]
                for source_id in source_ids
            )
            output_fields.append(
                {
                    "key": field.key,
                    "value": field.value,
                    "evidenceLevel": (
                        "official_source_referenced" if field.value is not None and field_l2
                        else "model_research_lead"
                    ),
                    "sourceIds": source_ids,
                    "applicabilityNote": field.applicability_note,
                    "independentObservation": None,
                }
            )
        candidate_id = str(uuid4())
        bound_candidates.append(
            {
                "candidateId": candidate_id,
                "institutionName": candidate.institution_name.strip(),
                "courseTitle": candidate.course_title.strip(),
                "identityEvidenceLevel": (
                    "official_source_referenced" if identity_l2 else "model_research_lead"
                ),
                "identitySourceIds": identity_source_ids,
                "fields": output_fields,
                "sources": candidate_sources,
                "limitations": list(candidate.limitations),
                "verificationState": "not_requested",
            }
        )

    diagnostics["rejected_candidate_count"] = invalid_candidate_count
    if raw_candidates and not bound_candidates:
        diagnostics.update(
            python_binding_status="all_candidates_rejected",
            python_binding_reason="all_candidates_invalid",
        )
        return None, diagnostics
    result = {
        "schemaVersion": "phase15.course-research-result.v1",
        "projectId": active.projectId,
        "chatId": active.chatId,
        "taskId": active.taskId,
        "definitionVersion": active.definitionVersion,
        "workflowKind": active.workflowKind,
        "stepKey": active.stepKey,
        "targetKind": active.targetKind,
        "targetId": active.targetId,
        "researchStatus": research_status or "completed",
        "sourceRevisions": [item.model_dump(mode="json") for item in active.sourceRevisions],
        "observedAt": _canonical_utc_timestamp(datetime.now(timezone.utc)),
        "candidates": bound_candidates,
        "limitations": [
            "Course research is exploratory. Provider-native search does not expose exact source text to this application.",
            "Official source citations are field attributions, not independent verification or proof of current availability.",
            "Institution course-page authority requires an approved exact source manifest; no live institution manifests are configured.",
        ],
        "diagnostics": {
            "invalidCandidateCount": invalid_candidate_count,
            "invalidFieldCount": diagnostics["rejected_field_count"],
            "rejectedSourceLocatorCount": diagnostics["rejected_source_count"],
        },
    }
    try:
        if len(json.dumps(result, ensure_ascii=False, separators=(",", ":")).encode("utf-8")) > _MAX_BOUND_RESULT_BYTES:
            diagnostics.update(
                python_binding_status="result_too_large",
                python_binding_reason="bound_result_exceeds_python_limit",
            )
            return None, diagnostics
    except (TypeError, ValueError):
        diagnostics.update(
            python_binding_status="invalid_container",
            python_binding_reason="bound_result_serialization_failed",
        )
        return None, diagnostics
    diagnostics["python_bound_candidate_count"] = len(bound_candidates)
    if not bound_candidates:
        diagnostics.update(
            python_binding_status="empty",
            python_binding_reason=(
                "research_not_performed"
                if research_status == "not_performed"
                else "research_completed_without_candidates"
            ),
        )
    elif invalid_candidate_count:
        diagnostics.update(
            python_binding_status="partial",
            python_binding_reason="some_candidates_rejected",
        )
    else:
        diagnostics.update(
            python_binding_status="bound",
            python_binding_reason="all_valid_candidates_bound",
        )
    return result, diagnostics
