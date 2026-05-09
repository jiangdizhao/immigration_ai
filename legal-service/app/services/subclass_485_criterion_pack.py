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


VOCATIONAL_TERMS = {"trade", "diploma", "advanced_diploma", "associate_degree", "certificate"}
HIGHER_ED_TERMS = {"bachelor", "masters", "master", "phd", "doctorate", "degree"}


class Subclass485CriterionPack:
    """
    Subclass 485 criterion pack.

    This is not intended to be a closed 485-only tree. It is a plugin for the
    generic schedule-aware kernel. Cross-subclass dependencies are represented
    as nodes so future subclass packs can reuse the same pattern.
    """

    subclass = "485"

    def __init__(self, kernel: LegalReasoningKernel | None = None) -> None:
        self.kernel = kernel or LegalReasoningKernel()
        self.nodes = self._build_nodes()

    def is_relevant(self, *, question: str, facts: dict[str, Any], visa_type: str | None = None) -> bool:
        q = (question or "").lower()
        if str(facts.get("visa_subclass") or "").strip() == "485":
            return True
        if (visa_type or "").lower() in {"temporary_graduate", "temporary_graduate_visa"}:
            return True
        return bool(re.search(r"\b485\b|temporary\s+graduate|graduate\s+visa", q, flags=re.I))

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
        user_goal = self._infer_user_goal(question)
        candidate_pathways = self._candidate_pathways(question, facts)
        active_pathway = candidate_pathways[0] if candidate_pathways else "stream_selection"

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
        missing_facts = []
        risk_flags = []
        for item in criteria:
            for fact in item.missing_facts:
                if fact not in missing_facts:
                    missing_facts.append(fact)
            for risk in item.risk_flags:
                if risk not in risk_flags:
                    risk_flags.append(risk)

        return ScheduleAwareAssessment(
            is_active=True,
            subclass="485",
            user_goal=user_goal,
            candidate_pathways=candidate_pathways,
            active_pathway=active_pathway,
            criteria=criteria,
            recommended_next_fact=next_fact,
            recommended_next_question=next_question,
            missing_facts=missing_facts,
            risk_flags=risk_flags,
            satisfied_count=counts["satisfied"],
            missing_count=counts["missing"],
            risk_count=counts["risk"],
            failed_count=counts["failed"],
            summary=self._summary(active_pathway, criteria, next_fact),
            debug={
                "fact_snapshot": facts,
                "design_note": "Schedule-aware reasoning: Schedule 1 validity before Schedule 2 grant criteria.",
            },
        )

    def evidence_queries_for_nodes(self, nodes: list[CriterionNode]) -> dict[str, list[str]]:
        return {node.id: list(node.source_queries) for node in nodes if node.source_queries}

    def active_nodes_preview(self, *, question: str, facts: dict[str, Any], visa_type: str | None = None) -> list[CriterionNode]:
        if not self.is_relevant(question=question, facts=facts, visa_type=visa_type):
            return []
        facts = self._augment_facts_from_question(question, dict(facts or {}))
        candidates = self._candidate_pathways(question, facts)
        active = candidates[0] if candidates else "stream_selection"
        return self._active_nodes_for_pathway(active, candidates, facts)

    # ------------------------------------------------------------------
    # Node definitions
    # ------------------------------------------------------------------
    def _build_nodes(self) -> dict[str, CriterionNode]:
        return {
            "485.stream_selection": CriterionNode(
                id="485.stream_selection",
                label="Identify the correct Subclass 485 pathway",
                layer="cross_subclass_dependency",
                legal_basis=("Subclass 485 streams / pathway classification",),
                required_facts=("qualification_level", "first_485_or_subsequent"),
                optional_facts=("regional_study_location", "replacement_reason", "previous_485_held"),
                source_queries=(
                    "Subclass 485 Temporary Graduate visa streams vocational higher education regional replacement",
                    "Temporary Graduate visa Subclass 485 streams eligibility overview",
                ),
                source_classes=("485_requirements_overview",),
                next_question="What qualification did you complete, and is this your first 485 application?",
                customer_explanation="Before checking eligibility, the correct 485 stream must be identified.",
            ),
            "485.schedule1.valid_application": CriterionNode(
                id="485.schedule1.valid_application",
                label="Schedule 1 validity gateway",
                layer="schedule1_validity",
                legal_basis=("Migration Regulations 1994 Schedule 1 - valid application requirements",),
                required_facts=("current_location", "current_visa", "application_timing"),
                optional_facts=("stream_intended", "family_application", "bridging_status"),
                source_queries=(
                    "Schedule 1 Temporary Graduate Class VC Subclass 485 valid application form charge location",
                    "Migration Regulations Schedule 1 Temporary Graduate Class VC Subclass 485 application validity",
                    "Subclass 485 Schedule 1 valid application requirements",
                ),
                source_classes=("485_schedule1_application_requirements", "schedule1_validity"),
                next_question="Where are you now, what visa do you currently hold, and when do you plan to apply?",
                customer_explanation="A visa application must first be validly made before grant criteria matter.",
            ),
            "485.common.application_window": CriterionNode(
                id="485.common.application_window",
                label="Application window and completion timing",
                layer="schedule2_grant",
                legal_basis=("Subclass 485 completion/application timing criteria",),
                required_facts=("course_completion_date", "application_timing"),
                optional_facts=("qualification_level",),
                source_queries=(
                    "Subclass 485 completed within 6 months application course completion Schedule 2",
                    "Temporary Graduate visa course completion date application timing",
                ),
                source_classes=("485_application_window", "485_requirements_overview"),
                next_question="When did you complete your course, and when do you plan to lodge the 485 application?",
            ),
            "485.common.student_visa_study": CriterionNode(
                id="485.common.student_visa_study",
                label="Student visa / Australian study dependency",
                layer="cross_subclass_dependency",
                legal_basis=("Australian Study Requirement / study on student visa",),
                required_facts=("studied_in_australia_on_student_visa", "australian_study_requirement_met"),
                optional_facts=("course_cricos_registered", "study_duration_months"),
                source_queries=(
                    "Subclass 485 Australian study requirement student visa CRICOS 16 months two academic years",
                    "Temporary Graduate visa Australian study requirement CRICOS student visa",
                ),
                source_classes=("485_australian_study_requirement", "student_visa_overview"),
                next_question="Did you complete at least two academic years / 16 months of CRICOS study in Australia while holding a student visa?",
            ),
            "485.vocational.qualification": CriterionNode(
                id="485.vocational.qualification",
                label="Post-Vocational Education Work stream qualification",
                layer="schedule2_grant",
                legal_basis=("Schedule 2 clauses 485.221-485.224",),
                applies_to_pathways=("vocational",),
                required_facts=("qualification_level", "qualification_type", "course_completion_date"),
                optional_facts=("australian_study_requirement_met",),
                source_queries=(
                    "485.221 485.224 Post-Vocational Education Work stream qualification diploma trade associate degree",
                    "Subclass 485 vocational stream qualification closely related nominated occupation",
                ),
                source_classes=("485_vocational_485221_485224", "485_requirements_overview"),
                next_question="Was your completed qualification a trade qualification, diploma, or associate degree?",
            ),
            "485.vocational.skills_assessment": CriterionNode(
                id="485.vocational.skills_assessment",
                label="Skills assessment for vocational stream",
                layer="schedule2_grant",
                legal_basis=("Schedule 2 clause 485.224",),
                applies_to_pathways=("vocational",),
                required_facts=("nominated_occupation", "skills_assessment_status"),
                optional_facts=("skills_assessment_application_date",),
                risk_facts=("skills_assessment_status",),
                source_queries=(
                    "485.224 skills assessment nominated occupation Subclass 485 vocational stream",
                    "Temporary Graduate visa vocational stream skills assessment applied obtained",
                ),
                source_classes=("485_skills_assessment", "485_vocational_485221_485224"),
                next_question="Have you applied for or obtained a skills assessment for your nominated occupation?",
                customer_explanation="The vocational stream is sensitive to skills-assessment evidence.",
            ),
            "485.vocational.occupation_relevance": CriterionNode(
                id="485.vocational.occupation_relevance",
                label="Qualification closely related to nominated occupation",
                layer="schedule2_grant",
                legal_basis=("Schedule 2 clause 485.224",),
                applies_to_pathways=("vocational",),
                required_facts=("nominated_occupation", "qualification_related_to_occupation"),
                source_queries=(
                    "485.224 qualification closely related to nominated occupation Subclass 485",
                    "Subclass 485 vocational qualification related nominated occupation refusal risk",
                ),
                source_classes=("485_occupation_relevance", "485_vocational_485221_485224"),
                next_question="What is your nominated occupation, and how is your qualification related to it?",
            ),
            "485.higher_education.degree": CriterionNode(
                id="485.higher_education.degree",
                label="Post-Higher Education Work stream degree pathway",
                layer="schedule2_grant",
                legal_basis=("Schedule 2 clause 485.231",),
                applies_to_pathways=("higher_education",),
                required_facts=("qualification_level", "course_completion_date", "course_cricos_registered"),
                optional_facts=("australian_study_requirement_met",),
                source_queries=(
                    "485.231 Post-Higher Education Work stream bachelor masters phd CRICOS",
                    "Subclass 485 higher education stream degree qualification Schedule 2 485.231",
                ),
                source_classes=("485_higher_education_485231", "485_requirements_overview"),
                next_question="Was your completed qualification a Bachelor, Masters, or PhD, and was the course CRICOS registered?",
            ),
            "485.higher_education.minister_instrument": CriterionNode(
                id="485.higher_education.minister_instrument",
                label="Minister-specified qualification restriction",
                layer="schedule2_grant",
                legal_basis=("Minister-specified qualification / post-2024 framework",),
                applies_to_pathways=("higher_education",),
                required_facts=("minister_specified_qualification_status",),
                optional_facts=("qualification_type",),
                source_queries=(
                    "Subclass 485 higher education qualification specified by Minister instrument",
                    "Temporary Graduate visa Post-Higher Education Work stream specified qualification instrument",
                ),
                source_classes=("485_minister_specified_qualification", "485_higher_education_485231"),
                next_question="Do you know whether your degree/qualification is covered by the current Minister-specified list or instrument?",
            ),
            "485.regional_extension": CriterionNode(
                id="485.regional_extension",
                label="Second or subsequent regional 485 pathway",
                layer="schedule2_grant",
                legal_basis=("Schedule 2 clauses 485.232-485.235",),
                applies_to_pathways=("regional_extension", "subsequent_regional"),
                required_facts=("previous_485_held", "regional_study_location", "regional_residence_duration"),
                optional_facts=("regional_work_or_study_duration", "intends_regional_residence"),
                source_queries=(
                    "485.232 485.233 485.234 485.235 second Post-Higher Education Work regional extension",
                    "Subclass 485 second post-higher education work visa regional centre designated regional area two years residence",
                ),
                source_classes=("485_second_regional_485232_485235", "485_regional_residence_requirement"),
                next_question="Did you hold a first 485 visa, and can you show at least two years of living/work/study in a regional area?",
            ),
            "485.replacement": CriterionNode(
                id="485.replacement",
                label="Replacement stream",
                layer="schedule2_grant",
                legal_basis=("Subclass 485 replacement stream",),
                applies_to_pathways=("replacement",),
                required_facts=("previous_485_held", "replacement_reason", "replacement_window"),
                source_queries=(
                    "Subclass 485 replacement stream previous temporary graduate visa disruption travel restrictions",
                    "Temporary Graduate visa replacement stream eligibility timeframe",
                ),
                source_classes=("485_replacement_stream", "485_requirements_overview"),
                next_question="Did you previously hold a 485 visa, and what disruption prevented you from using the full visa period?",
            ),
            "485.common.health_insurance": CriterionNode(
                id="485.common.health_insurance",
                label="Health insurance / visa condition dependency",
                layer="cross_subclass_dependency",
                legal_basis=("Health insurance / visa condition requirements",),
                required_facts=("health_insurance_status",),
                source_queries=(
                    "Subclass 485 health insurance requirement visa condition 8501",
                    "Temporary Graduate visa health insurance 8501",
                ),
                source_classes=("485_health_insurance", "conditions_guidance", "visa_condition_definition"),
                next_question="Do you currently have adequate health insurance for the relevant period?",
            ),
            "485.common.current_status": CriterionNode(
                id="485.common.current_status",
                label="Current visa and lawful-status dependency",
                layer="cross_subclass_dependency",
                legal_basis=("Current visa / bridging / lawful status context",),
                required_facts=("current_visa", "current_location"),
                optional_facts=("bridging_status", "onshore_offshore"),
                source_queries=(
                    "Subclass 485 current visa status bridging visa application in Australia",
                    "Temporary Graduate visa current visa applicant in Australia bridging status",
                ),
                source_classes=("bridging_travel", "lawful_status_after_refusal", "485_schedule1_application_requirements"),
                next_question="What visa do you currently hold, and are you currently in Australia?",
            ),
        }

    def _active_nodes_for_pathway(
        self,
        active_pathway: str,
        candidate_pathways: list[str],
        facts: dict[str, Any],
    ) -> list[CriterionNode]:
        ids = [
            "485.stream_selection",
            "485.schedule1.valid_application",
            "485.common.current_status",
            "485.common.application_window",
            "485.common.student_visa_study",
        ]

        if active_pathway == "vocational":
            ids.extend([
                "485.vocational.qualification",
                "485.vocational.skills_assessment",
                "485.vocational.occupation_relevance",
            ])
        elif active_pathway == "higher_education":
            ids.extend([
                "485.higher_education.degree",
                "485.higher_education.minister_instrument",
            ])
        elif active_pathway in {"regional_extension", "subsequent_regional"}:
            ids.extend(["485.regional_extension"])
        elif active_pathway == "replacement":
            ids.extend(["485.replacement"])
        else:
            # If unclear, do not activate every stream. Ask classification facts first.
            pass

        ids.append("485.common.health_insurance")
        return [self.nodes[item] for item in ids if item in self.nodes]

    # ------------------------------------------------------------------
    # Pathway and status helpers
    # ------------------------------------------------------------------
    def _candidate_pathways(self, question: str, facts: dict[str, Any]) -> list[str]:
        q = (question or "").lower()
        qualification = str(facts.get("qualification_level") or facts.get("qualification_type") or "").lower()
        first_or_subsequent = str(facts.get("first_485_or_subsequent") or "").lower()
        pathways: list[str] = []

        if "replacement" in q or facts.get("replacement_reason"):
            pathways.append("replacement")

        if (
            "second" in first_or_subsequent
            or "subsequent" in first_or_subsequent
            or facts.get("previous_485_held")
            or "regional" in q
            or facts.get("regional_study_location")
        ):
            pathways.append("regional_extension")

        if qualification in VOCATIONAL_TERMS or any(term in q for term in ["diploma", "trade", "associate degree", "vocational"]):
            pathways.append("vocational")

        if qualification in HIGHER_ED_TERMS or any(term in q for term in ["bachelor", "master", "masters", "phd", "degree", "higher education"]):
            pathways.append("higher_education")

        if not pathways:
            pathways.append("stream_selection")

        return self._unique(pathways)

    def _infer_user_goal(self, question: str) -> str:
        q = (question or "").lower()
        if any(term in q for term in ["refused", "refusal", "rejected"]):
            return "refusal_or_risk_review"
        if any(term in q for term in ["document", "checklist", "prepare"]):
            return "document_preparation"
        if any(term in q for term in ["which stream", "stream"]):
            return "stream_selection"
        if any(term in q for term in ["eligible", "eligibility", "can i apply", "requirements"]):
            return "eligibility_triage"
        if "replacement" in q:
            return "replacement_triage"
        if "regional" in q or "second" in q:
            return "regional_extension_triage"
        return "general_485_consultation"

    def _special_status(
        self,
        node: CriterionNode,
        facts: dict[str, Any],
    ) -> tuple[CriterionStatus | None, str | None, list[str]]:
        risks: list[str] = []

        if node.id == "485.vocational.skills_assessment":
            value = str(facts.get("skills_assessment_status") or "").lower()
            if value in {"no", "not_applied", "none", "not started", "not_started"}:
                return "risk", "Vocational-stream cases are high risk if skills assessment has not been applied for or obtained.", ["skills_assessment_missing"]
            if value in {"failed", "negative", "unsuccessful"}:
                return "failed", "The stated skills assessment outcome appears inconsistent with this criterion.", ["negative_skills_assessment"]

        if node.id == "485.vocational.occupation_relevance":
            value = facts.get("qualification_related_to_occupation")
            if value is False or str(value).lower() in {"no", "false", "not_related"}:
                return "risk", "Qualification/occupation mismatch is a common 485 vocational-stream refusal risk.", ["qualification_not_closely_related"]

        if node.id == "485.regional_extension":
            duration = self._duration_as_float(facts.get("regional_residence_duration"))
            if duration is not None and duration < 2:
                return "risk", "The known regional residence period appears below the two-year evidence target.", ["regional_residence_under_two_years"]

        if node.id == "485.higher_education.minister_instrument":
            value = str(facts.get("minister_specified_qualification_status") or "").lower()
            if value in {"not_listed", "no", "false"}:
                return "risk", "The qualification may not be covered by the current Minister-specified qualification framework.", ["minister_specified_qualification_issue"]

        return None, None, risks

    def _augment_facts_from_question(self, question: str, facts: dict[str, Any]) -> dict[str, Any]:
        q = (question or "").lower()

        if "485" in q or "temporary graduate" in q:
            facts.setdefault("visa_subclass", "485")
            facts.setdefault("visa_type", "temporary_graduate")

        if any(term in q for term in ["diploma", "advanced diploma"]):
            facts.setdefault("qualification_level", "diploma")
        elif "associate degree" in q:
            facts.setdefault("qualification_level", "associate_degree")
        elif "trade" in q:
            facts.setdefault("qualification_level", "trade")
        elif "bachelor" in q:
            facts.setdefault("qualification_level", "bachelor")
        elif "masters" in q or "master" in q:
            facts.setdefault("qualification_level", "masters")
        elif "phd" in q or "doctorate" in q:
            facts.setdefault("qualification_level", "phd")

        if any(term in q for term in ["second 485", "second temporary graduate", "regional extension"]):
            facts.setdefault("first_485_or_subsequent", "second_485")
            facts.setdefault("previous_485_held", True)
        elif any(term in q for term in ["first 485", "first temporary graduate"]):
            facts.setdefault("first_485_or_subsequent", "first_485")

        if "regional" in q:
            facts.setdefault("regional_history", True)
        if "replacement" in q:
            facts.setdefault("replacement_reason", "user_mentioned_replacement")

        return facts

    def _summary(self, active_pathway: str, criteria: list[CriterionAssessment], next_fact: str | None) -> str:
        status_parts = []
        for status in ["satisfied", "missing", "risk", "failed"]:
            count = sum(1 for item in criteria if item.status == status)
            if count:
                status_parts.append(f"{count} {status}")
        suffix = f" Next decisive fact: {next_fact}." if next_fact else ""
        return f"Subclass 485 schedule-aware assessment active. Current pathway: {active_pathway}. Criteria: {', '.join(status_parts) or 'no criteria'}." + suffix

    def _duration_as_float(self, value: Any) -> float | None:
        if value is None:
            return None
        if isinstance(value, (int, float)):
            return float(value)
        text = str(value).lower()
        match = re.search(r"(\d+(?:\.\d+)?)", text)
        return float(match.group(1)) if match else None

    def _unique(self, values: list[str]) -> list[str]:
        seen: set[str] = set()
        out: list[str] = []
        for value in values:
            if value not in seen:
                seen.add(value)
                out.append(value)
        return out
