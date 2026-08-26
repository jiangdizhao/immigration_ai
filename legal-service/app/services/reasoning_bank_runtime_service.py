"""Feature-gated real ReasoningBank runtime for bounded process guidance."""

from __future__ import annotations

import hashlib
import re
import unicodedata
from typing import Any

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.schemas.learning import (
    ReasoningBankProcessGuidance,
    ReasoningBankRuntimeDecision,
    ReasoningBankRuntimeQuery,
    ReasoningBankRuntimeResult,
)
from app.services.phase7_3a_reasoning_bank import ReasoningBankService
from app.services.phase7_artifact_service import Phase7ArtifactService

_TOKEN = re.compile(r"[\w]+", re.UNICODE)
_MAX_GUIDANCE_CHARS = 8000


def _tokens(value: str) -> set[str]:
    normalized = " ".join(unicodedata.normalize("NFKC", value).casefold().split())
    return set(_TOKEN.findall(normalized))


class ReasoningBankRuntimeService:
    """One retrieval path for OFF, SHADOW, and ACTIVE modes.

    This service never creates evidence, citations, legal conclusions, or
    customer-visible answer text. ACTIVE returns only generalized procedural
    fields from eligible real rules for the answer/research model.
    """

    def __init__(
        self,
        *,
        settings: Any | None = None,
        bank_service: ReasoningBankService | None = None,
        relevance_threshold: float = 0.22,
        top_k: int = 2,
    ) -> None:
        configured = settings or get_settings()
        self.runtime_mode = configured.phase7_reasoning_bank_runtime_mode
        if self.runtime_mode not in {"off", "shadow", "active"}:
            raise ValueError("PHASE7_REASONING_BANK_RUNTIME_MODE must be off, shadow, or active")
        if relevance_threshold < 0 or relevance_threshold > 1:
            raise ValueError("relevance threshold must be between 0 and 1")
        if not 0 <= top_k <= 2:
            raise ValueError("real-bank runtime top_k must be between 0 and 2")
        self.bank_service = bank_service or ReasoningBankService(settings=configured)
        self.relevance_threshold = relevance_threshold
        self.top_k = top_k

    @staticmethod
    def _query_fingerprint(query: ReasoningBankRuntimeQuery) -> str:
        return "sha256:" + hashlib.sha256(
            Phase7ArtifactService.canonical_json_bytes(query.model_dump(mode="json"))
        ).hexdigest()

    def retrieve(
        self, db: Session | None, query: ReasoningBankRuntimeQuery
    ) -> ReasoningBankRuntimeResult:
        fingerprint = self._query_fingerprint(query)
        if self.runtime_mode == "off":
            return ReasoningBankRuntimeResult(
                runtime_mode="off",
                query_fingerprint=fingerprint,
                retrieval_status="disabled",
            )
        if db is None:
            return ReasoningBankRuntimeResult(
                runtime_mode=self.runtime_mode,
                query_fingerprint=fingerprint,
                retrieval_status="error",
                error_code="database_unavailable",
            )
        try:
            rules = [
                rule
                for rule in self.bank_service.list_rules(db, bank_namespace="real")
                if (
                    rule.bank_namespace == "real"
                    and rule.lifecycle == "approved"
                    and rule.governance_state == "normal"
                    and rule.validation_state != "failed"
                    and rule.provenance == "lawyer_reviewed"
                    and rule.origin == "live_interaction"
                )
            ]
            state = self.bank_service.state(db, bank_namespace="real")
            query_tokens = _tokens(
                " ".join(
                    [query.question]
                    + [f"{key} {value}" for key, value in sorted(query.compact_facts.items())]
                )
            )
            scored: list[tuple[Any, float]] = []
            for rule in rules:
                rule_tokens = _tokens(
                    " ".join(
                        [rule.rule_type, rule.title]
                        + rule.trigger_conditions
                        + rule.applicability_conditions
                    )
                )
                score = len(query_tokens & rule_tokens) / max(1, len(query_tokens))
                scored.append((rule, score))
            scored.sort(key=lambda item: (-item[1], item[0].rule_key))
            selected = [item for item in scored if item[1] >= self.relevance_threshold][
                : self.top_k
            ]
            selected_keys = {rule.rule_key for rule, _ in selected}
            decisions = [
                ReasoningBankRuntimeDecision(
                    rule_key=rule.rule_key,
                    rule_version=rule.rule_version,
                    relevance_score=score,
                    rank=rank,
                    selected=rule.rule_key in selected_keys,
                )
                for rank, (rule, score) in enumerate(scored, start=1)
            ]
            selected_rules = [rule for rule, _ in selected]
            guidance: list[ReasoningBankProcessGuidance] = []
            if self.runtime_mode == "active":
                serialized_chars = 0
                for rule in selected_rules:
                    item = ReasoningBankProcessGuidance(
                        title=rule.title,
                        rule_type=rule.rule_type,
                        trigger_conditions=list(rule.trigger_conditions),
                        applicability_conditions=list(rule.applicability_conditions),
                        action_steps=list(rule.action_steps),
                        verification_steps=list(rule.verification_steps),
                        prohibited_behaviors=list(rule.prohibited_behaviors),
                        exceptions_or_limits=list(rule.exceptions_or_limits),
                    )
                    item_chars = len(item.model_dump_json())
                    if serialized_chars + item_chars > _MAX_GUIDANCE_CHARS:
                        break
                    guidance.append(item)
                    serialized_chars += item_chars
            return ReasoningBankRuntimeResult(
                runtime_mode=self.runtime_mode,
                query_fingerprint=fingerprint,
                bank_digest=state.bank_digest,
                selected_rule_keys=[rule.rule_key for rule in selected_rules],
                selected_rule_versions={rule.rule_key: rule.rule_version for rule in selected_rules},
                relevance_scores={rule.rule_key: score for rule, score in selected},
                process_guidance=guidance,
                retrieval_status="completed",
                decisions=decisions[:3],
            )
        except Exception:
            return ReasoningBankRuntimeResult(
                runtime_mode=self.runtime_mode,
                query_fingerprint=fingerprint,
                retrieval_status="error",
                error_code="runtime_retrieval_failed",
            )

    def disabled_result(self, query: ReasoningBankRuntimeQuery) -> ReasoningBankRuntimeResult:
        """Return a content-free disabled result for unsupported model lanes."""
        return ReasoningBankRuntimeResult(
            runtime_mode="off",
            query_fingerprint=self._query_fingerprint(query),
            retrieval_status="disabled",
        )

    @staticmethod
    def telemetry(result: ReasoningBankRuntimeResult) -> dict[str, Any]:
        """Return bounded non-content telemetry suitable for trace storage."""
        return {
            "mode": result.runtime_mode,
            "bank_namespace": result.bank_namespace,
            "bank_digest": result.bank_digest,
            "selected_rule_keys": list(result.selected_rule_keys),
            "selected_rule_versions": dict(result.selected_rule_versions),
            "relevance_scores": dict(result.relevance_scores),
            "retrieval_status": result.retrieval_status,
            "error_code": result.error_code,
        }

    @staticmethod
    def prompt_block(result: ReasoningBankRuntimeResult) -> str:
        """Render only safe process fields for an ACTIVE answer-model prompt."""
        if result.runtime_mode != "active" or not result.process_guidance:
            return ""
        sections = [
            "LAWYER-APPROVED PROCESS GUIDANCE",
            "The following rules describe HOW to reason, research, request facts, verify, or avoid known reasoning failures.",
            "They are NOT legal evidence. They are NOT legal authority. They must NOT be cited or establish a legal proposition.",
            "Ignore a rule when its applicability conditions do not fit the current request.",
            "Any substantive legal conclusion must still be supported through the normal evidence/research tools.",
        ]
        for index, rule in enumerate(result.process_guidance, start=1):
            sections.append(
                "\n".join(
                    [
                        f"Rule {index}",
                        f"Title: {rule.title}",
                        f"Type: {rule.rule_type}",
                        "WHEN: " + "; ".join(rule.trigger_conditions),
                        "APPLY IF: " + "; ".join(rule.applicability_conditions),
                        "DO: " + "; ".join(rule.action_steps),
                        "VERIFY: " + "; ".join(rule.verification_steps),
                        "AVOID: " + "; ".join(rule.prohibited_behaviors),
                        "LIMITS: " + "; ".join(rule.exceptions_or_limits),
                    ]
                )
            )
        return "\n\n".join(sections)


__all__ = ["ReasoningBankRuntimeService"]
