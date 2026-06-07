from __future__ import annotations

import re
from typing import Any, Iterable

from app.schemas.state import (
    AnswerabilityAssessment,
    EvidencePackage,
    LiveTriggerDecision,
    MatterState,
    PolicyDecision,
    RiskFlags,
    SufficiencyGateResult,
)
from app.services.operation_profiles import (
    ANSWER_MODE_DIRECT,
    ANSWER_MODE_ESCALATE,
    ANSWER_MODE_FOLLOWUP,
    ANSWER_MODE_LIVE_FETCH,
    ANSWER_MODE_QUALIFIED,
    ANSWER_MODE_WARNING,
    canonical_operation_type,
    fact_is_present,
    get_operation_profile,
    infer_source_classes_from_parts,
    normalize_known_facts,
)
from app.services.live_trigger_policy import LiveTriggerPolicy


class PolicyRules:
    """
    Deterministic policy / sufficiency layer.

    This layer should stay model-free. It makes bounded decisions about:
    - whether retrieval satisfies the operation contract
    - whether live official retrieval should be triggered
    - whether to ask follow-up questions, answer, or escalate
    - how confidence should be capped
    """

    FRESHNESS_TERMS = ("current", "latest", "recent", "today", "now")

    def __init__(self) -> None:
        self.live_trigger_policy = LiveTriggerPolicy()

    def judge_local_sufficiency(
        self,
        *,
        question: str,
        issue_type: str | None,
        operation_type: str | None,
        known_facts: dict[str, Any] | None,
        retrieval_debug: dict[str, Any] | None = None,
        live_retrieval: dict[str, Any] | Any | None = None,
    ) -> SufficiencyGateResult:
        operation_type = canonical_operation_type(operation_type)
        known_facts = normalize_known_facts(known_facts)
        retrieval_debug = retrieval_debug or {}
        rows = retrieval_debug.get("results") or []
        if not isinstance(rows, list):
            rows = []

        visa_type = str(known_facts.get("visa_type") or "") or None
        profile = get_operation_profile(operation_type, issue_type=issue_type, visa_type=visa_type)
        source_classes_present = self._collect_source_classes(rows=rows, live_retrieval=live_retrieval)
        live_trigger = self.live_trigger_policy.decide(
            question=question,
            issue_type=issue_type,
            operation_type=operation_type,
            known_facts=known_facts,
            source_classes_present=source_classes_present,
            retrieval_rows=rows,
        )
        schedule_policy_request = self._schedule_policy_overlay_live_request(retrieval_debug)
        if schedule_policy_request:
            if schedule_policy_request["reason"] not in live_trigger.reasons:
                live_trigger.reasons.append(schedule_policy_request["reason"])
            for domain in schedule_policy_request["preferred_domains"]:
                if domain not in live_trigger.preferred_domains:
                    live_trigger.preferred_domains.append(domain)
            for source_type in schedule_policy_request["preferred_source_types"]:
                if source_type not in live_trigger.preferred_source_types:
                    live_trigger.preferred_source_types.append(source_type)
            for missing_class in schedule_policy_request["missing"]:
                if missing_class not in live_trigger.required_source_classes_missing:
                    live_trigger.required_source_classes_missing.append(missing_class)
            live_trigger.should_live_fetch = True

        fact_coverage = {key: fact_is_present(known_facts, key) for key in profile.required_facts}
        required_facts_missing = [key for key, present in fact_coverage.items() if not present]

        all_profile_source_classes = list(dict.fromkeys(
            [src for group in profile.required_source_classes_any for src in group]
            + list(profile.optional_source_classes)
        ))
        source_coverage = {key: key in source_classes_present for key in all_profile_source_classes}
        unsatisfied_groups = [
            tuple(group)
            for group in profile.required_source_classes_any
            if not any(src in source_classes_present for src in group)
        ]
        required_source_classes_missing = list(dict.fromkeys(
            src for group in unsatisfied_groups for src in group
        ))

        freshness_required = self._freshness_required(question, profile.name)
        live_used = self._live_fetch_used(live_retrieval)
        has_any_local_results = bool(rows)
        has_any_signal = bool(source_classes_present)
        deadline_sensitive = self._is_deadline_sensitive(profile.name, question)

        if live_trigger.reasons and not live_used:
            reason = live_trigger.reasons[0]
        elif not has_any_local_results and not live_used:
            reason = "no_local_results"
        elif freshness_required and not live_used:
            reason = "freshness_requested"
        elif required_source_classes_missing and not live_used:
            reason = "missing_required_source_classes"
        elif required_source_classes_missing and live_used:
            reason = "required_source_classes_still_missing_after_live_fetch"
        elif required_facts_missing:
            reason = "missing_required_facts"
        else:
            reason = None

        need_live_fetch = bool(
            not live_used
            and (
                live_trigger.should_live_fetch
                or freshness_required
                or not has_any_local_results
                or bool(required_source_classes_missing)
            )
        )

        operation_contract_satisfied = not required_facts_missing and not required_source_classes_missing

        if (
            profile.escalate_if_deadline_sensitive_and_date_missing
            and deadline_sensitive
            and "notification_date" in required_facts_missing
        ):
            answer_mode = ANSWER_MODE_FOLLOWUP
        elif need_live_fetch:
            answer_mode = ANSWER_MODE_LIVE_FETCH
        elif required_facts_missing:
            answer_mode = ANSWER_MODE_FOLLOWUP
        elif required_source_classes_missing:
            answer_mode = ANSWER_MODE_QUALIFIED if has_any_signal else ANSWER_MODE_FOLLOWUP
        else:
            answer_mode = self._success_answer_mode(profile.allowed_answer_modes)

        if answer_mode not in profile.allowed_answer_modes and answer_mode not in {
            ANSWER_MODE_FOLLOWUP,
            ANSWER_MODE_LIVE_FETCH,
            ANSWER_MODE_ESCALATE,
        }:
            answer_mode = self._success_answer_mode(profile.allowed_answer_modes)

        assessment = AnswerabilityAssessment(
            profile_name=profile.name,
            operation_contract_satisfied=operation_contract_satisfied,
            answer_mode=answer_mode,
            allowed_answer_modes=list(profile.allowed_answer_modes),
            fact_coverage=fact_coverage,
            source_coverage=source_coverage,
            source_classes_present=sorted(source_classes_present),
            required_facts_missing=required_facts_missing,
            required_source_classes_missing=required_source_classes_missing,
            freshness_required=freshness_required,
        )

        local_sufficient = (
            operation_contract_satisfied
            and not freshness_required
            and not live_trigger.should_live_fetch
        )

        return SufficiencyGateResult(
            local_sufficient=local_sufficient,
            reason=reason,
            need_live_fetch=need_live_fetch,
            preferred_domains=live_trigger.preferred_domains or list(profile.live_fetch_domains),
            preferred_source_types=live_trigger.preferred_source_types or list(profile.preferred_source_types),
            answerability=assessment,
            live_trigger=live_trigger,
        )

    def apply_policy_rules(
        self,
        *,
        question: str,
        state: MatterState | dict[str, Any],
        sufficiency_gate: SufficiencyGateResult | dict[str, Any],
        evidence_package: EvidencePackage | dict[str, Any],
        live_retrieval: dict[str, Any] | None = None,
    ) -> PolicyDecision:
        state_obj = state if isinstance(state, MatterState) else MatterState(**state)
        suff_obj = sufficiency_gate if isinstance(sufficiency_gate, SufficiencyGateResult) else SufficiencyGateResult(**sufficiency_gate)
        ev_obj = evidence_package if isinstance(evidence_package, EvidencePackage) else EvidencePackage(**evidence_package)
        live_retrieval = live_retrieval or {}

        assessment = suff_obj.answerability
        reasons: list[str] = []
        confidence_cap: str | None = None
        answer_mode = assessment.answer_mode
        answer_preference = str((state_obj.carried_intake_facts or {}).get("answer_preference") or "answer_first")
        case_frame_id = str((state_obj.carried_intake_facts or {}).get("active_case_frame_id") or "")
        answer_tier = str((state_obj.carried_intake_facts or {}).get("answer_tier") or "")

        if self._is_high_risk(state_obj.risk_flags, question):
            return PolicyDecision(
                answer_allowed=True,
                escalate=True,
                next_action="suggest_consultation",
                confidence_cap="low",
                reasons=["high_risk_issue"],
                answer_mode=ANSWER_MODE_ESCALATE,
                coverage_summary=assessment.model_dump(),
            )

        focused_policy_finding = {}
        if isinstance(live_retrieval, dict):
            focused_policy_finding = live_retrieval.get("focused_policy_finding") or {}
        if isinstance(focused_policy_finding, dict) and focused_policy_finding.get("resolved"):
            return PolicyDecision(
                answer_allowed=True,
                escalate=False,
                next_action="answer",
                confidence_cap=focused_policy_finding.get("confidence") or "medium",
                reasons=["focused_policy_finding_resolved"],
                answer_mode=ANSWER_MODE_WARNING,
                coverage_summary={**assessment.model_dump(), "focused_policy_finding": focused_policy_finding},
            )

        if (
            answer_preference in {"answer_first", "final_recommendation", "auto"}
            and answer_mode in {ANSWER_MODE_FOLLOWUP, ANSWER_MODE_LIVE_FETCH, ANSWER_MODE_QUALIFIED, ANSWER_MODE_WARNING}
            and case_frame_id not in {"", "visa_topic_triage"}
        ):
            return PolicyDecision(
                answer_allowed=True,
                escalate=False,
                next_action="answer",
                confidence_cap="low" if (assessment.required_facts_missing or assessment.required_source_classes_missing or ev_obj.missing_information) else "medium",
                reasons=["answer_preference_allows_provisional_recommendation", answer_preference, answer_tier],
                answer_mode=ANSWER_MODE_WARNING,
                coverage_summary={**assessment.model_dump(), "answer_preference": answer_preference, "case_frame_id": case_frame_id, "answer_tier": answer_tier},
            )

        if suff_obj.need_live_fetch and not self._live_fetch_used(live_retrieval):
            return PolicyDecision(
                answer_allowed=True,
                escalate=False,
                next_action="ask_followup",
                confidence_cap="low",
                reasons=["live_fetch_needed_but_not_used", *( [suff_obj.reason] if suff_obj.reason else [])],
                answer_mode=ANSWER_MODE_LIVE_FETCH,
                coverage_summary=assessment.model_dump(),
            )

        if state_obj.risk_flags.deadline_sensitive:
            confidence_cap = "low"
            reasons.append("deadline_sensitive")

        if assessment.required_facts_missing:
            reasons.append("missing_required_facts")
            confidence_cap = "low"

        if assessment.required_source_classes_missing:
            reasons.append("missing_required_source_classes")
            confidence_cap = confidence_cap or "low"

        if ev_obj.missing_information:
            reasons.append("missing_information")
            confidence_cap = confidence_cap or "low"

        if ev_obj.unsupported_requests:
            reasons.append("unsupported_specificity")
            confidence_cap = confidence_cap or "low"

        if not ev_obj.is_context_sufficient:
            reasons.append("context_insufficient")
            confidence_cap = confidence_cap or ("low" if answer_mode != ANSWER_MODE_DIRECT else "medium")

        next_action = "answer"
        escalate = False

        if answer_mode == ANSWER_MODE_ESCALATE:
            next_action = "suggest_consultation"
            escalate = True
            confidence_cap = "low"
        elif answer_mode in {ANSWER_MODE_FOLLOWUP, ANSWER_MODE_LIVE_FETCH}:
            next_action = "ask_followup"
            confidence_cap = confidence_cap or "low"
        elif answer_mode == ANSWER_MODE_QUALIFIED:
            next_action = "ask_followup" if (assessment.required_facts_missing or ev_obj.missing_information) else "answer"
            confidence_cap = confidence_cap or "low"
        elif answer_mode == ANSWER_MODE_WARNING:
            next_action = "ask_followup" if ev_obj.missing_information else "answer"
            confidence_cap = confidence_cap or "medium"
        elif ev_obj.missing_information:
            next_action = "ask_followup"
            confidence_cap = confidence_cap or "low"

        return PolicyDecision(
            answer_allowed=True,
            escalate=escalate,
            next_action=next_action,  # type: ignore[arg-type]
            confidence_cap=confidence_cap,  # type: ignore[arg-type]
            reasons=reasons,
            answer_mode=answer_mode,
            coverage_summary=assessment.model_dump(),
        )

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------
    def _success_answer_mode(self, allowed_answer_modes: Iterable[str]) -> str:
        allowed = set(allowed_answer_modes)
        if ANSWER_MODE_DIRECT in allowed:
            return ANSWER_MODE_DIRECT
        if ANSWER_MODE_WARNING in allowed:
            return ANSWER_MODE_WARNING
        if ANSWER_MODE_QUALIFIED in allowed:
            return ANSWER_MODE_QUALIFIED
        return ANSWER_MODE_FOLLOWUP

    def _freshness_required(self, question: str, profile_name: str) -> bool:
        q = question.lower()
        return any(term in q for term in self.FRESHNESS_TERMS) or profile_name in {"review_deadline"}

    def _is_deadline_sensitive(self, profile_name: str, question: str) -> bool:
        q = question.lower()
        if profile_name in {"review_deadline", "review_rights", "student_refusal_next_steps"}:
            return True
        return any(term in q for term in ["deadline", "time limit", "within how many days", "still apply for review"])

    def _live_fetch_used(self, live_retrieval: dict[str, Any] | Any | None) -> bool:
        if live_retrieval is None:
            return False
        if isinstance(live_retrieval, dict):
            return bool(live_retrieval.get("used_live_fetch", False))
        return bool(getattr(live_retrieval, "used_live_fetch", False))

    def _collect_source_classes(
        self,
        *,
        rows: list[dict[str, Any]],
        live_retrieval: dict[str, Any] | Any | None = None,
    ) -> set[str]:
        classes: set[str] = set()
        for row in rows:
            if not isinstance(row, dict):
                continue
            existing = row.get("source_classes")
            if isinstance(existing, str):
                classes.add(existing)
                continue
            if isinstance(existing, list):
                classes.update(str(item).strip().lower() for item in existing if str(item).strip())
                continue
            classes.update(
                infer_source_classes_from_parts(
                    title=row.get("title"),
                    authority=row.get("authority"),
                    source_type=row.get("source_type"),
                    bucket=row.get("bucket"),
                    sub_type=row.get("sub_type"),
                    section_ref=row.get("section_ref"),
                    heading=row.get("heading"),
                    text=row.get("text_preview"),
                    metadata_json={},
                )
            )

        if live_retrieval is None:
            return classes

        live_chunks = []
        if isinstance(live_retrieval, dict):
            live_chunks = live_retrieval.get("chunks") or []
        else:
            live_chunks = getattr(live_retrieval, "chunks", []) or []

        for chunk in live_chunks:
            if isinstance(chunk, dict):
                metadata_json = chunk.get("metadata_json") or {}
                classes.update(
                    infer_source_classes_from_parts(
                        title=chunk.get("title"),
                        authority=chunk.get("authority"),
                        source_type=chunk.get("source_type"),
                        bucket=chunk.get("bucket"),
                        sub_type=chunk.get("sub_type"),
                        section_ref=chunk.get("section_ref"),
                        heading=chunk.get("heading"),
                        text=chunk.get("text"),
                        metadata_json=metadata_json,
                    )
                )
            else:
                metadata_json = getattr(chunk, "metadata_json", None) or {}
                classes.update(
                    infer_source_classes_from_parts(
                        title=getattr(chunk, "title", None),
                        authority=getattr(chunk, "authority", None),
                        source_type=getattr(chunk, "source_type", None),
                        bucket=getattr(chunk, "bucket", None),
                        sub_type=getattr(chunk, "sub_type", None),
                        section_ref=getattr(chunk, "section_ref", None),
                        heading=getattr(chunk, "heading", None),
                        text=getattr(chunk, "text", None),
                        metadata_json=metadata_json,
                    )
                )
        return classes

    def _is_high_risk(self, flags: RiskFlags, question: str) -> bool:
        q = question.lower()
        return any(
            [
                flags.cancellation_related,
                flags.detention_related,
                flags.character_issue,
                flags.pic4020_issue,
                bool(re.search(r"\bdetention\b", q)),
                bool(re.search(r"\bsection\s*501\b", q)),
                bool(re.search(r"\bcharacter\b", q)),
                bool(re.search(r"\bcriminal\b", q)),
            ]
        )

    def _schedule_policy_overlay_live_request(self, retrieval_debug: dict[str, Any]) -> dict[str, Any] | None:
        assessment = retrieval_debug.get("schedule_aware_criterion_reasoning") or {}
        if not isinstance(assessment, dict):
            return None
        flags = set(str(x) for x in (assessment.get("current_policy_flags") or []))
        overlays = assessment.get("policy_overlays") or []
        if not isinstance(overlays, list):
            overlays = []
        needs_live = bool(flags & {"needs_live_policy_check", "unknown_current_policy", "current_policy_risk", "superseded_policy_risk"})
        needs_live = needs_live or any(bool(item.get("freshness_required")) for item in overlays if isinstance(item, dict))
        if not needs_live:
            return None

        preferred_domains = ["immi.homeaffairs.gov.au", "legislation.gov.au"]
        preferred_source_types = ["guidance", "legislation"]
        missing = ["current_policy_overlay_evidence"]
        for item in overlays:
            if not isinstance(item, dict):
                continue
            policy_key = str(item.get("policy_key") or "")
            if policy_key and policy_key not in missing:
                missing.append(policy_key)
            for url in item.get("preferred_urls") or []:
                host = self._domain_from_url(str(url))
                if host and host not in preferred_domains:
                    preferred_domains.insert(0, host)
        return {
            "reason": "schedule_policy_overlay_needs_live_check",
            "preferred_domains": preferred_domains,
            "preferred_source_types": preferred_source_types,
            "missing": missing,
        }

    def _domain_from_url(self, url: str) -> str | None:
        match = re.search(r"https?://([^/]+)", url or "", flags=re.I)
        return match.group(1).lower() if match else None

