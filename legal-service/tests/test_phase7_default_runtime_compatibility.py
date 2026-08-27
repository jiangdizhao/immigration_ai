"""Focused Phase 7 Default-runtime compatibility regression tests."""

from inspect import signature
from types import SimpleNamespace

from app.schemas.learning import ReasoningBankRuntimeResult
from app.schemas.query import QueryRequest, QueryResponse
from app.schemas.semantic_contracts import SemanticTurnAnalysis
from app.schemas.state import MatterState
from app.services.proposal_first_verification_depth_answer_service import (
    ProposalFirstVerificationDepthAnswerService,
)
from app.services.query_service import QueryService
from app.services import unified_context_runtime_patch  # noqa: F401


def test_unified_default_forwards_empty_guidance_without_pfvd_fallback(monkeypatch):
    """The unified Default call must match the frozen PFVD compatibility contract."""

    # This fixture exercises the pre-AgentRuntime PFVD compatibility contract.
    # Keep the serving switch explicit so a developer's .env cannot route the
    # test into DefaultAgentServingService, whose production language-service
    # contract is intentionally different.
    monkeypatch.setattr(
        unified_context_runtime_patch,
        "get_settings",
        lambda: SimpleNamespace(default_agent_serving_enabled=False),
    )

    answer_parameter = signature(
        ProposalFirstVerificationDepthAnswerService.answer
    ).parameters["reasoning_bank_guidance"]
    assert answer_parameter.default == ""

    captured: dict[str, object] = {}

    class FakeLanguageService:
        def prepare_turn(self, **_kwargs):
            return SimpleNamespace(internal_question_en="A legal question", response_language="en")

    class FakeStateMachine:
        def hydrate_state(self, _metadata):
            return MatterState()

        def append_turn_pair(self, *, state, **_kwargs):
            return state

    class FakeMemoryService:
        def build(self, **_kwargs):
            return SimpleNamespace(stable_facts={}, active_focus={}, full_conversation_history=[])

    class FakeReasoningBankRuntime:
        runtime_mode = "off"

        def retrieve(self, _db, query):
            captured["query"] = query
            return ReasoningBankRuntimeResult(
                runtime_mode="off", retrieval_status="disabled"
            )

        def prompt_block(self, _result):
            return ""

        def telemetry(self, _result):
            return {
                "mode": "off",
                "bank_namespace": "real",
                "selected_rule_keys": [],
                "selected_rule_versions": {},
                "relevance_scores": {},
                "retrieval_status": "disabled",
                "error_code": None,
            }

    class CapturingPFVD:
        def answer(self, **kwargs):
            captured.update(kwargs)
            return QueryResponse(
                answer="deterministic answer",
                response_language="en",
                confidence="medium",
                next_action="answer",
                retrieval_debug={"proposal_first_verification_depth": {}},
            )

    matter = SimpleNamespace(id="matter-1", session_id=None, metadata_json={})
    db = SimpleNamespace(
        commit=lambda: None,
        refresh=lambda _matter: None,
    )
    service = object.__new__(QueryService)
    service.language_service = FakeLanguageService()
    service.state_machine = FakeStateMachine()
    service.unified_conversation_memory_service = FakeMemoryService()
    service.reasoning_bank_runtime_service = FakeReasoningBankRuntime()
    service.proposal_first_verification_depth_answer_service = CapturingPFVD()
    service.review_trace_service = SimpleNamespace(
        safe_record_answer_trace=lambda **_kwargs: None
    )
    service._get_or_create_matter = lambda _db, _payload: matter
    service._analyze_semantic_turn = lambda **_kwargs: SemanticTurnAnalysis()
    service._should_use_general_topic_fast_path = lambda **_kwargs: False
    service._update_matter_from_state = lambda **_kwargs: None

    response = QueryService.handle_query(
        service,
        db,
        QueryRequest(question="A legal question", response_language="en"),
    )

    assert response.answer == "deterministic answer"
    assert captured["reasoning_bank_guidance"] == ""
    assert response.retrieval_debug["reasoning_bank"]["mode"] == "off"
    assert response.retrieval_debug["reasoning_bank"]["guidance_injected"] is False
    assert "fallback_to_original_handler" not in response.retrieval_debug.get(
        "proposal_first_verification_depth", {}
    )
