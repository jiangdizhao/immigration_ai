"""Provider boundary for the Phase 7.3B offline experiment.

The Responses client is lazy, has no tools, and is never imported by serving
code.  Fixture tests use :class:`FixtureProvider` and make zero network calls.
"""

from __future__ import annotations

import os
import re
import threading
from dataclasses import dataclass
from typing import Any, Callable

from openai import APIConnectionError, APIStatusError, APITimeoutError, OpenAI

from app.core.config import get_settings
from app.schemas.phase7_3b import (
    CompilerModelOutput,
    ProviderFailureDiagnostic,
    RunnerModelOutput,
    SyntheticRunObservation,
)


class Phase73BProviderError(RuntimeError):
    """A provider call was refused or could not produce strict output."""


@dataclass(frozen=True)
class ProviderResponse:
    status: str
    payload: dict[str, Any] | None
    model: str
    call_number: int
    error_kind: str | None = None
    diagnostic: ProviderFailureDiagnostic | None = None


class LiveCallBudget:
    """Process-local hard cap for every live compiler/runner invocation."""

    def __init__(self, maximum: int = 40):
        if not 0 <= maximum <= 100:
            raise ValueError("max live calls must be between 0 and 100")
        self.maximum = maximum
        self._count = 0
        self._lock = threading.Lock()

    @property
    def count(self) -> int:
        return self._count

    def reserve(self, role: str) -> int:
        with self._lock:
            if self._count >= self.maximum:
                raise Phase73BProviderError(f"max-live-calls exceeded before {role} call")
            self._count += 1
            return self._count


class FixtureProvider:
    """Deterministic provider substitute; it does not inspect an oracle."""

    def __init__(self, handler: Callable[[str, str, str], dict[str, Any]]):
        self.handler = handler
        self.calls: list[tuple[str, str, str]] = []

    def complete(self, *, role: str, prompt: str, model: str) -> ProviderResponse:
        self.calls.append((role, prompt, model))
        try:
            payload = self.handler(role, prompt, model)
        except TimeoutError:
            return ProviderResponse("timeout", None, model, len(self.calls), "timeout")
        except Exception:
            return ProviderResponse(
                "provider_error", None, model, len(self.calls), "provider_error"
            )
        if not isinstance(payload, dict):
            return ProviderResponse(
                "invalid_structured_output", None, model, len(self.calls), "invalid_json"
            )
        return ProviderResponse("ok", payload, model, len(self.calls))


class Phase73BResponsesProvider:
    """Explicitly gated, tool-free OpenAI Responses provider for later live runs."""

    def __init__(
        self,
        *,
        live_requested: bool,
        enabled_value: str | None = None,
        timeout_seconds: float = 20.0,
        budget: LiveCallBudget | None = None,
        client: Any | None = None,
        reasoning_effort: str = "low",
    ):
        self.live_requested = live_requested
        self.enabled_value = enabled_value or os.getenv("PHASE7_3B_LIVE_ENABLED", "false")
        self.timeout_seconds = timeout_seconds
        self.budget = budget or LiveCallBudget()
        self.client = client
        self.reasoning_effort = reasoning_effort
        if timeout_seconds <= 0:
            raise ValueError("provider timeout must be positive")
        if reasoning_effort not in {"none", "low", "medium", "high", "xhigh", "max"}:
            raise ValueError("unsupported reasoning effort")

    @property
    def enabled(self) -> bool:
        return self.live_requested and self.enabled_value.casefold() == "true"

    def complete(self, *, role: str, prompt: str, model: str) -> ProviderResponse:
        if not self.enabled:
            raise Phase73BProviderError(
                "live provider is disabled; require --live and PHASE7_3B_LIVE_ENABLED=true"
            )
        call_number = self.budget.reserve(role)
        try:
            client = self.client
            if client is None:
                settings = get_settings()
                if not settings.openai_api_key:
                    raise RuntimeError("OPENAI_API_KEY is not configured")
                client = OpenAI(
                    api_key=settings.openai_api_key,
                    max_retries=0,
                    timeout=self.timeout_seconds,
                )
                self.client = client
        except Exception as exc:
            return self._failure_response(
                model=model,
                role=role,
                call_number=call_number,
                stage="client_initialization",
                exc=exc,
            )

        request = {
            "model": model,
            "input": [
                {
                    "role": "user",
                    "content": [{"type": "input_text", "text": prompt}],
                }
            ],
            "tools": [],
            "tool_choice": "none",
            "reasoning": {"effort": self.reasoning_effort},
            "timeout": self.timeout_seconds,
        }
        try:
            if role == "runner":
                output_model = RunnerModelOutput
                response = client.responses.parse(**request, text_format=output_model)
            elif role == "compiler":
                output_model = CompilerModelOutput
                response = client.responses.parse(**request, text_format=output_model)
            else:
                raise ValueError("unsupported provider role")
            parsed = getattr(response, "output_parsed", None)
            if not isinstance(parsed, output_model):
                return self._failure_response(
                    model=model,
                    role=role,
                    call_number=call_number,
                    stage="structured_output",
                    exc=ValueError("missing parsed structured output"),
                    status="invalid_structured_output",
                    error_kind="missing_parsed_output",
                )
            return ProviderResponse("ok", parsed.model_dump(mode="json"), model, call_number)
        except Exception as exc:
            stage = "timeout" if isinstance(exc, (TimeoutError, APITimeoutError)) else None
            status_code = getattr(exc, "status_code", None)
            has_http_status = isinstance(status_code, int) and 100 <= status_code <= 599
            if stage is None and (isinstance(exc, APIStatusError) or has_http_status):
                stage = "http_response"
            if stage is None and isinstance(exc, (APIConnectionError, TypeError)):
                stage = "request"
            if stage is None:
                stage = "response_parse" if isinstance(exc, ValueError) else "request"
            return self._failure_response(
                model=model,
                role=role,
                call_number=call_number,
                stage=stage,
                exc=exc,
                status=(
                    "timeout"
                    if stage == "timeout"
                    else "invalid_structured_output"
                    if stage == "response_parse"
                    else "provider_error"
                ),
                error_kind=(
                    "timeout"
                    if stage == "timeout"
                    else "response_parse"
                    if stage == "response_parse"
                    else "provider_error"
                ),
            )

    @staticmethod
    def _safe_provider_error_token(value: Any) -> str | None:
        if not isinstance(value, str):
            return None
        value = " ".join(value.split())
        return value if re.fullmatch(r"[A-Za-z0-9_.:/-]{1,120}", value) else None

    @staticmethod
    def _safe_provider_error_message(value: Any) -> str | None:
        if not isinstance(value, str):
            return None
        value = " ".join(value.split())
        if not value or len(value) > 500:
            value = value[:500] if value else ""
        if re.search(
            r"(?:api[_ -]?key|authorization|bearer\s+|sk-[A-Za-z0-9_-]+|password|secret)",
            value,
            re.IGNORECASE,
        ):
            return "[redacted provider error detail]"
        return value or None

    @classmethod
    def _safe_provider_error_details(cls, exc: Exception) -> dict[str, str | None]:
        body = getattr(exc, "body", None)
        if isinstance(body, dict):
            error = body.get("error")
            if isinstance(error, dict):
                return {
                    "provider_error_type": cls._safe_provider_error_token(error.get("type")),
                    "provider_error_code": cls._safe_provider_error_token(error.get("code")),
                    "provider_error_param": cls._safe_provider_error_token(error.get("param")),
                    "provider_error_message": cls._safe_provider_error_message(
                        error.get("message")
                    ),
                }
        return {
            "provider_error_type": None,
            "provider_error_code": None,
            "provider_error_param": None,
            "provider_error_message": None,
        }

    @classmethod
    def _failure_response(
        cls,
        *,
        model: str,
        role: str,
        call_number: int,
        stage: str,
        exc: Exception,
        status: str = "provider_error",
        error_kind: str | None = "provider_error",
    ) -> ProviderResponse:
        status_code = getattr(exc, "status_code", None)
        if not isinstance(status_code, int) or not 100 <= status_code <= 599:
            status_code = None
        diagnostic = ProviderFailureDiagnostic(
            failure_stage=stage,
            exception_type=type(exc).__name__,
            http_status_code=status_code,
            **cls._safe_provider_error_details(exc),
            safe_message=cls._safe_message(stage, status_code),
            model=model,
            request_role=role,
            attempt_number=call_number,
        )
        return ProviderResponse(
            status,
            None,
            model,
            call_number,
            error_kind,
            diagnostic,
        )

    @staticmethod
    def _safe_message(stage: str, status_code: int | None) -> str:
        if stage == "client_initialization":
            return "OpenAI client initialization failed"
        if stage == "http_response":
            return f"OpenAI HTTP response failed ({status_code})"
        if stage == "timeout":
            return "OpenAI Responses request timed out"
        if stage == "structured_output":
            return "OpenAI response did not contain the expected structured output"
        if stage == "response_parse":
            return "OpenAI response could not be parsed into the expected schema"
        return "OpenAI Responses request failed"


def parse_runner_response(
    response: ProviderResponse, *, task_id: str, condition: str
) -> SyntheticRunObservation:
    """Convert provider output to a strict observation without repairing it."""
    if response.status != "ok" or response.payload is None:
        return SyntheticRunObservation(
            task_id=task_id,
            condition=condition,
            disposition="abstain",
            provider_status=response.status,
        )
    try:
        model_output = RunnerModelOutput.model_validate(response.payload)
        return SyntheticRunObservation(
            **model_output.model_dump(mode="json"),
            task_id=task_id,
            condition=condition,
            provider_status="ok",
            fixture_forced_failure=False,
        )
    except Exception:
        return SyntheticRunObservation(
            task_id=task_id,
            condition=condition,
            disposition="abstain",
            provider_status="invalid_structured_output",
        )


__all__ = [
    "FixtureProvider",
    "LiveCallBudget",
    "Phase73BProviderError",
    "Phase73BResponsesProvider",
    "ProviderResponse",
    "parse_runner_response",
]
