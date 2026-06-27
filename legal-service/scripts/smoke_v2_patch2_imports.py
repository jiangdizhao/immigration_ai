"""Smoke import check for V2 no-deterministic-verifier patch."""
from app.services.v2.verified_answer_service_patch2 import QueryServiceV2Patch2


def main() -> None:
    service = QueryServiceV2Patch2()
    assert service.__class__.__name__ == "QueryServiceV2Patch2"
    assert not hasattr(service, "deterministic_verifier_enabled"), "deterministic verifier flag should not exist"
    print("V2 Patch2 import OK; deterministic verifier shortcut removed.")


if __name__ == "__main__":
    main()
