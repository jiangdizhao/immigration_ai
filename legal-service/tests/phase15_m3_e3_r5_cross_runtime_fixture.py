"""Offline, synthetic Responses-to-Workspace integration fixture for M3-E3-R5.

This runner accepts a Project context produced by the real TypeScript request
builder. It uses the real Default policy, Responses adapter, runtime, terminal
ToolExecutor, evidence registry, research bridge and QueryResponse serializer,
but an in-memory fake Responses client. It never opens a database or network
connection and never calls a model provider.
"""

from __future__ import annotations

import json
import sys
import time
from copy import deepcopy
from contextlib import ExitStack
from datetime import date
from pathlib import Path
from typing import Any
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import Settings
from app.schemas.agent import AgentRuntimeRequest, ExecutionBudget
from app.schemas.query import QueryRequest
from app.services.agent_observability_service import AbsoluteTurnDeadline
from app.services.agent_policy_service import AgentPolicyService
from app.services.agent_runtime_service import AgentRuntimeService
from app.services.course_research_bridge import (
    bind_course_research_suggestion_with_diagnostics,
    course_research_activation_reason,
)
from app.services.default_agent_serving_service import DefaultAgentServingService
from app.services.openai_responses_adapter import OpenAIResponsesAdapter
from app.services.reasoning_bank_runtime_service import ReasoningBankRuntimeService
from app.services.request_evidence_registry import create_registry

LONG_UTS_COURSE_URL = (
    "https://www.uts.edu.au/study/find-a-course/"
    + "catalog/" * 140
    + "master-artificial-intelligence"
)

COURSE_SOURCES = [
    {
        "url": "https://cricos.education.gov.au/course/0100000A",
        "title": "Synthetic CRICOS course record",
    },
    {
        "url": LONG_UTS_COURSE_URL,
        "title": "UTS Master of Artificial Intelligence",
    },
    {
        "url": "https://www.sydney.edu.au/courses/courses/pc/master-of-computer-science.html",
        "title": "University of Sydney Master of Computer Science",
    },
    {
        "url": "https://www.unsw.edu.au/study/postgraduate/master-of-information-technology",
        "title": "UNSW Master of Information Technology",
    },
]


def _candidate(
    *,
    institution: str,
    title: str,
    source_url: str | None,
    cricos: str | None = None,
    malformed_locator: bool = False,
) -> dict[str, Any]:
    field_locators = [source_url] if source_url else []
    fields: list[dict[str, Any]] = [
        {
            "key": "qualification",
            "value": "Master degree" if source_url else None,
            "source_locators": field_locators,
        },
        {
            "key": "intake",
            "value": None,
            "source_locators": [],
            "applicability_note": "2027 intake is not confirmed.",
        },
        {
            "key": "tuition_amount",
            "value": None,
            "source_locators": [],
            "applicability_note": "Current tuition is not confirmed.",
        },
    ]
    if cricos is not None:
        fields.append(
            {
                "key": "cricos_code",
                "value": cricos,
                "source_locators": [COURSE_SOURCES[0]["url"]],
            }
        )
    if malformed_locator:
        fields.append(
            {
                "key": "course_code",
                "value": "SYD-ALPHA",
                "source_locators": ["turn102913search999"],
            }
        )
    locators = [source_url] if source_url else []
    if malformed_locator:
        locators.append("turn102913search999")
    return {
        "institution_name": institution,
        "course_title": title,
        "identity_source_locators": locators,
        "source_locators": locators,
        "fields": fields,
        "limitations": ["Course availability, intake and fees require confirmation."],
    }


def _submission(answer: str) -> dict[str, Any]:
    candidates = [
        _candidate(
            institution="Macquarie University",
            title="Master of Information Technology — Applied Artificial Intelligence",
            source_url=COURSE_SOURCES[0]["url"],
            cricos="0100000A",
        ),
        _candidate(
            institution="University of Technology Sydney",
            title="Master of Artificial Intelligence",
            source_url=COURSE_SOURCES[1]["url"],
        ),
        _candidate(
            institution="The University of Sydney",
            title="Master of Computer Science — Data Science and AI",
            source_url=COURSE_SOURCES[2]["url"],
            malformed_locator=True,
        ),
        _candidate(
            institution="UNSW Sydney",
            title="Master of Information Technology — Artificial Intelligence",
            source_url="https://unobserved.example/unsw/master-of-information-technology",
        ),
    ]
    citations = [
        {
            "native_web_locator": {"url": source["url"]},
            "display_label": source["title"],
        }
        for source in COURSE_SOURCES
    ]
    return {
        "schema_version": "agent_submission.v2",
        "answer_class": "general",
        "draft_markdown": answer,
        "claims": [],
        "citations": citations,
        "research_status": "complete",
        "state_patch": [],
        "customer_documents_used": [],
        "course_research_suggestion": {
            "schema_version": "phase15.course-research-suggestion.v1",
            "research_status": "completed",
            "candidates": candidates,
        },
    }


class FakeResponses:
    def __init__(
        self,
        submission: dict[str, Any],
        answer: str,
        *,
        terminal_recovery: bool = False,
    ) -> None:
        self.submission = submission
        self.answer = answer
        self.terminal_recovery = terminal_recovery
        self.request: dict[str, Any] | None = None
        self.requests: list[dict[str, Any]] = []
        self.calls = 0

    def create(self, **kwargs: Any) -> dict[str, Any]:
        self.calls += 1
        self.request = kwargs
        self.requests.append(kwargs)
        if self.terminal_recovery and self.calls == 1:
            raise TimeoutError("synthetic initial research timeout")

        terminal_only = self.terminal_recovery and self.calls == 2
        submission = deepcopy(self.submission)
        answer = self.answer
        if terminal_only:
            answer = "The research stage timed out; no course leads were returned."
            submission["draft_markdown"] = answer
            submission["citations"] = []
            submission["course_research_suggestion"] = {
                "schema_version": "phase15.course-research-suggestion.v1",
                "research_status": "not_performed",
                "candidates": [],
            }
        annotations = [
            {
                "type": "url_citation",
                "url": source["url"],
                "title": source["title"],
                "start_index": index * 2,
                "end_index": index * 2 + 1,
            }
            for index, source in enumerate(COURSE_SOURCES)
            if not terminal_only
        ]
        output = []
        if not terminal_only:
            output.append(
                {
                    "id": "synthetic-search-call",
                    "type": "web_search_call",
                    "status": "completed",
                    "action": {
                        "type": "search",
                        "queries": [
                            "official Australian postgraduate AI course pages"
                        ],
                        "sources": COURSE_SOURCES,
                    },
                }
            )
        output.extend(
            [
                {
                    "id": "synthetic-message",
                    "type": "message",
                    "status": "completed",
                    "content": [
                        {
                            "type": "output_text",
                            "text": answer,
                            "annotations": annotations,
                        }
                    ],
                },
                {
                    "id": "synthetic-submit-call",
                    "type": "function_call",
                    "status": "completed",
                    "call_id": "synthetic-submit-call-id",
                    "name": "submit_answer",
                    "arguments": json.dumps(
                        submission, ensure_ascii=False, separators=(",", ":")
                    ),
                },
            ]
        )
        return {
            "id": "synthetic-r5-response",
            "status": "completed",
            "output_text": answer,
            "usage": {"input_tokens": 200, "output_tokens": 160},
            "output": output,
        }


def run_cross_runtime_fixture(request_payload: dict[str, Any]) -> dict[str, Any]:
    """Run one synthetic provider response through production runtime modules."""
    terminal_recovery = bool(
        request_payload.pop("__synthetic_terminal_recovery", False)
    )
    expected_scope_fingerprint = request_payload.pop(
        "__expected_scope_fingerprint", None
    )
    query = QueryRequest.model_validate(
        {
            **request_payload,
            "assistant_mode": "default",
            "question": request_payload.get(
                "question",
                "请比较四个适合国际学生的澳大利亚人工智能硕士课程。",
            ),
            "frontend_chat_id": request_payload.get("frontend_chat_id")
            or request_payload.get("project_assistant_context", {})
            .get("activeStep", {})
            .get("chatId"),
        }
    )
    context = query.project_assistant_context
    enabled, activation_reason = course_research_activation_reason(
        context, query.frontend_chat_id
    )
    if not enabled:
        raise AssertionError(f"synthetic context did not activate research: {activation_reason}")

    answer = (
        "以下四项是本轮研究得到的课程线索，适合进一步比较；2027 年入学时间和学费仍需向学校确认。"
        " \uE200cite\uE202turn102913search6\uE202turn102913search12\uE201"
    )
    synthetic_submission = _submission(answer)
    fake_responses = FakeResponses(
        synthetic_submission,
        answer,
        terminal_recovery=terminal_recovery,
    )
    synthetic_settings = Settings(
        _env_file=None,
        DATABASE_URL="postgresql://synthetic.invalid/no-connection",
        OPENAI_API_KEY="synthetic-test-key-never-used",
        COMPACT_CHECKER_ENABLED=False,
        PHASE7_REASONING_BANK_RUNTIME_MODE="off",
        FLAT_RAG_TOOL_ENABLED=False,
        LEGAL_EVIDENCE_POSTCONDITION_ENABLED=False,
    )

    with ExitStack() as stack:
        for module_name in (
            "app.services.agent_policy_service",
            "app.services.agent_runtime_service",
            "app.services.openai_responses_adapter",
            "app.services.default_agent_serving_service",
        ):
            stack.enter_context(
                patch(f"{module_name}.get_settings", return_value=synthetic_settings)
            )
        adapter = OpenAIResponsesAdapter(
            client=type("FakeClient", (), {"responses": fake_responses})(),
            native_web_max_tool_calls=2,
        )
        budget = ExecutionBudget(
            max_tool_rounds=2,
            max_provider_calls=2,
            max_retries=0,
            turn_deadline_ms=30_000,
            answer_research_target_ms=20_000,
            checker_target_ms=8_000,
            max_flat_rag_calls=0,
            retry_viability_threshold_ms=0,
            terminal_synthesis_target_ms=5_000,
            final_response_reserve_ms=1_000,
            terminal_synthesis_min_start_budget_ms=1_000,
            terminal_recovery_target_ms=5_000,
            terminal_recovery_min_start_budget_ms=1_000,
        )
        runtime_request = AgentRuntimeRequest(
            request_id="phase15-m3-e3-r5-synthetic",
            turn_id="phase15-m3-e3-r5-synthetic-turn",
            mode="default",
            user_text=query.question,
            response_language=query.response_language or "zh",
            as_of_date=date(2026, 11, 24),
            matter_state={},
            execution_budget=budget,
            experiment_arm="N",
            applicability_protocol_enabled=False,
            project_context="",
            project_assistant_context=json.dumps(
                context.model_dump(mode="json") if context else {},
                ensure_ascii=False,
                separators=(",", ":"),
            ),
            course_research_enabled=enabled,
        )
        registry = create_registry("phase15-m3-e3-r5-synthetic")
        runtime = AgentRuntimeService(
            provider=adapter,
            policy_service=AgentPolicyService(),
            reasoning_bank_runtime_service=ReasoningBankRuntimeService(
                settings=synthetic_settings
            ),
        )
        run_result = __import__("asyncio").run(
            runtime.run(
                runtime_request,
                deadline=AbsoluteTurnDeadline(
                    started_at=time.perf_counter(), turn_deadline_ms=30_000
                ),
                registry=registry,
                db_session=None,
            )
        )
        if run_result.submission is None:
            raise AssertionError(f"synthetic submit_answer was not accepted: {run_result.errors}")
        terminal_request_contract: dict[str, Any] | None = None
        if terminal_recovery:
            if not run_result.metrics.terminal_recovery_triggered:
                raise AssertionError("synthetic timeout did not enter terminal recovery")
            if fake_responses.calls != 2:
                raise AssertionError("terminal recovery added an unexpected provider call")
            terminal_request = fake_responses.requests[-1]
            terminal_tools = terminal_request.get("tools", [])
            if len(terminal_tools) != 1 or terminal_tools[0].get("name") != "submit_answer":
                raise AssertionError("terminal recovery exposed research tools")
            terminal_parameters = terminal_tools[0].get("parameters", {})
            terminal_required = terminal_parameters.get("required", [])
            if "course_research_suggestion" not in terminal_required:
                raise AssertionError(
                    "terminal schema dropped the enabled course research result contract"
                )
            if terminal_request.get("tool_choice") != {
                "type": "function",
                "name": "submit_answer",
            }:
                raise AssertionError("terminal recovery did not force submit_answer")
            if run_result.metrics.logical_llm_stage_count != 1:
                raise AssertionError("terminal recovery introduced an additional logical stage")
            terminal_suggestion = run_result.submission.course_research_suggestion
            if not isinstance(terminal_suggestion, dict) or (
                terminal_suggestion.get("research_status") != "not_performed"
            ):
                raise AssertionError("terminal response did not preserve not_performed status")
            terminal_request_contract = {
                "tool_names": [tool.get("name") for tool in terminal_tools],
                "course_research_required": True,
                "tool_choice": terminal_request.get("tool_choice"),
            }
        research_result, diagnostics = bind_course_research_suggestion_with_diagnostics(
            raw=run_result.submission.course_research_suggestion,
            context=context,
            frontend_chat_id=query.frontend_chat_id,
            registry=registry,
        )
        scope_fingerprint_matches = None
        if expected_scope_fingerprint is not None:
            scope_fingerprint_matches = (
                diagnostics.get("scope_fingerprint") == expected_scope_fingerprint
            )
            if not scope_fingerprint_matches:
                raise AssertionError(
                    "client/server/Python task scope fingerprints do not match"
                )
        diagnostics.update(
            {
                "research_tool_exposed": run_result.metrics.course_research_tool_exposed,
                "research_prompt_enabled": run_result.metrics.course_research_prompt_enabled,
                "provider_schema_status": run_result.metrics.course_research_provider_schema_status,
            }
        )
        query_response = DefaultAgentServingService()._response_from_submission(
            matter_id=None,
            response_language=query.response_language or "zh",
            submission=run_result.submission,
            result=run_result,
            registry=registry,
            course_research_result=research_result,
            course_research_diagnostics=diagnostics,
        )
        tool_schema = next(
            (
                item
                for item in (fake_responses.request or {}).get("tools", [])
                if item.get("name") == "submit_answer"
            ),
            None,
        )
        return {
            "activation_reason": activation_reason,
            "course_research_enabled": enabled,
            "provider_calls": fake_responses.calls,
            "provider_schema_required": bool(
                tool_schema
                and "course_research_suggestion"
                in tool_schema.get("parameters", {}).get("required", [])
            ),
            "submission_accepted_count": run_result.metrics.submission_accepted_count,
            "terminal_recovery_triggered": run_result.metrics.terminal_recovery_triggered,
            "terminal_recovery_reason": run_result.metrics.terminal_recovery_reason,
            "logical_llm_stage_count": run_result.metrics.logical_llm_stage_count,
            "terminal_request_contract": terminal_request_contract,
            "scope_fingerprint_matches": scope_fingerprint_matches,
            "state_patch": run_result.submission.state_patch,
            "registered_native_web_refs": run_result.metrics.native_web_source_count,
            "long_provider_url_length": len(COURSE_SOURCES[1]["url"]),
            "response": query_response.model_dump(mode="json"),
        }


def main() -> None:
    if len(sys.argv) > 1:
        input_path = next(
            (argument for argument in sys.argv[1:] if not argument.startswith("--")),
            None,
        )
        if input_path is None:
            raise SystemExit("a synthetic Project context JSON path is required")
        with open(input_path, encoding="utf-8") as source:
            payload = json.load(source)
        if "--terminal-recovery" in sys.argv[1:]:
            payload["__synthetic_terminal_recovery"] = True
    else:
        payload = json.load(sys.stdin)
    print(
        json.dumps(
            run_cross_runtime_fixture(payload),
            ensure_ascii=False,
            separators=(",", ":"),
        )
    )


if __name__ == "__main__":
    main()
