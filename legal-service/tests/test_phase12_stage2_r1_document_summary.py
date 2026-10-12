"""Phase 12 Stage 2 R1 — document availability summary contract.

Reviewer finding R1-3: the frontend reports real document counts, but
``CustomerDocumentSummary`` capped every count at 64, so a long-lived
conversation with 65+ stored files rejected an otherwise valid question.

These tests lock:

* counts above 64 validate (and stay finite at an absurd upper bound);
* the summary distinguishes *all* usable files from the subset packaged for one
  model turn;
* a conversation with one readable and one unreadable file states both facts
  instead of concealing the unreadable one.
"""
from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.schemas.query import (
    MAX_CUSTOMER_DOCUMENT_COUNT,
    CustomerDocumentSummary,
    QueryRequest,
)
from app.services.customer_document_context import (
    format_customer_document_status_context,
)


def test_a_long_lived_conversation_is_not_rejected_for_having_65_files():
    summary = CustomerDocumentSummary(total=65, usable=65, packaged=8)
    request = QueryRequest(question="What does my latest document say?", customer_document_summary=summary)
    assert request.customer_document_summary is not None
    assert request.customer_document_summary.total == 65
    assert request.customer_document_summary.packaged == 8


def test_summary_counts_stay_finite_but_are_not_artificially_small():
    assert CustomerDocumentSummary(total=MAX_CUSTOMER_DOCUMENT_COUNT).total == MAX_CUSTOMER_DOCUMENT_COUNT
    with pytest.raises(ValidationError):
        CustomerDocumentSummary(total=MAX_CUSTOMER_DOCUMENT_COUNT + 1)
    with pytest.raises(ValidationError):
        CustomerDocumentSummary(total=-1)


def test_legacy_summaries_without_a_packaged_count_still_validate():
    # A sender that predates R1 sends no packaged count at all.
    summary = CustomerDocumentSummary(**{"total": 3, "usable": 3})
    assert summary.packaged is None
    assert format_customer_document_status_context(summary) == ""


def test_partial_packaging_is_stated_without_claiming_unread_files():
    summary = CustomerDocumentSummary(total=65, usable=65, packaged=8)
    rendered = format_customer_document_status_context(summary)
    assert "Only 8 of the 65 readable file(s)" in rendered
    assert "remaining 57 readable file(s) are stored but were not supplied" in rendered
    assert "Do not claim to have read, summarised or compared any file that was not supplied" in rendered


def test_a_fully_packaged_conversation_adds_no_noise():
    summary = CustomerDocumentSummary(total=3, usable=3, packaged=3)
    assert format_customer_document_status_context(summary) == ""


def test_one_readable_and_one_unreadable_file_states_both_facts():
    """Regression review: the unreadable file must not be concealed."""
    summary = CustomerDocumentSummary(
        total=2,
        usable=1,
        packaged=1,
        failed=1,
        unusableFilenames=["scan-only.pdf"],
    )
    rendered = format_customer_document_status_context(summary)
    assert "1 produced readable text but 1 did not" in rendered
    assert "failed=1" in rendered
    assert "scan-only.pdf" in rendered
    assert "do not claim to have read them" in rendered
    assert "say plainly which files could not be read" in rendered


def test_mixed_and_partially_packaged_report_both_limits():
    summary = CustomerDocumentSummary(
        total=70,
        usable=68,
        packaged=8,
        noUsableContent=1,
        failed=1,
        unusableFilenames=["broken.pdf"],
    )
    rendered = format_customer_document_status_context(summary)
    assert "broken.pdf" in rendered
    assert "Only 8 of the 68 readable file(s)" in rendered
    assert "not supplied" in rendered


def test_no_files_and_all_unreadable_keep_their_existing_behaviour():
    assert format_customer_document_status_context(CustomerDocumentSummary(total=0)) == ""
    unreadable = CustomerDocumentSummary(
        total=2, usable=0, noUsableContent=1, failed=1, unusableFilenames=["scan.png"]
    )
    rendered = format_customer_document_status_context(unreadable)
    assert "no readable extracted text" in rendered
    # The mixed-status wording must not replace the full unavailability notice.
    assert "Only 0 of the" not in rendered
