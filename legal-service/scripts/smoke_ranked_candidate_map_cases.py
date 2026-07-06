from __future__ import annotations

from app.services.schedule2_ranked_candidate_service import Schedule2RankedCandidateService


def ranked(question: str):
    ranked_map = service.build(
        original_question=question,
        effective_question=question,
        known_facts={},
        proposal={},
    )
    assert ranked_map.screened_subclass_count >= 80
    assert ranked_map.ranked_candidates
    for index, candidate in enumerate(ranked_map.ranked_candidates, start=1):
        assert candidate.rank == index
    return ranked_map


def subclasses(ranked_map):
    return [candidate.subclass for candidate in ranked_map.ranked_candidates]


service = Schedule2RankedCandidateService()

short_term = ranked(
    "Australian business needs an overseas specialist worker to come for a few weeks "
    "for a fixed short-term specialist task with clear end date, not an ongoing role."
)
assert subclasses(short_term)[:2] == ["400", "482"]
assert short_term.confidence_floor != "high"
assert short_term.primary_decision_boundary
assert "fixed short-term specialist task" in short_term.primary_decision_boundary
assert "ongoing sponsored skilled job role" in short_term.primary_decision_boundary
assert {ref.split("-")[2] for candidate in short_term.ranked_candidates for ref in candidate.source_refs if ref.startswith("schedule-2-")} == {
    "400",
    "482",
}

ongoing = ranked(
    "Australian employer wants to sponsor an overseas skilled worker for an ongoing "
    "job role with nomination and nominated occupation."
)
assert subclasses(ongoing)[0] == "482"
assert "400" not in subclasses(ongoing)[:1]

meetings = ranked(
    "Visitor is attending meetings only and negotiations only in Australia, no actual work."
)
assert subclasses(meetings)[0] in {"600", "601", "651"}
assert "400" not in subclasses(meetings)[:1]
assert "482" not in subclasses(meetings)[:1]

training = ranked(
    "Applicant will attend structured occupational training in Australia with a training provider, "
    "not ordinary work."
)
assert subclasses(training)[0] == "407"

parent = ranked("I want to sponsor my parent for an Australian parent visa.")
assert subclasses(parent)[0] in {"103", "143", "173", "804", "864", "870", "884"}
assert {"400", "482"}.isdisjoint(subclasses(parent))

graduate = ranked(
    "International student recently graduated from an Australian qualification "
    "and asks about temporary graduate visa options."
)
assert subclasses(graduate)[0] == "485"
assert "400" not in subclasses(graduate)[:1]
assert "482" not in subclasses(graduate)[:1]

print("OK: ranked Schedule 2 candidate-map cases passed")
