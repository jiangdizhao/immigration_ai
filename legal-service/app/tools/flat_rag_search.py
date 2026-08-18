"""Phase 4B — Transitional flat-RAG search wrapper.

Wraps the EXISTING RetrievalService for Arm B evaluation and rollback.

This wrapper:
- Preserves current retrieval behavior/ranking as closely as practical
- Normalizes returned canonical chunks through CanonicalEvidenceService
- Registers actual evidence refs
- Is feature gated (default OFF)
- Is NOT visible to premium
- Does NOT coexist with LightRAG in primary benchmark
- Is NOT routing authority
- Does NOT silently change the assigned arm on failure

This is NOT a new retrieval architecture.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Any

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.schemas.query import QueryRequest
from app.services.canonical_evidence_service import CanonicalEvidenceService, CanonicalEvidenceError
from app.services.request_evidence_registry import RequestEvidenceRegistry
from app.services.retrieval_service import RetrievalService
from app.tools.base import ToolExecutionError

logger = logging.getLogger(__name__)
settings = get_settings()


@dataclass(slots=True)
class FlatRagResult:
    """Result from flat RAG search."""

    chunks: list[dict[str, Any]]  # Normalized chunk data
    evidence_refs: list[str]  # Registered evidence refs
    debug: dict[str, Any]  # Debug info from RetrievalService
    duration_ms: float


class FlatRagSearchTool:
    """Transitional wrapper around existing RetrievalService.

    Feature-gated: FLAT_RAG_TOOL_ENABLED must be true.
    Never visible to premium mode.
    """

    def __init__(
        self,
        db: Session,
        *,
        retrieval_service: RetrievalService | None = None,
    ) -> None:
        self._db = db
        self._retrieval_service = retrieval_service or RetrievalService()
        self._evidence_service = CanonicalEvidenceService(db)

    def is_enabled(self) -> bool:
        """Check if flat RAG tool is enabled."""
        return settings.flat_rag_tool_enabled

    def search(
        self,
        *,
        query: str,
        registry: RequestEvidenceRegistry,
        tool_call_id: str,
        top_k: int | None = None,
        preferred_source_types: list[str] | None = None,
    ) -> FlatRagResult:
        """Perform flat RAG search and normalize results.

        Preserves RetrievalService behavior while adding evidence refs.

        Args:
            query: Search query text.
            registry: Request-scoped evidence registry.
            tool_call_id: Tool call ID for evidence registration.
            top_k: Number of results (default from settings).
            preferred_source_types: Optional source type filter.

        Returns:
            FlatRagResult with normalized chunks and evidence refs.

        Raises:
            ToolExecutionError: If tool is disabled or search fails.
        """
        if not self.is_enabled():
            raise ToolExecutionError(
                code="FLAT_RAG_DISABLED",
                message="Flat RAG tool is not enabled",
            )

        start_time = time.monotonic()

        # Build QueryRequest for existing RetrievalService
        payload = QueryRequest(
            question=query,
            top_k=top_k or settings.default_top_k,
            preferred_source_types=preferred_source_types or [],
        )

        try:
            # Call existing RetrievalService (preserves behavior)
            source_chunks, debug = self._retrieval_service.retrieve(
                db=self._db,
                payload=payload,
            )
        except Exception as exc:
            logger.error("Flat RAG search failed: %s", exc)
            raise ToolExecutionError(
                code="RETRIEVAL_ERROR",
                message="Retrieval service error",
            ) from exc

        # Normalize chunks and register evidence
        normalized_chunks: list[dict[str, Any]] = []
        evidence_refs: list[str] = []

        for chunk in source_chunks:
            try:
                evidence, ref = self._evidence_service.build_evidence_from_chunk(
                    source_id=str(chunk.source_id),
                    chunk_id=str(chunk.id),
                    tool_call_id=tool_call_id,
                    registry=registry,
                )

                normalized_chunks.append({
                    "chunk_id": str(chunk.id),
                    "source_id": str(chunk.source_id),
                    "section_ref": chunk.section_ref,
                    "heading": chunk.heading,
                    "text_preview": chunk.text[:500] if chunk.text else "",
                    "evidence_ref": ref,
                })

                if ref:
                    evidence_refs.append(ref)

            except CanonicalEvidenceError as exc:
                logger.warning(
                    "Failed to build evidence for chunk %s: %s",
                    chunk.id,
                    exc.message,
                )
                continue

        duration_ms = (time.monotonic() - start_time) * 1000

        return FlatRagResult(
            chunks=normalized_chunks,
            evidence_refs=evidence_refs,
            debug=debug,
            duration_ms=duration_ms,
        )

    def search_parity(
        self,
        *,
        query: str,
        top_k: int | None = None,
    ) -> dict[str, Any]:
        """Perform search and return raw RetrievalService results for parity testing.

        Does NOT register evidence; used only for comparing wrapper vs original.
        """
        payload = QueryRequest(
            question=query,
            top_k=top_k or settings.default_top_k,
        )

        source_chunks, debug = self._retrieval_service.retrieve(
            db=self._db,
            payload=payload,
        )

        return {
            "chunk_ids": [str(chunk.id) for chunk in source_chunks],
            "source_ids": [str(chunk.source_id) for chunk in source_chunks],
            "section_refs": [chunk.section_ref for chunk in source_chunks],
            "debug": debug,
        }