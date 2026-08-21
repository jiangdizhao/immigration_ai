from __future__ import annotations

from app.schedule.schedule2_index_service import parse_schedule2_text
from scripts.audit_schedule2_structure import (
    AuditPage,
    audit_rows,
    delimit_schedule2_pages,
    detect_structural_schedule_header,
    looks_like_contents_page,
)


def _page(ref: str, text: str, *, volume: int = 3) -> AuditPage:
    return AuditPage(
        volume=volume,
        section_ref=ref,
        heading=text.splitlines()[0] if text.splitlines() else "",
        text=text,
        detected_schedule=detect_structural_schedule_header(text),
    )


def test_schedule_header_detection_rejects_inline_cross_reference_prose() -> None:
    assert detect_structural_schedule_header("Federal Register\nSchedule 2—Visas\ntext") == "2"
    assert detect_structural_schedule_header("Federal Register\nSchedule 3 applies to the applicant") is None
    assert detect_structural_schedule_header("Schedule 7A: Points test\ntext") == "7A"


def test_schedule2_page_scope_stops_at_later_schedule_header() -> None:
    pages = [
        _page("page_1", "Contents\nSchedule 2 ........ 100\nSchedule 3 ........ 200"),
        _page("page_2", "Schedule 2—Classes of visas\nSubclass 801—Partner"),
        _page("page_3", "Federal Register furniture\n801.211—Criterion\ntext"),
        _page("page_4", "Schedule 3—Additional criteria\n3001\ntext"),
        _page("page_5", "Federal Register furniture\n3002\ntext"),
    ]
    assert looks_like_contents_page(pages[0].text)
    selected = delimit_schedule2_pages(pages)
    assert [page.section_ref for page in selected] == ["page_2", "page_3"]


def test_row_audit_detects_prefix_owner_mismatch_and_conflicting_owners() -> None:
    texts = [
        "Subclass 010—Bridging A\n010.211—Criterion\nThe applicant meets it.\n103.313(2)\nCross-reference text.",
        "Subclass 020—Bridging B\n020.211—Criterion\nThe applicant meets it.\n103.313(2)\nCross-reference text.",
    ]
    rows = []
    for index, text in enumerate(texts):
        rows.extend(
            parse_schedule2_text(
                text,
                source_file=f"vol2-{index}.pdf",
                source_title="synthetic",
            )
        )

    audit = audit_rows(rows)
    assert ("103.313(2)", "010") in audit.prefix_mismatches
    assert ("103.313(2)", "020") in audit.prefix_mismatches
    assert ("103.313(2)", ("010", "020")) in audit.conflicting_owners
    assert ("103.313(2)", 2) in audit.duplicate_refs


def test_row_audit_accepts_matching_schedule2_clause_prefix() -> None:
    rows = parse_schedule2_text(
        "Subclass 485—Temporary Graduate\n485.211—Criterion\nThe applicant meets it.\n485.212—Criterion\nThe applicant meets it.",
        source_file="vol2.pdf",
        source_title="synthetic",
    )
    audit = audit_rows(rows)
    assert audit.prefix_mismatches == ()
    assert audit.conflicting_owners == ()
    assert audit.unique_refs == 2
