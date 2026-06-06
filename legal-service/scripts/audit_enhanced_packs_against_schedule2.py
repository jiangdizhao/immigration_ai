from __future__ import annotations

import re
from typing import Iterable

from app.schedule.schedule2_index_service import ScheduleIndexService
from app.services.subclass_485_criterion_pack import Subclass485CriterionPack
from app.services.subclass_500_criterion_pack import Subclass500CriterionPack

CLAUSE_REF_RE = re.compile(r"\b([0-9A-Z]{3,4}\.[0-9A-Z]{2,}(?:\([^)]+\))?)\b")


def refs_from_basis(items: Iterable[str]) -> list[str]:
    refs: list[str] = []
    for item in items:
        for ref in CLAUSE_REF_RE.findall(str(item or "")):
            if ref not in refs:
                refs.append(ref)
    return refs


def audit_pack(name: str, pack, index: ScheduleIndexService) -> tuple[int, int]:
    known_refs = {clause.clause_ref for clause in index.clauses_for_subclass(pack.subclass, schedule_no="2")}
    checked = 0
    missing = 0
    print(f"\n== {name} / subclass {pack.subclass} ==")
    for node_id, node in pack.nodes.items():
        refs = refs_from_basis(node.legal_basis)
        if not refs:
            print(f"[WARN] {node_id}: no explicit Schedule 2 clause ref in legal_basis={node.legal_basis}")
            continue
        for ref in refs:
            checked += 1
            if ref not in known_refs:
                missing += 1
                print(f"[MISS] {node_id}: {ref} not found in Schedule 2 index")
            else:
                print(f"[ OK ] {node_id}: {ref}")
    return checked, missing


def main() -> None:
    index = ScheduleIndexService()
    total_checked = 0
    total_missing = 0
    for name, pack in [
        ("Subclass485CriterionPack", Subclass485CriterionPack()),
        ("Subclass500CriterionPack", Subclass500CriterionPack()),
    ]:
        checked, missing = audit_pack(name, pack, index)
        total_checked += checked
        total_missing += missing
    print("\nAudit summary")
    print(f"  checked_clause_refs={total_checked}")
    print(f"  missing_clause_refs={total_missing}")
    if total_missing:
        print("  ACTION: inspect missing refs. The pack may be using outdated/loose legal_basis strings or the Schedule 2 index may be incomplete.")


if __name__ == "__main__":
    main()
