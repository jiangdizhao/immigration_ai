from __future__ import annotations

import re
from typing import Any

from app.services.legal_reasoning_kernel import (
    CriterionAssessment,
    CriterionEvidence,
    CriterionNode,
    CriterionStatus,
    LegalReasoningKernel,
    ScheduleAwareAssessment,
)


class Subclass500CriterionPack:
    """Subclass 500 criterion pack using the refined schedule-aware model.

    Structure:
      stable legal criterion pack
      + dynamic current-policy overlays
      + live official-source retrieval
      + criterion status model

    The pack is an internal legal map, not a customer interrogation script.
    """

    subclass = "500"

    def __init__(self, kernel: LegalReasoningKernel | None = None) -> None:
        self.kernel = kernel or LegalReasoningKernel()
        self.nodes = self._build_nodes()

    def is_relevant(self, *, question: str, facts: dict[str, Any], visa_type: str | None = None) -> bool:
        q = (question or "").lower()
        if str(facts.get("visa_subclass") or "").strip() == "500":
            return True
        if str(facts.get("current_visa") or "").lower() in {"500", "500 visa", "student visa", "subclass 500"}:
            return True
        if (visa_type or "").lower() in {"student", "student_visa"}:
            return True
        return bool(re.search(r"\b500\b|student\s+visa|subclass\s*500", q, flags=re.I) or any(term in q for term in ["学生签证", "学生签", "student 500"]))

    def assess(
        self,
        *,
        question: str,
        facts: dict[str, Any],
        evidence_by_node: dict[str, CriterionEvidence] | None = None,
        visa_type: str | None = None,
    ) -> ScheduleAwareAssessment:
        if not self.is_relevant(question=question, facts=facts, visa_type=visa_type):
            return ScheduleAwareAssessment(is_active=False)

        facts = self._augment_facts_from_question(question, dict(facts or {}))
        evidence_by_node = evidence_by_node or {}
        user_goal = self._infer_user_goal(question, facts)
        candidate_pathways = self._candidate_pathways(question, facts)
        active_pathway = candidate_pathways[0] if candidate_pathways else "application_readiness"
        active_nodes = self._active_nodes_for_pathway(active_pathway, candidate_pathways, facts)

        criteria: list[CriterionAssessment] = []
        for node in active_nodes:
            status, reason, risks = self._special_status(node, facts)
            criteria.append(
                self.kernel.evaluate_node(
                    node,
                    facts,
                    forced_status=status,
                    reason=reason,
                    risk_flags=risks,
                    evidence=evidence_by_node.get(node.id),
                )
            )

        next_fact, next_question = self.kernel.select_next_fact(criteria)
        counts = self.kernel.summarize_counts(criteria)
        policy_overlays = self.kernel.policy_overlays(criteria)
        current_policy_flags = self.kernel.current_policy_flags(criteria)
        answer_blocking_missing = self.kernel.answer_blocking_missing_facts(criteria)

        missing_facts: list[str] = []
        risk_flags: list[str] = []
        for item in criteria:
            for fact in item.missing_facts:
                if fact not in missing_facts:
                    missing_facts.append(fact)
            for risk in item.risk_flags:
                if risk not in risk_flags:
                    risk_flags.append(risk)

        return ScheduleAwareAssessment(
            is_active=True,
            subclass="500",
            user_goal=user_goal,
            candidate_pathways=candidate_pathways,
            active_pathway=active_pathway,
            criteria=criteria,
            recommended_next_fact=next_fact,
            recommended_next_question=next_question,
            missing_facts=missing_facts,
            risk_flags=risk_flags,
            satisfied_count=counts.get("satisfied", 0),
            missing_count=counts.get("missing", 0),
            risk_count=counts.get("risk", 0),
            failed_count=counts.get("failed", 0),
            policy_overlay_count=counts.get("policy_overlay", 0),
            policy_overlays=policy_overlays,
            current_policy_flags=current_policy_flags,
            answer_blocking_missing_facts=answer_blocking_missing,
            answerable_provisionally=True,
            summary=self._summary(active_pathway, criteria, next_fact),
            debug={"fact_snapshot": facts, "design_note": "Subclass 500 schedule-aware reasoning with current-policy overlays."},
        )

    def evidence_queries_for_nodes(self, nodes: list[CriterionNode]) -> dict[str, list[str]]:
        return {node.id: list(node.source_queries) for node in nodes if node.source_queries}

    def active_nodes_preview(self, *, question: str, facts: dict[str, Any], visa_type: str | None = None) -> list[CriterionNode]:
        if not self.is_relevant(question=question, facts=facts, visa_type=visa_type):
            return []
        facts = self._augment_facts_from_question(question, dict(facts or {}))
        candidates = self._candidate_pathways(question, facts)
        active = candidates[0] if candidates else "application_readiness"
        return self._active_nodes_for_pathway(active, candidates, facts)

    def _build_nodes(self) -> dict[str, CriterionNode]:
        return {
            "500.intent_classification": CriterionNode(
                id="500.intent_classification",
                label="Identify the active Subclass 500 consultation pathway",
                layer="cross_subclass_dependency",
                source_queries=("Subclass 500 Student visa overview application compliance conditions family members",),
                source_classes=("student_visa_overview", "requirements_overview"),
                customer_ask_priority=50,
            ),
            "500.schedule1.valid_application": CriterionNode(
                id="500.schedule1.valid_application",
                label="Schedule 1 validity gateway for Student visa application",
                layer="schedule1_validity",
                legal_basis=("Migration Regulations 1994 Schedule 1 - Student visa valid application requirements",),
                required_facts=("current_location", "current_visa", "application_timing"),
                optional_facts=("last_substantive_visa", "visa_ceased_date", "family_application", "under_18_welfare_evidence"),
                source_queries=("Migration Regulations Schedule 1 Student Class TU Subclass 500 valid application location", "Student visa 500 applying in Australia valid application Home Affairs"),
                source_classes=("schedule1_validity", "student_visa_overview", "requirements_overview"),
                next_question="Where are you now, what visa do you currently hold, and when do you plan to apply?",
                answer_blocking=True,
                customer_ask_priority=5,
            ),
            "500.primary.course_or_support": CriterionNode(
                id="500.primary.course_or_support",
                label="Course enrolment or approved support basis",
                layer="schedule2_grant",
                legal_basis=("Subclass 500 primary criteria - enrolment/course/support basis",),
                required_facts=("coe_or_enrolment_status", "course_type"),
                optional_facts=("provider_name", "thesis_marking_required", "foreign_affairs_student", "defence_student"),
                source_queries=("Subclass 500 Student visa course enrolment Confirmation of Enrolment CoE requirement", "Student visa 500 course of study enrolment evidence Home Affairs"),
                source_classes=("student_visa_overview", "requirements_overview", "student_documents_guidance"),
                next_question="Do you already have a CoE or offer/enrolment evidence for your intended course?",
                answer_blocking=True,
                customer_ask_priority=10,
            ),
            "500.primary.genuine_student": CriterionNode(
                id="500.primary.genuine_student",
                label="Genuine Student requirement",
                layer="schedule2_grant",
                legal_basis=("Subclass 500 Genuine Student criterion / current policy",),
                required_facts=("study_purpose",),
                optional_facts=("immigration_history", "course_progression_logic", "previous_visa_compliance"),
                source_queries=("Student visa 500 Genuine Student requirement Home Affairs", "Genuine Student requirement student visa current policy"),
                source_classes=("genuine_student_guidance", "student_visa_overview"),
                next_question="What course do you plan to study, and why does it make sense for your study or career pathway?",
                customer_ask_priority=25,
                ask_only_if_user_wants_full_check=True,
                default_customer_action="warn",
            ),
            "500.primary.financial_capacity": CriterionNode(
                id="500.primary.financial_capacity",
                label="Financial capacity / funds evidence",
                layer="schedule2_grant",
                legal_basis=("Subclass 500 financial capacity requirement / current policy",),
                required_facts=("financial_capacity_evidence",),
                optional_facts=("tuition_funds", "living_cost_funds", "family_member_costs", "funds_accessible"),
                source_queries=("Student visa 500 financial capacity requirement current Home Affairs", "Subclass 500 financial evidence living costs tuition funds"),
                source_classes=("financial_capacity_guidance", "student_visa_overview", "requirements_overview"),
                next_question="Do you have evidence of funds for tuition, living costs, travel, and any accompanying family members?",
                customer_ask_priority=20,
                default_customer_action="warn",
            ),
            "500.primary.english_if_required": CriterionNode(
                id="500.primary.english_if_required",
                label="English evidence if required",
                layer="schedule2_grant",
                legal_basis=("Subclass 500 English language evidence if required",),
                required_facts=("english_requirement_status",),
                optional_facts=("english_test_status", "english_exemption_claimed", "passport_country"),
                source_queries=("Student visa 500 English language requirements Home Affairs", "Subclass 500 English test exemptions current policy"),
                source_classes=("english_requirement_guidance", "student_visa_overview"),
                next_question="Do you know whether your course/passport situation requires English evidence?",
                customer_ask_priority=30,
                ask_only_if_user_wants_full_check=True,
                default_customer_action="warn",
            ),
            "500.primary.health_insurance": CriterionNode(
                id="500.primary.health_insurance",
                label="OSHC / health insurance",
                layer="schedule2_grant",
                legal_basis=("Subclass 500 health insurance / condition 8501",),
                required_facts=("oshc_status",),
                optional_facts=("insurance_start_date", "insurance_end_date", "family_coverage"),
                source_queries=("Student visa 500 OSHC health insurance requirement condition 8501", "Subclass 500 Overseas Student Health Cover requirement"),
                source_classes=("conditions_guidance", "visa_condition_definition", "student_visa_overview"),
                next_question="Do you already have OSHC covering the intended stay period?",
                customer_ask_priority=20,
                default_customer_action="warn",
            ),
            "500.primary.public_interest": CriterionNode(
                id="500.primary.public_interest",
                label="Public interest / health / character / integrity dependencies",
                layer="cross_subclass_dependency",
                legal_basis=("Public interest criteria and integrity checks",),
                optional_facts=("health_issue", "character_issue", "debt_issue", "pic4020_issue", "minor_welfare_issue"),
                source_queries=("Student visa 500 public interest criteria health character integrity",),
                source_classes=("legislation_primary", "requirements_overview"),
                customer_ask_priority=60,
                default_customer_action="warn",
            ),
            "500.secondary.family_unit_membership": CriterionNode(
                id="500.secondary.family_unit_membership",
                label="Family member / secondary applicant pathway",
                layer="schedule2_grant",
                legal_basis=("Subclass 500 secondary applicant / member of family unit criteria",),
                required_facts=("family_member_type", "relationship_status"),
                optional_facts=("combined_application", "subsequent_entry", "dependent_child_age"),
                source_queries=("Student visa 500 family member secondary applicant spouse child requirements", "Subclass 500 bring family members spouse child Home Affairs"),
                source_classes=("student_visa_overview", "requirements_overview"),
                next_question="Is the family member your spouse/partner or child, and will they apply with you or later?",
                customer_ask_priority=10,
            ),
            "500.secondary.financial_capacity": CriterionNode(
                id="500.secondary.financial_capacity",
                label="Secondary applicant financial capacity",
                layer="schedule2_grant",
                required_facts=("secondary_financial_capacity_evidence",),
                source_queries=("Student visa 500 family members financial capacity requirement",),
                source_classes=("financial_capacity_guidance", "student_visa_overview"),
                next_question="Do you have financial evidence covering the accompanying family member's costs?",
                customer_ask_priority=25,
                ask_only_if_user_wants_full_check=True,
            ),
            "500.secondary.health_insurance": CriterionNode(
                id="500.secondary.health_insurance",
                label="Secondary applicant OSHC / health insurance",
                layer="schedule2_grant",
                required_facts=("family_oshc_status",),
                source_queries=("Student visa 500 family member OSHC health insurance",),
                source_classes=("conditions_guidance", "visa_condition_definition", "student_visa_overview"),
                next_question="Will the family member be covered by OSHC for the relevant period?",
                customer_ask_priority=25,
                ask_only_if_user_wants_full_check=True,
            ),
            "500.secondary.school_age_dependant_education": CriterionNode(
                id="500.secondary.school_age_dependant_education",
                label="School-age dependant education arrangements",
                layer="schedule2_grant",
                required_facts=("dependent_child_school_age", "education_arrangement"),
                source_queries=("Student visa 500 school age child education arrangements family member",),
                source_classes=("student_visa_overview", "requirements_overview"),
                next_question="Is the child school-aged, and have school arrangements been made?",
                customer_ask_priority=30,
                ask_only_if_user_wants_full_check=True,
            ),
            "500.conditions.primary_conditions": CriterionNode(
                id="500.conditions.primary_conditions",
                label="Primary Student visa conditions",
                layer="practical_consequence",
                legal_basis=("Subclass 500 visa conditions including 8105, 8202, 8501, 8516, 8517, 8532, 8533, and 8208 where applicable",),
                optional_facts=("condition_numbers", "condition_8208_applies", "condition_8105_applies", "condition_8202_applies"),
                source_queries=("Subclass 500 visa conditions 8105 8202 8501 8516 8517 8532 8533 8208",),
                source_classes=("conditions_guidance", "visa_conditions_schedule", "student_visa_overview"),
                default_customer_action="warn",
            ),
            "500.conditions.secondary_conditions": CriterionNode(
                id="500.conditions.secondary_conditions",
                label="Secondary Student visa conditions",
                layer="practical_consequence",
                legal_basis=("Subclass 500 secondary visa conditions including 8104, 8208, 8501, 8516 and age-dependent conditions",),
                optional_facts=("secondary_condition_numbers", "secondary_applicant_age"),
                source_queries=("Subclass 500 secondary applicant visa conditions 8104 8208 8501 8516",),
                source_classes=("conditions_guidance", "visa_conditions_schedule", "student_visa_overview"),
                default_customer_action="warn",
            ),
            "500.compliance.work_hours": CriterionNode(
                id="500.compliance.work_hours",
                label="Work-hour compliance risk",
                layer="practical_consequence",
                legal_basis=("Student visa work condition / condition 8105 or 8104",),
                required_facts=("work_hours_issue",),
                optional_facts=("work_hours_per_fortnight", "condition_8105_applies", "course_in_session"),
                source_queries=("Student visa 500 work hours condition 8105 current policy", "Student visa work rights current policy 48 hours per fortnight Home Affairs"),
                source_classes=("conditions_guidance", "student_visa_overview", "visa_conditions_schedule"),
                next_question="Have you received any formal Home Affairs notice, or only a school/provider warning?",
                customer_ask_priority=5,
                default_customer_action="warn",
            ),
            "500.compliance.attendance_or_course_progress": CriterionNode(
                id="500.compliance.attendance_or_course_progress",
                label="Attendance / course progress compliance risk",
                layer="practical_consequence",
                legal_basis=("Student visa study/course progress condition / condition 8202",),
                required_facts=("attendance_or_course_progress_issue",),
                optional_facts=("attendance_rate", "course_progress_warning", "condition_8202_applies"),
                source_queries=("Student visa 500 attendance course progress condition 8202", "Subclass 500 course progress attendance provider reporting risk"),
                source_classes=("conditions_guidance", "student_visa_overview", "visa_conditions_schedule"),
                next_question="Have you received any formal Home Affairs notice, or only a school/provider warning?",
                customer_ask_priority=5,
                default_customer_action="warn",
            ),
            "500.compliance.school_warning_or_provider_report": CriterionNode(
                id="500.compliance.school_warning_or_provider_report",
                label="School warning versus Home Affairs notice",
                layer="practical_consequence",
                required_facts=("home_affairs_notice_received",),
                optional_facts=("school_warning", "provider_reported", "noicc_received"),
                source_queries=("Student visa 500 provider warning attendance Home Affairs notice cancellation risk",),
                source_classes=("student_visa_overview", "official_next_steps", "conditions_guidance"),
                next_question="Have you received a formal Home Affairs notice, or only an email/warning from the school or provider?",
                customer_ask_priority=5,
                default_customer_action="warn",
            ),
            "500.compliance.health_insurance": CriterionNode(
                id="500.compliance.health_insurance",
                label="Health insurance compliance risk",
                layer="practical_consequence",
                legal_basis=("Condition 8501 health insurance compliance",),
                required_facts=("oshc_status",),
                optional_facts=("insurance_gap",),
                source_queries=("Student visa condition 8501 maintain health insurance OSHC",),
                source_classes=("conditions_guidance", "visa_condition_definition", "student_visa_overview"),
                next_question="Do you currently have OSHC, and has there been any gap in coverage?",
                customer_ask_priority=20,
                default_customer_action="warn",
            ),
            "500.status.expiring_or_expired": CriterionNode(
                id="500.status.expiring_or_expired",
                label="Student visa expiry / expired-status risk",
                layer="cross_subclass_dependency",
                required_facts=("student_visa_expiry_status", "current_location"),
                optional_facts=("student_visa_expiry_date", "student_visa_expired_days", "student_visa_expires_in_days", "bridging_status"),
                source_queries=("Student visa 500 expired in Australia bridging visa status Home Affairs", "Student visa expiring extension new application bridging visa"),
                source_classes=("student_visa_overview", "bridging_travel", "official_next_steps"),
                next_question="Are you currently in Australia, and has the Student visa already expired or is it still valid?",
                answer_blocking=True,
                customer_ask_priority=5,
                default_customer_action="warn",
            ),
            "500.status.transition_to_485": CriterionNode(
                id="500.status.transition_to_485",
                label="Transition from Student visa to 485",
                layer="cross_subclass_dependency",
                required_facts=("target_visa_subclass", "course_completion_status"),
                optional_facts=("completion_letter_available", "official_transcript_available", "student_visa_expired_days"),
                source_queries=("Student visa 500 completed course apply for 485 temporary graduate visa timing",),
                source_classes=("485_requirements_overview", "student_visa_overview", "official_next_steps"),
                next_question="Are you trying to apply for a 485 visa, and have you already lodged it?",
                customer_ask_priority=5,
                default_customer_action="warn",
            ),
            "500.refusal_or_cancellation.triage": CriterionNode(
                id="500.refusal_or_cancellation.triage",
                label="Student visa refusal/cancellation/NOICC triage",
                layer="cross_subclass_dependency",
                required_facts=("home_affairs_decision_or_notice_type",),
                optional_facts=("notification_date", "refusal_notice_available", "noicc_received", "cancellation_decision_received"),
                source_queries=("Student visa refusal cancellation NOICC ART review next steps",),
                source_classes=("review_rights", "review_deadline", "official_next_steps", "student_visa_overview"),
                next_question="Was it a refusal, a NOICC/proposed cancellation notice, or an actual cancellation decision?",
                answer_blocking=True,
                customer_ask_priority=5,
                default_customer_action="lawyer_review",
            ),
            "500.policy.genuine_student_current": CriterionNode(
                id="500.policy.genuine_student_current",
                label="Current Genuine Student policy overlay",
                layer="current_policy_overlay",
                required_facts=("study_purpose",),
                source_queries=("Home Affairs Genuine Student requirement Student visa 500 current",),
                source_classes=("genuine_student_guidance", "student_visa_overview"),
                policy_key="500_genuine_student_current",
                affected_nodes=("500.primary.genuine_student",),
                freshness_required=True,
                preferred_urls=("https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/student-500",),
                live_query_hints=("Student visa 500 Genuine Student requirement Home Affairs current",),
                next_question="What is your intended course and why does it fit your study/career pathway?",
                customer_ask_priority=25,
                ask_only_if_user_wants_full_check=True,
                default_customer_action="warn_and_check_current_policy",
            ),
            "500.policy.financial_capacity_current": CriterionNode(
                id="500.policy.financial_capacity_current",
                label="Current financial-capacity policy overlay",
                layer="current_policy_overlay",
                required_facts=("financial_capacity_evidence",),
                source_queries=("Home Affairs Student visa 500 financial capacity current requirement",),
                source_classes=("financial_capacity_guidance", "student_visa_overview"),
                policy_key="500_financial_capacity_current",
                affected_nodes=("500.primary.financial_capacity", "500.secondary.financial_capacity"),
                freshness_required=True,
                live_query_hints=("Student visa financial capacity current Home Affairs",),
                next_question="Do you have evidence of funds for tuition, living costs, travel, and family members if any?",
                customer_ask_priority=20,
                default_customer_action="warn_and_check_current_policy",
            ),
            "500.policy.english_requirement_current": CriterionNode(
                id="500.policy.english_requirement_current",
                label="Current English requirement policy overlay",
                layer="current_policy_overlay",
                required_facts=("english_requirement_status",),
                source_queries=("Home Affairs Student visa 500 English language requirement current",),
                source_classes=("english_requirement_guidance", "student_visa_overview"),
                policy_key="500_english_requirement_current",
                affected_nodes=("500.primary.english_if_required",),
                freshness_required=True,
                live_query_hints=("Student visa 500 English requirement current Home Affairs",),
                next_question="Do you know whether your course/passport situation requires English evidence?",
                customer_ask_priority=30,
                ask_only_if_user_wants_full_check=True,
                default_customer_action="warn_and_check_current_policy",
            ),
            "500.policy.work_rights_current": CriterionNode(
                id="500.policy.work_rights_current",
                label="Current Student visa work-rights policy overlay",
                layer="current_policy_overlay",
                required_facts=("work_hours_issue",),
                optional_facts=("work_hours_per_fortnight",),
                source_queries=("Home Affairs Student visa work hours current condition 8105",),
                source_classes=("conditions_guidance", "student_visa_overview", "visa_conditions_schedule"),
                policy_key="500_work_rights_current",
                affected_nodes=("500.compliance.work_hours", "500.conditions.primary_conditions", "500.conditions.secondary_conditions"),
                freshness_required=True,
                live_query_hints=("Student visa work hours current Home Affairs 8105",),
                next_question="How many hours did you work per fortnight, and was your course in session?",
                customer_ask_priority=10,
                default_customer_action="warn_and_check_current_policy",
            ),
            "500.policy.critical_technology_condition8208": CriterionNode(
                id="500.policy.critical_technology_condition8208",
                label="Critical technology / condition 8208 policy overlay for Student visa",
                layer="current_policy_overlay",
                required_facts=("critical_technology_context",),
                optional_facts=("course_type", "research_topic", "condition_8208_applies", "course_change_or_research_topic_change"),
                source_queries=("Home Affairs critical technology condition 8208 Student visa 500 approval", "Student visa 500 critical technology postgraduate research condition 8208 PIC 4003B"),
                source_classes=("critical_technology_policy", "conditions_guidance", "legislation_primary"),
                policy_key="500_critical_technology_condition8208",
                affected_nodes=("500.conditions.primary_conditions", "500.primary.public_interest"),
                freshness_required=True,
                preferred_urls=("https://www.homeaffairs.gov.au/about-us/our-portfolios/national-security/technology-and-data-security/critical-technology",),
                live_query_hints=("Home Affairs critical technology condition 8208 Student visa 500 approval",),
                next_question="Is this a postgraduate research course or research topic involving critical technology such as AI, cyber security, quantum, or advanced computing?",
                customer_ask_priority=5,
                default_customer_action="warn_and_check_current_policy",
            ),
            "cross_policy.critical_technology_pic4003b": CriterionNode(
                id="cross_policy.critical_technology_pic4003b",
                label="Critical technology / PIC 4003B cross-subclass policy overlay",
                layer="current_policy_overlay",
                required_facts=("critical_technology_context",),
                optional_facts=("course_type", "research_topic", "condition_8208_applies"),
                source_queries=("Home Affairs critical technology PIC 4003B condition 8208 student visa 500 temporary graduate 485",),
                source_classes=("critical_technology_policy", "conditions_guidance", "legislation_primary"),
                policy_key="critical_technology_pic4003b_condition8208",
                affected_nodes=("500.primary.public_interest", "500.policy.critical_technology_condition8208"),
                freshness_required=True,
                preferred_urls=("https://www.homeaffairs.gov.au/about-us/our-portfolios/national-security/technology-and-data-security/critical-technology",),
                live_query_hints=("Home Affairs critical technology PIC 4003B condition 8208",),
                next_question="Is the course or research topic related to critical technology?",
                customer_ask_priority=5,
                default_customer_action="warn_and_check_current_policy",
            ),
        }

    def _active_nodes_for_pathway(self, active_pathway: str, candidate_pathways: list[str], facts: dict[str, Any]) -> list[CriterionNode]:
        ids = ["500.intent_classification"]
        if active_pathway == "application_readiness":
            ids.extend([
                "500.schedule1.valid_application",
                "500.primary.course_or_support",
                "500.primary.genuine_student",
                "500.primary.financial_capacity",
                "500.primary.health_insurance",
                "500.primary.english_if_required",
                "500.primary.public_interest",
                "500.policy.genuine_student_current",
                "500.policy.financial_capacity_current",
                "500.policy.english_requirement_current",
            ])
        elif active_pathway == "compliance":
            ids.extend([
                "500.conditions.primary_conditions",
                "500.compliance.work_hours",
                "500.compliance.attendance_or_course_progress",
                "500.compliance.school_warning_or_provider_report",
                "500.compliance.health_insurance",
                "500.policy.work_rights_current",
            ])
        elif active_pathway == "status_or_expiry":
            ids.extend(["500.status.expiring_or_expired", "500.schedule1.valid_application"])
            if str(facts.get("target_visa_subclass") or "") == "485" or facts.get("transition_to_485"):
                ids.append("500.status.transition_to_485")
        elif active_pathway == "family_secondary":
            ids.extend(["500.secondary.family_unit_membership", "500.secondary.financial_capacity", "500.secondary.health_insurance"])
            if facts.get("dependent_child_school_age") or facts.get("dependent_child_age"):
                ids.append("500.secondary.school_age_dependant_education")
        elif active_pathway == "refusal_cancellation":
            ids.append("500.refusal_or_cancellation.triage")
        elif active_pathway == "critical_technology":
            ids.extend(["500.conditions.primary_conditions", "500.policy.critical_technology_condition8208", "cross_policy.critical_technology_pic4003b"])
        else:
            ids.extend(["500.schedule1.valid_application", "500.primary.course_or_support"])

        if facts.get("critical_technology_context") and "500.policy.critical_technology_condition8208" not in ids:
            ids.extend(["500.policy.critical_technology_condition8208", "cross_policy.critical_technology_pic4003b"])
        return [self.nodes[item] for item in ids if item in self.nodes]

    def _candidate_pathways(self, question: str, facts: dict[str, Any]) -> list[str]:
        q = (question or "").lower()
        pathways: list[str] = []
        if facts.get("critical_technology_context"):
            pathways.append("critical_technology")
        if any(facts.get(key) for key in ["family_member_question", "family_member_type", "dependent_child_age"]):
            pathways.append("family_secondary")
        elif any(term in q for term in ["spouse", "wife", "husband", "partner", "child", "children", "dependent", "family", "配偶", "孩子", "家属"]):
            pathways.append("family_secondary")
        if any(facts.get(key) for key in ["work_hours_issue", "attendance_or_course_progress_issue", "school_warning", "home_affairs_notice_received"]):
            pathways.append("compliance")
        elif any(term in q for term in ["work hours", "work limit", "attendance", "course progress", "school warning", "provider warning", "工作时间", "出勤", "学校警告"]):
            pathways.append("compliance")
        if any(facts.get(key) for key in ["student_visa_expired_days", "student_visa_expires_in_days", "student_visa_expiry_status"]):
            pathways.append("status_or_expiry")
        elif any(term in q for term in ["expired", "expires", "extension", "extend", "overstay", "unlawful", "过期", "到期", "延期", "续签", "非法"]):
            pathways.append("status_or_expiry")
        if "485" in q or str(facts.get("target_visa_subclass") or "") == "485":
            if "status_or_expiry" not in pathways:
                pathways.append("status_or_expiry")
            facts.setdefault("transition_to_485", True)
            facts.setdefault("target_visa_subclass", "485")
        if any(term in q for term in ["refused", "refusal", "cancelled", "cancellation", "noicc", "art", "review", "拒签", "取消", "复审", "上诉"]):
            pathways.append("refusal_cancellation")
        if not pathways:
            pathways.append("application_readiness")
        return self._unique(pathways)

    def _infer_user_goal(self, question: str, facts: dict[str, Any]) -> str:
        active = self._candidate_pathways(question, facts)[0]
        return {
            "application_readiness": "student_visa_application_readiness",
            "compliance": "student_visa_compliance_risk",
            "status_or_expiry": "student_visa_status_or_expiry",
            "family_secondary": "student_visa_family_member_triage",
            "refusal_cancellation": "student_visa_refusal_or_cancellation_triage",
            "critical_technology": "student_visa_critical_technology_policy_check",
        }.get(active, "student_visa_general_consultation")

    def _special_status(self, node: CriterionNode, facts: dict[str, Any]) -> tuple[CriterionStatus | None, str | None, list[str]]:
        if node.id == "500.status.expiring_or_expired":
            expired_days = self._duration_as_float(facts.get("student_visa_expired_days"))
            if expired_days is not None and expired_days > 0:
                return "risk", "The user says the Student visa has already expired; current status and bridging arrangements must be checked urgently.", ["student_visa_expired_status_risk"]
        if node.id == "500.compliance.work_hours":
            if facts.get("work_hours_issue"):
                hours = self._duration_as_float(facts.get("work_hours_per_fortnight"))
                if hours is not None and hours > 48:
                    return "current_policy_risk", "The stated work hours appear above the common current Student visa work-rights threshold and should be checked against current policy.", ["student_work_hours_exceeded"]
                return "risk", "The known facts suggest a Student visa work-condition risk.", ["student_work_condition_risk"]
        if node.id == "500.compliance.attendance_or_course_progress":
            if facts.get("attendance_or_course_progress_issue") or facts.get("attendance_warning") or facts.get("course_progress_warning"):
                return "risk", "Attendance/course-progress issues can become Student visa compliance risks, especially if the provider reports the issue or Home Affairs sends a notice.", ["student_attendance_or_course_progress_risk"]
        if node.id == "500.compliance.school_warning_or_provider_report":
            if facts.get("home_affairs_notice_received") is True:
                return "requires_lawyer_review", "A formal Home Affairs notice or cancellation-related document should be reviewed urgently.", ["home_affairs_notice_received"]
            if facts.get("school_warning") or facts.get("provider_warning"):
                return "risk", "A school/provider warning is not itself a visa cancellation, but it is a compliance warning that should not be ignored.", ["school_warning_not_home_affairs_decision"]
        if node.id in {"500.policy.critical_technology_condition8208", "cross_policy.critical_technology_pic4003b"} and facts.get("critical_technology_context"):
            return "needs_live_policy_check", "Critical technology issues depend on current official Home Affairs policy, condition 8208/PIC 4003B, and the course/research details.", ["critical_technology_policy_check_required"]
        if node.id == "500.policy.work_rights_current" and facts.get("work_hours_issue"):
            return "needs_live_policy_check", "Student visa work-rights settings are current-policy sensitive and should be checked against current Home Affairs guidance.", ["student_work_rights_current_policy_check"]
        if node.id in {"500.primary.health_insurance", "500.compliance.health_insurance"}:
            value = str(facts.get("oshc_status") or "").lower()
            if value in {"no", "none", "expired", "gap", "lapsed"}:
                return "risk", "A missing or lapsed OSHC/health-insurance arrangement is a Student visa risk.", ["oshc_gap_or_missing"]
        if node.id == "500.primary.financial_capacity":
            value = str(facts.get("financial_capacity_evidence") or "").lower()
            if value in {"no", "none", "insufficient", "weak"}:
                return "risk", "Weak financial-capacity evidence is a common Student visa refusal risk.", ["financial_capacity_evidence_risk"]
        return None, None, []

    def _augment_facts_from_question(self, question: str, facts: dict[str, Any]) -> dict[str, Any]:
        q = (question or "").lower()
        if re.search(r"\b500\b|student\s+visa|subclass\s*500", q, flags=re.I) or any(term in q for term in ["学生签证", "学生签"]):
            facts.setdefault("visa_subclass", "500")
            facts.setdefault("visa_type", "student")
        if "485" in q or "temporary graduate" in q:
            facts.setdefault("target_visa_subclass", "485")
            facts.setdefault("transition_to_485", True)
        expired_match = re.search(r"(?:expired|过期).{0,20}?(\d+)\s*(?:day|days|天)", q)
        if expired_match:
            facts.setdefault("student_visa_expired_days", int(expired_match.group(1)))
            facts.setdefault("student_visa_expiry_status", "expired")
        elif any(term in q for term in ["expired", "过期"]):
            facts.setdefault("student_visa_expiry_status", "expired")
        elif any(term in q for term in ["expires", "到期"]):
            facts.setdefault("student_visa_expiry_status", "expiring")
        if any(term in q for term in ["in australia", "onshore", "在澳洲", "在澳大利亚", "境内"]):
            facts.setdefault("current_location", "in_australia")
        if any(term in q for term in ["outside australia", "offshore", "境外"]):
            facts.setdefault("current_location", "outside_australia")
        if any(term in q for term in ["coe", "confirmation of enrolment", "offer letter", "录取"]):
            facts.setdefault("coe_or_enrolment_status", "mentioned")
        if any(term in q for term in ["oshc", "health insurance", "保险", "医疗保险"]):
            facts.setdefault("oshc_status", "mentioned")
        if any(term in q for term in ["work hours", "work limit", "working too much", "工作时间", "打工"]):
            facts.setdefault("work_hours_issue", True)
        hours_match = re.search(r"(\d{1,3})\s*(?:hours?|小时)", q)
        if hours_match and (facts.get("work_hours_issue") or "fortnight" in q or "两周" in q):
            facts.setdefault("work_hours_per_fortnight", int(hours_match.group(1)))
        if any(term in q for term in ["attendance", "course progress", "出勤", "学习进度"]):
            facts.setdefault("attendance_or_course_progress_issue", True)
        if any(term in q for term in ["school warning", "provider warning", "学校警告", "学校邮件", "warning email"]):
            facts.setdefault("school_warning", True)
        if any(term in q for term in ["home affairs notice", "noicc", "formal notice", "正式通知", "拟取消"]):
            facts.setdefault("home_affairs_notice_received", True)
        if any(term in q for term in ["spouse", "wife", "husband", "partner", "child", "children", "dependent", "family", "配偶", "孩子", "家属"]):
            facts.setdefault("family_member_question", True)
        if any(term in q for term in ["critical technology", "critical technologies", "ai", "cybersecurity", "quantum", "phd", "doctoral research", "人工智能", "网络安全", "量子"]):
            facts.setdefault("critical_technology_context", True)
        if any(term in q for term in ["phd", "doctorate", "doctoral research", "research degree", "博士", "研究型"]):
            facts.setdefault("course_type", "postgraduate_research")
        return facts

    def _summary(self, active_pathway: str, criteria: list[CriterionAssessment], next_fact: str | None) -> str:
        status_parts = []
        for status in ["satisfied", "missing", "risk", "failed", "needs_live_policy_check", "current_policy_risk"]:
            count = sum(1 for item in criteria if item.status == status)
            if count:
                status_parts.append(f"{count} {status}")
        suffix = f" Next high-priority fact: {next_fact}." if next_fact else ""
        return f"Subclass 500 schedule-aware assessment active. Current pathway: {active_pathway}. Criteria: {', '.join(status_parts) or 'no criteria'}." + suffix

    def _duration_as_float(self, value: Any) -> float | None:
        if value is None:
            return None
        if isinstance(value, (int, float)):
            return float(value)
        match = re.search(r"(\d+(?:\.\d+)?)", str(value).lower())
        return float(match.group(1)) if match else None

    def _unique(self, values: list[str]) -> list[str]:
        seen: set[str] = set()
        out: list[str] = []
        for value in values:
            if value not in seen:
                seen.add(value)
                out.append(value)
        return out
