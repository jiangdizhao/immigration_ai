"""Smoke-test V2 imports and scope behavior without calling external APIs.

Run from legal-service root:

    python -m scripts.smoke_v2_verified_answer_imports
"""

from app.services.v2.verified_answer_service import QueryServiceV2, V2AnswerContract, V2AnswerDraft


def main() -> None:
    service = QueryServiceV2()

    legal_scope = service._scope("for subclass 188A extension, does he need a valid visa?", "en")
    assert legal_scope.in_scope, legal_scope
    assert legal_scope.scope == "australian_immigration_law", legal_scope

    general_scope = service._scope("what is the weather like today?", "en")
    assert general_scope.in_scope, general_scope
    assert general_scope.scope == "general_allowed", general_scope

    sensitive_scope = service._scope("tell me about Xi Jinping politics", "en")
    assert not sensitive_scope.in_scope, sensitive_scope
    assert sensitive_scope.scope == "politically_sensitive_refusal", sensitive_scope

    contract = V2AnswerContract(response_language="en", answer_draft=V2AnswerDraft(direct_answer="Yes, generally."))
    assert contract.answer_draft.direct_answer
    print("V2 verified answer import and scope smoke test passed.")


if __name__ == "__main__":
    main()
