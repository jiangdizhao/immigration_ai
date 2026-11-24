from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace as NS

from app.schemas.evidence import NativeWebCitation, NativeWebEvidenceRef
from app.schemas.query import ActiveStepSourceRevisionPacket
from app.services.course_research_bridge import (
    bind_course_research_suggestion,
    bind_course_research_suggestion_with_diagnostics,
    course_research_activation_reason,
    course_research_task_available,
    initial_course_research_diagnostics,
)
from app.services.request_evidence_registry import RequestEvidenceRegistry


PROJECT_ID = "11111111-1111-4111-8111-111111111111"
CHAT_ID = "22222222-2222-4222-8222-222222222222"
SCHOOL_ID = "33333333-3333-4333-8333-333333333333"
CRICOS_URL = "https://cricos.education.gov.au/courses/example"
NOW = datetime(2026, 11, 24, tzinfo=timezone.utc)


def _context(*, reason: str = "school_course_source_unverified"):
    revision = ActiveStepSourceRevisionPacket(
        targetKind="school_application", targetId=SCHOOL_ID, revision=3
    )
    task = NS(
        applicability="unavailable",
        actionability="unavailable",
        reasonCodes=[reason],
    )
    active = NS(
        schemaVersion="phase15.active-step-context.v1",
        chatId=CHAT_ID,
        projectId=PROJECT_ID,
        definitionVersion="phase15.project-workflows.v1",
        taskId=f"phase15.project-workflows.v1:school_application:school_discovery:school_application:{SCHOOL_ID}",
        workflowKind="school_application",
        stepKey="school_discovery",
        targetKind="school_application",
        targetId=SCHOOL_ID,
        sourceCoverage="unavailable",
        sourceRevisions=[revision],
        task=task,
    )
    return NS(
        contextOrigin="project_chat",
        availability="available",
        consistency="live_per_source_revision",
        project={"id": PROJECT_ID, "status": "active"},
        activeStep=active,
        indexes={
            "schoolApplications": [
                {
                    "applicationId": SCHOOL_ID,
                    "status": "draft",
                    "provenanceRevision": 3,
                }
            ]
        },
    )


def _registry(*, cited: bool = True, url: str = CRICOS_URL):
    registry = RequestEvidenceRegistry(request_id="course-research-test")
    evidence_ref = registry.register_native_web_evidence(
        evidence=NativeWebEvidenceRef(
            evidence_ref="web:pending",
            evidence_origin="openai_web_native",
            source_type="web_page",
            source_authenticity="unverified",
            authority_kind="commentary",
            jurisdiction=None,
            binding_status="unknown",
            court_or_tribunal_level=None,
            retrieved_at=NOW,
            provenance_complete=False,
            search_call_id="search-call-1",
            url=url,
            title="Course registry result",
            native_web_citation=(
                NativeWebCitation(start_index=0, end_index=15) if cited else None
            ),
        ),
        tool_call_id="web-search-1",
    )
    return registry, evidence_ref


def _suggestion(url: str = CRICOS_URL):
    return {
        "schema_version": "phase15.course-research-suggestion.v1",
        "candidates": [
            {
                "institution_name": "Example University",
                "course_title": "Master of Example Studies",
                "identity_source_locators": [url],
                "source_locators": [url],
                "fields": [
                    {
                        "key": "course_code",
                        "value": "EX-2027",
                        "source_locators": [url],
                    },
                    {
                        "key": "tuition_amount",
                        "value": "AUD 42,000",
                        "source_locators": [url],
                    },
                ],
                "limitations": ["Current intake and fees are unknown."],
            }
        ],
    }


def test_research_is_available_for_exact_unverified_school_task_only() -> None:
    context = _context()
    assert course_research_task_available(context, CHAT_ID) is True
    assert course_research_task_available(context, "other-chat") is False
    assert course_research_task_available(
        _context(reason="school_application_archived"), CHAT_ID
    ) is False


def test_activation_diagnostics_identify_the_exact_mismatched_task_dimension() -> None:
    for field, value, expected_reason in (
        ("workflowKind", "school_admissions", "workflow_kind_mismatch"),
        ("stepKey", "planning", "step_key_mismatch"),
        ("targetKind", "school_admission_case", "target_kind_mismatch"),
    ):
        context = _context()
        setattr(context.activeStep, field, value)
        enabled, reason = course_research_activation_reason(context, CHAT_ID)
        diagnostics = initial_course_research_diagnostics(
            context=context,
            frontend_chat_id=CHAT_ID,
        )

        assert enabled is False
        assert reason == expected_reason
        assert diagnostics["activation_failed_condition"] == expected_reason
        assert diagnostics[f"python_received_{'workflow_kind' if field == 'workflowKind' else 'step_key' if field == 'stepKey' else 'target_kind'}"] == value


def test_same_request_cited_official_source_assigns_l2_only_within_field_scope() -> None:
    context = _context()
    registry, _ = _registry(cited=True)
    result = bind_course_research_suggestion(
        raw=_suggestion(),
        context=context,
        frontend_chat_id=CHAT_ID,
        registry=registry,
    )
    assert result is not None
    candidate = result["candidates"][0]
    assert candidate["identityEvidenceLevel"] == "official_source_referenced"
    fields = {entry["key"]: entry for entry in candidate["fields"]}
    assert fields["course_code"]["evidenceLevel"] == "official_source_referenced"
    assert fields["tuition_amount"]["evidenceLevel"] == "model_research_lead"
    assert fields["course_code"]["independentObservation"] is None
    assert candidate["sources"][0]["currentness"] == "unknown"


def test_observed_only_source_list_and_lookalike_host_never_upgrade_fields() -> None:
    context = _context()
    observed_registry, _ = _registry(cited=False)
    observed = bind_course_research_suggestion(
        raw=_suggestion(),
        context=context,
        frontend_chat_id=CHAT_ID,
        registry=observed_registry,
    )
    assert observed is not None
    assert observed["candidates"][0]["identityEvidenceLevel"] == "model_research_lead"
    assert all(
        entry["evidenceLevel"] == "model_research_lead"
        for entry in observed["candidates"][0]["fields"]
    )
    assert observed["candidates"][0]["sources"][0]["association"] == "observed_only"

    lookalike = "https://cricos.education.gov.au.attacker.example/courses/example"
    lookalike_registry, _ = _registry(cited=True, url=lookalike)
    untrusted = bind_course_research_suggestion(
        raw=_suggestion(lookalike),
        context=context,
        frontend_chat_id=CHAT_ID,
        registry=lookalike_registry,
    )
    assert untrusted is not None
    assert untrusted["candidates"][0]["sources"][0]["authority"] == "unverified_source"
    assert all(
        entry["evidenceLevel"] == "model_research_lead"
        for entry in untrusted["candidates"][0]["fields"]
    )


def test_unobserved_urls_are_not_displayed_and_bad_candidates_are_dropped_individually() -> None:
    context = _context()
    registry, _ = _registry()
    raw = _suggestion("https://cricos.education.gov.au/unobserved")
    raw["candidates"].append({"institution_name": "malformed"})
    result = bind_course_research_suggestion(
        raw=raw,
        context=context,
        frontend_chat_id=CHAT_ID,
        registry=registry,
    )
    assert result is not None
    assert result["diagnostics"]["invalidCandidateCount"] == 1
    candidate = result["candidates"][0]
    assert candidate["sources"] == []
    assert candidate["identityEvidenceLevel"] == "model_research_lead"
    assert all(entry["sourceIds"] == [] for entry in candidate["fields"])


def test_query_bearing_observed_url_is_not_rewritten_into_a_different_public_link() -> None:
    url = f"{CRICOS_URL}?session=private-value"
    registry, _ = _registry(url=url)
    result = bind_course_research_suggestion(
        raw=_suggestion(url),
        context=_context(),
        frontend_chat_id=CHAT_ID,
        registry=registry,
    )
    assert result is not None
    candidate = result["candidates"][0]
    assert candidate["sources"] == []
    assert candidate["identitySourceIds"] == []
    assert all(field["sourceIds"] == [] for field in candidate["fields"])


def test_source_observation_requires_an_actual_timezone_aware_registry_instant() -> None:
    registry, evidence_ref = _registry()
    registry.resolve(evidence_ref).registered_at = datetime(2026, 11, 24, 12, 30)

    result = bind_course_research_suggestion(
        raw=_suggestion(),
        context=_context(),
        frontend_chat_id=CHAT_ID,
        registry=registry,
    )

    assert result is not None
    candidate = result["candidates"][0]
    assert candidate["sources"] == []
    assert candidate["identityEvidenceLevel"] == "model_research_lead"
    assert all(field["evidenceLevel"] == "model_research_lead" for field in candidate["fields"])
    assert result["observedAt"].endswith("Z")


def test_source_observation_normalizes_offset_without_changing_its_instant() -> None:
    registry, evidence_ref = _registry()
    registry.resolve(evidence_ref).registered_at = datetime(
        2026, 11, 24, 14, 30, tzinfo=timezone(timedelta(hours=2))
    )

    result = bind_course_research_suggestion(
        raw=_suggestion(),
        context=_context(),
        frontend_chat_id=CHAT_ID,
        registry=registry,
    )

    assert result is not None
    assert result["candidates"][0]["sources"][0]["observedAt"] == (
        "2026-11-24T12:30:00.000000Z"
    )


def test_over_bound_candidate_count_is_rejected_without_silent_truncation() -> None:
    raw = _suggestion()
    raw["candidates"] = raw["candidates"] * 7
    registry, _ = _registry()
    assert bind_course_research_suggestion(
        raw=raw,
        context=_context(),
        frontend_chat_id=CHAT_ID,
        registry=registry,
    ) is None


def test_no_active_context_or_invalid_container_returns_no_candidates() -> None:
    registry, _ = _registry()
    assert bind_course_research_suggestion(
        raw=_suggestion(),
        context=None,
        frontend_chat_id=CHAT_ID,
        registry=registry,
    ) is None
    assert bind_course_research_suggestion(
        raw={"schema_version": "wrong", "candidates": []},
        context=_context(),
        frontend_chat_id=CHAT_ID,
        registry=registry,
    ) is None


def test_malformed_and_unresolved_locators_do_not_discard_a_valid_l1_candidate():
    registry, _ = _registry(cited=True)
    raw = _suggestion()
    candidate = raw["candidates"][0]
    candidate["identity_source_locators"] = [
        "turn102913search6",
        "https://unobserved.example/course",
    ]
    candidate["source_locators"] = ["http://unsafe.example/course"]
    for field in candidate["fields"]:
        field["source_locators"] = ["turn999search1"]

    result, diagnostics = bind_course_research_suggestion_with_diagnostics(
        raw=raw,
        context=_context(),
        frontend_chat_id=CHAT_ID,
        registry=registry,
    )

    assert result is not None
    bound = result["candidates"][0]
    assert bound["identityEvidenceLevel"] == "model_research_lead"
    assert bound["identitySourceIds"] == []
    assert bound["sources"] == []
    assert bound["fields"][0]["evidenceLevel"] == "model_research_lead"
    assert bound["fields"][0]["sourceIds"] == []
    assert diagnostics["python_binding_status"] == "bound"
    assert diagnostics["valid_candidate_count"] == 1
    assert diagnostics["rejected_source_count"] >= 3


def test_diagnostic_counters_saturate_for_malformed_oversized_locator_arrays():
    registry, _ = _registry()
    raw = _suggestion()
    raw["candidates"][0]["identity_source_locators"] = ["bad"] * 1_000

    result, diagnostics = bind_course_research_suggestion_with_diagnostics(
        raw=raw,
        context=_context(),
        frontend_chat_id=CHAT_ID,
        registry=registry,
    )

    assert result is not None
    assert diagnostics["source_locator_count"] <= 504
    assert diagnostics["rejected_source_count"] <= 504
    assert diagnostics["diagnostic_counter_saturated"] is True


def test_candidate_and_field_rejections_are_separate_and_valid_candidates_survive():
    registry, _ = _registry(cited=True)
    raw = _suggestion()
    raw["candidates"][0]["fields"].append(
        {"key": "unknown-field", "value": "x"}
    )
    raw["candidates"].append({"institution_name": ""})

    result, diagnostics = bind_course_research_suggestion_with_diagnostics(
        raw=raw,
        context=_context(),
        frontend_chat_id=CHAT_ID,
        registry=registry,
    )

    assert result is not None
    assert len(result["candidates"]) == 1
    assert diagnostics["python_binding_status"] == "partial"
    assert diagnostics["rejected_candidate_count"] == 1
    assert diagnostics["rejected_field_count"] == 1


def test_explicit_empty_container_distinguishes_not_performed_from_completed_empty():
    registry, _ = _registry()
    for status in ("not_performed", "completed"):
        result, diagnostics = bind_course_research_suggestion_with_diagnostics(
            raw={
                "schema_version": "phase15.course-research-suggestion.v1",
                "research_status": status,
                "candidates": [],
            },
            context=_context(),
            frontend_chat_id=CHAT_ID,
            registry=registry,
        )
        assert result is not None
        assert result["candidates"] == []
        assert result["researchStatus"] == status
        assert diagnostics["python_binding_status"] == "empty"
        assert diagnostics["python_binding_reason"] == (
            "research_not_performed"
            if status == "not_performed"
            else "research_completed_without_candidates"
        )
