from __future__ import annotations

import hashlib
import json
import re
from collections import Counter, defaultdict
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Iterable, Mapping, Sequence

from app.legal_locator.index import DEFAULT_INDEX_PATH as DEFAULT_LOCATOR_INDEX_PATH
from app.legal_locator.index import LegalLocatorRecord
from app.schedule.schedule2_index_service import SCHEDULE2_INDEX_PATH
from app.schedule.schemas import ScheduleClause
from app.services.cross_reference_parser import extract_cross_references

ROOT_DIR = Path(__file__).resolve().parents[2]
PROCESSED_DIR = ROOT_DIR / "data" / "processed" / "legal_map" / "schedule2"
DEFAULT_NODES_PATH = PROCESSED_DIR / "schedule2_nodes.jsonl"
DEFAULT_EDGES_PATH = PROCESSED_DIR / "schedule2_edges.jsonl"
DEFAULT_MANIFEST_PATH = PROCESSED_DIR / "schedule2_manifest.json"

SCHEMA_VERSION = 1
GRAPH_KIND = "schedule2_navigation"
ALLOWED_RELATIONS = {
    "CONTAINS",
    "NEXT_CLAUSE",
    "PREVIOUS_CLAUSE",
    "REFERENCES",
    "REFERENCES_SCHEDULE",
    "REFERENCES_REGULATION",
    "REFERENCES_ACT",
    "REFERENCES_INSTRUMENT",
    "REFERENCES_PIC",
    "REFERENCES_CONDITION",
    "REFERENCES_SCHEDULE3_CRITERION",
}

PIC_RE = re.compile(
    r"\b(?:Public\s+Interest\s+Criterion|PIC)\s+(4\d{3}[A-Z]?)\b",
    re.IGNORECASE,
)
CONDITION_RE = re.compile(
    r"\b(?:visa\s+)?condition\s+(8\d{3}[A-Z]?)\b",
    re.IGNORECASE,
)
SCHEDULE3_CRITERION_RE = re.compile(
    r"\bSchedule\s+3\s+(?:criterion|clause)\s+(3\d{3}[A-Z]?)\b",
    re.IGNORECASE,
)
COMPILATION_RE = re.compile(r"\b(F\d{4}[A-Z]\d{3,6})\b", re.IGNORECASE)


@dataclass(slots=True)
class GraphNode:
    id: str
    node_type: str
    label: str
    subclass: str | None = None
    provision_ref: str | None = None
    section_kind: str | None = None
    title: str | None = None
    locator_type: str | None = None
    locator: str | None = None
    local_available: bool | None = None
    occurrence_count: int | None = None
    occurrences: list[dict] = field(default_factory=list)

    def to_dict(self) -> dict:
        payload = asdict(self)
        return {key: value for key, value in payload.items() if value not in (None, [], "")}

    @classmethod
    def from_dict(cls, payload: Mapping[str, object]) -> "GraphNode":
        return cls(
            id=str(payload["id"]),
            node_type=str(payload["node_type"]),
            label=str(payload.get("label") or payload["id"]),
            subclass=str(payload["subclass"]) if payload.get("subclass") is not None else None,
            provision_ref=(
                str(payload["provision_ref"])
                if payload.get("provision_ref") is not None
                else None
            ),
            section_kind=(
                str(payload["section_kind"])
                if payload.get("section_kind") is not None
                else None
            ),
            title=str(payload["title"]) if payload.get("title") is not None else None,
            locator_type=(
                str(payload["locator_type"])
                if payload.get("locator_type") is not None
                else None
            ),
            locator=str(payload["locator"]) if payload.get("locator") is not None else None,
            local_available=(
                bool(payload["local_available"])
                if payload.get("local_available") is not None
                else None
            ),
            occurrence_count=(
                int(payload["occurrence_count"])
                if payload.get("occurrence_count") is not None
                else None
            ),
            occurrences=[dict(item) for item in payload.get("occurrences", [])],
        )


@dataclass(slots=True)
class GraphEdge:
    id: str
    source: str
    relation: str
    target: str
    surface_form: str | None = None

    def to_dict(self) -> dict:
        payload = asdict(self)
        return {key: value for key, value in payload.items() if value not in (None, "")}

    @classmethod
    def from_dict(cls, payload: Mapping[str, object]) -> "GraphEdge":
        return cls(
            id=str(payload["id"]),
            source=str(payload["source"]),
            relation=str(payload["relation"]),
            target=str(payload["target"]),
            surface_form=(
                str(payload["surface_form"])
                if payload.get("surface_form") is not None
                else None
            ),
        )


@dataclass(slots=True)
class Schedule2Graph:
    nodes: list[GraphNode]
    edges: list[GraphEdge]
    manifest: dict


def _sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8", errors="ignore")).hexdigest()


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _json_line(payload: Mapping[str, object]) -> str:
    return json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def read_schedule2_rows(path: Path = SCHEDULE2_INDEX_PATH) -> list[ScheduleClause]:
    rows: list[ScheduleClause] = []
    with Path(path).open("r", encoding="utf-8") as handle:
        for line_no, raw in enumerate(handle, start=1):
            raw = raw.strip()
            if not raw:
                continue
            try:
                row = ScheduleClause.model_validate(json.loads(raw))
            except Exception as exc:
                raise ValueError(f"invalid Schedule 2 index row at line {line_no}: {exc}") from exc
            if row.schedule_no != "2":
                raise ValueError(f"non-Schedule-2 row at line {line_no}: {row.schedule_no}")
            rows.append(row)
    return rows


def read_locator_records(path: Path = DEFAULT_LOCATOR_INDEX_PATH) -> list[LegalLocatorRecord]:
    if not Path(path).exists():
        return []
    records: list[LegalLocatorRecord] = []
    with Path(path).open("r", encoding="utf-8") as handle:
        for line_no, raw in enumerate(handle, start=1):
            raw = raw.strip()
            if not raw:
                continue
            try:
                records.append(LegalLocatorRecord.from_dict(json.loads(raw)))
            except Exception as exc:
                raise ValueError(f"invalid legal locator row at line {line_no}: {exc}") from exc
    return records


def _natural_ref_key(value: str) -> tuple:
    parts = re.split(r"(\d+)", value.upper())
    return tuple(int(part) if part.isdigit() else part for part in parts)


def _occurrence_key(row: ScheduleClause) -> tuple:
    return (
        row.source_file or "",
        row.start_index if row.start_index is not None else -1,
        row.end_index if row.end_index is not None else -1,
        _sha256_text(row.text or ""),
    )


def _occurrence_payload(row: ScheduleClause) -> dict:
    payload = {
        "source_file": row.source_file,
        "source_title": row.source_title,
        "start_index": row.start_index,
        "end_index": row.end_index,
        "text_sha256": _sha256_text(row.text or ""),
    }
    return {key: value for key, value in payload.items() if value not in (None, "")}


def _locator_lookup(records: Sequence[LegalLocatorRecord]) -> tuple[dict[tuple[str, str], LegalLocatorRecord], set[str]]:
    exact: dict[tuple[str, str], LegalLocatorRecord] = {}
    schedules: set[str] = set()
    for record in records:
        exact[(record.locator_type, record.provision_ref.upper())] = record
        if record.schedule_no:
            schedules.add(record.schedule_no.upper())
    return exact, schedules


def _external_node(
    *,
    locator_type: str,
    provision_ref: str,
    locator: str,
    exact_locators: Mapping[tuple[str, str], LegalLocatorRecord],
    locally_indexed_schedules: set[str],
) -> GraphNode:
    normalized_ref = provision_ref.upper()
    lookup_type = locator_type
    lookup_ref = normalized_ref

    if locator_type == "subregulation":
        lookup_type = "regulation"
        lookup_ref = re.sub(r"\([^)]*\)$", "", normalized_ref)

    if locator_type == "schedule":
        local_available = normalized_ref in locally_indexed_schedules
    else:
        local_available = (lookup_type, lookup_ref) in exact_locators

    safe_type = locator_type.replace("_", "-")
    node_id = f"external:{safe_type}:{normalized_ref}"
    return GraphNode(
        id=node_id,
        node_type="external_locator",
        label=locator,
        provision_ref=normalized_ref,
        locator_type=locator_type,
        locator=locator,
        local_available=local_available,
    )


def _relation_for(locator_type: str) -> str:
    if locator_type in {"regulation", "subregulation"}:
        return "REFERENCES_REGULATION"
    if locator_type in {"section", "subsection", "act"}:
        return "REFERENCES_ACT"
    if locator_type == "schedule":
        return "REFERENCES_SCHEDULE"
    if locator_type == "instrument":
        return "REFERENCES_INSTRUMENT"
    if locator_type == "schedule4_pic":
        return "REFERENCES_PIC"
    if locator_type == "schedule8_condition":
        return "REFERENCES_CONDITION"
    if locator_type == "schedule3_criterion":
        return "REFERENCES_SCHEDULE3_CRITERION"
    return "REFERENCES"


def _explicit_special_references(text: str) -> list[tuple[str, str, str]]:
    refs: list[tuple[str, str, str]] = []
    for match in PIC_RE.finditer(text or ""):
        provision = match.group(1).upper()
        refs.append(("schedule4_pic", provision, match.group(0)))
    for match in CONDITION_RE.finditer(text or ""):
        provision = match.group(1).upper()
        refs.append(("schedule8_condition", provision, match.group(0)))
    for match in SCHEDULE3_CRITERION_RE.finditer(text or ""):
        provision = match.group(1).upper()
        refs.append(("schedule3_criterion", provision, match.group(0)))
    return refs


def _cross_references(text: str) -> list[tuple[str, str, str]]:
    refs: list[tuple[str, str, str]] = []
    for extracted in extract_cross_references(text or ""):
        locator = extracted.locator
        provision = (locator.target_provision or "").upper()
        if locator.locator_type == "schedule" and provision == "2":
            continue
        if locator.locator_type == "act":
            provision = "MIGRATION_ACT_1958"
        if not provision:
            continue
        refs.append((locator.locator_type, provision, locator.surface_form))
    refs.extend(_explicit_special_references(text or ""))

    dedup: dict[tuple[str, str], tuple[str, str, str]] = {}
    for item in refs:
        key = (item[0], item[1])
        dedup.setdefault(key, item)
    return [dedup[key] for key in sorted(dedup)]


def _edge_id(source: str, relation: str, target: str) -> str:
    digest = _sha256_text(f"{source}\0{relation}\0{target}")[:20]
    return f"edge:{digest}"


def _detect_compilations(rows: Sequence[ScheduleClause]) -> list[str]:
    values: set[str] = set()
    for row in rows:
        blob = f"{row.source_file} {row.source_title or ''}"
        for match in COMPILATION_RE.finditer(blob):
            values.add(match.group(1).upper())
    return sorted(values)


def build_schedule2_graph(
    rows: Sequence[ScheduleClause],
    *,
    locator_records: Sequence[LegalLocatorRecord] = (),
    compilation_number: str | None = None,
    input_sha256: str | None = None,
    locator_index_sha256: str | None = None,
) -> Schedule2Graph:
    if not rows:
        raise ValueError("Schedule 2 index is empty")
    if any(row.schedule_no != "2" for row in rows):
        raise ValueError("graph input contains a non-Schedule-2 row")

    grouped: dict[str, list[ScheduleClause]] = defaultdict(list)
    for row in rows:
        grouped[row.clause_ref.strip().upper()].append(row)

    exact_locators, locally_indexed_schedules = _locator_lookup(locator_records)
    nodes: dict[str, GraphNode] = {}
    edge_candidates: dict[tuple[str, str, str], GraphEdge] = {}
    clause_ids_by_subclass: dict[str, list[tuple[str, str]]] = defaultdict(list)

    for clause_ref in sorted(grouped, key=_natural_ref_key):
        occurrences = sorted(grouped[clause_ref], key=_occurrence_key)
        subclasses = sorted({(row.subclass or clause_ref.split(".", 1)[0]).upper() for row in occurrences})
        if len(subclasses) != 1:
            raise ValueError(f"conflicting subclasses for {clause_ref}: {subclasses}")
        subclass = subclasses[0]
        primary = occurrences[0]

        subclass_id = f"s2:subclass:{subclass}"
        if subclass_id not in nodes:
            titles = sorted({row.title for row in rows if row.subclass == subclass and row.title})
            nodes[subclass_id] = GraphNode(
                id=subclass_id,
                node_type="subclass",
                label=f"Subclass {subclass}" + (f" — {titles[0]}" if titles else ""),
                subclass=subclass,
                title=titles[0] if titles else None,
            )

        clause_id = f"s2:clause:{clause_ref}"
        section_kinds = sorted({row.section_kind for row in occurrences if row.section_kind})
        headings = sorted({row.heading for row in occurrences if row.heading})
        nodes[clause_id] = GraphNode(
            id=clause_id,
            node_type="clause",
            label=clause_ref + (f" — {headings[0]}" if headings else ""),
            subclass=subclass,
            provision_ref=clause_ref,
            section_kind=section_kinds[0] if len(section_kinds) == 1 else "other",
            title=primary.title,
            occurrence_count=len(occurrences),
            occurrences=[_occurrence_payload(row) for row in occurrences],
        )
        clause_ids_by_subclass[subclass].append((clause_ref, clause_id))

        contains_key = (subclass_id, "CONTAINS", clause_id)
        edge_candidates[contains_key] = GraphEdge(
            id=_edge_id(*contains_key),
            source=subclass_id,
            relation="CONTAINS",
            target=clause_id,
        )

        all_refs: dict[tuple[str, str], tuple[str, str, str]] = {}
        for occurrence in occurrences:
            for locator_type, provision_ref, surface_form in _cross_references(occurrence.text):
                all_refs.setdefault(
                    (locator_type, provision_ref),
                    (locator_type, provision_ref, surface_form),
                )

        for locator_type, provision_ref, surface_form in all_refs.values():
            locator = surface_form
            external = _external_node(
                locator_type=locator_type,
                provision_ref=provision_ref,
                locator=locator,
                exact_locators=exact_locators,
                locally_indexed_schedules=locally_indexed_schedules,
            )
            nodes.setdefault(external.id, external)
            relation = _relation_for(locator_type)
            key = (clause_id, relation, external.id)
            edge_candidates[key] = GraphEdge(
                id=_edge_id(*key),
                source=clause_id,
                relation=relation,
                target=external.id,
                surface_form=surface_form,
            )

    for subclass, refs in clause_ids_by_subclass.items():
        ordered = sorted(refs, key=lambda pair: _natural_ref_key(pair[0]))
        for idx in range(len(ordered) - 1):
            current_id = ordered[idx][1]
            next_id = ordered[idx + 1][1]
            next_key = (current_id, "NEXT_CLAUSE", next_id)
            prev_key = (next_id, "PREVIOUS_CLAUSE", current_id)
            edge_candidates[next_key] = GraphEdge(
                id=_edge_id(*next_key),
                source=current_id,
                relation="NEXT_CLAUSE",
                target=next_id,
            )
            edge_candidates[prev_key] = GraphEdge(
                id=_edge_id(*prev_key),
                source=next_id,
                relation="PREVIOUS_CLAUSE",
                target=current_id,
            )

    node_list = sorted(nodes.values(), key=lambda node: node.id)
    edge_list = sorted(
        edge_candidates.values(),
        key=lambda edge: (edge.source, edge.relation, edge.target),
    )

    compilations = _detect_compilations(rows)
    if compilation_number:
        expected = compilation_number.upper()
        if compilations and expected not in compilations:
            raise ValueError(
                f"requested compilation {expected} not present in Schedule 2 input: {compilations}"
            )
        compilations = [expected]

    node_type_counts = Counter(node.node_type for node in node_list)
    relation_counts = Counter(edge.relation for edge in edge_list)
    unresolved_external = sum(
        1
        for node in node_list
        if node.node_type == "external_locator" and node.local_available is False
    )

    manifest = {
        "schema_version": SCHEMA_VERSION,
        "graph_kind": GRAPH_KIND,
        "schedule_no": "2",
        "compilations": compilations,
        "input_rows": len(rows),
        "unique_clause_refs": len(grouped),
        "node_count": len(node_list),
        "edge_count": len(edge_list),
        "node_type_counts": dict(sorted(node_type_counts.items())),
        "relation_counts": dict(sorted(relation_counts.items())),
        "unresolved_external_nodes": unresolved_external,
        "input_sha256": input_sha256,
        "locator_index_sha256": locator_index_sha256,
    }
    manifest = {key: value for key, value in manifest.items() if value is not None}

    return Schedule2Graph(nodes=node_list, edges=edge_list, manifest=manifest)


def build_schedule2_graph_from_files(
    *,
    schedule2_path: Path = SCHEDULE2_INDEX_PATH,
    locator_index_path: Path = DEFAULT_LOCATOR_INDEX_PATH,
    compilation_number: str | None = None,
) -> Schedule2Graph:
    schedule2_path = Path(schedule2_path)
    locator_index_path = Path(locator_index_path)
    rows = read_schedule2_rows(schedule2_path)
    locator_records = read_locator_records(locator_index_path)
    return build_schedule2_graph(
        rows,
        locator_records=locator_records,
        compilation_number=compilation_number,
        input_sha256=_sha256_file(schedule2_path),
        locator_index_sha256=(
            _sha256_file(locator_index_path) if locator_index_path.exists() else None
        ),
    )


def validate_graph(
    graph: Schedule2Graph,
    *,
    expected_unique_clause_refs: int | None = None,
) -> list[str]:
    errors: list[str] = []
    node_ids = [node.id for node in graph.nodes]
    edge_ids = [edge.id for edge in graph.edges]
    node_by_id = {node.id: node for node in graph.nodes}

    if len(node_ids) != len(set(node_ids)):
        errors.append("duplicate node ids")
    if len(edge_ids) != len(set(edge_ids)):
        errors.append("duplicate edge ids")

    edge_keys: set[tuple[str, str, str]] = set()
    contains_targets: Counter[str] = Counter()
    for edge in graph.edges:
        if edge.relation not in ALLOWED_RELATIONS:
            errors.append(f"unsupported relation: {edge.relation}")
        if edge.source not in node_by_id:
            errors.append(f"dangling edge source: {edge.id}:{edge.source}")
        if edge.target not in node_by_id:
            errors.append(f"dangling edge target: {edge.id}:{edge.target}")
        key = (edge.source, edge.relation, edge.target)
        if key in edge_keys:
            errors.append(f"duplicate edge triple: {key}")
        edge_keys.add(key)
        if edge.relation == "CONTAINS":
            contains_targets[edge.target] += 1

    clause_nodes = [node for node in graph.nodes if node.node_type == "clause"]
    for node in clause_nodes:
        if contains_targets[node.id] != 1:
            errors.append(f"clause must have exactly one CONTAINS parent: {node.id}")
        if not node.provision_ref or not node.subclass:
            errors.append(f"clause missing identity fields: {node.id}")
        if not node.occurrences or node.occurrence_count != len(node.occurrences):
            errors.append(f"clause occurrence metadata mismatch: {node.id}")

    for node in graph.nodes:
        if node.node_type == "external_locator":
            if not node.locator_type or not node.provision_ref:
                errors.append(f"external locator missing identity: {node.id}")
            if node.local_available is None:
                errors.append(f"external locator missing availability flag: {node.id}")

    if expected_unique_clause_refs is not None and len(clause_nodes) != expected_unique_clause_refs:
        errors.append(
            f"unique clause count mismatch: expected {expected_unique_clause_refs}, got {len(clause_nodes)}"
        )

    expected_manifest_counts = {
        "node_count": len(graph.nodes),
        "edge_count": len(graph.edges),
        "unique_clause_refs": len(clause_nodes),
    }
    for field_name, expected in expected_manifest_counts.items():
        if graph.manifest.get(field_name) != expected:
            errors.append(
                f"manifest {field_name} mismatch: {graph.manifest.get(field_name)} != {expected}"
            )

    return errors


def _atomic_write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(text, encoding="utf-8")
    tmp.replace(path)


def write_graph(
    graph: Schedule2Graph,
    *,
    nodes_path: Path = DEFAULT_NODES_PATH,
    edges_path: Path = DEFAULT_EDGES_PATH,
    manifest_path: Path = DEFAULT_MANIFEST_PATH,
) -> None:
    node_text = "".join(_json_line(node.to_dict()) + "\n" for node in graph.nodes)
    edge_text = "".join(_json_line(edge.to_dict()) + "\n" for edge in graph.edges)
    manifest_text = json.dumps(graph.manifest, ensure_ascii=False, sort_keys=True, indent=2) + "\n"
    _atomic_write(Path(nodes_path), node_text)
    _atomic_write(Path(edges_path), edge_text)
    _atomic_write(Path(manifest_path), manifest_text)


def load_graph(
    *,
    nodes_path: Path = DEFAULT_NODES_PATH,
    edges_path: Path = DEFAULT_EDGES_PATH,
    manifest_path: Path = DEFAULT_MANIFEST_PATH,
) -> Schedule2Graph:
    nodes = [
        GraphNode.from_dict(json.loads(line))
        for line in Path(nodes_path).read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    edges = [
        GraphEdge.from_dict(json.loads(line))
        for line in Path(edges_path).read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    manifest = json.loads(Path(manifest_path).read_text(encoding="utf-8"))
    return Schedule2Graph(nodes=nodes, edges=edges, manifest=manifest)


class Schedule2LegalMap:
    """Small read-only query facade over an already-built Schedule 2 graph.

    This class is intentionally not registered as an agent tool. It exists for
    offline validation/evaluation before any separately approved serving-path
    integration.
    """

    def __init__(self, graph: Schedule2Graph) -> None:
        self.graph = graph
        self._nodes = {node.id: node for node in graph.nodes}
        self._outgoing: dict[str, list[GraphEdge]] = defaultdict(list)
        self._incoming: dict[str, list[GraphEdge]] = defaultdict(list)
        for edge in graph.edges:
            self._outgoing[edge.source].append(edge)
            self._incoming[edge.target].append(edge)

    @classmethod
    def from_files(
        cls,
        *,
        nodes_path: Path = DEFAULT_NODES_PATH,
        edges_path: Path = DEFAULT_EDGES_PATH,
        manifest_path: Path = DEFAULT_MANIFEST_PATH,
    ) -> "Schedule2LegalMap":
        return cls(
            load_graph(
                nodes_path=nodes_path,
                edges_path=edges_path,
                manifest_path=manifest_path,
            )
        )

    def follow_references(self, provision_ref: str, *, max_targets: int = 20) -> dict:
        clause_id = f"s2:clause:{provision_ref.strip().upper()}"
        node = self._nodes.get(clause_id)
        if node is None:
            return {"provision_ref": provision_ref, "found": False, "targets": []}
        edges = [edge for edge in self._outgoing[clause_id] if edge.relation.startswith("REFERENCES")]
        edges = edges[: max(0, max_targets)]
        return {
            "provision_ref": node.provision_ref,
            "found": True,
            "targets": [
                {
                    "relation": edge.relation,
                    "node": self._nodes[edge.target].to_dict(),
                    "surface_form": edge.surface_form,
                }
                for edge in edges
            ],
        }

    def provision_context(self, provision_ref: str, *, max_edges: int = 30) -> dict:
        clause_id = f"s2:clause:{provision_ref.strip().upper()}"
        node = self._nodes.get(clause_id)
        if node is None:
            return {"provision_ref": provision_ref, "found": False, "nodes": [], "edges": []}

        related = (self._outgoing[clause_id] + self._incoming[clause_id])[: max(0, max_edges)]
        node_ids = {clause_id}
        for edge in related:
            node_ids.add(edge.source)
            node_ids.add(edge.target)
        return {
            "provision_ref": node.provision_ref,
            "found": True,
            "nodes": [self._nodes[node_id].to_dict() for node_id in sorted(node_ids)],
            "edges": [edge.to_dict() for edge in related],
        }

    def subclass_map(
        self,
        subclass: str,
        *,
        max_clauses: int = 80,
        max_external: int = 80,
    ) -> dict:
        subclass_id = f"s2:subclass:{subclass.strip().upper()}"
        subclass_node = self._nodes.get(subclass_id)
        if subclass_node is None:
            return {"subclass": subclass, "found": False, "nodes": [], "edges": []}

        contains = [edge for edge in self._outgoing[subclass_id] if edge.relation == "CONTAINS"]
        contains = contains[: max(0, max_clauses)]
        clause_ids = [edge.target for edge in contains]
        reference_edges: list[GraphEdge] = []
        for clause_id in clause_ids:
            reference_edges.extend(
                edge
                for edge in self._outgoing[clause_id]
                if edge.relation.startswith("REFERENCES")
            )
        reference_edges = reference_edges[: max(0, max_external)]

        selected_edges = contains + reference_edges
        node_ids = {subclass_id, *clause_ids}
        for edge in reference_edges:
            node_ids.add(edge.target)
        return {
            "subclass": subclass_node.subclass,
            "found": True,
            "nodes": [self._nodes[node_id].to_dict() for node_id in sorted(node_ids)],
            "edges": [edge.to_dict() for edge in selected_edges],
        }
