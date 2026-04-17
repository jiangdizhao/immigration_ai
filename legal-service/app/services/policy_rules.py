from __future__ import annotations

from typing import Any

from app.schemas.state import EvidencePackage, MatterState, PolicyDecision, RiskFlags, SufficiencyGateResult


class PolicyRules:
    """
    Deterministic policy / sufficiency layer.

    This layer should stay model-free. It makes bounded decisions about:
    - whether local retrieval is sufficient
    - whether live official retrieval should be triggered
    - whether to ask follow-up questions, answer, or escalate
    - how confidence should be capped
    """

    def judge_local_sufficiency(
        self,
        *,
        question: str,
        issue_type: str | None,
        operation_type: str | None,
        known_facts: dict[str, Any] | None,
        retrieval_debug: dict[str, Any] | None = None,
    ) -> SufficiencyGateResult:
        q = question.lower()
        known_facts = known_facts or {}
        retrieval_debug = retrieval_debug or {}
        rows = retrieval_debug.get("results") or []
        if not isinstance(rows, list):
            rows = []

        titles = [str((r or {}).get("title") or "").lower() for r in rows if isinstance(r, dict)]
        source_types = [str((r or {}).get("source_type") or "").lower() for r in rows if isinstance(r, dict)]
        buckets = [str((r or {}).get("bucket") or "").lower() for r in rows if isinstance(r, dict)]

        preferred_domains: list[str] = []
        preferred_source_types: list[str] = []
        reason = None
        need_live_fetch = False
        local_sufficient = True

        if not rows:
            need_live_fetch = True
            local_sufficient = False
            reason = "no_local_results"

        if any(term in q for term in ["current", "latest", "recent", "today"]):
            need_live_fetch = True
            local_sufficient = False
            reason = reason or "freshness_requested"

        # operation-specific retrieval sufficiency
        if operation_type == "bridging_travel":
            preferred_domains = ["immi.homeaffairs.gov.au"]
            preferred_source_types = ["guidance"]
            good = any(
                ("travel on a bridging visa" in t)
                or ("bridging visa b" in t)
                or ("(bvb)" in t)
                for t in titles
            )
            if not good:
                need_live_fetch = True
                local_sufficient = False
                reason = reason or "missing_bridging_travel_guidance"

        elif operation_type in {"review_rights", "review_deadline"}:
            preferred_domains = ["art.gov.au", "legislation.gov.au", "fedcourt.gov.au"]
            preferred_source_types = ["procedure", "legislation"]
            good = any("administrative_review_tribunal" in t or "reviewable migration decisions" in t for t in titles)
            if not good:
                need_live_fetch = True
                local_sufficient = False
                reason = reason or "missing_review_sources"
            if operation_type == "review_deadline" and not known_facts.get("notification_date"):
                # local may still contain rules, but answer will remain incomplete
                reason = reason or "missing_notification_date"

        elif operation_type == "student_refusal_next_steps" or issue_type == "student_visa":
            preferred_domains = ["immi.homeaffairs.gov.au", "art.gov.au"]
            preferred_source_types = ["guidance", "procedure"]
            good = any(
                ("student visa" in t)
                or ("genuine student" in t)
                for t in titles
            )
            if not good:
                need_live_fetch = True
                local_sufficient = False
                reason = reason or "missing_student_guidance"

        elif operation_type == "485_eligibility_overview":
            preferred_domains = ["immi.homeaffairs.gov.au"]
            preferred_source_types = ["guidance"]
            good = any("temporary graduate" in t or "subclass 485" in t for t in titles)
            if not good:
                need_live_fetch = True
                local_sufficient = False
                reason = reason or "missing_485_guidance"

        elif operation_type == "pic4020_risk" or issue_type == "pic4020_issue":
            preferred_domains = ["immi.homeaffairs.gov.au", "legislation.gov.au"]
            preferred_source_types = ["guidance", "legislation"]
            good = any("accurate information" in t or "4020" in t for t in titles)
            if not good:
                need_live_fetch = True
                local_sufficient = False
                reason = reason or "missing_pic4020_guidance"

        # generic anti-noise rule
        if local_sufficient and rows:
            legislation_heavy = source_types.count("legislation") >= max(3, len(source_types) - 1)
            no_guidance = "guidance" not in source_types
            if legislation_heavy and no_guidance and operation_type not in {"review_rights", "review_deadline"}:
                need_live_fetch = True
                local_sufficient = False
                reason = reason or "local_results_too_legislation_heavy"

        # procedure/form-heavy for practical questions
        if local_sufficient and operation_type in {"student_refusal_next_steps", "bridging_travel", "document_checklist", "485_eligibility_overview"}:
            if buckets and all(b in {"procedure", "live_official"} for b in buckets[: min(3, len(buckets))]):
                need_live_fetch = True
                local_sufficient = False
                reason = reason or "local_results_too_procedural"

        return SufficiencyGateResult(
            local_sufficient=local_sufficient,
            reason=reason,
            need_live_fetch=need_live_fetch,
            preferred_domains=preferred_domains,
            preferred_source_types=preferred_source_types,
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
        reasons: list[str] = []
        confidence_cap: str | None = None

        # high-risk escalation gates
        if self._is_high_risk(state_obj.risk_flags, question):
            return PolicyDecision(
                answer_allowed=True,
                escalate=True,
                next_action="suggest_consultation",
                confidence_cap="low",
                reasons=["high_risk_issue"],
            )

        # local insufficiency should usually trigger live fallback first, not a definitive answer
        if suff_obj.need_live_fetch and not bool(live_retrieval.get("used_live_fetch", False)):
            return PolicyDecision(
                answer_allowed=True,
                escalate=False,
                next_action="ask_followup",
                confidence_cap="low",
                reasons=["live_fetch_needed_but_not_used", *( [suff_obj.reason] if suff_obj.reason else [])],
            )

        if state_obj.risk_flags.deadline_sensitive:
            confidence_cap = "low"
            reasons.append("deadline_sensitive")

        if ev_obj.missing_information:
            reasons.append("missing_information")
            if confidence_cap is None:
                confidence_cap = "low"

        if ev_obj.unsupported_requests:
            reasons.append("unsupported_specificity")
            if confidence_cap is None:
                confidence_cap = "low"

        if not ev_obj.is_context_sufficient:
            reasons.append("context_insufficient")
            if confidence_cap is None:
                confidence_cap = "low"

        # if review/deadline and key dates missing, force follow-up
        op = state_obj.operation_type or ev_obj.operation_type
        facts = state_obj.carried_intake_facts or {}
        if op in {"review_rights", "review_deadline"}:
            if not facts.get("notification_date"):
                return PolicyDecision(
                    answer_allowed=True,
                    escalate=False,
                    next_action="ask_followup",
                    confidence_cap="low",
                    reasons=[*reasons, "missing_notification_date"],
                )

        # if the system only has general support, keep next action on follow-up
        if not ev_obj.is_context_sufficient or ev_obj.missing_information:
            return PolicyDecision(
                answer_allowed=True,
                escalate=False,
                next_action="ask_followup",
                confidence_cap=confidence_cap or "low",
                reasons=reasons,
            )

        return PolicyDecision(
            answer_allowed=True,
            escalate=False,
            next_action="answer",
            confidence_cap=confidence_cap,
            reasons=reasons,
        )

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------
    def _is_high_risk(self, flags: RiskFlags, question: str) -> bool:
        q = question.lower()
        return any(
            [
                flags.cancellation_related,
                flags.detention_related,
                flags.character_issue,
                flags.pic4020_issue,
                "detention" in q,
                "section 501" in q,
                "character" in q,
                "criminal" in q,
            ]
        )
