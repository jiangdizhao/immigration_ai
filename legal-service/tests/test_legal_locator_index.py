from __future__ import annotations

from app.legal_locator.index import (
    LegalLocatorRecord,
    build_locator_records,
    lookup,
    validate_records,
)


def page(number: int, text: str) -> dict:
    return {
        "section_ref": f"page_{number}",
        "heading": text.splitlines()[0],
        "text": text,
    }


def build_sample() -> list[LegalLocatorRecord]:
    volume1 = [
        page(
            1,
            "Contents\n1.01 Name of Regulations ........ 1\n"
            "1.02 Interpretation ........ 2\n1.03 Other rule ........ 3\n"
            "1.04 Another rule ........ 4\n1.05 Final rule ........ 5",
        ),
        page(
            2,
            "Migration Regulations 1994\nPart 1—Preliminary\n"
            "1.01 Name of Regulations\nThese Regulations are the Migration Regulations 1994.\n"
            "1.02 Interpretation\n(1) In these Regulations, example means example.",
        ),
        page(
            3,
            "Migration Regulations 1994\n"
            "Continuation of regulation 1.02.\n"
            "1.03—Third regulation\n(1) This is the third regulation.\n"
            "1.04 Fourth regulation\nThe fourth regulation applies.",
        ),
        page(
            4,
            "Migration Regulations 1994\n"
            "1.05 Final regulation\nThe final regulation applies.",
        ),
    ]
    volume3 = [
        page(
            10,
            "Schedule 3 Additional criteria applicable to unlawful non-citizens\n"
            "3001\n(1) The applicant satisfies this criterion.\n"
            "3002 (1) The applicant satisfies another criterion.",
        ),
        page(
            11,
            "Schedule 3 Additional criteria applicable to unlawful non-citizens\n"
            "Continuation of 3002.\n3003\nThe applicant satisfies the third criterion.",
        ),
        page(
            20,
            "Schedule 4 Public interest criteria and related provisions\n"
            "4001\n(1) The applicant satisfies PIC 4001.\n"
            "4001 applies again as a reference only.\n"
            "4002, 4003 and 4004 are cross-references, not headings.\n"
            "4002\nThe applicant satisfies PIC 4002.",
        ),
        page(
            21,
            "Schedule 4 Public interest criteria and related provisions\n"
            "4003A (1) The applicant satisfies this criterion.",
        ),
        page(
            30,
            "Schedule 8 Visa conditions\n"
            "8101\nThe holder must comply with this condition.\n"
            "8501\nThe holder must maintain adequate arrangements.",
        ),
        page(
            31,
            "Schedule 8 Visa conditions\n"
            "Continuation of condition 8501.\n"
            "8602 (1) The holder must comply with another condition.",
        ),
    ]
    return build_locator_records(
        volume1_sections=volume1,
        volume3_sections=volume3,
        document_version="FTEST",
        compilation_number="999",
        effective_date="2026-01-01",
        volume1_source_file="FTESTVOL01.pdf",
        volume3_source_file="FTESTVOL03.pdf",
    )


def test_builds_page_aware_locator_records_and_skips_contents() -> None:
    records = build_sample()
    identities = {record.normalized_locator: record for record in records}

    assert "regulation:1.01" in identities
    assert "regulation:1.05" in identities
    assert "schedule3_criterion:3001" in identities
    assert "schedule4_pic:4001" in identities
    assert "schedule4_pic:4002" in identities
    assert "schedule4_pic:4003a" in identities
    assert "schedule8_condition:8501" in identities

    assert identities["regulation:1.01"].page_start == 2
    assert identities["regulation:1.01"].page_refs == ["page_2"]
    assert "page_1" not in identities["regulation:1.01"].page_refs
    assert identities["schedule4_pic:4001"].page_refs == ["page_20"]
    assert identities["schedule8_condition:8501"].page_refs == ["page_30", "page_31"]


def test_cross_reference_lines_do_not_displace_structural_schedule_heading() -> None:
    records = build_sample()
    result = lookup("PIC 4001", records)
    assert len(result) == 1
    assert result[0].page_start == 20
    assert result[0].heading == "4001"


def test_lookup_supports_human_facing_aliases() -> None:
    records = build_sample()
    assert lookup("regulation 1.03", records)[0].provision_ref == "1.03"
    assert lookup("Public Interest Criterion 4003A", records)[0].provision_ref == "4003A"
    assert lookup("visa condition 8501", records)[0].provision_ref == "8501"
    assert lookup("Schedule 3 criterion 3002", records)[0].provision_ref == "3002"


def test_structural_validation_accepts_generated_records() -> None:
    assert validate_records(build_sample()) == []
