"""Deterministic degraded response from already-recovered evidence."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Iterable
from urllib.parse import urlsplit

from app.schemas.source import CitationOut


MAX_DISPLAYED_SOURCES = 10


@dataclass(slots=True)
class EvidenceSalvageResult:
    answer: str
    citations: list[CitationOut] = field(default_factory=list)
    compact_sources: list[str] = field(default_factory=list)
    recovered_legal_evidence_count: int = 0
    recovered_web_source_count: int = 0
    recovered_citation_count: int = 0
    displayed_source_count: int = 0

    @property
    def telemetry(self) -> dict[str, Any]:
        return {
            "evidence_salvage_triggered": True,
            "evidence_salvage_reason": "terminal_synthesis_failed_after_recovered_evidence",
            "recovered_legal_evidence_count": self.recovered_legal_evidence_count,
            "recovered_web_source_count": self.recovered_web_source_count,
            "recovered_citation_count": self.recovered_citation_count,
            "evidence_salvage_displayed_source_count": self.displayed_source_count,
        }


class EvidenceSalvageFinalizer:
    """Build a safe user response without an additional model call."""

    @classmethod
    def build(
        cls,
        *,
        is_zh: bool,
        local_entries: Iterable[Any] = (),
        web_sources: Iterable[dict[str, Any]] = (),
        citation_count: int = 0,
    ) -> EvidenceSalvageResult | None:
        local = [entry for entry in local_entries if cls._is_local_evidence(entry)]
        web = cls._deduplicate_web_sources(web_sources)
        if not local and not web:
            return None

        citations: list[CitationOut] = []
        compact_sources: list[str] = []
        seen_display: set[str] = set()

        # Canonical local entries are deterministically placed before web
        # sources. Navigation entries never reach this list because they do not
        # create registry evidence entries.
        display_items: list[tuple[str, CitationOut]] = []
        for entry in local:
            record = getattr(entry, "evidence_record", None)
            title = str(
                getattr(entry, "canonical_source_id", None)
                or "Recovered local legal evidence"
            )
            section = getattr(entry, "provision_or_span", None)
            url = str(getattr(record, "canonical_url", None) or "")
            citation = CitationOut(
                source_id=str(getattr(entry, "evidence_ref", "")),
                chunk_id=getattr(entry, "canonical_chunk_id", None),
                title=title,
                authority="canonical_local",
                citation_text=section or "Recovered legal evidence",
                section_ref=section,
                url=url,
                rationale="Request-scoped evidence recovered before terminal synthesis failed",
            )
            display_items.append((f"local:{citation.source_id}", citation))

        for source in web:
            url = str(source.get("url") or "").strip()
            if not url:
                continue
            citation = CitationOut(
                source_id=str(source.get("evidence_ref") or url),
                chunk_id=source.get("search_call_id"),
                title=str(source.get("title") or url),
                authority="web",
                citation_text="Recovered official/web source",
                url=url,
                rationale="Provider-native source recovered before terminal synthesis failed",
            )
            display_items.append((f"web:{url.rstrip('/').lower()}", citation))

        for key, citation in display_items[:MAX_DISPLAYED_SOURCES]:
            if key in seen_display:
                continue
            seen_display.add(key)
            citations.append(citation)
            label = citation.title
            if citation.section_ref:
                label = f"{label} — {citation.section_ref}"
            if citation.url:
                label = f"{label} ({citation.url})"
            compact_sources.append(label)

        if is_zh:
            answer = (
                "研究过程在完成完整法律评估前被中断。不过，系统已经成功找到了以下相关材料：\n\n"
                + "\n".join(f"- {item}" for item in compact_sources)
                + "\n\n这些材料只是已恢复的研究证据，不构成完整或确定的个案法律结论。"
                "涉及拒签、复审、期限或其他紧急事项时，请尽快让律师审阅。你也可以重试问题或安排咨询。"
            )
        else:
            answer = (
                "The research process was interrupted before a complete legal assessment could be generated. "
                "However, the following relevant material was successfully retrieved:\n\n"
                + "\n".join(f"- {item}" for item in compact_sources)
                + "\n\nThis is recovered research material only, not a complete or definitive case-specific legal conclusion. "
                "Refusal, review, deadline-sensitive, or other urgent matters should be reviewed promptly by a lawyer. "
                "You may retry the question or arrange a consultation."
            )

        return EvidenceSalvageResult(
            answer=answer,
            citations=citations,
            compact_sources=compact_sources,
            recovered_legal_evidence_count=len(local),
            recovered_web_source_count=len(web),
            recovered_citation_count=max(0, int(citation_count)),
            displayed_source_count=len(citations),
        )

    @staticmethod
    def _is_local_evidence(entry: Any) -> bool:
        return getattr(entry, "evidence_origin", None) == "canonical_local"

    @staticmethod
    def _deduplicate_web_sources(
        sources: Iterable[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        result: list[dict[str, Any]] = []
        seen: set[str] = set()
        for source in sources:
            url = str(source.get("url") or "").strip()
            if not url or urlsplit(url).scheme != "https":
                continue
            key = url.rstrip("/").lower()
            if key in seen:
                continue
            seen.add(key)
            result.append(dict(source))
        return result
