from typing import Any, Literal

from pydantic import Field, field_validator, model_validator

from app.core.config import get_settings
from app.schemas.common import BaseSchema
from app.schemas.agent import AIActionSuggestionV1
from app.schemas.source import CitationOut
from app.schemas.state import CaseHypothesis, FactSlotState, InteractionPlan, ConversationState

settings = get_settings()


class CustomerDocumentUnit(BaseSchema):
    ordinal: int = Field(ge=0)
    locator: dict[str, str | int] = Field(default_factory=dict, max_length=16)
    text: str = Field(min_length=1, max_length=6000)
    extractionMethod: str = Field(max_length=32)

    @field_validator("locator")
    @classmethod
    def bounded_locator(cls, value: dict[str, str | int]) -> dict[str, str | int]:
        if any(len(key) > 64 or (isinstance(item, str) and len(item) > 256) for key, item in value.items()):
            raise ValueError("customer document locator exceeds its bounds")
        return value


class CustomerDocumentEvidenceItem(BaseSchema):
    documentId: str = Field(min_length=1, max_length=64)
    runId: str = Field(min_length=1, max_length=64)
    originalFilename: str = Field(min_length=1, max_length=255)
    mimeType: str = Field(min_length=1, max_length=128)
    runStatus: Literal["complete", "partial", "needs_review"]
    extractionMethod: str = Field(max_length=32)
    truncated: bool
    includedUnitOrdinals: list[int] = Field(max_length=16)
    locators: list[dict[str, str | int]] = Field(max_length=16)
    units: list[CustomerDocumentUnit] = Field(min_length=1, max_length=16)

    @field_validator("locators")
    @classmethod
    def bounded_locators(cls, values: list[dict[str, str | int]]) -> list[dict[str, str | int]]:
        if any(
            len(key) > 64 or (isinstance(value, str) and len(value) > 256)
            for locator in values
            for key, value in locator.items()
        ):
            raise ValueError("customer document locator exceeds its bounds")
        return values


class CustomerDocumentEvidence(BaseSchema):
    documents: list[CustomerDocumentEvidenceItem] = Field(default_factory=list, max_length=8)

    @model_validator(mode="after")
    def bounded_packet(self):
        units = [unit for document in self.documents for unit in document.units]
        if len(units) > 64 or sum(len(unit.text) for unit in units) > 64000:
            raise ValueError("customer document evidence exceeds packet limits")
        for document in self.documents:
            if sum(len(unit.text) for unit in document.units) > 20000:
                raise ValueError("customer document exceeds packet limits")
            if len(document.includedUnitOrdinals) != len(document.units) or len(document.locators) != len(document.units):
                raise ValueError("customer document provenance must match included units")
            if document.includedUnitOrdinals != [unit.ordinal for unit in document.units]:
                raise ValueError("customer document ordinal manifest must match included units")
            if document.locators != [unit.locator for unit in document.units]:
                raise ValueError("customer document locator manifest must match included units")
        return self


# A long-lived conversation may legitimately hold far more files than one model
# turn can package. The counts are bounded only to keep a hostile or corrupt
# payload finite: they must never reject an ordinary legal question merely
# because the conversation's stored document count is large.
MAX_CUSTOMER_DOCUMENT_COUNT = 100_000


class CustomerDocumentSummary(BaseSchema):
    """Bounded availability of the conversation's uploaded customer files.

    This is control data for truthful answering, not evidence. It lets the
    backend distinguish "no files" from "files exist but no usable text was
    extracted", so an answer never implies it read a file whose extraction
    produced nothing. It carries counts and bounded filenames only, and it can
    never support or display a legal citation.

    ``total``/``usable`` describe *all* stored files of the conversation, while
    ``packaged`` describes the subset whose text was actually supplied to this
    turn's model call. The two must stay distinct: a conversation with 200
    usable files still packages at most a handful per turn.
    """

    total: int = Field(default=0, ge=0, le=MAX_CUSTOMER_DOCUMENT_COUNT)
    usable: int = Field(default=0, ge=0, le=MAX_CUSTOMER_DOCUMENT_COUNT)
    usableTruncated: int = Field(default=0, ge=0, le=MAX_CUSTOMER_DOCUMENT_COUNT)
    noUsableContent: int = Field(default=0, ge=0, le=MAX_CUSTOMER_DOCUMENT_COUNT)
    processing: int = Field(default=0, ge=0, le=MAX_CUSTOMER_DOCUMENT_COUNT)
    failed: int = Field(default=0, ge=0, le=MAX_CUSTOMER_DOCUMENT_COUNT)
    # Usable files actually packaged into this turn's evidence packet. ``None``
    # means an older sender that did not report it, which must not be rendered
    # as either full or partial packaging.
    packaged: int | None = Field(default=None, ge=0, le=MAX_CUSTOMER_DOCUMENT_COUNT)
    unusableFilenames: list[str] = Field(default_factory=list, max_length=3)

    @field_validator("unusableFilenames")
    @classmethod
    def bounded_filenames(cls, values: list[str]) -> list[str]:
        for value in values:
            if len(value) > 120:
                raise ValueError("customer document summary filename exceeds its bounds")
        return values

class ProjectContextFact(BaseSchema):
    assertion_id: str = Field(min_length=1, max_length=80)
    assertion_version: int = Field(ge=1)
    key: str = Field(min_length=1, max_length=128)
    value_type: Literal["string", "number", "boolean", "date", "json"]
    value: Any
    origin_kind: Literal["customer_stated", "document_extracted"]
    confirmed_by_user_id: str = Field(min_length=1, max_length=80)
    effective_from: str | None = Field(default=None, max_length=40)
    effective_to: str | None = Field(default=None, max_length=40)
    observed_at: str | None = Field(default=None, max_length=40)
    source_evidence_ref: str | None = Field(default=None, max_length=160)
    verification_label: Literal["customer-confirmed; not independently verified"]


class ProjectContextDocumentEvidence(BaseSchema):
    evidence_ref: str = Field(min_length=1, max_length=160)
    version_id: str = Field(min_length=1, max_length=255)
    run_id: str = Field(min_length=1, max_length=80)
    mime_type: str = Field(min_length=1, max_length=120)
    locator: dict[str, str | int] = Field(max_length=8)
    excerpt: str = Field(min_length=1, max_length=1500)
    content_untrusted: Literal[True]

    @field_validator("locator")
    @classmethod
    def bounded_locator(cls, locator: dict[str, str | int]) -> dict[str, str | int]:
        if any(
            len(key) > 64
            or (isinstance(value, str) and len(value) > 256)
            for key, value in locator.items()
        ):
            raise ValueError("Project document locator exceeds its bounds")
        return locator


class ProjectContextPacket(BaseSchema):
    schema_version: Literal["phase13.project-context.v1"]
    context_origin: Literal["project_chat"]
    project_id: str = Field(min_length=1, max_length=80)
    confirmed_project_facts: list[ProjectContextFact] = Field(default_factory=list, max_length=20)
    document_evidence: list[ProjectContextDocumentEvidence] = Field(default_factory=list, max_length=4)

    @model_validator(mode="after")
    def bounded_payload(self):
        import json
        if len(json.dumps(self.model_dump(mode="json"), ensure_ascii=False).encode("utf-8")) > 12_000:
            raise ValueError("Project context packet exceeds its byte bound")
        return self


class ActiveStepSourceRevisionPacket(BaseSchema):
    model_config = {"from_attributes": True, "extra": "forbid"}
    targetKind: Literal[
        "project", "school_application", "school_admission_case", "student500_application"
    ]
    targetId: str = Field(min_length=1, max_length=128)
    revision: int = Field(ge=0)


class ActiveStepTaskPacket(BaseSchema):
    model_config = {"from_attributes": True, "extra": "forbid"}
    applicability: Literal["applicable", "not_applicable", "unknown", "unavailable"]
    progress: Literal[
        "not_started", "in_progress", "needs_information", "waiting", "blocked", "completed", "unknown"
    ]
    reasonCodes: list[str] = Field(max_length=12)
    dependencies: list[str] = Field(max_length=8)
    actionability: Literal["read_only", "unavailable"]


class ActiveStepContextPacket(BaseSchema):
    """Bounded server-resolved task identity; contextual data, never authority."""

    model_config = {"from_attributes": True, "extra": "forbid"}
    schemaVersion: Literal["phase15.active-step-context.v1"]
    projectId: str = Field(min_length=1, max_length=80)
    chatId: str = Field(min_length=1, max_length=80)
    definitionVersion: Literal["phase15.project-workflows.v1"]
    taskId: str = Field(min_length=1, max_length=512)
    workflowKind: Literal[
        "project_planning", "school_application", "school_admissions", "student_500"
    ]
    stepKey: Literal[
        "project_goal", "workflow_scope", "source_coverage", "planning",
        "school_discovery", "academic_readiness", "language_preparation",
        "finance_documents", "statements_materials", "pre_submission",
        "admissions_planning", "admissions_requirements", "offer_coe_evidence",
        "external_handoff", "visa_planning", "study_evidence_coe",
        "genuine_student_preparation", "financial_capacity",
        "conditional_supporting_requirements", "pre_lodgement", "lodgement_events",
    ]
    targetKind: Literal[
        "project", "school_application", "school_admission_case", "student500_application"
    ]
    targetId: str = Field(min_length=1, max_length=128)
    task: ActiveStepTaskPacket
    sourceRevisions: list[ActiveStepSourceRevisionPacket] = Field(max_length=8)
    sourceCoverage: Literal["complete", "partial", "unavailable"]
    matter: dict[str, Any] | None = None

    @model_validator(mode="after")
    def bounded_identity(self):
        import json
        if len(json.dumps(self.model_dump(mode="json"), ensure_ascii=False, separators=(",", ":")).encode("utf-8")) > 2_000:
            raise ValueError("Active step context exceeds its byte bound")
        if self.targetKind == "project" and self.targetId != self.projectId:
            raise ValueError("Active project step target does not match Project")
        if self.matter is not None and self.matter.get("kind") != self.targetKind:
            raise ValueError("Active step matter identity mismatch")
        return self


class ProjectAssistantContextPacket(BaseSchema):
    """Server-derived M1 business state; customer data, not legal evidence."""

    schemaVersion: Literal["phase15.project-assistant-context.v1"]
    contextOrigin: Literal["project_chat"]
    availability: Literal["available", "unavailable"]
    reasonCode: str | None = Field(default=None, max_length=128)
    consistency: Literal["live_per_source_revision", "unknown"]
    project: dict[str, Any] | None = None
    capabilities: dict[str, Any] | None = None
    facts: dict[str, Any] | None = None
    factContext: dict[str, Any]
    indexes: dict[str, list[dict[str, Any]] | None]
    matters: dict[str, list[dict[str, Any]] | None]
    unresolvedIssues: list[dict[str, Any]] = Field(max_length=128)
    nextActions: list[dict[str, Any]] = Field(max_length=128)
    omissions: dict[str, int]
    activeStep: ActiveStepContextPacket | None = None

    @model_validator(mode="after")
    def bounded_payload(self):
        import json
        if len(json.dumps(self.model_dump(mode="json"), ensure_ascii=False, separators=(",", ":")).encode("utf-8")) > 24_000:
            raise ValueError("Project assistant context exceeds its byte bound")
        if self.activeStep is not None and self.project is not None:
            if self.activeStep.projectId != self.project.get("id"):
                raise ValueError("Active step Project does not match assistant context")
        expected_matters = {"schoolApplications", "standaloneAdmissions", "unresolvedLinkedAdmissions", "student500Applications"}
        expected_indexes = expected_matters | {"linkedAdmissions"}
        if set(self.matters) != expected_matters or set(self.indexes) != expected_indexes:
            raise ValueError("Invalid Project assistant matters")
        expected_omissions = expected_matters | {
            "unresolvedIssues", "nextActions", "linkedAdmissions", "admissionsCases"
        }
        if set(self.omissions) != expected_omissions or any(
            not isinstance(value, int) or isinstance(value, bool) or value < 0
            for value in self.omissions.values()
        ):
            raise ValueError("Invalid Project assistant omissions")
        limits = {
            "schoolApplications": 12,
            "linkedAdmissions": 12,
            "standaloneAdmissions": 16,
            "unresolvedLinkedAdmissions": 16,
            "student500Applications": 6,
        }
        if any(
            value is not None and len(value) > limits[key]
            for mapping in (self.matters, self.indexes)
            for key, value in mapping.items()
        ):
            raise ValueError("Project assistant matter count exceeds bound")

        if self.availability == "unavailable":
            if any(value is not None for value in self.indexes.values()) or any(
                value is not None for value in self.matters.values()
            ):
                raise ValueError("Unavailable Project context cannot expose partial matters")
            return self

        index_ids: dict[str, set[str]] = {}
        for key, index_rows in self.indexes.items():
            if key == "linkedAdmissions":
                continue
            detail_rows = self.matters[key]
            omission_count = self.omissions[key]
            if index_rows is None:
                if detail_rows is not None or omission_count:
                    raise ValueError("Unavailable source cannot present partial details")
                continue
            if detail_rows is None or len(index_rows) != len(detail_rows) + omission_count:
                raise ValueError("Project detail coverage does not match complete index")
            id_key = "applicationId" if key in {"schoolApplications", "student500Applications"} else "caseId"
            identities = [row.get(id_key) for row in index_rows]
            if any(not isinstance(identity, str) or not identity for identity in identities):
                raise ValueError("Project index identity is required")
            if len(set(identities)) != len(identities):
                raise ValueError("Project index identities must be unique")
            detail_identities = [row.get(id_key) for row in detail_rows]
            if any(identity not in identities for identity in detail_identities) or len(set(detail_identities)) != len(detail_identities):
                raise ValueError("Project details must resolve to unique indexed identities")
            if key == "student500Applications":
                indexed_places = {
                    row[id_key]: row["applicationPlace"]
                    for row in index_rows
                    if "applicationPlace" in row
                }
                if any(
                    row.get("applicationId") in indexed_places
                    and "applicationPlace" in row
                    and row["applicationPlace"]
                    != indexed_places[row["applicationId"]]
                    for row in detail_rows
                ):
                    raise ValueError("Student 500 application place does not match its index")
            index_ids[key] = set(identities)

        school_rows = self.indexes["schoolApplications"] or []
        linked_admission_rows = self.indexes["linkedAdmissions"] or []
        admissions_rows = [
            *linked_admission_rows,
            *(self.indexes["standaloneAdmissions"] or []),
            *(self.indexes["unresolvedLinkedAdmissions"] or []),
        ]
        student_rows = self.indexes["student500Applications"] or []
        allowed_application_places = {"onshore", "offshore", "unknown"}
        for rows in (
            student_rows,
            self.matters["student500Applications"] or [],
        ):
            for row in rows:
                if "applicationPlace" in row:
                    application_place = row["applicationPlace"]
                    if (
                        not isinstance(application_place, str)
                        or application_place not in allowed_application_places
                    ):
                        raise ValueError("Invalid Student 500 application place")
        if len(school_rows) > 12 or len(admissions_rows) > 16 or len(student_rows) > 6:
            raise ValueError("Project index exceeds M1 record limits")
        admission_ids = [row.get("caseId") for row in admissions_rows]
        if any(not isinstance(identity, str) or not identity for identity in admission_ids) or len(set(admission_ids)) != len(admission_ids):
            raise ValueError("Admissions index identities must be unique")
        linked_details = []
        for school in self.matters["schoolApplications"] or []:
            linked = school.get("linkedAdmissionsCase")
            if isinstance(linked, dict):
                linked_details.append(linked)
        detailed_admission_ids = {
            row.get("caseId")
            for row in [
                *(self.matters["standaloneAdmissions"] or []),
                *(self.matters["unresolvedLinkedAdmissions"] or []),
                *linked_details,
            ]
        }
        detailed_linked_admission_ids = {
            row.get("caseId") for row in linked_details
        }
        linked_admission_ids = {row.get("caseId") for row in linked_admission_rows}
        if not detailed_linked_admission_ids.issubset(linked_admission_ids):
            raise ValueError("Linked Admissions details must resolve to indexed identities")
        if self.omissions["linkedAdmissions"] != len(linked_admission_ids - detailed_linked_admission_ids):
            raise ValueError("Linked Admissions detail omission count is inaccurate")
        if not detailed_admission_ids.issubset(set(admission_ids)):
            raise ValueError("Admissions details must resolve to indexed identities")
        if self.omissions["admissionsCases"] != len(set(admission_ids) - detailed_admission_ids):
            raise ValueError("Admissions detail omission count is inaccurate")
        return self


class QueryRequest(BaseSchema):
    question: str = Field(min_length=1, max_length=4000)

    response_language: Literal["en", "zh"] | None = None
    matter_id: str | None = None
    session_id: str | None = None
    frontend_chat_id: str | None = None
    frontend_user_id: str | None = None
    #preferred_jurisdiction: str | None = Field(default="Cth")
    preferred_jurisdiction: str | None = Field(default=settings.canonical_jurisdiction)
    preferred_source_types: list[str] = Field(default_factory=list)
    intake_facts: dict[str, Any] = Field(default_factory=dict)
    # Facts belonging to the current guided submission.  ``None`` preserves
    # compatibility for direct/stale clients that only send intake_facts.
    current_intake_facts: dict[str, Any] | None = None
    top_k: int | None = Field(default=None, ge=1, le=20)
    answer_preference: Literal["auto", "answer_first", "continue_intake", "final_recommendation"] = "answer_first"
    # Public UI processing lane. The default keeps the full legal verification pipeline.
    # The premium lane is still pre-screened for politics-sensitive content, then answers
    # directly with a high-reasoning model without Schedule/RAG/source verification.
    assistant_mode: Literal[
        "fast",
        "default",
        "premium",
        "default_legal_pipeline",
        "premium_direct_gpt55_high",
    ] = "default_legal_pipeline"
    political_gate_version: str | None = Field(default=None, max_length=100)
    political_gate_decision_id: str | None = Field(default=None, max_length=255)
    client_turn_id: str | None = Field(default=None, max_length=255)
    # Optional full frontend-visible message history.
    frontend_messages: list[dict[str, Any]] = Field(default_factory=list)
    customer_document_evidence: CustomerDocumentEvidence = Field(default_factory=CustomerDocumentEvidence)
    # Bounded availability of the conversation's uploaded files. Not evidence:
    # it exists so an answer never claims to have read a file that produced no
    # usable extracted text. Absent (older/direct callers) means "unknown", which
    # must not be rendered as either availability or unavailability.
    customer_document_summary: CustomerDocumentSummary | None = None
    # Server-derived, permission-filtered Project facts/evidence. Clients may
    # not provide this field through the widget; the authenticated server path
    # constructs it. Older/direct callers omit it.
    project_context: ProjectContextPacket | None = None
    project_assistant_context: ProjectAssistantContextPacket | None = None

    @field_validator("question")
    @classmethod
    def question_must_not_be_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("question must not be blank")
        return value


class QueryResponse(BaseSchema):
    matter_id: str | None = None
    answer: str
    # ``customer_document_usage`` is the authoritative document-usage state;
    # ``customer_document_evidence_used`` is the strict boolean view of it and is
    # True only for a *verified* use. Availability, packaging or the mere
    # existence of an answer never makes either field claim that a file was read.
    customer_document_evidence_used: bool = False
    customer_document_usage: Literal[
        "not_supplied", "supplied_unconfirmed", "confirmed"
    ] = "not_supplied"
    # Bounded ids of the customer documents that the answering model *acknowledged*
    # relying on **and** that this request actually authorized. This is
    # acknowledgement-based provenance: the model's own report, validated against
    # this request's document manifest. It is **not** independent verification
    # that a document was read and it is not evidence for any legal claim. The
    # list is non-empty only for the "confirmed" state; serving paths without an
    # acknowledgement channel (Fast, Premium, legacy reasoning) always leave it
    # empty. Downstream consumers must still subset it against their own
    # request-scoped manifest and must never widen it into "every packaged file".
    customer_document_used_ids: list[str] = Field(default_factory=list, max_length=8)
    response_language: Literal["en", "zh"] = "en"
    # Emitted only by the typed Default AgentRuntime Project path after
    # request-context target validation. Fast and Premium leave it absent.
    ai_action_suggestion: AIActionSuggestionV1 | None = None
    # Present only when Default returned a validated, same-request source-bound
    # course research result. It is a display contract, never legal evidence or
    # business write authority.
    course_research_result: dict[str, Any] | None = None
    confidence: Literal["low", "medium", "high"]
    user_display_mode: Literal[
        "direct_short",
        "general_with_warning",
        "answer_then_ask",
        "ask_one_question",
        "escalate_with_brief_reason",
        "booking_handoff",
    ] | None = None
    issue_type: str | None = None
    missing_facts: list[str] = Field(default_factory=list)
    follow_up_questions: list[str] = Field(default_factory=list)
    citations: list[CitationOut] = Field(default_factory=list)
    compact_sources: list[str] = Field(default_factory=list)
    escalate: bool = False
    next_action: Literal["answer", "ask_followup", "suggest_consultation"]
    conversation_state: ConversationState | None = None
    case_hypothesis: CaseHypothesis | None = None
    fact_slot_states: list[FactSlotState] = Field(default_factory=list)
    interaction_plan: InteractionPlan | None = None
    legal_reasoning_trace: dict[str, Any] = Field(default_factory=dict)
    retrieval_debug: dict[str, Any] = Field(default_factory=dict)
    architecture_version: str | None = None
    research_status: Literal["not_required", "complete", "incomplete"] | None = None
    fact_check_status: Literal["not_required", "pass", "fix", "uncertain", "failed"] | None = None
    trace_id: str | None = None
