"""Optional, non-authoritative course research returned by Default.

The provider's object is deliberately treated as an untrusted suggestion.  The
serving adapter validates each candidate independently and binds all links to
the still-live request evidence registry before returning anything to the UI.
"""

from __future__ import annotations

import json
from typing import Literal
from urllib.parse import urlsplit

from pydantic import Field, field_validator, model_validator

from app.schemas.agent import StrictContract


CourseResearchFieldKey = Literal[
    "qualification",
    "campus_location",
    "course_code",
    "cricos_code",
    "duration",
    "tuition_amount",
    "tuition_currency",
    "tuition_fee_basis",
    "intake",
    "entry_requirements_summary",
]


def _validate_public_https_locators(values: list[str]) -> list[str]:
    for value in values:
        try:
            parts = urlsplit(value)
            port = parts.port
        except ValueError as exc:
            raise ValueError("source locator must be public HTTPS") from exc
        if (
            len(value) > 2_000
            or parts.scheme.lower() != "https"
            or not parts.hostname
            or parts.username
            or parts.password
            or (port is not None and port != 443)
        ):
            raise ValueError("source locator must be public HTTPS")
    return values


class CourseResearchFieldSuggestionV1(StrictContract):
    key: CourseResearchFieldKey
    value: str | None = Field(max_length=500)
    source_locators: list[str] = Field(default_factory=list, max_length=6)
    applicability_note: str | None = Field(default=None, max_length=240)

    @field_validator("source_locators")
    @classmethod
    def valid_source_locators(cls, values: list[str]) -> list[str]:
        return _validate_public_https_locators(values)

    @field_validator("value")
    @classmethod
    def normalize_blank_value(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None

    @field_validator("applicability_note")
    @classmethod
    def normalize_applicability_note(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None


class CourseResearchCandidateSuggestionV1(StrictContract):
    institution_name: str = Field(min_length=1, max_length=200)
    course_title: str = Field(min_length=1, max_length=240)
    identity_source_locators: list[str] = Field(default_factory=list, max_length=6)
    fields: list[CourseResearchFieldSuggestionV1] = Field(default_factory=list, max_length=12)
    source_locators: list[str] = Field(default_factory=list, max_length=6)
    limitations: list[str] = Field(default_factory=list, max_length=6)

    @field_validator("institution_name", "course_title")
    @classmethod
    def normalize_identity_text(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("course candidate identity cannot be blank")
        return normalized

    @field_validator("identity_source_locators", "source_locators")
    @classmethod
    def valid_candidate_locators(cls, values: list[str]) -> list[str]:
        return _validate_public_https_locators(values)

    @field_validator("limitations")
    @classmethod
    def bounded_limitations(cls, values: list[str]) -> list[str]:
        if any(not value.strip() or len(value) > 240 for value in values):
            raise ValueError("candidate limitation exceeds its bounds")
        return [value.strip() for value in values]

    @model_validator(mode="after")
    def unique_fields_and_bytes(self):
        keys = [field.key for field in self.fields]
        if len(keys) != len(set(keys)):
            raise ValueError("candidate fields must use unique keys")
        if len(json.dumps(self.model_dump(mode="json"), ensure_ascii=False).encode("utf-8")) > 8_000:
            raise ValueError("candidate exceeds its byte bound")
        return self


class CourseResearchSuggestionV1(StrictContract):
    schema_version: Literal["phase15.course-research-suggestion.v1"]
    # Additive within the existing v1 envelope: old persisted/provider-shaped
    # fixtures without this field remain readable as `completed`, while the
    # current enabled provider contract requires the field explicitly.
    research_status: Literal["not_performed", "completed"] = "completed"
    candidates: list[CourseResearchCandidateSuggestionV1] = Field(max_length=6)

    @model_validator(mode="after")
    def status_matches_candidates(self):
        if self.research_status == "not_performed" and self.candidates:
            raise ValueError("not_performed cannot include course candidates")
        return self

    @model_validator(mode="after")
    def total_bytes(self):
        if len(json.dumps(self.model_dump(mode="json"), ensure_ascii=False).encode("utf-8")) > 48_000:
            raise ValueError("course research suggestion exceeds its byte bound")
        return self
