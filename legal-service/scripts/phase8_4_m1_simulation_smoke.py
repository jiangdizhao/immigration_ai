"""Rollback-only local smoke for the Phase 8.4 M1 simulation loop."""

from __future__ import annotations

import json
from types import SimpleNamespace

from sqlalchemy import func
from sqlalchemy.engine import make_url

from app.core.config import get_settings


def _target(settings):
    parsed = make_url(settings.database_url)
    return {
        "host": parsed.host,
        "port": parsed.port,
        "database": parsed.database,
    }


def _assert_target(target):
    if target != {"host": target["host"], "port": 5432, "database": "immigration_legal"}:
        raise RuntimeError("refusing: M1 smoke requires localhost:5432/immigration_legal")
    if target["host"] not in {"localhost", "127.0.0.1"}:
        raise RuntimeError("refusing: M1 smoke requires a local host")


def _counts(db, *, real_digest=None, real_candidates=None):
    from app.db.models import AnswerReview, AnswerTrace, ExperienceRecord, Matter, ReviewArtifact
    from app.services.phase7_3a_reasoning_bank import CandidatePoolService, ReasoningBankService

    result = {
        "matters": db.query(func.count(Matter.id)).scalar(),
        "answer_traces": db.query(func.count(AnswerTrace.id)).scalar(),
        "answer_reviews": db.query(func.count(AnswerReview.id)).scalar(),
        "experience_records": db.query(func.count(ExperienceRecord.id)).scalar(),
        "review_artifacts": db.query(func.count(ReviewArtifact.id)).scalar(),
        "real_rule_count": len(ReasoningBankService().list_rules(db, bank_namespace="real")),
        "real_bank_digest": ReasoningBankService().state(db, bank_namespace="real").bank_digest,
        "real_compatible_candidate_count": len(
            CandidatePoolService().list_candidates(db, bank_namespace="real")
        ),
    }
    if real_digest is not None:
        result["real_bank_digest_matches"] = result["real_bank_digest"] == real_digest
    if real_candidates is not None:
        result["real_compatible_candidate_count_matches"] = (
            result["real_compatible_candidate_count"] == real_candidates
        )
    return result


def main() -> int:
    settings = get_settings()
    target = _target(settings)
    print(json.dumps(target, sort_keys=True))
    _assert_target(target)

    from app.db.models import AnswerReview, AnswerTrace, ExperienceRecord, Matter, ReviewArtifact
    from app.db.session import SessionLocal
    from app.services.phase7_3a_reasoning_bank import ReasoningBankService
    from app.services.phase8_4_simulation_service import (
        Phase84SimulationService,
        default_m1_fixture_path,
        load_simulation_fixture,
    )
    from app.services.reasoning_bank_runtime_service import ReasoningBankRuntimeService
    from app.schemas.learning import ReasoningBankRuntimeQuery

    fixture = load_simulation_fixture(default_m1_fixture_path())
    with SessionLocal() as db:
        before = _counts(db)
        try:
            result = Phase84SimulationService().run(db, fixture)
            db.flush()
            during = _counts(
                db,
                real_digest=before["real_bank_digest"],
                real_candidates=before["real_compatible_candidate_count"],
            )
            if not during["real_bank_digest_matches"] or not during["real_compatible_candidate_count_matches"]:
                raise RuntimeError("real bank changed during simulation transaction")
            runtime = ReasoningBankRuntimeService(
                settings=SimpleNamespace(phase7_reasoning_bank_runtime_mode="shadow"),
                bank_service=ReasoningBankService(),
            ).retrieve(
                db,
                ReasoningBankRuntimeQuery(
                    question="operative dates version verification process",
                    compact_facts={},
                ),
            )
            if result.provider_call_count != 0 or runtime.selected_rule_keys:
                raise RuntimeError("provider or simulation-to-real runtime isolation failed")
            db.rollback()
        finally:
            if db.in_transaction():
                db.rollback()

    with SessionLocal() as db:
        post = _counts(
            db,
            real_digest=before["real_bank_digest"],
            real_candidates=before["real_compatible_candidate_count"],
        )
        disposable_models = {
            Matter: [result.matter_id],
            AnswerTrace: [result.answer_trace_id],
            AnswerReview: [result.review_id],
            ExperienceRecord: [result.experience_record_id],
            ReviewArtifact: list(result.disposable_ids[4:]),
        }
        disposable_counts = {
            model.__tablename__: sum(db.get(model, row_id) is not None for row_id in row_ids)
            for model, row_ids in disposable_models.items()
        }
        if any(disposable_counts.values()) or post != {**before, "real_bank_digest_matches": True, "real_compatible_candidate_count_matches": True}:
            raise RuntimeError("rollback or real-bank isolation verification failed")

    print(
        json.dumps(
            {
                "fixture": fixture.scenario.scenario_id,
                "before_counts": before,
                "after_counts": post,
                "provider_call_count": 0,
                "rows_created_inside_transaction": {
                    "matter": 1,
                    "answer_trace": 1,
                    "experience_record": 1,
                    "answer_review": 1,
                    "review_artifacts": len(result.disposable_ids) - 4,
                },
                "real_bank_unchanged": True,
                "runtime_selected_simulation_rule": False,
                "post_rollback_disposable_counts": disposable_counts,
            },
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
