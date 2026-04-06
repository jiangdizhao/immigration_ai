from __future__ import annotations

from datetime import date, datetime
from typing import Any

from pgvector.sqlalchemy import VECTOR
from sqlalchemy import JSON, Boolean, Date, DateTime, Float, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.config import get_settings
from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

settings = get_settings()


class LegalSource(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "legal_sources"

    title: Mapped[str] = mapped_column(String(500), nullable=False, index=True)
    source_type: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    authority: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    jurisdiction: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    citation_text: Mapped[str | None] = mapped_column(String(500), nullable=True)
    url: Mapped[str] = mapped_column(String(1000), nullable=False, unique=True)
    effective_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    repeal_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    document_version: Mapped[str | None] = mapped_column(String(100), nullable=True)
    language: Mapped[str] = mapped_column(String(16), default="en", nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="active", nullable=False, index=True)
    metadata_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)

    chunks: Mapped[list[SourceChunk]] = relationship(
        back_populates="source", cascade="all, delete-orphan"
    )
    cases: Mapped[list[Case]] = relationship(back_populates="primary_source")


class SourceChunk(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "source_chunks"

    source_id: Mapped[str] = mapped_column(ForeignKey("legal_sources.id", ondelete="CASCADE"), index=True)
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    section_ref: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    heading: Mapped[str | None] = mapped_column(String(500), nullable=True)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    token_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    embedding: Mapped[Any | None] = mapped_column(VECTOR(settings.embedding_dimension), nullable=True)
    metadata_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)

    source: Mapped[LegalSource] = relationship(back_populates="chunks")

    __table_args__ = (
        Index("ix_source_chunks_source_idx", "source_id", "chunk_index", unique=True),
    )


class Case(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "cases"

    title: Mapped[str] = mapped_column(String(500), nullable=False, index=True)
    neutral_citation: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    court: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    decision_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    url: Mapped[str] = mapped_column(String(1000), nullable=False, unique=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    primary_source_id: Mapped[str | None] = mapped_column(ForeignKey("legal_sources.id"), nullable=True)
    metadata_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)

    primary_source: Mapped[LegalSource | None] = relationship(back_populates="cases")


class Matter(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "matters"

    session_id: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    client_display_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    contact_email: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    issue_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="open", nullable=False, index=True)
    issue_type: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    visa_type: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    risk_level: Mapped[str | None] = mapped_column(String(50), nullable=True)
    last_user_message_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    metadata_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)

    intake_answers: Mapped[list[IntakeAnswer]] = relationship(
        back_populates="matter", cascade="all, delete-orphan"
    )
    citations: Mapped[list[Citation]] = relationship(back_populates="matter")


class IntakeAnswer(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "intake_answers"

    matter_id: Mapped[str] = mapped_column(ForeignKey("matters.id", ondelete="CASCADE"), index=True)
    question_key: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    question_label: Mapped[str | None] = mapped_column(String(255), nullable=True)
    answer_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    answer_json: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    source: Mapped[str] = mapped_column(String(50), default="widget", nullable=False)

    matter: Mapped[Matter] = relationship(back_populates="intake_answers")

    __table_args__ = (
        Index("ix_intake_answers_matter_question", "matter_id", "question_key", unique=True),
    )


class Citation(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "citations"

    matter_id: Mapped[str | None] = mapped_column(ForeignKey("matters.id"), nullable=True, index=True)
    source_id: Mapped[str] = mapped_column(ForeignKey("legal_sources.id"), nullable=False, index=True)
    chunk_id: Mapped[str | None] = mapped_column(ForeignKey("source_chunks.id"), nullable=True, index=True)
    case_id: Mapped[str | None] = mapped_column(ForeignKey("cases.id"), nullable=True, index=True)
    quote_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    rationale: Mapped[str | None] = mapped_column(Text, nullable=True)
    confidence_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    used_for: Mapped[str] = mapped_column(String(100), default="answer", nullable=False)

    matter: Mapped[Matter | None] = relationship(back_populates="citations")
    source: Mapped[LegalSource] = relationship()
    chunk: Mapped[SourceChunk | None] = relationship()
    case: Mapped[Case | None] = relationship()


__all__ = [
    "Case",
    "Citation",
    "IntakeAnswer",
    "LegalSource",
    "Matter",
    "SourceChunk",
]
