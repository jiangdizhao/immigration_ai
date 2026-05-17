from __future__ import annotations

import re
from typing import Any

from app.schemas.query import QueryResponse
from app.schemas.source import CitationOut


class CitationQualityService:
    SCRIPT_NOISE = (
        "msowebpartpageformname",
        "_sppagecontextinfo",
        "aspnetform",
        "var g_",
        "function _",
        "<![cdata",
    )
    PAGE_CHROME = (
        "skip to navigation",
        "skip to main content",
        "popular searches",
        "your previous searches",
        "search pop-up",
        "menu home affairs portfolio",
        "need a hand?",
        "immigration and citizenship website",
    )

    def filter_response_citations(
        self,
        *,
        response: QueryResponse,
        focused_policy_issue: dict[str, Any] | None = None,
        focused_policy_finding: dict[str, Any] | None = None,
    ) -> tuple[QueryResponse, dict[str, Any]]:
        original_count = len(response.citations or [])
        kept: list[CitationOut] = []
        removed: list[dict[str, str]] = []

        for citation in response.citations or []:
            ok, reason = self._citation_is_public_quality(citation, focused_policy_issue)
            if ok:
                kept.append(citation)
            else:
                removed.append({"title": citation.title, "section_ref": str(citation.section_ref), "reason": reason})

        if not kept:
            fallback = self._citation_from_focused_finding(focused_policy_finding, focused_policy_issue)
            if fallback is not None:
                kept.append(fallback)

        response.citations = kept
        response.compact_sources = self._compact_sources_from_citations(kept)
        return response, {
            "original_count": original_count,
            "kept_count": len(kept),
            "removed_count": len(removed),
            "removed": removed[:8],
            "fallback_created": bool(kept and kept[0].source_id.startswith("focused-policy")),
        }

    def _citation_is_public_quality(self, citation: CitationOut, focused_policy_issue: dict[str, Any] | None) -> tuple[bool, str]:
        quote = (citation.quote_text or "").strip()
        if not quote:
            return False, "empty_quote"
        lowered = quote.lower()
        if any(term in lowered for term in self.SCRIPT_NOISE):
            return False, "script_noise"
        if any(term in lowered for term in self.PAGE_CHROME):
            return False, "page_chrome"
        if len(re.sub(r"\W+", "", quote)) < 80:
            return False, "too_short_or_title_only"

        issue_key = str((focused_policy_issue or {}).get("key") or "")
        if issue_key == "485_current_policy_age_qualification":
            has_stream = "post-higher education work stream" in lowered or "post higher education work stream" in lowered
            has_age = "35 years of age or under" in lowered or "35 years old or younger" in lowered or ("maximum eligible age" in lowered and "35" in lowered)
            has_exception = any(term in lowered for term in ["masters (research)", "doctoral degree", "phd", "hong kong", "british national overseas"])
            if not (has_stream and has_age):
                if has_exception and ("35" in lowered or "age" in lowered):
                    return True, "exception_support"
                return False, "does_not_support_focused_485_age_issue"
        return True, "ok"

    def _citation_from_focused_finding(
        self,
        finding: dict[str, Any] | None,
        issue: dict[str, Any] | None,
    ) -> CitationOut | None:
        if not finding or not finding.get("resolved"):
            return None
        snippets = [str(item).strip() for item in finding.get("evidence_snippets") or [] if str(item).strip()]
        for idx, snippet in enumerate(snippets):
            fake = CitationOut(
                source_id=f"focused-policy-{idx}",
                chunk_id=f"focused-policy-snippet-{idx}",
                title=(finding.get("evidence_titles") or ["Official current policy material"])[0],
                authority="Department of Home Affairs",
                citation_text=(finding.get("evidence_titles") or ["Official current policy material"])[0],
                section_ref="focused_policy_evidence",
                url=(finding.get("evidence_urls") or [""])[0],
                quote_text=snippet[:1200],
                rationale="Focused current-policy evidence used to support the answer.",
            )
            ok, _reason = self._citation_is_public_quality(fake, issue)
            if ok:
                return fake
        return None

    def _compact_sources_from_citations(self, citations: list[CitationOut]) -> list[str]:
        out: list[str] = []
        for citation in citations:
            item = f"{citation.authority} — {citation.title}".strip()
            if item not in out:
                out.append(item)
        return out[:4]
