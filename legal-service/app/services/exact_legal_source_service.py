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

from sqlalchemy import and_, func, not_, or_, select, true
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


# Current official Schedule-2 volume chunks preserve clause starts in the
# first structural lines, while continuation chunks contain subsection text
# only.  This deliberately recognizes only the Schedule-2 clause form here;
# other legal families retain their existing exact-lookup semantics until an
# equivalent structural boundary contract is established for them.
_SCHEDULE2_PROVISION_START_RE = re.compile(
    r"(?im)^\s*(?:(?P<label>clause)\s+)?"
    r"(?P<provision>[0-9]{3}\.[0-9A-Z]+)"
    r"(?:[ \t]*(?:[—–-].*)?)\s*$"
)
_SCHEDULE2_SUBSECTION_START_RE = re.compile(
    r"(?i)^\s*\([0-9A-Z]+\)(?:\s|$)"
)
_SCHEDULE_MARKER_RE = re.compile(r"(?i)\bschedule\s+(?P<schedule>[0-9]+[A-Z]?)\b")
_SUBCLASS_MARKER_RE = re.compile(r"(?i)\bsubclass\s+(?P<subclass>[0-9]{3})\b")

# Backend-owned cap for one identified Schedule-2 provision block.  Keep this
# aligned with the existing maximum serialized exact matches; model-supplied
# ``max_hits`` must not lower this completeness cap.
SCHEDULE2_PROVISION_BLOCK_MAX_CHUNKS = 20


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

        block_metadata: dict[str, bool | None] = {
            "provision_block_complete": None,
            "provision_block_backend_cap_reached": False,
        }
        matches = self._find_matches(
            request=request,
            family_id=family_id,
            registry=registry,
            tool_call_id=tool_call_id,
            block_metadata=block_metadata,
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
            provision_block_complete=block_metadata["provision_block_complete"],
            provision_block_backend_cap_reached=bool(
                block_metadata["provision_block_backend_cap_reached"]
            ),
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
        block_metadata: dict[str, bool | None] | None = None,
    ) -> list[tuple[CanonicalLocalEvidenceRef, str, str]]:
        """Find matching chunks in canonical corpus."""
        matches: list[tuple[CanonicalLocalEvidenceRef, str, str]] = []

        provision_block_lookup = self._is_schedule2_provision_block_lookup(
            request=request,
            family_id=family_id,
        )

        candidate_limit = (
            SCHEDULE2_PROVISION_BLOCK_MAX_CHUNKS
            if provision_block_lookup
            else request.max_hits
        )
        stmt = (
            select(SourceChunk)
            .join(LegalSource, LegalSource.id == SourceChunk.source_id)
            .options(joinedload(SourceChunk.source))
            .where(LegalSource.status == "active")
            .order_by(
                LegalSource.effective_date.desc().nullslast(),
                LegalSource.document_version.desc().nullslast(),
                LegalSource.title.asc(),
                SourceChunk.chunk_index.asc(),
                SourceChunk.id.asc(),
            )
            .limit(candidate_limit)
        )

        family_condition = self._family_source_condition(family_id)
        if family_condition is None:
            return []
        stmt = stmt.where(family_condition)
        stmt = stmt.where(self._authoritative_source_condition(family_id, request.as_of_date))

        conditions = []

        schedule_scope = request.schedule or self._schedule_from_family_id(family_id)
        if schedule_scope:
            conditions.append(self._schedule_chunk_condition(schedule_scope))

        if request.provision:
            conditions.append(
                self._provision_structure_condition(
                    request.provision,
                    family_id=family_id,
                )
            )

        if request.subclass:
            conditions.append(self._subclass_structure_condition(request.subclass))

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

        if provision_block_lookup:
            chunks, block_complete, cap_reached = self._expand_schedule2_provision_blocks(
                request=request,
                candidate_chunks=chunks,
            )
            if block_metadata is not None:
                block_metadata.update({
                    "provision_block_complete": block_complete,
                    "provision_block_backend_cap_reached": cap_reached,
                })
        else:
            chunks = chunks[: request.max_hits]

        for chunk in chunks:
            try:
                evidence, ref = self._evidence_service.build_evidence_from_chunk(
                    source_id=str(chunk.source_id),
                    chunk_id=str(chunk.id),
                    tool_call_id=tool_call_id,
                    registry=registry,
                    provision_override=request.provision,
                )
                match_type = self._classify_match_type(request, chunk)
                matches.append((evidence, ref or "", match_type))
            except Exception as exc:
                logger.warning("Failed to build evidence for chunk %s: %s", chunk.id, exc)
                continue

        return matches

    @staticmethod
    def _is_schedule2_provision_block_lookup(
        *,
        request: ExactLegalLookupRequest,
        family_id: str | None,
    ) -> bool:
        """Return whether the safe Schedule-2 block contract applies.

        A free-form query can intentionally search within a provision and
        must retain the existing query semantics.  Block expansion is limited
        to structured provision requests in the Schedule-2 family.
        """
        return bool(
            request.provision
            and request.query is None
            and family_id == "migration_regulations_schedule_2"
        )

    @classmethod
    def _schedule2_provision_markers(cls, chunk: SourceChunk) -> list[str]:
        """Extract structural Schedule-2 provision starts from one chunk."""
        return [
            marker
            for marker, _ in cls._schedule2_provision_start_candidates(chunk)
        ]

    @classmethod
    def _schedule2_provision_start_candidates(
        cls,
        chunk: SourceChunk,
    ) -> list[tuple[str, int]]:
        """Return provision markers with deterministic structural strength.

        An explicit ``Clause`` line is the strongest signal.  A bare line is
        also strong when the next non-empty line begins a subsection, which
        matches the persisted Schedule-2 layout for bare starts such as
        ``030.613``.  Other bare markers remain weak candidates so direct-prose
        provisions retain compatibility, but a later strong start can displace
        an earlier line-broken incidental reference.
        """
        heading = str(getattr(chunk, "heading", "") or "")
        prefix = str(getattr(chunk, "text", "") or "")[:1200]
        content = f"{heading}\n{prefix}"
        candidates: list[tuple[str, int]] = []
        for match in _SCHEDULE2_PROVISION_START_RE.finditer(content):
            provision = match.group("provision").upper()
            if match.group("label"):
                candidates.append((provision, 2))
                continue

            next_text = content[match.end():]
            next_nonempty = next(
                (line for line in next_text.splitlines() if line.strip()),
                "",
            )
            strength = 2 if _SCHEDULE2_SUBSECTION_START_RE.match(next_nonempty) else 1
            candidates.append((provision, strength))
        return candidates

    @classmethod
    def _schedule2_provision_start_matches(
        cls,
        chunk: SourceChunk,
        requested_provision: str,
    ) -> bool:
        """Return whether a chunk has a structural start for the request."""
        normalized = re.sub(
            r"(?:\([0-9A-Z]+\))+$",
            "",
            requested_provision.strip().upper(),
        )
        return normalized in cls._schedule2_provision_markers(chunk)

    @staticmethod
    def _schedule2_requested_subclass(
        request: ExactLegalLookupRequest,
    ) -> str | None:
        if request.subclass:
            return str(request.subclass).strip()
        provision = re.sub(
            r"(?:\([0-9A-Z]+\))+$",
            "",
            str(request.provision or "").strip().upper(),
        )
        match = re.match(r"^(?P<subclass>[0-9]{3})\.", provision)
        return match.group("subclass") if match else None

    @staticmethod
    def _chunk_schedule_markers(chunk: SourceChunk) -> set[str]:
        heading = str(getattr(chunk, "heading", "") or "")
        return {
            match.group("schedule").upper()
            for match in _SCHEDULE_MARKER_RE.finditer(heading)
        }

    @staticmethod
    def _chunk_subclass_markers(chunk: SourceChunk) -> set[str]:
        heading = str(getattr(chunk, "heading", "") or "")
        prefix = str(getattr(chunk, "text", "") or "")[:500]
        heading_markers = {
            match.group("subclass")
            for match in _SUBCLASS_MARKER_RE.finditer(heading)
        }
        line_start_markers = {
            match.group("subclass")
            for match in re.finditer(
                r"(?im)^\s*subclass\s+(?P<subclass>[0-9]{3})\b",
                prefix,
            )
        }
        return heading_markers | line_start_markers

    def _expand_schedule2_provision_blocks(
        self,
        *,
        request: ExactLegalLookupRequest,
        candidate_chunks: list[SourceChunk],
    ) -> tuple[list[SourceChunk], bool | None, bool]:
        """Expand the earliest structural start to the next peer boundary.

        The database query identifies candidate chunks using the existing
        structural predicate.  This method then chooses the earliest genuine
        start per canonical source and walks ordered chunks from that point.
        A different structural provision, Schedule, or subclass ends the
        block.  Repeated page headers for the requested provision are treated
        as continuation ownership, not as new starts.
        """
        requested = str(request.provision or "").strip().upper()
        requested_subclass = self._schedule2_requested_subclass(request)
        requested_base = re.sub(r"(?:\([0-9A-Z]+\))+$", "", requested)
        starts_by_source: dict[str, tuple[SourceChunk, int]] = {}
        source_order: list[str] = []
        for chunk in candidate_chunks:
            candidates = self._schedule2_provision_start_candidates(chunk)
            strengths = [
                strength
                for marker, strength in candidates
                if marker == requested_base
            ]
            if not strengths:
                continue
            strength = max(strengths)
            source_id = str(chunk.source_id)
            prior_entry = starts_by_source.get(source_id)
            if prior_entry is None:
                source_order.append(source_id)
                starts_by_source[source_id] = (chunk, strength)
            else:
                prior, prior_strength = prior_entry
                if strength > prior_strength or (
                    strength == prior_strength
                    and (chunk.chunk_index, str(chunk.id))
                    < (prior.chunk_index, str(prior.id))
                ):
                    starts_by_source[source_id] = (chunk, strength)

        if not starts_by_source:
            # Preserve the existing bounded fallback when a confident
            # structural start cannot be identified.
            return candidate_chunks[: request.max_hits], None, False

        selected: list[SourceChunk] = []
        for source_id in source_order:
            start, _ = starts_by_source[source_id]
            source_stmt = (
                select(SourceChunk)
                .where(
                    SourceChunk.source_id == source_id,
                    SourceChunk.chunk_index >= start.chunk_index,
                )
                .order_by(SourceChunk.chunk_index.asc(), SourceChunk.id.asc())
            )
            try:
                source_chunks = self._db.scalars(source_stmt)
            except Exception as exc:
                logger.warning(
                    "Schedule-2 provision block expansion failed for source %s: %s",
                    source_id,
                    exc,
                )
                continue

            try:
                source_chunk_iterator = iter(source_chunks)
            except TypeError as exc:
                logger.warning(
                    "Schedule-2 provision block expansion returned a non-iterable for source %s: %s",
                    source_id,
                    exc,
                )
                continue

            for chunk in source_chunk_iterator:
                if chunk.chunk_index < start.chunk_index:
                    continue

                heading = str(getattr(chunk, "heading", "") or "").casefold()
                prefix = str(getattr(chunk, "text", "") or "")[:1200].casefold()
                if any(
                    marker in heading or marker in prefix
                    for marker in ("contents", "endnote", "amendment history")
                ):
                    break

                schedule_markers = self._chunk_schedule_markers(chunk)
                if schedule_markers and "2" not in schedule_markers:
                    break

                subclass_markers = self._chunk_subclass_markers(chunk)
                if requested_subclass and subclass_markers and requested_subclass not in subclass_markers:
                    break

                provision_markers = self._schedule2_provision_markers(chunk)
                if chunk.chunk_index > start.chunk_index:
                    peer_markers = [
                        marker
                        for marker in provision_markers
                        if marker != requested_base
                    ]
                    if peer_markers:
                        break

                if len(selected) >= SCHEDULE2_PROVISION_BLOCK_MAX_CHUNKS:
                    # Boundary checks above establish that this is a
                    # continuation chunk, so reaching the cap is partial.
                    return selected, False, True
                selected.append(chunk)

        if selected:
            return selected, True, False
        return candidate_chunks[: request.max_hits], None, False

    @staticmethod
    def _schedule_locator_pattern(schedule: str) -> str:
        """Return an exact Schedule locator pattern with alphanumeric boundaries."""
        normalized = schedule.strip().upper()
        return rf"(^|[^[:alnum:]])schedule[[:space:]]+{re.escape(normalized)}([^[:alnum:]]|$)"

    @staticmethod
    def _schedule_header_pattern(schedule: str) -> str:
        """Return a structural page-heading pattern for one Schedule.

        Official multi-volume compilations copy page headings into each chunk,
        but the Schedule marker is not consistently placed at the beginning
        of that heading.  This pattern is used only against
        ``SourceChunk.heading``; body text retains the stricter anchored
        fallback below so cross-references cannot establish ownership.
        """
        normalized = schedule.strip().upper()
        return rf"(^|[^[:alnum:]])schedule[[:space:]]+{re.escape(normalized)}([^[:alnum:]]|$)"

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
        that page.  The Schedule marker can occur at either edge of that
        structural heading, so the persisted heading is authoritative for
        volume ownership.  Chunk body text is deliberately not used when a
        heading exists because split chunks can begin with cross-references to
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

    @classmethod
    def _authoritative_source_condition(cls, family_id: str | None, as_of_date):
        """Prefer the newest applicable active compilation deterministically.

        The database may retain historical rows for rollback.  Exact lookup
        must not combine active compilations merely because both rows satisfy a
        broad family predicate.  The coverage report remains the corpus
        contract; this date/version guard is the defensive SQL boundary when
        more than one active row is present.
        """
        if not family_id or (
            family_id != "migration_regulations"
            and not family_id.startswith("migration_regulations_schedule_")
        ):
            if as_of_date is None:
                return true()
            return or_(
                LegalSource.effective_date.is_(None),
                LegalSource.effective_date <= as_of_date,
            )

        family_condition = cls._migration_regulations_source_condition()
        date_filters = []
        if as_of_date is not None:
            date_filters = [
                or_(LegalSource.effective_date.is_(None), LegalSource.effective_date <= as_of_date),
                or_(LegalSource.repeal_date.is_(None), LegalSource.repeal_date >= as_of_date),
            ]
        applicable = and_(LegalSource.status == "active", family_condition, *date_filters)
        latest_effective_date = (
            select(func.max(LegalSource.effective_date))
            .where(applicable)
            .scalar_subquery()
        )
        latest_version = (
            select(func.max(LegalSource.document_version))
            .where(applicable)
            .scalar_subquery()
        )
        current_filters = []
        if as_of_date is not None:
            current_filters = [
                or_(LegalSource.effective_date.is_(None), LegalSource.effective_date <= as_of_date),
                or_(LegalSource.repeal_date.is_(None), LegalSource.repeal_date >= as_of_date),
            ]
        return and_(
            *current_filters,
            or_(
                LegalSource.effective_date == latest_effective_date,
                and_(
                    latest_effective_date.is_(None),
                    LegalSource.document_version == latest_version,
                ),
            ),
        )

    @staticmethod
    def _provision_structure_condition(provision: str, *, family_id: str | None):
        """Require a provision marker in the structural page prefix/heading.

        Body-wide substring matching admits contents, endnotes, and unrelated
        cross-references.  Official compilation ingestion preserves the page
        heading and the structural header at the start of each chunk, which is
        the bounded ownership signal used here.  Full chunk text remains the
        evidence; only the ownership predicate is narrowed.
        """
        normalized = re.sub(r"(?:\([0-9A-Z]+\))+$", "", provision.strip().upper())
        token = re.escape(normalized)
        exact_pattern = rf"(^|[^[:alnum:]]){token}([^[:alnum:]]|$)"
        labeled_pattern = (
            rf"(^|[^[:alnum:]])(?:regulation|subregulation|reg|"
            rf"clause|criterion|criteria|condition|item|section|s\.)[[:space:]]+{token}"
            rf"([^[:alnum:]]|$)"
        )
        # A provision can begin after the carried page heading when the
        # ingestion chunk contains the end of the preceding provision.  Keep
        # the ownership window bounded while covering that legitimate case.
        prefix = func.left(SourceChunk.text, 500 if family_id == "migration_act" else 1200)
        heading = func.coalesce(SourceChunk.heading, "")
        if family_id == "migration_act":
            # Act page headers carry an explicit Section marker.  Bare numbers
            # in Act volume headers are page numbers and contents entries, not
            # structural ownership.
            structural = or_(
                heading.op("~*")(labeled_pattern),
                prefix.op("~*")(labeled_pattern),
            )
            act_header_pattern = rf"(^|[^[:alnum:]])Section[[:space:]]+{token}([^[:alnum:]]|$)"
            act_block_start = (
                select(func.min(SourceChunk.chunk_index))
                .where(
                    SourceChunk.source_id == LegalSource.id,
                    or_(
                        heading.op("~")(act_header_pattern),
                        func.left(SourceChunk.text, 500).op("~")(act_header_pattern),
                    ),
                )
                .correlate_except(SourceChunk)
                .scalar_subquery()
            )
            structural = and_(structural, SourceChunk.chunk_index >= act_block_start)
        else:
            structural = or_(
                heading.op("~*")(exact_pattern),
                heading.op("~*")(labeled_pattern),
                prefix.op("~*")(labeled_pattern),
                # Schedule criteria, PICs, conditions, and table items are
                # often bare numeric markers in the structural prefix.
                prefix.op("~*")(exact_pattern),
            )
        # The current official compilation stores generic Regulations in
        # Volume 1.  Volumes 2/3 repeat regulation numbers only as
        # cross-references from Schedule provisions.  Keep those references
        # out of an unscoped regulation lookup without changing the
        # schedule-specific path below.
        if family_id == "migration_regulations":
            structural = and_(
                structural,
                LegalSource.title.ilike("%Volume 1%"),
            )
        noise = or_(
            heading.ilike("%contents%"),
            heading.ilike("%endnote%"),
            heading.ilike("%amendment history%"),
            prefix.ilike("%contents%"),
            prefix.ilike("%endnote%"),
        )
        return and_(structural, not_(noise))

    @staticmethod
    def _subclass_structure_condition(subclass: str):
        token = re.escape(str(subclass).strip())
        pattern = rf"(^|[^[:alnum:]])subclass[[:space:]]+{token}([^[:alnum:]]|$)"
        clause_pattern = rf"(^|[^[:alnum:]])(clause|part)[[:space:]]+{token}\.[0-9]"
        start_pattern = rf"(^|[^[:alnum:]])Subclass[[:space:]]+{token}([^[:alnum:]]|$)"
        start_clause_pattern = rf"(^|[^[:alnum:]])(Clause|Part)[[:space:]]+{token}\.[0-9]"
        prefix = func.left(SourceChunk.text, 500)
        heading = func.coalesce(SourceChunk.heading, "")
        # A subclass number is mentioned throughout other provisions.  Find
        # the first operative Clause/Part page for that subclass in the source
        # and retain continuation chunks from that point onward.  The bounded
        # provision predicate applied by the caller still selects only the
        # requested provision; the block lookup's max_hits keeps its result at
        # the start of the owning block.
        owning_block_start = (
            select(func.min(SourceChunk.chunk_index))
            .where(
                SourceChunk.source_id == LegalSource.id,
                SourceChunk.text.op("~")(start_pattern),
                SourceChunk.text.op("~")(start_clause_pattern),
            )
            .correlate_except(SourceChunk)
            .scalar_subquery()
        )
        return and_(
            SourceChunk.chunk_index >= owning_block_start,
            not_(
                or_(
                    heading.ilike("%contents%"),
                    heading.ilike("%endnote%"),
                    prefix.ilike("%contents%"),
                    prefix.ilike("%endnote%"),
                )
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
            .order_by(
                LegalSource.effective_date.desc().nullslast(),
                LegalSource.document_version.desc().nullslast(),
                LegalSource.title.asc(),
                SourceChunk.chunk_index.asc(),
                SourceChunk.id.asc(),
            )
            .limit(3)
        )
        family_condition = self._family_source_condition(family_id)
        if family_condition is None:
            return None
        stmt = stmt.where(family_condition)
        stmt = stmt.where(self._authoritative_source_condition(family_id, None))

        if locator.locator_type == "schedule":
            stmt = stmt.where(self._schedule_chunk_condition(locator.target_provision or ""))
        elif locator.locator_type in ("regulation", "subregulation"):
            stmt = stmt.where(
                self._provision_structure_condition(
                    locator.target_provision or "",
                    family_id=family_id,
                )
            )
        elif locator.locator_type == "clause":
            stmt = stmt.where(
                self._provision_structure_condition(
                    locator.target_provision or "",
                    family_id=family_id,
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
                    provision_override=locator.target_provision,
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
        provision_block_complete: bool | None = None,
        provision_block_backend_cap_reached: bool = False,
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
            provision_block_complete=provision_block_complete,
            provision_block_backend_cap_reached=provision_block_backend_cap_reached,
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
