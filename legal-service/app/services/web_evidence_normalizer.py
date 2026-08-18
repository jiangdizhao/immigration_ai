"""Phase 4B — Web evidence normalizer.

Normalizes ACTUAL provider-native web search output into
NativeWebEvidenceRef records.

CRITICAL RULES:
- Only normalizes actual structured/native tool output from the runtime
- A URL typed in model prose is NOT web evidence
- A URL supplied by the user is NOT automatically web evidence
- A plausible-looking official URL is NOT evidence merely because it parses
- Exact text and content_hash remain NULL unless backend separately fetched

Phase 4B implements the normalizer; Phase 5 implements actual web search.
Tests use fixtures/mocks, not live OpenAI calls.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlparse

from app.schemas.evidence import (
    NativeWebCitation,
    NativeWebEvidenceRef,
    SourceAuthenticity,
    SourceType,
    AuthorityKind,
    BindingStatus,
)
from app.services.request_evidence_registry import RequestEvidenceRegistry

logger = logging.getLogger(__name__)


class WebEvidenceNormalizationError(Exception):
    """Error normalizing web evidence."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


class InvalidWebSearchOutputError(WebEvidenceNormalizationError):
    def __init__(self, reason: str) -> None:
        super().__init__(
            code="INVALID_WEB_SEARCH_OUTPUT",
            message=f"Web search output is invalid: {reason}",
        )
        self.reason = reason


# Domain patterns for authority classification (deterministic, not semantic)
# These help classify source authenticity but NEVER determine legal binding status
OFFICIAL_DOMAINS: dict[str, SourceAuthenticity] = {
    "legislation.gov.au": "canonical_official",
    "www.legislation.gov.au": "canonical_official",
    "homeaffairs.gov.au": "canonical_official",
    "immi.homeaffairs.gov.au": "canonical_official",
    "www.homeaffairs.gov.au": "canonical_official",
    "gov.au": "official_copy",
    "servicesaustralia.gov.au": "official_copy",
    "www.servicesaustralia.gov.au": "official_copy",
}

# Domain patterns suggesting source type (conservative)
LEGISLATION_DOMAINS = {"legislation.gov.au", "www.legislation.gov.au"}
GOVERNMENT_GUIDANCE_DOMAINS = {
    "homeaffairs.gov.au",
    "immi.homeaffairs.gov.au",
    "www.homeaffairs.gov.au",
    "servicesaustralia.gov.au",
}


def extract_domain(url: str) -> str:
    """Extract domain from URL."""
    try:
        parsed = urlparse(url)
        return parsed.netloc.lower()
    except Exception:
        return ""


def classify_source_authenticity(url: str) -> SourceAuthenticity:
    """Classify source authenticity from URL domain.

    This is deterministic domain matching, not semantic judgment.
    Unknown domains are 'unverified'.
    """
    domain = extract_domain(url)
    for pattern, authenticity in OFFICIAL_DOMAINS.items():
        if domain == pattern or domain.endswith("." + pattern):
            return authenticity
    return "unverified"


def classify_source_type_from_url(url: str) -> SourceType:
    """Classify likely source type from URL.

    Conservative: defaults to web_page for unknown domains.
    """
    domain = extract_domain(url)
    if domain in LEGISLATION_DOMAINS:
        return "legislation"
    if domain in GOVERNMENT_GUIDANCE_DOMAINS:
        return "official_guidance"
    return "web_page"


def classify_authority_kind_from_url(url: str) -> AuthorityKind:
    """Classify likely authority kind from URL.

    IMPORTANT: This does NOT determine binding status.
    Official guidance is authentic but non-binding.
    """
    domain = extract_domain(url)
    if domain in LEGISLATION_DOMAINS:
        return "statute"  # May be Act or instrument; conservative
    if domain in GOVERNMENT_GUIDANCE_DOMAINS:
        return "operational_guidance"
    return "commentary"  # Unknown/conservative


def classify_binding_status(authority_kind: AuthorityKind) -> BindingStatus:
    """Determine binding status from authority kind.

    Only legislation is binding. Guidance, commentary, etc. are not.
    """
    if authority_kind in ("statute", "delegated_legislation"):
        return "binding"
    if authority_kind == "binding_precedent":
        return "binding"
    return "non_binding"


class WebEvidenceNormalizer:
    """Normalizes actual provider web search output to evidence refs.

    This class does NOT:
    - Make web calls
    - Fetch URLs
    - Accept model-prose URLs as evidence
    - Accept user-supplied URLs as evidence
    """

    def normalize_search_output(
        self,
        *,
        search_output: dict[str, Any],
        search_call_id: str,
        tool_call_id: str,
        registry: RequestEvidenceRegistry,
    ) -> list[tuple[NativeWebEvidenceRef, str]]:
        """Normalize actual web search output to evidence refs.

        Args:
            search_output: Actual structured output from provider web search.
                          Must contain 'sources' list with url/title fields.
            search_call_id: Provider's search call identifier.
            tool_call_id: Tool call ID for registry.
            registry: Request-scoped evidence registry.

        Returns:
            List of (evidence, registered_ref) tuples.

        Raises:
            InvalidWebSearchOutputError: If output structure is invalid.
        """
        if not isinstance(search_output, dict):
            raise InvalidWebSearchOutputError("search_output must be a dict")

        sources = search_output.get("sources")
        if sources is None:
            # No sources is valid (search may have failed)
            return []

        if not isinstance(sources, list):
            raise InvalidWebSearchOutputError("sources must be a list")

        results: list[tuple[NativeWebEvidenceRef, str]] = []
        seen_urls: set[str] = set()

        for i, source in enumerate(sources):
            if not isinstance(source, dict):
                logger.warning("Skipping non-dict source at index %d", i)
                continue

            url = source.get("url")
            if not url or not isinstance(url, str):
                logger.warning("Skipping source without URL at index %d", i)
                continue

            # Validate URL is https
            if not url.startswith("https://"):
                logger.warning("Skipping non-https URL at index %d", i)
                continue

            # Deduplicate by URL
            if url in seen_urls:
                continue
            seen_urls.add(url)

            title = source.get("title") or url

            # Native evidence requires an actual provider citation annotation.
            # A bare URL in a structured-looking object remains insufficient.
            citation_data = source.get("citation") or source.get("native_web_citation")
            if not isinstance(citation_data, dict):
                logger.warning("Skipping source without native citation at index %d", i)
                continue
            start_index = citation_data.get("start_index")
            end_index = citation_data.get("end_index")
            if (
                not isinstance(start_index, int)
                or not isinstance(end_index, int)
                or start_index < 0
                or end_index < start_index
            ):
                logger.warning("Skipping malformed native citation at index %d", i)
                continue
            native_citation = NativeWebCitation(
                start_index=start_index,
                end_index=end_index,
            )

            # Classify metadata deterministically from URL
            source_authenticity = classify_source_authenticity(url)
            source_type = classify_source_type_from_url(url)
            authority_kind = classify_authority_kind_from_url(url)
            binding_status = classify_binding_status(authority_kind)

            evidence = NativeWebEvidenceRef(
                evidence_origin="openai_web_native",
                evidence_ref="web:pending",  # Will be replaced by registry
                source_type=source_type,
                source_authenticity=source_authenticity,
                authority_kind=authority_kind,
                jurisdiction="Cth" if source_authenticity != "unverified" else None,
                binding_status=binding_status,
                court_or_tribunal_level=None,
                retrieved_at=datetime.now(timezone.utc),
                provenance_complete=True,
                search_call_id=search_call_id,
                url=url,
                title=title,
                native_web_citation=native_citation,
                canonical_source_id=None,
                document_version=None,
                effective_from=None,
                effective_to=None,
                text=None,  # Native web evidence has no exact text
                content_hash=None,  # Native web evidence has no hash
            )

            registered_ref = registry.register_native_web_evidence(
                evidence=evidence,
                tool_call_id=tool_call_id,
                tool_name="web_search",
            )
            evidence = evidence.model_copy(update={"evidence_ref": registered_ref})
            results.append((evidence, registered_ref))

        return results

    def normalize_citation_annotations(
        self,
        *,
        annotations: list[dict[str, Any]],
        evidence_by_url: dict[str, str],
    ) -> list[dict[str, Any]]:
        """Map citation annotations to registered evidence refs.

        Args:
            annotations: Provider citation annotations with url/indices.
            evidence_by_url: Map of URL -> registered evidence ref.

        Returns:
            List of normalized annotation dicts with evidence_ref.
        """
        results = []
        for ann in annotations:
            if not isinstance(ann, dict):
                continue
            url = ann.get("url")
            if not url or url not in evidence_by_url:
                continue
            results.append({
                "evidence_ref": evidence_by_url[url],
                "start_index": ann.get("start_index", 0),
                "end_index": ann.get("end_index", 0),
            })
        return results


def reject_model_prose_url(url: str) -> WebEvidenceNormalizationError:
    """Create error for model-authored URL (not from actual search)."""
    return WebEvidenceNormalizationError(
        code="MODEL_AUTHORED_URL",
        message="URLs in model prose are not web evidence",
    )


def reject_user_supplied_url(url: str) -> WebEvidenceNormalizationError:
    """Create error for user-supplied URL (not from actual search)."""
    return WebEvidenceNormalizationError(
        code="USER_SUPPLIED_URL",
        message="User-supplied URLs are not automatically web evidence",
    )
