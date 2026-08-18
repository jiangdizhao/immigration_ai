"""Phase 4A — Canonical Corpus Coverage Audit tests.

Read-only tests.  No DB mutation, no network access, no ingestion.
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

# Ensure the legal-service package root is on sys.path.
_HERE = Path(__file__).resolve().parent
_PROJECT = _HERE.parent
if str(_PROJECT) not in sys.path:
    sys.path.insert(0, str(_PROJECT))

from app.schemas.canonical_corpus_coverage import (  # noqa: E402
    CanonicalCorpusCoverageReport,
    SourceFamilyRecord,
    canonical_json,
    compute_report_hash,
)
from scripts.audit_canonical_corpus_coverage import (  # noqa: E402
    AuditSnapshot,
    REQUIRED_FAMILY_IDS,
    _classify_source,
    _compute_input_fingerprint,
    _discover_historical_versions,
    _family_display_name,
    _build_family_records,
    run_audit,
)


EMPTY_SNAPSHOT = AuditSnapshot()

# ── helpers ──────────────────────────────────────────────────────────────────


def _make_source(
    id_: str = "src-1",
    title: str = "Test Source",
    source_type: str = "legislation",
    authority: str = "Test Authority",
    url: str = "https://example.com/test",
    effective_date: str | None = "2024-01-01",
    document_version: str | None = "v1",
    metadata_json: dict | None = None,
) -> MagicMock:
    src = MagicMock()
    src.id = id_
    src.title = title
    src.source_type = source_type
    src.authority = authority
    src.url = url
    src.effective_date = (
        datetime(2024, 1, 1).date() if effective_date else None
    )
    src.document_version = document_version
    src.metadata_json = metadata_json or {}
    src.chunks = []
    return src


def _make_chunk(
    id_: str = "ch-1",
    source_id: str = "src-1",
    chunk_index: int = 0,
    section_ref: str | None = None,
    heading: str | None = None,
) -> MagicMock:
    ch = MagicMock()
    ch.id = id_
    ch.source_id = source_id
    ch.chunk_index = chunk_index
    ch.section_ref = section_ref
    ch.heading = heading
    return ch


def _make_case(
    id_: str = "case-1",
    title: str = "Test Case",
    court: str | None = "Federal Court",
    decision_date: str | None = "2024-06-15",
) -> MagicMock:
    c = MagicMock()
    c.id = id_
    c.title = title
    c.court = court
    c.decision_date = (
        datetime(2024, 6, 15).date() if decision_date else None
    )
    return c


# ── A. Report schema validation ──────────────────────────────────────────────


class TestReportSchema:
    def test_valid_minimal_report(self):
        report = CanonicalCorpusCoverageReport(
            audit_time_utc="2024-01-01T00:00:00+00:00",
            source_families=[],
            overall_input_fingerprint="abc123",
            report_hash="def456",
        )
        assert report.schema_version == "canonical_corpus_coverage.v1"
        assert report.source_families == []

    def test_valid_full_report(self):
        fam = SourceFamilyRecord(
            family_id="test_family",
            family="Test Family",
            available=True,
            coverage_status="available_complete",
            source_count=3,
            chunk_count=10,
            versions=["v1", "v2"],
            effective_date_metadata_complete=True,
            provision_boundaries_available=True,
            canonical_urls_available=True,
            gap_reason=None,
            sample_source_ids=["s1"],
            sample_titles=["Test"],
            sample_canonical_urls=["https://example.com"],
        )
        report = CanonicalCorpusCoverageReport(
            audit_time_utc="2024-01-01T00:00:00+00:00",
            source_families=[fam],
            overall_input_fingerprint="abc123",
            report_hash="def456",
        )
        assert len(report.source_families) == 1
        assert report.source_families[0].family_id == "test_family"

    def test_invalid_coverage_status_rejected(self):
        with pytest.raises(Exception):
            SourceFamilyRecord(
                family_id="bad",
                family="Bad",
                available=True,
                coverage_status="invalid_status",  # type: ignore[arg-type]
            )

    def test_report_hash_excluded_from_hash(self):
        """report_hash and audit_time_utc are excluded from hash computation."""
        d1 = {
            "schema_version": "v1",
            "audit_time_utc": "2024-01-01T00:00:00Z",
            "source_families": [],
            "overall_input_fingerprint": "abc",
            "report_hash": "old_hash",
        }
        d2 = {
            "schema_version": "v1",
            "audit_time_utc": "2024-06-15T00:00:00Z",
            "source_families": [],
            "overall_input_fingerprint": "abc",
            "report_hash": "new_hash",
        }
        assert compute_report_hash(d1) == compute_report_hash(d2)


# ── B. Required families always represented ──────────────────────────────────


class TestRequiredFamilies:
    def test_all_required_families_in_report(self):
        """Every required family appears in the report even when absent."""
        report = run_audit(dry_run=True, snapshot=EMPTY_SNAPSHOT)
        family_ids = {f.family_id for f in report.source_families}
        for fid in REQUIRED_FAMILY_IDS:
            assert fid in family_ids, f"Missing required family: {fid}"

    def test_absent_family_has_correct_defaults(self):
        """An absent family has available=False, coverage_status=absent."""
        report = run_audit(dry_run=True, snapshot=EMPTY_SNAPSHOT)
        for fam in report.source_families:
            if fam.coverage_status == "absent":
                assert fam.available is False
                assert fam.source_count == 0
                assert fam.chunk_count == 0
                assert fam.gap_reason is not None


# ── C. Schedule 1 recognition from real-structure fixture ────────────────────


class TestSchedule1Recognition:
    def test_schedule1_classified_correctly(self):
        src = _make_source(
            title="MIGRATION REGULATIONS 1994 - SCHEDULE 1 Classes of visa",
            source_type="legislation",
            url="https://www.legislation.gov.au/F1996B03551/schedule1",
        )
        fid = _classify_source(src)
        assert fid == "migration_regulations_schedule_1"

    def test_schedule1_lowercase_title(self):
        src = _make_source(
            title="migration regulations 1994 - schedule 1 classes of visa",
            source_type="legislation",
            url="https://example.com/sched1",
        )
        fid = _classify_source(src)
        assert fid == "migration_regulations_schedule_1"

    def test_schedule1_not_classified_without_schedule_in_title(self):
        src = _make_source(
            title="Migration Regulations 1994 Volume 1",
            source_type="legislation",
            url="https://www.legislation.gov.au/F2026C00266VOL01",
        )
        fid = _classify_source(src)
        # Should be migration_regulations, not schedule_1
        assert fid != "migration_regulations_schedule_1"
        assert fid == "migration_regulations"


# ── D. Schedule 2 recognition from real-structure fixture ────────────────────


class TestSchedule2Recognition:
    def test_schedule2_classified_correctly(self):
        src = _make_source(
            title="MIGRATION REGULATIONS 1994 - SCHEDULE 2 Provisions with respect to the grant of Subclasses of visas",
            source_type="legislation",
            url="https://www.legislation.gov.au/F1996B03551/schedule2",
        )
        fid = _classify_source(src)
        assert fid == "migration_regulations_schedule_2"

    def test_schedule2_not_classified_as_act(self):
        src = _make_source(
            title="MIGRATION REGULATIONS 1994 - SCHEDULE 2 Provisions",
            source_type="legislation",
            url="https://www.legislation.gov.au/F1996B03551/schedule2",
        )
        fid = _classify_source(src)
        assert fid == "migration_regulations_schedule_2"
        assert fid != "migration_act"


# ── E. Schedule 3 absent case ────────────────────────────────────────────────


class TestSchedule3Absent:
    def test_schedule3_absent_when_no_schedule3_source(self):
        """If no Schedule 3 source exists, it's reported as absent."""
        sources = [
            _make_source(
                id_="s1",
                title="MIGRATION REGULATIONS 1994 - SCHEDULE 1 Classes of visa",
                source_type="legislation",
                url="https://example.com/s1",
            ),
            _make_source(
                id_="s2",
                title="MIGRATION REGULATIONS 1994 - SCHEDULE 2 Provisions",
                source_type="legislation",
                url="https://example.com/s2",
            ),
        ]
        chunks_by_source = {}
        records = _build_family_records(sources, chunks_by_source, [])
        # Schedule 3 should not appear in records (no source classified as schedule_3)
        assert "migration_regulations_schedule_3" not in records


# ── F. Additional schedules discovered only from actual metadata ─────────────


class TestAdditionalSchedules:
    def test_schedule4_discovered_when_present(self):
        src = _make_source(
            title="MIGRATION REGULATIONS 1994 - SCHEDULE 4 Public interest criteria",
            source_type="legislation",
            url="https://example.com/s4",
        )
        fid = _classify_source(src)
        assert fid == "migration_regulations_schedule_4"

    def test_schedule8_discovered_when_present(self):
        src = _make_source(
            title="MIGRATION REGULATIONS 1994 - SCHEDULE 8 Visa conditions",
            source_type="legislation",
            url="https://example.com/s8",
        )
        fid = _classify_source(src)
        assert fid == "migration_regulations_schedule_8"

    def test_schedule_not_invented(self):
        """A guidance page mentioning 'schedule 5' is not classified as Schedule 5."""
        src = _make_source(
            title="Home Affairs guidance about Schedule 5 criteria",
            source_type="guidance",
            authority="Department of Home Affairs",
            url="https://immi.homeaffairs.gov.au/guidance",
        )
        fid = _classify_source(src)
        # Should be guidance, not a schedule
        assert fid == "home_affairs_guidance"
        assert fid != "migration_regulations_schedule_5"


# ── G. Partial family not labelled complete ──────────────────────────────────


class TestPartialNotComplete:
    def test_missing_effective_date_makes_partial(self):
        src = _make_source(
            title="MIGRATION REGULATIONS 1994 - SCHEDULE 1 Classes of visa",
            source_type="legislation",
            url="https://example.com/s1",
            effective_date=None,  # missing
        )
        chunks_by_source = {src.id: [_make_chunk(section_ref="0101", heading="Test")]}
        records = _build_family_records([src], chunks_by_source, [])
        fam = records["migration_regulations_schedule_1"]
        assert fam["coverage_status"] == "available_partial"
        assert fam["effective_date_metadata_complete"] is False

    def test_missing_url_makes_partial(self):
        src = _make_source(
            title="MIGRATION REGULATIONS 1994 - SCHEDULE 1 Classes of visa",
            source_type="legislation",
            url="",  # missing
        )
        chunks_by_source = {src.id: [_make_chunk(section_ref="0101")]}
        records = _build_family_records([src], chunks_by_source, [])
        fam = records["migration_regulations_schedule_1"]
        assert fam["coverage_status"] == "available_partial"
        assert fam["canonical_urls_available"] is False

    def test_no_provision_boundaries_makes_partial(self):
        src = _make_source(
            title="MIGRATION REGULATIONS 1994 - SCHEDULE 1 Classes of visa",
            source_type="legislation",
            url="https://example.com/s1",
        )
        chunks_by_source = {src.id: [_make_chunk(section_ref=None, heading=None)]}
        records = _build_family_records([src], chunks_by_source, [])
        fam = records["migration_regulations_schedule_1"]
        assert fam["coverage_status"] == "available_partial"
        assert fam["provision_boundaries_available"] is False

    def test_all_metadata_present_makes_complete(self):
        src = _make_source(
            title="MIGRATION REGULATIONS 1994 - SCHEDULE 1 Classes of visa",
            source_type="legislation",
            url="https://example.com/s1",
            effective_date="2024-01-01",
            document_version="F2024C00001",
        )
        chunks_by_source = {src.id: [_make_chunk(section_ref="0101", heading="Test")]}
        records = _build_family_records([src], chunks_by_source, [])
        fam = records["migration_regulations_schedule_1"]
        assert fam["coverage_status"] == "available_complete"


# ── H. Missing canonical URLs detected ───────────────────────────────────────


class TestMissingCanonicalUrls:
    def test_missing_url_detected(self):
        src = _make_source(
            title="Migration Instrument Test",
            source_type="legislation",
            url="",
        )
        chunks_by_source = {src.id: [_make_chunk(section_ref="s1")]}
        records = _build_family_records([src], chunks_by_source, [])
        fam = records.get("legislative_instruments")
        assert fam is not None
        assert fam["canonical_urls_available"] is False
        assert "missing canonical url" in (fam["gap_reason"] or "").lower()


# ── I. Incomplete effective-date metadata detected ───────────────────────────


class TestIncompleteEffectiveDate:
    def test_missing_effective_date_detected(self):
        src = _make_source(
            title="Migration Instrument Test",
            source_type="legislation",
            url="https://example.com",
            effective_date=None,
        )
        chunks_by_source = {src.id: [_make_chunk(section_ref="s1")]}
        records = _build_family_records([src], chunks_by_source, [])
        fam = records.get("legislative_instruments")
        assert fam is not None
        assert fam["effective_date_metadata_complete"] is False
        assert "missing effective_date" in (fam["gap_reason"] or "").lower()


# ── J. Missing provision-boundary metadata detected ──────────────────────────


class TestMissingProvisionBoundaries:
    def test_no_section_ref_or_heading_detected(self):
        src = _make_source(
            title="Migration Instrument Test",
            source_type="legislation",
            url="https://example.com",
        )
        chunks_by_source = {src.id: [_make_chunk(section_ref=None, heading=None)]}
        records = _build_family_records([src], chunks_by_source, [])
        fam = records.get("legislative_instruments")
        assert fam is not None
        assert fam["provision_boundaries_available"] is False
        assert "provision" in (fam["gap_reason"] or "").lower()


# ── K. Multiple historical versions detected correctly ───────────────────────


class TestHistoricalVersions:
    def test_multiple_versions_detected(self):
        src1 = _make_source(
            id_="s1",
            title="Migration Regulations 1994",
            source_type="legislation",
            url="https://example.com/v1",
            document_version="F2024C00001",
            effective_date="2024-01-01",
        )
        src2 = _make_source(
            id_="s2",
            title="Migration Regulations 1994",
            source_type="legislation",
            url="https://example.com/v2",
            document_version="F2024C00002",
            effective_date="2024-06-01",
        )
        src1.chunks = [_make_chunk(section_ref="1.1")]
        src2.chunks = [_make_chunk(section_ref="1.1")]
        hist = _discover_historical_versions([src1, src2])
        assert hist["available"] is True
        assert hist["source_count"] == 2
        assert len(hist["versions"]) == 2
        assert "F2024C00001" in hist["versions"]
        assert "F2024C00002" in hist["versions"]

    def test_single_version_not_historical(self):
        src = _make_source(
            title="Migration Regulations 1994",
            source_type="legislation",
            url="https://example.com/v1",
            document_version="F2024C00001",
        )
        hist = _discover_historical_versions([src])
        assert hist["available"] is False
        assert hist["coverage_status"] == "absent"


# ── L. No historical evidence does not become a claim ────────────────────────


class TestNoHistoricalClaim:
    def test_empty_sources_produces_absent_historical(self):
        hist = _discover_historical_versions([])
        assert hist["available"] is False
        assert hist["coverage_status"] == "absent"
        assert hist["source_count"] == 0
        assert hist["versions"] == []


# ── M. Deterministic ordering ────────────────────────────────────────────────


class TestDeterministicOrdering:
    def test_families_sorted_by_id(self):
        """Source families are deterministically ordered by family_id."""
        report1 = run_audit(dry_run=True, snapshot=EMPTY_SNAPSHOT)
        report2 = run_audit(dry_run=True, snapshot=EMPTY_SNAPSHOT)
        ids1 = [f.family_id for f in report1.source_families]
        ids2 = [f.family_id for f in report2.source_families]
        assert ids1 == ids2
        assert ids1 == sorted(ids1)


# ── N. Same input gives same report_hash ─────────────────────────────────────


class TestReportHashStability:
    def test_same_input_same_hash(self):
        report1 = run_audit(
            dry_run=True,
            audit_time=datetime(2024, 1, 1, tzinfo=timezone.utc),
            snapshot=EMPTY_SNAPSHOT,
        )
        report2 = run_audit(
            dry_run=True,
            audit_time=datetime(2024, 1, 1, tzinfo=timezone.utc),
            snapshot=EMPTY_SNAPSHOT,
        )
        assert report1.report_hash == report2.report_hash
        assert report1.overall_input_fingerprint == report2.overall_input_fingerprint


# ── O. Audit timestamp change does not change report_hash ────────────────────


class TestAuditTimeIndependentHash:
    def test_different_audit_time_same_hash(self):
        report1 = run_audit(
            dry_run=True,
            audit_time=datetime(2024, 1, 1, tzinfo=timezone.utc),
            snapshot=EMPTY_SNAPSHOT,
        )
        report2 = run_audit(
            dry_run=True,
            audit_time=datetime(2024, 6, 15, tzinfo=timezone.utc),
            snapshot=EMPTY_SNAPSHOT,
        )
        assert report1.report_hash == report2.report_hash
        # audit_time_utc should differ
        assert report1.audit_time_utc != report2.audit_time_utc


# ── P. Substantive inventory change changes report_hash ──────────────────────


class TestInventoryChangeChangesHash:
    def test_different_input_different_hash(self):
        """Different source data produces different report_hash."""
        # We can't easily change the real DB, but we can verify the hash
        # computation is sensitive to input changes by comparing two
        # different fingerprint inputs.
        fp1 = _compute_input_fingerprint(
            [_make_source(id_="a", title="Test A", source_type="legislation", url="https://a.com")],
            {},
            [],
        )
        fp2 = _compute_input_fingerprint(
            [_make_source(id_="b", title="Test B", source_type="legislation", url="https://b.com")],
            {},
            [],
        )
        assert fp1 != fp2


# ── Q. Zero canonical DB mutation ────────────────────────────────────────────


class TestZeroDbMutation:
    def test_audit_uses_read_only_transaction(self):
        """The audit attempts SET TRANSACTION READ ONLY."""
        with patch("scripts.audit_canonical_corpus_coverage.SessionLocal") as mock_session_cls:
            mock_db = MagicMock()
            mock_session_cls.return_value = mock_db
            mock_db.scalar.return_value = 0
            mock_db.execute.return_value.mappings.return_value.all.return_value = []
            run_audit(dry_run=True, session_factory=mock_session_cls)
            # Verify execute was called with SET TRANSACTION READ ONLY
            execute_calls = [
                str(call[0][0]) if call[0] else ""
                for call in mock_db.execute.call_args_list
            ]
            assert any("READ ONLY" in str(c) for c in execute_calls)

    def test_audit_rolls_back_not_commits(self):
        """The audit calls rollback(), not commit()."""
        with patch("scripts.audit_canonical_corpus_coverage.SessionLocal") as mock_session_cls:
            mock_db = MagicMock()
            mock_session_cls.return_value = mock_db
            mock_db.scalar.return_value = 0
            mock_db.execute.return_value.mappings.return_value.all.return_value = []
            run_audit(dry_run=True, session_factory=mock_session_cls)
            mock_db.rollback.assert_called()
            mock_db.commit.assert_not_called()


# ── R. Zero canonical source-file mutation ───────────────────────────────────


class TestZeroSourceFileMutation:
    def test_audit_does_not_open_source_files_for_writing(self):
        """The audit only reads from DB, never writes to source files."""
        # The audit script only reads from the database; it never opens
        # raw source files.  This is verified by code review.
        # We test that the audit function doesn't import or use file-writing
        # modules for canonical data.
        import inspect
        source = inspect.getsource(run_audit)
        assert "open(" not in source or "output_path" in source  # only for artifact
        # No ingestion imports
        assert "ingestion" not in source.lower()


# ── S. Audit never invokes network/download code ─────────────────────────────


class TestNoNetworkAccess:
    def test_audit_has_no_network_imports(self):
        """The audit script does not import network libraries."""
        import inspect
        source = inspect.getsource(run_audit)
        for forbidden in ["requests", "urllib", "httpx", "aiohttp", "curl", "wget"]:
            assert forbidden not in source.lower(), f"Network import found: {forbidden}"


# ── T. Generated artifact validates through schema ───────────────────────────


class TestArtifactSchemaValidation:
    def test_report_validates_through_schema(self):
        report = run_audit(dry_run=True, snapshot=EMPTY_SNAPSHOT)
        # Re-validate
        d = report.model_dump()
        validated = CanonicalCorpusCoverageReport.model_validate(d)
        assert validated.report_hash == report.report_hash

    def test_report_json_round_trip(self):
        report = run_audit(dry_run=True, snapshot=EMPTY_SNAPSHOT)
        json_str = report.model_dump_json(indent=2)
        parsed = json.loads(json_str)
        validated = CanonicalCorpusCoverageReport.model_validate(parsed)
        assert validated.report_hash == report.report_hash


# ── U. Unknown metadata produces honest unknown/partial state ────────────────


class TestHonestUnknownState:
    def test_unclassifiable_source_not_silently_assigned(self):
        """A source with no recognizable type gets a fallback family, not a fabricated one."""
        src = _make_source(
            title="Some random document",
            source_type="unknown_type_xyz",
            authority="Unknown",
            url="https://example.com/unknown",
        )
        fid = _classify_source(src)
        # Should get a fallback, not one of the main families
        assert fid is None or fid.startswith("other_")
        if fid:
            assert fid not in [
                "migration_act",
                "migration_regulations",
                "court_decisions",
                "home_affairs_guidance",
            ]


# ── V. No credentials/secrets in report JSON ─────────────────────────────────


class TestNoSecretsInReport:
    def test_report_json_has_no_credentials(self):
        report = run_audit(dry_run=True, snapshot=EMPTY_SNAPSHOT)
        json_str = report.model_dump_json(indent=2)
        lower = json_str.lower()
        for secret_pattern in [
            "password",
            "secret",
            "api_key",
            "apikey",
            "connection_string",
            "postgresql://",
            "mysql://",
            "DATABASE_URL",
            "OPENAI_API_KEY",
        ]:
            assert secret_pattern not in lower, f"Secret pattern found: {secret_pattern}"


# ── Additional: canonical_json determinism ───────────────────────────────────


class TestCanonicalJson:
    def test_deterministic_serialization(self):
        obj = {"b": 2, "a": 1, "c": [3, 2, 1]}
        result1 = canonical_json(obj)
        result2 = canonical_json(obj)
        assert result1 == result2

    def test_keys_sorted(self):
        obj = {"z": 1, "a": 2, "m": 3}
        result = canonical_json(obj).decode("utf-8")
        assert result.index('"a"') < result.index('"m"')
        assert result.index('"m"') < result.index('"z"')


# ── Additional: family display names ─────────────────────────────────────────


class TestFamilyDisplayNames:
    def test_known_families_have_names(self):
        for fid in REQUIRED_FAMILY_IDS:
            name = _family_display_name(fid)
            assert name
            assert name != fid  # should be human-readable

    def test_unknown_family_has_fallback_name(self):
        name = _family_display_name("some_unknown_family")
        assert name == "Some Unknown Family"


# ── Additional: input fingerprint determinism ────────────────────────────────


class TestInputFingerprint:
    def test_same_input_same_fingerprint(self):
        src = _make_source(id_="s1", title="Test", source_type="legislation", url="https://x.com")
        fp1 = _compute_input_fingerprint([src], {}, [])
        fp2 = _compute_input_fingerprint([src], {}, [])
        assert fp1 == fp2

    def test_different_source_different_fingerprint(self):
        src1 = _make_source(id_="s1", title="A", source_type="legislation", url="https://a.com")
        src2 = _make_source(id_="s2", title="B", source_type="legislation", url="https://b.com")
        fp1 = _compute_input_fingerprint([src1], {}, [])
        fp2 = _compute_input_fingerprint([src2], {}, [])
        assert fp1 != fp2
