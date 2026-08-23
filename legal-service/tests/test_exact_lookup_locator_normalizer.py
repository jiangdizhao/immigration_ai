"""Generic Arm-N locator normalization contracts.

These tests exercise syntax/contract translation only.  They do not decide
legal relevance and do not require a database or network access.
"""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path

import pytest

from app.services.exact_lookup_locator_normalizer import normalize_exact_lookup_request


AS_OF = date(2026, 8, 23)


@pytest.mark.parametrize(
    ("item", "expected"),
    [
        (
            {
                "node_type": "provision",
                "target_document": "Schedule 2",
                "provision_ref": "820.211",
                "subclass": "820",
            },
            {"locator_type": "schedule2_provision", "schedule": "2", "provision": "820.211", "document_id": None},
        ),
        (
            {"locator": "Schedule 3 criterion 3001"},
            {"locator_type": "schedule3_criterion", "schedule": "3", "provision": "3001", "document_id": None},
        ),
        (
            {"locator": "regulation 1.03"},
            {"locator_type": "regulation", "schedule": None, "provision": "1.03", "document_id": "Migration Regulations 1994"},
        ),
        (
            {"locator": "PIC 4019"},
            {"locator_type": "schedule4_pic", "schedule": "4", "provision": "4019", "document_id": None},
        ),
        (
            {"locator": "section 48 of the Migration Act 1958"},
            {"locator_type": "act_section", "schedule": None, "provision": "48", "document_id": "Migration Act 1958"},
        ),
        (
            {"locator": "visa condition 8101"},
            {"locator_type": "schedule8_condition", "schedule": "8", "provision": "8101", "document_id": None},
        ),
    ],
)
def test_known_locator_types_normalize_to_existing_exact_contract(item, expected):
    normalized = normalize_exact_lookup_request(item, as_of_date=AS_OF)
    request = normalized.request

    assert normalized.trace["normalized_locator_type"] == expected["locator_type"]
    assert request.schedule == expected["schedule"]
    assert request.provision == expected["provision"]
    assert request.document_id == expected["document_id"]
    assert request.query is None
    assert request.as_of_date == AS_OF
    assert request.source_types == ["legislation"]


def test_structured_navigation_target_preserves_subclass_without_creating_evidence():
    normalized = normalize_exact_lookup_request(
        {
            "locator_type": "schedule2_provision",
            "target_document": "Schedule 2",
            "provision_ref": "485.211",
            "subclass": "485",
        },
        as_of_date=AS_OF,
    )

    assert normalized.request.model_dump(mode="json") == {
        "query": None,
        "document_id": None,
        "source_types": ["legislation"],
        "schedule": "2",
        "provision": "485.211",
        "case_citation": None,
        "subclass": "485",
        "as_of_date": "2026-08-23",
        "follow_cross_references": True,
        "max_hits": 8,
    }


def test_known_schedule_label_removes_noncanonical_free_form_query():
    normalized = normalize_exact_lookup_request(
        {"schedule": "3", "query": "Schedule 3 criterion 3003"},
        as_of_date=AS_OF,
    )
    assert normalized.request.schedule == "3"
    assert normalized.request.provision == "3003"
    assert normalized.request.query is None


def test_unknown_free_form_query_remains_explicit_and_trace_omits_raw_text():
    normalized = normalize_exact_lookup_request(
        {"query": "some unusual legal locator wording"},
        as_of_date=AS_OF,
    )
    assert normalized.request.query == "some unusual legal locator wording"
    assert normalized.trace["normalization_status"] == "unrecognized_free_form"
    trace_text = json.dumps(normalized.trace)
    assert "some unusual legal locator wording" not in trace_text
    assert normalized.trace["model_locator"]["query_present"] is True


def test_validated_index_contains_generic_regression_target_without_8101_patch():
    index_path = Path(__file__).parents[1] / "data" / "processed" / "legal_locator_index" / "migration_regulations_F2026C00667.jsonl"
    records = [json.loads(line) for line in index_path.read_text().splitlines()]
    target = next(record for record in records if record["provision_ref"] == "8101")
    assert target["locator_type"] == "schedule8_condition"
    assert target["provision_ref"] == "8101"

    normalized = normalize_exact_lookup_request(
        {"locator": target["locator"], "locator_type": target["locator_type"], "provision_ref": target["provision_ref"]},
        as_of_date=AS_OF,
    )
    assert normalized.request.schedule == target["schedule_no"]
    assert normalized.request.provision == target["provision_ref"]
