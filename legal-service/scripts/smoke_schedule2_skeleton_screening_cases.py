from __future__ import annotations

from app.services.schedule2_ranked_candidate_service import Schedule2RankedCandidateService
from app.services.schedule2_skeleton_index_service import Schedule2SkeletonIndexService
from app.services.schedule2_skeleton_screening_service import Schedule2SkeletonScreeningService


ALLOWED_STATUSES = {"activated", "adjacent", "excluded", "uncertain"}


def intent_for(question: str):
    return ranker.extract_legal_intent(
        original_question=question,
        effective_question=question,
        known_facts={},
        proposal={},
    )


def screen(question: str):
    results = screening.screen_all(intent=intent_for(question))
    assert results
    assert all(item.status in ALLOWED_STATUSES for item in results)
    return {item.subclass: item for item in results}


index = Schedule2SkeletonIndexService()
screening = Schedule2SkeletonScreeningService(index_service=index)
ranker = Schedule2RankedCandidateService(index_service=index, screening_service=screening)

assert len(index.all_skeletons()) >= 80

short_term = screen(
    "Australian business needs an overseas specialist worker for a few weeks "
    "on a fixed short-term specialist task with a clear end date, not an ongoing role."
)
assert short_term["400"].status == "activated"
assert short_term["400"].score > short_term["482"].score
assert short_term["482"].status == "activated"
for subclass in ("010", "103", "485", "500", "866"):
    assert short_term[subclass].status == "excluded", subclass

meetings = screen(
    "An overseas visitor is attending meetings only and negotiations only in Australia, "
    "with no actual work."
)
assert meetings["600"].status == "activated"
assert meetings["400"].status == "excluded"
assert meetings["482"].status == "excluded"

training = screen(
    "The applicant will attend structured occupational training in Australia with a training provider."
)
assert training["407"].status == "activated"
assert training["407"].score > training["400"].score

parent = screen("I want to sponsor my parent for an Australian parent visa.")
assert parent["103"].status == "activated"
assert parent["143"].status == "activated"
assert parent["400"].status == "excluded"
assert parent["482"].status == "excluded"

graduate = screen(
    "International student recently graduated from an Australian qualification "
    "and asks about temporary graduate visa options."
)
assert graduate["485"].status == "activated"
assert graduate["400"].status != "activated"
assert graduate["482"].status != "activated"

print("OK: Schedule 2 skeleton screening cases passed")
