"""v2.1.2 — NativeWebLocator resolver (deterministic same-request resolution).

A NativeWebLocator is a transient model-facing locator for a source actually
observed through provider-native web_search.  It is NOT evidence.  The backend
verifies the locator against this request's real provider sources and promotes
it to a canonical request-scoped web:<opaque> EvidenceRef.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field

from app.services.request_evidence_registry import RequestEvidenceRegistry

# Deterministic schema-invalid code for a malformed/oversized/extra-property
# transient locator.  This is NEVER a repair/normalization; it is a contract
# rejection.
LOCATOR_SCHEMA_INVALID = "NATIVE_WEB_LOCATOR_SCHEMA_INVALID"


class NativeWebLocator(BaseModel):
    """Transient model-facing locator for a provider-native web source.

    Strict by contract: no extra properties, https-only, and bounded length.
    """

    model_config = ConfigDict(extra="forbid")

    url: str = Field(pattern=r"^https://", max_length=2000)

    def normalized_url(self) -> str:
        return normalize_source_url(self.url)


def validate_locator_object(loc: Any) -> tuple[Any | None, str | None]:
    """Narrowly validate a raw locator into a NativeWebLocator.

    Returns (locator, None) on success, or (None, LOCATOR_SCHEMA_INVALID) when
    the locator is malformed (shape/extra-property/oversized).  This is contract
    enforcement, NOT silent normalization.  A valid but unobserved URL is a
    separate NOT_OBSERVED outcome handled by the resolver.
    """
    if isinstance(loc, NativeWebLocator):
        return loc, None
    if not isinstance(loc, dict):
        return None, LOCATOR_SCHEMA_INVALID
    try:
        return NativeWebLocator(**loc), None
    except Exception:
        return None, LOCATOR_SCHEMA_INVALID


def normalize_source_url(url: str) -> str:
    """Deterministic URL lookup-key normalization (never fetches, no span).

    Authority hardening:
    - scheme must be https;
    - hostname must exist;
    - URLs with username/password (userinfo) are rejected;
    - explicit non-default ports are preserved (explicit :443 == default https
      is acceptable);
    - trailing-slash and fragment are stripped;
    - path and query are preserved;
    - malformed URLs/ports fail safely (raised) rather than silently collapsing
      to some other valid source.
    """
    if not isinstance(url, str):
        raise ValueError("locator URL must be a string")
    try:
        parts = urlsplit(url)
    except Exception as exc:
        raise ValueError("malformed locator URL") from exc

    scheme = (parts.scheme or "").lower()
    if scheme != "https":
        raise ValueError("locator URL scheme must be https")
    if parts.username or parts.password:
        raise ValueError("locator URL must not contain userinfo")

    host = (parts.hostname or "").lower()
    if not host:
        raise ValueError("locator URL must include a hostname")

    port = parts.port
    port_str = ""
    if port is not None and port != 443:
        port_str = f":{port}"

    path = parts.path.rstrip("/")
    query = parts.query
    normalized = f"https://{host}{port_str}"
    if path:
        normalized += path
    if query:
        normalized += "?" + query
    return normalized


@dataclass(slots=True)
class LocatorResolution:
    """Observable result of resolving locators for one submit attempt."""

    resolved: dict[str, str] = field(default_factory=dict)  # url -> web:<opaque>
    rejected: dict[str, str] = field(default_factory=dict)  # url -> code
    resolved_count: int = 0
    unresolved_count: int = 0
    ambiguous_count: int = 0
    schema_invalid_count: int = 0
    match_category_counts: dict[str, int] = field(default_factory=dict)

    @property
    def rejection_codes(self) -> list[str]:
        return list(self.rejected.values())


class NativeWebLocatorResolver:
    """Resolve model-furnished URLs to canonical same-request native refs."""

    def __init__(self, registry: RequestEvidenceRegistry) -> None:
        self._registry = registry

    def source_url_index(self) -> dict[str, list[str]]:
        index: dict[str, list[str]] = {}
        for ref in self._registry.get_refs_by_origin("openai_web_native"):
            try:
                evidence = self._registry.resolve_evidence(ref)
            except Exception:
                continue
            url = getattr(evidence, "url", None)
            if not url:
                continue
            try:
                key = normalize_source_url(str(url))
            except ValueError:
                continue
            index.setdefault(key, []).append(ref)
        return index

    def resolve(self, locators: list[Any]) -> LocatorResolution:
        result = LocatorResolution()
        index = self.source_url_index()

        def record(category: str) -> None:
            result.match_category_counts[category] = (
                result.match_category_counts.get(category, 0) + 1
            )

        for loc in locators:
            validated, invalid_code = validate_locator_object(loc)
            if invalid_code is not None:
                result.rejected[repr(loc)] = invalid_code
                result.schema_invalid_count += 1
                record("locator_schema_invalid")
                continue
            url = validated.url
            if not url or not isinstance(url, str) or not url.startswith("https://"):
                result.rejected[url] = "NATIVE_WEB_LOCATOR_NOT_OBSERVED"
                result.unresolved_count += 1
                record("locator_not_observed")
                continue
            try:
                key = normalize_source_url(url)
            except ValueError:
                result.rejected[url] = "NATIVE_WEB_LOCATOR_NOT_OBSERVED"
                result.unresolved_count += 1
                record("locator_not_observed")
                continue
            candidates = index.get(key, [])
            if not candidates:
                result.rejected[url] = "NATIVE_WEB_LOCATOR_NOT_OBSERVED"
                result.unresolved_count += 1
                record("locator_not_observed")
                continue
            unique = sorted(set(candidates))
            if len(unique) > 1:
                result.rejected[url] = "NATIVE_WEB_LOCATOR_AMBIGUOUS"
                result.ambiguous_count += 1
                record("locator_ambiguous")
                continue
            try:
                evidence_url = getattr(
                    self._registry.resolve_evidence(unique[0]), "url", None
                )
            except Exception:
                evidence_url = None
            result.resolved[url] = unique[0]
            result.resolved_count += 1
            record(
                "exact_locator_match"
                if isinstance(evidence_url, str) and evidence_url == url
                else "normalized_locator_match"
            )
        return result


def create_native_web_locator_resolver(
    registry: RequestEvidenceRegistry,
) -> NativeWebLocatorResolver:
    return NativeWebLocatorResolver(registry)
