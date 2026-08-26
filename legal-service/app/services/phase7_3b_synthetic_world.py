"""Fictional, versioned benchmark data and an isolated simulation store.

This module is intentionally not imported by any customer-serving module.  The
world describes process failures only; none of its fictional rules are legal
authority.
"""

from __future__ import annotations

import hashlib
import json
import os
import tempfile
from contextlib import contextmanager
from pathlib import Path
from types import SimpleNamespace
from typing import Any, Iterator

from sqlalchemy import create_engine, event
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session, sessionmaker

from app.db.base import Base
from app.db.models import AnswerReview, AnswerTrace, ExperienceRecord, Matter
from app.schemas.learning import ReasoningLessonCandidate
from app.schemas.phase7_3b import (
    SyntheticTaskInput,
    SyntheticTaskOracle,
    SyntheticTaskVisibleInput,
)
from app.services.phase7_artifact_service import Phase7ArtifactService


SYNTHETIC_NOTICE = (
    "SYNTHETIC REGULATORY MICRO-WORLD. NOT AUSTRALIAN LAW. NOT LEGAL AUTHORITY. "
    "This benchmark tests process reasoning only."
)


class SyntheticWorldError(ValueError):
    """A benchmark or simulation-store invariant failed."""


class SyntheticFamilyFixture:
    """A family split with independent source, transfer, and controls."""

    def __init__(self, raw: dict[str, Any]):
        self.family = str(raw["family"])
        self.source = SyntheticFixtureCase(raw["source"])
        self.held_out_positive = [SyntheticFixtureCase(item) for item in raw["held_out_positive"]]
        self.negative_controls = [SyntheticFixtureCase(item) for item in raw["negative_controls"]]
        self.compiler_proposals = list(raw.get("compiler_proposals", []))
        self.compiler_training_contrasts = [
            SyntheticFixtureCase(item) for item in raw.get("compiler_training_contrasts", [])
        ]
        if len(self.held_out_positive) < 2 or len(self.negative_controls) < 2:
            raise SyntheticWorldError(f"family {self.family} lacks required holdouts/controls")
        for case in self.all_cases:
            if case.input.family != self.family:
                raise SyntheticWorldError(f"case {case.input.task_id} has the wrong family")

    @property
    def all_cases(self) -> list["SyntheticFixtureCase"]:
        return [self.source, *self.held_out_positive, *self.negative_controls]


class SyntheticFixtureCase:
    def __init__(self, raw: dict[str, Any]):
        self.input = SyntheticTaskInput.model_validate(raw["input"])
        self.oracle = SyntheticTaskOracle.model_validate(raw["oracle"])
        if self.input.task_id != self.oracle.task_id:
            raise SyntheticWorldError(f"task/oracle mismatch for {self.input.task_id}")
        self.baseline_observation = raw.get("baseline_observation")
        self.memory_observation = raw.get("memory_observation")


class SyntheticFixturePack:
    def __init__(self, raw: dict[str, Any], *, canonical_bytes: bytes | None = None):
        self.version = str(raw["version"])
        self.mode_policy = str(
            raw.get(
                "mode_policy",
                "infrastructure_only" if self.version == "v1" else "live_efficacy_pilot",
            )
        )
        if self.mode_policy not in {"infrastructure_only", "live_efficacy_pilot"}:
            raise SyntheticWorldError("fixture pack mode_policy is invalid")
        if not self.version.startswith("v"):
            raise SyntheticWorldError("fixture pack version must be explicit, e.g. v1")
        self.families = [SyntheticFamilyFixture(item) for item in raw["families"]]
        if len(self.families) < 5:
            raise SyntheticWorldError("Phase 7.3B requires at least five learning families")
        if self.version == "v2" and any(
            len(family.held_out_positive) != 2 or len(family.negative_controls) != 2
            for family in self.families
        ):
            raise SyntheticWorldError(
                "v2 requires exactly two positives and two negatives per family"
            )
        names = [item.family for item in self.families]
        if len(set(names)) != len(names):
            raise SyntheticWorldError("fixture family names must be unique")
        self._cases = {
            case.input.task_id: case for family in self.families for case in family.all_cases
        }
        if len(self._cases) != sum(len(family.all_cases) for family in self.families):
            raise SyntheticWorldError("fixture task IDs must be unique")
        self._canonical_bytes = canonical_bytes or Phase7ArtifactService.canonical_json_bytes(raw)

    @property
    def sha256(self) -> str:
        return hashlib.sha256(self._canonical_bytes).hexdigest()

    @property
    def cases(self) -> list[SyntheticFixtureCase]:
        return list(self._cases.values())

    def case(self, task_id: str) -> SyntheticFixtureCase:
        try:
            return self._cases[task_id]
        except KeyError as exc:
            raise SyntheticWorldError(f"unknown synthetic task: {task_id}") from exc

    def family(self, family: str) -> SyntheticFamilyFixture:
        for item in self.families:
            if item.family == family:
                return item
        raise SyntheticWorldError(f"unknown synthetic family: {family}")


def load_fixture_pack(path: str | Path) -> SyntheticFixturePack:
    fixture_path = Path(path)
    raw_bytes = fixture_path.read_bytes()
    raw = json.loads(raw_bytes)
    if not isinstance(raw, dict):
        raise SyntheticWorldError("fixture pack root must be an object")
    return SyntheticFixturePack(raw, canonical_bytes=raw_bytes)


def default_fixture_pack_path() -> Path:
    return (
        Path(__file__).resolve().parents[2]
        / "tests"
        / "fixtures"
        / "phase7_3b"
        / "v1"
        / "pack.json"
    )


def fixture_pack_path(version: str) -> Path:
    """Resolve an explicit immutable fixture-pack version."""
    normalized = version.removeprefix("v")
    if normalized == "1":
        return default_fixture_pack_path()
    return default_fixture_pack_path().parent.parent / f"v{normalized}" / "pack.json"


def task_visible_payload(case: SyntheticFixtureCase) -> SyntheticTaskVisibleInput:
    """Project a benchmark case into the only runner-visible contract."""
    return case.input.task_visible()


def synthetic_snapshot(case: SyntheticFixtureCase) -> dict[str, Any]:
    """Build a bounded experience snapshot without storing the oracle."""
    task = case.input
    return {
        "schema_version": "phase7.experience.v1",
        "request": {"original_question": task.question, "task_id": task.task_id},
        "matter": {"compact_state": dict(task.compact_facts)},
        "answer": {"accepted_customer_answer": "synthetic process observation"},
        "research": {"allowed_actions": list(task.allowed_research_actions)},
        "evidence": {"synthetic_ids": [item.evidence_id for item in task.synthetic_evidence]},
        "provenance": {"notice": SYNTHETIC_NOTICE},
        "system": {"architecture_version": "phase7.3b.synthetic.v1"},
    }


class SimulationStore:
    """Temporary SQLite-only store; never the configured application DB."""

    def __init__(self, database_url: str | None = None):
        self._temporary_path: str | None = None
        url = database_url
        if url == ":memory:":
            url = "sqlite:///:memory:"
        if url is None:
            fd, self._temporary_path = tempfile.mkstemp(prefix="phase7_3b_", suffix=".sqlite3")
            os.close(fd)
            url = f"sqlite:///{self._temporary_path}"
        self.database_url = url
        self._assert_safe_url(url, generated_temporary_path=self._temporary_path)
        self.engine = create_engine(url, future=True)

        @event.listens_for(self.engine, "connect")
        def _simulation_lock_function(connection, _record):
            # Production PostgreSQL advisory locking is intentionally untouched.
            connection.create_function("pg_advisory_xact_lock", 1, lambda _key: None)

        Base.metadata.create_all(self.engine)
        self.SessionLocal = sessionmaker(bind=self.engine, autoflush=False, expire_on_commit=False)
        self._closed = False

    @staticmethod
    def _assert_safe_url(database_url: str, *, generated_temporary_path: str | None = None) -> None:
        lowered = database_url.casefold()
        parsed = make_url(database_url)
        if parsed.drivername.split("+")[0] != "sqlite":
            raise SyntheticWorldError("Phase 7.3B simulation store requires a SQLite URL")
        if (
            "immigration_legal" in lowered
            or "localhost:5432" in lowered
            or "127.0.0.1:5432" in lowered
        ):
            raise SyntheticWorldError("authoritative PostgreSQL URL is forbidden for simulation")
        if generated_temporary_path is None and parsed.database not in {None, ":memory:"}:
            raise SyntheticWorldError("simulation store accepts only temporary or in-memory SQLite")

    @contextmanager
    def session(self) -> Iterator[Session]:
        if self._closed:
            raise SyntheticWorldError("simulation store is closed")
        with self.SessionLocal() as db:
            yield db

    def seed_case(self, db: Session, case: SyntheticFixtureCase) -> dict[str, str]:
        task = case.input
        suffix = task.task_id.replace("-", "_")
        matter_id = f"matter-{suffix}"
        trace_id = f"trace-{suffix}"
        review_id = f"review-{suffix}"
        experience_id = f"experience-{suffix}"
        matter = Matter(id=matter_id, session_id=f"synthetic-{suffix}", issue_summary=task.question)
        trace = AnswerTrace(
            id=trace_id,
            matter_id=matter_id,
            session_id=f"synthetic-{suffix}",
            user_message=task.question,
            assistant_answer="synthetic process observation",
            response_language="en",
            trace_json={"task_id": task.task_id, "notice": SYNTHETIC_NOTICE},
        )
        review = AnswerReview(
            id=review_id,
            answer_trace_id=trace_id,
            matter_id=matter_id,
            rating="synthetic_fixture",
            severity="low",
            error_categories=[case.input.family],
        )
        snapshot = synthetic_snapshot(case)
        experience = ExperienceRecord(
            id=experience_id,
            answer_trace_id=trace_id,
            matter_id=matter_id,
            request_id=f"synthetic-{suffix}",
            origin="manual_fixture",
            experience_schema_version="phase7.experience.v1",
            snapshot_json=snapshot,
            snapshot_sha256=Phase7ArtifactService.snapshot_sha256(snapshot),
        )
        db.add_all([matter, trace, review, experience])
        db.flush()
        artifact_service = Phase7ArtifactService()
        options = self._artifact_options(case)
        review_result = artifact_service.ensure_review_record(
            db, review=review, trace=trace, options=options
        )
        evaluation_result = artifact_service.materialize_evaluation_case(
            db, review=review, trace=trace, options=options
        )
        if review_result.artifact is None or evaluation_result.artifact is None:
            raise SyntheticWorldError("synthetic artifact materialization did not create artifacts")
        return {
            "matter_id": matter_id,
            "trace_id": trace_id,
            "review_id": review_id,
            "experience_id": experience_id,
        }

    def add_candidate(
        self,
        db: Session,
        *,
        case: SyntheticFixtureCase,
        ids: dict[str, str],
        lesson_text: str,
        failure_codes: list[str],
        candidate_id: str | None = None,
    ) -> ReasoningLessonCandidate:
        materialized_candidate_id = f"lesson-{ids['review_id']}"
        if candidate_id is not None and candidate_id != materialized_candidate_id:
            raise SyntheticWorldError("public artifact materializer controls candidate identity")
        review = db.get(AnswerReview, ids["review_id"])
        trace = db.get(AnswerTrace, ids["trace_id"])
        if review is None or trace is None:
            raise SyntheticWorldError("synthetic candidate parent rows are missing")
        result = Phase7ArtifactService().materialize_lesson_candidate(
            db,
            review=review,
            trace=trace,
            options=self._artifact_options(
                case,
                lesson_text=lesson_text,
                failure_codes=failure_codes,
            ),
        )
        if result.artifact is None:
            raise SyntheticWorldError("synthetic lesson candidate materialization was skipped")
        candidate = ReasoningLessonCandidate.model_validate(result.artifact.artifact_payload)
        if candidate.candidate_id != materialized_candidate_id:
            raise SyntheticWorldError(
                "public artifact materializer did not preserve candidate identity"
            )
        return candidate

    @staticmethod
    def _artifact_options(
        case: SyntheticFixtureCase,
        *,
        lesson_text: str | None = None,
        failure_codes: list[str] | None = None,
    ) -> SimpleNamespace:
        task = case.input
        return SimpleNamespace(
            review_origin="synthetic_test",
            review_provenance="synthetic_test",
            review_outcome="material_issue" if task.split == "source" else "correct",
            expected_checker_behavior=case.oracle.model_dump(mode="json"),
            expected_evidence_characteristics={},
            prohibited_behaviors=[],
            expected_claim_ids=list(case.oracle.required_claim_ids),
            prohibited_claim_ids=list(case.oracle.prohibited_claim_ids),
            max_latency_ms=None,
            max_tool_calls=None,
            tags=[task.split, "phase7.3b", "fictional_micro_world"],
            phase7_metadata={
                "scope_applicability": {
                    "topic": "synthetic_process",
                    "phase": "7.3b",
                    "failure_codes": sorted(failure_codes or []),
                }
            },
            preferred_reasoning_or_research_approach=lesson_text,
        )

    def close(self) -> None:
        if self._closed:
            return
        self.engine.dispose()
        self._closed = True
        if self._temporary_path:
            try:
                os.unlink(self._temporary_path)
            except FileNotFoundError:
                pass

    def __enter__(self) -> "SimulationStore":
        return self

    def __exit__(self, _exc_type, _exc, _tb) -> None:
        self.close()


__all__ = [
    "SYNTHETIC_NOTICE",
    "SimulationStore",
    "SyntheticFixtureCase",
    "SyntheticFixturePack",
    "SyntheticWorldError",
    "default_fixture_pack_path",
    "fixture_pack_path",
    "load_fixture_pack",
    "task_visible_payload",
]
