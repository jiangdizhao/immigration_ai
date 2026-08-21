"""Phase 4B — Exact legal source lookup service.

Coverage-aware exact lookup against the canonical PostgreSQL corpus.

This service:
- Loads/validates the Phase 4A coverage report
- Returns canonical local matches only for covered families
- Preserves available_partial status/gaps in results
- Returns honest absent/unknown results for uncovered families
- Extracts and resolves cross-references (bounded)
- NEVER fabricates, downloads, or substitutes content

CRITICAL INVARIANTS:
- "not locally found" NEVER means "does not legally exist"
- available_partial results preserve gap information
- unresolved cross-references are explicit, not silent
- fuzzy matches are NEVER represented as exact wording
"""

from __future__ import annotations

import logging
import re
import time
from dataclasses import dataclass
from typing import Any

from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session, joinedload

from app.db.models import LegalSource, SourceChunk
from app.schemas.evidence import CanonicalLocalEvidenceRef
from app.schemas.tools import (
    CorpusCoverage,
    ExactLegalLookupOutput,
    ExactLegalLookupRequest,
    ExactLegalMatch,
    ResolvedCrossReference,
)
from app.services.canonical_evidence_service import CanonicalEvidenceService
from app.services.cross_reference_parser import (
    MAX_CROSS_REFERENCE_DEPTH,
    LegalLocator,
    classify_locator_family,
    classify_schedule_family,
    extract_cross_references,
)
from app.services.exact_lookup_coverage import (
    CoverageReportError,
    LoadedCoverageReport,
    get_coverage_for_lookup,
    load_coverage_report,
)
from app.services.request_evidence_registry import RequestEvidenceRegistry

logger = logging.getLogger(__name__)


class ExactLookupError(Exception):
    """Error during exact legal lookup."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass(slots=True)
class UnresolvedCrossReference:
    """A cross-reference that could not be resolved locally."""

    locator: LegalLocator
    reason: str  # Why it's unresolved
    coverage_status: str | None = None  # Coverage status of target family
    gap_reason: str | None = None


@dataclass(slots=True)
class LookupResult:
    """Internal lookup result before schema conversion."""

    matches: list[tuple[CanonicalLocalEvidenceRef, str, str]]  # (evidence, ref, match_type)
    resolved_cross_refs: list[tuple[str, list[str]]]  # (locator, [evidence_refs])
    unresolved_cross_refs: list[UnresolvedCrossReference]
    coverage_status: str
    coverage_gap_reason: str | None
    family_id: str | None
    duration_ms: float


class ExactLegalSourceService:
    """Coverage-aware exact legal lookup against canonical corpus.

    This service does NOT:
    - Make LLM calls
    - Make web calls
    - Mutate canonical data
    - Perform query-time ingestion
    - Silently fall back to other retrieval methods
    """

    def __init__(
        self,
        db: Session,
        *,
        coverage_report: LoadedCoverageReport | None = None,
        coverage_report_path: Any = None,
    ) -> None:
        self._db = db
        self._evidence_service = CanonicalEvidenceService(db)
        self._coverage: LoadedCoverageReport | None = coverage_report
        self._coverage_report_path = coverage_report_path

    def _get_coverage(self) -> LoadedCoverageReport:
        """Load coverage report lazily."""
        if self._coverage is None:
            self._coverage = load_coverage_report(self._coverage_report_path)
        return self._coverage

    def lookup(
        self,
        request: ExactLegalLookupRequest,
        *,
        registry: RequestEvidenceRegistry,
        tool_call_id: str,
    ) -> ExactLegalLookupOutput:
        """Perform exact legal lookup.

        Returns ExactLegalLookupOutput with:
        - matches: canonical evidence refs with match types
        - resolved_cross_references: locators with evidence refs
        - unresolved_cross_references: locators that couldn't be resolved
        - coverage: family coverage status from Phase 4A report
        - corpus_version, index_version: from coverage report
        """
        start_time = time.monotonic()

        try:
            coverage = self._get_coverage()
        except CoverageReportError as exc:
            return self._build_error_output(
                request=request,
                coverage_status="unknown",
                gap_reason=f"Coverage report error: {exc.message}",
                corpus_version="unknown",
                index_version="unknown",
            )

        family_id = self._determine_family(request)
        coverage_status, gap_reason = get_coverage_for_lookup(coverage, family_id)

        if coverage_status == "absent":
            return self._build_gap_output(
                request=request,
                coverage=coverage,
                family_id=family_id,
                coverage_status="absent",
                gap_reason=gap_reason,
                duration_ms=(time.monotonic() - start_time) * 1000,
            )

        if coverage_status == "unknown":
            return self._build_gap_output(
                request=request,
                coverage=coverage,
                family_id=family_id,
                coverage_status="unknown",
                gap_reason=gap_reason,
                duration_ms=(time.monotonic() - start_time) * 1000,
            )

        matches = self._find_matches(
            request=request,
            family_id=family_id,
            registry=registry,
            tool_call_id=tool_call_id,
        )

        resolved_refs: list[tuple[str, list[str]]] = []
        unresolved_refs: list[UnresolvedCrossReference] = []

        if request.follow_cross_references and matches:
            resolved_refs, unresolved_refs = self._process_cross_references(
                matches=matches,
                coverage=coverage,
                registry=registry,
                tool_call_id=tool_call_id,
                depth=0,
            )

        duration_ms = (time.monotonic() - start_time) * 1000
        output = self._build_output(
            request=request,
            coverage=coverage,
            family_id=family_id,
            matches=matches,
            resolved_refs=resolved_refs,
            unresolved_refs=unresolved_refs,
            coverage_status=coverage_status,
            gap_reason=gap_reason,
            duration_ms=duration_ms,
        )
        registry.record_exact_lookup_outcome(
            tool_call_id=tool_call_id,
            unresolved_cross_references=output.unresolved_cross_references,
        )
        return output

    def _determine_family(self, request: ExactLegalLookupRequest) -> str | None:
        """Determine target source family from request."""
        if request.schedule:
            schedule_family = classify_schedule_family(request.schedule)
            if schedule_family:
                return schedule_family

        locator_text = " ".join(
            value for value in (request.document_id, request.query) if value
        )
        if locator_text:
            locators = extract_cross_references(locator_text)
            schedule_locators = [
                item.locator
                for item in locators
                if item.locator.locator_type == "schedule"
            ]
            if schedule_locators:
                for locator in schedule_locators:
                    family = classify_schedule_family(locator.target_provision or "")
                    if family:
                        return family
                return None

            doc_lower = locator_text.lower()
            if "migration act" in doc_lower:
                return "migration_act"
            if "migration regulations" in doc_lower:
                return "migration_regulations"

        if request.source_types:
            for st in request.source_types:
                st_lower = st.lower()
                if "instrument" in st_lower:
                    return "legislative_instruments"
                if "tribunal" in st_lower:
                    return "art_tribunal_material"
                if "court" in st_lower or "decision" in st_lower:
                    return "court_decisions"
                if "legislation" in st_lower:
                    return "migration_regulations"
                if "guidance" in st_lower:
                    return "home_affairs_guidance"

        if request.case_citation:
            return "court_decisions"

        return None

    def _find_matches(
        self,
        *,
        request: ExactLegalLookupRequest,
        family_id: str | None,
        registry: RequestEvidenceRegistry,
        tool_call_id: str,
    ) -> list[tuple[CanonicalLocalEvidenceRef, str, str]]:
        """Find matching chunks in canonical corpus."""
        matches: list[tuple[CanonicalLocalEvidenceRef, str, str]] = []

        stmt = (
            select(SourceChunk)
            .join(LegalSource, LegalSource.id == SourceChunk.source_id)
            .options(joinedload(SourceChunk.source))
            .where(LegalSource.status == "active")
            .order_by(LegalSource.title.asc(), SourceChunk.chunk_index.asc(), SourceChunk.id.asc())
            .limit(request.max_hits)
        )

        family_condition = self._family_source_condition(family_id)
        if family_condition is None:
            return []
        stmt = stmt.where(family_condition)

        conditions = []

        schedule_scope = request.schedule or self._schedule_from_family_id(family_id)
        if schedule_scope:
            conditions.append(self._schedule_chunk_condition(schedule_scope))

        if request.provision:
            provision_pattern = f"%{request.provision}%"
            conditions.append(
                or_(
                    SourceChunk.section_ref.ilike(provision_pattern),
                    SourceChunk.text.ilike(provision_pattern),
                )
            )

        if request.subclass:
            subclass_pattern = f"%{request.subclass}%"
            conditions.append(SourceChunk.text.ilike(subclass_pattern))

        if request.query:
            query_pattern = f"%{request.query}%"
            conditions.append(
                or_(
                    SourceChunk.text.ilike(query_pattern),
                    SourceChunk.heading.ilike(query_pattern),
                )
            )

        if request.document_id:
            doc_lower = request.document_id.lower()
            document_id_is_family_locator = (
                (family_id == "migration_act" and "migration act" in doc_lower)
                or (
                    family_id == "migration_regulations"
                    and "migration regulations" in doc_lower
                )
                or self._schedule_from_family_id(family_id) is not None
            )
            if not document_id_is_family_locator:
                conditions.append(LegalSource.title.ilike(f"%{request.document_id}%"))

        if request.source_types:
            conditions.append(
                LegalSource.source_type.in_(
                    [source_type.strip().lower() for source_type in request.source_types]
                )
            )

        if conditions:
            stmt = stmt.where(and_(*conditions))

        try:
            chunks = list(self._db.scalars(stmt))
        except Exception as exc:
            logger.error("Exact lookup query failed: %s", exc)
            return []

        for chunk in chunks:
            try:
                evidence, ref = self._evidence_service.build_evidence_from_chunk(
                    source_id=str(chunk.source_id),
                    chunk_id=str(chunk.id),
                    tool_call_id=tool_call_id,
                    registry=registry,
                )
                match_type = self._classify_match_type(request, chunk)
                matches.append((evidence, ref or "", match_type))
            except Exception as exc:
                logger.warning("Failed to build evidence for chunk %s: %s", chunk.id, exc)
                continue

        return matches

    @staticmethod
    def _schedule_locator_pattern(schedule: str) -> str:
        """Return an exact Schedule locator pattern with alphanumeric boundaries."""
        normalized = schedule.strip().upper()
        return rf"(^|[^[:alnum:]])schedule[[:space:]]+{re.escape(normalized)}([^[:alnum:]]|$)"

    @staticmethod
    def _schedule_header_pattern(schedule: str) -> str:
        """Return an anchored page-heading pattern for one Schedule."""
        normalized = schedule.strip().upper()
        return rf"^[[:space:]]*schedule[[:space:]]+{re.escape(normalized)}([^[:alnum:]]|$)"

    @staticmethod
    def _schedule_from_family_id(family_id: str | None) -> str | None:
        if not family_id or not family_id.startswith("migration_regulations_schedule_"):
            return None
        return family_id.removeprefix("migration_regulations_schedule_").upper()

    @classmethod
    def _schedule_title_condition(cls, schedule: str):
        """Legacy exact Schedule locator match for schedule-specific source titles."""
        return LegalSource.title.op("~*")(cls._schedule_locator_pattern(schedule))

    @classmethod
    def _schedule_chunk_condition(cls, schedule: str):
        """Match structural Schedule ownership in legacy and volume corpora.

        Legacy corpora use one source per Schedule, so the source title is the
        structural boundary.  Current official compilations are ingested by
        volume/page: the PDF page heading is copied to every chunk derived from
        that page.  Only an anchored page heading is therefore authoritative
        for Schedule ownership.  Chunk body text is deliberately not used when
        a heading exists because split chunks can begin with cross-references to
        another Schedule.
        """
        locator_pattern = cls._schedule_locator_pattern(schedule)
        header_pattern = cls._schedule_header_pattern(schedule)
        missing_heading = or_(SourceChunk.heading.is_(None), SourceChunk.heading == "")
        return or_(
            LegalSource.title.op("~*")(locator_pattern),
            SourceChunk.heading.op("~*")(header_pattern),
            and_(missing_heading, SourceChunk.text.op("~*")(header_pattern)),
        )

    @staticmethod
    def _migration_regulations_source_condition():
        return and_(
            LegalSource.source_type.in_(["legislation", "regulation", "regulations"]),
            or_(
                LegalSource.title.ilike("%Migration Regulations%"),
                LegalSource.document_version.ilike("F%"),
            ),
        )

    @staticmethod
    def _family_source_condition(family_id: str | None):
        """Return the deterministic canonical-source scope for a family.

        The coverage report authorizes a family, not the entire corpus.  A
        Schedule family is scoped first to Migration Regulations sources and
        then, in ``_find_matches``, to the page's structural Schedule heading.
        This preserves the existing exact-lookup architecture while supporting
        both legacy schedule-per-source and current official volume corpora.
        """
        if family_id is None:
            return None
        if family_id.startswith("migration_regulations_schedule_"):
            return ExactLegalSourceService._migration_regulations_source_condition()
        if family_id == "migration_act":
            return and_(
                LegalSource.source_type.in_(["legislation", "act", "statute"]),
                or_(
                    LegalSource.title.ilike("%Migration Act%"),
                    LegalSource.document_version.ilike("C%"),
                ),
            )
        if family_id == "migration_regulations":
            return ExactLegalSourceService._migration_regulations_source_condition()
        if family_id == "home_affairs_guidance":
            return LegalSource.source_type.in_(["official_guidance", "guidance", "policy"])
        if family_id == "art_tribunal_material":
            return LegalSource.source_type.in_(["tribunal_decision", "tribunal"])
        if family_id == "court_decisions":
            return LegalSource.source_type.in_(["court_decision", "case"])
        if family_id == "legislative_instruments":
            return LegalSource.source_type.in_(["legislative_instrument", "instrument"])
        return None

    def _classify_match_type(
        self,
        request: ExactLegalLookupRequest,
        chunk: SourceChunk,
    ) -> str:
        """Classify match type: exact, normalized, or fuzzy."""
        if request.provision and chunk.section_ref:
            if request.provision.lower() in chunk.section_ref.lower():
                return "exact"
        if request.query:
            if request.query.lower() in chunk.text.lower():
                return "exact"
            normalized_query = re.sub(r"\s+", " ", request.query.lower().strip())
            normalized_text = re.sub(r"\s+", " ", chunk.text.lower())
            if normalized_query in normalized_text:
                return "normalized"
        return "fuzzy"

    def _process_cross_references(
        self,
        *,
        matches: list[tuple[CanonicalLocalEvidenceRef, str, str]],
        coverage: LoadedCoverageReport,
        registry: RequestEvidenceRegistry,
        tool_call_id: str,
        depth: int,
    ) -> tuple[list[tuple[str, list[str]]], list[UnresolvedCrossReference]]:
        """Extract and resolve cross-references from match texts."""
        if depth >= MAX_CROSS_REFERENCE_DEPTH:
            return [], []

        resolved: list[tuple[str, list[str]]] = []
        unresolved: list[UnresolvedCrossReference] = []
        seen_locators: set[str] = set()

        for evidence, ref, _ in matches:
            refs = extract_cross_references(evidence.text)

            for xref in refs:
                locator = xref.locator
                if locator.normalized in seen_locators:
                    continue
                seen_locators.add(locator.normalized)

                resolution = self._resolve_cross_reference(
                    locator=locator,
                    coverage=coverage,
                    registry=registry,
                    tool_call_id=tool_call_id,
                )

                if resolution is not None:
                    resolved.append((locator.surface_form, resolution))
                else:
                    family_id = classify_locator_family(locator)
                    cov_status, gap = get_coverage_for_lookup(coverage, family_id)

                    reason = "Target not found in local corpus"
                    if cov_status == "absent":
                        reason = "Target family has no local coverage"
                    elif cov_status == "unknown":
                        reason = "Target family coverage unknown"
                    elif locator.is_ambiguous:
                        reason = "Locator is ambiguous (document not specified)"

                    unresolved.append(
                        UnresolvedCrossReference(
                            locator=locator,
                            reason=reason,
                            coverage_status=cov_status,
                            gap_reason=gap,
                        )
                    )

        return resolved, unresolved

    def _resolve_cross_reference(
        self,
        *,
        locator: LegalLocator,
        coverage: LoadedCoverageReport,
        registry: RequestEvidenceRegistry,
        tool_call_id: str,
    ) -> list[str] | None:
        """Attempt to resolve a cross-reference locally.

        Returns list of evidence refs if resolved, None otherwise.
        NEVER resolves to a "similar" provision; exact match only.
        """
        if locator.is_ambiguous:
            return None

        family_id = classify_locator_family(locator)
        if family_id is None:
            return None

        cov_status, _ = get_coverage_for_lookup(coverage, family_id)
        if cov_status not in ("available_complete", "available_partial"):
            return None

        stmt = (
            select(SourceChunk)
            .join(LegalSource, LegalSource.id == SourceChunk.source_id)
            .options(joinedload(SourceChunk.source))
            .where(LegalSource.status == "active")
            .order_by(LegalSource.title.asc(), SourceChunk.chunk_index.asc(), SourceChunk.id.asc())
            .limit(3)
        )
        family_condition = self._family_source_condition(family_id)
        if family_condition is None:
            return None
        stmt = stmt.where(family_condition)

        if locator.locator_type == "schedule":
            stmt = stmt.where(self._schedule_chunk_condition(locator.target_provision or ""))
        elif locator.locator_type in ("regulation", "subregulation"):
            stmt = stmt.where(
                SourceChunk.section_ref.ilike(f"%{locator.target_provision}%")
            )
        elif locator.locator_type == "clause":
            stmt = stmt.where(
                or_(
                    SourceChunk.section_ref.ilike(f"%{locator.target_provision}%"),
                    SourceChunk.heading.ilike(f"%clause {locator.target_provision}%"),
                )
            )
        elif locator.locator_type == "act":
            stmt = stmt.where(self._family_source_condition("migration_act"))
        else:
            return None

        try:
            chunks = list(self._db.scalars(stmt))
        except Exception:
            return None

        if not chunks:
            return None

        refs: list[str] = []
        for chunk in chunks:
            try:
                _, ref = self._evidence_service.build_evidence_from_chunk(
                    source_id=str(chunk.source_id),
                    chunk_id=str(chunk.id),
                    tool_call_id=tool_call_id,
                    registry=registry,
                )
                if ref:
                    refs.append(ref)
            except Exception:
                continue

        return refs if refs else None

    def _build_output(
        self,
        *,
        request: ExactLegalLookupRequest,
        coverage: LoadedCoverageReport,
        family_id: str | None,
        matches: list[tuple[CanonicalLocalEvidenceRef, str, str]],
        resolved_refs: list[tuple[str, list[str]]],
        unresolved_refs: list[UnresolvedCrossReference],
        coverage_status: str,
        gap_reason: str | None,
        duration_ms: float,
    ) -> ExactLegalLookupOutput:
        """Build the final lookup output."""
        exact_matches = [
            ExactLegalMatch(
                canonical_evidence_ref=evidence.model_copy(
                    update={"evidence_ref": ref}
                ),
                match_type=match_type,  # type: ignore[arg-type]
            )
            for evidence, ref, match_type in matches
        ]

        resolved_cross_refs = [
            ResolvedCrossReference(locator=locator, evidence_refs=refs)
            for locator, refs in resolved_refs
        ]
        unresolved_cross_refs = [u.locator.surface_form for u in unresolved_refs]

        family_name = family_id or "unknown"
        if family_id:
            info = coverage.get_family(family_id)
            if info:
                family_name = info.family

        return ExactLegalLookupOutput(
            matches=exact_matches,
            resolved_cross_references=resolved_cross_refs,
            unresolved_cross_references=unresolved_cross_refs,
            coverage=CorpusCoverage(
                family=family_name,
                status=coverage_status,  # type: ignore[arg-type]
                report_version=coverage.report_hash[:16],
                gap_reason=gap_reason,
            ),
            corpus_version=coverage.report.corpus_version or "unknown",
            index_version=coverage.report.index_version or "unknown",
        )

    def _build_gap_output(
        self,
        *,
        request: ExactLegalLookupRequest,
        coverage: LoadedCoverageReport,
        family_id: str | None,
        coverage_status: str,
        gap_reason: str | None,
        duration_ms: float,
    ) -> ExactLegalLookupOutput:
        """Build output for absent/unknown coverage (no local results)."""
        family_name = family_id or "unknown"
        if family_id:
            info = coverage.get_family(family_id)
            if info:
                family_name = info.family

        return ExactLegalLookupOutput(
            matches=[],
            resolved_cross_references=[],
            unresolved_cross_references=[],
            coverage=CorpusCoverage(
                family=family_name,
                status=coverage_status,  # type: ignore[arg-type]
                report_version=coverage.report_hash[:16],
                gap_reason=gap_reason,
            ),
            corpus_version=coverage.report.corpus_version or "unknown",
            index_version=coverage.report.index_version or "unknown",
        )

    def _build_error_output(
        self,
        *,
        request: ExactLegalLookupRequest,
        coverage_status: str,
        gap_reason: str | None,
        corpus_version: str,
        index_version: str,
    ) -> ExactLegalLookupOutput:
        """Build output for coverage report errors."""
        return ExactLegalLookupOutput(
            matches=[],
            resolved_cross_references=[],
            unresolved_cross_references=[],
            coverage=CorpusCoverage(
                family="unknown",
                status=coverage_status,  # type: ignore[arg-type]
                report_version="error",
                gap_reason=gap_reason,
            ),
            corpus_version=corpus_version,
            index_version=index_version,
        )
