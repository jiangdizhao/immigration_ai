from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace

from app.schemas.agent import AgentCitation, AgentExecutionMetrics, AgentSubmissionV2
from app.schemas.evidence import NativeWebEvidenceRef
from app.schemas.query import QueryRequest, QueryResponse
from app.schemas.state import MatterState
from app.services.default_agent_serving_service import DefaultAgentServingService


def _settings(**overrides):
    from app.core.config import Settings

    values = {
        "DATABASE_URL": "postgresql://test",
        "OPENAI_API_KEY": "test",
        "DEFAULT_AGENT_SERVING_ENABLED": True,
        "DEFAULT_AGENT_REASONING_EFFORT": "low",
        "AGENT_MAX_TOOL_ROUNDS": 2,
        "AGENT_MAX_PROVIDER_CALLS": 3,
        "AGENT_MAX_RETRIES": 1,
        "AGENT_MAX_FLAT_RAG_CALLS": 1,
        "DEFAULT_TURN_DEADLINE_MS": 60000,
        "DEFAULT_ANSWER_RESEARCH_TARGET_MS": 32000,
        "LEGAL_FACT_CHECK_TARGET_MS": 8000,
        "WEB_SEARCH_ENABLED": True,
        "EXACT_LEGAL_LOOKUP_ENABLED": True,
        "FLAT_RAG_TOOL_ENABLED": False,
        "COMPACT_MATTER_STATE_ENABLED": False,
        "COMPACT_CHECKER_ENABLED": False,
        "PHASE7_REASONING_BANK_RUNTIME_MODE": "shadow",
    }
    values.update(overrides)
    return Settings(**values)


class _FakeDB:
    def commit(self):
        pass

    def refresh(self, _matter):
        pass


class _FakeMatter:
    id = "matter-1"
    session_id = "session-1"
    frontend_chat_id = "chat-1"
    frontend_user_id = None
    metadata_json = {}


class _FakeLanguage:
    @staticmethod
    def detect_response_language(_question, requested):
        return requested or "en"


class _FakeStateMachine:
    @staticmethod
    def hydrate_state(_metadata):
        return MatterState()

    @staticmethod
    def append_turn_pair(*, state, user_question, effective_question, assistant_answer, next_action, confidence):
        state.latest_question = user_question
        state.last_contextualized_question = effective_question
        return state


class _FakeReview:
    def __init__(self):
        self.calls = []

    def safe_record_answer_trace(self, **kwargs):
        self.calls.append(kwargs)


class _FakeQueryService:
    def __init__(self):
        self.language_service = _FakeLanguage()
        self.state_machine = _FakeStateMachine()
        self.review_trace_service = _FakeReview()
        self.matter = _FakeMatter()
        self.updated = []

    def _get_or_create_matter(self, _db, _payload):
        return self.matter

    def _update_matter_from_state(self, **kwargs):
        self.updated.append(kwargs)


def _metrics():
    return AgentExecutionMetrics(
        turn_deadline_ms=60000,
        remaining_deadline_before_call_ms=60000,
        metrics_complete=True,
    )


def _submission(answer: str = "A bounded answer"):
    return AgentSubmissionV2(
        schema_version="agent_submission.v2",
        answer_class="general",
        draft_markdown=answer,
        claims=[],
        citations=[],
        research_status="not_required",
        state_patch=[],
    )


def test_serving_citations_are_resolved_from_the_current_registry(monkeypatch):
    from app.services import agent_runtime_service, default_agent_serving_service

    monkeypatch.setattr(default_agent_serving_service, "get_settings", lambda: _settings())
    registry_holder = {}

    class Runtime:
        def __init__(self, **_kwargs):
            pass

        async def run(self, _request, *, registry, **_kwargs):
            registry_holder["registry"] = registry
            ref = registry.register_native_web_evidence(
                evidence=NativeWebEvidenceRef(
                    evidence_ref="web:provider",
                    evidence_origin="openai_web_native",
                    source_type="web_page",
                    source_authenticity="official_copy",
                    authority_kind="operational_guidance",
                    jurisdiction="Cth",
                    binding_status="not_applicable",
                    court_or_tribunal_level=None,
                    retrieved_at=datetime.now(timezone.utc),
                    provenance_complete=True,
                    search_call_id="search-1",
                    url="https://example.gov.au/visa",
                    title="Official visa information",
                    native_web_citation=None,
                ),
                tool_call_id="search-1",
            )
            submission = _submission()
            submission = submission.model_copy(update={
                "citations": [AgentCitation(evidence_ref=ref, display_label="Official visa information")],
            })
            return SimpleNamespace(
                model="gpt-5.6-luna",
                submission=submission,
                metrics=_metrics(),
                checker_status="not_required",
                checker_provider_call_count=0,
                checker_result_tool_call_count=0,
                reasoning_bank_telemetry={"mode": "shadow", "guidance_injected": False},
            )

    monkeypatch.setattr(agent_runtime_service, "AgentRuntimeService", Runtime)
    monkeypatch.setattr(
        "app.services.openai_responses_adapter.OpenAIResponsesAdapter",
        lambda: object(),
    )
    response = DefaultAgentServingService().answer(
        query_service=_FakeQueryService(),
        db=_FakeDB(),
        payload=QueryRequest(question="What is a visa requirement?"),
    )

    assert response.citations[0].source_id.startswith("web:")
    assert response.citations[0].url == "https://example.gov.au/visa"
    assert response.retrieval_debug["evidence_registry"]["native_web_refs"] == 1
    assert registry_holder["registry"].is_disposed is True


def test_default_serving_uses_run_and_preserves_customer_answer(monkeypatch):
    from app.services import agent_runtime_service, default_agent_serving_service

    monkeypatch.setattr(default_agent_serving_service, "get_settings", lambda: _settings())
    calls = {"run": 0, "run_shadow": 0}

    class Runtime:
        def __init__(self, **_kwargs):
            pass

        async def run(self, *_args, **_kwargs):
            calls["run"] += 1
            metrics = _metrics().model_copy(update={"terminal_recovery_triggered": True})
            return SimpleNamespace(
                model="gpt-5.6-luna",
                submission=_submission("customer answer"),
                metrics=metrics,
                checker_status="not_required",
                checker_provider_call_count=0,
                checker_result_tool_call_count=0,
                reasoning_bank_telemetry={"mode": "shadow", "guidance_injected": False},
            )

        async def run_shadow(self, *_args, **_kwargs):  # pragma: no cover - guard against misuse
            calls["run_shadow"] += 1
            raise AssertionError("serving must not use run_shadow")

    monkeypatch.setattr(agent_runtime_service, "AgentRuntimeService", Runtime)
    monkeypatch.setattr(
        "app.services.openai_responses_adapter.OpenAIResponsesAdapter",
        lambda: object(),
    )

    query_service = _FakeQueryService()
    response = DefaultAgentServingService().answer(
        query_service=query_service,
        db=_FakeDB(),
        payload=QueryRequest(question="What is a visa requirement?", assistant_mode="default"),
    )

    assert response.answer == "customer answer"
    assert response.architecture_version == "phase2.default_agent_runtime"
    assert response.retrieval_debug["legacy_pfvd_skipped"] is True
    assert response.retrieval_debug["terminal_recovery"]["triggered"] is True
    assert response.retrieval_debug["execution_metrics"]["terminal_recovery_triggered"] is True
    assert calls == {"run": 1, "run_shadow": 0}
    assert len(query_service.updated) == 1
    assert len(query_service.review_trace_service.calls) == 1


def test_default_serving_failure_is_neutral_and_does_not_fallback(monkeypatch):
    from app.services import agent_runtime_service, default_agent_serving_service

    monkeypatch.setattr(default_agent_serving_service, "get_settings", lambda: _settings())

    class Runtime:
        def __init__(self, **_kwargs):
            pass

        async def run(self, *_args, **_kwargs):
            raise TimeoutError("bounded provider timeout")

    monkeypatch.setattr(agent_runtime_service, "AgentRuntimeService", Runtime)
    monkeypatch.setattr(
        "app.services.openai_responses_adapter.OpenAIResponsesAdapter",
        lambda: object(),
    )
    response = DefaultAgentServingService().answer(
        query_service=_FakeQueryService(),
        db=_FakeDB(),
        payload=QueryRequest(question="What is a visa requirement?"),
    )

    assert response.confidence == "low"
    assert response.next_action == "suggest_consultation"
    assert response.retrieval_debug["failure_neutral"] is True
    assert response.retrieval_debug["fallback_to_pfvd"] is False


def test_route_skips_shadow_when_default_agent_serving_is_selected(monkeypatch):
    from app.api.routes import query as query_route

    settings = _settings(AGENT_SHADOW_ENABLED=True)
    captured = {"shadow": 0, "handled": 0}

    class Service:
        def handle_query(self, _db, _payload):
            captured["handled"] += 1
            return QueryResponse(answer="answer", confidence="medium", next_action="answer")

    monkeypatch.setattr(query_route, "get_settings", lambda: settings)
    monkeypatch.setattr(query_route, "_schedule_shadow_run", lambda **_kwargs: captured.__setitem__("shadow", 1))
    monkeypatch.setattr(query_route, "QueryService", Service)
    monkeypatch.setattr(query_route, "political_failsafe_service", SimpleNamespace(
        evaluate_payload=lambda _payload: SimpleNamespace(
            decision="allow",
            policy_version="test",
            policy_hash="hash",
            timings=SimpleNamespace(total_ms=0),
        ),
        sanitize_payload_history=lambda payload: payload,
    ))

    response = query_route.run_query(QueryRequest(question="A simple question"), db=_FakeDB())

    assert response.answer == "answer"
    assert captured == {"shadow": 0, "handled": 1}
