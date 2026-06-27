from __future__ import annotations

from app.services.v2.verified_answer_service_patch2 import QueryServiceV2Patch2


def main() -> None:
    service = QueryServiceV2Patch2()
    assert service.deterministic_verifier_enabled in {True, False}
    print("ok: QueryServiceV2Patch2 imports and initializes")


if __name__ == "__main__":
    main()
