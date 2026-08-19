"""Phase 5 A/B engineering pilot runner.

This runner implements only the Phase 5 evaluation subset required by the
v2.1.1 migration plan:

- Arm A / luna_web: Luna + provider-native web search + utility + submit_answer
- Arm B / luna_flat_web: Arm A + the existing Phase-4B FlatRagSearchTool

It deliberately does not implement Phase 6+ checker/serving rollout, Sol,
LightRAG, or production traffic allocation.  It reuses the production shadow
runtime and provider adapter; it does not create a second agent implementation.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import subprocess
import time
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

# Phase 5.1A calibration runs on its own implementation branch; the earlier
# Phase-5 A/B runs used next-architecture-agentic-tools. Keep an explicit
# immutable allowlist so no other branch is silently accepted.
APPROVED_BRANCHES = {
    "next-architecture-agentic-tools",
    "phase5.1-luna-calibration",
}
PHASE5_ARMS = {
    "luna_web": "A",
    "luna_flat_web": "B",
}


def parse_arms(value: str) -> list[str]:
    arms = [item.strip() for item in value.split(",") if item.strip()]
    if not arms:
        raise ValueError("at least one Phase 5 arm is required")
    unsupported = [arm for arm in arms if arm not in PHASE5_ARMS]
    if unsupported:
        raise ValueError(
            "Phase 5 runner supports only luna_web,luna_flat_web; "
            f"unsupported: {','.join(unsupported)}"
        )
    return arms


def load_manifest(path: Path) -> dict[str, Any]:
    data = json.loads(path.read_text(encoding="utf-8"))
    cases = data.get("cases")
    if not isinstance(cases, list) or not cases:
        raise ValueError("manifest must contain a non-empty cases list")
    seen: set[str] = set()
    for item in cases:
        if not isinstance(item, dict):
            raise ValueError("each manifest case must be an object")
        case_id = str(item.get("case_id") or "").strip()
        question = str(item.get("question") or "").strip()
        if not case_id or not question:
            raise ValueError("each case requires case_id and question")
        if case_id in seen:
            raise ValueError(f"duplicate case_id: {case_id}")
        seen.add(case_id)
    return data


def select_cases(
    manifest: dict[str, Any],
    *,
    case_ids: list[str] | None = None,
    limit: int | None = None,
) -> list[dict[str, Any]]:
    cases = list(manifest["cases"])
    if case_ids:
        wanted = set(case_ids)
        cases = [case for case in cases if case["case_id"] in wanted]
        missing = wanted - {case["case_id"] for case in cases}
        if missing:
            raise ValueError(f"unknown case ids: {','.join(sorted(missing))}")
    if limit is not None:
        if limit < 1:
            raise ValueError("--limit must be at least 1")
        cases = cases[:limit]
    if not cases:
        raise ValueError("no cases selected")
    return cases


def current_git_identity() -> tuple[str, str]:
    branch = subprocess.check_output(
        ["git", "rev-parse", "--abbrev-ref", "HEAD"], text=True
    ).strip()
    sha = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
    if branch not in APPROVED_BRANCHES:
        raise RuntimeError(
            f"evaluation must run on one of {sorted(APPROVED_BRANCHES)}; "
            f"active branch is {branch}"
        )
    return branch, sha


def _case_as_of_date(case: dict[str, Any]) -> date:
    value = case.get("as_of_date")
    if value:
        return date.fromisoformat(str(value))
    return datetime.now(timezone.utc).date()


class _CountingOpenAIResponsesAdapter:
    """Small observability wrapper around the production adapter.

    The current production adapter handles provider-native web search internally,
    so it does not appear as a custom function result.  This wrapper counts the
    actual provider web_search_call events without changing their handling.
    """

    def __init__(self) -> None:
        from app.services.openai_responses_adapter import OpenAIResponsesAdapter

        class CountingAdapter(OpenAIResponsesAdapter):
            def __init__(inner_self) -> None:
                super().__init__()
                inner_self.pilot_web_search_call_count = 0

            def _handle_web_search_call(inner_self, item, ctx) -> None:
                inner_self.pilot_web_search_call_count += 1
                super()._handle_web_search_call(item, ctx)

        self.adapter = CountingAdapter()

    @property
    def web_search_call_count(self) -> int:
        return int(self.adapter.pilot_web_search_call_count)


async def run_case_arm(case: dict[str, Any], arm_name: str) -> dict[str, Any]:
    from app.core.config import get_settings
    from app.db.session import SessionLocal
    from app.schemas.agent import ExecutionBudget
    from app.services.agent_observability_service import AbsoluteTurnDeadline
    from app.services.agent_runtime_service import AgentRuntimeService
    from app.services.political_failsafe_service import get_political_failsafe_service
    from app.services.shadow_agent_service import ShadowAgentService
    from app.tools.flat_rag_search import FlatRagSearchTool

    settings = get_settings()
    arm_code = PHASE5_ARMS[arm_name]
    question = str(case["question"])
    language = str(case.get("response_language") or "en")

    political = get_political_failsafe_service().evaluate_text(question)
    if political.decision == "block":
        return {
            "case_id": case["case_id"],
            "category": case.get("category"),
            "arm": arm_name,
            "experiment_arm": arm_code,
            "status": "blocked",
            "political_gate": "block",
            "provider_call_count": 0,
            "web_search_call_count": 0,
            "flat_rag_call_count": 0,
            "total_duration_ms": 0.0,
            "errors": [],
        }

    if arm_code == "B" and not settings.flat_rag_tool_enabled:
        raise RuntimeError(
            "Arm B requires FLAT_RAG_TOOL_ENABLED=true; refusing to silently run Arm B as Arm A"
        )

    provider = _CountingOpenAIResponsesAdapter()
    runtime = AgentRuntimeService(provider=provider.adapter)
    shadow = ShadowAgentService(runtime)

    accepted_at = time.perf_counter()
    deadline = AbsoluteTurnDeadline(
        started_at=accepted_at,
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
    )

    db = None
    flat_rag_call_count = 0
    flat_rag_search_fn = None
    try:
        if arm_code == "B":
            db = SessionLocal()
            flat_tool = FlatRagSearchTool(db)

            def counted_flat_rag_search(**kwargs):
                nonlocal flat_rag_call_count
                flat_rag_call_count += 1
                return flat_tool.search(**kwargs)

            flat_rag_search_fn = counted_flat_rag_search

        trace = await shadow.run_shadow(
            user_text=question,
            mode="default",
            response_language=language,
            as_of_date=_case_as_of_date(case),
            experiment_arm=arm_code,
            flat_rag_search_fn=flat_rag_search_fn,
            deadline=deadline,
            execution_budget=budget,
            upstream_gate_allowed=True,
        )
    finally:
        if db is not None:
            db.close()

    submission = trace.submission
    claims = list(submission.claims) if submission else []
    decisive_claims = [claim for claim in claims if claim.materiality == "decisive"]

    return {
        "case_id": case["case_id"],
        "category": case.get("category"),
        "arm": arm_name,
        "experiment_arm": arm_code,
        "status": trace.status,
        "political_gate": "allow",
        "research_status": trace.research_status,
        "postcondition_status": trace.postcondition_status,
        "provider_call_count": trace.provider_call_count,
        "tool_call_count": trace.tool_call_count,
        "tool_round_count": trace.tool_round_count,
        "web_search_call_count": provider.web_search_call_count,
        # Phase 5.1A: authoritative provider-native built-in web_search metrics
        # derived from actual provider output (searches, sources, citations).
        "native_web_search_call_count": trace.native_web_search_call_count,
        "native_web_source_count": trace.native_web_source_count,
        "native_web_citation_count": trace.native_web_citation_count,
        "reasoning_effort": trace.reasoning_effort,
        "search_privacy_violation_count": trace.search_privacy_violation_count,
        "search_privacy_violation_categories": dict(trace.search_privacy_violation_categories),
        "flat_rag_call_count": flat_rag_call_count,
        "evidence_count": len(trace.evidence_refs),
        "native_web_evidence_count": sum(
            1 for ref in trace.evidence_refs if ref.startswith("web:")
        ),
        "canonical_local_evidence_count": sum(
            1 for ref in trace.evidence_refs if ref.startswith("exact:")
        ),
        "citation_count": len(trace.citations),
        "claim_count": len(claims),
        "decisive_claim_count": len(decisive_claims),
        "repair_count": trace.terminal_submission_continuation_count,
        "terminal_submission_missing": trace.terminal_submission_missing,
        "total_duration_ms": round(trace.total_duration_ms, 3),
        "remaining_deadline_ms": round(trace.remaining_deadline_ms, 3),
        "provider_calls": trace.provider_calls,
        "tool_calls": trace.tool_calls,
        "total_provider_duration_ms": round(trace.total_provider_duration_ms, 3),
        "total_tool_duration_ms": round(trace.total_tool_duration_ms, 3),
        "errors": trace.errors,
        "answer": submission.draft_markdown if submission else None,
    }


def summarize(results: list[dict[str, Any]]) -> dict[str, Any]:
    by_arm: dict[str, dict[str, Any]] = {}
    for arm in PHASE5_ARMS:
        rows = [row for row in results if row["arm"] == arm]
        if not rows:
            continue
        durations = [float(row.get("total_duration_ms") or 0.0) for row in rows]
        by_arm[arm] = {
            "runs": len(rows),
            "completed": sum(1 for row in rows if row["status"] == "completed"),
            "blocked": sum(1 for row in rows if row["status"] == "blocked"),
            "errors_or_timeouts": sum(
                1 for row in rows if row["status"] in {"error", "timeout", "incomplete"}
            ),
            "web_search_calls": sum(int(row.get("web_search_call_count") or 0) for row in rows),
            "native_web_search_calls": sum(
                int(row.get("native_web_search_call_count") or 0) for row in rows
            ),
            "native_web_sources": sum(
                int(row.get("native_web_source_count") or 0) for row in rows
            ),
            "native_web_citations": sum(
                int(row.get("native_web_citation_count") or 0) for row in rows
            ),
            "search_privacy_violations": sum(
                int(row.get("search_privacy_violation_count") or 0) for row in rows
            ),
            "flat_rag_calls": sum(int(row.get("flat_rag_call_count") or 0) for row in rows),
            "canonical_local_evidence": sum(
                int(row.get("canonical_local_evidence_count") or 0) for row in rows
            ),
            "native_web_evidence": sum(
                int(row.get("native_web_evidence_count") or 0) for row in rows
            ),
            "average_duration_ms": round(sum(durations) / len(durations), 3),
        }
    return {"by_arm": by_arm, "total_runs": len(results)}


async def _main_async(args: argparse.Namespace) -> int:
    branch, sha = current_git_identity()
    manifest_path = Path(args.manifest)
    manifest = load_manifest(manifest_path)
    arms = parse_arms(args.arms)
    cases = select_cases(
        manifest,
        case_ids=args.case_id,
        limit=args.limit,
    )

    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)

    run_manifest = {
        "schema_version": "architecture_eval.phase5_ab.v1",
        "source_manifest": str(manifest_path),
        "manifest_scope": manifest.get("scope"),
        "complete_pilot": bool(manifest.get("complete_pilot", False)),
        "branch": branch,
        "git_sha": sha,
        "arms": arms,
        "case_ids": [case["case_id"] for case in cases],
        "started_at": datetime.now(timezone.utc).isoformat(),
    }
    (output_dir / "run_manifest.json").write_text(
        json.dumps(run_manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    results: list[dict[str, Any]] = []
    for case in cases:
        for arm in arms:
            print(f"[{case['case_id']}] {arm} ...", flush=True)
            result = await run_case_arm(case, arm)
            results.append(result)
            print(
                f"  status={result['status']} latency={result.get('total_duration_ms', 0):.0f}ms "
                f"web={result.get('web_search_call_count', 0)} flat={result.get('flat_rag_call_count', 0)}",
                flush=True,
            )

    with (output_dir / "results.jsonl").open("w", encoding="utf-8") as handle:
        for row in results:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")

    summary = summarize(results)
    summary["git_sha"] = sha
    summary["manifest_scope"] = manifest.get("scope")
    summary["complete_pilot"] = bool(manifest.get("complete_pilot", False))
    (output_dir / "summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run the Phase 5 Luna A/B engineering pilot subset")
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--arms", default="luna_web,luna_flat_web")
    parser.add_argument("--output", required=True)
    parser.add_argument("--case-id", action="append", default=None)
    parser.add_argument("--limit", type=int, default=None)
    return parser


def main() -> int:
    return asyncio.run(_main_async(build_parser().parse_args()))


if __name__ == "__main__":
    raise SystemExit(main())
