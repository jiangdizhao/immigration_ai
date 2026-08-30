from __future__ import annotations

import json

from app.schemas.agent import AgentSubmissionV2
from app.services.agent_runtime_service import (
    _submission_schema_diagnostics_for_attempt,
)
from app.services.request_evidence_registry import create_registry
from app.services.tool_executor_service import (
    ToolCallRequest,
    ToolExecutorContext,
    ToolExecutorService,
)


def _base_payload() -> dict:
    return {
        "schema_version": "agent_submission.v2",
        "answer_class": "substantive_legal",
        "draft_markdown": "The rule applies.",
        "claims": [{
            "claim_id": "c1",
            "claim_type": "legal_application",
            "materiality": "decisive",
            "text": "The rule applies.",
            "draft_start": 0,
            "draft_end": 17,
            "evidence_refs": [],
        }],
        "citations": [],
        "research_status": "complete",
        "state_patch": [],
    }


def _submit(payload: dict):
    registry = create_registry("schema-observability")
    return ToolExecutorService().execute_tool(
        ToolCallRequest("submit-1", "submit_answer", payload),
        ToolExecutorContext(request_id=registry.request_id, registry=registry),
    )


def _diagnostics(result) -> dict:
    return result.result.data["terminal_contract_diagnostics"]


def test_missing_selected_branch_field_is_safely_diagnosed():
    payload = _base_payload()
    payload["applicability_resolutions"] = [{
        "claim_id": "c1",
        "resolution_kind": "specific_branch",
        "status": "resolved",
        "applicability_basis_evidence_refs": ["exact:basis"],
    }]
    result = _submit(payload)
    diagnostics = _diagnostics(result)

    assert result.result.status == "invalid_request"
    assert diagnostics["submission_schema_error_count"] >= 1
    assert "applicability_resolutions.0.selected_branch_evidence_ref" in (
        diagnostics["submission_schema_error_locations"]
    )
    assert "missing" in diagnostics["submission_schema_error_types"]
    assert "exact:basis" not in json.dumps(diagnostics)


def test_obsolete_field_is_diagnosed_without_retaining_field_value():
    payload = _base_payload()
    payload["applicability_resolutions"] = [{
        "claim_id": "c1",
        "residual_branch_evidence_ref": "exact:obsolete-value",
        "resolution_kind": "specific_branch",
        "status": "resolved",
        "applicability_basis_evidence_refs": ["exact:basis"],
    }]
    result = _submit(payload)
    diagnostics = _diagnostics(result)

    assert result.result.status == "invalid_request"
    assert "extra_forbidden" in diagnostics["submission_schema_error_types"]
    assert "residual_branch_evidence_ref" not in json.dumps(diagnostics)
    assert "exact:obsolete-value" not in json.dumps(diagnostics)


def test_invalid_status_literal_is_diagnosed_without_retaining_literal():
    payload = _base_payload()
    payload["applicability_resolutions"] = [{
        "claim_id": "c1",
        "selected_branch_evidence_ref": "exact:selected",
        "resolution_kind": "specific_branch",
        "status": "resolved_specific",
        "applicability_basis_evidence_refs": ["exact:basis"],
    }]
    result = _submit(payload)
    diagnostics = _diagnostics(result)

    assert result.result.status == "invalid_request"
    assert "applicability_resolutions.0.status" in diagnostics["submission_schema_error_locations"]
    assert "literal_error" in diagnostics["submission_schema_error_types"]
    assert "resolved_specific" not in json.dumps(diagnostics)


def test_wrong_applicability_basis_type_is_safely_diagnosed():
    payload = _base_payload()
    payload["applicability_resolutions"] = [{
        "claim_id": "c1",
        "selected_branch_evidence_ref": "exact:selected",
        "resolution_kind": "specific_branch",
        "status": "resolved",
        "applicability_basis_evidence_refs": "not-a-list",
    }]
    result = _submit(payload)
    diagnostics = _diagnostics(result)

    assert result.result.status == "invalid_request"
    assert "applicability_resolutions.0.applicability_basis_evidence_refs" in (
        diagnostics["submission_schema_error_locations"]
    )
    assert "list_type" in diagnostics["submission_schema_error_types"]


def test_unrelated_claim_shape_precheck_is_diagnosed():
    payload = _base_payload()
    payload["claims"] = "not-a-list"
    result = _submit(payload)
    diagnostics = _diagnostics(result)

    assert result.result.status == "invalid_request"
    assert diagnostics["submission_schema_error_locations"] == ["submission"]
    assert diagnostics["submission_schema_error_types"] == ["schema_precheck"]


def test_valid_submission_has_no_schema_error_diagnostic():
    payload = {
        "schema_version": "agent_submission.v2",
        "answer_class": "general",
        "draft_markdown": "Hello.",
        "claims": [],
        "citations": [],
        "research_status": "not_required",
        "state_patch": [],
    }
    result = _submit(payload)

    assert result.result.status == "ok"
    assert "submission_schema_error_count" not in result.result.data[
        "terminal_contract_diagnostics"
    ]


def test_schema_diagnostics_are_associated_with_their_attempt_only():
    invalid = _base_payload()
    invalid["applicability_resolutions"] = [{
        "claim_id": "c1",
        "resolution_kind": "specific_branch",
        "status": "resolved",
    }]
    first = _submit(invalid)
    valid = _submit({
        "schema_version": "agent_submission.v2",
        "answer_class": "general",
        "draft_markdown": "Hello.",
        "claims": [],
        "citations": [],
        "research_status": "not_required",
        "state_patch": [],
    })

    first_record = _submission_schema_diagnostics_for_attempt(
        first.result,
        attempt_index=1,
    )
    second_record = _submission_schema_diagnostics_for_attempt(
        valid.result,
        attempt_index=2,
    )
    assert first_record["attempt_index"] == 1
    assert first_record["submission_schema_error_count"] > 0
    assert second_record == {
        "attempt_index": 2,
        "submission_schema_error_count": 0,
        "submission_schema_error_locations": [],
        "submission_schema_error_types": [],
    }


def test_schema_diagnostics_contain_no_rejected_payload_or_exception_details():
    payload = _base_payload()
    payload["draft_markdown"] = "SECRET_ANSWER_TEXT"
    payload["applicability_resolutions"] = [{
        "claim_id": "c1",
        "selected_branch_evidence_ref": "exact:selected-secret",
        "resolution_kind": "specific_branch",
        "status": "resolved_specific",
        "applicability_basis_evidence_refs": ["exact:basis-secret"],
    }]
    result = _submit(payload)
    diagnostics = _diagnostics(result)
    serialized = json.dumps(diagnostics)

    assert "SECRET_ANSWER_TEXT" not in serialized
    assert "exact:selected-secret" not in serialized
    assert "exact:basis-secret" not in serialized
    assert "resolved_specific" not in serialized
    assert '"input"' not in serialized
    assert '"ctx"' not in serialized
    assert '"msg"' not in serialized


def test_new_specific_schema_parses_without_registry_or_guard():
    payload = _base_payload()
    payload["applicability_resolutions"] = [{
        "claim_id": "c1",
        "selected_branch_evidence_ref": "exact:selected",
        "resolution_kind": "specific_branch",
        "status": "resolved",
        "applicability_basis_evidence_refs": ["exact:basis"],
    }]

    submission = AgentSubmissionV2(**payload)

    assert submission.applicability_resolutions[0].resolution_kind == "specific_branch"
