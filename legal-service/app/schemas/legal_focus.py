from __future__ import annotations

from typing import Any, Literal

from pydantic import Field

from app.schemas.common import BaseSchema


TurnPurpose = Literal[
    "new_legal_question",
    "fact_update",
    "answer_to_previous_question",
    "explicit_artifact_request",
    "explicit_booking_request",
    "topic_switch",
    "smalltalk",
    "unclear",
]

ArtifactType = Literal[
    "none",
    "lawyer_brief",
    "document_checklist",
    "draft_statement",
    "draft_email_or_message",
    "timeline_plan",
    "status_action_plan",
    "booking_handoff",
]

ExecutionPath = Literal[
    "legal_reasoning_pipeline",
    "legal_reasoning_then_artifact",
    "artifact_only",
    "triage_only",
]


class ArtifactRequest(BaseSchema):
    """Whether the latest user turn explicitly asks for a generated artifact.

    A pending offer is only a CTA. It must not become an executable artifact
    unless the latest user turn explicitly accepts or requests the artifact.
    """

    requested: bool = False
    artifact_type: ArtifactType = "none"
    explicit_acceptance: bool = False
    uses_pending_offer: bool = False
    reason: str | None = None


class VisaEntity(BaseSchema):
    """A persistent visa-related entity mentioned in the matter.

    A visa is not permanently active or background. It can play different roles
    in different focus frames.
    """

    entity_id: str
    subclass: str | None = None
    label: str | None = None
    aliases: list[str] = Field(default_factory=list)
    known_roles: list[str] = Field(default_factory=list)
    facts: dict[str, Any] = Field(default_factory=dict)
    source_turns: list[int] = Field(default_factory=list)
    confidence: Literal["low", "medium", "high"] = "medium"


class VisaEntityUpdate(BaseSchema):
    subclass: str | None = None
    merge_with_existing_entity: str | None = None
    label: str | None = None
    add_roles: list[str] = Field(default_factory=list)
    add_facts: dict[str, Any] = Field(default_factory=dict)
    confidence: Literal["low", "medium", "high"] = "medium"
    reason: str | None = None


class FocusEntityRole(BaseSchema):
    entity_id: str | None = None
    subclass: str | None = None
    role_in_this_focus: str
    reason: str | None = None


class LegalFocusFrame(BaseSchema):
    """Turn-specific legal focus.

    This is the current request's legal focus, not a permanent classification
    of the whole matter.
    """

    focus_id: str | None = None
    user_request_summary: str | None = None
    primary_visa_entity_id: str | None = None
    primary_subclass: str | None = None
    primary_role: str | None = None
    supporting_entities: list[FocusEntityRole] = Field(default_factory=list)
    candidate_focuses: list[dict[str, Any]] = Field(default_factory=list)
    issue_family: str | None = None
    operation: str | None = None
    suggested_case_frame_id: str | None = None
    schedule2_candidate_subclasses: list[str] = Field(default_factory=list)
    schedule1_relevance: Literal["none", "validity_check_needed", "deferred"] = "none"
    deferred_dependencies: list[str] = Field(default_factory=list)
    next_best_question: str | None = None
    answer_strategy: Literal[
        "answer_first_then_ask",
        "direct_answer",
        "escalate",
        "triage",
    ] = "answer_first_then_ask"
    confidence: Literal["low", "medium", "high"] = "medium"
    reason: str | None = None


class FullContextTurnResolution(BaseSchema):
    """Single full-context turn resolver output.

    The LLM may propose this object, but backend code uses it as a controlled
    contract. It keeps visa entities persistent and makes focus turn-specific.
    """

    response_language: Literal["en", "zh"] = "en"
    turn_purpose: TurnPurpose = "unclear"
    contains_substantive_new_facts: bool = False
    substantive_fact_keys: list[str] = Field(default_factory=list)
    visa_entities_update: list[VisaEntityUpdate] = Field(default_factory=list)
    current_focus: LegalFocusFrame = Field(default_factory=LegalFocusFrame)
    artifact_request: ArtifactRequest = Field(default_factory=ArtifactRequest)
    pending_offer_accepted: bool = False
    pending_offer_rejected_or_ignored: bool = False
    execution_path: ExecutionPath = "legal_reasoning_pipeline"
    force_schedule2_search: bool = True
    force_fact_merge_before_artifact: bool = True
    schedule2_candidates: list[dict[str, Any]] = Field(default_factory=list)
    new_fact_updates: dict[str, Any] = Field(default_factory=dict)
    reasons: list[str] = Field(default_factory=list)
    raw_model_output: dict[str, Any] = Field(default_factory=dict)

    @property
    def allow_early_task_execution(self) -> bool:
        """True only for explicit artifact requests that need no legal update."""

        return bool(
            self.artifact_request.requested
            and self.artifact_request.explicit_acceptance
            and self.execution_path == "artifact_only"
            and not self.contains_substantive_new_facts
        )

    def to_intake_facts(self) -> dict[str, Any]:
        """Project focus/entity information into current Matter facts.

        This helps older services align with the new focus model without
        requiring a full backend rewrite.
        """

        focus = self.current_focus
        out: dict[str, Any] = {
            "full_context_turn_purpose": self.turn_purpose,
            "full_context_execution_path": self.execution_path,
            "artifact_requested": self.artifact_request.requested,
            "artifact_type": self.artifact_request.artifact_type,
            "legal_focus_frame": focus.model_dump(),
            "visa_entity_updates": [item.model_dump() for item in self.visa_entities_update],
        }
        out.update(self.new_fact_updates or {})

        if focus.primary_subclass:
            out["active_focus_subclass"] = focus.primary_subclass
            out["target_visa_subclass"] = focus.primary_subclass
            # Existing services still use visa_subclass as a routing hint. Keep
            # the role-specific facts too so previous/current/refused visas are
            # not collapsed into one field.
            out["visa_subclass"] = focus.primary_subclass
        if focus.primary_role:
            out["active_focus_role"] = focus.primary_role
            if focus.primary_role in {"refused_application", "refused_visa", "post_decision_refusal"} and focus.primary_subclass:
                out["refused_visa_subclass"] = focus.primary_subclass
                out["applied_visa_subclass"] = focus.primary_subclass
                out["has_refusal"] = True
        if focus.operation:
            out["operation_type"] = focus.operation
        if focus.issue_family:
            out["issue_type"] = focus.issue_family
        if focus.suggested_case_frame_id:
            out["active_case_frame_id"] = focus.suggested_case_frame_id

        previous_subclasses: list[str] = []
        current_subclasses: list[str] = []
        for ent in focus.supporting_entities:
            role = ent.role_in_this_focus.lower()
            if ent.subclass and "previous" in role:
                previous_subclasses.append(ent.subclass)
            if ent.subclass and "current" in role:
                current_subclasses.append(ent.subclass)
        if previous_subclasses:
            out["previous_visa_subclasses"] = previous_subclasses
            if len(previous_subclasses) == 1:
                out["previous_visa_subclass"] = previous_subclasses[0]
        if current_subclasses:
            out["current_visa_subclasses"] = current_subclasses
            if len(current_subclasses) == 1:
                out["current_visa"] = current_subclasses[0]
        return out
