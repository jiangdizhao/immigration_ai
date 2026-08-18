"""Phase 4B — Coverage report loading for exact legal lookup.

Loads and validates the Phase 4A canonical corpus coverage report.
Exact lookup is gated by this report: only families with confirmed
coverage may return local results.

CRITICAL: available_partial means local search is allowed BUT the
partial status/gaps must be preserved in results. Absence from local
data NEVER means "this legal requirement does not exist".
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from app.schemas.canonical_corpus_coverage import (
    CanonicalCorpusCoverageReport,
    compute_report_hash,
)

logger = logging.getLogger(__name__)

# Default path to the Phase 4A coverage report
DEFAULT_REPORT_PATH = Path(__file__).resolve().parents[2] / "artifacts" / "canonical_corpus_coverage_report.json"

CoverageStatus = Literal["available_complete", "available_partial", "absent", "unknown"]


class CoverageReportError(Exception):
    """Error loading or validating coverage report."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


class CoverageReportMissingError(CoverageReportError):
    def __init__(self, path: Path) -> None:
        super().__init__(
            code="COVERAGE_REPORT_MISSING",
            message=f"Coverage report not found at {path}",
        )
        self.path = path


class CoverageReportInvalidError(CoverageReportError):
    def __init__(self, reason: str) -> None:
        super().__init__(
            code="COVERAGE_REPORT_INVALID",
            message=f"Coverage report is invalid: {reason}",
        )
        self.reason = reason


@dataclass(slots=True)
class FamilyCoverageInfo:
    """Coverage information for a source family."""

    family_id: str
    family: str
    coverage_status: CoverageStatus
    available: bool
    gap_reason: str | None
    source_count: int
    chunk_count: int
    effective_date_metadata_complete: bool
    provision_boundaries_available: bool
    canonical_urls_available: bool
    versions: list[str]


@dataclass(slots=True)
class LoadedCoverageReport:
    """Loaded and validated coverage report."""

    report: CanonicalCorpusCoverageReport
    report_path: Path
    report_hash: str
    families: dict[str, FamilyCoverageInfo]

    def get_family(self, family_id: str) -> FamilyCoverageInfo | None:
        return self.families.get(family_id)

    def find_family_by_name(self, name: str) -> FamilyCoverageInfo | None:
        """Find family by name substring match (case-insensitive)."""
        name_lower = name.lower()
        for info in self.families.values():
            if name_lower in info.family.lower() or name_lower in info.family_id.lower():
                return info
        return None

    def is_family_available(self, family_id: str) -> bool:
        """Check if family has any local coverage (complete or partial)."""
        info = self.families.get(family_id)
        return info is not None and info.available


def load_coverage_report(
    path: Path | None = None,
    *,
    validate_hash: bool = True,
) -> LoadedCoverageReport:
    """Load and validate the Phase 4A coverage report.

    Args:
        path: Path to report JSON. Defaults to artifacts location.
        validate_hash: Whether to validate report hash integrity.

    Returns:
        LoadedCoverageReport with family lookup.

    Raises:
        CoverageReportMissingError: If report file doesn't exist.
        CoverageReportInvalidError: If report fails validation.
    """
    report_path = path or DEFAULT_REPORT_PATH

    if not report_path.exists():
        raise CoverageReportMissingError(report_path)

    try:
        raw_content = report_path.read_text(encoding="utf-8")
        raw_data = json.loads(raw_content)
    except json.JSONDecodeError as exc:
        raise CoverageReportInvalidError(f"JSON parse error: {exc}") from exc
    except OSError as exc:
        raise CoverageReportInvalidError(f"Read error: {exc}") from exc

    # Validate schema
    try:
        report = CanonicalCorpusCoverageReport(**raw_data)
    except Exception as exc:
        raise CoverageReportInvalidError(f"Schema validation failed: {exc}") from exc

    # Validate hash integrity
    if validate_hash:
        expected_hash = compute_report_hash(raw_data)
        if report.report_hash != expected_hash:
            raise CoverageReportInvalidError(
                f"Report hash mismatch: expected {expected_hash}, got {report.report_hash}"
            )

    # Build family lookup
    families: dict[str, FamilyCoverageInfo] = {}
    for fam in report.source_families:
        families[fam.family_id] = FamilyCoverageInfo(
            family_id=fam.family_id,
            family=fam.family,
            coverage_status=fam.coverage_status,  # type: ignore[arg-type]
            available=fam.available,
            gap_reason=fam.gap_reason,
            source_count=fam.source_count,
            chunk_count=fam.chunk_count,
            effective_date_metadata_complete=fam.effective_date_metadata_complete,
            provision_boundaries_available=fam.provision_boundaries_available,
            canonical_urls_available=fam.canonical_urls_available,
            versions=fam.versions,
        )

    return LoadedCoverageReport(
        report=report,
        report_path=report_path,
        report_hash=report.report_hash,
        families=families,
    )


def get_coverage_for_lookup(
    loaded: LoadedCoverageReport,
    family_id: str | None,
) -> tuple[CoverageStatus, str | None]:
    """Get coverage status for exact lookup output.

    Returns (status, gap_reason).

    - available_complete: Full local coverage
    - available_partial: Local search allowed, gaps preserved
    - absent: No local coverage; honest gap result
    - unknown: Cannot determine coverage
    """
    if family_id is None:
        return "unknown", "No source family specified"

    info = loaded.get_family(family_id)
    if info is None:
        # Try name-based lookup
        info = loaded.find_family_by_name(family_id)

    if info is None:
        return "unknown", f"Source family '{family_id}' not found in coverage report"

    if not info.available:
        return "absent", info.gap_reason or "No canonical sources found for this family"

    return info.coverage_status, info.gap_reason