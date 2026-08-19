"""Phase 5.1A.1 — content-free search-privacy violation category telemetry tests.

All tests use the deterministic guard; no live OpenAI calls.
"""

from __future__ import annotations

from app.services.search_privacy_guard import SearchPrivacyGuard
from app.services.agent_runtime_service import ProviderResponse


def test_rejected_query_emits_category_count() -> None:
    result = SearchPrivacyGuard().check_query("Visa for john.doe@example.com status")
    assert result.allowed is False
    assert "email" in result.violation_categories
    assert result.violation_categories["email"] >= 1


def test_rejected_query_telemetry_has_no_raw_content() -> None:
    query = "Visa for john.doe@example.com status"
    result = SearchPrivacyGuard().check_query(query)
    serialized = str(result.violation_categories)
    # Category keys only — no raw query, email, or snippet present.
    assert "john.doe" not in serialized
    assert "@example.com" not in serialized
    assert "Visa for" not in serialized


def test_allowed_query_produces_zero_violations() -> None:
    result = SearchPrivacyGuard().check_query("What is the Subclass 482 visa requirement?")
    assert result.allowed is True
    assert result.violation_categories == {}


def test_multiple_categories_aggregate_deterministically() -> None:
    result = SearchPrivacyGuard().check_query(
        "Client name is John Smith, phone 0412 345 678, email a@b.com"
    )
    assert result.allowed is False
    # name_indicator and phone and email categories are present with >=1 count.
    assert result.violation_categories.get("name_indicator", 0) >= 1
    assert result.violation_categories.get("phone", 0) >= 1
    assert result.violation_categories.get("email", 0) >= 1


def test_provider_response_carries_content_free_categories() -> None:
    resp = ProviderResponse(
        response_id="resp-1",
        model="gpt-5.6-luna",
        status="ok",
        search_privacy_violation_categories={"name_indicator": 2},
    )
    assert resp.search_privacy_violation_categories == {"name_indicator": 2}