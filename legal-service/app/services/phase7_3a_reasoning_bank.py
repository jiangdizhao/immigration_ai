"""Offline Phase 7.3A rule formation and ReasoningBank governance.

This is a control-plane service only: it has no model, retrieval, embedding,
evidence-registry, or customer-query dependency. Lineage is resolved from
persisted, hash-checked artifacts before it can support a rule.
"""

from __future__ import annotations

import hashlib
import re
import unicodedata
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Iterable
from uuid import uuid4

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.models import AnswerReview, AnswerTrace, ExperienceRecord, ReviewArtifact
from app.schemas.learning import (
    EvaluationCase,
    ExperienceSnapshot,
    ReasoningBankState,
    ReasoningLesson,
    ReasoningLessonCandidate,
    ReasoningRuleDecision,
    ReasoningRuleProposal,
    RuleCompilerCaseSummary,
    RuleCompilerCandidateSummary,
    RuleCompilerMetadata,
    RuleCompilerOutput,
    RuleCompilerPacket,
    RuleQualityGateReport,
)
from app.services.phase7_artifact_service import Phase7ArtifactService
from app.services.evaluation_bank_service import (
    EvaluationBankService,
    EvaluationBankValidationError,
)

PROPOSAL_ARTIFACT = "phase7_reasoning_rule_proposal"
DECISION_ARTIFACT = "phase7_reasoning_rule_decision"
RULE_ARTIFACT = "phase7_reasoning_lesson"
CANDIDATE_ARTIFACT = "phase7_reasoning_lesson_candidate"
MAX_RULES = 150
MAX_RULES_PER_TYPE = 50

_URL = re.compile(r"(?:https?://|www\.)\S+", re.IGNORECASE)
_EMAIL = re.compile(r"\b[^\s@]+@[^\s@]+\.[^\s@]+\b")
_UUID = re.compile(r"\b[0-9a-f]{8}-[0-9a-f-]{27,}\b", re.IGNORECASE)
_ISO_DATE = re.compile(r"\b\d{4}-\d{2}-\d{2}(?:[T ][0-9:.+Z-]+)?\b")
_IDENTIFIER = re.compile(
    r"\b(?:request|evidence|source|chunk|experience|answer[_ -]?trace|review|matter|candidate|case|trace)[_-][a-z0-9][a-z0-9_-]*\b",
    re.IGNORECASE,
)
_WORDS = re.compile(r"[\w]+", re.UNICODE)
_CJK = re.compile(r"[\u3400-\u9fff]{12,}")
_SAFE_SCOPE_KEYS = {
    "topic",
    "operation_type",
    "visa_type",
    "jurisdiction",
    "phase",
    "decision_type",
}
_SAFE_CASE_KEYS = {"expected_verdict", "required_behavior", "failure_mode", "severity"}


class RuleFormationError(ValueError):
    """A proposal or governance operation cannot be safely materialized."""


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _normal(value: str) -> str:
    return " ".join(unicodedata.normalize("NFKC", value).strip().split()).casefold()


def _body(rule: ReasoningRuleProposal | ReasoningLesson) -> dict[str, Any]:
    return {
        "rule_type": rule.rule_type,
        "title": rule.title,
        "trigger_conditions": list(rule.trigger_conditions),
        "applicability_conditions": list(rule.applicability_conditions),
        "action_steps": list(rule.action_steps),
        "verification_steps": list(rule.verification_steps),
        "prohibited_behaviors": list(rule.prohibited_behaviors),
        "exceptions_or_limits": list(rule.exceptions_or_limits),
    }


def _normalized_body(rule: ReasoningRuleProposal | ReasoningLesson) -> dict[str, Any]:
    return {
        key: (_normal(value) if isinstance(value, str) else [_normal(item) for item in value])
        for key, value in _body(rule).items()
    }


def exact_rule_body_fingerprint(rule: ReasoningRuleProposal | ReasoningLesson) -> str:
    """Exact normalized duplicate fingerprint, not semantic/fuzzy deduplication."""
    return hashlib.sha256(
        Phase7ArtifactService.canonical_json_bytes(_normalized_body(rule))
    ).hexdigest()


def _normalized_compiler_draft(draft: Any) -> dict[str, Any]:
    """Return the stable semantic portion of a compiler draft."""
    raw = draft.model_dump(mode="json")
    list_fields = {
        "trigger_conditions",
        "applicability_conditions",
        "action_steps",
        "verification_steps",
        "prohibited_behaviors",
        "exceptions_or_limits",
        "transfer_targets",
        "supporting_evaluation_case_ids",
        "negative_control_case_ids",
        "source_specific_residue",
        "legal_proposition_residue",
    }
    unordered_fields = {
        "transfer_targets",
        "supporting_evaluation_case_ids",
        "negative_control_case_ids",
        "source_specific_residue",
        "legal_proposition_residue",
    }
    normalized = {}
    for key, value in raw.items():
        if isinstance(value, str):
            normalized[key] = _normal(value)
        elif key in list_fields:
            values = [_normal(item) for item in value]
            normalized[key] = sorted(set(values)) if key in unordered_fields else values
        else:
            normalized[key] = value
    return normalized


def _unique(values: Iterable[str]) -> list[str]:
    return sorted({value for value in values if value})


class RuleQualityGateService:
    """Hard-residue/structure gate; it is not semantic generalization proof."""

    @staticmethod
    def _strings(proposal: ReasoningRuleProposal) -> list[str]:
        return [
            proposal.title,
            *proposal.trigger_conditions,
            *proposal.applicability_conditions,
            *proposal.action_steps,
            *proposal.verification_steps,
            *proposal.prohibited_behaviors,
            *proposal.exceptions_or_limits,
            *proposal.transfer_targets,
        ]

    def evaluate(
        self, proposal: ReasoningRuleProposal, *, source_materials: Iterable[str] = ()
    ) -> RuleQualityGateReport:
        reasons: list[str] = []
        residue: list[str] = []
        for name, reason in (
            ("trigger_conditions", "missing_trigger"),
            ("action_steps", "missing_action"),
            ("verification_steps", "missing_verification"),
            ("exceptions_or_limits", "missing_boundary"),
        ):
            if not getattr(proposal, name):
                reasons.append(reason)
        if not proposal.case_erasure_confirmation:
            reasons.append("case_erasure_not_confirmed")
        if not proposal.procedural_only_confirmation:
            reasons.append("procedural_only_not_confirmed")
        if proposal.source_specific_residue:
            reasons.append("copied_source_span")
            residue.extend(proposal.source_specific_residue)
        if proposal.legal_proposition_residue:
            reasons.append("substantive_legal_content")
            residue.extend(proposal.legal_proposition_residue)
        combined = "\n".join(self._strings(proposal))
        for reason, pattern in (
            ("contains_url", _URL),
            ("contains_identifier", _EMAIL),
            ("contains_identifier", _UUID),
            ("contains_identifier", _ISO_DATE),
            ("contains_identifier", _IDENTIFIER),
        ):
            if match := pattern.search(combined):
                reasons.append(reason)
                residue.append(match.group(0))
        words = [_normal(word) for word in _WORDS.findall(combined)]
        for source in source_materials:
            source_words = [_normal(word) for word in _WORDS.findall(source)]
            ngrams = {tuple(source_words[i : i + 12]) for i in range(len(source_words) - 11)}
            if (
                len(words) >= 12
                and len(source_words) >= 12
                and any(tuple(words[i : i + 12]) in ngrams for i in range(len(words) - 11))
            ):
                reasons.append("copied_source_span")
                residue.append("12-word normalized overlap")
                break
            rule_cjk, source_cjk = "".join(_CJK.findall(combined)), "".join(_CJK.findall(source))
            if len(rule_cjk) >= 12 and rule_cjk in source_cjk:
                reasons.append("copied_source_span")
                residue.append("12-character CJK overlap")
                break
        return RuleQualityGateReport(
            result="PASS" if not reasons else "FAIL",
            reason_codes=_unique(reasons),
            detected_residue=_unique(residue),
        )


class Phase73RuleCompilerService:
    """Builds bounded allowlisted packets and never executes a model."""

    def build_packet(
        self,
        db: Session,
        *,
        candidate_ids: list[str],
        bank_namespace: str,
        evaluation_cases: Iterable[dict[str, Any]] = (),
        contrast_cases: Iterable[dict[str, Any]] = (),
        negative_controls: Iterable[dict[str, Any]] = (),
    ) -> RuleCompilerPacket:
        if bank_namespace not in {"real", "simulation"}:
            raise RuleFormationError("invalid bank namespace")
        candidates = CandidatePoolService().list_candidates(
            db, candidate_ids=candidate_ids, bank_namespace=bank_namespace
        )
        if {item.candidate_id for item in candidates} != set(candidate_ids):
            raise RuleFormationError("packet references missing or incompatible candidates")

        def cases(items: Iterable[dict[str, Any]]) -> list[RuleCompilerCaseSummary]:
            result = []
            for item in items:
                case_id = str(item.get("case_id") or "")
                if case_id:
                    case = _resolve_evaluation_case(db, case_id, bank_namespace)
                    result.append(
                        RuleCompilerCaseSummary(
                            case_id=case.case_id,
                            provenance=case.provenance,
                            origin=case.origin,
                            review_outcome=case.review_outcome,
                            issue_categories=list(case.issue_categories)[:20],
                            expected_checker_behavior=_safe_case_mapping(
                                case.expected_checker_behavior
                            ),
                        )
                    )
            return result

        summaries = [
            RuleCompilerCandidateSummary(
                candidate_id=item.candidate_id,
                provenance=item.provenance,
                origin=item.origin,
                lesson_text=item.lesson_text[:2000],
                issue_categories=list(item.issue_categories)[:20],
                scope_applicability=_safe_scope_mapping(item.scope_applicability),
            )
            for item in candidates
        ]
        packet = RuleCompilerPacket(
            packet_id="pending",
            bank_namespace=bank_namespace,
            candidates=summaries,
            issue_categories=_unique(
                category for item in candidates for category in item.issue_categories
            ),
            affected_claim_ids=_unique(
                claim for item in candidates for claim in item.affected_claim_ids
            ),
            scope_applicability={"candidate_count": len(summaries), "namespaces": [bank_namespace]},
            source_review_outcomes=[],
            evaluation_cases=cases(evaluation_cases),
            contrast_cases=cases(contrast_cases),
            negative_controls=cases(negative_controls),
        )
        packet_id = hashlib.sha256(
            Phase7ArtifactService.canonical_json_bytes(
                {
                    key: value
                    for key, value in packet.model_dump(mode="json").items()
                    if key != "packet_id"
                }
            )
        ).hexdigest()[:40]
        return packet.model_copy(update={"packet_id": f"packet-{packet_id}"})

    def create_proposals_from_output(
        self,
        db: Session,
        *,
        source_candidate_ids: list[str],
        compiler_output: RuleCompilerOutput,
        namespace: str,
        trusted_lawyer_review: bool = False,
    ) -> list[ReviewArtifact]:
        packet = self.build_packet(db, candidate_ids=source_candidate_ids, bank_namespace=namespace)
        if compiler_output.packet_id != packet.packet_id:
            raise RuleFormationError("compiler output packet_id does not match server packet")
        candidates = CandidatePoolService().list_candidates(
            db, candidate_ids=source_candidate_ids, bank_namespace=namespace
        )
        artifacts = []
        seen: set[str] = set()
        for draft in compiler_output.proposals:
            identity = hashlib.sha256(
                Phase7ArtifactService.canonical_json_bytes(
                    {
                        "namespace": namespace,
                        "candidate_ids": _unique(source_candidate_ids),
                        "body": _normalized_compiler_draft(draft),
                    }
                )
            ).hexdigest()
            if identity in seen:
                raise RuleFormationError("compiler output contains duplicate proposal drafts")
            seen.add(identity)
            first = candidates[0]
            proposal = ReasoningRuleProposal(
                proposal_id=f"proposal-{identity[:40]}",
                bank_namespace=namespace,
                source_candidate_ids=_unique(item.candidate_id for item in candidates),
                source_review_ids=_unique(item.source_review_id for item in candidates),
                source_experience_ids=_unique(
                    exp
                    for item in candidates
                    for exp in (
                        (
                            [item.source_experience_record_id]
                            if item.source_experience_record_id
                            else []
                        )
                        + list(item.supporting_experience_ids)
                    )
                ),
                proposal_origin="manual" if namespace == "real" else "synthetic_simulation",
                provenance=first.provenance,
                origin=first.origin,
                rule_type=draft.rule_type,
                title=draft.title,
                trigger_conditions=draft.trigger_conditions,
                applicability_conditions=draft.applicability_conditions,
                action_steps=draft.action_steps,
                verification_steps=draft.verification_steps,
                prohibited_behaviors=draft.prohibited_behaviors,
                exceptions_or_limits=draft.exceptions_or_limits,
                transfer_targets=draft.transfer_targets,
                case_erasure_confirmation=draft.case_erasure_confirmation,
                procedural_only_confirmation=draft.procedural_only_confirmation,
                source_specific_residue=draft.source_specific_residue,
                legal_proposition_residue=draft.legal_proposition_residue,
                supporting_evaluation_case_ids=_unique(draft.supporting_evaluation_case_ids),
                negative_control_case_ids=_unique(draft.negative_control_case_ids),
                compiler_metadata=RuleCompilerMetadata(
                    compiler_kind="offline_rule_compiler",
                    compiler_version="output-v1",
                    prompt_template_version="phase7.3a.v1",
                    formation_mode="manual_offline" if namespace == "real" else "synthetic_offline",
                    generated_at=_now(),
                ),
            )
            artifacts.append(
                ReasoningBankManager().persist_proposal(
                    db, proposal, trusted_lawyer_review=trusted_lawyer_review
                )
            )
        return artifacts

    @staticmethod
    def build_prompt(packet: RuleCompilerPacket) -> str:
        return (
            "You are a bounded offline rule compiler. Extract reusable PROCESS knowledge only.\n"
            "Do not preserve names, URLs, dates, IDs, exact questions, exact answers, search queries, or case-specific facts.\n"
            "Do not produce substantive immigration-law propositions or hidden reasoning; do not treat memory as legal authority. Produce 0-3 strict semantic drafts.\n\n"
            f"Allowlisted packet:\n{packet.model_dump_json(indent=2)}"
        )


class CandidatePoolService:
    """Current candidate read model with complete history and lineage checks."""

    def list_candidates(
        self,
        db: Session,
        *,
        candidate_ids: list[str] | None = None,
        bank_namespace: str | None = None,
        processed: bool | None = None,
    ) -> list[ReasoningLessonCandidate]:
        logical = _current_entries(
            db,
            CANDIDATE_ARTIFACT,
            ReasoningLessonCandidate,
            lambda item: item.candidate_id,
        )
        result = []
        for row, candidate in sorted(logical.values(), key=lambda value: value[1].candidate_id):
            if candidate_ids and candidate.candidate_id not in candidate_ids:
                continue
            _validate_candidate_lineage(db, row, candidate)
            if bank_namespace and not _namespace_compatible(candidate, bank_namespace):
                continue
            state = candidate_processing_state(db, candidate.candidate_id)
            if processed is not None and (state == "processed") != processed:
                continue
            result.append(candidate)
        return result


class ReasoningBankService:
    """Read-only governance view; it never selects rules for a query."""

    def __init__(
        self,
        *,
        settings: Any | None = None,
        max_rules: int | None = None,
        max_rules_per_type: int | None = None,
    ):
        configured = settings or get_settings()
        self.max_rules = (
            max_rules if max_rules is not None else configured.phase7_reasoning_bank_max_rules
        )
        self.max_rules_per_type = (
            max_rules_per_type
            if max_rules_per_type is not None
            else configured.phase7_reasoning_bank_max_rules_per_type
        )

    def list_proposals(
        self, db: Session, *, bank_namespace: str | None = None
    ) -> list[ReasoningRuleProposal]:
        values = _current_logical(
            db, PROPOSAL_ARTIFACT, ReasoningRuleProposal, lambda item: item.proposal_id
        ).values()
        return [
            item
            for item in sorted(values, key=lambda value: value.proposal_id)
            if not bank_namespace or item.bank_namespace == bank_namespace
        ]

    def list_rules(
        self, db: Session, *, bank_namespace: str | None = None
    ) -> list[ReasoningLesson]:
        values = _current_logical(
            db, RULE_ARTIFACT, ReasoningLesson, lambda item: item.rule_key
        ).values()
        return [
            item
            for item in sorted(values, key=lambda value: value.rule_key)
            if not bank_namespace or item.bank_namespace == bank_namespace
        ]

    def get_rule(self, db: Session, rule_key: str) -> ReasoningLesson | None:
        return next((rule for rule in self.list_rules(db) if rule.rule_key == rule_key), None)

    def state(self, db: Session, *, bank_namespace: str) -> ReasoningBankState:
        rules = self.list_rules(db, bank_namespace=bank_namespace)
        current = [rule for rule in rules if rule.lifecycle != "retired"]
        counts: dict[str, int] = {}
        for rule in current:
            counts[rule.rule_type] = counts.get(rule.rule_type, 0) + 1
        digest_input = [
            _logical_rule_digest_payload(rule)
            for rule in sorted(rules, key=lambda item: item.rule_key)
        ]
        digest = hashlib.sha256(
            Phase7ArtifactService.canonical_json_bytes(digest_input)
        ).hexdigest()
        proposals = self.list_proposals(db, bank_namespace=bank_namespace)
        return ReasoningBankState(
            bank_namespace=bank_namespace,
            max_rules=self.max_rules,
            max_rules_per_type=self.max_rules_per_type,
            current_rule_count=len(current),
            approved_count=sum(rule.lifecycle == "approved" for rule in current),
            retired_count=sum(rule.lifecycle == "retired" for rule in rules),
            conflicted_count=sum(rule.governance_state == "conflicted" for rule in current),
            quarantined_count=sum(rule.governance_state == "quarantined" for rule in current),
            counts_by_rule_type=counts,
            capacity_remaining=max(0, self.max_rules - len(current)),
            unresolved_proposal_count=sum(
                candidate_processing_proposal_state(db, item.proposal_id) == "unresolved"
                for item in proposals
            ),
            bank_digest=f"sha256:{digest}",
        )


class ReasoningBankManager:
    """Explicit governance with namespace serialization and savepoints."""

    def __init__(
        self,
        *,
        settings: Any | None = None,
        max_rules: int | None = None,
        max_rules_per_type: int | None = None,
    ):
        configured = settings or get_settings()
        self.max_rules = (
            max_rules if max_rules is not None else configured.phase7_reasoning_bank_max_rules
        )
        self.max_rules_per_type = (
            max_rules_per_type
            if max_rules_per_type is not None
            else configured.phase7_reasoning_bank_max_rules_per_type
        )
        self.quality_gate = RuleQualityGateService()
        self.read = ReasoningBankService(
            max_rules=self.max_rules, max_rules_per_type=self.max_rules_per_type
        )

    @staticmethod
    def advisory_lock_key(namespace: str) -> int:
        if namespace not in {"real", "simulation"}:
            raise RuleFormationError("invalid bank namespace")
        return int.from_bytes(
            hashlib.sha256(f"phase7_reasoning_bank:{namespace}".encode()).digest()[:8],
            "big",
            signed=True,
        )

    def _lock_namespace(self, db: Session, namespace: str) -> None:
        if callable(getattr(db, "execute", None)):
            db.execute(
                text("SELECT pg_advisory_xact_lock(:lock_key)"),
                {"lock_key": self.advisory_lock_key(namespace)},
            )

    @contextmanager
    def _mutation(self, db: Session, namespace: str):
        nested = getattr(db, "begin_nested", None)
        if callable(nested):
            with nested():
                self._lock_namespace(db, namespace)
                yield
                db.flush()
        else:
            self._lock_namespace(db, namespace)
            yield
            db.flush()

    def persist_proposal(
        self, db: Session, proposal: ReasoningRuleProposal, *, trusted_lawyer_review: bool = False
    ) -> ReviewArtifact:
        with self._mutation(db, proposal.bank_namespace):
            return self._persist_proposal_locked(db, proposal, trusted_lawyer_review)

    def _persist_proposal_locked(
        self, db: Session, proposal: ReasoningRuleProposal, trusted_lawyer_review: bool
    ) -> ReviewArtifact:
        if proposal.bank_namespace == "real" and not trusted_lawyer_review:
            raise RuleFormationError(
                "trusted lawyer assertion required for real proposal persistence"
            )
        candidates = CandidatePoolService().list_candidates(
            db, candidate_ids=proposal.source_candidate_ids
        )
        if {item.candidate_id for item in candidates} != set(proposal.source_candidate_ids):
            raise RuleFormationError("proposal references missing or superseded candidates")
        if not all(_namespace_compatible(item, proposal.bank_namespace) for item in candidates):
            raise RuleFormationError("proposal candidate namespace/provenance mismatch")
        review_ids = _unique(item.source_review_id for item in candidates)
        if not review_ids or set(review_ids) != set(proposal.source_review_ids):
            raise RuleFormationError("proposal source_review_ids must match resolved candidates")
        experience_ids = _unique(
            exp
            for item in candidates
            for exp in (
                [item.source_experience_record_id] if item.source_experience_record_id else []
            )
            + list(item.supporting_experience_ids)
        )
        if set(proposal.source_experience_ids) != set(experience_ids):
            extras = sorted(set(proposal.source_experience_ids) - set(experience_ids))
            raise RuleFormationError(
                "ExperienceRecord support is not derived from resolved candidates: "
                + ",".join(extras)
            )
        eval_ids = _unique(proposal.supporting_evaluation_case_ids)
        negative_ids = _unique(proposal.negative_control_case_ids)
        for value in [*eval_ids, *negative_ids]:
            _resolve_evaluation_case(db, value, proposal.bank_namespace)
        if proposal.canonical_payload_sha256 and not Phase7ArtifactService.verify_payload_hash(
            proposal.model_dump(mode="json")
        ):
            raise RuleFormationError("invalid canonical hash for proposal")
        proposal = proposal.model_copy(
            update={
                "source_candidate_ids": _unique(item.candidate_id for item in candidates),
                "source_review_ids": review_ids,
                "source_experience_ids": experience_ids,
                "supporting_evaluation_case_ids": eval_ids,
                "negative_control_case_ids": negative_ids,
                "canonical_payload_sha256": None,
            }
        )
        self._lock_reviews(db, review_ids)
        current = _current_artifact(
            db, PROPOSAL_ARTIFACT, ReasoningRuleProposal, proposal.proposal_id
        )
        if current:
            stored = _validate(current, ReasoningRuleProposal)
            if exact_rule_body_fingerprint(stored) == exact_rule_body_fingerprint(
                proposal
            ) and _proposal_semantics(stored) == _proposal_semantics(proposal):
                return current
            proposal = _seal(proposal, stored.artifact_version + 1, current.id)
            current.artifact_status = "superseded"
        else:
            proposal = _seal(proposal, 1, None)
        artifact = ReviewArtifact(
            id=str(uuid4()),
            answer_review_id=self._anchor(review_ids),
            artifact_type=PROPOSAL_ARTIFACT,
            artifact_payload=proposal.model_dump(mode="json"),
            artifact_status="active",
        )
        db.add(artifact)
        return artifact

    def approve_new(
        self,
        db: Session,
        proposal: ReasoningRuleProposal | str,
        *,
        decided_by: str,
        trusted_lawyer_review: bool = False,
        case_erasure_confirmed: bool = False,
        procedural_only_confirmed: bool = False,
        decision_reason_code: str = "other",
    ) -> ReasoningLesson:
        namespace = self._proposal_namespace(db, proposal)
        with self._mutation(db, namespace):
            item = self._proposal(db, proposal)
            prior = self._retry_result(
                db,
                item,
                "approve_new",
                None,
                None,
                decision_reason_code,
                case_erasure_confirmed,
                procedural_only_confirmed,
            )
            if prior is not None:
                return prior
            self._authorize(
                item, trusted_lawyer_review, case_erasure_confirmed, procedural_only_confirmed
            )
            self._lock_reviews(db, item.source_review_ids)
            if any(
                exact_rule_body_fingerprint(item) == exact_rule_body_fingerprint(rule)
                for rule in self.read.list_rules(db, bank_namespace=item.bank_namespace)
            ):
                raise RuleFormationError(
                    "duplicate current rule; use explicit consolidation decision"
                )
            self._ensure_capacity(db, item)
            key = self._rule_key(item)
            existing = self.read.get_rule(db, key)
            if existing:
                return existing
            rule = self._rule_from_proposal(
                item, key=key, version=1, approved_by=decided_by, approval_mode=self._mode(item)
            )
            self._record_decision(
                db,
                item,
                action="approve_new",
                decided_by=decided_by,
                resulting=rule,
                trusted_lawyer_review=trusted_lawyer_review,
                reason_code=decision_reason_code,
                case_erasure_confirmed=case_erasure_confirmed,
                procedural_only_confirmed=procedural_only_confirmed,
            )
            self._persist_rule(db, rule, item.source_review_ids)
            return rule

    def apply_decision(
        self,
        db: Session,
        *,
        proposal_id: str,
        action: str,
        decided_by: str,
        target_rule_key: str | None = None,
        decision_reason_code: str = "other",
        trusted_lawyer_review: bool = False,
        case_erasure_confirmed: bool = False,
        procedural_only_confirmed: bool = False,
    ) -> Any:
        common = dict(
            decided_by=decided_by,
            trusted_lawyer_review=trusted_lawyer_review,
            case_erasure_confirmed=case_erasure_confirmed,
            procedural_only_confirmed=procedural_only_confirmed,
            decision_reason_code=decision_reason_code,
        )
        if action == "approve_new":
            return self.approve_new(db, proposal_id, **common)
        if action == "merge_support" and target_rule_key:
            return self.merge_support(db, proposal_id, target_rule_key=target_rule_key, **common)
        if action == "revise_existing" and target_rule_key:
            return self.revise_existing(db, proposal_id, target_rule_key=target_rule_key, **common)
        if action == "mark_conflict" and target_rule_key:
            return self.mark_conflict(db, proposal_id, target_rule_key=target_rule_key, **common)
        if action == "reject":
            return self.reject(
                db,
                proposal_id,
                decided_by=decided_by,
                reason_code=decision_reason_code,
                trusted_lawyer_review=trusted_lawyer_review,
            )
        raise RuleFormationError(f"unsupported governance action or missing target: {action}")

    def merge_support(
        self,
        db: Session,
        proposal: ReasoningRuleProposal | str,
        *,
        target_rule_key: str,
        decided_by: str,
        trusted_lawyer_review: bool = False,
        case_erasure_confirmed: bool = False,
        procedural_only_confirmed: bool = False,
        decision_reason_code: str = "other",
    ) -> ReasoningLesson:
        namespace = self._proposal_namespace(db, proposal)
        with self._mutation(db, namespace):
            item = self._proposal(db, proposal)
            target = self._target(db, target_rule_key, item.bank_namespace)
            prior = self._retry_result(
                db,
                item,
                "merge_support",
                target_rule_key,
                target.rule_version,
                decision_reason_code,
                case_erasure_confirmed,
                procedural_only_confirmed,
            )
            if prior is not None:
                return prior
            self._authorize(
                item, trusted_lawyer_review, case_erasure_confirmed, procedural_only_confirmed
            )
            if target.lifecycle == "retired":
                raise RuleFormationError("retired rule cannot receive support")
            if exact_rule_body_fingerprint(item) != exact_rule_body_fingerprint(target):
                raise RuleFormationError("merge_support requires an unchanged semantic rule body")
            review_ids = _unique([*target.supporting_review_ids, *item.source_review_ids])
            self._lock_reviews(db, review_ids)
            rule = self._successor(
                target, item, version=target.rule_version + 1, supporting_review_ids=review_ids
            )
            self._record_decision(
                db,
                item,
                action="merge_support",
                decided_by=decided_by,
                target=target,
                resulting=rule,
                trusted_lawyer_review=trusted_lawyer_review,
                reason_code=decision_reason_code,
                case_erasure_confirmed=case_erasure_confirmed,
                procedural_only_confirmed=procedural_only_confirmed,
            )
            self._persist_rule(db, rule, review_ids)
            return rule

    def revise_existing(
        self,
        db: Session,
        proposal: ReasoningRuleProposal | str,
        *,
        target_rule_key: str,
        decided_by: str,
        trusted_lawyer_review: bool = False,
        case_erasure_confirmed: bool = False,
        procedural_only_confirmed: bool = False,
        decision_reason_code: str = "other",
    ) -> ReasoningLesson:
        namespace = self._proposal_namespace(db, proposal)
        with self._mutation(db, namespace):
            item = self._proposal(db, proposal)
            target = self._target(db, target_rule_key, item.bank_namespace)
            prior = self._retry_result(
                db,
                item,
                "revise_existing",
                target_rule_key,
                target.rule_version,
                decision_reason_code,
                case_erasure_confirmed,
                procedural_only_confirmed,
            )
            if prior is not None:
                return prior
            self._authorize(
                item, trusted_lawyer_review, case_erasure_confirmed, procedural_only_confirmed
            )
            if target.lifecycle == "retired":
                raise RuleFormationError("retired rule cannot be revised")
            review_ids = _unique([*target.supporting_review_ids, *item.source_review_ids])
            self._lock_reviews(db, review_ids)
            rule = self._successor(
                target,
                item,
                version=target.rule_version + 1,
                supporting_review_ids=review_ids,
                replace_body=True,
            )
            self._record_decision(
                db,
                item,
                action="revise_existing",
                decided_by=decided_by,
                target=target,
                resulting=rule,
                trusted_lawyer_review=trusted_lawyer_review,
                reason_code=decision_reason_code,
                case_erasure_confirmed=case_erasure_confirmed,
                procedural_only_confirmed=procedural_only_confirmed,
            )
            self._persist_rule(db, rule, review_ids)
            return rule

    def mark_conflict(
        self,
        db: Session,
        proposal: ReasoningRuleProposal | str,
        *,
        target_rule_key: str,
        decided_by: str,
        trusted_lawyer_review: bool = False,
        case_erasure_confirmed: bool = False,
        procedural_only_confirmed: bool = False,
        decision_reason_code: str = "other",
    ) -> tuple[ReasoningLesson, ReasoningLesson]:
        namespace = self._proposal_namespace(db, proposal)
        with self._mutation(db, namespace):
            item = self._proposal(db, proposal)
            target = self._target(db, target_rule_key, item.bank_namespace)
            proposal_key = self._rule_key(item)
            if target.rule_key == proposal_key:
                raise RuleFormationError("self-conflict is not allowed")
            group = conflict_group_id(namespace, target.rule_key, proposal_key)
            prior = self._retry_result(
                db,
                item,
                "mark_conflict",
                target.rule_key,
                target.rule_version,
                decision_reason_code,
                case_erasure_confirmed,
                procedural_only_confirmed,
                proposal_key,
            )
            if prior is not None:
                second = self._rule_by_decision(db, item.proposal_id, second=True)
                if second is None:
                    raise RuleFormationError("conflict decision has incomplete successors")
                return prior, second
            self._authorize(
                item, trusted_lawyer_review, case_erasure_confirmed, procedural_only_confirmed
            )
            if target.lifecycle == "retired":
                raise RuleFormationError("retired rule cannot enter a conflict")
            if target.governance_state == "conflicted" and target.conflict_group_id != group:
                raise RuleFormationError("conflict_resolution_required")
            existing = self.read.get_rule(db, proposal_key)
            if (
                existing
                and existing.governance_state == "conflicted"
                and existing.conflict_group_id != group
            ):
                raise RuleFormationError("conflict_resolution_required")
            if existing is None:
                self._ensure_capacity(db, item)
            review_ids = _unique([*target.supporting_review_ids, *item.source_review_ids])
            self._lock_reviews(db, review_ids)
            target_successor = self._successor(
                target,
                item,
                version=target.rule_version + 1,
                supporting_review_ids=review_ids,
                governance_state="conflicted",
                conflict_group_id=group,
            )
            proposal_rule = existing or self._rule_from_proposal(
                item,
                key=proposal_key,
                version=1,
                approved_by=decided_by,
                approval_mode=self._mode(item),
                governance_state="conflicted",
                conflict_group_id=group,
            )
            self._record_decision(
                db,
                item,
                action="mark_conflict",
                decided_by=decided_by,
                target=target,
                resulting=target_successor,
                second_target_rule_key=proposal_key,
                second_resulting=proposal_rule,
                trusted_lawyer_review=trusted_lawyer_review,
                reason_code=decision_reason_code,
                case_erasure_confirmed=case_erasure_confirmed,
                procedural_only_confirmed=procedural_only_confirmed,
            )
            self._persist_rule(db, target_successor, review_ids)
            if existing is None:
                self._persist_rule(db, proposal_rule, item.source_review_ids)
            return target_successor, proposal_rule

    def reject(
        self,
        db: Session,
        proposal: ReasoningRuleProposal | str,
        *,
        decided_by: str,
        reason_code: str = "other",
        trusted_lawyer_review: bool = False,
    ) -> ReasoningRuleDecision:
        namespace = self._proposal_namespace(db, proposal)
        with self._mutation(db, namespace):
            item = self._proposal(db, proposal)
            if item.bank_namespace == "real" and not trusted_lawyer_review:
                raise RuleFormationError("trusted lawyer assertion required for real governance")
            prior = self._retry_decision(db, item, "reject", None, None, reason_code, False, False)
            if prior is not None:
                return prior
            return self._record_decision(
                db,
                item,
                action="reject",
                decided_by=decided_by,
                reason_code=reason_code,
                trusted_lawyer_review=trusted_lawyer_review,
            )

    def retire(
        self,
        db: Session,
        *,
        rule_key: str,
        reason_code: str,
        decided_by: str,
        trusted_lawyer_review: bool = False,
    ) -> ReasoningLesson:
        namespace = self._rule_namespace(db, rule_key)
        with self._mutation(db, namespace):
            target = self._target(db, rule_key, namespace)
            if target.lifecycle == "retired":
                if target.metadata.governance_reason_code == reason_code:
                    return target
                raise RuleFormationError("already_retired/conflicting_retirement_request")
            if target.bank_namespace == "real" and not trusted_lawyer_review:
                raise RuleFormationError("trusted lawyer assertion required for real retirement")
            self._lock_reviews(db, target.supporting_review_ids)
            retired = target.model_copy(
                update={
                    "rule_version": target.rule_version + 1,
                    "lifecycle": "retired",
                    "artifact_version": target.artifact_version + 1,
                    "artifact_created_at": _now(),
                    "canonical_payload_sha256": None,
                    "metadata": target.metadata.model_copy(
                        update={"governance_reason_code": reason_code}
                    ),
                }
            )
            retired = _seal(
                retired, target.artifact_version + 1, self._rule_artifact(db, target).id
            )
            self._persist_rule(db, retired, target.supporting_review_ids)
            return retired

    def _authorize(
        self, proposal: ReasoningRuleProposal, trusted: bool, erased: bool, procedural: bool
    ) -> None:
        if proposal.bank_namespace == "real" and not trusted:
            raise RuleFormationError("trusted lawyer assertion required for real governance")
        report = self.quality_gate.evaluate(proposal)
        if report.result == "FAIL":
            raise RuleFormationError(
                f"proposal quality gate failed: {','.join(report.reason_codes)}"
            )
        if not erased or not procedural:
            raise RuleFormationError(
                "explicit case-erasure and procedural-only confirmations required"
            )

    def _ensure_capacity(self, db: Session, proposal: ReasoningRuleProposal) -> None:
        state = self.read.state(db, bank_namespace=proposal.bank_namespace)
        if (
            state.current_rule_count >= self.max_rules
            or state.counts_by_rule_type.get(proposal.rule_type, 0) >= self.max_rules_per_type
        ):
            raise RuleFormationError("consolidation_required/capacity_review_required")

    def _proposal(self, db: Session, value: ReasoningRuleProposal | str) -> ReasoningRuleProposal:
        pid = value.proposal_id if isinstance(value, ReasoningRuleProposal) else value
        row = _current_artifact(db, PROPOSAL_ARTIFACT, ReasoningRuleProposal, pid)
        if row is None:
            raise RuleFormationError(
                "proposal must be persisted before governance"
                if isinstance(value, ReasoningRuleProposal)
                else "proposal not found"
            )
        return _validate(row, ReasoningRuleProposal)

    def _target(self, db: Session, key: str, namespace: str | None) -> ReasoningLesson:
        item = self.read.get_rule(db, key)
        if item is None or (namespace and item.bank_namespace != namespace):
            raise RuleFormationError("target rule not found or namespace mismatch")
        return item

    def _proposal_namespace(self, db: Session, proposal: ReasoningRuleProposal | str) -> str:
        if isinstance(proposal, ReasoningRuleProposal):
            return proposal.bank_namespace
        for row in _rows(db, PROPOSAL_ARTIFACT):
            if row.artifact_payload.get("proposal_id") == proposal:
                return row.artifact_payload.get("bank_namespace", "")
        raise RuleFormationError("proposal not found")

    def _rule_namespace(self, db: Session, key: str) -> str:
        for row in _rows(db, RULE_ARTIFACT):
            if row.artifact_payload.get("rule_key") == key:
                return row.artifact_payload.get("bank_namespace", "")
        raise RuleFormationError("target rule not found")

    @staticmethod
    def _rule_key(proposal: ReasoningRuleProposal) -> str:
        return f"rule-{proposal.bank_namespace}-{hashlib.sha256(f'{proposal.bank_namespace}:{proposal.proposal_id}'.encode()).hexdigest()[:32]}"

    @staticmethod
    def _mode(proposal: ReasoningRuleProposal) -> str:
        return "trusted_lawyer" if proposal.bank_namespace == "real" else "simulation_offline"

    def _rule_from_proposal(
        self,
        proposal: ReasoningRuleProposal,
        *,
        key: str,
        version: int,
        approved_by: str,
        approval_mode: str,
        source_review_ids: list[str] | None = None,
        governance_state: str = "normal",
        conflict_group_id: str | None = None,
    ) -> ReasoningLesson:
        return _seal(
            ReasoningLesson(
                lesson_id=f"{key}:v{version}",
                rule_key=key,
                rule_version=version,
                bank_namespace=proposal.bank_namespace,
                provenance=proposal.provenance,
                origin=proposal.origin,
                lifecycle="approved",
                governance_state=governance_state,
                validation_state="unvalidated",
                rule_type=proposal.rule_type,
                title=proposal.title,
                trigger_conditions=proposal.trigger_conditions,
                applicability_conditions=proposal.applicability_conditions,
                action_steps=proposal.action_steps,
                verification_steps=proposal.verification_steps,
                prohibited_behaviors=proposal.prohibited_behaviors,
                exceptions_or_limits=proposal.exceptions_or_limits,
                lesson_text=render_lesson_text(proposal),
                source_proposal_id=proposal.proposal_id,
                source_candidate_ids=_unique(proposal.source_candidate_ids),
                supporting_review_ids=_unique(source_review_ids or proposal.source_review_ids),
                supporting_experience_ids=_unique(proposal.source_experience_ids),
                supporting_evaluation_case_ids=_unique(proposal.supporting_evaluation_case_ids),
                negative_control_case_ids=_unique(proposal.negative_control_case_ids),
                approved_by=approved_by,
                approval_mode=approval_mode,
                approved_at=_now(),
                system_version_approved=proposal.compiler_metadata.compiler_version,
                conflict_group_id=conflict_group_id,
                artifact_version=version,
                artifact_created_at=_now(),
            ),
            version,
            None,
        )

    def _successor(
        self,
        target: ReasoningLesson,
        proposal: ReasoningRuleProposal,
        *,
        version: int,
        supporting_review_ids: list[str],
        replace_body: bool = False,
        governance_state: str | None = None,
        conflict_group_id: str | None = None,
    ) -> ReasoningLesson:
        body = _body(proposal) if replace_body else _body(target)
        return _seal(
            target.model_copy(
                update={
                    **body,
                    "lesson_text": render_lesson_text(proposal if replace_body else target),
                    "lesson_id": f"{target.rule_key}:v{version}",
                    "rule_version": version,
                    "source_proposal_id": proposal.proposal_id,
                    "source_candidate_ids": _unique(
                        [*target.source_candidate_ids, *proposal.source_candidate_ids]
                    ),
                    "supporting_review_ids": _unique(
                        [*target.supporting_review_ids, *proposal.source_review_ids]
                    ),
                    "supporting_experience_ids": _unique(
                        [*target.supporting_experience_ids, *proposal.source_experience_ids]
                    ),
                    "supporting_evaluation_case_ids": _unique(
                        [
                            *target.supporting_evaluation_case_ids,
                            *proposal.supporting_evaluation_case_ids,
                        ]
                    ),
                    "negative_control_case_ids": _unique(
                        [*target.negative_control_case_ids, *proposal.negative_control_case_ids]
                    ),
                    "governance_state": governance_state or target.governance_state,
                    "conflict_group_id": conflict_group_id
                    if conflict_group_id is not None
                    else target.conflict_group_id,
                    "artifact_version": version,
                    "artifact_created_at": _now(),
                    "canonical_payload_sha256": None,
                }
            ),
            version,
            None,
        )

    def _persist_rule(
        self, db: Session, rule: ReasoningLesson, review_ids: list[str]
    ) -> ReviewArtifact:
        prior = self._rule_artifact(db, rule)
        if prior is not None:
            prior.artifact_status = "superseded"
            rule = _seal(rule, rule.rule_version, prior.id)
        artifact = ReviewArtifact(
            id=str(uuid4()),
            answer_review_id=self._anchor(review_ids),
            artifact_type=RULE_ARTIFACT,
            artifact_payload=rule.model_dump(mode="json"),
            artifact_status="active",
        )
        db.add(artifact)
        return artifact

    def _record_decision(
        self,
        db: Session,
        proposal: ReasoningRuleProposal,
        *,
        action: str,
        decided_by: str,
        trusted_lawyer_review: bool,
        target: ReasoningLesson | None = None,
        resulting: ReasoningLesson | None = None,
        second_target_rule_key: str | None = None,
        second_resulting: ReasoningLesson | None = None,
        reason_code: str | None = None,
        case_erasure_confirmed: bool = False,
        procedural_only_confirmed: bool = False,
    ) -> ReasoningRuleDecision:
        fp = decision_fingerprint(
            proposal_id=proposal.proposal_id,
            action=action,
            namespace=proposal.bank_namespace,
            content_fingerprint=exact_rule_body_fingerprint(proposal),
            target_rule_key=target.rule_key if target else None,
            target_rule_version=target.rule_version if target else None,
            second_target_rule_key=second_target_rule_key,
            reason_code=reason_code or action,
            case_erasure_confirmed=case_erasure_confirmed,
            procedural_only_confirmed=procedural_only_confirmed,
        )
        existing = self._terminal_decision(db, proposal.proposal_id)
        if existing:
            if existing.decision_fingerprint != fp:
                raise RuleFormationError("conflicting_terminal_decision")
            return existing
        decision = _seal(
            ReasoningRuleDecision(
                decision_id=f"decision-{proposal.proposal_id}-{fp[:32]}",
                proposal_id=proposal.proposal_id,
                source_candidate_ids=_unique(proposal.source_candidate_ids),
                bank_namespace=proposal.bank_namespace,
                action=action,
                target_rule_key=target.rule_key if target else None,
                target_rule_version=target.rule_version if target else None,
                second_target_rule_key=second_target_rule_key,
                resulting_rule_key=resulting.rule_key if resulting else None,
                resulting_rule_version=resulting.rule_version if resulting else None,
                second_resulting_rule_key=second_resulting.rule_key if second_resulting else None,
                second_resulting_rule_version=second_resulting.rule_version
                if second_resulting
                else None,
                decision_reason_code=reason_code or action,
                decided_by=decided_by,
                decision_mode="trusted_lawyer"
                if proposal.bank_namespace == "real"
                else "simulation_offline",
                decision_fingerprint=fp,
                case_erasure_confirmed=case_erasure_confirmed,
                procedural_only_confirmed=procedural_only_confirmed,
                artifact_version=1,
                artifact_created_at=_now(),
            ),
            1,
            None,
        )
        db.add(
            ReviewArtifact(
                id=str(uuid4()),
                answer_review_id=self._anchor(proposal.source_review_ids),
                artifact_type=DECISION_ARTIFACT,
                artifact_payload=decision.model_dump(mode="json"),
                artifact_status="active",
            )
        )
        return decision

    def _retry_decision(
        self,
        db: Session,
        proposal: ReasoningRuleProposal,
        action: str,
        target_key: str | None,
        target_version: int | None,
        reason: str,
        erased: bool,
        procedural: bool,
    ) -> ReasoningRuleDecision | None:
        existing = self._terminal_decision(db, proposal.proposal_id)
        if existing is None:
            return None
        fp = decision_fingerprint(
            proposal_id=proposal.proposal_id,
            action=action,
            namespace=proposal.bank_namespace,
            content_fingerprint=exact_rule_body_fingerprint(proposal),
            target_rule_key=target_key,
            target_rule_version=existing.target_rule_version if target_key else target_version,
            second_target_rule_key=existing.second_target_rule_key,
            reason_code=reason,
            case_erasure_confirmed=erased,
            procedural_only_confirmed=procedural,
        )
        if existing.decision_fingerprint != fp:
            raise RuleFormationError("conflicting_terminal_decision")
        return existing

    def _retry_result(
        self,
        db: Session,
        proposal: ReasoningRuleProposal,
        action: str,
        target_key: str | None,
        target_version: int | None,
        reason: str,
        erased: bool,
        procedural: bool,
        second_key: str | None = None,
    ) -> ReasoningLesson | None:
        decision = self._retry_decision(
            db, proposal, action, target_key, target_version, reason, erased, procedural
        )
        if decision is None:
            return None
        if second_key is not None and decision.second_target_rule_key != second_key:
            raise RuleFormationError("conflicting_terminal_decision")
        return _rule_version(db, decision.resulting_rule_key, decision.resulting_rule_version)

    def _terminal_decision(self, db: Session, proposal_id: str) -> ReasoningRuleDecision | None:
        decisions = [
            (_validate(row, ReasoningRuleDecision), row) for row in _rows(db, DECISION_ARTIFACT)
        ]
        current = [
            item
            for item, row in decisions
            if item.proposal_id == proposal_id and row.artifact_status != "superseded"
        ]
        if len(current) > 1:
            raise RuleFormationError("corrupt governance state: multiple terminal decisions")
        return current[0] if current else None

    def _rule_by_decision(
        self, db: Session, proposal_id: str, *, second: bool
    ) -> ReasoningLesson | None:
        item = self._terminal_decision(db, proposal_id)
        key = (
            item.second_resulting_rule_key
            if item and second
            else item.resulting_rule_key
            if item
            else None
        )
        version = (
            item.second_resulting_rule_version
            if item and second
            else item.resulting_rule_version
            if item
            else None
        )
        return _rule_version(db, key, version) if key else None

    def _rule_artifact(self, db: Session, rule: ReasoningLesson) -> ReviewArtifact | None:
        return _current_artifact(db, RULE_ARTIFACT, ReasoningLesson, rule.rule_key)

    @staticmethod
    def _anchor(review_ids: list[str]) -> str:
        if not review_ids:
            raise RuleFormationError(
                "at least one source review is required for ReviewArtifact storage"
            )
        return sorted(set(review_ids))[0]

    @staticmethod
    def _lock_reviews(db: Session, review_ids: list[str]) -> None:
        for review_id in sorted(set(review_ids)):
            if db.get(AnswerReview, review_id, with_for_update=True) is None:
                raise RuleFormationError(f"AnswerReview {review_id} was not found")


def decision_fingerprint(
    *,
    proposal_id: str,
    action: str,
    namespace: str,
    content_fingerprint: str | None = None,
    target_rule_key: str | None,
    target_rule_version: int | None,
    second_target_rule_key: str | None,
    reason_code: str,
    case_erasure_confirmed: bool,
    procedural_only_confirmed: bool,
) -> str:
    payload = {
        "proposal_id": proposal_id,
        "action": action,
        "namespace": namespace,
        "content_fingerprint": content_fingerprint,
        "target_rule_key": target_rule_key,
        "target_rule_version": target_rule_version,
        "second_target_rule_key": second_target_rule_key,
        "reason_code": _normal(reason_code),
        "case_erasure_confirmed": case_erasure_confirmed,
        "procedural_only_confirmed": procedural_only_confirmed,
    }
    return hashlib.sha256(Phase7ArtifactService.canonical_json_bytes(payload)).hexdigest()


def candidate_processing_proposal_state(db: Session, proposal_id: str) -> str:
    values = [(_validate(row, ReasoningRuleDecision), row) for row in _rows(db, DECISION_ARTIFACT)]
    current = [
        item
        for item, row in values
        if item.proposal_id == proposal_id and row.artifact_status != "superseded"
    ]
    if len(current) > 1:
        raise RuleFormationError("corrupt governance state: contradictory terminal decisions")
    return "resolved" if current else "unresolved"


def candidate_processing_state(db: Session, candidate_id: str) -> str:
    proposals = list(
        _current_logical(
            db, PROPOSAL_ARTIFACT, ReasoningRuleProposal, lambda item: item.proposal_id
        ).values()
    )
    proposals = [item for item in proposals if candidate_id in item.source_candidate_ids]
    if not proposals:
        return "unprocessed"
    return (
        "processed"
        if all(
            candidate_processing_proposal_state(db, item.proposal_id) == "resolved"
            for item in proposals
        )
        else "pending"
    )


def render_lesson_text(rule: ReasoningRuleProposal | ReasoningLesson) -> str:
    def section(label: str, values: list[str]) -> str:
        return f"{label}:\n" + "\n".join(f"- {value.strip()}" for value in values)

    return "\n\n".join(
        section(label, values)
        for label, values in (
            ("WHEN", rule.trigger_conditions),
            ("APPLY IF", rule.applicability_conditions),
            ("DO", rule.action_steps),
            ("VERIFY", rule.verification_steps),
            ("AVOID", rule.prohibited_behaviors),
            ("LIMITS", rule.exceptions_or_limits),
        )
    )


def _logical_rule_digest_payload(rule: ReasoningLesson) -> dict[str, Any]:
    """Stable digest representation independent of storage envelope details."""
    return {
        "namespace": rule.bank_namespace,
        "rule_key": rule.rule_key,
        "rule_version": rule.rule_version,
        "body_fingerprint": exact_rule_body_fingerprint(rule),
        "lifecycle": rule.lifecycle,
        "governance_state": rule.governance_state,
        "validation_state": rule.validation_state,
        "provenance": rule.provenance,
        "origin": rule.origin,
        "conflict_group_id": rule.conflict_group_id,
        "source_candidate_ids": _unique(rule.source_candidate_ids),
        "supporting_review_ids": _unique(rule.supporting_review_ids),
        "supporting_experience_ids": _unique(rule.supporting_experience_ids),
        "supporting_evaluation_case_ids": _unique(rule.supporting_evaluation_case_ids),
        "negative_control_case_ids": _unique(rule.negative_control_case_ids),
        "governance_reason_code": rule.metadata.governance_reason_code,
    }


def _rows(db: Session, artifact_type: str) -> list[ReviewArtifact]:
    return list(
        db.query(ReviewArtifact).filter(ReviewArtifact.artifact_type == artifact_type).all()
    )


def _validate(row: ReviewArtifact, contract: Any) -> Any:
    if not Phase7ArtifactService.verify_payload_hash(row.artifact_payload or {}):
        raise RuleFormationError(
            f"invalid canonical hash for {row.artifact_type} artifact {row.id}"
        )
    try:
        return contract.model_validate(row.artifact_payload or {})
    except Exception as exc:
        raise RuleFormationError(f"malformed {row.artifact_type} artifact {row.id}: {exc}") from exc


def _seal(model: Any, version: int, supersedes: str | None) -> Any:
    raw = model.model_dump(mode="json")
    raw.update(
        {
            "artifact_version": version,
            "supersedes_artifact_id": supersedes,
            "artifact_created_at": raw.get("artifact_created_at") or _now(),
            "canonical_payload_sha256": None,
        }
    )
    return model.__class__.model_validate(
        {**raw, "canonical_payload_sha256": Phase7ArtifactService.payload_hash(raw)}
    )


def _current_entries(
    db: Session, artifact_type: str, contract: Any, key_fn: Any
) -> dict[str, tuple[ReviewArtifact, Any]]:
    groups: dict[str, list[tuple[ReviewArtifact, Any]]] = {}
    for row in _rows(db, artifact_type):
        item = _validate(row, contract)
        groups.setdefault(key_fn(item), []).append((row, item))
    output: dict[str, tuple[ReviewArtifact, Any]] = {}
    for logical, entries in groups.items():
        versions: dict[int, tuple[ReviewArtifact, Any]] = {}
        for row, item in entries:
            if item.artifact_version in versions:
                raise RuleFormationError(f"duplicate version for logical artifact: {logical}")
            versions[item.artifact_version] = (row, item)
        current = [(row, item) for row, item in entries if row.artifact_status != "superseded"]
        if len(current) != 1 or current[0][1].artifact_version != max(versions):
            raise RuleFormationError(f"ambiguous current version for logical artifact: {logical}")
        for version, (row, item) in versions.items():
            if version == 1 and item.supersedes_artifact_id is not None:
                raise RuleFormationError(f"invalid initial supersedes link: {logical}")
            if version > 1 and (
                version - 1 not in versions
                or item.supersedes_artifact_id != versions[version - 1][0].id
            ):
                raise RuleFormationError(f"invalid version chain: {logical}")
        output[logical] = current[0]
    return output


def _current_logical(db: Session, artifact_type: str, contract: Any, key_fn: Any) -> dict[str, Any]:
    return {
        logical: entry[1]
        for logical, entry in _current_entries(db, artifact_type, contract, key_fn).items()
    }


def _current_artifact(
    db: Session, artifact_type: str, contract: Any, logical: str
) -> ReviewArtifact | None:
    entry = _current_entries(
        db,
        artifact_type,
        contract,
        lambda item: getattr(
            item, "proposal_id", getattr(item, "rule_key", getattr(item, "candidate_id", ""))
        ),
    ).get(logical)
    return entry[0] if entry else None


def _rule_version(db: Session, key: str | None, version: int | None) -> ReasoningLesson:
    matches = []
    for row in _rows(db, RULE_ARTIFACT):
        item = _validate(row, ReasoningLesson)
        if item.rule_key == key and item.rule_version == version:
            matches.append(item)
    if len(matches) != 1:
        raise RuleFormationError("decision result rule version is missing or ambiguous")
    return matches[0]


def _validate_candidate_lineage(
    db: Session, row: ReviewArtifact, candidate: ReasoningLessonCandidate
) -> None:
    if not candidate.source_review_id or row.answer_review_id != candidate.source_review_id:
        raise RuleFormationError("candidate anchor review mismatch")
    review = db.get(AnswerReview, candidate.source_review_id)
    if review is None:
        raise RuleFormationError("candidate source review not found")
    if review.answer_trace_id and db.get(AnswerTrace, review.answer_trace_id) is None:
        raise RuleFormationError("candidate source answer trace not found")
    if (
        candidate.source_answer_trace_id
        and review.answer_trace_id != candidate.source_answer_trace_id
    ):
        raise RuleFormationError("candidate answer-trace lineage mismatch")
    if candidate.source_experience_record_id:
        if not candidate.source_experience_snapshot_sha256:
            raise RuleFormationError("candidate experience lineage hash is required")
        _resolve_experience(
            db,
            candidate.source_experience_record_id,
            "real" if candidate.origin == "live_interaction" else "simulation",
            expected_snapshot_hash=candidate.source_experience_snapshot_sha256,
            expected_answer_trace_id=(candidate.source_answer_trace_id or review.answer_trace_id),
        )
    for value in candidate.supporting_experience_ids:
        _resolve_experience(
            db,
            value,
            "real" if candidate.origin == "live_interaction" else "simulation",
            expected_answer_trace_id=(candidate.source_answer_trace_id or review.answer_trace_id),
        )


def _resolve_experience(
    db: Session,
    experience_id: str,
    namespace: str,
    *,
    expected_snapshot_hash: str | None = None,
    expected_answer_trace_id: str | None = None,
) -> ExperienceRecord:
    record = db.get(ExperienceRecord, experience_id)
    if record is None:
        raise RuleFormationError(f"ExperienceRecord {experience_id} was not found")
    try:
        ExperienceSnapshot.model_validate(record.snapshot_json or {})
    except Exception as exc:
        raise RuleFormationError(f"invalid ExperienceRecord snapshot {experience_id}") from exc
    actual = Phase7ArtifactService.snapshot_sha256(record.snapshot_json or {})
    if actual != record.snapshot_sha256 or (
        expected_snapshot_hash and expected_snapshot_hash != actual
    ):
        raise RuleFormationError(f"ExperienceRecord {experience_id} snapshot SHA mismatch")
    if (namespace == "real" and record.origin != "live_interaction") or (
        namespace == "simulation" and record.origin not in {"synthetic_test", "manual_fixture"}
    ):
        raise RuleFormationError("ExperienceRecord namespace/provenance mismatch")
    if expected_answer_trace_id and record.answer_trace_id != expected_answer_trace_id:
        raise RuleFormationError(f"ExperienceRecord {experience_id} answer-trace mismatch")
    return record


def _resolve_evaluation_case(db: Session, case_id: str, namespace: str) -> EvaluationCase:
    matches = []
    for row in _rows(db, "phase7_evaluation_case"):
        try:
            validated = EvaluationBankService._validated_row(row)
        except EvaluationBankValidationError as exc:
            raise RuleFormationError(str(exc)) from exc
        case = EvaluationCase.model_validate(validated["case"])
        if case.case_id == case_id and row.artifact_status != "superseded":
            matches.append((row, case, validated))
    if len(matches) != 1:
        raise RuleFormationError(f"EvaluationCase {case_id} is missing or ambiguous")
    row, case, validated = matches[0]
    if row.artifact_status != "active":
        raise RuleFormationError("EvaluationCase must be active")
    if namespace == "real" and not validated["eligible_for_default_regression"]:
        raise RuleFormationError(
            "synthetic or ineligible EvaluationCase is not eligible for default regression"
        )
    if namespace == "simulation" and (
        case.provenance != "synthetic_test"
        or case.origin not in {"synthetic_test", "manual_fixture"}
    ):
        raise RuleFormationError("real EvaluationCase cannot support simulation rule")
    if case.source_review_id:
        review = db.get(AnswerReview, case.source_review_id)
        if review is None:
            raise RuleFormationError("EvaluationCase source review not found")
        if case.source_answer_trace_id and review.answer_trace_id != case.source_answer_trace_id:
            raise RuleFormationError("EvaluationCase answer-trace lineage mismatch")
        if review.answer_trace_id and db.get(AnswerTrace, review.answer_trace_id) is None:
            raise RuleFormationError("EvaluationCase source answer trace not found")
    experience_id = case.source_experience_record_id or case.source_experience_id
    if experience_id:
        if not case.source_experience_snapshot_sha256:
            raise RuleFormationError("evaluation case experience lineage hash is required")
        _resolve_experience(
            db,
            experience_id,
            namespace,
            expected_snapshot_hash=case.source_experience_snapshot_sha256,
            expected_answer_trace_id=case.source_answer_trace_id,
        )
    return case


def _safe_scope_mapping(value: Any) -> dict[str, str | int | bool]:
    return (
        {str(key): item for key, item in value.items()}
        if isinstance(value, dict)
        and all(
            str(key) in _SAFE_SCOPE_KEYS and isinstance(item, (str, int, bool))
            for key, item in value.items()
        )
        else {}
    )


def _safe_case_mapping(value: Any) -> dict[str, str | int | bool]:
    return (
        {
            str(key): item
            for key, item in value.items()
            if str(key) in _SAFE_CASE_KEYS and isinstance(item, (str, int, bool))
        }
        if isinstance(value, dict)
        else {}
    )


def _namespace_compatible(candidate: ReasoningLessonCandidate, namespace: str) -> bool:
    return (
        namespace == "real"
        and candidate.provenance == "lawyer_reviewed"
        and candidate.origin == "live_interaction"
    ) or (
        namespace == "simulation"
        and candidate.provenance == "synthetic_test"
        and candidate.origin in {"synthetic_test", "manual_fixture"}
    )


def _proposal_semantics(proposal: ReasoningRuleProposal) -> str:
    return Phase7ArtifactService.canonical_json_bytes(
        {
            "namespace": proposal.bank_namespace,
            "candidate_ids": _unique(proposal.source_candidate_ids),
            "body": _normalized_body(proposal),
            "experience_ids": _unique(proposal.source_experience_ids),
            "evaluation_ids": _unique(proposal.supporting_evaluation_case_ids),
            "negative_ids": _unique(proposal.negative_control_case_ids),
        }
    ).decode()


def conflict_group_id(namespace: str, first_rule_key: str, second_rule_key: str) -> str:
    pair = ":".join(sorted((first_rule_key, second_rule_key)))
    return f"conflict-{hashlib.sha256(f'{namespace}:{pair}'.encode()).hexdigest()[:24]}"
