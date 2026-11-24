from __future__ import annotations

import asyncio
import time
from datetime import date
from types import SimpleNamespace

from app.schemas.agent import (
    AIActionSuggestionV1,
    AgentExecutionMetrics,
    AgentRuntimeRequest,
    AgentSubmissionV2,
    ExecutionBudget,
)
from app.schemas.query import ProjectAssistantContextPacket, QueryRequest
from app.services.agent_policy_service import AgentPolicyService
from app.services.agent_runtime_service import (
    AbsoluteTurnDeadline,
    AgentRuntimeService,
    ProviderInterface,
    ProviderResponse,
)
from app.services.project_action_suggestion_service import (
    project_action_suggestion_field_path,
    validate_project_action_suggestion,
)
from app.services.request_evidence_registry import create_registry
from app.services.tool_executor_service import ToolCallRequest


PROJECT_ID = "11111111-1111-4111-8111-111111111111"
CHAT_ID = "22222222-2222-4222-8222-222222222222"
SCHOOL_ID = "33333333-3333-4333-8333-333333333333"
SCHOOL_2_ID = "44444444-4444-4444-8444-444444444444"
STUDENT_ID = "55555555-5555-4555-8555-555555555555"


def _context(*, workflow="school_application", target_id=SCHOOL_ID, schools=None):
    schools = schools or [{
        "applicationId": SCHOOL_ID,
        "institutionName": "Northbridge College",
        "provenanceRevision": 5,
    }]
    is_student = workflow == "student_500"
    target_kind = "student500_application" if is_student else "school_application"
    target_id = STUDENT_ID if is_student else target_id
    step_key = "visa_planning" if is_student else "school_discovery"
    index_rows = {
        "schoolApplications": schools,
        "linkedAdmissions": [],
        "standaloneAdmissions": [],
        "unresolvedLinkedAdmissions": [],
        "student500Applications": ([{
            "applicationId": STUDENT_ID,
            "provenanceRevision": 3,
        }] if is_student else []),
    }
    detail_rows = {
        "schoolApplications": [],
        "standaloneAdmissions": [],
        "unresolvedLinkedAdmissions": [],
        "student500Applications": [],
    }
    omissions = {
        "schoolApplications": len(schools),
        "standaloneAdmissions": 0,
        "unresolvedLinkedAdmissions": 0,
        "student500Applications": 1 if is_student else 0,
        "unresolvedIssues": 0,
        "nextActions": 0,
        "linkedAdmissions": 0,
        "admissionsCases": 0,
    }
    task = {
        "applicability": "applicable",
        "progress": "in_progress",
        "reasonCodes": [],
        "dependencies": [],
        "actionability": "read_only",
    }
    source_revisions = [{
        "targetKind": target_kind,
        "targetId": target_id,
        "revision": 3 if is_student else 5,
    }]
    return ProjectAssistantContextPacket.model_validate({
        "schemaVersion": "phase15.project-assistant-context.v1",
        "contextOrigin": "project_chat",
        "availability": "available",
        "reasonCode": None,
        "consistency": "live_per_source_revision",
        "project": {"id": PROJECT_ID, "status": "active"},
        "capabilities": None,
        "facts": None,
        "factContext": {"state": "unknown", "omitted": None},
        "indexes": index_rows,
        "matters": detail_rows,
        "unresolvedIssues": [],
        "nextActions": [],
        "omissions": omissions,
        "activeStep": {
            "schemaVersion": "phase15.active-step-context.v1",
            "projectId": PROJECT_ID,
            "chatId": CHAT_ID,
            "definitionVersion": "phase15.project-workflows.v1",
            "taskId": f"{workflow}:{step_key}:{target_id}",
            "workflowKind": workflow,
            "stepKey": step_key,
            "targetKind": target_kind,
            "targetId": target_id,
            "task": task,
            "sourceRevisions": source_revisions,
            "sourceCoverage": "complete",
            "matter": {"kind": target_kind},
        },
    })


def _school_suggestion(**overrides):
    return {
        "schema_version": "phase15.ai-action-suggestion.v1",
        "operation": "set_customer_reported_field",
        "field_path": "schoolApplication.intakeLabel",
        "proposed_value": "July 2027",
        "target_reference": None,
        "source_or_assumption": "The user requested July 2027.",
        "explanation": "This is a customer-reported intake label.",
        **overrides,
    }


def test_project_suggestion_is_bound_to_exact_authorized_task_and_target():
    context = _context()
    assert project_action_suggestion_field_path(context, CHAT_ID) == (
        "schoolApplication.intakeLabel"
    )
    suggestion = validate_project_action_suggestion(
        type("Suggestion", (), _school_suggestion())(), context, CHAT_ID
    )
    assert suggestion is None  # raw untyped objects are never accepted

    parsed = AIActionSuggestionV1.model_validate(_school_suggestion())
    assert validate_project_action_suggestion(parsed, context, CHAT_ID) == parsed
    assert validate_project_action_suggestion(parsed, context, "different-chat") is None
    assert validate_project_action_suggestion(parsed, None, CHAT_ID) is None


def test_multi_school_requires_one_exact_reference_and_rejects_wrong_or_duplicate_target():
    schools = [
        {"applicationId": SCHOOL_ID, "institutionName": "Northbridge College", "provenanceRevision": 5},
        {"applicationId": SCHOOL_2_ID, "institutionName": "Southport Institute", "provenanceRevision": 2},
    ]
    context = _context(schools=schools)
    from app.schemas.agent import AIActionSuggestionV1

    no_reference = AIActionSuggestionV1.model_validate(_school_suggestion())
    correct = AIActionSuggestionV1.model_validate(_school_suggestion(target_reference="Northbridge College"))
    wrong = AIActionSuggestionV1.model_validate(_school_suggestion(target_reference=SCHOOL_2_ID))
    duplicate_name = _context(schools=[
        schools[0],
        {"applicationId": SCHOOL_2_ID, "institutionName": "Northbridge College", "provenanceRevision": 2},
    ])
    assert validate_project_action_suggestion(no_reference, context, CHAT_ID) is None
    assert validate_project_action_suggestion(correct, context, CHAT_ID) == correct
    assert validate_project_action_suggestion(wrong, context, CHAT_ID) is None
    assert validate_project_action_suggestion(correct, duplicate_name, CHAT_ID) is None


def test_student500_suggestion_is_only_customer_reported_application_place():
    context = _context(workflow="student_500")
    suggestion = AIActionSuggestionV1.model_validate({
        "schema_version": "phase15.ai-action-suggestion.v1",
        "operation": "set_customer_reported_field",
        "field_path": "student500.applicationPlace",
        "proposed_value": "offshore",
        "source_or_assumption": "The user stated they will apply offshore.",
        "explanation": "This records reported application place only.",
    })
    assert project_action_suggestion_field_path(context, CHAT_ID) == (
        "student500.applicationPlace"
    )
    assert validate_project_action_suggestion(suggestion, context, CHAT_ID) == suggestion
    assert project_action_suggestion_field_path(context, "other-chat") is None


def test_context_authorization_staleness_and_unsupported_fields_fail_closed():
    suggestion = AIActionSuggestionV1.model_validate(_school_suggestion())
    closed = _context().model_copy(update={"project": {"id": PROJECT_ID, "status": "closed"}})
    stale_index = _context()
    stale_index.indexes["schoolApplications"][0]["provenanceRevision"] = 4
    partial = _context()
    partial.consistency = "unknown"
    assert validate_project_action_suggestion(suggestion, closed, CHAT_ID) is None
    assert validate_project_action_suggestion(suggestion, stale_index, CHAT_ID) is None
    assert validate_project_action_suggestion(suggestion, partial, CHAT_ID) is None


def test_research_output_contract_is_required_only_for_eligible_default_task():
    policy_service = AgentPolicyService()
    disabled = policy_service.build_policy(mode="default", experiment_arm="N")
    enabled = policy_service.build_policy(
        mode="default",
        experiment_arm="N",
        project_action_suggestion_field_path="schoolApplication.intakeLabel",
    )
    course_enabled = policy_service.build_policy(
        mode="default",
        experiment_arm="N",
        course_research_enabled=True,
    )
    premium = policy_service.build_policy(
        mode="premium",
        project_action_suggestion_field_path="schoolApplication.intakeLabel",
    )
    disabled_submit = next(tool for tool in disabled.tools if tool.get("name") == "submit_answer")
    enabled_submit = next(tool for tool in enabled.tools if tool.get("name") == "submit_answer")
    premium_submit = next(tool for tool in premium.tools if tool.get("name") == "submit_answer")
    course_submit = next(tool for tool in course_enabled.tools if tool.get("name") == "submit_answer")
    assert "ai_action_suggestion" not in disabled_submit["parameters"]["properties"]
    assert enabled_submit["parameters"]["properties"]["ai_action_suggestion"]["properties"]["field_path"]["enum"] == [
        "schoolApplication.intakeLabel"
    ]
    assert "ai_action_suggestion" not in premium_submit["parameters"]["properties"]
    assert "ai_action_suggestion" not in enabled_submit["parameters"]["required"]
    course_schema = course_submit["parameters"]["properties"]["course_research_suggestion"]
    assert course_schema["properties"]["candidates"]["maxItems"] == 6
    assert course_schema["properties"]["candidates"]["items"]["properties"]["fields"]["maxItems"] == 12
    assert "course_research_suggestion" in course_submit["parameters"]["required"]
    assert course_schema["required"] == ["schema_version", "research_status", "candidates"]
    assert "Required Conditional Course Research Result" in course_enabled.system_prompt
    assert "research_status" in course_schema["properties"]
    assert "course_research_suggestion" not in premium_submit["parameters"]["properties"]


def test_responses_adapter_transmits_the_required_research_schema_without_rewriting_it(monkeypatch):
    from app.services.openai_responses_adapter import OpenAIResponsesAdapter
    from app.core.config import Settings

    settings = Settings(
        _env_file=None,
        DATABASE_URL="postgresql://test",
        OPENAI_API_KEY="offline-test-key",
        FLAT_RAG_TOOL_ENABLED=False,
    )
    monkeypatch.setattr("app.services.agent_policy_service.get_settings", lambda: settings)
    monkeypatch.setattr("app.services.openai_responses_adapter.get_settings", lambda: settings)
    policy = AgentPolicyService().build_policy(
        mode="default", experiment_arm="N", course_research_enabled=True
    )
    captured = {}

    class FakeResponses:
        def create(self, **kwargs):
            captured.update(kwargs)
            return SimpleNamespace(id="offline-response", output=[], output_text="")

    adapter = OpenAIResponsesAdapter(client=SimpleNamespace(responses=FakeResponses()))
    registry = create_registry("r5-provider-schema-test")
    response = asyncio.run(
        adapter.call(
            system_prompt=policy.system_prompt,
            user_text="Research course options.",
            model=policy.model,
            tools=policy.tools,
            tool_choice=policy.tool_choice,
            reasoning_effort=policy.reasoning_effort,
            timeout_ms=1000,
            registry=registry,
        )
    )
    assert response.status == "ok"
    transmitted = next(tool for tool in captured["tools"] if tool.get("name") == "submit_answer")
    assert transmitted["strict"] is False
    assert "course_research_suggestion" in transmitted["parameters"]["required"]
    assert transmitted["parameters"]["properties"]["course_research_suggestion"]["required"] == [
        "schema_version",
        "research_status",
        "candidates",
    ]
    registry.dispose()


class _TerminalSubmitProvider(ProviderInterface):
    def __init__(self, suggestion, course_suggestion=None):
        self.suggestion = suggestion
        self.course_suggestion = course_suggestion
        self.calls = 0
        self.submission_tool = None

    async def call(self, **kwargs):
        self.calls += 1
        self.submission_tool = next(
            tool for tool in kwargs["tools"] if tool.get("name") == "submit_answer"
        )
        args = {
            "schema_version": "agent_submission.v2",
            "answer_class": "general",
            "draft_markdown": "I can help record that customer-reported intake.",
            "claims": [],
            "citations": [],
            "research_status": "not_required",
            "state_patch": [],
        }
        if self.suggestion is not None:
            args["ai_action_suggestion"] = self.suggestion
        if self.course_suggestion is not None:
            args["course_research_suggestion"] = self.course_suggestion
        return ProviderResponse(
            response_id=f"provider-{self.calls}",
            model="gpt-5.6-luna",
            status="ok",
            tool_calls=[ToolCallRequest(
                call_id="submit-1",
                name="submit_answer",
                arguments=args,
            )],
        )


def _runtime_request(field_path, *, course_research_enabled=False):
    return AgentRuntimeRequest(
        request_id="r2-suggestion-test",
        turn_id="r2-suggestion-turn",
        mode="default",
        user_text="Please help change the intake.",
        response_language="en",
        as_of_date=date(2026, 11, 24),
        matter_state={},
        execution_budget=ExecutionBudget(
            max_tool_rounds=1,
            max_provider_calls=1,
            max_retries=0,
            turn_deadline_ms=30000,
            answer_research_target_ms=20000,
            checker_target_ms=5000,
            max_flat_rag_calls=0,
            retry_viability_threshold_ms=0,
            terminal_synthesis_target_ms=10000,
            final_response_reserve_ms=1000,
            terminal_synthesis_min_start_budget_ms=1000,
        ),
        experiment_arm="N",
        project_action_suggestion_field_path=field_path,
        course_research_enabled=course_research_enabled,
    )


def _course_suggestion():
    return {
        "schema_version": "phase15.course-research-suggestion.v1",
        "candidates": [{
            "institution_name": "Example University",
            "course_title": "Master of Example Studies",
            "identity_source_locators": [],
            "fields": [{
                "key": "qualification",
                "value": "Master's degree",
                "source_locators": [],
            }],
            "source_locators": [],
            "limitations": ["Current intake and fees are unknown."],
        }],
    }


def test_default_runtime_transports_suggestion_in_existing_single_terminal_call(monkeypatch):
    from app.core.config import Settings

    settings = Settings(
        _env_file=None,
        DATABASE_URL="postgresql://test",
        OPENAI_API_KEY="test",
        DEFAULT_AGENT_REASONING_EFFORT="low",
        COMPACT_CHECKER_ENABLED=False,
        FLAT_RAG_TOOL_ENABLED=False,
    )
    monkeypatch.setattr("app.services.agent_policy_service.get_settings", lambda: settings)
    suggestion = _school_suggestion()
    provider = _TerminalSubmitProvider(suggestion)
    registry = create_registry("r2-suggestion-test")
    result = asyncio.run(AgentRuntimeService(provider=provider).run(
        _runtime_request("schoolApplication.intakeLabel"),
        deadline=AbsoluteTurnDeadline(time.perf_counter(), 30000),
        registry=registry,
    ))
    assert provider.calls == 1
    assert "ai_action_suggestion" in provider.submission_tool["parameters"]["properties"]
    assert result.submission is not None
    assert result.submission.ai_action_suggestion is not None
    assert result.submission.ai_action_suggestion.proposed_value == "July 2027"
    registry.dispose()


def test_default_runtime_transports_optional_course_candidates_without_an_extra_call(monkeypatch):
    from app.core.config import Settings

    settings = Settings(
        _env_file=None,
        DATABASE_URL="postgresql://test",
        OPENAI_API_KEY="test",
        DEFAULT_AGENT_REASONING_EFFORT="low",
        COMPACT_CHECKER_ENABLED=False,
        FLAT_RAG_TOOL_ENABLED=False,
    )
    monkeypatch.setattr("app.services.agent_policy_service.get_settings", lambda: settings)
    suggestion = _course_suggestion()
    provider = _TerminalSubmitProvider(None, suggestion)
    registry = create_registry("r3-course-runtime-test")
    result = asyncio.run(AgentRuntimeService(provider=provider).run(
        _runtime_request(None, course_research_enabled=True),
        deadline=AbsoluteTurnDeadline(time.perf_counter(), 30000),
        registry=registry,
    ))
    assert provider.calls == 1
    schema = provider.submission_tool["parameters"]["properties"]["course_research_suggestion"]
    assert schema["properties"]["candidates"]["maxItems"] == 6
    assert result.submission is not None
    assert result.submission.draft_markdown == "I can help record that customer-reported intake."
    assert result.submission.course_research_suggestion == suggestion
    assert result.metrics.course_research_enabled is True
    assert result.metrics.course_research_tool_exposed is True
    assert result.metrics.course_research_prompt_enabled is True
    assert result.metrics.course_research_provider_schema_status == "required"
    registry.dispose()


def test_unavailable_project_context_drops_model_suggestion_without_failing_answer(monkeypatch):
    from app.core.config import Settings

    settings = Settings(
        _env_file=None,
        DATABASE_URL="postgresql://test",
        OPENAI_API_KEY="test",
        DEFAULT_AGENT_REASONING_EFFORT="low",
        COMPACT_CHECKER_ENABLED=False,
        FLAT_RAG_TOOL_ENABLED=False,
    )
    monkeypatch.setattr("app.services.agent_policy_service.get_settings", lambda: settings)
    provider = _TerminalSubmitProvider(_school_suggestion())
    registry = create_registry("r2-suggestion-disabled")
    result = asyncio.run(AgentRuntimeService(provider=provider).run(
        _runtime_request(None),
        deadline=AbsoluteTurnDeadline(time.perf_counter(), 30000),
        registry=registry,
    ))
    assert provider.calls == 1
    assert "ai_action_suggestion" not in provider.submission_tool["parameters"]["properties"]
    assert result.submission is not None
    assert result.submission.draft_markdown == "I can help record that customer-reported intake."
    assert result.submission.ai_action_suggestion is None
    registry.dispose()


def test_default_serving_binds_runtime_suggestion_to_the_fresh_chat_context(monkeypatch):
    from app.core.config import Settings
    from app.schemas.state import MatterState
    from app.services import agent_runtime_service, default_agent_serving_service
    from app.services.default_agent_serving_service import DefaultAgentServingService

    settings = Settings(
        _env_file=None,
        DATABASE_URL="postgresql://test",
        OPENAI_API_KEY="test",
        DEFAULT_AGENT_SERVING_ENABLED=True,
        DEFAULT_AGENT_REASONING_EFFORT="low",
        AGENT_MAX_TOOL_ROUNDS=2,
        AGENT_MAX_PROVIDER_CALLS=3,
        AGENT_MAX_RETRIES=0,
        AGENT_MAX_FLAT_RAG_CALLS=0,
        DEFAULT_TURN_DEADLINE_MS=60000,
        DEFAULT_ANSWER_RESEARCH_TARGET_MS=32000,
        LEGAL_FACT_CHECK_TARGET_MS=8000,
        WEB_SEARCH_ENABLED=True,
        EXACT_LEGAL_LOOKUP_ENABLED=True,
        FLAT_RAG_TOOL_ENABLED=False,
        COMPACT_MATTER_STATE_ENABLED=False,
        COMPACT_CHECKER_ENABLED=False,
        PHASE7_REASONING_BANK_RUNTIME_MODE="shadow",
    )
    monkeypatch.setattr(default_agent_serving_service, "get_settings", lambda: settings)
    captured = {}

    class Runtime:
        def __init__(self, **_kwargs):
            pass

        async def run(self, request, **_kwargs):
            captured["request"] = request
            submission = AgentSubmissionV2(
                schema_version="agent_submission.v2",
                answer_class="general",
                draft_markdown="I can help record that customer-reported intake.",
                research_status="not_required",
                ai_action_suggestion=AIActionSuggestionV1.model_validate(
                    _school_suggestion()
                ),
                course_research_suggestion=_course_suggestion(),
            )
            return SimpleNamespace(
                model="gpt-5.6-luna",
                submission=submission,
                metrics=AgentExecutionMetrics(
                    turn_deadline_ms=60000,
                    remaining_deadline_before_call_ms=60000,
                    metrics_complete=True,
                ),
                checker_status="not_required",
                checker_provider_call_count=0,
                checker_result_tool_call_count=0,
                reasoning_bank_telemetry={"mode": "shadow", "guidance_injected": False},
                terminal_continuation_triggered=False,
            )

    monkeypatch.setattr(agent_runtime_service, "AgentRuntimeService", Runtime)
    monkeypatch.setattr(
        "app.services.openai_responses_adapter.OpenAIResponsesAdapter",
        lambda: object(),
    )

    matter = SimpleNamespace(
        id="matter-test",
        session_id="session-test",
        frontend_chat_id=CHAT_ID,
        frontend_user_id=None,
        metadata_json={},
    )
    state = MatterState()

    class QueryService:
        language_service = SimpleNamespace(
            detect_response_language=lambda _question, requested: requested or "en"
        )
        state_machine = SimpleNamespace(
            hydrate_state=lambda _metadata: state,
            append_turn_pair=lambda **kwargs: kwargs["state"],
        )
        review_trace_service = SimpleNamespace(
            safe_record_answer_trace=lambda **_kwargs: "trace-r2"
        )

        @staticmethod
        def _get_or_create_matter(_db, _payload):
            return matter

        @staticmethod
        def _update_matter_from_state(**_kwargs):
            return None

    class DB:
        @staticmethod
        def commit():
            return None

        @staticmethod
        def refresh(_matter):
            return None

    course_context = _context()
    course_context.activeStep.sourceRevisions[0].revision = 5
    response = DefaultAgentServingService().answer(
        query_service=QueryService(),
        db=DB(),
        payload=QueryRequest(
            question="Please help change the intake.",
            frontend_chat_id=CHAT_ID,
            assistant_mode="default",
            project_assistant_context=course_context,
        ),
    )
    assert captured["request"].course_research_enabled is True
    assert captured["request"].project_action_suggestion_field_path == (
        "schoolApplication.intakeLabel"
    )
    assert response.ai_action_suggestion is not None
    assert response.ai_action_suggestion.proposed_value == "July 2027"
    assert response.course_research_result is not None
    assert response.course_research_result["projectId"] == PROJECT_ID
    assert response.course_research_result["chatId"] == CHAT_ID
    assert response.course_research_result["candidates"][0]["identityEvidenceLevel"] == "model_research_lead"
    assert response.course_research_result["candidates"][0]["fields"][0]["evidenceLevel"] == "model_research_lead"
