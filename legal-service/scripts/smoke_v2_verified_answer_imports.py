"""Smoke-test V2 imports and scope behavior without calling external APIs.

Phase 2 deliberately leaves ANSWER_ENGINE=v1 authoritative. The shared
FastAPI political gate executes before either engine selection, so this smoke
does not treat V2's dormant legacy scope helper as a second political policy.

Run from legal-service root:

    python -m scripts.smoke_v2_verified_answer_imports
"""

from pathlib import Path

from app.services.v2.verified_answer_service import QueryServiceV2, V2AnswerContract, V2AnswerDraft


ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    service = QueryServiceV2()

    legal_scope = service._scope("for subclass 188A extension, does he need a valid visa?", "en")
    assert legal_scope.in_scope, legal_scope
    assert legal_scope.scope == "australian_immigration_law", legal_scope

    general_scope = service._scope("what is the weather like today?", "en")
    assert general_scope.in_scope, general_scope
    assert general_scope.scope == "general_allowed", general_scope

    route = (ROOT / "app/api/routes/query.py").read_text(encoding="utf-8")
    assert route.index("political_failsafe_service.evaluate_payload(payload)") < route.index(
        'engine = os.getenv("ANSWER_ENGINE"'
    )

    contract = V2AnswerContract(
        response_language="en", answer_draft=V2AnswerDraft(direct_answer="Yes, generally.")
    )
    assert contract.answer_draft.direct_answer
    print("V2 verified answer import smoke passed; Phase 2 outer gate precedes engine selection.")


if __name__ == "__main__":
    main()
