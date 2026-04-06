from datetime import date
from typing import Any

from pydantic import Field

from app.schemas.common import BaseSchema


class CitationOut(BaseSchema):
    source_id: str
    chunk_id: str | None = None
    case_id: str | None = None
    title: str
    authority: str
    citation_text: str | None = None
    section_ref: str | None = None
    url: str
    quote_text: str | None = None
    rationale: str | None = None
    confidence_score: float | None = None


class SourceChunkOut(BaseSchema):
    id: str
    chunk_index: int
    section_ref: str | None = None
    heading: str | None = None
    text: str
    token_count: int | None = None
    metadata_json: dict[str, Any] = Field(default_factory=dict)


class LegalSourceOut(BaseSchema):
    id: str
    title: str
    source_type: str
    authority: str
    jurisdiction: str
    citation_text: str | None = None
    url: str
    effective_date: date | None = None
    repeal_date: date | None = None
    document_version: str | None = None
    status: str
    metadata_json: dict[str, Any] = Field(default_factory=dict)
    chunks: list[SourceChunkOut] = Field(default_factory=list)
