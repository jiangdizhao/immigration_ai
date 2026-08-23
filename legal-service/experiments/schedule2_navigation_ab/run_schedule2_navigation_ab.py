"""Minimal offline/live A/B runner for the validated Schedule-2 sidecar.

Offline mode writes paired, identical research templates without making model,
web, database, or checker calls. Live mode uses the existing Luna shadow
runtime; its only arm difference is the compact explicit-navigation appendix
added to the user prompt. This module is never imported by serving code.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time
from datetime import date
from pathlib import Path
from typing import Any
from uuid import uuid4


HERE = Path(__file__).resolve().parent
LEGAL_SERVICE_ROOT = HERE.parents[1]
DEFAULT_CASES = HERE / "cases.json"
DEFAULT_RESULTS = HERE / "results"
SIDECAR_DIR = LEGAL_SERVICE_ROOT / "data" / "processed" / "experimental" / "schedule2_navigation"

EXPLICIT_RELATIONS = frozenset(
    {
        "REFERENCES",
        "REFERENCES_ACT",
        "REFERENCES_CONDITION",
        "REFERENCES_PIC",
        "REFERENCES_REGULATION",
        "REFERENCES_SCHEDULE",
        "REFERENCES_SCHEDULE3_CRITERION",
    }
)
FORBIDDEN_HINT_TERMS = (
    "eligible",
    "ineligible",
    "exception applies",
    "requirement satisfied",
    "preferred visa",
)
SHARED_RESEARCH_CONFIGURATION = {
    "model": "gpt-5.6-luna",
    "reasoning_effort": "low",
    "tool_choice": "auto",
    "mode": "default",
    "checker": "unchanged_existing_runtime_behavior",
    "graph_is_not_evidence": True,
}


def load_cases(path: Path) -> list[dict[str, Any]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    cases = payload.get("cases")
    if not isinstance(cases, list) or not 12 <= len(cases) <= 20:
        raise ValueError("cases.json must contain between 12 and 20 cases")
    seen: set[str] = set()
    for case in cases:
        if not isinstance(case, dict):
            raise ValueError("each case must be an object")
        required = ("case_id", "question", "starting_subclass", "starting_provision")
        if any(not str(case.get(key) or "").strip() for key in required):
            raise ValueError(f"case is missing a required field: {case}")
        case_id = str(case["case_id"])
        if case_id in seen:
            raise ValueError(f"duplicate case_id: {case_id}")
        seen.add(case_id)
    return cases


def load_sidecar_for_experiment() -> Any:
    sys.path.insert(0, str(LEGAL_SERVICE_ROOT))
    from app.legal_map_experimental.schedule2_navigation_sidecar import (
        DEFAULT_EDGES_PATH,
        DEFAULT_MANIFEST_PATH,
        DEFAULT_NODES_PATH,
        load_sidecar,
    )

    return load_sidecar(
        nodes_path=DEFAULT_NODES_PATH,
        edges_path=DEFAULT_EDGES_PATH,
        manifest_path=DEFAULT_MANIFEST_PATH,
    )


def navigation_hints(sidecar: Any, *, subclass: str, provision: str) -> list[dict[str, str]]:
    nodes = {node.id: node for node in sidecar.nodes}
    provision_node = nodes.get(f"s2x:provision:{provision}")
    if provision_node is None or provision_node.subclass != subclass:
        raise ValueError(f"starting provision is not owned by starting subclass: {subclass}/{provision}")

    hints: list[dict[str, str]] = []
    for edge in sidecar.edges:
        if edge.source != provision_node.id or edge.relation not in EXPLICIT_RELATIONS:
            continue
        target = nodes.get(edge.target)
        if target is None:
            continue
        target_label = target.label or target.id
        hint = {
            "source_provision": provision,
            "relation": edge.relation,
            "target_node": target.id,
            "target_label": target_label,
        }
        hints.append(hint)
    return sorted(hints, key=lambda item: (item["relation"], item["target_node"]))


def render_hint_text(hints: list[dict[str, str]]) -> str:
    lines = [
        "Schedule-2 navigation hints:",
        "These are navigation metadata only, not legal evidence or legal conclusions.",
    ]
    if not hints:
        lines.append("- No explicit navigation relationship was found for the supplied starting provision.")
    else:
        for hint in hints:
            lines.append(
                f"- {hint['source_provision']} explicitly has {hint['relation']} "
                f"to {hint['target_label']} ({hint['target_node']})."
            )
    return "\n".join(lines)


def assert_hint_safety(text: str) -> None:
    lowered = text.casefold()
    forbidden = [term for term in FORBIDDEN_HINT_TERMS if term in lowered]
    if forbidden:
        raise AssertionError(f"navigation hint contains a legal conclusion: {forbidden}")
    if "legal evidence" not in lowered or "navigation metadata" not in lowered:
        raise AssertionError("navigation hint must identify itself as metadata, not evidence")


def base_record(case: dict[str, Any], arm: str, hints: list[dict[str, str]], *, mode: str) -> dict[str, Any]:
    started = time.perf_counter()
    hint_text = render_hint_text(hints) if arm == "navigation" else ""
    assert_hint_safety(hint_text) if hint_text else None
    prompt = str(case["question"])
    if hint_text:
        prompt = f"{prompt}\n\n{hint_text}"
    return {
        "case_id": case["case_id"],
        "arm": arm,
        "question": case["question"],
        "starting_subclass": case["starting_subclass"],
        "starting_provision": case["starting_provision"],
        "navigation_hints_used": hints if arm == "navigation" else [],
        "navigation_prompt_appendix": hint_text if arm == "navigation" else None,
        "answer": None,
        "evidence_source_information": {
            "research_harness": "not_run_in_offline_mode",
            "sources_exposed": [],
            "graph_data_is_not_evidence": True,
        },
        "latency_ms": round((time.perf_counter() - started) * 1000, 3),
        "tool_call_count": 0,
        "status": "manual_luna_run_required" if mode == "offline" else "pending",
        "research_configuration": dict(SHARED_RESEARCH_CONFIGURATION),
    }


async def run_live_case(case: dict[str, Any], arm: str, hints: list[dict[str, str]]) -> dict[str, Any]:
    sys.path.insert(0, str(LEGAL_SERVICE_ROOT))
    from app.core.config import get_settings
    from app.schemas.agent import ExecutionBudget
    from app.services.agent_observability_service import AbsoluteTurnDeadline
    from app.services.openai_responses_adapter import OpenAIResponsesAdapter
    from app.services.shadow_agent_service import ShadowAgentService
    from app.services.agent_runtime_service import AgentRuntimeService

    settings = get_settings()
    hint_text = render_hint_text(hints) if arm == "navigation" else ""
    assert_hint_safety(hint_text) if hint_text else None
    prompt = str(case["question"]) + (f"\n\n{hint_text}" if hint_text else "")
    started = time.perf_counter()
    deadline = AbsoluteTurnDeadline(time.perf_counter(), settings.default_turn_deadline_ms)
    budget = ExecutionBudget(
        max_tool_rounds=settings.agent_max_tool_rounds,
        max_provider_calls=settings.agent_max_provider_calls,
        max_retries=settings.agent_max_retries,
        turn_deadline_ms=settings.default_turn_deadline_ms,
        answer_research_target_ms=settings.default_answer_research_target_ms,
        checker_target_ms=settings.legal_fact_check_target_ms,
        max_flat_rag_calls=settings.agent_max_flat_rag_calls,
        retry_viability_threshold_ms=settings.agent_retry_viability_threshold_ms,
    )
    trace = await ShadowAgentService(AgentRuntimeService(provider=OpenAIResponsesAdapter())).run_shadow(
        user_text=prompt,
        mode="default",
        response_language="en",
        as_of_date=date.today(),
        experiment_arm=None,
        deadline=deadline,
        execution_budget=budget,
        upstream_gate_allowed=True,
    )
    submission = trace.submission
    return {
        **base_record(case, arm, hints, mode="live"),
        "answer": submission.draft_markdown if submission else None,
        "evidence_source_information": {
            "evidence_refs": list(trace.evidence_refs),
            "citations": list(trace.citations),
            "graph_data_is_not_evidence": True,
        },
        "latency_ms": round((time.perf_counter() - started) * 1000, 3),
        "tool_call_count": trace.tool_call_count,
        "status": trace.status,
        "research_status": trace.research_status,
        "provider_call_count": trace.provider_call_count,
        "checker_status": trace.checker_status,
        "model": trace.model,
    }


def summarize(rows: list[dict[str, Any]], *, mode: str, case_count: int) -> dict[str, Any]:
    by_arm: dict[str, dict[str, Any]] = {}
    for arm in ("baseline", "navigation"):
        arm_rows = [row for row in rows if row["arm"] == arm]
        by_arm[arm] = {
            "runs": len(arm_rows),
            "average_latency_ms": round(sum(float(row["latency_ms"]) for row in arm_rows) / len(arm_rows), 3) if arm_rows else 0.0,
            "total_tool_call_count": sum(int(row.get("tool_call_count") or 0) for row in arm_rows),
            "manual_scoring_required": mode == "offline" or any(row.get("manual_scoring") for row in arm_rows),
        }
    return {
        "schema_version": "schedule2_navigation_ab.results.v1",
        "mode": mode,
        "case_count": case_count,
        "arms": ["baseline", "navigation"],
        "same_research_configuration": True,
        "automatic_legal_quality_scoring": False,
        "scoring_fields": [
            "relevant_legal_branches_found",
            "missed_explicit_schedule2_references",
            "unsupported_material_legal_claims",
            "latency_ms",
        ],
        "by_arm": by_arm,
    }


async def run(args: argparse.Namespace) -> int:
    cases = load_cases(Path(args.cases))
    sidecar = load_sidecar_for_experiment()
    result_dir = Path(args.results)
    result_dir.mkdir(parents=True, exist_ok=True)
    rows: list[dict[str, Any]] = []
    for case in cases:
        hints = navigation_hints(
            sidecar,
            subclass=str(case["starting_subclass"]),
            provision=str(case["starting_provision"]),
        )
        for arm in ("baseline", "navigation"):
            row = (
                await run_live_case(case, arm, hints)
                if args.mode == "live"
                else base_record(case, arm, hints, mode="offline")
            )
            row["manual_scoring"] = {
                "relevant_legal_branches_found": None,
                "missed_explicit_schedule2_references": None,
                "unsupported_material_legal_claims": None,
                "reviewer_notes": "",
            }
            rows.append(row)
    for arm in ("baseline", "navigation"):
        with (result_dir / f"{arm}.jsonl").open("w", encoding="utf-8") as handle:
            for row in rows:
                if row["arm"] == arm:
                    handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")
    summary = summarize(rows, mode=args.mode, case_count=len(cases))
    summary["sidecar_manifest"] = str(SIDECAR_DIR / "manifest.json")
    summary["run_id"] = str(uuid4())
    (result_dir / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run the isolated Schedule-2 navigation A/B evaluation")
    parser.add_argument("--cases", type=Path, default=DEFAULT_CASES)
    parser.add_argument("--results", type=Path, default=DEFAULT_RESULTS)
    parser.add_argument("--mode", choices=("offline", "live"), default="offline")
    return parser


def main() -> int:
    return asyncio.run(run(build_parser().parse_args()))


if __name__ == "__main__":
    raise SystemExit(main())
