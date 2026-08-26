"""Auditable lexical retrieval for the Phase 7.3B simulation only."""

from __future__ import annotations

import hashlib
import re
import unicodedata
from typing import Iterable

from app.schemas.learning import ReasoningLesson
from app.schemas.phase7_3b import (
    GuidanceRule,
    ReasoningGuidancePacket,
    RetrievalDecision,
    RetrievalQuery,
    RetrievalResult,
)
from app.services.phase7_artifact_service import Phase7ArtifactService


_TOKEN = re.compile(r"[\w]+", re.UNICODE)


def _normal(value: str) -> str:
    return " ".join(unicodedata.normalize("NFKC", value).casefold().split())


def _tokens(value: str) -> set[str]:
    return set(_TOKEN.findall(_normal(value)))


class Phase73BReasoningRetriever:
    """Simulation-only retriever; it has no oracle or serving dependency."""

    def __init__(self, *, relevance_threshold: float = 0.22, top_k: int = 3):
        if relevance_threshold < 0:
            raise ValueError("relevance threshold must be non-negative")
        if not 0 <= top_k <= 3:
            raise ValueError("Phase 7.3B top_k must be between 0 and 3")
        self.relevance_threshold = relevance_threshold
        self.top_k = top_k

    def retrieve(
        self,
        task: RetrievalQuery,
        *,
        rules: Iterable[ReasoningLesson],
        bank_digest: str,
    ) -> RetrievalResult:
        """Retrieve from a strict task-visible query only; no oracle labels are accepted."""
        query = " ".join(
            [task.question]
            + [f"{key} {value}" for key, value in sorted(task.compact_facts.items())]
            + [item.value for item in task.synthetic_observations]
        )
        query_tokens = _tokens(query)
        query_fingerprint = (
            "sha256:"
            + hashlib.sha256(
                Phase7ArtifactService.canonical_json_bytes(
                    {
                        "question": task.question,
                        "compact_facts": task.compact_facts,
                        "synthetic_observations": [
                            item.model_dump(mode="json") for item in task.synthetic_observations
                        ],
                    }
                )
            ).hexdigest()
        )
        candidates: list[tuple[ReasoningLesson, float]] = []
        for rule in rules:
            if (
                rule.bank_namespace != "simulation"
                or rule.lifecycle != "approved"
                or rule.governance_state != "normal"
                or rule.validation_state == "failed"
            ):
                continue
            rule_text = " ".join(
                [
                    rule.rule_type,
                    rule.title,
                    *rule.trigger_conditions,
                    *rule.applicability_conditions,
                ]
            )
            rule_tokens = _tokens(rule_text)
            score = len(query_tokens & rule_tokens) / max(1, len(query_tokens))
            candidates.append((rule, score))
        candidates.sort(key=lambda item: (-item[1], item[0].rule_key))

        decisions: list[RetrievalDecision] = []
        selected: list[ReasoningLesson] = []
        for rank, (rule, score) in enumerate(candidates, start=1):
            if score < self.relevance_threshold:
                decisions.append(
                    RetrievalDecision(
                        rule_key=rule.rule_key,
                        score=score,
                        rank=rank,
                        selected=False,
                        rejection_reason="below_threshold",
                    )
                )
            elif len(selected) >= self.top_k:
                decisions.append(
                    RetrievalDecision(
                        rule_key=rule.rule_key,
                        score=score,
                        rank=rank,
                        selected=False,
                        rejection_reason="top_k_exceeded",
                    )
                )
            else:
                selected.append(rule)
                decisions.append(
                    RetrievalDecision(
                        rule_key=rule.rule_key,
                        score=score,
                        rank=rank,
                        selected=True,
                    )
                )

        guidance_rules = [
            GuidanceRule(
                rule_key=rule.rule_key,
                rule_version=rule.rule_version,
                rule_type=rule.rule_type,
                title=rule.title,
                trigger_conditions=list(rule.trigger_conditions),
                applicability_conditions=list(rule.applicability_conditions),
                action_steps=list(rule.action_steps),
                verification_steps=list(rule.verification_steps),
                prohibited_behaviors=list(rule.prohibited_behaviors),
                exceptions_or_limits=list(rule.exceptions_or_limits),
                relevance_score=next(
                    item.score for item in decisions if item.rule_key == rule.rule_key
                ),
                retrieval_rank=next(
                    item.rank for item in decisions if item.rule_key == rule.rule_key
                ),
            )
            for rule in selected
        ]
        packet_body = {
            "bank_namespace": "simulation",
            "bank_digest": bank_digest,
            "query_fingerprint": query_fingerprint,
            "rules": [item.model_dump(mode="json") for item in guidance_rules],
        }
        packet_id = (
            "guidance-"
            + hashlib.sha256(Phase7ArtifactService.canonical_json_bytes(packet_body)).hexdigest()
        )
        guidance = ReasoningGuidancePacket(
            packet_id=packet_id,
            bank_digest=bank_digest,
            query_fingerprint=query_fingerprint,
            rules=guidance_rules,
        )
        return RetrievalResult(
            query_fingerprint=query_fingerprint,
            threshold=self.relevance_threshold,
            top_k=self.top_k,
            decisions=decisions,
            selected_rule_keys=[rule.rule_key for rule in selected],
            guidance=guidance,
        )


__all__ = ["Phase73BReasoningRetriever"]
