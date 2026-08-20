from __future__ import annotations

from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


SourceType = Literal[
    "legislation",
    "legislative_instrument",
    "court_decision",
    "tribunal_decision",
    "official_guidance",
    "explanatory_material",
    "secondary_commentary",
    "internal_guidance",
    "web_page",
]
SourceAuthenticity = Literal[
    "canonical_official",
    "official_copy",
    "verified_secondary_copy",
    "unverified",
]
AuthorityKind = Literal[
    "statute",
    "delegated_legislation",
    "binding_precedent",
    "persuasive_decision",
    "administrative_decision",
    "operational_guidance",
    "explanatory",
    "commentary",
    "derived_relationship",
]
BindingStatus = Literal["binding", "persuasive", "non_binding", "not_applicable", "unknown"]
CourtOrTribunalLevel = Literal["HCA", "FCAFC", "FCA", "FCFCOA", "ART", "other"]


class StrictContract(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class NativeWebCitation(StrictContract):
    start_index: int = Field(ge=0)
    end_index: int = Field(ge=0)

    @model_validator(mode="after")
    def validate_span(self):
        if self.end_index < self.start_index:
            raise ValueError("end_index must be greater than or equal to start_index")
        return self


class EvidenceRefBase(StrictContract):
    evidence_ref: str = Field(min_length=3, max_length=255)
    source_type: SourceType
    source_authenticity: SourceAuthenticity
    authority_kind: AuthorityKind
    jurisdiction: Literal["Cth", "other"] | None
    binding_status: BindingStatus
    court_or_tribunal_level: CourtOrTribunalLevel | None
    retrieved_at: datetime
    provenance_complete: bool


class CanonicalLocalEvidenceRef(EvidenceRefBase):
    evidence_origin: Literal["canonical_local"]
    evidence_ref: str = Field(pattern=r"^exact:[A-Za-z0-9._~-]+$", max_length=255)
    canonical_source_id: str = Field(min_length=1, max_length=255)
    canonical_chunk_id: str | None = Field(default=None, min_length=1, max_length=255)
    document_id: str = Field(min_length=1, max_length=500)
    document_version: str | None = Field(default=None, min_length=1, max_length=255)
    provision_or_span: str = Field(min_length=1, max_length=1000)
    effective_from: date | None = None
    effective_to: date | None = None
    canonical_url: str | None = Field(default=None, pattern=r"^https://", max_length=2000)
    content_hash: str = Field(pattern=r"^[0-9a-f]{64}$")
    text: str = Field(min_length=1, max_length=20000)

    @model_validator(mode="after")
    def validate_effective_interval(self):
        if self.effective_from and self.effective_to and self.effective_to < self.effective_from:
            raise ValueError("effective_to must not precede effective_from")
        return self


class NativeWebEvidenceRef(EvidenceRefBase):
    evidence_origin: Literal["openai_web_native"]
    evidence_ref: str = Field(pattern=r"^web:[A-Za-z0-9._~-]+$", max_length=255)
    search_call_id: str = Field(min_length=1, max_length=255)
    url: str = Field(pattern=r"^https://", max_length=2000)
    title: str = Field(min_length=1, max_length=1000)
    # A sources-list record can be genuine provider evidence even when the
    # provider did not emit an inline citation annotation for that URL.  The
    # evidence postcondition still requires this field for a decisive claim;
    # keeping it optional lets the registry preserve the real source metadata
    # without manufacturing a citation span.
    native_web_citation: NativeWebCitation | None = None
    canonical_source_id: str | None = Field(default=None, min_length=1, max_length=255)
    document_version: str | None = Field(default=None, min_length=1, max_length=255)
    effective_from: date | None = None
    effective_to: date | None = None
    text: None = None
    content_hash: None = None

    @model_validator(mode="after")
    def validate_effective_interval(self):
        if self.effective_from and self.effective_to and self.effective_to < self.effective_from:
            raise ValueError("effective_to must not precede effective_from")
        return self


class FetchedWebEvidenceRef(EvidenceRefBase):
    """A separately fetched bounded web span; native search alone cannot create this record."""

    evidence_origin: Literal["fetched_web"]
    evidence_ref: str = Field(pattern=r"^web:[A-Za-z0-9._~-]+$", max_length=255)
    fetch_call_id: str = Field(min_length=1, max_length=255)
    url: str = Field(pattern=r"^https://", max_length=2000)
    title: str = Field(min_length=1, max_length=1000)
    canonical_source_id: str | None = Field(default=None, min_length=1, max_length=255)
    document_version: str | None = Field(default=None, min_length=1, max_length=255)
    provision_or_span: str = Field(min_length=1, max_length=1000)
    effective_from: date | None = None
    effective_to: date | None = None
    text: str = Field(min_length=1, max_length=20000)
    content_hash: str = Field(pattern=r"^[0-9a-f]{64}$")

    @model_validator(mode="after")
    def validate_effective_interval(self):
        if self.effective_from and self.effective_to and self.effective_to < self.effective_from:
            raise ValueError("effective_to must not precede effective_from")
        return self


EvidenceRef = Annotated[
    CanonicalLocalEvidenceRef | NativeWebEvidenceRef | FetchedWebEvidenceRef,
    Field(discriminator="evidence_origin"),
]
