"""Phase 4A — Canonical Corpus Coverage Report schema.

Read-only audit schema.  No mutation, no ingestion, no network access.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

# ── coverage status ──────────────────────────────────────────────────────────

CoverageStatus = Literal[
    "available_complete",
    "available_partial",
    "absent",
    "unknown",
]

# ── source family record ─────────────────────────────────────────────────────


class SourceFamilyRecord(BaseModel):
    """One audited source family."""

    family_id: str = Field(..., description="Stable machine-readable family identifier")
    family: str = Field(..., description="Human-readable family name")
    available: bool = Field(
        ..., description="True when at least one canonical source was found"
    )
    coverage_status: CoverageStatus = Field(
        ..., description="Conservative coverage classification"
    )
    source_count: int = Field(default=0, ge=0)
    chunk_count: int = Field(default=0, ge=0)
    versions: list[str] = Field(default_factory=list)
    effective_date_metadata_complete: bool = Field(
        default=False,
        description="Every source in this family has a non-null effective_date",
    )
    provision_boundaries_available: bool = Field(
        default=False,
        description="Chunks have section_ref or heading metadata suitable for provision lookup",
    )
    canonical_urls_available: bool = Field(
        default=False,
        description="Every source in this family has a non-null url",
    )
    gap_reason: str | None = Field(
        default=None,
        description="Why coverage is partial/absent/unknown",
    )
    sample_source_ids: list[str] = Field(
        default_factory=list, max_length=5
    )
    sample_titles: list[str] = Field(
        default_factory=list, max_length=5
    )
    sample_canonical_urls: list[str] = Field(
        default_factory=list, max_length=5
    )


# ── top-level report ─────────────────────────────────────────────────────────


class CanonicalCorpusCoverageReport(BaseModel):
    """Phase 4A canonical corpus coverage audit report."""

    schema_version: str = Field(
        default="canonical_corpus_coverage.v1", frozen=True
    )
    audit_time_utc: str = Field(
        ..., description="ISO-8601 UTC timestamp of audit execution"
    )
    corpus_version: str | None = Field(
        default=None,
        description="Corpus version string from infrastructure, or null if unknown",
    )
    index_version: str | None = Field(
        default=None,
        description="Index version string from infrastructure, or null if unknown",
    )
    source_families: list[SourceFamilyRecord] = Field(
        default_factory=list,
        description="Audited source families in deterministic order",
    )
    overall_input_fingerprint: str = Field(
        ...,
        description="Deterministic fingerprint of the audited canonical input inventory",
    )
    report_hash: str = Field(
        ...,
        description="SHA-256 over canonical normalized substantive report data excluding report_hash and audit_time_utc",
    )


# ── helper: deterministic JSON for hashing ───────────────────────────────────


def canonical_json(obj: Any) -> bytes:
    """Serialize *obj* to canonical deterministic UTF-8 JSON bytes.

    Keys are sorted; no trailing whitespace; no non-deterministic
    formatting.  Suitable for stable SHA-256 hashing.
    """
    import json as _json

    return _json.dumps(
        obj,
        sort_keys=True,
        ensure_ascii=False,
        separators=(",", ":"),
        default=str,
    ).encode("utf-8")


def compute_report_hash(report_dict: dict[str, Any]) -> str:
    """Return SHA-256 hex digest of the substantive report data.

    *report_dict* must be a plain dict representation of
    ``CanonicalCorpusCoverageReport``.  The fields ``report_hash`` and
    ``audit_time_utc`` are stripped before hashing so that the hash is
    stable across audit runs on an unchanged corpus.
    """
    import hashlib

    payload = {k: v for k, v in report_dict.items() if k not in {"report_hash", "audit_time_utc"}}
    return hashlib.sha256(canonical_json(payload)).hexdigest()