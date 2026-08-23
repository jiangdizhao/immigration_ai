from __future__ import annotations

from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.evidence import CanonicalLocalEvidenceRef, NativeWebCitation, NativeWebEvidenceRef


class StrictContract(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class ToolError(StrictContract):
    code: str = Field(min_length=1, max_length=100)
    message: str = Field(min_length=1, max_length=1000)


class ToolResultMeta(StrictContract):
    duration_ms: float = Field(ge=0)
    cache_hit: bool
    observed_at: datetime
    corpus_version: str | None = Field(default=None, max_length=255)


class ToolResultEnvelope(StrictContract):
    tool_call_id: str = Field(min_length=1, max_length=255)
    status: Literal["ok", "partial", "unavailable", "invalid_request", "timeout", "error"]
    data: dict[str, Any]
    warnings: list[str] = Field(default_factory=list, max_length=50)
    error: ToolError | None = None
    meta: ToolResultMeta

    @model_validator(mode="after")
    def validate_error_state(self):
        if self.status in {"invalid_request", "timeout", "error"} and self.error is None:
            raise ValueError("error details are required for failed tool results")
        if self.status == "ok" and self.error is not None:
            raise ValueError("successful tool results must not include an error")
        return self


class WebCitationAnnotation(NativeWebCitation):
    evidence_ref: str = Field(pattern=r"^web:[A-Za-z0-9._~-]+$", max_length=255)


class WebSearchSource(NativeWebEvidenceRef):
    domain: str = Field(min_length=1, max_length=255)


class WebSearchOutput(StrictContract):
    call_id: str = Field(min_length=1, max_length=255)
    status: Literal["completed", "failed"]
    queries: list[str] = Field(default_factory=list, max_length=20)
    sources: list[WebSearchSource] = Field(default_factory=list, max_length=100)
    citation_annotations: list[WebCitationAnnotation] = Field(default_factory=list, max_length=100)


class ExactLegalLookupRequest(StrictContract):
    query: str | None = Field(default=None, max_length=2000)
    document_id: str | None = Field(default=None, max_length=500)
    source_types: list[str] = Field(default_factory=list, max_length=20)
    schedule: str | None = Field(default=None, max_length=100)
    provision: str | None = Field(default=None, max_length=255)
    case_citation: str | None = Field(default=None, max_length=500)
    subclass: str | None = Field(default=None, max_length=50)
    as_of_date: date
    follow_cross_references: bool = True
    max_hits: int = Field(default=8, ge=1, le=20)

    @model_validator(mode="after")
    def validate_locator(self):
        if not any(
            [self.query, self.document_id, self.schedule, self.provision, self.case_citation, self.subclass]
        ):
            raise ValueError("at least one query or locator field is required")
        return self


class ExactLegalLookupBatchItem(StrictContract):
    """Model-supplied locator for the bounded Arm-N exact lookup batch.

    The request date is deliberately backend-owned.  The tool executor adds
    the current request's ``as_of_date`` before constructing the existing
    ``ExactLegalLookupRequest`` used by ``ExactLegalSourceService``.
    """

    query: str | None = Field(default=None, max_length=2000)
    document_id: str | None = Field(default=None, max_length=500)
    source_types: list[str] = Field(default_factory=list, max_length=20)
    # Optional structured metadata emitted by the navigation/model adapter.
    # These fields are normalized into the existing ExactLegalLookupRequest;
    # they are not a second exact-lookup contract.
    source_type: str | None = Field(default=None, max_length=100)
    locator_type: str | None = Field(default=None, max_length=100)
    locator: str | None = Field(default=None, max_length=2000)
    target_document: str | None = Field(default=None, max_length=500)
    node_type: str | None = Field(default=None, max_length=100)
    provision_ref: str | None = Field(default=None, max_length=255)
    schedule: str | None = Field(default=None, max_length=100)
    provision: str | None = Field(default=None, max_length=255)
    case_citation: str | None = Field(default=None, max_length=500)
    subclass: str | None = Field(default=None, max_length=50)
    follow_cross_references: bool = True
    max_hits: int = Field(default=8, ge=1, le=20)

    @model_validator(mode="after")
    def validate_locator(self):
        if not any(
            isinstance(value, str) and value.strip()
            for value in [
                self.query,
                self.document_id,
                self.source_type,
                self.locator_type,
                self.locator,
                self.target_document,
                self.node_type,
                self.provision_ref,
                self.schedule,
                self.provision,
                self.case_citation,
                self.subclass,
            ]
        ):
            raise ValueError("at least one query or locator field is required")
        return self


class ExactLegalLookupBatchRequest(StrictContract):
    requests: list[ExactLegalLookupBatchItem] = Field(min_length=1, max_length=8)


class Schedule2NavigationRequest(StrictContract):
    """One read-only structural query against the Schedule-2 sidecar."""

    operation: Literal["subclass_map", "provision_context", "follow_references"]
    subclass: str | None = Field(default=None, max_length=20)
    provision_ref: str | None = Field(default=None, max_length=255)
    max_targets: int = Field(default=20, ge=1, le=30)

    @model_validator(mode="after")
    def validate_target(self):
        if self.operation == "subclass_map" and not self.subclass:
            raise ValueError("subclass_map requires subclass")
        if self.operation != "subclass_map" and not self.provision_ref:
            raise ValueError(f"{self.operation} requires provision_ref")
        return self


class Schedule2NavigationBatchRequest(StrictContract):
    requests: list[Schedule2NavigationRequest] = Field(min_length=1, max_length=8)


class ExactLegalMatch(StrictContract):
    canonical_evidence_ref: CanonicalLocalEvidenceRef
    match_type: Literal["exact", "normalized", "fuzzy"]


class ResolvedCrossReference(StrictContract):
    locator: str = Field(min_length=1, max_length=500)
    evidence_refs: list[str] = Field(min_length=1, max_length=30)


class CorpusCoverage(StrictContract):
    family: str = Field(min_length=1, max_length=500)
    status: Literal["available_complete", "available_partial", "absent", "unknown"]
    report_version: str = Field(min_length=1, max_length=255)
    gap_reason: str | None = Field(default=None, max_length=1000)


class ExactLegalLookupOutput(StrictContract):
    matches: list[ExactLegalMatch] = Field(default_factory=list, max_length=20)
    resolved_cross_references: list[ResolvedCrossReference] = Field(default_factory=list, max_length=50)
    unresolved_cross_references: list[str] = Field(default_factory=list, max_length=50)
    coverage: CorpusCoverage
    corpus_version: str = Field(min_length=1, max_length=255)
    index_version: str = Field(min_length=1, max_length=255)


class LightRAGSearchRequest(StrictContract):
    query: str = Field(min_length=1, max_length=2000)
    mode: Literal["local", "global", "hybrid", "mix"]
    as_of_date: date | None = None
    focus_entities: list[str] = Field(default_factory=list, max_length=20)
    max_entities: int = Field(default=12, ge=1, le=50)
    max_relationships: int = Field(default=20, ge=1, le=100)
    max_chunks: int = Field(default=8, ge=1, le=20)


class LightRAGEntity(StrictContract):
    entity_id: str = Field(min_length=1, max_length=255)
    name: str = Field(min_length=1, max_length=500)
    type: str = Field(min_length=1, max_length=255)
    description: str = Field(max_length=4000)
    source_refs: list[str] = Field(default_factory=list, max_length=50)


class LightRAGRelationship(StrictContract):
    relationship_id: str = Field(min_length=1, max_length=255)
    from_entity_id: str = Field(min_length=1, max_length=255)
    to_entity_id: str = Field(min_length=1, max_length=255)
    type: str = Field(min_length=1, max_length=255)
    description: str = Field(max_length=4000)
    source_refs: list[str] = Field(default_factory=list, max_length=50)


class LightRAGChunk(StrictContract):
    canonical_evidence_ref: CanonicalLocalEvidenceRef


class LightRAGSearchOutput(StrictContract):
    entities: list[LightRAGEntity] = Field(default_factory=list)
    relationships: list[LightRAGRelationship] = Field(default_factory=list)
    chunks: list[LightRAGChunk] = Field(default_factory=list)
    provenance_complete: bool
    workspace: str = Field(min_length=1, max_length=255)
    index_version: str = Field(min_length=1, max_length=255)
    extractor_version: str = Field(min_length=1, max_length=255)
    embedding_profile: str = Field(min_length=1, max_length=255)


class DeterministicUtilityRequest(StrictContract):
    operation: Literal["arithmetic", "percentage", "date_add", "date_difference", "unit_convert"]
    operands: list[Any] = Field(min_length=1, max_length=20)
    expression: str | None = Field(default=None, max_length=500)
    calendar: Literal["calendar_days", "business_days"] = "calendar_days"
    timezone: Literal["Australia/Sydney"] = "Australia/Sydney"
    rounding: Literal["none", "floor", "ceil", "half_up"] = "none"
    precision: int = Field(default=2, ge=0, le=12)


class DeterministicUtilityOutput(StrictContract):
    result_type: Literal["number", "date", "duration", "unit_value"]
    result: Any
    normalized_inputs: list[Any] = Field(default_factory=list, max_length=20)
    assumptions: list[str] = Field(default_factory=list, max_length=20)
    timezone: Literal["Australia/Sydney"] = "Australia/Sydney"
    calculation_trace: str = Field(min_length=1, max_length=1000)
    utility_version: str = Field(min_length=1, max_length=255)


class SubmitAnswerAccepted(StrictContract):
    accepted: Literal[True]
    submission_id: str = Field(min_length=1, max_length=255)
    postcondition_status: Literal["passed", "not_required", "integrity_passed"]
    errors: list[dict[str, Any]] = Field(default_factory=list, max_length=0)


class SubmissionError(StrictContract):
    code: str = Field(min_length=1, max_length=100)
    field: str = Field(min_length=1, max_length=500)
    affected_claim_ids: list[str] = Field(default_factory=list, max_length=100)


class SubmitAnswerRejected(StrictContract):
    accepted: Literal[False]
    submission_id: str | None = Field(default=None, max_length=255)
    postcondition_status: Literal["failed"]
    errors: list[SubmissionError] = Field(min_length=1, max_length=100)
