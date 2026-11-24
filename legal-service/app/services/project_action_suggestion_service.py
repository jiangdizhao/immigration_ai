"""Server-side binding for non-executing Project action suggestions.

The model supplies only a proposed field/value and optional textual reference.
The active task, authorized Project, Chat, target id, revisions and eventual
confirmation are derived by trusted application services.
"""

from __future__ import annotations

from typing import Any, Literal
import unicodedata

from app.schemas.agent import AIActionSuggestionV1
from app.schemas.query import ProjectAssistantContextPacket


SuggestionFieldPath = Literal[
    "schoolApplication.intakeLabel",
    "student500.applicationPlace",
]


def _normalized_reference(value: str) -> str:
    return unicodedata.normalize("NFKC", value).strip().casefold()


def project_action_suggestion_field_path(
    context: ProjectAssistantContextPacket | None,
    frontend_chat_id: str | None,
) -> SuggestionFieldPath | None:
    """Return the one supported field for a fresh, usable selected task."""

    if (
        context is None
        or context.contextOrigin != "project_chat"
        or context.availability != "available"
        or context.consistency != "live_per_source_revision"
        or context.project is None
        or context.project.get("status") != "active"
        or not frontend_chat_id
    ):
        return None
    active = context.activeStep
    if (
        active is None
        or active.chatId != frontend_chat_id
        or active.projectId != context.project.get("id")
    ):
        return None

    task_is_actionable = (
        active.task.applicability == "applicable"
        and active.task.actionability == "read_only"
    )
    if (
        active.workflowKind == "school_application"
        and active.stepKey == "school_discovery"
        and active.targetKind == "school_application"
    ):
        # The existing E3 preview service explicitly permits only this narrowly
        # scoped customer-reported intake edit even while course evidence is
        # unverified. Keep the suggestion eligibility aligned with that contract.
        intake_only = (
            active.task.applicability == "unavailable"
            and active.task.actionability == "unavailable"
            and active.task.reasonCodes == ["school_course_source_unverified"]
        )
        if (task_is_actionable and active.sourceCoverage == "complete") or (
            intake_only and active.sourceCoverage == "unavailable"
        ):
            return "schoolApplication.intakeLabel"
        return None

    if (
        active.workflowKind == "student_500"
        and active.stepKey == "visa_planning"
        and active.targetKind == "student500_application"
        and task_is_actionable
        and active.sourceCoverage == "complete"
    ):
        return "student500.applicationPlace"
    return None


def validate_project_action_suggestion(
    suggestion: AIActionSuggestionV1 | None,
    context: ProjectAssistantContextPacket | None,
    frontend_chat_id: str | None,
) -> AIActionSuggestionV1 | None:
    """Fail closed unless the suggestion matches one exact current target.

    ``target_reference`` is an ambiguity check only. This function never uses
    model text to choose a target or issue authority.
    """

    field_path = project_action_suggestion_field_path(context, frontend_chat_id)
    if (
        not isinstance(suggestion, AIActionSuggestionV1)
        or field_path is None
        or suggestion.field_path != field_path
    ):
        return None
    assert context is not None and context.activeStep is not None
    active = context.activeStep
    if context.project is None or active.targetKind not in {
        "school_application",
        "student500_application",
    }:
        return None

    is_school = active.targetKind == "school_application"
    index_key = "schoolApplications" if is_school else "student500Applications"
    rows = context.indexes.get(index_key)
    if rows is None:
        return None
    id_key = "applicationId"
    matching_target_rows = [
        row for row in rows if row.get(id_key) == active.targetId
    ]
    if len(matching_target_rows) != 1:
        return None
    row = matching_target_rows[0]
    target_revisions = [
        revision
        for revision in active.sourceRevisions
        if revision.targetKind == active.targetKind
        and revision.targetId == active.targetId
    ]
    if (
        len(target_revisions) != 1
        or row.get("provenanceRevision") != target_revisions[0].revision
    ):
        return None

    # When more than one record could be selected, require a model reference
    # that exactly identifies one current record and matches the server-selected
    # target. Institution names that occur on multiple school rows are ambiguous.
    reference = suggestion.target_reference
    if len(rows) > 1 and not reference:
        return None
    if reference:
        normalized = _normalized_reference(reference)
        matching_references: list[dict[str, Any]] = []
        for candidate in rows:
            identities = [candidate.get(id_key)]
            if is_school:
                identities.append(candidate.get("institutionName"))
            if any(
                isinstance(identity, str)
                and _normalized_reference(identity) == normalized
                for identity in identities
            ):
                matching_references.append(candidate)
        if (
            len(matching_references) != 1
            or matching_references[0].get(id_key) != active.targetId
        ):
            return None
    return suggestion
