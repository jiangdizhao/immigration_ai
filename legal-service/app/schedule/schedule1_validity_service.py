from __future__ import annotations

from typing import Any

from app.schedule.schedule2_index_service import ScheduleIndexService
from app.schedule.schemas import ScheduleClause


class Schedule1ValidityService:
    """Lightweight Schedule 1 validity lookup.

    Schedule 2 remains the main inference surface. Schedule 1 is consulted when
    application validity/lodgement is relevant.
    """

    def __init__(self, *, index_service: ScheduleIndexService | None = None) -> None:
        self.index_service = index_service or ScheduleIndexService()

    def lookup_for_subclass(self, subclass: str, *, known_facts: dict[str, Any] | None = None) -> list[ScheduleClause]:
        subclass = str(subclass or "").strip().upper()
        if not subclass:
            return []
        direct = self.index_service.clauses_for_subclass(subclass, schedule_no="1")
        if direct:
            return direct

        # Fallback: Schedule 1 items often list subclasses inside text without a
        # single subclass field.
        out: list[ScheduleClause] = []
        token = f"Subclass {subclass}".lower()
        for clause in self.index_service.schedule1_clauses():
            if token in (clause.text or "").lower():
                out.append(clause)
        return out[:8]
