from __future__ import annotations

import pytest

from app.schemas.query import QueryRequest, QueryResponse
from app.services.agent_observability_service import (
    AbsoluteTurnDeadline,
    AgentObservabilityService,
    TurnDeadlineExceeded,
)


class FakeClock:
    def __init__(self, value: float = 100.0) -> None:
        self.value = value

    def __call__(self) -> float:
        return self.value

    def advance_ms(self, milliseconds: float) -> None:
        self.value += milliseconds / 1000.0


def test_raw_provider_tool_round_and_retry_counters() -> None:
    clock = FakeClock()
    service = AgentObservabilityService(clock=clock)
    token = service.begin_turn(mode="default", turn_deadline_ms=40000)
    try:
        service.mark_agent_started()
        service.record_logical_stage("answer_research")
        service.record_provider_call(
            stage="answer_research",
            response_id="resp-1",
            model="gpt-5.6-luna",
            duration_ms=1200,
            status="ok",
        )
        service.record_tool_call(
            tool_name="web_search",
            tool_call_id="ws-1",
            round_index=1,
            status="ok",
            duration_ms=500,
            result_count=3,
        )
        service.record_tool_call(
            tool_name="exact_legal_lookup",
            tool_call_id="exact-1",
            round_index=2,
            status="timeout",
            duration_ms=1000,
            is_retry=True,
        )
        service.record_logical_stage("fact_check")
        service.record_provider_call(
            stage="fact_check",
            response_id="resp-2",
            model="gpt-5.6-luna",
            duration_ms=800,
            status="ok",
        )
        service.mark_answer_completed()
        service.mark_metrics_complete()
        metrics = service.snapshot()
    finally:
        service.reset_turn(token)

    assert metrics is not None
    assert metrics.logical_llm_stage_count == 2
    assert metrics.provider_api_call_count == 2
    assert metrics.tool_call_count == 2
    assert metrics.tool_round_count == 2
    assert metrics.web_search_call_count == 1
    assert metrics.exact_lookup_call_count == 1
    assert metrics.lightrag_call_count == 0
    assert metrics.flat_rag_call_count == 0
    assert metrics.utility_call_count == 0
    assert metrics.retry_count == 1
    assert metrics.metrics_complete is True


def test_terminal_submission_does_not_consume_tool_round() -> None:
    service = AgentObservabilityService()
    token = service.begin_turn(mode="default", turn_deadline_ms=40000)
    try:
        service.record_tool_call(
            tool_name="flat_rag_search",
            tool_call_id="flat-1",
            round_index=1,
            status="ok",
            duration_ms=1,
        )
        service.record_tool_call(
            tool_name="submit_answer",
            tool_call_id="submit-1",
            round_index=2,
            status="ok",
            duration_ms=1,
        )
        service.record_tool_call(
            tool_name="submit_compact_checker_result",
            tool_call_id="checker-1",
            round_index=2,
            status="ok",
            duration_ms=1,
        )
        metrics = service.snapshot()
    finally:
        service.reset_turn(token)

    assert metrics is not None
    assert metrics.tool_call_count == 3
    assert metrics.tool_round_count == 1
    assert metrics.submit_answer_call_count == 1
    assert metrics.checker_call_count == 1


def test_absolute_deadline_is_inherited_and_retry_does_not_reset_it() -> None:
    clock = FakeClock()
    service = AgentObservabilityService(clock=clock)
    token = service.begin_turn(mode="default", turn_deadline_ms=1000)
    try:
        deadline = service.current_deadline()
        assert deadline is not None
        deadline_at = deadline.deadline_at
        assert service.component_timeout_ms(stage="provider", component_timeout_ms=900) == pytest.approx(
            900
        )
        clock.advance_ms(700)
        retry_timeout = service.component_timeout_ms(stage="provider_retry", component_timeout_ms=900)
        assert retry_timeout == pytest.approx(300, abs=0.01)
        assert service.current_deadline() is deadline
        assert service.current_deadline().deadline_at == deadline_at
        clock.advance_ms(301)
        with pytest.raises(TurnDeadlineExceeded) as exc:
            service.component_timeout_ms(stage="tool_retry", component_timeout_ms=500)
        assert exc.value.stage == "tool_retry"
        metrics = service.snapshot()
        assert metrics is not None
        assert metrics.deadline_exceeded_stage == "tool_retry"
    finally:
        service.reset_turn(token)


def test_stage_budget_is_non_resetting_from_original_turn_start() -> None:
    clock = FakeClock(value=100.0)
    deadline = AbsoluteTurnDeadline(started_at=100.0, turn_deadline_ms=40000, clock=clock)
    # Research stage = 32s from original turn start => deadline at 132.0
    assert deadline.stage_deadline_at(32000) == 132.0
    assert deadline.stage_remaining_ms(32000) == pytest.approx(32000)
    # Advance 20s => stage remaining 12s (NOT reset to 32s)
    clock.advance_ms(20000)
    assert deadline.stage_remaining_ms(32000) == pytest.approx(12000)
    # Advance past stage => 0 (and no negative)
    clock.advance_ms(13000)
    assert deadline.stage_remaining_ms(32000) == pytest.approx(0)
    # The absolute turn deadline is independent (40s => 140.0)
    assert deadline.deadline_at == 140.0
    assert deadline.remaining_ms() == pytest.approx(7000)


def test_missing_terminal_submission_metrics_are_bounded() -> None:
    service = AgentObservabilityService(clock=FakeClock())
    token = service.begin_turn(mode="premium", turn_deadline_ms=45000)
    try:
        service.record_terminal_submission(missing=True, continuation_count=1)
        metrics = service.snapshot()
        assert metrics is not None
        assert metrics.terminal_submission_missing is True
        assert metrics.terminal_submission_continuation_count == 1
        with pytest.raises(ValueError):
            service.record_terminal_submission(missing=True, continuation_count=2)
    finally:
        service.reset_turn(token)


def test_query_route_starts_deadline_before_service_setup(monkeypatch) -> None:
    from app.api.routes import query as query_route

    clock = FakeClock()
    observer = AgentObservabilityService(clock=clock)
    captured = {}

    class FakeQueryService:
        def __init__(self) -> None:
            payload = observer.trace_payload()
            assert payload is not None
            captured["at_constructor"] = payload
            clock.advance_ms(25)

        def handle_query(self, _db, _payload):
            payload = observer.trace_payload()
            assert payload is not None
            captured["at_state_load"] = payload
            return QueryResponse(
                matter_id="matter-1",
                answer="Legacy answer",
                response_language="en",
                confidence="medium",
                next_action="answer",
            )

    monkeypatch.setattr(query_route, "observability_service", observer)
    monkeypatch.setattr(query_route.time, "perf_counter", clock)
    monkeypatch.setattr(query_route, "QueryService", FakeQueryService)
    monkeypatch.delenv("ANSWER_ENGINE", raising=False)

    response = query_route.run_query(QueryRequest(question="Legacy question"), db=object())

    assert response.answer == "Legacy answer"
    constructor_metrics = captured["at_constructor"]["execution_metrics"]
    state_metrics = captured["at_state_load"]["execution_metrics"]
    stages = [row["stage"] for row in state_metrics["deadline_checkpoints"]]
    assert stages[0] == "fastapi_query_acceptance"
    assert "serving_engine_dispatch" in stages
    assert constructor_metrics["pre_agent_latency_ms"] >= 0
    assert state_metrics["backend_total_latency_ms"] >= 25


def test_shadow_starts_after_gate_before_slow_legacy_path(monkeypatch) -> None:
    from app.api.routes import query as query_route

    clock = FakeClock()
    observer = AgentObservabilityService(clock=clock)
    captured: dict[str, object] = {}

    class Settings:
        backend_political_failsafe_enabled = False
        agent_shadow_enabled = True
        default_turn_deadline_ms = 40000
        premium_turn_deadline_ms = 45000
        default_answer_research_target_ms = 32000
        premium_answer_research_target_ms = 37000
        legal_fact_check_target_ms = 8000
        agent_max_tool_rounds = 2
        agent_max_provider_calls = 3
        agent_max_retries = 0
        agent_max_flat_rag_calls = 1
        agent_retry_viability_threshold_ms = 8000

    class FakeThread:
        def __init__(self, *, target, daemon):
            captured["thread_target"] = target
            captured["thread_started_at"] = clock()
            captured["daemon"] = daemon

        def start(self):
            captured["started"] = True

    class SlowLegacyService:
        def handle_query(self, _db, _payload):
            clock.advance_ms(26600)
            return QueryResponse(
                answer="legacy answer",
                response_language="en",
                confidence="medium",
                next_action="answer",
            )

    monkeypatch.setattr(query_route, "observability_service", observer)
    monkeypatch.setattr(query_route, "get_settings", lambda: Settings())
    monkeypatch.setattr(query_route, "QueryService", SlowLegacyService)
    monkeypatch.setattr(query_route.threading, "Thread", FakeThread)
    monkeypatch.setattr(query_route.time, "perf_counter", clock)
    monkeypatch.delenv("ANSWER_ENGINE", raising=False)

    response = query_route.run_query(QueryRequest(question="Current information"), db=object())

    assert response.answer == "legacy answer"
    assert captured["started"] is True
    assert captured["thread_started_at"] == pytest.approx(100.0)
    assert captured["daemon"] is True
    assert clock() == pytest.approx(126.6)


def test_shadow_launcher_is_nonblocking_when_legacy_response_is_ready_late(monkeypatch) -> None:
    from app.api.routes import query as query_route

    clock = FakeClock()
    captured: dict[str, object] = {}

    class Settings:
        backend_political_failsafe_enabled = False
        agent_shadow_enabled = True
        default_turn_deadline_ms = 40000
        premium_turn_deadline_ms = 45000
        default_answer_research_target_ms = 32000
        premium_answer_research_target_ms = 37000
        legal_fact_check_target_ms = 8000
        agent_max_tool_rounds = 2
        agent_max_provider_calls = 3
        agent_max_retries = 0
        agent_max_flat_rag_calls = 1
        agent_retry_viability_threshold_ms = 8000

    class FakeThread:
        def __init__(self, *, target, daemon):
            captured["target"] = target

        def start(self):
            captured["started"] = True

    class LegacyService:
        def handle_query(self, _db, _payload):
            return QueryResponse(
                answer="public",
                response_language="en",
                confidence="medium",
                next_action="answer",
            )

    monkeypatch.setattr(query_route, "get_settings", lambda: Settings())
    monkeypatch.setattr(query_route, "QueryService", LegacyService)
    monkeypatch.setattr(query_route.threading, "Thread", FakeThread)
    monkeypatch.setattr(query_route.time, "perf_counter", clock)
    monkeypatch.delenv("ANSWER_ENGINE", raising=False)

    response = query_route.run_query(QueryRequest(question="Hello"), db=object())

    assert response.answer == "public"
    assert captured["started"] is True
    assert clock() == pytest.approx(100.0)


def test_query_aliases_reuse_existing_legacy_modes(monkeypatch) -> None:
    from app.api.routes import query as query_route

    captured = []

    class FakeQueryService:
        def handle_query(self, _db, payload):
            captured.append(payload.assistant_mode)
            return QueryResponse(
                answer="same legacy response",
                response_language="en",
                confidence="medium",
                next_action="answer",
            )

    monkeypatch.setattr(query_route, "QueryService", FakeQueryService)
    monkeypatch.delenv("ANSWER_ENGINE", raising=False)
    query_route.run_query(QueryRequest(question="Default request", assistant_mode="default"), db=object())
    query_route.run_query(QueryRequest(question="Premium request", assistant_mode="premium"), db=object())
    assert captured == ["default_legal_pipeline", "premium_direct_gpt55_high"]


def test_additive_query_response_compatibility() -> None:
    legacy = QueryResponse.model_validate(
        {
            "matter_id": "matter-1",
            "answer": "Existing answer",
            "response_language": "en",
            "confidence": "high",
            "next_action": "answer",
        }
    )
    assert legacy.answer == "Existing answer"
    assert legacy.citations == []
    assert legacy.architecture_version is None
    assert legacy.research_status is None
    assert legacy.fact_check_status is None
    assert legacy.trace_id is None


def test_new_execution_flags_do_not_activate_calls() -> None:
    from app.core.config import Settings

    settings = Settings(_env_file=None, DATABASE_URL="sqlite://")
    assert settings.answer_engine == "v1"
    assert settings.web_search_enabled is False
    assert settings.exact_legal_lookup_enabled is False
    assert settings.lightrag_enabled is False
    assert settings.flat_rag_tool_enabled is False
    assert settings.backend_political_failsafe_enabled is True
    assert settings.agent_shadow_enabled is False
    assert settings.agent_rollout_percent_default == 0
    assert settings.agent_rollout_percent_premium == 0
