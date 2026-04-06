from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.models import LegalSource, SourceChunk

settings = get_settings()


@dataclass(slots=True)
class IngestionResult:
    path: str
    inserted: bool
    source_id: str | None
    source_title: str
    chunk_count: int
    status: str
    message: str = ""


class IngestionService:
    def __init__(self, max_chunk_chars: int = 1200, soft_chunk_chars: int = 900) -> None:
        self.max_chunk_chars = max_chunk_chars
        self.soft_chunk_chars = soft_chunk_chars

    def ingest_json_file(self, db: Session, path: str | Path) -> IngestionResult:
        file_path = Path(path)
        payload = json.loads(file_path.read_text(encoding="utf-8"))
        result = self.ingest_source_payload(db, payload)
        result.path = str(file_path)
        return result

    def ingest_source_payload(self, db: Session, payload: dict[str, Any]) -> IngestionResult:
        self._validate_payload(payload)

        existing = db.scalar(select(LegalSource).where(LegalSource.url == payload["url"]))
        if existing is not None:
            return IngestionResult(
                path="",
                inserted=False,
                source_id=existing.id,
                source_title=existing.title,
                chunk_count=len(existing.chunks),
                status="skipped_existing",
                message="Source with same URL already exists.",
            )

        source = LegalSource(
            title=payload["title"],
            source_type=payload["source_type"],
            authority=payload["authority"],
            jurisdiction=payload.get("jurisdiction") or getattr(settings, "canonical_jurisdiction", "Cth"),
            citation_text=payload.get("citation_text"),
            url=payload["url"],
            effective_date=self._parse_date(payload.get("effective_date")),
            repeal_date=self._parse_date(payload.get("repeal_date")),
            document_version=payload.get("document_version"),
            language=payload.get("language", "en"),
            status=payload.get("status", "active"),
            metadata_json=payload.get("metadata_json") or {},
        )
        db.add(source)
        db.flush()

        chunks = self._build_chunks(source, payload)
        db.add_all(chunks)
        db.commit()

        return IngestionResult(
            path="",
            inserted=True,
            source_id=source.id,
            source_title=source.title,
            chunk_count=len(chunks),
            status="inserted",
            message="Source and chunks inserted.",
        )

    def _validate_payload(self, payload: dict[str, Any]) -> None:
        required_fields = ["title", "source_type", "authority", "url", "sections"]
        missing = [field for field in required_fields if not payload.get(field)]
        if missing:
            raise ValueError(f"Missing required fields: {', '.join(missing)}")

        if payload["source_type"] not in {"guidance", "legislation", "case"}:
            raise ValueError("source_type must be one of: guidance, legislation, case")

        sections = payload["sections"]
        if not isinstance(sections, list) or not sections:
            raise ValueError("sections must be a non-empty list")

        for idx, section in enumerate(sections):
            if not isinstance(section, dict):
                raise ValueError(f"Section {idx} must be an object")
            if not (section.get("text") or ""):
                raise ValueError(f"Section {idx} is missing text")

    def _build_chunks(self, source: LegalSource, payload: dict[str, Any]) -> list[SourceChunk]:
        base_metadata = payload.get("metadata_json") or {}
        chunks: list[SourceChunk] = []
        next_chunk_index = 0

        for section in payload["sections"]:
            heading = self._clean_text(section.get("heading"))
            section_ref = self._clean_text(section.get("section_ref"))
            section_text = self._clean_text(section.get("text", ""))
            if not section_text:
                continue

            for split_text in self._split_long_text(section_text):
                metadata = {
                    **base_metadata,
                    "source_type": source.source_type,
                    "jurisdiction": source.jurisdiction,
                    "authority": source.authority,
                    "source_title": source.title,
                    "section_ref": section_ref,
                    "heading": heading,
                    "document_version": source.document_version,
                    "effective_date": source.effective_date.isoformat() if source.effective_date else None,
                }
                chunks.append(
                    SourceChunk(
                        source_id=source.id,
                        chunk_index=next_chunk_index,
                        section_ref=section_ref,
                        heading=heading,
                        text=split_text,
                        token_count=self._estimate_token_count(split_text),
                        metadata_json=metadata,
                    )
                )
                next_chunk_index += 1

        return chunks

    def _split_long_text(self, text: str) -> list[str]:
        if len(text) <= self.max_chunk_chars:
            return [text]

        paragraphs = [self._clean_text(part) for part in re.split(r"\n{2,}", text) if self._clean_text(part)]
        if len(paragraphs) <= 1:
            paragraphs = self._split_by_sentences(text)

        chunks: list[str] = []
        current = ""

        for paragraph in paragraphs:
            candidate = paragraph if not current else f"{current}\n\n{paragraph}"
            if len(candidate) <= self.soft_chunk_chars:
                current = candidate
                continue

            if current:
                chunks.append(current)
                current = ""

            if len(paragraph) <= self.max_chunk_chars:
                current = paragraph
                continue

            forced_parts = self._force_split(paragraph)
            chunks.extend(forced_parts[:-1])
            current = forced_parts[-1]

        if current:
            chunks.append(current)

        return chunks or [text]

    def _split_by_sentences(self, text: str) -> list[str]:
        parts = re.split(r"(?<=[.!?])\s+", text)
        return [self._clean_text(part) for part in parts if self._clean_text(part)]

    def _force_split(self, text: str) -> list[str]:
        words = text.split()
        chunks: list[str] = []
        current_words: list[str] = []

        for word in words:
            tentative = " ".join(current_words + [word])
            if len(tentative) <= self.max_chunk_chars:
                current_words.append(word)
            else:
                if current_words:
                    chunks.append(" ".join(current_words))
                current_words = [word]

        if current_words:
            chunks.append(" ".join(current_words))

        return chunks

    def _clean_text(self, value: Any) -> str | None:
        if value is None:
            return None
        text = str(value)
        text = text.replace("\r\n", "\n").replace("\r", "\n")
        text = re.sub(r"[ \t]+", " ", text)
        text = re.sub(r"\n{3,}", "\n\n", text)
        text = text.strip()
        return text or None

    def _estimate_token_count(self, text: str) -> int:
        return len(text.split())

    def _parse_date(self, value: Any) -> date | None:
        if value in (None, ""):
            return None
        if isinstance(value, date):
            return value
        return date.fromisoformat(str(value))
