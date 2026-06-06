from __future__ import annotations

from app.schedule.criterion_pack_resolver import CriterionPackResolver
from app.schedule.schemas import ScheduleCandidate, ScheduleClause
from app.schedule.schedule2_index_service import ScheduleIndexService
from app.services.subclass_485_criterion_pack import Subclass485CriterionPack
from app.services.subclass_500_criterion_pack import Subclass500CriterionPack


class DummyIndex(ScheduleIndexService):
    def __init__(self) -> None:
        pass

    def clauses_for_subclass(self, subclass: str, *, schedule_no: str = "2"):
        if subclass == "820":
            return [
                ScheduleClause(
                    schedule_no="2",
                    subclass="820",
                    title="Partner",
                    clause_ref="820.21",
                    heading="Criteria to be satisfied at time of application",
                    section_kind="time_of_application",
                    text="The applicant is the spouse or de facto partner of an Australian citizen, Australian permanent resident or eligible New Zealand citizen.",
                )
            ]
        return []

    def top_titles(self, subclass: str, *, schedule_no: str = "2"):
        return ["Partner"] if subclass == "820" else []


def test_enhanced_485_pack_is_preserved() -> None:
    resolver = CriterionPackResolver(index_service=DummyIndex())
    pack, name, debug = resolver.resolve(
        candidates=[ScheduleCandidate(subclass="485", score=90, confidence="high", reason="test")],
        question="Can I apply for 485?",
        known_facts={},
    )
    assert name == "485"
    assert isinstance(pack, Subclass485CriterionPack)
    assert debug["strategy"] == "enhanced_pack"


def test_enhanced_500_pack_is_preserved() -> None:
    resolver = CriterionPackResolver(index_service=DummyIndex())
    pack, name, debug = resolver.resolve(
        candidates=[ScheduleCandidate(subclass="500", score=90, confidence="high", reason="test")],
        question="student visa question",
        known_facts={},
    )
    assert name == "500"
    assert isinstance(pack, Subclass500CriterionPack)
    assert debug["strategy"] == "enhanced_pack"


def test_generic_pack_for_820() -> None:
    resolver = CriterionPackResolver(index_service=DummyIndex())
    pack, name, debug = resolver.resolve(
        candidates=[ScheduleCandidate(subclass="820", score=90, confidence="high", reason="test")],
        question="partner 820",
        known_facts={},
    )
    assert name == "820"
    assert pack is not None
    assert debug["strategy"] == "generic_schedule2_pack"
