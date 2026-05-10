from __future__ import annotations

from dataclasses import dataclass, field
import re
from typing import Any

from sqlalchemy.orm import Session

from app.schemas.query import QueryRequest
from app.services.legal_reasoning_kernel import CriterionEvidence, CriterionNode
from app.services.operation_profiles import infer_source_classes_from_parts
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
    Precision-first criterion-level retrieval wrapper.

    It still reuses the existing RetrievalService, but now:
    - prioritises active stream-specific nodes before generic/common nodes;
    - reranks chunks per criterion node;
    - penalises obviously off-topic bridging/travel chunks unless the node is about current status;
    - keeps a structured debug trace for node ordering and per-node retrieval.
    """

    def __init__(self, *, max_nodes: int = 8, chunks_per_node: int = 2) -> None:
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
        query_text = (base_payload.question or "").lower()
        ordered_nodes = self._order_nodes(nodes, query_text=query_text)
        selected_nodes = [node for node in ordered_nodes if node.source_queries][: self.max_nodes]

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
                        "top_k": max(self.chunks_per_node * 3, 4),
                    }
                )
                chunks, debug = retrieval_service.retrieve(db, payload)
                reranked = self._rerank_chunks_for_node(chunks, node=node, question=query_text)
                selected_for_query = reranked[: self.chunks_per_node]

                node_debug.setdefault(node.id, []).append(
                    {
                        "query": query,
                        "raw_result_count": len(chunks),
                        "selected_result_count": len(selected_for_query),
                        "top_titles": debug.get("top_titles", []),
                        "source_class_counts": debug.get("source_class_counts", {}),
                        "rerank_scores": [
                            {
                                "chunk_id": str(getattr(chunk, "id", "") or ""),
                                "score": score,
                                "title": str(getattr(getattr(chunk, "source", None), "title", "") or ""),
                            }
                            for chunk, score in reranked[:5]
                        ],
                    }
                )

                for chunk, _score in selected_for_query:
                    chunk_id = str(getattr(chunk, "id", "") or "")
                    if chunk_id and chunk_id not in seen_chunk_ids:
                        seen_chunk_ids.add(chunk_id)
                        all_chunks.append(chunk)
                    node_chunks.append(chunk)

                    source = getattr(chunk, "source", None)
                    title = str(getattr(source, "title", "") or "")
                    if title and title not in node_source_titles:
                        node_source_titles.append(title)

                    for cls in self._source_classes_for_chunk(chunk):
                        node_source_classes.add(cls)
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
                "strategy": "precision_first_criterion_node_targeted_retrieval",
                "node_count": len(selected_nodes),
                "nodes": [node.id for node in selected_nodes],
                "skipped_nodes": [node.id for node in ordered_nodes if node not in selected_nodes],
                "node_priorities": [
                    {"node_id": node.id, "priority": self._node_priority(node, query_text)}
                    for node in ordered_nodes
                ],
                "node_debug": node_debug,
            },
        )

    def _order_nodes(self, nodes: list[CriterionNode], *, query_text: str) -> list[CriterionNode]:
        return sorted(nodes, key=lambda node: (self._node_priority(node, query_text), node.id))

    def _node_priority(self, node: CriterionNode, query_text: str) -> int:
        node_id = node.id
        q = query_text or ""

        if "age" in node_id or "age" in " ".join(node.source_classes):
            if re.search(r"\b\d{2}\s*(?:years?\s*old)?\b|\bage\b|\byears old\b", q):
                return 0

        if node_id.startswith("485.higher_education") and any(x in q for x in ["master", "masters", "bachelor", "phd", "degree"]):
            return 1
        if node_id.startswith("485.vocational") and any(x in q for x in ["diploma", "trade", "associate degree", "vocational", "skills assessment"]):
            return 1
        if node_id == "485.regional_extension" and any(x in q for x in ["regional", "second 485", "second temporary graduate"]):
            return 1
        if node_id == "485.replacement" and "replacement" in q:
            return 1

        if node_id.startswith("485.higher_education") or node_id.startswith("485.vocational"):
            return 2
        if node_id == "485.common.application_window":
            return 3
        if node.layer == "schedule1_validity":
            return 4
        if node_id == "485.stream_selection":
            return 5
        if node_id in {"485.common.student_visa_study", "485.common.current_status"}:
            return 6
        if node_id == "485.common.health_insurance":
            return 7
        return 8

    def _rerank_chunks_for_node(self, chunks: list[Any], *, node: CriterionNode, question: str) -> list[tuple[Any, float]]:
        scored = [(chunk, self._chunk_score(chunk, node=node, question=question)) for chunk in chunks]
        scored.sort(key=lambda item: item[1], reverse=True)
        return scored

    def _chunk_score(self, chunk: Any, *, node: CriterionNode, question: str) -> float:
        source = getattr(chunk, "source", None)
        title = str(getattr(source, "title", "") or "").lower()
        heading = str(getattr(chunk, "heading", "") or "").lower()
        text = str(getattr(chunk, "text", "") or "").lower()
        section_ref = str(getattr(chunk, "section_ref", "") or "").lower()
        blob = "\n".join([title, heading, section_ref, text[:1600]])
        source_classes = set(self._source_classes_for_chunk(chunk))

        score = 0.0
        for cls in node.source_classes:
            if cls in source_classes:
                score += 4.0

        if node.id == "485.higher_education.degree":
            if "485.231" in blob:
                score += 5.0
            if "post-higher education" in blob or "post higher education" in blob:
                score += 4.0
            if any(term in blob for term in ["bachelor", "master", "masters", "phd", "degree"]):
                score += 1.5

        if node.id == "485.vocational.skills_assessment":
            if "485.224" in blob:
                score += 5.0
            if "skills assessment" in blob or "nominated occupation" in blob:
                score += 4.0

        if node.id == "485.common.application_window":
            if any(term in blob for term in ["completed within", "6 months", "six months", "course completion", "completion date"]):
                score += 3.5

        if node.layer == "schedule1_validity":
            if any(term in blob for term in ["schedule 1", "class vc", "temporary graduate", "valid application"]):
                score += 3.0

        if "age" in node.id or "485_age_requirement" in node.source_classes:
            if any(term in blob for term in ["35 years", "35 years old", "years old or younger", "age"]):
                score += 6.0

        if "temporary graduate" in title or "subclass 485" in title:
            score += 1.5
        if "department of home affairs" in str(getattr(source, "authority", "") or "").lower():
            score += 1.0
        if "federal register" in str(getattr(source, "authority", "") or "").lower() or getattr(source, "source_type", "") == "legislation":
            score += 0.7

        if node.id != "485.common.current_status":
            if any(term in blob for term in ["bridging visa", "bvb", "travel on a bridging", "leave and return"]):
                score -= 5.0

        return score

    def _source_types_for_node(self, base_payload: QueryRequest, node: CriterionNode) -> list[str]:
        existing = list(base_payload.preferred_source_types or [])
        wanted = ["legislation", "guidance", "procedure"]
        if node.layer == "schedule1_validity":
            wanted = ["legislation", "procedure", "guidance"]
        elif node.layer == "schedule2_grant":
            wanted = ["legislation", "guidance", "procedure"]
        return list(dict.fromkeys([*existing, *wanted]))

    def _source_classes_for_chunk(self, chunk: Any) -> list[str]:
        source = getattr(chunk, "source", None)
        meta = getattr(source, "metadata_json", None) or {}
        chunk_meta = getattr(chunk, "metadata_json", None) or {}
        return infer_source_classes_from_parts(
            title=getattr(source, "title", None),
            authority=getattr(source, "authority", None),
            source_type=getattr(source, "source_type", None),
            bucket=meta.get("bucket"),
            sub_type=meta.get("sub_type"),
            section_ref=getattr(chunk, "section_ref", None),
            heading=getattr(chunk, "heading", None),
            text=getattr(chunk, "text", None),
            metadata_json={**meta, **chunk_meta},
        )
