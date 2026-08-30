"""Build and inspect an isolated Schedule-2 legal-navigation sidecar.

This module parses the tracked page-delimited official compilation JSON files
directly.  It is an experimental derived navigation artifact, not a source of
legal evidence and not a replacement for the shared Schedule index.

The parser is intentionally conservative:

* Schedule ownership is delimited by page headings and structural Schedule
  titles, with contents pages excluded.
* A provision heading must be a standalone, top-level-looking line.  A
  parenthesised reference such as ``103.313(2)`` is therefore not a heading.
* A provision with no single structural owner is rejected rather than guessed.
* External references retain ambiguity and local-index availability as
  separate facts.  ``local_available=False`` never means that a rule does not
  exist.

No function in this module calls the database, the web, Flat-RAG, an LLM, or a
serving-path service.
"""

from __future__ import annotations

import hashlib
import json
import re
from collections import Counter, defaultdict
from dataclasses import dataclass, field, replace
from pathlib import Path
from typing import Mapping, Sequence

from app.legal_locator.index import LegalLocatorRecord


ROOT_DIR = Path(__file__).resolve().parents[2]
RAW_DIR = ROOT_DIR / "data" / "raw" / "legislation" / "migration_regulations_1994_F2026C00667"
PDF_DIR = ROOT_DIR / "data" / "acquired" / "legislation" / "migration_regulations_1994_schedules_updates"
LOCATOR_INDEX_PATH = ROOT_DIR / "data" / "processed" / "legal_locator_index" / "migration_regulations_F2026C00667.jsonl"
LOCATOR_MANIFEST_PATH = ROOT_DIR / "data" / "processed" / "legal_locator_index" / "migration_regulations_F2026C00667_manifest.json"
ARTIFACT_DIR = ROOT_DIR / "data" / "processed" / "experimental" / "schedule2_navigation"
DEFAULT_NODES_PATH = ARTIFACT_DIR / "nodes.jsonl"
DEFAULT_EDGES_PATH = ARTIFACT_DIR / "edges.jsonl"
DEFAULT_MANIFEST_PATH = ARTIFACT_DIR / "manifest.json"
DEFAULT_SOURCE_PATHS = (
    RAW_DIR / "F2026C00667VOL02.json",
    RAW_DIR / "F2026C00667VOL03.json",
)

SCHEMA_VERSION = 1
GRAPH_KIND = "experimental_schedule2_legal_navigation_sidecar"
ALLOWED_RELATIONS = frozenset(
    {
        "CONTAINS",
        "NEXT_CLAUSE",
        "PREVIOUS_CLAUSE",
        "REFERENCES_SCHEDULE",
        "REFERENCES_SCHEDULE_PROVISION",
        "REFERENCES_SCHEDULE2_PROVISION",
        "REFERENCES_SUBCLASS",
        "REFERENCES_VISA_CLASS",
        "REFERENCES_SPECIAL_RETURN_CRITERION",
        "REFERENCES_INSTRUMENT_DEPENDENCY",
        "REFERENCES_REGULATION",
        "REFERENCES_ACT",
        "REFERENCES_INSTRUMENT",
        "REFERENCES_PIC",
        "REFERENCES_CONDITION",
        "REFERENCES_SCHEDULE3_CRITERION",
        "REFERENCES",
    }
)
FORBIDDEN_RELATIONS = frozenset(
    {
        "ELIGIBLE_IF",
        "INELIGIBLE_IF",
        "EXCEPTION_TO",
        "ALTERNATIVE_TO",
        "OVERRIDES",
        "CONTROLLING_IF",
        "APPLIES_IF",
        "PREFERRED_PATHWAY",
        "RECOMMENDED_VISA",
        "SATISFIES",
        "FAILS_IF",
    }
)

SCHEDULE_TITLE_RE = re.compile(
    r"\bSchedule\s+(?P<schedule>\d{1,2}[A-Z]?)\b", re.IGNORECASE
)
SCHEDULE_LINE_RE = re.compile(
    r"^\s*Schedule\s+(?P<schedule>\d{1,2}[A-Z]?)\s*(?:[—–-]|:)\s*(?P<title>\S.+)$",
    re.IGNORECASE,
)
SCHEDULE_METADATA_RE = re.compile(
    r"^\s*Schedule\s+(?P<schedule>\d{1,2}[A-Z]?)"
    r"(?:\s*(?:[—–-]|:)\s*(?P<title>[A-Za-z]+))?$",
    re.IGNORECASE,
)
TRAILING_SCHEDULE_METADATA_RE = re.compile(
    r"^(?P<prefix>[A-Za-z][A-Za-z-]*(?:\s+[A-Za-z][A-Za-z-]*){4,})\s+"
    r"Schedule\s+(?P<schedule>\d{1,2}[A-Z]?)$",
    re.IGNORECASE,
)
SUBCLASS_RE = re.compile(
    r"^\s*Subclass\s+(?P<subclass>[0-9A-Z]{3,4})"
    # A separator is required.  Without it, ordinary prose such as
    # ``Subclass 100 or 801`` and wrapped phrases such as ``Subclass must``
    # would overwrite the active structural owner.
    r"\s*[—–-]\s*(?P<title>[^\n]+)\s*$",
    re.IGNORECASE,
)
SUBCLASS_HEADING_RE = re.compile(
    r"^\s*Subclass\s+[0-9]{3,4}"
    r"(?:(?:\s+[—–-]?\s*|[—–-]\s*)[^\n]*)?\s*$",
    re.IGNORECASE,
)
SUBCLASS_TRAILING_HEADING_RE = re.compile(
    r"^\s*(?:[A-Z][A-Za-z-]*\s+)+Subclass\s+[0-9]{3,4}\s*$"
)
# Only a standalone line is structural.  In particular, no parenthesised
# suffix is accepted: prose ``103.313(2)`` is an external/internal reference,
# not a new Schedule-2 provision.
PROVISION_RE = re.compile(
    r"^\s*(?P<ref>[0-9A-Z]{3,4}\.\d+[A-Z]*"
    r"(?:\.\d+[A-Z]*)?)\s*(?:[—–-]\s*(?P<title>[^\n]+))?\s*$",
    re.IGNORECASE,
)
# Diagnostic-only broad candidate shape.  It lets the report account for a
# parenthesised reference rejected as prose instead of silently dropping it.
CANDIDATE_PROVISION_RE = re.compile(
    r"^\s*(?P<ref>[0-9A-Z]{3,4}\.\d+[A-Z]*"
    r"(?:\.\d+[A-Z]*)?)(?P<nested>\([^\n)]*\))?\s*"
    r"(?:[—–-]\s*(?P<title>[^\n]+))?\s*$",
    re.IGNORECASE,
)
CLAUSE_HEADING_RE = re.compile(
    r"^\s*Clause\s+(?P<ref>[0-9A-Z]{3,4}\.\d+[A-Z]*"
    r"(?:\.\d+[A-Z]*)?)\s*$",
    re.IGNORECASE,
)
PAGE_REF_RE = re.compile(r"^page_(?P<number>\d+)$", re.IGNORECASE)
COMPILATION_RE = re.compile(r"\bF\d{4}[A-Z]\d{3,6}\b", re.IGNORECASE)

# Explicit, syntax-only external locators.  Patterns are deliberately scoped
# to legal locator words; ordinary bare numbers are never treated as targets.
#
# A legal locator consists of a digit-led base (including dotted regulation
# forms and alphanumeric Schedule items) followed by zero or more nested
# parenthesised components.  Keeping these fragments shared is important: a
# locator such as ``2.20B(2)`` must have the same boundary behavior regardless
# of whether it is introduced as a regulation, subsection, or paragraph.
LEGAL_LOCATOR_BASE = r"[0-9]+[A-Z0-9]*(?:\.[0-9]+[A-Z0-9]*)*"
LEGAL_LOCATOR_NESTED = r"(?:\([0-9A-Za-z]+\))*"
LEGAL_LOCATOR = rf"{LEGAL_LOCATOR_BASE}{LEGAL_LOCATOR_NESTED}"
LEGAL_LOCATOR_TERMINATOR = r"(?=$|[\s,;:!?)]|\[|\]|\{|\}|\.(?![0-9A-Za-z]))"
LEGAL_LOCATOR_PREFIX = rf"\b(?P<provision>{LEGAL_LOCATOR}){LEGAL_LOCATOR_TERMINATOR}"
REGULATION_LOCATOR = rf"[0-9]{{1,3}}\.[0-9]+[A-Z0-9]*{LEGAL_LOCATOR_NESTED}"
REGULATION_LOCATOR_PREFIX = rf"\b(?P<provision>{REGULATION_LOCATOR}){LEGAL_LOCATOR_TERMINATOR}"
COMPOUND_LOCATOR_WORDS = (
    r"paragraph|subparagraph|item|subitem|clause|subclause|"
    r"regulation|subregulation|section|subsection"
)
COMPOUND_SCHEDULE_LOCATOR_RE = re.compile(
    rf"\b(?P<kind>{COMPOUND_LOCATOR_WORDS})\s+"
    rf"(?P<provision>{LEGAL_LOCATOR})\s+of\s+"
    rf"Schedule\s+(?P<schedule>\d{{1,2}}[A-Z]?){LEGAL_LOCATOR_TERMINATOR}",
    re.IGNORECASE,
)
SUBCLASS_REFERENCE_RE = re.compile(
    r"\bSubclass\s+(?P<provision>[0-9]{3,4})(?![0-9A-Za-z])",
    re.IGNORECASE,
)
VISA_CLASS_RE = re.compile(r"\bClass\s+(?P<provision>[A-Z]{2})(?![A-Z0-9])")
SPECIAL_RETURN_CRITERION_RE = re.compile(
    r"\bspecial\s+return\s+(?:criterion|criteria)\s+"
    r"(?P<provisions>5\d{3}(?:(?:\s*,\s*|\s+(?:and|or)\s+)5\d{3})*)\b",
    re.IGNORECASE,
)
UNNAMED_INSTRUMENT_RE = re.compile(
    r"\blegislative\s+instrument\b"
    r"(?:\s+made\s+for\s+(?:this|the)\s+"
    r"(?:paragraph|subparagraph|clause|subclause|item))?",
    re.IGNORECASE,
)
SCHEDULE_CRITERION_RE = re.compile(
    r"\bSchedule\s+(?P<schedule>\d{1,2}[A-Z]?)\s+"
    r"(?:criterion|criteria|clause|clauses)\s+"
    r"(?P<provisions>\d{3,5}[A-Z]?"
    r"(?:(?:\s*,\s*|\s+(?:and|or)\s+)\d{3,5}[A-Z]?)*\b)",
    re.IGNORECASE,
)
PIC_RE = re.compile(
    r"\b(?:public\s+interest\s+(?:criterion|criteria)|PIC)\s+"
    r"(?P<provisions>4\d{3}[A-Z]?"
    r"(?:(?:\s*,\s*|\s+(?:and|or)\s+)4\d{3}[A-Z]?)*\b)",
    re.IGNORECASE,
)
CONDITION_RE = re.compile(
    r"\b(?:visa\s+)?conditions?\s+"
    r"(?P<provisions>8\d{3}[A-Z]?"
    r"(?:(?:\s*,\s*|\s+(?:and|or)\s+)8\d{3}[A-Z]?)*\b)",
    re.IGNORECASE,
)
SUBREGULATION_RE = re.compile(
    rf"\bsubreg(?:ulation)?\s+{LEGAL_LOCATOR_PREFIX}",
    re.IGNORECASE,
)
REGULATION_RE = re.compile(
    rf"\b(?:regulation|reg\.?|r)\s+{REGULATION_LOCATOR_PREFIX}",
    re.IGNORECASE,
)
SCHEDULE_RE = re.compile(
    r"\bSchedule\s+(?P<provision>\d{1,2}[A-Z]?)\b", re.IGNORECASE
)
ACT_RE = re.compile(r"\bMigration\s+Act(?:\s+1958)?\b", re.IGNORECASE)
INSTRUMENT_RE = re.compile(
    r"\b(?:legislative\s+instrument|instrument)\s+"
    r"(?P<provision>(?:F\d{4}[A-Z]\d{3,6}|IMMI\s+\d{2}/\d{2,4}))\b",
    re.IGNORECASE,
)
SECTION_RE = re.compile(
    rf"\b(?:section|s\.?)\s+{LEGAL_LOCATOR_PREFIX}",
    re.IGNORECASE,
)
SUBSECTION_RE = re.compile(
    rf"\bsubsection\s+{LEGAL_LOCATOR_PREFIX}",
    re.IGNORECASE,
)
ITEM_RE = re.compile(
    rf"\bitem\s+{LEGAL_LOCATOR_PREFIX}", re.IGNORECASE
)
PARAGRAPH_RE = re.compile(
    rf"\bparagraph\s+{LEGAL_LOCATOR_PREFIX}",
    re.IGNORECASE,
)
SUBITEM_RE = re.compile(
    rf"\bsubitem\s+{LEGAL_LOCATOR_PREFIX}", re.IGNORECASE
)
SUBPARAGRAPH_RE = re.compile(
    rf"\bsubparagraph\s+{LEGAL_LOCATOR_PREFIX}", re.IGNORECASE
)
CLAUSE_RE = re.compile(
    rf"\bclause\s+{LEGAL_LOCATOR_PREFIX}", re.IGNORECASE
)
SUBCLAUSE_RE = re.compile(
    rf"\bsubclause\s+{LEGAL_LOCATOR_PREFIX}", re.IGNORECASE
)


_REFERENCE_PRIORITY = {
    "schedule_provision": 100,
    "instrument": 80,
    "subclass": 80,
    "visa_class": 80,
    "special_return_criterion": 80,
    "schedule3_criterion": 80,
    "schedule4_pic": 80,
    "schedule8_condition": 80,
    "subregulation": 70,
    "subsection": 70,
    "subitem": 70,
    "subparagraph": 70,
    "subclause": 70,
    "regulation": 60,
    "section": 60,
    "item": 60,
    "paragraph": 60,
    "clause": 60,
    "instrument_dependency": 40,
    "act": 60,
    "schedule": 10,
}


def _sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with Path(path).open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _sha256_text(value: str) -> str:
    return _sha256_bytes(value.encode("utf-8", errors="ignore"))


def _json_line(payload: Mapping[str, object]) -> str:
    return json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _natural_key(value: str) -> tuple[object, ...]:
    return tuple(int(part) if part.isdigit() else part for part in re.split(r"(\d+)", value.upper()))


def _relative(path: Path) -> str:
    try:
        return str(path.resolve().relative_to(ROOT_DIR.resolve()))
    except ValueError:
        return str(path)


@dataclass(frozen=True, slots=True)
class SourcePage:
    source_file: str
    source_path: str
    source_sha256: str
    volume: int
    page_number: int
    section_ref: str
    heading: str
    text: str


@dataclass(frozen=True, slots=True)
class ProvisionOccurrence:
    provision_ref: str
    subclass: str | None
    title: str | None
    source_file: str
    source_sha256: str
    volume: int
    page_number: int
    section_ref: str
    line_number: int
    source_order: int
    text_sha256: str
    body: str

    def provenance(self) -> dict[str, object]:
        return {
            "source_file": self.source_file,
            "source_sha256": self.source_sha256,
            "volume": self.volume,
            "page_number": self.page_number,
            "section_ref": self.section_ref,
            "line_number": self.line_number,
            "source_order": self.source_order,
            "text_sha256": self.text_sha256,
        }


@dataclass(frozen=True, slots=True)
class ReferenceOccurrence:
    locator_type: str
    provision_ref: str
    surface_form: str
    target_document: str | None
    ambiguous: bool
    body_offset: int


@dataclass(frozen=True, slots=True)
class StructuralAnomaly:
    kind: str
    message: str
    source_file: str | None = None
    page_number: int | None = None
    line_number: int | None = None
    provision_ref: str | None = None

    def to_dict(self) -> dict[str, object]:
        payload = {
            "kind": self.kind,
            "message": self.message,
            "source_file": self.source_file,
            "page_number": self.page_number,
            "line_number": self.line_number,
            "provision_ref": self.provision_ref,
        }
        return {key: value for key, value in payload.items() if value is not None}


@dataclass(slots=True)
class ExtractionReport:
    source_pages: list[SourcePage]
    schedule2_pages: list[SourcePage]
    occurrences: list[ProvisionOccurrence]
    references: dict[str, list[ReferenceOccurrence]]
    anomalies: list[StructuralAnomaly] = field(default_factory=list)
    rejected_candidates: list[StructuralAnomaly] = field(default_factory=list)
    explicit_clause_heading_count: int = 0

    @property
    def owners_by_ref(self) -> dict[str, tuple[str, ...]]:
        owners: dict[str, set[str]] = defaultdict(set)
        for occurrence in self.occurrences:
            if occurrence.subclass:
                owners[occurrence.provision_ref].add(occurrence.subclass)
        return {ref: tuple(sorted(values)) for ref, values in sorted(owners.items())}

    @property
    def duplicate_occurrence_count(self) -> int:
        counts = Counter(occurrence.provision_ref for occurrence in self.occurrences)
        return sum(max(0, count - 1) for count in counts.values())

    @property
    def rejected_candidate_reason_counts(self) -> dict[str, int]:
        return dict(sorted(Counter(item.kind for item in self.rejected_candidates).items()))


@dataclass(slots=True)
class GraphNode:
    id: str
    node_type: str
    label: str
    subclass: str | None = None
    provision_ref: str | None = None
    title: str | None = None
    locator_type: str | None = None
    locator: str | None = None
    target_document: str | None = None
    ambiguous: bool | None = None
    local_available: bool | None = None
    resolution_status: str | None = None
    occurrence_count: int | None = None
    occurrences: list[dict[str, object]] = field(default_factory=list)
    provenance: list[dict[str, object]] = field(default_factory=list)

    def to_dict(self) -> dict[str, object]:
        payload = {
            "id": self.id,
            "node_type": self.node_type,
            "label": self.label,
            "subclass": self.subclass,
            "provision_ref": self.provision_ref,
            "title": self.title,
            "locator_type": self.locator_type,
            "locator": self.locator,
            "target_document": self.target_document,
            "ambiguous": self.ambiguous,
            "local_available": self.local_available,
            "resolution_status": self.resolution_status,
            "occurrence_count": self.occurrence_count,
            "occurrences": self.occurrences,
            "provenance": self.provenance,
        }
        return {key: value for key, value in payload.items() if value not in (None, [], "")}


@dataclass(slots=True)
class GraphEdge:
    id: str
    source: str
    relation: str
    target: str
    surface_form: str | None = None
    occurrences: list[dict[str, object]] = field(default_factory=list)

    def to_dict(self) -> dict[str, object]:
        payload = {
            "id": self.id,
            "source": self.source,
            "relation": self.relation,
            "target": self.target,
            "surface_form": self.surface_form,
            "occurrences": self.occurrences,
        }
        return {key: value for key, value in payload.items() if value not in (None, [], "")}


@dataclass(slots=True)
class NavigationSidecar:
    nodes: list[GraphNode]
    edges: list[GraphEdge]
    manifest: dict[str, object]


class SidecarStructureError(ValueError):
    """Raised when the source cannot support a deterministic canonical map."""

    def __init__(self, message: str, *, report: ExtractionReport | None = None) -> None:
        super().__init__(message)
        self.report = report


def _page_number(section_ref: str, fallback: int) -> int:
    match = PAGE_REF_RE.match(section_ref or "")
    return int(match.group("number")) if match else fallback


def _looks_like_contents(text: str) -> bool:
    lines = [line.strip() for line in (text or "").splitlines() if line.strip()]
    if not lines:
        return False
    head = " ".join(lines[:8]).casefold()
    if "contents" in head or "table of provisions" in head:
        return True
    return sum("..." in line or "···" in line for line in lines[:80]) >= 4


def _compact_schedule_title(title: str | None) -> bool:
    """Recognize a compact display title, not a sentence continuation."""
    return bool(title and re.fullmatch(r"[A-Z][a-z]+", title))


def _heading_schedule(heading: str) -> str | None:
    # Metadata is accepted only when the complete value has a compact,
    # heading-shaped Schedule form. Longer source-style values are handled by
    # the explicitly corroborated path below, never by this metadata matcher.
    text = " ".join((heading or "").split())
    metadata_match = SCHEDULE_METADATA_RE.fullmatch(text)
    if metadata_match:
        title = metadata_match.group("title")
        if title is None or _compact_schedule_title(title):
            return metadata_match.group("schedule").upper()
    return None


def _trailing_heading_schedule(heading: str) -> str | None:
    text = " ".join((heading or "").split())
    trailing_match = TRAILING_SCHEDULE_METADATA_RE.fullmatch(text)
    return trailing_match.group("schedule").upper() if trailing_match else None


def _structural_schedule(page: SourcePage) -> str | None:
    if _looks_like_contents(page.text):
        return None
    heading_schedule = _heading_schedule(page.heading)
    if heading_schedule:
        return heading_schedule
    trailing_schedule = _trailing_heading_schedule(page.heading)
    if trailing_schedule and any(
        match.group("schedule").upper() == trailing_schedule
        for line in [line.strip() for line in page.text.splitlines() if line.strip()][:20]
        if (match := SCHEDULE_LINE_RE.match(line))
    ):
        # The tracked compilation repeats long trailing metadata headings as a
        # full Schedule title line in the same page. Do not trust metadata
        # alone for that less-specific shape.
        return trailing_schedule
    for line in [line.strip() for line in page.text.splitlines() if line.strip()][:20]:
        match = SCHEDULE_LINE_RE.match(line)
        if match and _compact_schedule_title(match.group("title").strip()):
            return match.group("schedule").upper()
    return None


def _load_source_pages(paths: Sequence[Path]) -> tuple[list[SourcePage], list[dict[str, object]]]:
    pages: list[SourcePage] = []
    source_metadata: list[dict[str, object]] = []
    for path in sorted((Path(value) for value in paths), key=lambda item: item.name):
        raw = path.read_bytes()
        data = json.loads(raw.decode("utf-8"))
        sections = data.get("sections")
        if not isinstance(sections, list):
            raise ValueError(f"source has no page sections: {path}")
        volume_match = re.search(r"VOL(\d+)", path.name, re.IGNORECASE)
        volume = int(volume_match.group(1)) if volume_match else 0
        document_version = str(data.get("document_version") or "")
        metadata = data.get("metadata_json") if isinstance(data.get("metadata_json"), Mapping) else {}
        embedded_hash = str(metadata.get("content_hash") or "")
        source_metadata.append(
            {
                "source_file": _relative(path),
                "source_sha256": _sha256_bytes(raw),
                "embedded_content_hash": embedded_hash or None,
                "document_version": document_version or None,
                "volume": volume,
                "page_count": len(sections),
                "pdf_file": _relative(PDF_DIR / path.name.replace(".json", ".pdf")),
                "pdf_sha256": (
                    sha256_file(PDF_DIR / path.name.replace(".json", ".pdf"))
                    if (PDF_DIR / path.name.replace(".json", ".pdf")).exists()
                    else None
                ),
            }
        )
        source_file = _relative(path)
        source_sha = _sha256_bytes(raw)
        for fallback, section in enumerate(sections, start=1):
            if not isinstance(section, Mapping):
                continue
            text = str(section.get("text") or "")
            if not text.strip():
                continue
            section_ref = str(section.get("section_ref") or f"page_{fallback}")
            pages.append(
                SourcePage(
                    source_file=source_file,
                    source_path=str(path),
                    source_sha256=source_sha,
                    volume=volume,
                    page_number=_page_number(section_ref, fallback),
                    section_ref=section_ref,
                    heading=str(section.get("heading") or ""),
                    text=text,
                )
            )
    return pages, source_metadata


def _scope_schedule2_pages(pages: Sequence[SourcePage]) -> list[SourcePage]:
    active: str | None = None
    current_source_file: str | None = None
    selected: list[SourcePage] = []
    for page in sorted(pages, key=lambda item: (item.source_file, item.page_number, item.section_ref)):
        if page.source_file != current_source_file:
            current_source_file = page.source_file
            active = None
        detected = _structural_schedule(page)
        if detected is not None:
            active = detected
        if active == "2" and not _looks_like_contents(page.text):
            selected.append(page)
    return selected


def _flat_lines(pages: Sequence[SourcePage]) -> list[tuple[SourcePage, int, str]]:
    lines: list[tuple[SourcePage, int, str]] = []
    for page in pages:
        for line_number, line in enumerate(page.text.splitlines(), start=1):
            lines.append((page, line_number, line))
    return lines


def _extract_occurrences(
    pages: Sequence[SourcePage],
) -> tuple[list[ProvisionOccurrence], list[StructuralAnomaly], list[StructuralAnomaly], int]:
    lines = _flat_lines(pages)
    candidates: list[tuple[int, SourcePage, int, re.Match[str], str | None]] = []
    current_subclass: str | None = None
    current_source_file: str | None = None
    anomalies: list[StructuralAnomaly] = []
    rejected_candidates: list[StructuralAnomaly] = []
    explicit_clause_heading_count = 0
    for index, (page, line_number, line) in enumerate(lines):
        if page.source_file != current_source_file:
            current_source_file = page.source_file
            current_subclass = None
        subclass_match = SUBCLASS_RE.match(line.strip())
        if subclass_match:
            current_subclass = subclass_match.group("subclass").upper()
        if CLAUSE_HEADING_RE.match(line):
            explicit_clause_heading_count += 1
        provision_match = PROVISION_RE.match(line)
        if not provision_match:
            candidate_match = CANDIDATE_PROVISION_RE.match(line)
            if candidate_match and candidate_match.group("nested"):
                rejected_candidates.append(
                    StructuralAnomaly(
                        "parenthesized_reference",
                        f"candidate {candidate_match.group('ref')} has a parenthesized suffix",
                        page.source_file,
                        page.page_number,
                        line_number,
                        candidate_match.group("ref").upper(),
                    )
                )
            continue
        ref = provision_match.group("ref").upper()
        prefix = ref.split(".", 1)[0]
        owner = current_subclass
        if owner is None:
            anomalies.append(
                StructuralAnomaly(
                    "missing_owner",
                    f"provision {ref} appears before a structural Subclass heading",
                    page.source_file,
                    page.page_number,
                    line_number,
                    ref,
                )
            )
        elif owner != prefix:
            anomalies.append(
                StructuralAnomaly(
                    "prefix_owner_mismatch",
                    f"provision {ref} has active owner {owner}",
                    page.source_file,
                    page.page_number,
                    line_number,
                    ref,
                )
            )
        candidates.append((index, page, line_number, provision_match, owner))

    occurrences: list[ProvisionOccurrence] = []
    for position, (index, page, line_number, match, owner) in enumerate(candidates):
        next_index = candidates[position + 1][0] if position + 1 < len(candidates) else len(lines)
        body = "\n".join(item[2] for item in lines[index:next_index]).strip()
        ref = match.group("ref").upper()
        title = (match.group("title") or "").strip() or None
        occurrences.append(
            ProvisionOccurrence(
                provision_ref=ref,
                # Preserve the observed owner even when its prefix conflicts;
                # the verifier/report must expose the conflict rather than
                # silently converting it into an unowned provision.
                subclass=owner,
                title=title,
                source_file=page.source_file,
                source_sha256=page.source_sha256,
                volume=page.volume,
                page_number=page.page_number,
                section_ref=page.section_ref,
                line_number=line_number,
                source_order=position + 1,
                text_sha256=_sha256_text(body),
                body=body,
            )
        )
    # The two extra diagnostics are attached by extract_source without making
    # candidate rejection a structural-fatal condition.
    return occurrences, anomalies, rejected_candidates, explicit_clause_heading_count


def _ref(
    locator_type: str,
    provision_ref: str,
    surface_form: str,
    match: re.Match[str],
    *,
    target_document: str | None = None,
    ambiguous: bool = False,
) -> ReferenceOccurrence:
    return ReferenceOccurrence(
        locator_type=locator_type,
        provision_ref=provision_ref.upper(),
        surface_form=surface_form,
        target_document=target_document,
        ambiguous=ambiguous,
        body_offset=match.start(),
    )


def _extract_references(text: str) -> list[ReferenceOccurrence]:
    found: list[ReferenceOccurrence] = []
    for match in COMPOUND_SCHEDULE_LOCATOR_RE.finditer(text):
        schedule = match.group("schedule").upper()
        found.append(
            _ref(
                "schedule_provision",
                match.group("provision"),
                match.group(0),
                match,
                target_document=f"Schedule {schedule}",
            )
        )
    for match in SUBCLASS_REFERENCE_RE.finditer(text):
        line_start = text.rfind("\n", 0, match.start()) + 1
        line_end = text.find("\n", match.end())
        if line_end < 0:
            line_end = len(text)
        if SUBCLASS_HEADING_RE.fullmatch(text[line_start:line_end].strip()):
            # Standalone owner/page labels are structural metadata, not
            # operative references to another subclass.
            continue
        if SUBCLASS_TRAILING_HEADING_RE.fullmatch(text[line_start:line_end].strip()):
            continue
        found.append(
            _ref(
                "subclass",
                match.group("provision"),
                match.group(0),
                match,
                target_document="Schedule 2",
            )
        )
    for match in VISA_CLASS_RE.finditer(text):
        found.append(
            _ref(
                "visa_class",
                match.group("provision"),
                match.group(0),
                match,
                target_document="Migration Regulations 1994 — Schedule 1",
            )
        )
    for match in SPECIAL_RETURN_CRITERION_RE.finditer(text):
        for provision in re.findall(r"5\d{3}", match.group("provisions")):
            found.append(
                _ref(
                    "special_return_criterion",
                    provision,
                    match.group(0),
                    match,
                    target_document="Schedule 5",
                )
            )
    for match in SCHEDULE_CRITERION_RE.finditer(text):
        schedule = match.group("schedule").upper()
        if schedule == "3":
            for provision in re.findall(r"\d{3,5}[A-Z]?", match.group("provisions"), re.IGNORECASE):
                found.append(_ref("schedule3_criterion", provision, match.group(0), match, target_document="Schedule 3"))
    for match in PIC_RE.finditer(text):
        for provision in re.findall(r"4\d{3}[A-Z]?", match.group("provisions"), re.IGNORECASE):
            found.append(_ref("schedule4_pic", provision, match.group(0), match, target_document="Schedule 4"))
    for match in CONDITION_RE.finditer(text):
        for provision in re.findall(r"8\d{3}[A-Z]?", match.group("provisions"), re.IGNORECASE):
            found.append(_ref("schedule8_condition", provision, match.group(0), match, target_document="Schedule 8"))
    for match in SUBREGULATION_RE.finditer(text):
        found.append(_ref("subregulation", match.group("provision"), match.group(0), match, target_document="Migration Regulations 1994"))
    for match in REGULATION_RE.finditer(text):
        found.append(_ref("regulation", match.group("provision"), match.group(0), match, target_document="Migration Regulations 1994"))
    for match in INSTRUMENT_RE.finditer(text):
        found.append(_ref("instrument", match.group("provision"), match.group(0), match, target_document="Legislative Instrument"))
    for match in UNNAMED_INSTRUMENT_RE.finditer(text):
        found.append(
            _ref(
                "instrument_dependency",
                "LEGISLATIVE_INSTRUMENT",
                match.group(0),
                match,
                target_document="Legislative Instrument",
            )
        )
    for match in ACT_RE.finditer(text):
        found.append(_ref("act", "MIGRATION_ACT_1958", match.group(0), match, target_document="Migration Act 1958"))
    for match in SECTION_RE.finditer(text):
        found.append(_ref("section", match.group("provision"), match.group(0), match, ambiguous=True))
    for match in SUBSECTION_RE.finditer(text):
        found.append(_ref("subsection", match.group("provision"), match.group(0), match, ambiguous=True))
    for match in ITEM_RE.finditer(text):
        found.append(_ref("item", match.group("provision"), match.group(0), match, ambiguous=True))
    for match in PARAGRAPH_RE.finditer(text):
        found.append(_ref("paragraph", match.group("provision"), match.group(0), match, ambiguous=True))
    for match in SUBITEM_RE.finditer(text):
        found.append(_ref("subitem", match.group("provision"), match.group(0), match, ambiguous=True))
    for match in SUBPARAGRAPH_RE.finditer(text):
        found.append(_ref("subparagraph", match.group("provision"), match.group(0), match, ambiguous=True))
    for match in CLAUSE_RE.finditer(text):
        line_start = text.rfind("\n", 0, match.start()) + 1
        line_end = text.find("\n", match.end())
        if line_end < 0:
            line_end = len(text)
        if CLAUSE_HEADING_RE.fullmatch(text[line_start:line_end].strip()):
            # Page-level ``Clause 802.111`` labels are structural headings,
            # not an explicit reference in the preceding provision body.
            continue
        found.append(_ref("clause", match.group("provision"), match.group(0), match, ambiguous=True))
    for match in SUBCLAUSE_RE.finditer(text):
        found.append(_ref("subclause", match.group("provision"), match.group(0), match, ambiguous=True))

    # The generic Schedule pattern runs after Schedule-3 criterion extraction;
    # it is retained as a broad structural navigation target as well.
    for match in SCHEDULE_RE.finditer(text):
        schedule = match.group("provision").upper()
        if schedule != "2":
            found.append(_ref("schedule", schedule, match.group(0), match, target_document=f"Schedule {schedule}"))

    # Specific references own their syntactic span.  This prevents a compound
    # address from also producing its overlapping paragraph/item and broad
    # Schedule matches, while retaining genuinely standalone Schedule text.
    selected: list[ReferenceOccurrence] = []
    for item in sorted(
        found,
        key=lambda value: (
            -_REFERENCE_PRIORITY.get(value.locator_type, 0),
            value.body_offset,
            -len(value.surface_form),
            value.locator_type,
            value.provision_ref,
            value.surface_form,
        ),
    ):
        item_start = item.body_offset
        item_end = item_start + len(item.surface_form)
        overlaps = False
        for existing in selected:
            existing_start = existing.body_offset
            existing_end = existing_start + len(existing.surface_form)
            if item_start < existing_end and existing_start < item_end:
                if _REFERENCE_PRIORITY.get(item.locator_type, 0) < _REFERENCE_PRIORITY.get(existing.locator_type, 0):
                    overlaps = True
                    break
        if not overlaps:
            selected.append(item)

    dedup: dict[tuple[str, str, str | None, bool, int | None], ReferenceOccurrence] = {}
    for item in sorted(selected, key=lambda value: (value.body_offset, value.locator_type, value.provision_ref, value.surface_form)):
        dedup.setdefault(
            (
                item.locator_type,
                item.provision_ref,
                item.target_document,
                item.ambiguous,
                item.body_offset if item.locator_type == "instrument_dependency" else None,
            ),
            item,
        )
    return list(dedup.values())


def extract_source(paths: Sequence[Path] = DEFAULT_SOURCE_PATHS) -> ExtractionReport:
    source_pages, _ = _load_source_pages(paths)
    schedule2_pages = _scope_schedule2_pages(source_pages)
    if not schedule2_pages:
        raise SidecarStructureError("no Schedule-2 pages were structurally delimited")
    occurrences, anomalies, rejected_candidates, explicit_clause_heading_count = _extract_occurrences(schedule2_pages)
    references: dict[str, list[ReferenceOccurrence]] = defaultdict(list)
    for occurrence in occurrences:
        references[occurrence.provision_ref].extend(_extract_references(occurrence.body))
    return ExtractionReport(
        source_pages=source_pages,
        schedule2_pages=schedule2_pages,
        occurrences=occurrences,
        references=dict(references),
        anomalies=anomalies,
        rejected_candidates=rejected_candidates,
        explicit_clause_heading_count=explicit_clause_heading_count,
    )


def read_locator_records(path: Path = LOCATOR_INDEX_PATH) -> list[LegalLocatorRecord]:
    records: list[LegalLocatorRecord] = []
    if not Path(path).exists():
        return records
    for line_number, raw in enumerate(Path(path).read_text(encoding="utf-8").splitlines(), start=1):
        if not raw.strip():
            continue
        try:
            records.append(LegalLocatorRecord.from_dict(json.loads(raw)))
        except Exception as exc:
            raise ValueError(f"invalid locator row at line {line_number}: {exc}") from exc
    return records


def _locator_availability(
    locator_type: str,
    provision_ref: str,
    records: Sequence[LegalLocatorRecord],
) -> bool:
    ref = provision_ref.upper()
    if locator_type == "schedule":
        return any((record.schedule_no or "").upper() == ref for record in records)
    lookup_ref = ref
    lookup_type = locator_type
    if locator_type == "subregulation":
        lookup_type = "regulation"
        lookup_ref = re.sub(r"(?:\([^)]*\))+$", "", lookup_ref)
    return any(
        record.locator_type.casefold() == lookup_type.casefold()
        and record.provision_ref.upper() == lookup_ref
        for record in records
    )


def _external_id(
    locator_type: str,
    provision_ref: str,
    *,
    target_document: str | None = None,
) -> str:
    safe_type = re.sub(r"[^A-Z0-9_-]+", "-", locator_type.upper())
    safe_ref = re.sub(r"[^A-Z0-9_.()-]+", "-", provision_ref.upper())
    if locator_type == "instrument_dependency":
        return f"s2x:instrument-dependency:{safe_ref}"
    if locator_type == "schedule_provision" and target_document:
        safe_target = re.sub(r"[^A-Z0-9_-]+", "-", target_document.upper())
        return f"s2x:external:{safe_type}:{safe_target}:{safe_ref}"
    return f"s2x:external:{safe_type}:{safe_ref}"


def _schedule2_base_ref(provision_ref: str) -> str:
    return re.sub(r"(?:\([^)]*\))+$", "", provision_ref.upper())


def _schedule2_locator_id(provision_ref: str) -> str:
    safe_ref = re.sub(r"[^A-Z0-9_.()-]+", "-", provision_ref.upper())
    return f"s2x:schedule2-locator:{safe_ref}"


def _instrument_dependency_ref(
    source_ref: str,
    occurrence: ProvisionOccurrence,
    reference: ReferenceOccurrence,
) -> str:
    # The source provision plus occurrence order and body offset scope an
    # unnamed dependency without inventing an instrument identifier.
    return f"{source_ref}@{occurrence.source_order}:{reference.body_offset}"


def _relation(locator_type: str) -> str:
    return {
        "schedule": "REFERENCES_SCHEDULE",
        "schedule_provision": "REFERENCES_SCHEDULE_PROVISION",
        "subclass": "REFERENCES_SUBCLASS",
        "visa_class": "REFERENCES_VISA_CLASS",
        "special_return_criterion": "REFERENCES_SPECIAL_RETURN_CRITERION",
        "instrument_dependency": "REFERENCES_INSTRUMENT_DEPENDENCY",
        "regulation": "REFERENCES_REGULATION",
        "subregulation": "REFERENCES_REGULATION",
        "section": "REFERENCES_ACT",
        "subsection": "REFERENCES_ACT",
        "act": "REFERENCES_ACT",
        "instrument": "REFERENCES_INSTRUMENT",
        "schedule4_pic": "REFERENCES_PIC",
        "schedule8_condition": "REFERENCES_CONDITION",
        "schedule3_criterion": "REFERENCES_SCHEDULE3_CRITERION",
    }.get(locator_type, "REFERENCES")


def _edge_id(source: str, relation: str, target: str) -> str:
    return "s2x:edge:" + _sha256_text(f"{source}\0{relation}\0{target}")[:24]


def _reference_provenance(occurrence: ProvisionOccurrence, ref: ReferenceOccurrence) -> dict[str, object]:
    payload = occurrence.provenance()
    payload.update(
        {
            "surface_form": ref.surface_form,
            "body_offset": ref.body_offset,
            "ambiguous": ref.ambiguous,
        }
    )
    return payload


def _manifest_sources(paths: Sequence[Path]) -> list[dict[str, object]]:
    _, metadata = _load_source_pages(paths)
    return sorted(metadata, key=lambda value: str(value["source_file"]))


def _detect_compilation(report: ExtractionReport) -> str | None:
    values: set[str] = set()
    for page in report.source_pages:
        for match in COMPILATION_RE.finditer(page.text):
            values.add(match.group(0).upper())
    return sorted(values)[0] if len(values) == 1 else (sorted(values)[0] if values else None)


def build_sidecar(
    paths: Sequence[Path] = DEFAULT_SOURCE_PATHS,
    *,
    locator_records: Sequence[LegalLocatorRecord] = (),
    locator_index_path: Path | None = LOCATOR_INDEX_PATH,
    locator_manifest_path: Path | None = LOCATOR_MANIFEST_PATH,
    reject_structural_errors: bool = True,
) -> NavigationSidecar:
    report = extract_source(paths)
    if report.anomalies and reject_structural_errors:
        details = "; ".join(anomaly.message for anomaly in report.anomalies[:5])
        raise SidecarStructureError(
            f"Schedule-2 structural extraction produced {len(report.anomalies)} anomalies: {details}",
            report=report,
        )
    owners = report.owners_by_ref
    conflicts = {ref: values for ref, values in owners.items() if len(values) != 1}
    missing_owner_refs = sorted(ref for ref in {item.provision_ref for item in report.occurrences} if ref not in owners)
    if conflicts or missing_owner_refs:
        message = f"canonical provision ownership is not unique: conflicts={conflicts}, missing={missing_owner_refs}"
        raise SidecarStructureError(message, report=report)

    occurrences_by_ref: dict[str, list[ProvisionOccurrence]] = defaultdict(list)
    for occurrence in report.occurrences:
        occurrences_by_ref[occurrence.provision_ref].append(occurrence)

    nodes: dict[str, GraphNode] = {}
    edges: dict[tuple[str, str, str], GraphEdge] = {}
    provision_ids_by_subclass: dict[str, list[tuple[str, str]]] = defaultdict(list)
    for subclass in sorted(set(owners[ref][0] for ref in owners), key=_natural_key):
        subclass_occurrences = [item for item in report.occurrences if item.subclass == subclass]
        titles = sorted({item.title for item in subclass_occurrences if item.title})
        node_id = f"s2x:subclass:{subclass}"
        nodes[node_id] = GraphNode(
            id=node_id,
            node_type="subclass",
            label=f"Subclass {subclass}" + (f" — {titles[0]}" if titles else ""),
            subclass=subclass,
            title=titles[0] if titles else None,
            occurrence_count=len(subclass_occurrences),
            provenance=[item.provenance() for item in sorted(subclass_occurrences, key=lambda value: (value.source_file, value.page_number, value.line_number))],
        )

    for ref in sorted(occurrences_by_ref, key=_natural_key):
        provision_occurrences = sorted(
            occurrences_by_ref[ref],
            key=lambda item: (item.source_file, item.page_number, item.line_number, item.text_sha256),
        )
        subclass = owners[ref][0]
        provision_id = f"s2x:provision:{ref}"
        titles = sorted({item.title for item in provision_occurrences if item.title})
        nodes[provision_id] = GraphNode(
            id=provision_id,
            node_type="provision",
            label=ref + (f" — {titles[0]}" if titles else ""),
            subclass=subclass,
            provision_ref=ref,
            title=titles[0] if titles else None,
            occurrence_count=len(provision_occurrences),
            occurrences=[item.provenance() for item in provision_occurrences],
            provenance=[item.provenance() for item in provision_occurrences],
        )
        subclass_id = f"s2x:subclass:{subclass}"
        contains_key = (subclass_id, "CONTAINS", provision_id)
        edges[contains_key] = GraphEdge(
            id=_edge_id(*contains_key), source=contains_key[0], relation=contains_key[1], target=contains_key[2]
        )

    # Adjacency is source order, not lexical/natural reference order.  The
    # first accepted occurrence of each canonical provision is the structural
    # ordering signal; IDs are sorted only when serializing nodes/edges.
    seen_by_subclass: dict[str, set[str]] = defaultdict(set)
    for occurrence in report.occurrences:
        if occurrence.provision_ref in seen_by_subclass[occurrence.subclass or ""]:
            continue
        seen_by_subclass[occurrence.subclass or ""].add(occurrence.provision_ref)
        provision_ids_by_subclass[occurrence.subclass or ""].append(
            (occurrence.provision_ref, f"s2x:provision:{occurrence.provision_ref}")
        )

    for subclass, ordered in provision_ids_by_subclass.items():
        for current, following in zip(ordered, ordered[1:]):
            next_key = (current[1], "NEXT_CLAUSE", following[1])
            prev_key = (following[1], "PREVIOUS_CLAUSE", current[1])
            edges[next_key] = GraphEdge(id=_edge_id(*next_key), source=next_key[0], relation=next_key[1], target=next_key[2])
            edges[prev_key] = GraphEdge(id=_edge_id(*prev_key), source=prev_key[0], relation=prev_key[1], target=prev_key[2])

    direct_refs: dict[tuple[str, str, str], list[tuple[str, ReferenceOccurrence, ProvisionOccurrence]]] = defaultdict(list)
    schedule2_locator_refs: dict[str, list[tuple[str, ReferenceOccurrence, ProvisionOccurrence]]] = defaultdict(list)
    external_refs: dict[tuple[str, str, str | None, bool], list[tuple[str, ReferenceOccurrence, ProvisionOccurrence]]] = defaultdict(list)
    for ref, ref_items in report.references.items():
        for occurrence in occurrences_by_ref.get(ref, []):
            for item in _extract_references(occurrence.body):
                source_id = f"s2x:provision:{ref}"
                if item.locator_type in {"clause", "subclause"}:
                    base_ref = _schedule2_base_ref(item.provision_ref)
                    if base_ref in occurrences_by_ref:
                        if item.provision_ref == base_ref:
                            target_id = f"s2x:provision:{base_ref}"
                        else:
                            target_id = _schedule2_locator_id(item.provision_ref)
                            schedule2_locator_refs[target_id].append((ref, item, occurrence))
                        direct_refs[(source_id, "REFERENCES_SCHEDULE2_PROVISION", target_id)].append(
                            (ref, item, occurrence)
                        )
                        continue
                if item.locator_type == "subclass" and f"s2x:subclass:{item.provision_ref}" in nodes:
                    direct_refs[(source_id, "REFERENCES_SUBCLASS", f"s2x:subclass:{item.provision_ref}")].append(
                        (ref, item, occurrence)
                    )
                    continue
                if item.locator_type == "instrument_dependency":
                    item = replace(
                        item,
                        provision_ref=_instrument_dependency_ref(ref, occurrence, item),
                    )
                external_refs[(item.locator_type, item.provision_ref, item.target_document, item.ambiguous)].append(
                    (ref, item, occurrence)
                )

    for target_id in sorted(schedule2_locator_refs):
        items = schedule2_locator_refs[target_id]
        ordered_items = sorted(
            items,
            key=lambda value: (value[0], value[2].source_file, value[2].page_number, value[1].body_offset),
        )
        first = ordered_items[0][1]
        provenance = [_reference_provenance(item[2], item[1]) for item in ordered_items]
        nodes[target_id] = GraphNode(
            id=target_id,
            node_type="schedule2_locator",
            label=first.surface_form,
            provision_ref=first.provision_ref,
            locator_type="schedule2_provision",
            locator=first.surface_form,
            target_document="Schedule 2",
            occurrence_count=len(ordered_items),
            occurrences=provenance,
            provenance=provenance,
        )

    for edge_key in sorted(direct_refs):
        source_items = direct_refs[edge_key]
        provenance = [
            _reference_provenance(item[2], item[1])
            for item in sorted(
                source_items,
                key=lambda value: (value[2].source_file, value[2].page_number, value[1].body_offset),
            )
        ]
        edges[edge_key] = GraphEdge(
            id=_edge_id(*edge_key),
            source=edge_key[0],
            relation=edge_key[1],
            target=edge_key[2],
            surface_form=sorted(item[1].surface_form for item in source_items)[0],
            occurrences=provenance,
        )

    for key in sorted(external_refs, key=lambda value: (value[0], value[1], value[2] or "", value[3])):
        locator_type, provision_ref, target_document, ambiguous = key
        items = external_refs[key]
        external_id = _external_id(locator_type, provision_ref, target_document=target_document)
        local_available = _locator_availability(locator_type, provision_ref, locator_records)
        status = "ambiguous" if ambiguous else ("resolved_local" if local_available else "unresolved_external")
        first = sorted(items, key=lambda value: (value[0], value[2].source_file, value[2].page_number, value[1].body_offset))[0][1]
        nodes.setdefault(
            external_id,
            GraphNode(
                id=external_id,
                node_type="external_locator",
                label=first.surface_form,
                provision_ref=provision_ref,
                locator_type=locator_type,
                locator=first.surface_form,
                target_document=target_document,
                ambiguous=ambiguous,
                local_available=local_available,
                resolution_status=status,
                occurrence_count=len(items),
                occurrences=[_reference_provenance(item[2], item[1]) for item in sorted(items, key=lambda value: (value[0], value[2].source_file, value[2].page_number, value[1].body_offset))],
                provenance=[_reference_provenance(item[2], item[1]) for item in sorted(items, key=lambda value: (value[0], value[2].source_file, value[2].page_number, value[1].body_offset))],
            ),
        )
        grouped_by_source: dict[str, list[tuple[str, ReferenceOccurrence, ProvisionOccurrence]]] = defaultdict(list)
        for item in items:
            grouped_by_source[item[0]].append(item)
        for source_ref, source_items in grouped_by_source.items():
            source_id = f"s2x:provision:{source_ref}"
            relation = _relation(locator_type)
            edge_key = (source_id, relation, external_id)
            existing = edges.get(edge_key)
            provenance = [_reference_provenance(item[2], item[1]) for item in sorted(source_items, key=lambda value: (value[2].source_file, value[2].page_number, value[1].body_offset))]
            if existing:
                existing.occurrences.extend(provenance)
            else:
                edges[edge_key] = GraphEdge(
                    id=_edge_id(*edge_key),
                    source=source_id,
                    relation=relation,
                    target=external_id,
                    surface_form=sorted(item[1].surface_form for item in source_items)[0],
                    occurrences=provenance,
                )

    node_list = sorted(nodes.values(), key=lambda item: item.id)
    edge_list = sorted(edges.values(), key=lambda item: (item.source, item.relation, item.target))
    external_nodes = [item for item in node_list if item.node_type == "external_locator"]
    relation_counts = Counter(item.relation for item in edge_list)
    unresolved_count = sum(1 for item in external_nodes if item.resolution_status == "unresolved_external")
    ambiguous_count = sum(1 for item in external_nodes if item.ambiguous)
    locator_counts = Counter(
        ("resolved_local" if item.local_available else "unresolved_external") if not item.ambiguous else "ambiguous"
        for item in external_nodes
    )
    locator_hash = sha256_file(locator_index_path) if locator_index_path and Path(locator_index_path).exists() else None
    locator_manifest: dict[str, object] = {}
    if locator_manifest_path and Path(locator_manifest_path).exists():
        locator_manifest = json.loads(Path(locator_manifest_path).read_text(encoding="utf-8"))
    manifest: dict[str, object] = {
        "schema_version": SCHEMA_VERSION,
        "graph_kind": GRAPH_KIND,
        "compilation": _detect_compilation(report),
        "document_family": "Migration Regulations 1994",
        "source_representation": "tracked_raw_json_page_sections",
        "source_files": _manifest_sources(paths),
        "source_documents_processed": len({page.source_file for page in report.source_pages}),
        "source_pages_processed": len(report.source_pages),
        "schedule2_pages_processed": len(report.schedule2_pages),
        "subclass_count": len({value[0] for value in owners.values()}),
        "canonical_provision_count": len(occurrences_by_ref),
        "source_occurrence_count": len(report.occurrences),
        "duplicate_occurrence_count": report.duplicate_occurrence_count,
        "accepted_structural_provision_count": len(report.occurrences),
        "rejected_candidate_count": len(report.rejected_candidates),
        "rejected_candidate_reason_counts": report.rejected_candidate_reason_counts,
        "ambiguous_candidate_count": sum(
            anomaly.kind == "missing_owner" for anomaly in report.anomalies
        ),
        "conflicting_candidate_count": sum(
            anomaly.kind == "prefix_owner_mismatch" for anomaly in report.anomalies
        ),
        "explicit_clause_heading_count": report.explicit_clause_heading_count,
        "conflicting_ownership_count": len([value for value in owners.values() if len(value) > 1]),
        "structural_anomaly_count": len(report.anomalies),
        "node_count": len(node_list),
        "edge_count": len(edge_list),
        "node_type_counts": dict(sorted(Counter(item.node_type for item in node_list).items())),
        "relation_counts": dict(sorted(relation_counts.items())),
        "external_locator_count": len(external_nodes),
        "unresolved_external_target_count": unresolved_count,
        "ambiguous_external_target_count": ambiguous_count,
        "locator_resolution_counts": dict(sorted(locator_counts.items())),
        "locator_index_sha256": locator_hash,
        "locator_manifest_identity": {
            key: locator_manifest.get(key)
            for key in ("document_family", "document_version", "compilation_number", "effective_date", "record_count")
            if key in locator_manifest
        },
        "positive_only_semantics": True,
        "serving_path_integrated": False,
    }
    manifest = {key: value for key, value in manifest.items() if value is not None}
    return NavigationSidecar(nodes=node_list, edges=edge_list, manifest=manifest)


def validate_sidecar(sidecar: NavigationSidecar) -> list[str]:
    errors: list[str] = []
    node_ids = [node.id for node in sidecar.nodes]
    edge_ids = [edge.id for edge in sidecar.edges]
    node_by_id = {node.id: node for node in sidecar.nodes}
    if len(node_ids) != len(set(node_ids)):
        errors.append("duplicate node ids")
    if len(edge_ids) != len(set(edge_ids)):
        errors.append("duplicate edge ids")
    contains_parents: Counter[str] = Counter()
    triples: set[tuple[str, str, str]] = set()
    for edge in sidecar.edges:
        if edge.relation in FORBIDDEN_RELATIONS or edge.relation not in ALLOWED_RELATIONS:
            errors.append(f"forbidden or unsupported relation: {edge.relation}")
        if edge.source not in node_by_id:
            errors.append(f"dangling edge source: {edge.id}:{edge.source}")
        if edge.target not in node_by_id:
            errors.append(f"dangling edge target: {edge.id}:{edge.target}")
        triple = (edge.source, edge.relation, edge.target)
        if triple in triples:
            errors.append(f"duplicate edge triple: {triple}")
        triples.add(triple)
        if edge.relation == "CONTAINS":
            contains_parents[edge.target] += 1
        if edge.relation.startswith("REFERENCES") and not edge.occurrences:
            errors.append(f"reference edge missing provenance: {edge.id}")
    for node in sidecar.nodes:
        if node.node_type in {"subclass", "provision"} and not node.provenance:
            errors.append(f"structural node missing provenance: {node.id}")
        if node.node_type == "provision":
            if not node.provision_ref or not node.subclass:
                errors.append(f"provision missing identity: {node.id}")
            if node.provision_ref and node.subclass != node.provision_ref.split(".", 1)[0].upper():
                errors.append(f"provision owner/prefix mismatch: {node.id}")
            if contains_parents[node.id] != 1:
                errors.append(f"provision must have exactly one CONTAINS parent: {node.id}")
            if node.occurrence_count != len(node.occurrences):
                errors.append(f"provision occurrence metadata mismatch: {node.id}")
        if node.node_type == "external_locator":
            if not node.locator_type or not node.provision_ref:
                errors.append(f"external locator missing identity: {node.id}")
            if node.local_available is None or node.resolution_status is None:
                errors.append(f"external locator missing resolution metadata: {node.id}")
            if node.occurrence_count != len(node.occurrences):
                errors.append(f"external occurrence metadata mismatch: {node.id}")
        if node.node_type == "schedule2_locator":
            if node.locator_type != "schedule2_provision" or not node.provision_ref:
                errors.append(f"Schedule-2 locator missing identity: {node.id}")
            if node.target_document != "Schedule 2":
                errors.append(f"Schedule-2 locator has invalid target document: {node.id}")
            if node.occurrence_count != len(node.occurrences):
                errors.append(f"Schedule-2 locator occurrence metadata mismatch: {node.id}")
    expected_counts = {
        "node_count": len(sidecar.nodes),
        "edge_count": len(sidecar.edges),
        "canonical_provision_count": sum(node.node_type == "provision" for node in sidecar.nodes),
        "external_locator_count": sum(node.node_type == "external_locator" for node in sidecar.nodes),
    }
    for name, expected in expected_counts.items():
        if sidecar.manifest.get(name) != expected:
            errors.append(f"manifest {name} mismatch: {sidecar.manifest.get(name)} != {expected}")
    return errors


def _atomic_write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(text, encoding="utf-8")
    temporary.replace(path)


def _nodes_text(nodes: Sequence[GraphNode]) -> str:
    return "".join(_json_line(node.to_dict()) + "\n" for node in nodes)


def _edges_text(edges: Sequence[GraphEdge]) -> str:
    return "".join(_json_line(edge.to_dict()) + "\n" for edge in edges)


def write_sidecar(
    sidecar: NavigationSidecar,
    *,
    nodes_path: Path = DEFAULT_NODES_PATH,
    edges_path: Path = DEFAULT_EDGES_PATH,
    manifest_path: Path = DEFAULT_MANIFEST_PATH,
) -> NavigationSidecar:
    node_text = _nodes_text(sidecar.nodes)
    edge_text = _edges_text(sidecar.edges)
    _atomic_write(Path(nodes_path), node_text)
    _atomic_write(Path(edges_path), edge_text)
    sidecar.manifest["generated_artifact_sha256"] = {
        "nodes": _sha256_text(node_text),
        "edges": _sha256_text(edge_text),
    }
    _atomic_write(
        Path(manifest_path),
        json.dumps(sidecar.manifest, ensure_ascii=False, sort_keys=True, indent=2) + "\n",
    )
    return sidecar


def load_sidecar(
    *,
    nodes_path: Path = DEFAULT_NODES_PATH,
    edges_path: Path = DEFAULT_EDGES_PATH,
    manifest_path: Path = DEFAULT_MANIFEST_PATH,
) -> NavigationSidecar:
    nodes = []
    for line in Path(nodes_path).read_text(encoding="utf-8").splitlines():
        if line.strip():
            payload = json.loads(line)
            nodes.append(GraphNode(**payload))
    edges = []
    for line in Path(edges_path).read_text(encoding="utf-8").splitlines():
        if line.strip():
            payload = json.loads(line)
            edges.append(GraphEdge(**payload))
    manifest = json.loads(Path(manifest_path).read_text(encoding="utf-8"))
    return NavigationSidecar(nodes=nodes, edges=edges, manifest=manifest)


def verify_artifacts(
    sidecar: NavigationSidecar,
    *,
    nodes_path: Path,
    edges_path: Path,
) -> list[str]:
    errors = validate_sidecar(sidecar)
    node_text = _nodes_text(sidecar.nodes)
    edge_text = _edges_text(sidecar.edges)
    hashes = sidecar.manifest.get("generated_artifact_sha256", {})
    if not isinstance(hashes, Mapping):
        errors.append("manifest generated_artifact_sha256 is missing")
    else:
        if hashes.get("nodes") != _sha256_text(node_text):
            errors.append("manifest node artifact hash mismatch")
        if hashes.get("edges") != _sha256_text(edge_text):
            errors.append("manifest edge artifact hash mismatch")
    if Path(nodes_path).read_text(encoding="utf-8") != node_text:
        errors.append("persisted nodes do not match normalized sidecar")
    if Path(edges_path).read_text(encoding="utf-8") != edge_text:
        errors.append("persisted edges do not match normalized sidecar")
    return errors


class Schedule2NavigationMap:
    """Read-only query facade for offline evaluation and inspection."""

    def __init__(self, sidecar: NavigationSidecar) -> None:
        self.sidecar = sidecar
        self._nodes = {node.id: node for node in sidecar.nodes}
        self._outgoing: dict[str, list[GraphEdge]] = defaultdict(list)
        self._incoming: dict[str, list[GraphEdge]] = defaultdict(list)
        for edge in sidecar.edges:
            self._outgoing[edge.source].append(edge)
            self._incoming[edge.target].append(edge)

    @classmethod
    def from_files(
        cls,
        *,
        nodes_path: Path = DEFAULT_NODES_PATH,
        edges_path: Path = DEFAULT_EDGES_PATH,
        manifest_path: Path = DEFAULT_MANIFEST_PATH,
    ) -> "Schedule2NavigationMap":
        return cls(load_sidecar(nodes_path=nodes_path, edges_path=edges_path, manifest_path=manifest_path))

    def subclass_map(self, subclass: str, *, max_provisions: int = 80, max_references: int = 80) -> dict[str, object]:
        normalized = str(subclass).strip().upper()
        node = self._nodes.get(f"s2x:subclass:{normalized}")
        if node is None:
            return {"subclass": normalized, "found": False, "nodes": [], "edges": []}
        contains = [edge for edge in self._outgoing[node.id] if edge.relation == "CONTAINS"][: max(0, max_provisions)]
        provision_ids = {edge.target for edge in contains}
        references = [
            edge
            for provision_id in [edge.target for edge in contains]
            for edge in self._outgoing[provision_id]
            if edge.relation.startswith("REFERENCES")
        ][: max(0, max_references)]
        selected = contains + references
        node_ids = {node.id, *provision_ids, *(edge.target for edge in references)}
        return {
            "subclass": normalized,
            "found": True,
            "nodes": [self._nodes[item].to_dict() for item in sorted(node_ids)],
            "edges": [edge.to_dict() for edge in selected],
        }

    def provision_context(self, provision_ref: str, *, max_edges: int = 30) -> dict[str, object]:
        normalized = str(provision_ref).strip().upper()
        node = self._nodes.get(f"s2x:provision:{normalized}")
        if node is None:
            return {"provision_ref": normalized, "found": False, "nodes": [], "edges": []}
        edges = (self._outgoing[node.id] + self._incoming[node.id])[: max(0, max_edges)]
        node_ids = {node.id, *(edge.source for edge in edges), *(edge.target for edge in edges)}
        return {
            "provision_ref": normalized,
            "found": True,
            "nodes": [self._nodes[item].to_dict() for item in sorted(node_ids)],
            "edges": [edge.to_dict() for edge in edges],
        }

    def follow_references(self, provision_ref: str, *, max_targets: int = 20) -> dict[str, object]:
        normalized = str(provision_ref).strip().upper()
        node = self._nodes.get(f"s2x:provision:{normalized}")
        if node is None:
            return {"provision_ref": normalized, "found": False, "targets": []}
        edges = [edge for edge in self._outgoing[node.id] if edge.relation.startswith("REFERENCES")][: max(0, max_targets)]
        return {
            "provision_ref": normalized,
            "found": True,
            "targets": [
                {"relation": edge.relation, "node": self._nodes[edge.target].to_dict(), "surface_form": edge.surface_form}
                for edge in edges
            ],
        }

    @staticmethod
    def _locator_type_matches(node: GraphNode, locator_type: str) -> bool:
        normalized = locator_type.strip().casefold()
        node_locator_type = (node.locator_type or "").strip().casefold()
        if normalized == "schedule5_special_return_criterion":
            normalized = "special_return_criterion"
        if normalized == "schedule2_provision":
            return node.node_type in {"provision", "schedule2_locator"} or node_locator_type == normalized
        if normalized == "subclass":
            return node.node_type == "subclass" or node_locator_type == normalized
        return node_locator_type == normalized

    @staticmethod
    def _locator_value(locator_type: str, value: object) -> str:
        normalized = " ".join(str(value or "").split()).strip().casefold()
        locator_kind = locator_type.strip().casefold()
        if locator_kind in {"visa_class", "subclass"}:
            normalized = re.sub(rf"^{locator_kind.replace('_', ' ')}\s+", "", normalized)
        elif locator_kind == "schedule":
            normalized = re.sub(r"^schedule\s+", "", normalized)
        return normalized

    @classmethod
    def _node_locator_values(cls, node: GraphNode, locator_type: str) -> set[str]:
        values: set[str] = set()
        for value in (node.locator, node.provision_ref, node.subclass):
            if value not in (None, ""):
                values.add(cls._locator_value(locator_type, value))
        return values

    @classmethod
    def _node_target_document(cls, node: GraphNode, locator_type: str) -> str | None:
        if node.target_document:
            return cls._locator_value("target_document", node.target_document)
        if locator_type.strip().casefold() == "schedule2_provision" and node.node_type in {"provision", "schedule2_locator"}:
            return "schedule 2"
        return None

    def find_mentions(
        self,
        locator_type: str,
        locator: str,
        *,
        target_document: str | None = None,
        max_mentions: int = 20,
    ) -> dict[str, object]:
        """Return bounded incoming explicit references to a known graph target.

        This is an identity lookup over extracted graph metadata and incoming
        ``REFERENCES*`` edges.  It deliberately does not inspect provision
        bodies or infer any relationship beyond an existing explicit edge.
        """
        query_type = " ".join(str(locator_type).split()).strip().casefold()
        query_locator = self._locator_value(query_type, locator)
        query_document = (
            self._locator_value("target_document", target_document)
            if target_document is not None
            else None
        )
        candidates = [
            node
            for node in self._nodes.values()
            if self._locator_type_matches(node, query_type)
            and query_locator in self._node_locator_values(node, query_type)
            and (
                query_document is None
                or self._node_target_document(node, query_type) == query_document
            )
        ]
        candidates.sort(key=lambda node: node.id)

        remaining = max(0, int(max_mentions))
        matches: list[dict[str, object]] = []
        for target in candidates:
            if remaining == 0:
                break
            mentions = []
            for edge in self._incoming[target.id]:
                source = self._nodes.get(edge.source)
                if edge.relation.startswith("REFERENCES") and source is not None and source.node_type == "provision":
                    mentions.append(edge)
            mentions.sort(
                key=lambda edge: (
                    _natural_key(self._nodes[edge.source].provision_ref or ""),
                    edge.source,
                    edge.relation,
                    " ".join((edge.surface_form or "").split()).casefold(),
                    edge.id,
                )
            )
            bounded_mentions = mentions[:remaining]
            if not bounded_mentions:
                continue
            matches.append(
                {
                    "node": target.to_dict(),
                    "mentions": [
                        {
                            "relation": edge.relation,
                            "source": self._nodes[edge.source].to_dict(),
                            "surface_form": edge.surface_form,
                        }
                        for edge in bounded_mentions
                    ],
                }
            )
            remaining -= len(bounded_mentions)

        return {
            "locator_type": locator_type,
            "locator": locator,
            "target_document": target_document,
            "found": bool(candidates),
            "matches": matches,
        }


def normalized_sidecar(sidecar: NavigationSidecar) -> tuple[list[dict[str, object]], list[dict[str, object]], dict[str, object]]:
    return (
        [node.to_dict() for node in sidecar.nodes],
        [edge.to_dict() for edge in sidecar.edges],
        sidecar.manifest,
    )
