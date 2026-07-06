from __future__ import annotations

from app.services.proposal_first_verified_answer_service import ProposalFirstVerifiedAnswerService
from app.services.proposal_first_verification_depth_answer_service import (
    ProposalFirstVerificationDepthAnswerService,
)


def main() -> None:
    base = ProposalFirstVerifiedAnswerService()
    assert base._dict_list([{"a": 1}, "bad", {"b": 2}, None]) == [{"a": 1}, {"b": 2}]
    assert base._dict_list({"a": 1}) == []

    service = ProposalFirstVerificationDepthAnswerService()

    question = (
        "Please advise on and provide all the possible options on how a specialised overseas "
        "worker can come to Australia to do some short term work for an Australian employer."
    )
    scope = service._normalize_answer_scope_contract(
        None,
        original_question=question,
        effective_question=question,
    )
    assert scope["user_requested_scope"] == "all_possible_options", scope
    assert scope["breadth_required"] == "broad", scope

    proposal = {
        "candidate_index": [
            {"candidate_label": "Subclass 400", "subclass": "400"},
            {"candidate_label": "Subclass 482", "subclass": "482"},
            "bad item should be ignored",
            {"candidate_label": "empty subclass", "subclass": None},
        ]
    }
    live_plan = service._normalize_live_retrieval_plan(
        {"source_target_subclasses": ["407", "408", "400"], "max_pages": 99},
        proposal=proposal,
    )
    assert live_plan["source_target_subclasses"][:4] == ["400", "482", "407", "408"], live_plan
    assert live_plan["max_pages"] == 8, live_plan

    verification_plan = service._normalize_verification_plan(
        {
            "verification_depth": "exhaustive_schedule2",
            "candidate_subclasses_to_verify": ["400", "482", "407"],
        }
    )
    assert verification_plan["requires_exhaustive_schedule2"] is True, verification_plan
    assert verification_plan["candidate_subclasses_to_verify"] == ["400", "482", "407"], verification_plan

    print("OK: PFVD runtime contract smoke passed")


if __name__ == "__main__":
    main()
