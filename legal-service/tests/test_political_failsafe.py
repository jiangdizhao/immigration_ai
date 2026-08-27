"""Contract, parity, and zero-side-effect tests for the Phase 2 political gate."""

from __future__ import annotations

from dataclasses import asdict
import json
import logging
from pathlib import Path
import shutil
import subprocess

import pytest

from app.schemas.query import QueryRequest
from app.services.agent_observability_service import AgentObservabilityService
from app.services.political_failsafe_service import PoliticalFailsafeService


ROOT = Path(__file__).resolve().parents[2]
FIXTURES_PATH = ROOT / "chatbot/tests/fixtures/political-gate-fixtures.json"
FIXTURES = json.loads(FIXTURES_PATH.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def failsafe() -> PoliticalFailsafeService:
    return PoliticalFailsafeService()


@pytest.mark.parametrize("case", FIXTURES["cases"], ids=lambda case: case["id"])
def test_generated_fixture_corpus_has_expected_backend_decisions(
    failsafe: PoliticalFailsafeService, case: dict[str, str]
) -> None:
    result = failsafe.evaluate_text(case["text"])
    assert result.decision == case["decision"]
    assert result.policy_version == FIXTURES["policy_version"]
    assert len(result.policy_hash) == 64


@pytest.mark.parametrize("term", FIXTURES["never_standalone_terms"])
def test_never_standalone_terms_allow_on_their_own(
    failsafe: PoliticalFailsafeService, term: str
) -> None:
    assert failsafe.evaluate_text(term).decision == "allow"


def test_gate_result_and_telemetry_do_not_expose_match_or_user_text(
    failsafe: PoliticalFailsafeService,
) -> None:
    raw_text = "Please explain falun gong"
    result = failsafe.evaluate_text(raw_text)
    result_data = asdict(result)
    serialized = json.dumps(result_data, ensure_ascii=False)

    assert result.decision == "block"
    assert raw_text not in serialized
    assert not {"match", "normalized", "rule", "category"} & set(result_data)
    assert set(
        result.content_free_telemetry(enforcement_layer="fastapi", application_build="test-build")
    ) == {
        "decision",
        "policy_version",
        "policy_hash",
        "enforcement_layer",
        "latency_ms",
        "application_build",
    }


def test_payload_guard_scans_current_message_and_compatibility_intake_and_ignores_client_gate_metadata(
    failsafe: PoliticalFailsafeService,
) -> None:
    base = {
        "question": "Can I apply for a visa?",
        "political_gate_version": "untrusted-allow",
        "political_gate_decision_id": "untrusted-id",
    }
    history_bypass = QueryRequest(
        **{
            **base,
            "frontend_messages": [
                {"role": "user", "parts": [{"type": "text", "text": "falun gong"}]},
                {"role": "user", "parts": [{"type": "text", "text": "Can I apply for a visa?"}]},
            ],
        }
    )
    intake_bypass = QueryRequest(
        **{
            **base,
            "intake_facts": {"previous free-text answer": "台海战争"},
        }
    )

    assert failsafe.evaluate_payload(history_bypass).decision == "allow"
    assert failsafe.evaluate_payload(intake_bypass).decision == "block"


def test_payload_guard_checks_explicit_current_intake_facts_only(
    failsafe: PoliticalFailsafeService,
) -> None:
    payload = QueryRequest(
        question="Can I apply for a visa?",
        intake_facts={"previous_free_text": "falun gong"},
        current_intake_facts={},
    )
    assert failsafe.evaluate_payload(payload).decision == "allow"

    payload.current_intake_facts = {"current_free_text": "falun gong"}
    assert failsafe.evaluate_payload(payload).decision == "block"


def test_historical_blocked_content_is_removed_before_normal_model_use(
    failsafe: PoliticalFailsafeService,
) -> None:
    payload = QueryRequest(
        question="Can I apply for a visa?",
        intake_facts={"previous_free_text": "falun gong", "visa": "461"},
        frontend_messages=[
            {"role": "user", "parts": [{"type": "text", "text": "falun gong"}]},
            {"role": "user", "parts": [{"type": "text", "text": "Can I apply for a visa?"}]},
        ],
        current_intake_facts={},
    )

    safe = failsafe.sanitize_payload_history(payload)
    assert safe.intake_facts == {"visa": "461"}
    assert len(safe.frontend_messages) == 1
    assert "falun gong" not in json.dumps(safe.model_dump(), ensure_ascii=False).lower()


def test_payload_guard_matches_text_parts_as_the_forwarded_message(
    failsafe: PoliticalFailsafeService,
) -> None:
    payload = QueryRequest(
        question="Can I apply for a visa?",
        frontend_messages=[
            {
                "role": "user",
                "parts": [
                    {"type": "text", "text": "Xi Jinping"},
                    {"type": "text", "text": "criticize"},
                ],
            }
        ],
    )

    assert failsafe.evaluate_payload(payload).decision == "block"


def test_payload_guard_does_not_allow_a_late_blocked_value_to_bypass_traversal_limit(
    failsafe: PoliticalFailsafeService,
) -> None:
    intake_facts = {f"ordinary-field-{index}": "ordinary immigration fact" for index in range(300)}
    intake_facts["late-free-text"] = "falun gong"
    payload = QueryRequest(question="Can I apply for a visa?", intake_facts=intake_facts)

    assert failsafe.evaluate_payload(payload).decision == "block"


def test_browser_and_fastapi_use_the_same_generated_policy_fixture_decisions(
    failsafe: PoliticalFailsafeService,
) -> None:
    node = shutil.which("node")
    assert node, "Node is required for the browser/FastAPI policy parity contract"
    result = subprocess.run(
        [node, "--import", "tsx", "scripts/emit-political-gate-decisions.ts"],
        cwd=ROOT / "chatbot",
        check=True,
        capture_output=True,
        text=True,
    )
    browser = json.loads(result.stdout)

    first_backend = failsafe.evaluate_text(FIXTURES["cases"][0]["text"])
    assert browser["identity"]["policyVersion"] == first_backend.policy_version
    assert browser["identity"]["policyHash"] == first_backend.policy_hash
    assert [row["decision"] for row in browser["cases"]] == [
        failsafe.evaluate_text(case["text"]).decision for case in FIXTURES["cases"]
    ]
    assert all(row["decision"] == "allow" for row in browser["neverStandalone"])


@pytest.mark.parametrize("assistant_mode", ["default", "premium"])
def test_fastapi_block_returns_before_engine_db_or_provider_and_keeps_metrics_zero(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
    assistant_mode: str,
) -> None:
    from app.api.routes import query as query_route

    class CapturingObserver(AgentObservabilityService):
        captured_metrics = None

        def reset_turn(self, token) -> None:  # type: ignore[no-untyped-def]
            self.captured_metrics = self.snapshot()
            super().reset_turn(token)

    class RejectingQueryService:
        def __init__(self) -> None:
            raise AssertionError("blocked request must not construct QueryService")

    class RejectingDatabase:
        def __getattr__(self, name: str) -> object:
            raise AssertionError(f"blocked request must not access database attribute {name}")

    class Settings:
        backend_political_failsafe_enabled = True
        app_version = "phase2-test"

    observer = CapturingObserver()
    blocked_text = "Please explain falun gong"
    caplog.set_level(logging.INFO, logger=query_route.logger.name)
    monkeypatch.setattr(query_route, "observability_service", observer)
    monkeypatch.setattr(query_route, "QueryService", RejectingQueryService)
    monkeypatch.setattr(query_route, "get_settings", lambda: Settings())
    monkeypatch.delenv("ANSWER_ENGINE", raising=False)
    shadow_calls = []
    monkeypatch.setattr(
        query_route,
        "_schedule_shadow_run",
        lambda **kwargs: shadow_calls.append(kwargs),
    )

    response = query_route.run_query(
        QueryRequest(question=blocked_text, assistant_mode=assistant_mode),
        db=RejectingDatabase(),
    )

    assert response.matter_id is None
    assert response.response_language == "en"
    assert response.confidence == "high"
    assert response.next_action == "answer"
    assert response.citations == []
    assert response.compact_sources == []
    assert response.retrieval_debug == {}
    assert blocked_text not in json.dumps(response.model_dump(), ensure_ascii=False)
    assert "falun gong" not in caplog.text.lower()
    gate_records = [
        record
        for record in caplog.records
        if record.getMessage() == "political gate blocked FastAPI request"
    ]
    assert len(gate_records) == 1
    assert set(gate_records[0].political_gate) == {
        "decision",
        "policy_version",
        "policy_hash",
        "enforcement_layer",
        "latency_ms",
        "application_build",
    }

    metrics = observer.captured_metrics
    assert metrics is not None
    assert metrics.political_gate_decision == "block"
    assert metrics.political_gate_enforcement_layer == "fastapi"
    assert metrics.political_policy_version == FIXTURES["policy_version"]
    assert metrics.provider_api_call_count == 0
    assert shadow_calls == []
    assert metrics.tool_call_count == 0
    assert metrics.tool_round_count == 0
    assert metrics.logical_llm_stage_count == 0
    assert metrics.metrics_complete is True
    assert "serving_engine_dispatch" not in [
        checkpoint.stage for checkpoint in metrics.deadline_checkpoints
    ]
