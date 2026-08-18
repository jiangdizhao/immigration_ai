"""Phase 4B — Legal cross-reference discovery and resolution.

Deterministic, GENERAL legal-locator extraction from canonical text.

This module:
- Parses legal citation syntax (permitted as syntax/locator parsing)
- Does NOT perform semantic routing
- Does NOT create visa/subclass-specific regex routing
- Does NOT infer meaning from arbitrary ordinary numbers
- Does NOT interpret legal significance
- Only identifies explicit locator-like references
- Bounds extraction count
- Deduplicates deterministically
- Retains original surface form
- Normalizes locator separately
- Keeps ambiguous references unresolved
- NEVER silently resolves to a "similar" provision

CRITICAL: Absence from local data NEVER means "this legal requirement
does not exist". It means only "this reference is unresolved in the
current local canonical corpus."
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal

# Maximum number of cross-references to extract per text
MAX_CROSS_REFERENCES = 50

# Maximum depth for following cross-references
MAX_CROSS_REFERENCE_DEPTH = 2


@dataclass(slots=True, frozen=True)
class LegalLocator:
    """A parsed legal locator reference."""

    surface_form: str  # Original text as found
    locator_type: Literal[
        "schedule",
        "regulation",
        "subregulation",
        "section",
        "subsection",
        "clause",
        "item",
        "paragraph",
        "subparagraph",
        "division",
        "part",
        "instrument",
        "act",
        "unknown",
    ]
    normalized: str  # Normalized locator string
    target_document: str | None  # e.g., "Schedule 3", "Migration Act"
    target_provision: str | None  # e.g., "3001", "2.07(5)"
    is_ambiguous: bool = False


@dataclass(slots=True)
class ExtractedCrossReference:
    """A cross-reference extracted from text."""

    locator: LegalLocator
    position_start: int
    position_end: int
    context: str  # Surrounding text for debugging


# ---------------------------------------------------------------------------
# Regex patterns for legal locators (GENERAL, not visa-specific)
# ---------------------------------------------------------------------------

# Schedule references: "Schedule 3", "Schedule 7A", "Sch 2", "the Schedule"
SCHEDULE_RE = re.compile(
    r"\b(?:Schedule|Sch\.?)\s+(\d{1,2}[A-Z]?)\b",
    re.IGNORECASE,
)

# Regulation references: "regulation 2.07", "reg 2.07", "r 2.07"
REGULATION_RE = re.compile(
    r"\b(?:regulation|reg\.?|r)\s+(\d{1,2}\.\d{1,3}(?:\([0-9A-Za-z]+\))?)\b",
    re.IGNORECASE,
)

# Subregulation references: "subregulation 2.07(5)", "subreg 2.07(5)"
SUBREGULATION_RE = re.compile(
    r"\b(?:subregulation|subreg\.?|sub\s*r)\s+(\d{1,2}\.\d{1,3}\([0-9A-Za-z]+\))\b",
    re.IGNORECASE,
)

# Section references: "section 48", "s 48", "s. 48"
SECTION_RE = re.compile(
    r"\b(?:section|s\.?)\s+(\d{1,4}[A-Z]{0,2}(?:\([0-9A-Za-z]+\))?)\b",
    re.IGNORECASE,
)

# Subsection references: "subsection 48(2)"
SUBSECTION_RE = re.compile(
    r"\b(?:subsection|sub\s*s\.?)\s+(\d{1,4}[A-Z]{0,2}\([0-9A-Za-z]+\))\b",
    re.IGNORECASE,
)

# Clause references: "clause 3001", "cl 3001", "cl. 3001"
CLAUSE_RE = re.compile(
    r"\b(?:clause|cl\.?)\s+(\d{1,5}[A-Z]{0,3}(?:\([0-9A-Za-z]+\))?)\b",
    re.IGNORECASE,
)

# Item references: "item 4", "item 12A"
ITEM_RE = re.compile(
    r"\b(?:item)\s+(\d{1,5}[A-Z]{0,3})\b",
    re.IGNORECASE,
)

# Paragraph references: "paragraph (a)", "para 3.2.1"
PARAGRAPH_RE = re.compile(
    r"\b(?:paragraph|para\.?)\s+(\([a-z0-9]+\)|\d{1,3}(?:\.\d{1,3})*(?:\([a-z0-9]+\))?)\b",
    re.IGNORECASE,
)

# Division references: "Division 2", "Div 3"
DIVISION_RE = re.compile(
    r"\b(?:Division|Div\.?)\s+(\d{1,3}[A-Z]?)\b",
    re.IGNORECASE,
)

# Part references: "Part 5", "Pt 7"
PART_RE = re.compile(
    r"\b(?:Part|Pt\.?)\s+(\d{1,2}[A-Z]?)\b",
    re.IGNORECASE,
)

# Legislative instrument references: "Legislative Instrument F2026...", "IMMI 15/..."
INSTRUMENT_RE = re.compile(
    r"\b(?:Legislative\s+Instrument|Instrument)\s+([A-Z]\d{4}[A-Z]\d{3,6}|IMMI\s+\d{2}/\d{2,4})\b",
    re.IGNORECASE,
)

# Migration Act references: "the Act", "Migration Act", "Migration Act 1958"
ACT_RE = re.compile(
    r"\b(?:Migration\s+Act(?:\s+1958)?|the\s+Act)\b",
    re.IGNORECASE,
)


def _normalize_locator(locator_type: str, value: str) -> str:
    """Normalize a locator value for consistent comparison."""
    value = value.strip().upper()
    # Remove redundant parentheses for normalization
    return f"{locator_type.upper()}:{value}"


def extract_cross_references(
    text: str,
    *,
    max_refs: int = MAX_CROSS_REFERENCES,
) -> list[ExtractedCrossReference]:
    """Extract legal cross-references from text.

    Returns a deduplicated list of ExtractedCrossReference, ordered
    by position in text. Ambiguous references are marked but retained.

    This is syntax parsing only; no semantic judgment is made.
    """
    if not text:
        return []

    refs: list[ExtractedCrossReference] = []
    seen_normalized: set[str] = set()

    def add_match(
        match: re.Match,
        locator_type: str,
        target_document: str | None,
        target_provision: str | None,
        is_ambiguous: bool = False,
    ) -> None:
        if len(refs) >= max_refs:
            return

        surface = match.group(0)
        normalized = _normalize_locator(locator_type, target_provision or surface)

        # Deduplicate by normalized form
        if normalized in seen_normalized:
            return
        seen_normalized.add(normalized)

        locator = LegalLocator(
            surface_form=surface,
            locator_type=locator_type,  # type: ignore[arg-type]
            normalized=normalized,
            target_document=target_document,
            target_provision=target_provision,
            is_ambiguous=is_ambiguous,
        )

        # Extract context (50 chars before/after)
        start = max(0, match.start() - 50)
        end = min(len(text), match.end() + 50)
        context = text[start:end]

        refs.append(
            ExtractedCrossReference(
                locator=locator,
                position_start=match.start(),
                position_end=match.end(),
                context=context,
            )
        )

    # Schedule references
    for match in SCHEDULE_RE.finditer(text):
        schedule_num = match.group(1)
        add_match(
            match,
            "schedule",
            f"Schedule {schedule_num.upper()}",
            schedule_num.upper(),
        )

    # Subregulation references (before regulation to avoid partial matches)
    for match in SUBREGULATION_RE.finditer(text):
        provision = match.group(1)
        add_match(
            match,
            "subregulation",
            "Migration Regulations 1994",
            provision,
        )

    # Regulation references
    for match in REGULATION_RE.finditer(text):
        provision = match.group(1)
        add_match(
            match,
            "regulation",
            "Migration Regulations 1994",
            provision,
        )

    # Subsection references (before section)
    for match in SUBSECTION_RE.finditer(text):
        provision = match.group(1)
        add_match(
            match,
            "subsection",
            None,  # Could be any Act
            provision,
            is_ambiguous=True,  # Act not specified
        )

    # Section references
    for match in SECTION_RE.finditer(text):
        provision = match.group(1)
        add_match(
            match,
            "section",
            None,  # Could be any Act
            provision,
            is_ambiguous=True,  # Act not specified
        )

    # Clause references
    for match in CLAUSE_RE.finditer(text):
        provision = match.group(1)
        add_match(
            match,
            "clause",
            None,  # Could be any Schedule
            provision,
            is_ambiguous=True,  # Schedule not specified
        )

    # Item references
    for match in ITEM_RE.finditer(text):
        provision = match.group(1)
        add_match(
            match,
            "item",
            None,
            provision,
            is_ambiguous=True,  # Document not specified
        )

    # Paragraph references
    for match in PARAGRAPH_RE.finditer(text):
        provision = match.group(1)
        add_match(
            match,
            "paragraph",
            None,
            provision,
            is_ambiguous=True,  # Document not specified
        )

    # Division references
    for match in DIVISION_RE.finditer(text):
        provision = match.group(1)
        add_match(
            match,
            "division",
            None,
            provision,
            is_ambiguous=True,
        )

    # Part references
    for match in PART_RE.finditer(text):
        provision = match.group(1)
        add_match(
            match,
            "part",
            None,
            provision,
            is_ambiguous=True,
        )

    # Instrument references
    for match in INSTRUMENT_RE.finditer(text):
        provision = match.group(1)
        add_match(
            match,
            "instrument",
            "Legislative Instrument",
            provision,
        )

    # Act references
    for match in ACT_RE.finditer(text):
        add_match(
            match,
            "act",
            "Migration Act 1958",
            None,
        )

    # Sort by position
    refs.sort(key=lambda r: r.position_start)
    return refs[:max_refs]


def classify_schedule_family(schedule_ref: str) -> str | None:
    """Map a schedule reference to a coverage family_id.

    Returns None if the schedule is not in the known coverage families.
    """
    schedule_map = {
        "1": "migration_regulations_schedule_1",
        "2": "migration_regulations_schedule_2",
        "3": "migration_regulations_schedule_3",
        "4": "migration_regulations_schedule_4",
        "5": "migration_regulations_schedule_5",
        "6D": "migration_regulations_schedule_6d",
        "7A": "migration_regulations_schedule_7a",
        "8": "migration_regulations_schedule_8",
        "9": "migration_regulations_schedule_9",
        "10": "migration_regulations_schedule_10",
        "13": "migration_regulations_schedule_13",
    }
    return schedule_map.get(schedule_ref.strip().upper())


def classify_locator_family(locator: LegalLocator) -> str | None:
    """Map a locator to a coverage family_id.

    Returns None if the family cannot be determined.
    """
    if locator.locator_type == "schedule":
        return classify_schedule_family(locator.target_provision or "")

    if locator.locator_type in ("regulation", "subregulation"):
        return "migration_regulations"

    if locator.locator_type in ("section", "subsection"):
        # Sections could be Migration Act
        return "migration_act"

    if locator.locator_type == "act":
        return "migration_act"

    if locator.locator_type == "instrument":
        return "legislative_instruments"

    # Clauses, items, paragraphs need document context
    return None
