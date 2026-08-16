from __future__ import annotations

from datetime import date
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.agent import AgentClaim
from app.schemas.evidence import EvidenceRef


class StrictContract(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class LegalFactCheckInputV2(StrictContract):
    schema_version: Literal["legal_fact_check_input.v2"]
    draft_markdown: str = Field(min_length=1, max_length=50000)
    claims: list[AgentClaim] = Field(default_factory=list, max_length=100)
    evidence: list[EvidenceRef] = Field(default_factory=list, max_length=200)
    matter_facts: dict[str, Any]
    as_of_date: date


class FactCheckCorrection(StrictContract):
    claim_id: str = Field(min_length=1, max_length=100)
    operation: Literal["replace_span", "delete_span", "qualify_span"]
    start: int = Field(ge=0)
    end: int = Field(ge=0)
    original_text_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    original_claim: str = Field(min_length=1, max_length=8000)
    problem: str = Field(min_length=1, max_length=4000)
    replacement: str = Field(max_length=8000)
    evidence_refs: list[str] = Field(default_factory=list, max_length=30)

    @model_validator(mode="after")
    def validate_span(self):
        if self.end < self.start:
            raise ValueError("end must be greater than or equal to start")
        return self


class CitationAction(StrictContract):
    action: Literal["keep", "remove"]
    evidence_ref: str = Field(min_length=1, max_length=255)
    reason: str = Field(min_length=1, max_length=2000)


class LegalFactCheckResultV2(StrictContract):
    schema_version: Literal["legal_fact_check_result.v2"]
    status: Literal["pass", "fix", "uncertain"]
    corrections: list[FactCheckCorrection] = Field(default_factory=list, max_length=100)
    citation_actions: list[CitationAction] = Field(default_factory=list, max_length=100)
    confidence: Literal["low", "medium", "high"]
    escalate: bool

    @model_validator(mode="after")
    def validate_status(self):
        if self.status == "pass" and self.corrections:
            raise ValueError("PASS must not contain corrections")
        if self.status == "fix" and not self.corrections:
            raise ValueError("FIX must contain at least one correction")
        return self
