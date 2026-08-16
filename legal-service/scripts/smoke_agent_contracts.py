from __future__ import annotations

from datetime import date

from pydantic import ValidationError

from app.schemas.agent import AgentSubmissionV2, ExecutionBudget


def main() -> None:
    draft = "General response."
    submission = AgentSubmissionV2(
        schema_version="agent_submission.v2",
        answer_class="general",
        draft_markdown=draft,
        as_of_date=None,
        claims=[],
        citations=[],
        research_status="not_required",
        state_patch=[],
    )
    assert AgentSubmissionV2.model_validate_json(submission.model_dump_json()) == submission
    ExecutionBudget(
        max_tool_rounds=2,
        max_provider_calls=3,
        max_retries=1,
        turn_deadline_ms=40000,
        answer_research_target_ms=32000,
        checker_target_ms=8000,
    )
    try:
        AgentSubmissionV2.model_validate(
            {**submission.model_dump(), "schema_version": "agent_submission.v1"}
        )
    except ValidationError:
        pass
    else:
        raise AssertionError("invalid schema version was accepted")
    print("agent_contracts=ok", date.today().isoformat())


if __name__ == "__main__":
    main()
