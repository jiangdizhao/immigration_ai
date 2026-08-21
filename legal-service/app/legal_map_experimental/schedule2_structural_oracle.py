"""Independent validation-only structural oracle for Schedule 2.

The oracle deliberately uses different structural assumptions from the
production extractor: page metadata/title tokens, tokenized locator lines,
and source coordinates. It never imports production parser helpers or infers
legal meaning. Only tracked raw JSON paths and public sidecar node/edge data
are shared.
"""

from __future__ import annotations

import json
import re
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Mapping, Sequence


ROOT_DIR = Path(__file__).resolve().parents[2]
DEFAULT_SOURCE_PATHS = (
    ROOT_DIR / "data" / "raw" / "legislation" / "migration_regulations_1994_F2026C00667" / "F2026C00667VOL02.json",
    ROOT_DIR / "data" / "raw" / "legislation" / "migration_regulations_1994_F2026C00667" / "F2026C00667VOL03.json",
)

# Structural interpretation shared: NONE. The remaining shared concerns are
# nonsemantic transport/data concerns only, recorded for the audit artifact.
INDEPENDENCE_AUDIT = {
    "status": "independent_structural_interpretation",
    "structural_interpretation_shared": [],
    "production_functions_called": [],
    "shared_nonsemantic_concerns": ["tracked raw JSON path", "JSON data model", "sidecar public nodes/edges"],
    "oracle_assumptions": [
        "strict heading/title tokens define schedule markers and scope resets at each source file",
        "contents pages require an explicit leading contents marker",
        "provisions are tokenized locator heads, not production regular-expression matches",
        "ownership is the last subclass marker in the page/file coordinate stream",
        "source order is derived from (source_file, page_number, line_number) coordinates",
    ],
}

_PAGE_RE = re.compile(r"^page_(\d+)$", re.IGNORECASE)
_SCHEDULE_NUMBER_RE = re.compile(r"^\d{1,2}[A-Z]?$", re.IGNORECASE)
_VOLUME_RE = re.compile(r"VOL(\d+)", re.IGNORECASE)


@dataclass(frozen=True, slots=True)
class OraclePage:
    source_file: str
    volume: int
    page_number: int
    section_ref: str
    heading: str
    text: str


@dataclass(frozen=True, slots=True)
class OracleOccurrence:
    provision_ref: str
    subclass: str | None
    source_file: str
    volume: int
    page_number: int
    section_ref: str
    line_number: int
    coordinate: tuple[str, int, int]


@dataclass(slots=True)
class OracleResult:
    source_pages_processed: int
    schedule2_pages_processed: int
    occurrences: list[OracleOccurrence]
    explicit_clause_headings: list[OracleOccurrence]
    rejected_candidates: list[dict[str, object]] = field(default_factory=list)

    @property
    def owners_by_ref(self) -> dict[str, tuple[str, ...]]:
        owners: dict[str, set[str]] = defaultdict(set)
        for item in self.occurrences:
            if item.subclass:
                owners[item.provision_ref].add(item.subclass)
        return {ref: tuple(sorted(values)) for ref, values in sorted(owners.items())}

    @property
    def metadata_refs(self) -> set[str]:
        return {item.provision_ref for item in self.explicit_clause_headings}

    @property
    def canonical_refs(self) -> set[str]:
        return {item.provision_ref for item in self.occurrences} | self.metadata_refs

    @property
    def order_by_subclass(self) -> dict[str, list[str]]:
        result: dict[str, list[str]] = defaultdict(list)
        seen: dict[str, set[str]] = defaultdict(set)
        for item in sorted(self.occurrences, key=lambda value: value.coordinate):
            if not item.subclass or item.provision_ref in seen[item.subclass]:
                continue
            seen[item.subclass].add(item.provision_ref)
            result[item.subclass].append(item.provision_ref)
        return dict(result)


def _relative(path: Path) -> str:
    try:
        return str(path.resolve().relative_to(ROOT_DIR.resolve()))
    except ValueError:
        return str(path)


def _page_number(section_ref: str, fallback: int) -> int:
    match = _PAGE_RE.fullmatch(section_ref or "")
    return int(match.group(1)) if match else fallback


def _is_contents(text: str) -> bool:
    lines = [line.strip().casefold() for line in (text or "").splitlines() if line.strip()]
    if not lines:
        return False
    return any(line == "contents" or line.startswith("contents ") or line == "table of provisions" for line in lines[:6])


def _schedule_number(value: str) -> str | None:
    candidate = value.strip().casefold().rstrip(":")
    return candidate.upper() if _SCHEDULE_NUMBER_RE.fullmatch(candidate) else None


def _compact_schedule_title(value: str) -> bool:
    return bool(re.fullmatch(r"[A-Z][a-z]+", value))


def _heading_schedule(heading: str) -> str | None:
    """Accept only complete compact display metadata."""
    text = " ".join((heading or "").split())
    tokens = text.replace("—", " — ").replace("–", " – ").replace("-", " - ").replace(":", " : ").split()
    if len(tokens) < 2 or tokens[0].casefold() != "schedule":
        return None
    schedule = _schedule_number(tokens[1])
    if schedule is None or len(tokens) == 2:
        return schedule if len(tokens) == 2 else None
    if tokens[2] in {"—", "–", "-", ":"}:
        return schedule if len(tokens) == 4 and _compact_schedule_title(tokens[3]) else None
    return None


def _trailing_heading_schedule(heading: str) -> str | None:
    text = " ".join((heading or "").split())
    tokens = text.replace("—", " ").replace("–", " ").replace("-", " ").replace(":", " ").split()
    if len(tokens) < 6 or tokens[-2].casefold() != "schedule":
        return None
    return _schedule_number(tokens[-1])


def _title_schedule(text: str) -> str | None:
    for raw_line in (text or "").splitlines()[:20]:
        line = raw_line.strip()
        if not line:
            continue
        tokens = line.replace("—", " — ").replace("–", " – ").replace("-", " - ").replace(":", " : ").split()
        if len(tokens) < 2 or tokens[0].casefold() != "schedule":
            continue
        schedule = _schedule_number(tokens[1])
        if schedule is None:
            continue
        if len(tokens) == 2 or (len(tokens) == 4 and tokens[2] in {"—", "–", "-", ":"} and _compact_schedule_title(tokens[3])):
            return schedule
    return None


def _structural_schedule(page: OraclePage) -> str | None:
    if _is_contents(page.text):
        return None
    return _heading_schedule(page.heading) or _trailing_heading_schedule(page.heading) or _title_schedule(page.text)


def _load_pages(paths: Sequence[Path]) -> list[OraclePage]:
    pages: list[OraclePage] = []
    for path in sorted((Path(value) for value in paths), key=lambda item: item.name):
        data = json.loads(path.read_text(encoding="utf-8"))
        volume_match = _VOLUME_RE.search(path.name)
        volume = int(volume_match.group(1)) if volume_match else 0
        for fallback, section in enumerate(data.get("sections") or [], start=1):
            if not isinstance(section, Mapping):
                continue
            text = str(section.get("text") or "")
            if not text.strip():
                continue
            section_ref = str(section.get("section_ref") or f"page_{fallback}")
            pages.append(OraclePage(_relative(path), volume, _page_number(section_ref, fallback), section_ref, str(section.get("heading") or ""), text))
    return pages


def _scope_schedule2(pages: Sequence[OraclePage]) -> list[OraclePage]:
    selected: list[OraclePage] = []
    current_file: str | None = None
    active: str | None = None
    for page in sorted(pages, key=lambda item: (item.source_file, item.page_number, item.section_ref)):
        if page.source_file != current_file:
            current_file = page.source_file
            active = None
        marker = _structural_schedule(page)
        if marker is not None:
            active = marker
        if active == "2" and not _is_contents(page.text):
            selected.append(page)
    return selected


def _subclass_marker(line: str) -> str | None:
    normalized = line.strip().replace("—", " - ").replace("–", " - ")
    tokens = normalized.split()
    if len(tokens) < 3 or tokens[0].casefold() != "subclass":
        return None
    value = tokens[1].upper()
    if not re.fullmatch(r"[0-9A-Z]{3,4}", value) or "-" not in tokens[2:]:
        return None
    return value


def _locator_head(line: str) -> str | None:
    """Recognize a standalone locator by token structure, not production regex."""
    text = line.strip()
    if not text or text.casefold().startswith("clause "):
        return None
    for separator in ("—", "–", "-"):
        if separator in text:
            text = text.split(separator, 1)[0].strip()
            break
    if not text or any(char.isspace() for char in text) or "(" in text or ")" in text:
        return None
    parts = text.upper().split(".")
    if len(parts) not in {2, 3} or not 3 <= len(parts[0]) <= 4 or not parts[0].isalnum():
        return None
    for part in parts[1:]:
        if not part or not part[0].isdigit() or not part.isalnum():
            return None
    return ".".join(parts)


def _clause_locator(line: str) -> str | None:
    tokens = line.strip().split()
    if len(tokens) != 2 or tokens[0].casefold() != "clause":
        return None
    return _locator_head(tokens[1])


def build_structural_oracle(paths: Sequence[Path] = DEFAULT_SOURCE_PATHS) -> OracleResult:
    pages = _load_pages(paths)
    scoped = _scope_schedule2(pages)
    occurrences: list[OracleOccurrence] = []
    explicit_clause_headings: list[OracleOccurrence] = []
    rejected: list[dict[str, object]] = []
    active_by_file: dict[str, str | None] = {}
    for page in scoped:
        active = active_by_file.get(page.source_file)
        for line_number, line in enumerate(page.text.splitlines(), start=1):
            subclass = _subclass_marker(line)
            if subclass is not None:
                active = subclass
                active_by_file[page.source_file] = active
            coordinate = (page.source_file, page.page_number, line_number)
            clause_ref = _clause_locator(line)
            if clause_ref is not None:
                explicit_clause_headings.append(OracleOccurrence(clause_ref, active, page.source_file, page.volume, page.page_number, page.section_ref, line_number, coordinate))
                continue
            ref = _locator_head(line)
            if ref is None:
                continue
            occurrences.append(OracleOccurrence(ref, active, page.source_file, page.volume, page.page_number, page.section_ref, line_number, coordinate))
            if active != ref.split(".", 1)[0]:
                rejected.append({"kind": "ownership_mismatch", "provision_ref": ref, "subclass": active, "coordinate": coordinate})
    return OracleResult(len(pages), len(scoped), occurrences, explicit_clause_headings, rejected)


def _actual_order(provision_nodes: Mapping[str, object]) -> dict[str, list[str]]:
    ordered: dict[str, list[tuple[int, str]]] = defaultdict(list)
    for node in provision_nodes.values():
        occurrences = getattr(node, "occurrences", [])
        first = min((int(item.get("source_order", 0)) for item in occurrences), default=0)
        subclass = getattr(node, "subclass", None)
        ref = getattr(node, "provision_ref", None)
        if subclass and ref:
            ordered[str(subclass)].append((first, str(ref)))
    return {key: [ref for _, ref in sorted(values)] for key, values in ordered.items()}


def _actual_relation_pairs(sidecar: object, relation: str) -> set[tuple[str, str]]:
    nodes = {node.id: node for node in getattr(sidecar, "nodes")}
    pairs: set[tuple[str, str]] = set()
    for edge in getattr(sidecar, "edges"):
        if edge.relation != relation:
            continue
        source = nodes.get(edge.source)
        target = nodes.get(edge.target)
        source_ref = getattr(source, "provision_ref", None)
        target_ref = getattr(target, "provision_ref", None)
        if source_ref and target_ref:
            pairs.add((str(source_ref), str(target_ref)))
    return pairs


def _expected_relation_pairs(order: Mapping[str, Sequence[str]]) -> tuple[set[tuple[str, str]], set[tuple[str, str]]]:
    next_pairs: set[tuple[str, str]] = set()
    previous_pairs: set[tuple[str, str]] = set()
    for refs in order.values():
        for left, right in zip(refs, refs[1:]):
            next_pairs.add((left, right))
            previous_pairs.add((right, left))
    return next_pairs, previous_pairs


def compare_structural_oracle(oracle: OracleResult, sidecar: object) -> dict[str, object]:
    nodes = getattr(sidecar, "nodes")
    provision_nodes = {node.provision_ref: node for node in nodes if node.node_type == "provision" and node.provision_ref}
    oracle_refs = oracle.canonical_refs
    sidecar_refs = set(provision_nodes)
    oracle_owners = oracle.owners_by_ref
    ownership_mismatches = []
    for ref in sorted(oracle_refs & sidecar_refs):
        expected = oracle_owners.get(ref, ())
        actual = (str(provision_nodes[ref].subclass),) if provision_nodes[ref].subclass else ()
        if expected != actual:
            ownership_mismatches.append({"provision_ref": ref, "oracle": expected, "sidecar": actual})
    actual_order = _actual_order(provision_nodes)
    order_mismatches = []
    for subclass in sorted(set(oracle.order_by_subclass) | set(actual_order)):
        expected = oracle.order_by_subclass.get(subclass, [])
        actual = actual_order.get(subclass, [])
        if list(expected) != actual:
            order_mismatches.append({"subclass": subclass, "oracle": list(expected), "sidecar": actual})
    expected_next, expected_previous = _expected_relation_pairs(oracle.order_by_subclass)
    actual_next = _actual_relation_pairs(sidecar, "NEXT_CLAUSE")
    actual_previous = _actual_relation_pairs(sidecar, "PREVIOUS_CLAUSE")
    return {
        "independence_audit": INDEPENDENCE_AUDIT,
        "oracle_provision_count": len(oracle_refs),
        "sidecar_provision_count": len(sidecar_refs),
        "missing_from_sidecar": sorted(oracle_refs - sidecar_refs),
        "extra_in_sidecar": sorted(sidecar_refs - oracle_refs),
        "ownership_mismatches": ownership_mismatches,
        "source_order_mismatches": order_mismatches,
        "next_clause_mismatches": sorted(expected_next ^ actual_next),
        "previous_clause_mismatches": sorted(expected_previous ^ actual_previous),
        "oracle_occurrence_count": len(oracle.occurrences),
        "oracle_explicit_clause_heading_count": len(oracle.explicit_clause_headings),
        "oracle_rejected_candidate_count": len(oracle.rejected_candidates),
    }
