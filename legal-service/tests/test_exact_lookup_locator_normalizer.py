"""Generic Arm-N locator normalization contracts.

These tests exercise syntax/contract translation only.  They do not decide
legal relevance and do not require a database or network access.
"""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path

import pytest

from app.services.exact_lookup_locator_normalizer import (
    expand_exact_lookup_item,
    normalize_exact_lookup_request,
)


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


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("3", "3"),
        ("Schedule 3", "3"),
        ("schedule 3", "3"),
    ],
)
def test_equivalent_schedule_forms_share_one_canonical_request(value, expected):
    normalized = normalize_exact_lookup_request(
        {"schedule": value, "provision": "criterion 3001", "query": "unrelated prose"},
        as_of_date=AS_OF,
    )
    assert normalized.request.schedule == expected
    assert normalized.request.provision == "3001"
    assert normalized.request.query is None
    assert normalized.request.source_types == ["legislation"]


@pytest.mark.parametrize(
    ("locator", "locator_type", "expected_document", "expected_provision"),
    [
        ("reg 1.03", None, "Migration Regulations 1994", "1.03"),
        ("regulation 1.03(2)", None, "Migration Regulations 1994", "1.03(2)"),
        ("s 48", None, "Migration Act 1958", "48"),
        ("Migration Act s 48(1)(a)", None, "Migration Act 1958", "48(1)(A)"),
        ("PIC 4019", "schedule4_pic", None, "4019"),
        ("Public Interest Criterion 4019", None, None, "4019"),
        ("visa condition 8101", None, None, "8101"),
    ],
)
def test_supported_locator_aliases_and_nested_suffixes_are_preserved(
    locator, locator_type, expected_document, expected_provision
):
    payload = {"locator": locator}
    if locator_type:
        payload["locator_type"] = locator_type
    normalized = normalize_exact_lookup_request(payload, as_of_date=AS_OF)
    assert normalized.request.document_id == expected_document
    assert normalized.request.provision == expected_provision
    assert normalized.request.query is None


@pytest.mark.parametrize("value", ["3003; 3004", "3003, 3004", "3003 and 3004"])
def test_compound_provisions_expand_only_into_bounded_canonical_items(value):
    expanded = expand_exact_lookup_item(
        {"schedule": "Schedule 3", "provision": value},
        as_of_date=AS_OF,
    )
    assert [item.request.schedule for item in expanded] == ["3", "3"]
    assert [item.request.provision for item in expanded] == ["3003", "3004"]


def test_nested_provision_is_not_split_as_compound():
    expanded = expand_exact_lookup_item(
        {"schedule": "2", "provision": "485.211(2)"},
        as_of_date=AS_OF,
    )
    assert len(expanded) == 1
    assert expanded[0].request.provision == "485.211(2)"


@pytest.mark.parametrize(
    ("locator_type", "provision", "expected"),
    [
        ("schedule3_criterion", "Schedule 3 criterion 3001", "3001"),
        ("regulation", "reg 1.03", "1.03"),
        ("schedule4_pic", "Public Interest Criterion 4019", "4019"),
        ("schedule8_condition", "visa condition 8101", "8101"),
        ("act_section", "section 48", "48"),
    ],
)
def test_typed_provision_aliases_share_one_canonical_value(locator_type, provision, expected):
    normalized = normalize_exact_lookup_request(
        {"locator_type": locator_type, "provision": provision},
        as_of_date=AS_OF,
    )
    assert normalized.request.provision == expected


def test_schedule_compound_locator_text_expands_and_preserves_schedule():
    expanded = expand_exact_lookup_item(
        {"locator": "Schedule 3 criteria 3003 and 3004"},
        as_of_date=AS_OF,
    )
    assert [(item.request.schedule, item.request.provision) for item in expanded] == [
        ("3", "3003"),
        ("3", "3004"),
    ]
