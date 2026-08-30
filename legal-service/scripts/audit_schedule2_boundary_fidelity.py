#!/usr/bin/env python3
"""Audit explicit Schedule-2 boundary locators against the final sidecar.

The candidate recognizers in this script are intentionally independent of the
sidecar reference extractor.  They are bounded syntax scans over the tracked
Schedule-2 source and are used only to measure preservation of explicit
locator families; they do not create graph nodes or legal semantics.
"""

from __future__ import annotations

import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from app.legal_map_experimental.schedule2_navigation_sidecar import (  # noqa: E402
    DEFAULT_SOURCE_PATHS,
    LOCATOR_INDEX_PATH,
    LOCATOR_MANIFEST_PATH,
    build_sidecar,
    extract_source,
    read_locator_records,
)


REPORT_JSON = Path("/tmp/s2_boundary_fidelity_v2_audit.json")
REPORT_TEXT = Path("/tmp/s2_boundary_fidelity_v2_audit.txt")

COMPOUND_RE = re.compile(
    r"\b(?:paragraph|subparagraph|item|subitem|clause|subclause|regulation|subregulation|section|subsection)\s+"
    r"(?P<ref>[0-9]+[A-Z0-9]*(?:\.[0-9]+[A-Z0-9]*)*(?:\([0-9A-Za-z]+\))*)\s+of\s+"
    r"Schedule\s+(?P<schedule>[0-9]{1,2}[A-Z]?)\b",
    re.IGNORECASE,
)
NESTED_SUBREGULATION_RE = re.compile(
    r"\bsubreg(?:ulation)?\s+(?P<ref>[0-9]+[A-Z0-9]*(?:\.[0-9]+[A-Z0-9]*)*(?:\([0-9A-Za-z]+\))*)",
    re.IGNORECASE,
)
NESTED_SUBSECTION_RE = re.compile(
    r"\bsubsection\s+(?P<ref>[0-9]+[A-Z0-9]*(?:\.[0-9]+[A-Z0-9]*)*(?:\([0-9A-Za-z]+\))*)",
    re.IGNORECASE,
)
INTERNAL_SCHEDULE2_RE = re.compile(
    r"\b(?:clause|subclause)\s+(?P<ref>[0-9A-Z]{3,4}\.[0-9]+[A-Z]*(?:\.[0-9]+[A-Z]*)*(?:\([0-9A-Za-z]+\))*)",
    re.IGNORECASE,
)
SUBCLASS_RE = re.compile(r"\bSubclass\s+(?P<ref>[0-9]{3,4})(?![0-9A-Za-z])", re.IGNORECASE)
VISA_CLASS_RE = re.compile(r"\bClass\s+(?P<ref>[A-Z]{2})(?![A-Z0-9])")
SPECIAL_RETURN_RE = re.compile(
    r"\bspecial\s+return\s+(?:criterion|criteria)\s+(?P<refs>5[0-9]{3}(?:(?:\s*,\s*|\s+(?:and|or)\s+)5[0-9]{3})*)\b",
    re.IGNORECASE,
)
NAMED_INSTRUMENT_RE = re.compile(
    r"\b(?:legislative\s+instrument|instrument)\s+(?P<ref>F[0-9]{4}[A-Z][0-9]{3,6}|IMMI\s+[0-9]{2}/[0-9]{2,4})\b",
    re.IGNORECASE,
)
UNNAMED_INSTRUMENT_RE = re.compile(
    r"\blegislative\s+instrument\b"
    r"(?:\s+made\s+for\s+(?:this|the)\s+(?:paragraph|subparagraph|clause|subclause|item))?"
    r"(?!\s+(?:F[0-9]{4}[A-Z][0-9]{3,6}|IMMI\s+[0-9]{2}/[0-9]{2,4})\b)",
    re.IGNORECASE,
)
PIC_RE = re.compile(
    r"\b(?:public\s+interest\s+(?:criterion|criteria)|PIC)\s+(?P<refs>4[0-9]{3}[A-Z]?(?:(?:\s*,\s*|\s+(?:and|or)\s+)4[0-9]{3}[A-Z]?)*\b)",
    re.IGNORECASE,
)
CONDITION_RE = re.compile(
    r"\b(?:visa\s+)?conditions?\s+(?P<refs>8[0-9]{3}[A-Z]?(?:(?:\s*,\s*|\s+(?:and|or)\s+)8[0-9]{3}[A-Z]?)*\b)",
    re.IGNORECASE,
)
ORDINARY_REGULATION_RE = re.compile(
    r"\bregulation\s+(?P<ref>[0-9]{1,3}\.[0-9]+[A-Z0-9]*(?:\([0-9A-Za-z]+\))*)",
    re.IGNORECASE,
)
ACT_SECTION_RE = re.compile(
    r"\bsection\s+(?P<ref>[0-9]+[A-Z0-9]*(?:\([0-9A-Za-z]+\))*)",
    re.IGNORECASE,
)
STRUCTURAL_LINE_RE = re.compile(
    r"^\s*(?:Clause\s+[0-9A-Z]{3,4}\.[0-9]+[A-Z]*(?:\.[0-9]+[A-Z]*)?|"
    r"Subclass\s+[0-9]{3,4})(?:\s*[—–-].*)?\s*$",
    re.IGNORECASE,
)
BODY_BOUNDARY_RE = re.compile(
    r"^\s*(?:Clause\s+[0-9A-Z]{3,4}\.[0-9]+[A-Z]*(?:\.[0-9]+[A-Z]*)?|"
    r"Subclass\s+[0-9]{3,4}(?:\s+[—–-].*)?)\s*$",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class Candidate:
    family: str
    relation: str
    locator_type: str
    refs: tuple[str, ...]
    target_document: str | None
    source_provision: str
    surface_form: str
    body_offset: int


def _parts(value: str) -> list[str]:
    return re.findall(r"[0-9]+[A-Z0-9]*(?:\.[0-9]+[A-Z0-9]*)*(?:\([0-9A-Za-z]+\))*", value, re.IGNORECASE)


def _candidate(family: str, relation: str, locator_type: str, match: re.Match[str], source: str, refs: tuple[str, ...], document: str | None = None) -> Candidate:
    return Candidate(
        family=family,
        relation=relation,
        locator_type=locator_type,
        refs=tuple(ref.upper() for ref in refs),
        target_document=document,
        source_provision=source,
        surface_form=match.group(0),
        body_offset=match.start(),
    )


def _operative_body(text: str) -> str:
    """Exclude a repeated page header that marks the next structural clause."""
    lines: list[str] = []
    for line in text.splitlines(keepends=True):
        if BODY_BOUNDARY_RE.fullmatch(line.rstrip("\r\n")):
            break
        lines.append(line)
    return "".join(lines)


def independent_candidates(report) -> tuple[list[Candidate], int]:
    candidates: list[Candidate] = []
    noise_count = 0
    for occurrence in report.occurrences:
        body = _operative_body(occurrence.body)
        for match in COMPOUND_RE.finditer(body):
            candidates.append(_candidate(
                "compound_schedule_locator",
                "REFERENCES_SCHEDULE_PROVISION",
                "schedule_provision",
                match,
                occurrence.provision_ref,
                (match.group("ref"),),
                f"Schedule {match.group('schedule').upper()}",
            ))
        for match in NESTED_SUBREGULATION_RE.finditer(body):
            candidates.append(_candidate("nested_subregulation", "REFERENCES_REGULATION", "subregulation", match, occurrence.provision_ref, (match.group("ref"),)))
        for match in NESTED_SUBSECTION_RE.finditer(body):
            candidates.append(_candidate("nested_subsection", "REFERENCES_ACT", "subsection", match, occurrence.provision_ref, (match.group("ref"),)))
        for match in INTERNAL_SCHEDULE2_RE.finditer(body):
            line_start = body.rfind("\n", 0, match.start()) + 1
            line_end = body.find("\n", match.end())
            line = body[line_start:] if line_end < 0 else body[line_start:line_end]
            if STRUCTURAL_LINE_RE.fullmatch(line):
                noise_count += 1
            else:
                candidates.append(_candidate("internal_schedule2_reference", "REFERENCES_SCHEDULE2_PROVISION", "schedule2_provision", match, occurrence.provision_ref, (match.group("ref"),)))
        for match in SUBCLASS_RE.finditer(body):
            line_start = body.rfind("\n", 0, match.start()) + 1
            line_end = body.find("\n", match.end())
            line = body[line_start:] if line_end < 0 else body[line_start:line_end]
            if STRUCTURAL_LINE_RE.fullmatch(line):
                noise_count += 1
            else:
                candidates.append(_candidate("subclass_reference", "REFERENCES_SUBCLASS", "subclass", match, occurrence.provision_ref, (match.group("ref"),)))
        for match in VISA_CLASS_RE.finditer(body):
            candidates.append(_candidate("visa_class_reference", "REFERENCES_VISA_CLASS", "visa_class", match, occurrence.provision_ref, (match.group("ref"),)))
        for match in SPECIAL_RETURN_RE.finditer(body):
            candidates.append(_candidate("special_return_criterion", "REFERENCES_SPECIAL_RETURN_CRITERION", "special_return_criterion", match, occurrence.provision_ref, tuple(_parts(match.group("refs")))))
        named_spans = {match.span() for match in NAMED_INSTRUMENT_RE.finditer(body)}
        for match in NAMED_INSTRUMENT_RE.finditer(body):
            candidates.append(_candidate("named_legislative_instrument", "REFERENCES_INSTRUMENT", "instrument", match, occurrence.provision_ref, (match.group("ref"),)))
        for match in UNNAMED_INSTRUMENT_RE.finditer(body):
            if not any(start <= match.start() < end for start, end in named_spans):
                candidates.append(_candidate("unnamed_legislative_instrument_dependency", "REFERENCES_INSTRUMENT_DEPENDENCY", "instrument_dependency", match, occurrence.provision_ref, ()))
        for match in PIC_RE.finditer(body):
            candidates.append(_candidate("pic", "REFERENCES_PIC", "schedule4_pic", match, occurrence.provision_ref, tuple(_parts(match.group("refs")))))
        for match in CONDITION_RE.finditer(body):
            candidates.append(_candidate("visa_condition", "REFERENCES_CONDITION", "schedule8_condition", match, occurrence.provision_ref, tuple(_parts(match.group("refs")))))
        for match in ORDINARY_REGULATION_RE.finditer(body):
            if not body[max(0, match.start() - 4):match.start()].casefold().endswith("sub"):
                candidates.append(_candidate("ordinary_regulation", "REFERENCES_REGULATION", "regulation", match, occurrence.provision_ref, (match.group("ref"),)))
        for match in ACT_SECTION_RE.finditer(body):
            candidates.append(_candidate("ordinary_act_section", "REFERENCES_ACT", "section", match, occurrence.provision_ref, (match.group("ref"),)))
    return candidates, noise_count


def _norm(value: object) -> str:
    return " ".join(str(value or "").split()).casefold()


def _node_matches(candidate: Candidate, node: dict[str, object], ref: str) -> bool:
    if candidate.locator_type == "instrument_dependency":
        return node.get("locator_type") == "instrument_dependency"
    if candidate.locator_type == "subclass":
        return _norm(node.get("subclass") or node.get("provision_ref")) == _norm(ref)
    if candidate.locator_type == "schedule2_provision":
        return _norm(node.get("provision_ref")) == _norm(ref)
    if _norm(node.get("provision_ref")) != _norm(ref):
        return False
    if candidate.target_document is not None and _norm(node.get("target_document")) != _norm(candidate.target_document):
        return False
    return True


def audit_candidates(candidates: list[Candidate], sidecar) -> tuple[dict[str, dict[str, object]], list[dict[str, object]]]:
    nodes = {node.id: node.to_dict() for node in sidecar.nodes}
    edges = [edge for edge in sidecar.edges if edge.relation.startswith("REFERENCES")]
    by_family: dict[str, list[Candidate]] = {}
    for candidate in candidates:
        by_family.setdefault(candidate.family, []).append(candidate)
    reports: dict[str, dict[str, object]] = {}
    details: list[dict[str, object]] = []
    for family, family_candidates in sorted(by_family.items()):
        preserved = partial = missed = 0
        family_details: list[dict[str, object]] = []
        for candidate in family_candidates:
            matched_refs: set[str] = set()
            for edge in edges:
                allowed_relations = {candidate.relation}
                if candidate.family == "internal_schedule2_reference":
                    allowed_relations.add("REFERENCES")
                if edge.source != f"s2x:provision:{candidate.source_provision}" or edge.relation not in allowed_relations:
                    continue
                if not any(_norm(item.get("surface_form")) == _norm(candidate.surface_form) for item in edge.occurrences):
                    continue
                node = nodes.get(edge.target, {})
                if not candidate.refs:
                    matched_refs.add("<occurrence-scoped>")
                else:
                    matched_refs.update(ref for ref in candidate.refs if _node_matches(candidate, node, ref))
            expected = set(candidate.refs) if candidate.refs else {"<occurrence-scoped>"}
            if matched_refs == expected:
                status = "preserved"
                preserved += 1
            elif matched_refs:
                status = "partial"
                partial += 1
            else:
                status = "missed"
                missed += 1
            if status != "preserved":
                family_details.append({
                    "status": status,
                    "source_provision": candidate.source_provision,
                    "surface_form": candidate.surface_form,
                    "expected_refs": sorted(expected),
                    "matched_refs": sorted(matched_refs),
                })
        reports[family] = {
            "candidate_count": len(family_candidates),
            "preserved_count": preserved,
            "partial_count": partial,
            "missed_count": missed,
            "details": family_details[:20],
        }
        details.extend({"family": family, **item} for item in family_details[:20])
    return reports, details


def render_text(payload: dict[str, object]) -> str:
    lines = [
        "Boundary Fidelity v2 final Schedule-2 audit",
        f"compilation={payload['compilation']}",
        f"canonical_provision_count={payload['canonical_provision_count']}",
        f"structural_noise_excluded={payload['structural_noise_excluded']}",
        "",
        "family | candidates | preserved | partial | missed",
    ]
    for family, result in payload["families"].items():
        lines.append(f"{family} | {result['candidate_count']} | {result['preserved_count']} | {result['partial_count']} | {result['missed_count']}")
        for detail in result["details"]:
            lines.append(f"  {detail['status']}: {detail['source_provision']} :: {detail['surface_form']}")
    return "\n".join(lines) + "\n"


def main() -> int:
    report = extract_source(DEFAULT_SOURCE_PATHS)
    sidecar = build_sidecar(
        DEFAULT_SOURCE_PATHS,
        locator_records=read_locator_records(LOCATOR_INDEX_PATH),
        locator_index_path=LOCATOR_INDEX_PATH,
        locator_manifest_path=LOCATOR_MANIFEST_PATH,
    )
    candidates, noise_count = independent_candidates(report)
    families, details = audit_candidates(candidates, sidecar)
    payload = {
        "compilation": sidecar.manifest.get("compilation"),
        "canonical_provision_count": sidecar.manifest.get("canonical_provision_count"),
        "structural_noise_excluded": noise_count,
        "candidate_count": len(candidates),
        "families": families,
        "non_preserved_examples": details,
    }
    REPORT_JSON.write_text(json.dumps(payload, ensure_ascii=False, sort_keys=True, indent=2) + "\n", encoding="utf-8")
    REPORT_TEXT.write_text(render_text(payload), encoding="utf-8")
    print(json.dumps(payload, ensure_ascii=False, sort_keys=True, indent=2))
    return 1 if any(result["missed_count"] for result in families.values()) else 0


if __name__ == "__main__":
    raise SystemExit(main())
