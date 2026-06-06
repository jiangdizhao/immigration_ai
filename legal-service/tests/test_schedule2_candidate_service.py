from __future__ import annotations

from app.schedule.schedule2_candidate_service import Schedule2CandidateSearchService


def subclasses_for(question: str, facts: dict | None = None) -> list[str]:
    service = Schedule2CandidateSearchService()
    return [candidate.subclass for candidate in service.search(question=question, known_facts=facts or {})]


def test_student_500_refusal_maps_to_500() -> None:
    subs = subclasses_for("我之前是485，后来申请500学生签证被拒了，说我不是真正的学生。")
    assert "500" in subs


def test_partner_820_maps_to_820_not_student_500() -> None:
    subs = subclasses_for("我人在悉尼，旅游签快到期了。我和澳洲 PR 结婚了，是不是可以申请820？")
    assert "820" in subs
    assert subs.index("820") < subs.index("500") if "500" in subs else True


def test_bva_travel_maps_to_010_and_020() -> None:
    subs = subclasses_for("我在悉尼申请了820，现在拿着 Bridging Visa A。我想回国两周，可以直接走吗？")
    assert "010" in subs
    assert "020" in subs
    assert "820" in subs


def test_485_maps_to_485() -> None:
    subs = subclasses_for("I am 36 and finished a master by coursework. Can I still apply for a 485 visa?")
    assert "485" in subs
