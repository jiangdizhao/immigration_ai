from __future__ import annotations

from typing import Any

from app.schedule.generic_schedule2_pack import GenericSchedule2CriterionPack
from app.schedule.schedule2_index_service import ScheduleIndexService
from app.schedule.schemas import ScheduleCandidate
from app.services.legal_reasoning_kernel import LegalReasoningKernel
from app.services.subclass_485_criterion_pack import Subclass485CriterionPack
from app.services.subclass_500_criterion_pack import Subclass500CriterionPack


class CriterionPackResolver:
    """Select enhanced 485/500 packs or a generic Schedule 2 pack.

    Existing manually curated 485/500 packs are not discarded. They are preferred
    when Schedule 2 candidate search identifies those subclasses or when their
    existing relevance checks trigger.
    """

    def __init__(
        self,
        *,
        index_service: ScheduleIndexService | None = None,
        subclass_485_pack: Subclass485CriterionPack | None = None,
        subclass_500_pack: Subclass500CriterionPack | None = None,
        kernel: LegalReasoningKernel | None = None,
    ) -> None:
        self.index_service = index_service or ScheduleIndexService()
        self.subclass_485_pack = subclass_485_pack or Subclass485CriterionPack()
        self.subclass_500_pack = subclass_500_pack or Subclass500CriterionPack()
        self.kernel = kernel or LegalReasoningKernel()

    def resolve(
        self,
        *,
        candidates: list[ScheduleCandidate],
        question: str,
        known_facts: dict[str, Any],
        visa_type: str | None = None,
    ) -> tuple[Any | None, str | None, dict[str, Any]]:
        facts = dict(known_facts or {})
        q = question or ""
        top = candidates[0] if candidates else None

        candidate_subclasses = {candidate.subclass for candidate in candidates}

        # Enhanced packs are preferred, but only when their legal target is active.
        if "485" in candidate_subclasses or self.subclass_485_pack.is_relevant(question=q, facts=facts, visa_type=visa_type):
            return self.subclass_485_pack, "485", {"strategy": "enhanced_pack", "reason": "subclass_485_candidate_or_relevance"}

        if "500" in candidate_subclasses or self.subclass_500_pack.is_relevant(question=q, facts=facts, visa_type=visa_type):
            return self.subclass_500_pack, "500", {"strategy": "enhanced_pack", "reason": "subclass_500_candidate_or_relevance"}

        if top:
            clauses = self.index_service.clauses_for_subclass(top.subclass, schedule_no="2")
            if clauses:
                return (
                    GenericSchedule2CriterionPack(candidate=top, clauses=clauses, kernel=self.kernel),
                    top.subclass,
                    {"strategy": "generic_schedule2_pack", "reason": "no_enhanced_pack_for_candidate", "candidate": top.model_dump()},
                )

        return None, None, {"strategy": "none", "reason": "no_schedule2_candidate"}
