"""Phase 4B — Canonical evidence service.

Single authoritative service for constructing CanonicalLocalEvidenceRef
records from actual backend-held canonical sources/chunks.

Responsibilities:
- Validate actual source/chunk existence
- Retrieve exact canonical text/span
- Derive exact content hash (SHA-256 of actual text)
- Attach actual source metadata
- Normalize authority metadata
- Register evidence in RequestEvidenceRegistry

This service NEVER:
- Invents metadata (effective dates, versions, URLs, authority)
- Queries the network
- Mutates canonical data
"""

from __future__ import annotations

import hashlib
import logging
import re
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlparse

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import LegalSource, SourceChunk
from app.schemas.evidence import (
    AuthorityKind,
    BindingStatus,
    CanonicalLocalEvidenceRef,
    CourtOrTribunalLevel,
    SourceAuthenticity,
    SourceType,
)
from app.services.request_evidence_registry import RequestEvidenceRegistry

logger = logging.getLogger(__name__)


class CanonicalEvidenceError(Exception):
    """Error constructing canonical evidence."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


class SourceNotFoundError(CanonicalEvidenceError):
    def __init__(self, source_id: str) -> None:
        super().__init__(
            code="SOURCE_NOT_FOUND",
            message="Canonical source not found",
        )
        self.source_id = source_id


class ChunkNotFoundError(CanonicalEvidenceError):
    def __init__(self, chunk_id: str) -> None:
        super().__init__(
            code="CHUNK_NOT_FOUND",
            message="Canonical chunk not found",
        )
        self.chunk_id = chunk_id


class ChunkSourceMismatchError(CanonicalEvidenceError):
    def __init__(self) -> None:
        super().__init__(
            code="CHUNK_SOURCE_MISMATCH",
            message="Chunk does not belong to the specified source",
        )


# ---------------------------------------------------------------------------
# Authority metadata normalization
# ---------------------------------------------------------------------------

# Map existing source_type values to schema SourceType
SOURCE_TYPE_MAP: dict[str, SourceType] = {
    "legislation": "legislation",
    "statute": "legislation",
    "act": "legislation",
    "regulation": "legislation",
    "regulations": "legislation",
    "legislative_instrument": "legislative_instrument",
    "instrument": "legislative_instrument",
    "court_decision": "court_decision",
    "case": "court_decision",
    "tribunal_decision": "tribunal_decision",
    "tribunal": "tribunal_decision",
    "official_guidance": "official_guidance",
    "guidance": "official_guidance",
    "policy": "official_guidance",
    "explanatory_material": "explanatory_material",
    "explanatory": "explanatory_material",
    "secondary_commentary": "secondary_commentary",
    "commentary": "secondary_commentary",
    "internal_guidance": "internal_guidance",
    "web_page": "web_page",
}

# Map source_type to default authority_kind (conservative)
AUTHORITY_KIND_MAP: dict[str, AuthorityKind] = {
    # The corpus's broad "legislation" type does not itself distinguish an
    # Act from delegated legislation.  Known document identity below may do
    # so; otherwise retain a conservative non-binding classification.
    "legislation": "commentary",
    "statute": "statute",
    "act": "statute",
    "regulation": "delegated_legislation",
    "regulations": "delegated_legislation",
    "legislative_instrument": "delegated_legislation",
    "instrument": "delegated_legislation",
    "court_decision": "persuasive_decision",  # Court level determines binding
    "case": "persuasive_decision",
    "tribunal_decision": "administrative_decision",
    "tribunal": "administrative_decision",
    "official_guidance": "operational_guidance",
    "guidance": "operational_guidance",
    "policy": "operational_guidance",
    "explanatory_material": "explanatory",
    "explanatory": "explanatory",
    "secondary_commentary": "commentary",
    "commentary": "commentary",
    "internal_guidance": "operational_guidance",
    "web_page": "operational_guidance",  # Default conservative
}

# Court levels for binding status determination
COURT_LEVELS: dict[str, CourtOrTribunalLevel] = {
    "hca": "HCA",
    "high court": "HCA",
    "fcafc": "FCAFC",
    "full court": "FCAFC",
    "fca": "FCA",
    "federal court": "FCA",
    "fcfcoa": "FCFCOA",
    "art": "ART",
    "administrative review tribunal": "ART",
    "aat": "ART",  # Historical
}

# Courts whose decisions are binding precedent (within hierarchy)
BINDING_COURTS: set[CourtOrTribunalLevel] = {"HCA", "FCAFC", "FCA", "FCFCOA"}


def normalize_source_type(raw: str | None) -> SourceType:
    """Normalize source_type to schema enum, defaulting to web_page."""
    if not raw:
        return "web_page"
    normalized = raw.lower().strip().replace(" ", "_").replace("-", "_")
    return SOURCE_TYPE_MAP.get(normalized, "web_page")


def normalize_authority_kind(
    source_type: str | None,
    metadata: dict[str, Any] | None = None,
    *,
    document_title: str | None = None,
    document_version: str | None = None,
) -> AuthorityKind:
    """Determine authority_kind from source type and metadata.

    Conservative: returns 'unknown' equivalent via 'commentary' when
    classification cannot be established deterministically.
    """
    # Check metadata for explicit authority_kind
    if metadata and "authority_kind" in metadata:
        candidate = metadata["authority_kind"]
        valid_kinds: set[str] = {
            "statute", "delegated_legislation", "binding_precedent",
            "persuasive_decision", "administrative_decision",
            "operational_guidance", "explanatory", "commentary",
            "derived_relationship",
        }
        if candidate in valid_kinds:
            return candidate  # type: ignore[return-value]

    title = (document_title or "").lower()
    version = (document_version or "").upper()

    # These are document-identity mechanics, not Schedule/visa routing.  The
    # Federal Register compilation prefixes distinguish Commonwealth Acts
    # (C...) from legislative instruments/regulations (F...) in the canonical
    # corpus, while the descriptive title covers split Schedule sources.
    if "migration act" in title or re.match(r"^C\d{4}C\d+", version):
        return "statute"
    if "migration regulations" in title or re.match(r"^F\d{4}C\d+", version):
        return "delegated_legislation"

    if not source_type:
        return "commentary"  # Conservative unknown equivalent

    normalized = source_type.lower().strip().replace(" ", "_").replace("-", "_")
    return AUTHORITY_KIND_MAP.get(normalized, "commentary")


def normalize_binding_status(
    authority_kind: AuthorityKind,
    court_level: CourtOrTribunalLevel | None,
) -> BindingStatus:
    """Determine binding status from authority kind and court level.

    IMPORTANT: official ≠ binding. Home Affairs guidance is authentic
    but non-binding. Only statutes, delegated legislation, and binding
    court precedent have binding status.
    """
    if authority_kind in ("statute", "delegated_legislation"):
        return "binding"
    if authority_kind == "binding_precedent":
        return "binding"
    if authority_kind in ("persuasive_decision", "administrative_decision"):
        # Court hierarchy determines binding vs persuasive
        if court_level and court_level in BINDING_COURTS:
            return "persuasive"  # May be binding in hierarchy; conservative
        return "persuasive"
    if authority_kind in ("operational_guidance", "explanatory", "commentary"):
        return "non_binding"
    if authority_kind == "derived_relationship":
        return "non_binding"
    return "unknown"


def normalize_court_level(
    source_type: str | None,
    metadata: dict[str, Any] | None = None,
) -> CourtOrTribunalLevel | None:
    """Extract court/tribunal level from metadata if available."""
    if metadata:
        # Check explicit field
        if "court_level" in metadata:
            candidate = str(metadata["court_level"]).lower()
            if candidate in COURT_LEVELS:
                return COURT_LEVELS[candidate]
        # Check court name
        if "court" in metadata:
            court_str = str(metadata["court"]).lower()
            for key, level in COURT_LEVELS.items():
                if key in court_str:
                    return level
    return None


def compute_content_hash(text: str) -> str:
    """Compute SHA-256 hash of exact text content."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def derive_source_authenticity(url: str) -> SourceAuthenticity:
    """Classify authenticity from an actual canonical-source URL only.

    The canonical database is authoritative storage, but that alone does not
    establish that every ingested source is an official publication.  Keep
    unknown hosts explicitly unverified rather than upgrading their status.
    """
    host = (urlparse(url).hostname or "").lower()
    if host in {
        "legislation.gov.au",
        "www.legislation.gov.au",
        "homeaffairs.gov.au",
        "www.homeaffairs.gov.au",
        "immi.homeaffairs.gov.au",
    }:
        return "canonical_official"
    if host == "gov.au" or host.endswith(".gov.au"):
        return "official_copy"
    return "unverified"


def _usable_https_url(value: object) -> str | None:
    """Return an actual HTTPS value, never a synthesized fallback."""
    if isinstance(value, str) and value.startswith("https://"):
        return value
    return None


def _document_identity_from_split_title(title: str) -> str | None:
    """Extract a parent document identity from a generic split-Schedule title.

    This is document-structure parsing only.  It neither infers legal
    relevance nor maps a particular Schedule to a hard-coded URL.
    """
    match = re.match(r"^\s*(.+?)\s+-\s+schedule\s+[0-9]+[a-z]?\b", title, re.I)
    return match.group(1).strip() if match else None


class CanonicalEvidenceService:
    """Constructs CanonicalLocalEvidenceRef from actual canonical data."""

    def __init__(self, db: Session) -> None:
        self._db = db

    def _resolve_canonical_url(self, source: LegalSource) -> tuple[str, bool]:
        """Resolve a canonical URL without inventing provenance.

        A direct HTTPS URL is authoritative for that canonical row.  For a
        split Schedule row without one, a URL may be inherited only where the
        canonical database contains exactly one official HTTPS-bearing sibling
        for the same parsed document identity, source type, and jurisdiction.
        Authority labels are intentionally not an identity key: the corpus
        records the Schedule PDFs as "Federal Register of Legislation" while
        its same-document canonical compilation is labelled "Commonwealth of
        Australia". Ambiguity or a missing sibling fails closed.
        """
        direct_url = _usable_https_url(source.url)
        if direct_url:
            return direct_url, True

        metadata = source.metadata_json or {}
        for field_name in ("canonical_url", "canonical_document_url"):
            metadata_url = _usable_https_url(metadata.get(field_name))
            if metadata_url:
                return metadata_url, False

        document_identity = _document_identity_from_split_title(source.title)
        if document_identity is None:
            raise CanonicalEvidenceError(
                code="CANONICAL_URL_UNAVAILABLE",
                message="Canonical source has no usable canonical URL",
            )

        try:
            candidates = list(
                self._db.scalars(
                    select(LegalSource).where(
                        LegalSource.id != source.id,
                        LegalSource.status == source.status,
                        LegalSource.source_type == source.source_type,
                        LegalSource.jurisdiction == source.jurisdiction,
                        LegalSource.title.ilike(f"{document_identity} - %"),
                    )
                )
            )
        except Exception as exc:
            raise CanonicalEvidenceError(
                code="CANONICAL_URL_RESOLUTION_FAILED",
                message="Canonical document URL could not be resolved",
            ) from exc

        inherited_urls = {
            url
            for candidate in candidates
            if _document_identity_from_split_title(candidate.title) is None
            for url in [_usable_https_url(candidate.url)]
            if url is not None and derive_source_authenticity(url) == "canonical_official"
        }
        if len(inherited_urls) == 1:
            return inherited_urls.pop(), False

        raise CanonicalEvidenceError(
            code="CANONICAL_URL_UNAVAILABLE",
            message="Canonical source has no usable canonical URL",
        )

    def build_evidence_from_chunk(
        self,
        *,
        source_id: str,
        chunk_id: str,
        tool_call_id: str,
        registry: RequestEvidenceRegistry | None = None,
        provision_override: str | None = None,
    ) -> tuple[CanonicalLocalEvidenceRef, str | None]:
        """Build canonical evidence from an actual source chunk.

        Returns (evidence, registered_ref). registered_ref is None if
        no registry was provided.

        Raises CanonicalEvidenceError if source/chunk not found or
        chunk does not belong to source.
        """
        # Load source
        source = self._db.get(LegalSource, source_id)
        if source is None:
            raise SourceNotFoundError(source_id)

        # Load chunk
        chunk = self._db.get(SourceChunk, chunk_id)
        if chunk is None:
            raise ChunkNotFoundError(chunk_id)

        # Verify chunk belongs to source
        if chunk.source_id != source_id:
            raise ChunkSourceMismatchError()

        return self._build_from_loaded(
            source=source,
            chunk=chunk,
            tool_call_id=tool_call_id,
            registry=registry,
            provision_override=provision_override,
        )

    def build_evidence_from_source(
        self,
        *,
        source_id: str,
        tool_call_id: str,
        registry: RequestEvidenceRegistry | None = None,
        text_span: str | None = None,
        provision: str | None = None,
    ) -> tuple[CanonicalLocalEvidenceRef, str | None]:
        """Build canonical evidence from source without specific chunk.

        Used when exact text is provided directly from source content.
        """
        source = self._db.get(LegalSource, source_id)
        if source is None:
            raise SourceNotFoundError(source_id)

        if not text_span:
            raise CanonicalEvidenceError(
                code="TEXT_REQUIRED",
                message="Exact text span is required for canonical evidence",
            )

        # Normalize metadata
        source_type = normalize_source_type(source.source_type)
        authority_kind = normalize_authority_kind(
            source.source_type,
            source.metadata_json,
            document_title=source.title,
            document_version=source.document_version,
        )
        court_level = normalize_court_level(source.source_type, source.metadata_json)
        binding_status = normalize_binding_status(authority_kind, court_level)

        canonical_url, provenance_complete = self._resolve_canonical_url(source)
        source_authenticity = derive_source_authenticity(canonical_url)

        # Document version: use if available, else "unknown"
        document_version = source.document_version or "unknown"

        # Effective dates: only use if actually present
        effective_from = source.effective_date
        effective_to = source.repeal_date

        # Provision/span identifier
        provision_or_span = provision or "document_span"

        evidence = CanonicalLocalEvidenceRef(
            evidence_origin="canonical_local",
            evidence_ref="exact:pending",  # Will be replaced by registry
            source_type=source_type,
            source_authenticity=source_authenticity,
            authority_kind=authority_kind,
            jurisdiction=source.jurisdiction if source.jurisdiction else None,  # type: ignore[arg-type]
            binding_status=binding_status,
            court_or_tribunal_level=court_level,
            retrieved_at=datetime.now(timezone.utc),
            provenance_complete=provenance_complete,
            canonical_source_id=str(source.id),
            canonical_chunk_id=None,
            document_id=source.title,
            document_version=document_version,
            provision_or_span=provision_or_span,
            effective_from=effective_from,
            effective_to=effective_to,
            canonical_url=canonical_url,
            content_hash=compute_content_hash(text_span),
            text=text_span,
        )

        registered_ref: str | None = None
        if registry is not None:
            registered_ref = registry.register_canonical_evidence(
                evidence=evidence,
                tool_call_id=tool_call_id,
                tool_name="exact_legal_lookup",
            )
            # Update evidence with actual registered ref
            evidence = evidence.model_copy(update={"evidence_ref": registered_ref})

        return evidence, registered_ref

    def _build_from_loaded(
        self,
        *,
        source: LegalSource,
        chunk: SourceChunk,
        tool_call_id: str,
        registry: RequestEvidenceRegistry | None,
        provision_override: str | None,
    ) -> tuple[CanonicalLocalEvidenceRef, str | None]:
        """Build evidence from already-loaded source and chunk."""
        # Normalize metadata
        source_type = normalize_source_type(source.source_type)
        authority_kind = normalize_authority_kind(
            source.source_type,
            source.metadata_json,
            document_title=source.title,
            document_version=source.document_version,
        )
        court_level = normalize_court_level(source.source_type, source.metadata_json)
        binding_status = normalize_binding_status(authority_kind, court_level)

        canonical_url, provenance_complete = self._resolve_canonical_url(source)
        source_authenticity = derive_source_authenticity(canonical_url)

        # Document version
        document_version = source.document_version or "unknown"

        # Effective dates: only use if actually present
        effective_from = source.effective_date
        effective_to = source.repeal_date

        # Provision identifier: prefer override, then section_ref, then heading
        provision_or_span = (
            provision_override
            or chunk.section_ref
            or chunk.heading
            or f"chunk_{chunk.chunk_index}"
        )

        # Exact text from chunk
        exact_text = chunk.text

        evidence = CanonicalLocalEvidenceRef(
            evidence_origin="canonical_local",
            evidence_ref="exact:pending",
            source_type=source_type,
            source_authenticity=source_authenticity,
            authority_kind=authority_kind,
            jurisdiction=source.jurisdiction if source.jurisdiction else None,  # type: ignore[arg-type]
            binding_status=binding_status,
            court_or_tribunal_level=court_level,
            retrieved_at=datetime.now(timezone.utc),
            provenance_complete=provenance_complete,
            canonical_source_id=str(source.id),
            canonical_chunk_id=str(chunk.id),
            document_id=source.title,
            document_version=document_version,
            provision_or_span=provision_or_span,
            effective_from=effective_from,
            effective_to=effective_to,
            canonical_url=canonical_url,
            content_hash=compute_content_hash(exact_text),
            text=exact_text,
        )

        registered_ref: str | None = None
        if registry is not None:
            registered_ref = registry.register_canonical_evidence(
                evidence=evidence,
                tool_call_id=tool_call_id,
                tool_name="exact_legal_lookup",
            )
            evidence = evidence.model_copy(update={"evidence_ref": registered_ref})

        return evidence, registered_ref
