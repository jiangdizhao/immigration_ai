from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

from sqlalchemy import Select, or_, select
from sqlalchemy.orm import Session, joinedload

from app.core.config import get_settings
from app.db.models import LegalSource, SourceChunk
from app.schemas.query import QueryRequest
from app.services.embedding_service import EmbeddingService
import re

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
            query_text=query_text,
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
        query_text: str,
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

        intent = self._classify_query_intent(query_text)

        scored = []
        for item in candidates.values():
            base_score = self._rrf_score(item)
            source_prior = self._compute_source_prior(item.chunk, intent)
            topic_boost = self._compute_topic_boost(item.chunk, query_text)
            final_score = base_score + source_prior + topic_boost

            scored.append(
                {
                    "item": item,
                    "base_score": base_score,
                    "source_prior": source_prior,
                    "topic_boost": topic_boost,
                    "final_score": final_score,
                    "intent": intent,
                }
            )

        scored.sort(
            key=lambda row: (
                row["final_score"],
                -(row["item"].vector_distance or 999.0),
                -(row["item"].keyword_rank or 999.0),
            ),
            reverse=True,
        )

        # diversity cap: max 2 chunks per source
        selected_rows = []
        per_source: dict[str, int] = {}
        for row in scored:
            source_id = row["item"].chunk.source_id
            if per_source.get(source_id, 0) >= 2:
                continue
            selected_rows.append(row)
            per_source[source_id] = per_source.get(source_id, 0) + 1
            if len(selected_rows) >= top_k:
                break

        final_chunks = [row["item"].chunk for row in selected_rows]

        debug = {
            "strategy": self._strategy_name(has_embeddings, bool(keyword_chunks)),
            "intent": intent,
            "top_k": top_k,
            "matched_terms": matched_terms,
            "result_count": len(final_chunks),
            "vector_candidates": len(vector_rows),
            "keyword_candidates": len(keyword_chunks),
            "has_embeddings": has_embeddings,
            "embedding_dimension": len(query_embedding) if query_embedding else None,
            "results": [
                {
                    "chunk_id": row["item"].chunk.id,
                    "source_id": row["item"].chunk.source_id,
                    "title": row["item"].chunk.source.title if row["item"].chunk.source else None,
                    "source_type": row["item"].chunk.source.source_type if row["item"].chunk.source else None,
                    "authority": row["item"].chunk.source.authority if row["item"].chunk.source else None,
                    "bucket": (row["item"].chunk.source.metadata_json or {}).get("bucket") if row["item"].chunk.source else None,
                    "sub_type": (row["item"].chunk.source.metadata_json or {}).get("sub_type") if row["item"].chunk.source else None,
                    "section_ref": row["item"].chunk.section_ref,
                    "heading": row["item"].chunk.heading,
                    "vector_rank": row["item"].vector_rank,
                    "keyword_rank": row["item"].keyword_rank,
                    "vector_distance": row["item"].vector_distance,
                    "rrf_score": row["base_score"],
                    "source_prior": row["source_prior"],
                    "topic_boost": row["topic_boost"],
                    "final_score": row["final_score"],
                }
                for row in selected_rows
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
        stopwords = {
            "what", "when", "where", "which", "who", "how",
            "can", "could", "should", "would", "will",
            "the", "a", "an", "and", "or", "if", "to", "of", "for", "in", "on",
            "my", "i", "me", "we", "our", "you", "your",
            "only", "hold", "back", "come", "leave", "australia"
        }
        generic_legal_terms = {
            "visa", "visas", "subclass", "application", "applications"
        }

        raw_terms = [term.strip(".,:;!?()[]{}\"'").lower() for term in text.split()]
        filtered: list[str] = []
        seen: set[str] = set()

        for term in raw_terms:
            if len(term) < 3:
                continue
            if term in stopwords:
                continue
            if term in generic_legal_terms:
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
    
    def _classify_query_intent(self, question: str) -> str:
        q = question.lower().strip()

        if any(x in q for x in ["my ", "i was", "i am", "my visa", "my student visa", "my spouse", "my child"]):
            return "fact_specific"

        if any(x in q for x in ["how many days", "deadline", "time limit", "review", "appeal", "criteria", "condition", "lawful"]):
            return "rule_or_procedure"

        if any(x in q for x in ["what is", "what should i do", "what documents", "what steps", "can i travel", "can i leave", "difference between"]):
            return "practical_guidance"

        return "mixed"
    
    def _compute_source_prior(self, chunk: SourceChunk, intent: str) -> float:
        source = chunk.source
        if source is None:
            return 0.0

        source_type = (source.source_type or "").lower()
        authority = (source.authority or "").lower()
        metadata = source.metadata_json or {}
        bucket = (metadata.get("bucket") or "").lower()
        sub_type = (metadata.get("sub_type") or "").lower()
        title = (source.title or "").lower()

        score = 0.0

        if "department of home affairs" in authority:
            score += 0.10
        elif "administrative review tribunal" in authority:
            score += 0.10
        elif "federal register of legislation" in authority or "commonwealth of australia" in authority:
            score += 0.08

        if sub_type == "form" or re.search(r"\b1005\b|\b1006\b|\b1008\b|\bm1\b|\bm2\b", title):
            score -= 0.55
        
        if intent == "practical_guidance":
            if source_type == "guidance":
                score += 0.15
            if bucket == "procedure":
                score -= 0.20
            if source_type == "legislation":
                score -= 0.08

        elif intent == "rule_or_procedure":
            if source_type == "legislation":
                score += 0.35
            if bucket == "procedure":
                score += 0.25
            if source_type == "guidance":
                score += 0.05

        elif intent == "fact_specific":
            if source_type == "guidance":
                score += 0.18
            if source_type == "legislation":
                score += 0.14
            if bucket == "procedure":
                score += 0.10

        else:  # mixed
            if source_type == "guidance":
                score += 0.12
            if source_type == "legislation":
                score += 0.12
            if bucket == "procedure":
                score += 0.05

        return score
    
    def _compute_topic_boost(self, chunk: SourceChunk, question: str) -> float:
        source = chunk.source
        if source is None:
            return 0.0

        q = question.lower()
        title = (source.title or "").lower()
        preview = ((chunk.heading or "") + " " + (chunk.text or "")[:400]).lower()

        score = 0.0

        def has(term: str) -> bool:
            return term in title or term in preview

        # student / GS
        if "genuine student" in q:
            if "genuine student" in title:
                score += 0.40
            elif has("genuine student"):
                score += 0.20

        if "student visa" in q or "subclass 500" in q:
            if "student visa" in title or "subclass 500" in title:
                score += 0.18

        # 485
        if "485" in q or "temporary graduate" in q:
            if "temporary graduate" in title or "subclass 485" in title:
                score += 0.35
            elif has("temporary graduate") or has("subclass 485"):
                score += 0.18

        # bridging travel
        if (
            "bridging visa" in q
            or "travel" in q
            or "leave australia" in q
            or "come back" in q
        ):
            if "travel on a bridging visa" in title:
                score += 0.80
            elif "bridging visa b" in title or "(bvb)" in title:
                score += 0.55
            elif "bridging visa a" in title or "(bva)" in title:
                score += 0.30
            elif "bridging visa" in title:
                score += 0.22

            # penalize irrelevant condition docs
            if (
                "condition 8501" in title
                or "condition-8501" in title
                or "visa condition" in title
                or "conditions" in title
            ):
                score -= 0.60

        # PIC 4020
        if "4020" in q or "misleading" in q or "incorrect information" in q:
            if "accurate information" in title or "4020" in title:
                score += 0.40
            elif has("accurate information") or has("4020"):
                score += 0.20

        # review / ART
        if "review" in q or "appeal" in q or "art" in q:
            if "practice direction" in title or "reviewable" in preview:
                score += 0.28

        return score