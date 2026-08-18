"""Phase 4B — Request-scoped evidence registry.

Evidence references are server-issued, opaque, and request-scoped.
A model cannot create evidence by printing a URL or plausible-looking
reference; only actual tool outputs registered in this registry are valid.

The registry:
- Issues opaque evidence refs (exact:<id>, web:<id>)
- Maps refs to actual tool results
- Rejects cross-request replay, guessed IDs, model-authored URLs
- Is disposed at request end

No cryptographic signing is required in v1.
"""

from __future__ import annotations

import hashlib
import secrets
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Literal
from uuid import uuid4

from app.schemas.evidence import (
    CanonicalLocalEvidenceRef,
    EvidenceRef,
    FetchedWebEvidenceRef,
    NativeWebEvidenceRef,
)

EvidenceOrigin = Literal["canonical_local", "openai_web_native", "fetched_web"]


@dataclass(slots=True)
class RegistryEntry:
    """A single registered evidence reference."""

    evidence_ref: str
    evidence_origin: EvidenceOrigin
    tool_call_id: str
    tool_name: str
    registered_at: datetime
    # Canonical local fields
    canonical_source_id: str | None = None
    canonical_chunk_id: str | None = None
    provision_or_span: str | None = None
    # Web native fields
    search_call_id: str | None = None
    url: str | None = None
    native_web_citation: dict[str, Any] | None = None
    # Full evidence record (for retrieval)
    evidence_record: EvidenceRef | None = None


class EvidenceRegistryError(Exception):
    """Base error for evidence registry operations."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


class EvidenceNotRegisteredError(EvidenceRegistryError):
    """Evidence ref is not registered in this request's registry."""

    def __init__(self, evidence_ref: str) -> None:
        super().__init__(
            code="EVIDENCE_NOT_REGISTERED",
            message="Evidence reference is not registered in this request's registry",
        )
        self.evidence_ref = evidence_ref


class RegistryDisposedError(EvidenceRegistryError):
    """Registry has been disposed and cannot accept new evidence."""

    def __init__(self) -> None:
        super().__init__(
            code="REGISTRY_DISPOSED",
            message="Evidence registry has been disposed",
        )


class RequestEvidenceRegistry:
    """Request-scoped registry of server-issued evidence references.

    Usage:
        registry = RequestEvidenceRegistry(request_id="...")
        ref = registry.register_canonical_evidence(...)
        # ... later ...
        entry = registry.resolve("exact:...")  # raises if not found
        registry.dispose()
    """

    def __init__(self, request_id: str) -> None:
        self._request_id = request_id
        self._entries: dict[str, RegistryEntry] = {}
        self._disposed = False
        self._created_at = datetime.now(timezone.utc)
        # Secret salt to make IDs unpredictable across requests
        self._salt = secrets.token_bytes(16)

    @property
    def request_id(self) -> str:
        return self._request_id

    @property
    def is_disposed(self) -> bool:
        return self._disposed

    @property
    def entry_count(self) -> int:
        return len(self._entries)

    def _generate_opaque_id(self, prefix: str) -> str:
        """Generate an opaque, unpredictable evidence ID."""
        # Combine request salt with random bytes for unpredictability
        raw = self._salt + secrets.token_bytes(12)
        digest = hashlib.sha256(raw).hexdigest()[:20]
        return f"{prefix}:{digest}"

    def _check_not_disposed(self) -> None:
        if self._disposed:
            raise RegistryDisposedError()

    def register_canonical_evidence(
        self,
        *,
        evidence: CanonicalLocalEvidenceRef,
        tool_call_id: str,
        tool_name: str = "exact_legal_lookup",
    ) -> str:
        """Register canonical local evidence and return the evidence ref.

        The evidence must be an actual CanonicalLocalEvidenceRef with
        backend-held exact text/hash.
        """
        self._check_not_disposed()

        # Generate a fresh opaque ref (do not trust model-provided refs)
        evidence_ref = self._generate_opaque_id("exact")

        registered_evidence = evidence.model_copy(update={"evidence_ref": evidence_ref})
        entry = RegistryEntry(
            evidence_ref=evidence_ref,
            evidence_origin="canonical_local",
            tool_call_id=tool_call_id,
            tool_name=tool_name,
            registered_at=datetime.now(timezone.utc),
            canonical_source_id=evidence.canonical_source_id,
            canonical_chunk_id=evidence.canonical_chunk_id,
            provision_or_span=evidence.provision_or_span,
            evidence_record=registered_evidence,
        )
        self._entries[evidence_ref] = entry
        return evidence_ref

    def register_native_web_evidence(
        self,
        *,
        evidence: NativeWebEvidenceRef,
        tool_call_id: str,
        tool_name: str = "web_search",
    ) -> str:
        """Register OpenAI-native web evidence and return the evidence ref.

        The evidence must come from actual provider web search output,
        not model prose or user-supplied URLs.
        """
        self._check_not_disposed()

        evidence_ref = self._generate_opaque_id("web")

        registered_evidence = evidence.model_copy(update={"evidence_ref": evidence_ref})
        entry = RegistryEntry(
            evidence_ref=evidence_ref,
            evidence_origin="openai_web_native",
            tool_call_id=tool_call_id,
            tool_name=tool_name,
            registered_at=datetime.now(timezone.utc),
            search_call_id=evidence.search_call_id,
            url=evidence.url,
            native_web_citation=(
                evidence.native_web_citation.model_dump()
                if evidence.native_web_citation
                else None
            ),
            evidence_record=registered_evidence,
        )
        self._entries[evidence_ref] = entry
        return evidence_ref

    def register_fetched_web_evidence(
        self,
        *,
        evidence: FetchedWebEvidenceRef,
        tool_call_id: str,
        tool_name: str = "web_fetch",
    ) -> str:
        """Register separately fetched web evidence with exact text/hash."""
        self._check_not_disposed()

        evidence_ref = self._generate_opaque_id("web")

        registered_evidence = evidence.model_copy(update={"evidence_ref": evidence_ref})
        entry = RegistryEntry(
            evidence_ref=evidence_ref,
            evidence_origin="fetched_web",
            tool_call_id=tool_call_id,
            tool_name=tool_name,
            registered_at=datetime.now(timezone.utc),
            url=evidence.url,
            provision_or_span=evidence.provision_or_span,
            evidence_record=registered_evidence,
        )
        self._entries[evidence_ref] = entry
        return evidence_ref

    def is_registered(self, evidence_ref: str) -> bool:
        """Check if an evidence ref is registered (without raising)."""
        if self._disposed:
            return False
        return evidence_ref in self._entries

    def resolve(self, evidence_ref: str) -> RegistryEntry:
        """Resolve an evidence ref to its registry entry.

        Raises EvidenceNotRegisteredError if:
        - The ref was never registered
        - The ref is from another request
        - The ref was modified/guessed
        - The registry is disposed
        """
        if self._disposed:
            raise RegistryDisposedError()

        entry = self._entries.get(evidence_ref)
        if entry is None:
            raise EvidenceNotRegisteredError(evidence_ref)
        return entry

    def resolve_evidence(self, evidence_ref: str) -> EvidenceRef:
        """Resolve an evidence ref to the full evidence record."""
        entry = self.resolve(evidence_ref)
        if entry.evidence_record is None:
            raise EvidenceNotRegisteredError(evidence_ref)
        return entry.evidence_record

    def get_all_refs(self) -> list[str]:
        """Return all registered evidence refs (for observability)."""
        return list(self._entries.keys())

    def get_refs_by_origin(self, origin: EvidenceOrigin) -> list[str]:
        """Return refs filtered by origin type."""
        return [
            ref for ref, entry in self._entries.items()
            if entry.evidence_origin == origin
        ]

    def dispose(self) -> None:
        """Dispose the registry, preventing further use.

        Called at request end. After disposal:
        - No new evidence can be registered
        - All resolve operations fail
        - Cross-request replay is impossible
        """
        self._disposed = True
        self._entries.clear()
        self._salt = b""  # Clear secret material


def create_registry(request_id: str | None = None) -> RequestEvidenceRegistry:
    """Create a new request-scoped evidence registry."""
    return RequestEvidenceRegistry(request_id=request_id or uuid4().hex)
