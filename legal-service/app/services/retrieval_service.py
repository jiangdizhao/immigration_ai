from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

from sqlalchemy import Select, or_, select
from sqlalchemy.orm import Session, joinedload

from app.core.config import get_settings
from app.db.models import LegalSource, SourceChunk
from app.schemas.query import QueryRequest
from app.services.embedding_service import EmbeddingService

settings = get_settings()


@dataclass(slots=True)
class _Candidate:
    chunk: SourceChunk
    vector_rank: int | None = None
    keyword_rank: int | None = None
    vector_distance: float | None = None


class RetrievalService:
    def __init__(self, embedding_service: EmbeddingService | None = None) -> None:
        self.embedding_service = embedding_service or EmbeddingService()
        self.rrf_k = 60
        self.vector_candidate_multiplier = 4
        self.keyword_candidate_multiplier = 4
        self.max_term_count = 8

    def retrieve(self, db: Session, payload: QueryRequest) -> tuple[list[SourceChunk], dict[str, object]]:
        top_k = payload.top_k or settings.default_top_k
        candidate_k = max(top_k * self.vector_candidate_multiplier, top_k)
        query_text = payload.question.strip()
        terms = self._extract_terms(query_text)

        base_stmt = self._build_base_stmt(payload)

        vector_rows: list[tuple[SourceChunk, float]] = []
        keyword_chunks: list[SourceChunk] = []
        query_embedding: list[float] | None = None

        has_embeddings = self._has_embeddings(db, payload)

        if has_embeddings:
            query_embedding = self.embedding_service.embed_text(query_text)
            vector_rows = self._run_vector_search(
                db=db,
                base_stmt=base_stmt,
                query_embedding=query_embedding,
                limit=candidate_k,
            )

        if terms:
            keyword_chunks = self._run_keyword_search(
                db=db,
                base_stmt=base_stmt,
                terms=terms,
                limit=max(top_k * self.keyword_candidate_multiplier, top_k),
            )

        fused_chunks, debug = self._fuse_results(
            vector_rows=vector_rows,
            keyword_chunks=keyword_chunks,
            top_k=top_k,
            matched_terms=terms,
            has_embeddings=has_embeddings,
            query_embedding=query_embedding,
        )

        return fused_chunks, debug

    def _build_base_stmt(self, payload: QueryRequest) -> Select[tuple[SourceChunk]]:
        stmt: Select[tuple[SourceChunk]] = (
            select(SourceChunk)
            .join(LegalSource, LegalSource.id == SourceChunk.source_id)
            .options(joinedload(SourceChunk.source))
            .where(LegalSource.status == "active")
        )

        preferred_jurisdiction = payload.preferred_jurisdiction or settings.canonical_jurisdiction
        if preferred_jurisdiction:
            stmt = stmt.where(LegalSource.jurisdiction == preferred_jurisdiction)

        if payload.preferred_source_types:
            stmt = stmt.where(LegalSource.source_type.in_(payload.preferred_source_types))

        return stmt

    def _has_embeddings(self, db: Session, payload: QueryRequest) -> bool:
        stmt = self._build_base_stmt(payload).where(SourceChunk.embedding.is_not(None)).limit(1)
        return db.scalar(stmt) is not None

    def _run_vector_search(
        self,
        db: Session,
        base_stmt: Select[tuple[SourceChunk]],
        query_embedding: list[float],
        limit: int,
    ) -> list[tuple[SourceChunk, float]]:
        distance_expr = SourceChunk.embedding.cosine_distance(query_embedding).label("distance")

        stmt = (
            select(SourceChunk, distance_expr)
            .join(LegalSource, LegalSource.id == SourceChunk.source_id)
            .options(joinedload(SourceChunk.source))
            .where(LegalSource.status == "active")
            .where(SourceChunk.embedding.is_not(None))
        )

        # Re-apply the same filters from the base statement.
        for criterion in getattr(base_stmt, "_where_criteria", ()):
            stmt = stmt.where(criterion)

        stmt = stmt.order_by(distance_expr.asc(), SourceChunk.created_at.desc()).limit(limit)

        rows = db.execute(stmt).all()
        return [(row[0], float(row[1])) for row in rows]

    def _run_keyword_search(
        self,
        db: Session,
        base_stmt: Select[tuple[SourceChunk]],
        terms: list[str],
        limit: int,
    ) -> list[SourceChunk]:
        keyword_filters = []
        for term in terms:
            pattern = f"%{term}%"
            keyword_filters.append(SourceChunk.text.ilike(pattern))
            keyword_filters.append(SourceChunk.heading.ilike(pattern))
            keyword_filters.append(SourceChunk.section_ref.ilike(pattern))
            keyword_filters.append(LegalSource.title.ilike(pattern))
            keyword_filters.append(LegalSource.authority.ilike(pattern))

        stmt = base_stmt.where(or_(*keyword_filters)).order_by(SourceChunk.created_at.desc()).limit(limit)
        return list(db.scalars(stmt))

    def _fuse_results(
        self,
        vector_rows: list[tuple[SourceChunk, float]],
        keyword_chunks: list[SourceChunk],
        top_k: int,
        matched_terms: list[str],
        has_embeddings: bool,
        query_embedding: list[float] | None,
    ) -> tuple[list[SourceChunk], dict[str, object]]:
        candidates: dict[str, _Candidate] = {}

        for rank, (chunk, distance) in enumerate(vector_rows, start=1):
            candidate = candidates.get(chunk.id)
            if candidate is None:
                candidate = _Candidate(chunk=chunk)
                candidates[chunk.id] = candidate
            candidate.vector_rank = rank
            candidate.vector_distance = distance

        for rank, chunk in enumerate(keyword_chunks, start=1):
            candidate = candidates.get(chunk.id)
            if candidate is None:
                candidate = _Candidate(chunk=chunk)
                candidates[chunk.id] = candidate
            candidate.keyword_rank = rank

        ranked = sorted(
            candidates.values(),
            key=self._fusion_sort_key,
            reverse=True,
        )

        final_chunks = [item.chunk for item in ranked[:top_k]]

        debug = {
            "strategy": self._strategy_name(has_embeddings, bool(keyword_chunks)),
            "top_k": top_k,
            "matched_terms": matched_terms,
            "result_count": len(final_chunks),
            "vector_candidates": len(vector_rows),
            "keyword_candidates": len(keyword_chunks),
            "has_embeddings": has_embeddings,
            "embedding_dimension": len(query_embedding) if query_embedding else None,
            "results": [
                {
                    "chunk_id": item.chunk.id,
                    "source_id": item.chunk.source_id,
                    "title": item.chunk.source.title if item.chunk.source else None,
                    "section_ref": item.chunk.section_ref,
                    "heading": item.chunk.heading,
                    "vector_rank": item.vector_rank,
                    "keyword_rank": item.keyword_rank,
                    "vector_distance": item.vector_distance,
                    "rrf_score": self._rrf_score(item),
                }
                for item in ranked[:top_k]
            ],
        }

        return final_chunks, debug

    def _fusion_sort_key(self, item: _Candidate) -> tuple[float, float, float]:
        score = self._rrf_score(item)

        # Lower cosine distance is better, so invert for tie-breaking.
        distance_bonus = 0.0
        if item.vector_distance is not None:
            distance_bonus = -item.vector_distance

        keyword_bonus = 0.0
        if item.keyword_rank is not None:
            keyword_bonus = -float(item.keyword_rank)

        return (score, distance_bonus, keyword_bonus)

    def _rrf_score(self, item: _Candidate) -> float:
        score = 0.0
        if item.vector_rank is not None:
            score += 1.0 / (self.rrf_k + item.vector_rank)
        if item.keyword_rank is not None:
            score += 1.0 / (self.rrf_k + item.keyword_rank)
        return score

    def _extract_terms(self, text: str) -> list[str]:
        raw_terms = [term.strip(".,:;!?()[]{}\"'").lower() for term in text.split()]
        filtered: list[str] = []
        seen: set[str] = set()

        for term in raw_terms:
            if len(term) < 3:
                continue
            if term in seen:
                continue
            seen.add(term)
            filtered.append(term)
            if len(filtered) >= self.max_term_count:
                break

        return filtered

    def _strategy_name(self, has_embeddings: bool, has_keyword_hits: bool) -> str:
        if has_embeddings and has_keyword_hits:
            return "hybrid_rrf_pgvector_keyword"
        if has_embeddings:
            return "pgvector_only"
        if has_keyword_hits:
            return "keyword_fallback"
        return "no_results"