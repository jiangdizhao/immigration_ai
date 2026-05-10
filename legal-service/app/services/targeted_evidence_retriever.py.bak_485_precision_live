from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any

from sqlalchemy.orm import Session

from app.schemas.query import QueryRequest
from app.services.legal_reasoning_kernel import CriterionEvidence, CriterionNode
from app.services.retrieval_service import RetrievalService


@dataclass(slots=True)
class TargetedRetrievalResult:
    chunks: list[Any] = field(default_factory=list)
    evidence_by_node: dict[str, CriterionEvidence] = field(default_factory=dict)
    debug: dict[str, Any] = field(default_factory=dict)

    def to_debug_dict(self) -> dict[str, Any]:
        return {
            "chunk_count": len(self.chunks),
            "evidence_by_node": {key: value.to_dict() for key, value in self.evidence_by_node.items()},
            "debug": self.debug,
        }


class TargetedEvidenceRetriever:
    """
    Criterion-level retrieval wrapper.

    It reuses the existing RetrievalService, but the query is generated from an
    active criterion node instead of the user's vague full question.
    """

    def __init__(self, *, max_nodes: int = 5, chunks_per_node: int = 2) -> None:
        self.max_nodes = max_nodes
        self.chunks_per_node = chunks_per_node

    def retrieve_for_nodes(
        self,
        *,
        db: Session,
        base_payload: QueryRequest,
        nodes: list[CriterionNode],
        retrieval_service: RetrievalService,
    ) -> TargetedRetrievalResult:
        selected_nodes = [node for node in nodes if node.source_queries][: self.max_nodes]
        all_chunks: list[Any] = []
        seen_chunk_ids: set[str] = set()
        evidence_by_node: dict[str, CriterionEvidence] = {}
        node_debug: dict[str, Any] = {}

        for node in selected_nodes:
            node_chunks: list[Any] = []
            node_source_titles: list[str] = []
            node_source_classes: set[str] = set()
            retrieval_queries = list(node.source_queries[:2])

            for query in retrieval_queries:
                payload = QueryRequest(
                    **{
                        **base_payload.model_dump(),
                        "question": query,
                        "preferred_source_types": self._source_types_for_node(base_payload, node),
                        "top_k": max(self.chunks_per_node, 2),
                    }
                )
                chunks, debug = retrieval_service.retrieve(db, payload)
                node_debug.setdefault(node.id, []).append(
                    {
                        "query": query,
                        "result_count": len(chunks),
                        "top_titles": debug.get("top_titles", []),
                        "source_class_counts": debug.get("source_class_counts", {}),
                    }
                )
                for chunk in chunks[: self.chunks_per_node]:
                    chunk_id = str(getattr(chunk, "id", "") or "")
                    if chunk_id and chunk_id not in seen_chunk_ids:
                        seen_chunk_ids.add(chunk_id)
                        all_chunks.append(chunk)
                    node_chunks.append(chunk)
                    source = getattr(chunk, "source", None)
                    title = str(getattr(source, "title", "") or "")
                    if title and title not in node_source_titles:
                        node_source_titles.append(title)
                    # Reuse retrieval debug classes when possible; otherwise keep node classes.
                    for cls in node.source_classes:
                        node_source_classes.add(cls)

            evidence_by_node[node.id] = CriterionEvidence(
                chunk_ids=[str(getattr(chunk, "id", "") or "") for chunk in node_chunks if getattr(chunk, "id", None)],
                source_titles=node_source_titles[:5],
                source_classes=sorted(node_source_classes),
                retrieval_queries=retrieval_queries,
            )

        return TargetedRetrievalResult(
            chunks=all_chunks,
            evidence_by_node=evidence_by_node,
            debug={
                "strategy": "criterion_node_targeted_retrieval",
                "node_count": len(selected_nodes),
                "nodes": [node.id for node in selected_nodes],
                "node_debug": node_debug,
            },
        )

    def _source_types_for_node(self, base_payload: QueryRequest, node: CriterionNode) -> list[str]:
        # Schedule nodes should include legislation. Guidance is still useful for
        # customer-facing explanation and current procedure pages.
        existing = list(base_payload.preferred_source_types or [])
        wanted = ["legislation", "guidance", "procedure"]
        if node.layer == "schedule1_validity":
            wanted = ["legislation", "procedure", "guidance"]
        elif node.layer == "schedule2_grant":
            wanted = ["legislation", "guidance", "procedure"]
        return list(dict.fromkeys([*existing, *wanted]))
