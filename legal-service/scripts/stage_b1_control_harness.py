"""Local Stage B1 H/S/D comparison harness.

This is an experiment runner, not a serving path.  H and S make one direct
Responses call with the historical control shape (Terra or Sol); D runs the
current bounded Default runtime (Arm N) against the authoritative local
PostgreSQL corpus.  The script deliberately performs no scoring and records
no generated search-query text.  D uses the lower-level ShadowAgentService and
does not apply DefaultAgentServingService's customer-response adapter or its
evidence-salvage finalizer; its answer/recovery fields are therefore runtime
observations, not a serving-path result.

Run later, outside the Codex sandbox, for example:

    /home/rico/anaconda3/envs/torch/bin/python -m scripts.stage_b1_control_harness \
      --cases tests/eval/stage_b1_control_cases.json --arms H,S,D \
      --output artifacts/stage_b1/control_results.jsonl

H and S require the user's configured OpenAI API access.  D requires the
authoritative local database at 127.0.0.1:5432/immigration_legal.  No calls are
made merely by importing this module.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import time
from datetime import date
from pathlib import Path
from typing import Any
from uuid import uuid4

from sqlalchemy.engine import make_url

from app.core.config import get_settings
from app.db.session import SessionLocal
from app.schemas.agent import ExecutionBudget
from app.services.agent_observability_service import AbsoluteTurnDeadline
from app.services.agent_runtime_service import AgentRuntimeService
from app.services.openai_responses_adapter import OpenAIResponsesAdapter
from app.services.request_evidence_registry import create_registry
from app.services.shadow_agent_service import ShadowAgentService


DIRECT_SYSTEM_PROMPT = (
    "You are a direct Australian immigration information assistant. Answer the latest "
    "user question clearly and accurately. Use the available native web search only "
    "when needed for current, uncertain, or authoritative information. Do not invent "
    "sources or citations."
)

DIRECT_TOOL = {
    "type": "web_search",
    "search_context_size": "high",
}


def load_cases(path: Path) -> list[dict[str, Any]]:
    """Load a small, explicit fixture list and reject malformed input."""
    rows = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(rows, list) or not rows:
        raise ValueError("case file must contain a non-empty JSON list")
    seen: set[str] = set()
    for row in rows:
        if not isinstance(row, dict):
            raise ValueError("each case must be an object")
        case_id = str(row.get("case_id") or "").strip()
        question = str(row.get("question") or "").strip()
        if not case_id or not question:
            raise ValueError("each case requires case_id and question")
        if case_id in seen:
            raise ValueError(f"duplicate case_id: {case_id}")
        seen.add(case_id)
    return rows


def compact_direct_input(case: dict[str, Any]) -> str:
    """Build bounded history plus latest question for H/S."""
    history = case.get("history") or []
    rows: list[str] = []
    total = 0
    for item in history[-8:]:
        if not isinstance(item, dict):
            continue
        role = str(item.get("role") or "user").lower()
        if role not in {"user", "assistant"}:
            continue
        text = str(item.get("text") or item.get("content") or "").strip()
        if not text:
            continue
        row = f"{role}: {text[:900]}"
        if total + len(row) > 6000:
            break
        rows.append(row)
        total += len(row)
    question = str(case["question"]).strip()
    if rows:
        return "Recent conversation context:\n" + "\n".join(rows) + (
            "\n\nLatest user question:\n" + question
        )
    return question


def build_direct_request_shape(*, model: str, model_input: str) -> dict[str, Any]:
    """Return the comparable H/S request shape used by the harness."""
    return {
        "model": model,
        "input": [
            {"role": "system", "content": [{"type": "input_text", "text": DIRECT_SYSTEM_PROMPT}]},
            {"role": "user", "content": [{"type": "input_text", "text": model_input}]},
        ],
        "reasoning": {"effort": "medium"},
        "tools": [DIRECT_TOOL],
        "tool_choice": "auto",
        "stream": True,
    }


def _authoritative_database_guard() -> None:
    url = make_url(get_settings().database_url)
    if (
        url.host not in {"localhost", "127.0.0.1"}
        or url.port != 5432
        or url.database != "immigration_legal"
    ):
        raise RuntimeError(
            "Stage B1 D arm requires the authoritative local PostgreSQL database "
            "127.0.0.1:5432/immigration_legal"
        )


def _direct_result(case: dict[str, Any], arm: str, response: Any, elapsed_ms: float) -> dict[str, Any]:
    return {
        "case_id": case["case_id"],
        "arm": arm,
        "mode": "direct_control",
        "web_timing_semantics": (
            "provider_lifecycle_events_only; unavailable timing fields remain null"
        ),
        "model": response.model,
        "reasoning_effort": response.effort,
        "status": response.status,
        "timeout": response.status == "timeout",
        "completion_status": "complete" if response.status == "ok" else response.status,
        "total_latency_ms": round(elapsed_ms, 3),
        "provider_latency_ms": round(response.duration_ms, 3),
        "native_web_action_counts": {
            "search": response.web_action_search_count,
            "open_page": response.web_action_open_page_count,
            "find_in_page": response.web_action_find_in_page_count,
        },
        "web_search_query_count": response.web_search_query_count,
        "web_sources_observed_count": response.web_sources_observed_count,
        "web_citations_observed_count": response.web_citations_observed_count,
        "first_web_action_started_ms": response.first_web_action_started_ms,
        "first_web_action_completed_ms": response.first_web_action_completed_ms,
        "last_web_action_completed_ms": response.last_web_action_completed_ms,
        "first_output_text_after_web_ms": response.first_output_text_after_web_ms,
        "post_web_action_provider_ms": response.post_web_action_provider_ms,
        "custom_tool_sequence": [],
        "custom_tool_calls_per_round": [],
        "research_tool_names_by_round": [],
        "duplicate_tool_call_suppressed_count": 0,
        "duplicate_tool_names": [],
        "search_privacy_pii_violation_count": response.pii_violation_count,
        "search_privacy_violation_categories": dict(
            response.search_privacy_violation_categories
        ),
        "answer": response.text,
        "recovery": {
            "partial": response.partial,
            "stream_timeout_after_partial": response.status == "timeout" and response.partial,
            "salvaged": False,
        },
    }


async def run_direct_case(case: dict[str, Any], arm: str) -> dict[str, Any]:
    model = "gpt-5.6-terra" if arm == "H" else "gpt-5.6-sol"
    settings = get_settings()
    registry = create_registry(f"stage-b1-{uuid4()}")
    started = time.perf_counter()
    try:
        response = await OpenAIResponsesAdapter().call(
            system_prompt=DIRECT_SYSTEM_PROMPT,
            user_text=str(case["question"]),
            model=model,
            tools=[DIRECT_TOOL],
            tool_choice="auto",
            reasoning_effort="medium",
            messages_history=[{"role": "user", "content": compact_direct_input(case)}],
            timeout_ms=float(settings.default_turn_deadline_ms),
            registry=registry,
        )
        return _direct_result(case, arm, response, (time.perf_counter() - started) * 1000.0)
    finally:
        registry.dispose()


def _default_result(case: dict[str, Any], trace: Any) -> dict[str, Any]:
    provider_calls = list(trace.provider_calls or [])
    return {
        "case_id": case["case_id"],
        "arm": "D",
        "mode": "default_agent_runtime",
        "serving_path": "shadow_agent_runtime_only",
        "public_serving_finalizer_applied": False,
        "web_timing_semantics": (
            "provider_lifecycle_events_only; unavailable timing fields remain null"
        ),
        "model": trace.model,
        "reasoning_effort": trace.reasoning_effort,
        "status": trace.status,
        "timeout": trace.status == "timeout",
        "completion_status": (
            "recovered" if trace.terminal_continuation_triggered else trace.status
        ),
        "research_status": trace.research_status,
        "total_latency_ms": round(trace.total_duration_ms, 3),
        "provider_latency_ms": round(trace.total_provider_duration_ms, 3),
        "native_web_action_counts": {
            "search": trace.web_action_search_count,
            "open_page": trace.web_action_open_page_count,
            "find_in_page": trace.web_action_find_in_page_count,
        },
        "web_search_query_count": trace.web_search_query_count,
        "web_sources_observed_count": trace.web_sources_observed_count,
        "web_citations_observed_count": trace.web_citations_observed_count,
        "first_web_action_started_ms": trace.first_web_action_started_ms,
        "first_web_action_completed_ms": trace.first_web_action_completed_ms,
        "last_web_action_completed_ms": trace.last_web_action_completed_ms,
        "first_output_text_after_web_ms": trace.first_output_text_after_web_ms,
        "post_web_action_provider_ms": trace.post_web_action_provider_ms,
        "custom_tool_sequence": [
            str(item.get("tool_name"))
            for item in trace.tool_calls
            if item.get("tool_name")
        ],
        "custom_tool_calls_per_round": list(trace.custom_tool_calls_per_round),
        "research_tool_names_by_round": [
            list(names) for names in trace.research_tool_names_by_round
        ],
        "duplicate_tool_call_suppressed_count": trace.duplicate_tool_call_suppressed_count,
        "duplicate_tool_names": list(trace.duplicate_tool_names),
        "search_privacy_pii_violation_count": trace.search_privacy_violation_count,
        "search_privacy_violation_categories": dict(
            trace.search_privacy_violation_categories
        ),
        "answer": trace.submission.draft_markdown if trace.submission else None,
        "recovery": {
            "partial": any(bool(item.get("stream_partial_available")) for item in provider_calls),
            "stream_timeout_after_partial": any(
                bool(item.get("stream_timeout_after_partial")) for item in provider_calls
            ),
            "salvaged": trace.completion_status == "evidence_salvage",
        },
    }


async def run_default_case(case: dict[str, Any]) -> dict[str, Any]:
    _authoritative_database_guard()
    settings = get_settings()
    runtime = AgentRuntimeService(provider=OpenAIResponsesAdapter())
    shadow = ShadowAgentService(runtime)
    deadline = AbsoluteTurnDeadline(
        started_at=time.perf_counter(),
        turn_deadline_ms=settings.default_turn_deadline_ms,
    )
    budget = ExecutionBudget(
        max_tool_rounds=settings.agent_max_tool_rounds,
        max_provider_calls=settings.agent_max_provider_calls,
        max_retries=settings.agent_max_retries,
        turn_deadline_ms=settings.default_turn_deadline_ms,
        answer_research_target_ms=settings.default_answer_research_target_ms,
        checker_target_ms=settings.legal_fact_check_target_ms,
        max_flat_rag_calls=settings.agent_max_flat_rag_calls,
        retry_viability_threshold_ms=settings.agent_retry_viability_threshold_ms,
        terminal_synthesis_target_ms=settings.default_terminal_synthesis_target_ms,
        final_response_reserve_ms=settings.default_final_response_reserve_ms,
        terminal_synthesis_min_start_budget_ms=settings.terminal_synthesis_min_start_budget_ms,
    )
    with SessionLocal() as db:
        trace = await shadow.run_shadow(
            user_text=str(case["question"]),
            mode="default",
            response_language=str(case.get("response_language") or "en"),
            as_of_date=date.fromisoformat(str(case.get("as_of_date") or date.today())),
            matter_state={},
            experiment_arm="N",
            db_session_factory=lambda: db,
            deadline=deadline,
            execution_budget=budget,
            upstream_gate_allowed=True,
        )
    return _default_result(case, trace)


async def run(args: argparse.Namespace) -> None:
    cases = load_cases(Path(args.cases))
    if args.case:
        cases = [case for case in cases if case["case_id"] == args.case]
        if not cases:
            raise ValueError(f"unknown case id: {args.case}")
    arms = [item.strip().upper() for item in args.arms.split(",") if item.strip()]
    if not arms or any(item not in {"H", "S", "D"} for item in arms):
        raise ValueError("--arms must contain only H,S,D")
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", encoding="utf-8") as handle:
        for case in cases:
            for arm in arms:
                row = await run_direct_case(case, arm) if arm in {"H", "S"} else await run_default_case(case)
                handle.write(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n")
                handle.flush()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cases", required=True, help="JSON fixture list")
    parser.add_argument("--arms", default="H,S,D", help="comma-separated H,S,D")
    parser.add_argument("--output", required=True, help="JSONL result path")
    parser.add_argument("--case", help="run exactly one fixture case by case_id")
    asyncio.run(run(parser.parse_args()))


if __name__ == "__main__":
    main()
