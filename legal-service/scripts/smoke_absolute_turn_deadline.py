from __future__ import annotations

from app.services.agent_observability_service import AgentObservabilityService


class Clock:
    def __init__(self) -> None:
        self.now = 100.0

    def __call__(self) -> float:
        return self.now


def main() -> None:
    clock = Clock()
    service = AgentObservabilityService(clock=clock)
    token = service.begin_turn(mode="default", turn_deadline_ms=1000)
    try:
        deadline = service.current_deadline()
        assert deadline is not None
        original_deadline_at = deadline.deadline_at
        clock.now += 0.7
        assert service.component_timeout_ms(
            stage="nested_provider_retry", component_timeout_ms=900
        ) <= 300.01
        assert service.current_deadline() is deadline
        assert deadline.deadline_at == original_deadline_at
    finally:
        service.reset_turn(token)
    print("absolute_turn_deadline=ok")


if __name__ == "__main__":
    main()
