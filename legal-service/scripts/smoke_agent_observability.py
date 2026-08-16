from __future__ import annotations

from app.services.agent_observability_service import AgentObservabilityService


def main() -> None:
    service = AgentObservabilityService()
    token = service.begin_turn(mode="default", turn_deadline_ms=40000)
    try:
        service.mark_agent_started()
        service.record_logical_stage("answer_research")
        service.record_provider_call(stage="answer_research", duration_ms=1, status="ok")
        service.record_tool_call(
            tool_name="web_search",
            round_index=1,
            status="ok",
            duration_ms=1,
            result_count=1,
        )
        service.record_terminal_submission(missing=True, continuation_count=1)
        metrics = service.snapshot()
        assert metrics is not None
        assert metrics.logical_llm_stage_count == 1
        assert metrics.provider_api_call_count == 1
        assert metrics.tool_call_count == 1
        assert metrics.tool_round_count == 1
        assert metrics.web_search_call_count == 1
        assert metrics.terminal_submission_missing is True
        assert metrics.terminal_submission_continuation_count == 1
    finally:
        service.reset_turn(token)
    print("agent_observability=ok")


if __name__ == "__main__":
    main()
