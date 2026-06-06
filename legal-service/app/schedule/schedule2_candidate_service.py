from __future__ import annotations

import re
from collections import defaultdict
from typing import Any

from app.schedule.schedule2_index_service import ScheduleIndexService
from app.schedule.schemas import ScheduleCandidate, ScheduleClause

SUBCLASS_RE = re.compile(r"\b(?:subclass\s*)?([0-9A-Z]{3,4})\b", re.I)

# Keep aliases generic and auditable. These are not legal conclusions; they only
# map common customer language to Schedule 2 candidate subclasses.
VISA_ALIAS_MAP: dict[str, tuple[str, ...]] = {
    "student visa": ("500",),
    "student 500": ("500",),
    "subclass 500": ("500",),
    "学生签证": ("500",),
    "学生签": ("500",),
    "temporary graduate": ("485",),
    "graduate visa": ("485",),
    "485": ("485",),
    "毕业生签证": ("485",),
    "partner visa": ("820", "801", "309", "100"),
    "partner 820": ("820",),
    "subclass 820": ("820",),
    "820": ("820",),
    "配偶签": ("820", "801", "309", "100"),
    "伴侣签": ("820", "801", "309", "100"),
    "bridging visa a": ("010",),
    "bva": ("010",),
    "过桥签证 a": ("010",),
    "bridging visa b": ("020",),
    "bvb": ("020",),
    "travel on a bridging visa": ("020", "010"),
    "bridging travel": ("020", "010"),
    "visitor visa": ("600",),
    "tourist visa": ("600",),
    "旅游签": ("600",),
    "visitor 600": ("600",),
}

TRAVEL_TERMS = ("travel", "leave australia", "re-enter", "return to australia", "回国", "出境", "回澳", "回来")
REFUSAL_TERMS = ("refused", "refusal", "拒签", "review", "art", "复审", "上诉")
CONDITION_TERMS = ("condition", "8503", "8501", "8105", "8202", "签证条件")


class Schedule2CandidateSearchService:
    """Schedule 2 candidate search before legal reasoning.

    This service deliberately avoids deciding eligibility. It only returns ranked
    Schedule 2 regions that should anchor the downstream inference tree.
    """

    def __init__(self, *, index_service: ScheduleIndexService | None = None) -> None:
        self.index_service = index_service or ScheduleIndexService()

    def search(self, *, question: str, known_facts: dict[str, Any] | None = None, limit: int = 6) -> list[ScheduleCandidate]:
        facts = dict(known_facts or {})
        q_raw = question or ""
        q = q_raw.lower()
        candidates: dict[str, ScheduleCandidate] = {}

        def add(subclass: str, *, score: float, match_type: str, reason: str, clauses: list[str] | None = None) -> None:
            subclass = str(subclass or "").strip().upper()
            if not subclass:
                return
            title = self._title_for(subclass)
            existing = candidates.get(subclass)
            deferred = self._deferred_for(subclass)
            if existing is None or score > existing.score:
                candidates[subclass] = ScheduleCandidate(
                    subclass=subclass,
                    title=title,
                    confidence=self._confidence(score),
                    match_type=match_type,  # type: ignore[arg-type]
                    matched_clauses=clauses or self._representative_clause_refs(subclass),
                    reason=reason,
                    score=score,
                    deferred_dependencies=deferred,
                )
            elif existing is not None:
                existing.score += score * 0.1
                for clause in clauses or []:
                    if clause not in existing.matched_clauses:
                        existing.matched_clauses.append(clause)

        # 1. Explicit facts from semantic/state layer.
        for key in ("visa_subclass", "target_visa_subclass"):
            value = str(facts.get(key) or "").strip()
            if value:
                for sub in self._extract_subclasses(value):
                    add(sub, score=95, match_type="exact_subclass", reason=f"Explicit {key}={value}")

        current_visa = str(facts.get("current_visa") or facts.get("bridging_status") or "").lower()
        if current_visa:
            for alias, subclasses in VISA_ALIAS_MAP.items():
                if alias in current_visa:
                    for sub in subclasses:
                        add(sub, score=80, match_type="alias", reason=f"Current visa/status matched alias '{alias}'")

        # 2. Exact subclass mentions in the message.
        for sub in self._extract_subclasses(q_raw):
            add(sub, score=90, match_type="exact_subclass", reason=f"User mentioned subclass {sub}")

        # 3. Alias match.
        for alias, subclasses in VISA_ALIAS_MAP.items():
            if alias in q:
                for rank, sub in enumerate(subclasses):
                    add(sub, score=75 - rank * 8, match_type="alias", reason=f"User wording matched alias '{alias}'")

        # 4. Cross-subclass travel logic: BVA + leave/re-enter should activate BVB too.
        if any(term in q for term in TRAVEL_TERMS):
            if "bva" in q or "bridging visa a" in q or "010" in q or "bridging" in q:
                add("020", score=88, match_type="clause_keyword", reason="Travel/re-entry while on bridging status points to Bridging B travel criteria")
                add("010", score=72, match_type="clause_keyword", reason="Current Bridging A status remains relevant")

        # 5. Refusal review keeps original subclass plus review dependency.
        if any(term in q for term in REFUSAL_TERMS):
            if "student" in q or "学生" in q or "500" in q:
                add("500", score=85, match_type="clause_keyword", reason="Student visa refusal should map back to Subclass 500 grant criteria")
            if "485" in q or "temporary graduate" in q:
                add("485", score=85, match_type="clause_keyword", reason="Temporary Graduate refusal should map back to Subclass 485 grant criteria")

        # 6. Clause keyword fallback over the Schedule 2 index.
        if len(candidates) < 2:
            for sub, score, refs in self._rough_text_search(q, facts).items():
                add(sub, score=score, match_type="semantic", reason="Rough text match against Schedule 2 clause index", clauses=refs)

        ranked = sorted(candidates.values(), key=lambda item: item.score, reverse=True)
        return ranked[:limit]

    def _extract_subclasses(self, text: str) -> list[str]:
        out: list[str] = []
        for match in SUBCLASS_RE.finditer(text or ""):
            sub = match.group(1).upper()
            if sub.isdigit() and 3 <= len(sub) <= 4 and sub not in out:
                out.append(sub)
        return out

    def _title_for(self, subclass: str) -> str | None:
        titles = self.index_service.top_titles(subclass, schedule_no="2")
        return titles[0] if titles else None

    def _representative_clause_refs(self, subclass: str) -> list[str]:
        refs: list[str] = []
        for clause in self.index_service.clauses_for_subclass(subclass, schedule_no="2")[:8]:
            if clause.clause_ref not in refs:
                refs.append(clause.clause_ref)
        return refs

    def _deferred_for(self, subclass: str) -> list[str]:
        deps: set[str] = set()
        for clause in self.index_service.clauses_for_subclass(subclass, schedule_no="2")[:30]:
            deps.update(clause.deferred_dependencies)
        return sorted(deps)

    def _rough_text_search(self, query: str, facts: dict[str, Any]) -> dict[str, tuple[float, list[str]]]:
        tokens = [tok for tok in re.findall(r"[a-z0-9]{3,}|[\u4e00-\u9fff]{2,}", query.lower()) if tok not in {"visa", "the", "and", "for", "can"}]
        if not tokens:
            return {}
        scores: dict[str, float] = defaultdict(float)
        refs: dict[str, list[str]] = defaultdict(list)
        for clause in self.index_service.schedule2_clauses():
            sub = str(clause.subclass or "").upper()
            if not sub:
                continue
            blob = " ".join([clause.title or "", clause.heading or "", clause.text[:1600]]).lower()
            hit_count = sum(1 for tok in tokens if tok in blob)
            if hit_count <= 0:
                continue
            scores[sub] += hit_count
            if clause.clause_ref not in refs[sub]:
                refs[sub].append(clause.clause_ref)
        return {sub: (score, refs[sub][:8]) for sub, score in scores.items() if score >= 2}

    def _confidence(self, score: float) -> str:
        if score >= 80:
            return "high"
        if score >= 45:
            return "medium"
        return "low"
