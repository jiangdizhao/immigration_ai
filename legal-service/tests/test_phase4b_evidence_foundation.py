"""Phase 4B — Common tool/evidence foundation tests.

Tests cover:
- RequestEvidenceRegistry (adversarial)
- CanonicalEvidenceService
- WebEvidenceNormalizer
- Cross-reference parser
- Deterministic utility
- AgentSubmissionValidator
- EvidencePostconditionService
- TerminalSubmissionPolicy
"""

from __future__ import annotations

import hashlib
from datetime import date, datetime, timezone
from types import SimpleNamespace

import pytest

# ---------------------------------------------------------------------------
# RequestEvidenceRegistry tests
# ---------------------------------------------------------------------------


class TestRequestEvidenceRegistry:
    """Adversarial tests for request-scoped evidence registry."""

    def _make_canonical_evidence(self, text: str = "Test legal text"):
        from app.schemas.evidence import CanonicalLocalEvidenceRef

        return CanonicalLocalEvidenceRef(
            evidence_origin="canonical_local",
            evidence_ref="exact:pending",
            source_type="legislation",
            source_authenticity="canonical_official",
            authority_kind="statute",
            jurisdiction="Cth",
            binding_status="binding",
            court_or_tribunal_level=None,
            retrieved_at=datetime.now(timezone.utc),
            provenance_complete=True,
            canonical_source_id="test-source-id",
            canonical_chunk_id="test-chunk-id",
            document_id="Test Document",
            document_version="v1",
            provision_or_span="s 48",
            effective_from=None,
            effective_to=None,
            canonical_url="https://www.legislation.gov.au/test",
            content_hash=hashlib.sha256(text.encode()).hexdigest(),
            text=text,
        )

    def _make_native_web_evidence(self, url: str = "https://example.com/page"):
        from app.schemas.evidence import NativeWebCitation, NativeWebEvidenceRef

        return NativeWebEvidenceRef(
            evidence_origin="openai_web_native",
            evidence_ref="web:pending",
            source_type="web_page",
            source_authenticity="unverified",
            authority_kind="commentary",
            jurisdiction=None,
            binding_status="non_binding",
            court_or_tribunal_level=None,
            retrieved_at=datetime.now(timezone.utc),
            provenance_complete=True,
            search_call_id="search-123",
            url=url,
            title="Test Page",
            native_web_citation=NativeWebCitation(start_index=0, end_index=10),
            canonical_source_id=None,
            document_version=None,
            effective_from=None,
            effective_to=None,
            text=None,
            content_hash=None,
        )

    def test_registered_exact_ref_accepted(self):
        from app.services.request_evidence_registry import RequestEvidenceRegistry

        registry = RequestEvidenceRegistry(request_id="req-1")
        evidence = self._make_canonical_evidence()
        ref = registry.register_canonical_evidence(
            evidence=evidence, tool_call_id="call-1"
        )

        assert ref.startswith("exact:")
        assert registry.is_registered(ref)
        entry = registry.resolve(ref)
        assert entry.evidence_origin == "canonical_local"
        assert registry.resolve_evidence(ref).evidence_ref == ref

    def test_exact_lookup_outcome_is_retained_per_tool_call(self):
        from app.services.request_evidence_registry import RequestEvidenceRegistry

        registry = RequestEvidenceRegistry(request_id="req-1")
        ref = registry.register_canonical_evidence(
            evidence=self._make_canonical_evidence(), tool_call_id="call-1"
        )

        registry.record_exact_lookup_outcome(
            tool_call_id="call-1",
            unresolved_cross_references=["section 48", "section 48"],
        )

        assert registry.unresolved_cross_references_for(ref) == ("section 48",)

    def test_registered_web_ref_accepted(self):
        from app.services.request_evidence_registry import RequestEvidenceRegistry

        registry = RequestEvidenceRegistry(request_id="req-1")
        evidence = self._make_native_web_evidence()
        ref = registry.register_native_web_evidence(
            evidence=evidence, tool_call_id="call-1"
        )

        assert ref.startswith("web:")
        assert registry.is_registered(ref)

    def test_typed_url_rejected(self):
        """Model-authored URLs are not evidence."""
        from app.services.request_evidence_registry import (
            EvidenceNotRegisteredError,
            RequestEvidenceRegistry,
        )

        registry = RequestEvidenceRegistry(request_id="req-1")

        # A URL typed by the model is not registered
        fake_url = "https://www.legislation.gov.au/C1958A00062/latest"
        assert not registry.is_registered(fake_url)

        with pytest.raises(EvidenceNotRegisteredError):
            registry.resolve(fake_url)

    def test_guessed_exact_id_rejected(self):
        """Guessed evidence IDs are rejected."""
        from app.services.request_evidence_registry import (
            EvidenceNotRegisteredError,
            RequestEvidenceRegistry,
        )

        registry = RequestEvidenceRegistry(request_id="req-1")

        guessed_ref = "exact:abc123guessed"
        assert not registry.is_registered(guessed_ref)

        with pytest.raises(EvidenceNotRegisteredError):
            registry.resolve(guessed_ref)

    def test_guessed_web_id_rejected(self):
        from app.services.request_evidence_registry import (
            EvidenceNotRegisteredError,
            RequestEvidenceRegistry,
        )

        registry = RequestEvidenceRegistry(request_id="req-1")

        guessed_ref = "web:abc123guessed"
        with pytest.raises(EvidenceNotRegisteredError):
            registry.resolve(guessed_ref)

    def test_cross_request_ref_rejected(self):
        """Evidence from another request is rejected."""
        from app.services.request_evidence_registry import (
            EvidenceNotRegisteredError,
            RequestEvidenceRegistry,
        )

        registry1 = RequestEvidenceRegistry(request_id="req-1")
        registry2 = RequestEvidenceRegistry(request_id="req-2")

        evidence = self._make_canonical_evidence()
        ref1 = registry1.register_canonical_evidence(
            evidence=evidence, tool_call_id="call-1"
        )

        # ref1 is valid in registry1
        assert registry1.is_registered(ref1)

        # ref1 is NOT valid in registry2 (cross-request replay)
        assert not registry2.is_registered(ref1)
        with pytest.raises(EvidenceNotRegisteredError):
            registry2.resolve(ref1)

    def test_modified_opaque_id_rejected(self):
        from app.services.request_evidence_registry import (
            EvidenceNotRegisteredError,
            RequestEvidenceRegistry,
        )

        registry = RequestEvidenceRegistry(request_id="req-1")
        evidence = self._make_canonical_evidence()
        ref = registry.register_canonical_evidence(
            evidence=evidence, tool_call_id="call-1"
        )

        # Modify the ref slightly
        modified_ref = ref[:-1] + ("a" if ref[-1] != "a" else "b")
        assert not registry.is_registered(modified_ref)

        with pytest.raises(EvidenceNotRegisteredError):
            registry.resolve(modified_ref)

    def test_disposed_registry_rejects_all(self):
        from app.services.request_evidence_registry import (
            RegistryDisposedError,
            RequestEvidenceRegistry,
        )

        registry = RequestEvidenceRegistry(request_id="req-1")
        evidence = self._make_canonical_evidence()
        ref = registry.register_canonical_evidence(
            evidence=evidence, tool_call_id="call-1"
        )

        # Dispose the registry
        registry.dispose()

        # All operations fail after disposal
        assert registry.is_disposed
        assert not registry.is_registered(ref)

        with pytest.raises(RegistryDisposedError):
            registry.resolve(ref)

        with pytest.raises(RegistryDisposedError):
            registry.register_canonical_evidence(
                evidence=evidence, tool_call_id="call-2"
            )

    def test_valid_looking_unregistered_ref_rejected(self):
        """A syntactically valid but unregistered ref is rejected."""
        from app.services.request_evidence_registry import (
            EvidenceNotRegisteredError,
            RequestEvidenceRegistry,
        )

        registry = RequestEvidenceRegistry(request_id="req-1")

        # Valid format but never registered
        valid_looking = "exact:a1b2c3d4e5f6g7h8i9j0"
        with pytest.raises(EvidenceNotRegisteredError):
            registry.resolve(valid_looking)


# ---------------------------------------------------------------------------
# WebEvidenceNormalizer tests
# ---------------------------------------------------------------------------


class TestWebEvidenceNormalizer:
    """Tests for web evidence normalization using fixtures."""

    def test_actual_structured_web_citation_normalized(self):
        from app.services.request_evidence_registry import RequestEvidenceRegistry
        from app.services.web_evidence_normalizer import WebEvidenceNormalizer

        registry = RequestEvidenceRegistry(request_id="req-1")
        normalizer = WebEvidenceNormalizer()

        # Actual structured output (fixture, not live call)
        search_output = {
            "sources": [
                {
                    "url": "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing",
                    "title": "Visa listing - Home Affairs",
                    "citation": {"start_index": 0, "end_index": 100},
                }
            ]
        }

        results = normalizer.normalize_search_output(
            search_output=search_output,
            search_call_id="search-123",
            tool_call_id="call-1",
            registry=registry,
        )

        assert len(results) == 1
        evidence, ref = results[0]

        assert ref.startswith("web:")
        assert evidence.url == "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing"
        assert evidence.title == "Visa listing - Home Affairs"
        assert evidence.text is None  # Native web has no exact text
        assert evidence.content_hash is None  # Native web has no hash
        assert evidence.source_authenticity == "canonical_official"  # Home Affairs domain

    def test_plain_prose_url_not_evidence(self):
        """URLs in model prose are NOT normalized as evidence."""
        from app.services.web_evidence_normalizer import (
            reject_model_prose_url,
        )

        error = reject_model_prose_url("https://example.com")
        assert error.code == "MODEL_AUTHORED_URL"

    def test_user_supplied_url_not_evidence(self):
        from app.services.web_evidence_normalizer import reject_user_supplied_url

        error = reject_user_supplied_url("https://example.com")
        assert error.code == "USER_SUPPLIED_URL"

    def test_malformed_annotation_controlled_rejection(self):
        from app.services.request_evidence_registry import RequestEvidenceRegistry
        from app.services.web_evidence_normalizer import (
            InvalidWebSearchOutputError,
            WebEvidenceNormalizer,
        )

        registry = RequestEvidenceRegistry(request_id="req-1")
        normalizer = WebEvidenceNormalizer()

        # sources is not a list
        with pytest.raises(InvalidWebSearchOutputError):
            normalizer.normalize_search_output(
                search_output={"sources": "not a list"},
                search_call_id="search-123",
                tool_call_id="call-1",
                registry=registry,
            )

    def test_duplicate_provider_citations_deduplicated(self):
        from app.services.request_evidence_registry import RequestEvidenceRegistry
        from app.services.web_evidence_normalizer import WebEvidenceNormalizer

        registry = RequestEvidenceRegistry(request_id="req-1")
        normalizer = WebEvidenceNormalizer()

        search_output = {
            "sources": [
                {
                    "url": "https://example.com/page",
                    "title": "Page",
                    "citation": {"start_index": 0, "end_index": 4},
                },
                {
                    "url": "https://example.com/page",
                    "title": "Page",
                    "citation": {"start_index": 0, "end_index": 4},
                },  # Duplicate
            ]
        }

        results = normalizer.normalize_search_output(
            search_output=search_output,
            search_call_id="search-123",
            tool_call_id="call-1",
            registry=registry,
        )

        assert len(results) == 1  # Deduplicated

    def test_bare_structured_url_without_native_citation_is_not_evidence(self):
        from app.services.request_evidence_registry import RequestEvidenceRegistry
        from app.services.web_evidence_normalizer import WebEvidenceNormalizer

        registry = RequestEvidenceRegistry(request_id="req-1")
        results = WebEvidenceNormalizer().normalize_search_output(
            search_output={"sources": [{"url": "https://example.com", "title": "Example"}]},
            search_call_id="search-123",
            tool_call_id="call-1",
            registry=registry,
        )

        assert results == []
        assert registry.entry_count == 0


# ---------------------------------------------------------------------------
# Canonical evidence provenance tests
# ---------------------------------------------------------------------------


class TestCanonicalEvidenceProvenance:
    """Regression coverage for split local documents with partial provenance."""

    @staticmethod
    def _source(
        *, source_id: str, title: str, url: str, authority: str = "Federal Register of Legislation"
    ) -> SimpleNamespace:
        return SimpleNamespace(
            id=source_id,
            title=title,
            source_type="legislation",
            authority=authority,
            jurisdiction="Cth",
            metadata_json={},
            url=url,
            effective_date=None,
            repeal_date=None,
            document_version=None,
            status="active",
        )

    def test_split_schedule_inherits_only_a_unique_same_document_url(self):
        from app.services.canonical_evidence_service import CanonicalEvidenceService
        from app.services.request_evidence_registry import RequestEvidenceRegistry

        schedule_source = self._source(
            source_id="schedule-source",
            title="MIGRATION REGULATIONS 1994 - SCHEDULE 2 Provisions",
            url="",
        )
        parent_source = self._source(
            source_id="parent-source",
            title="Migration Regulations 1994 - selected provisions",
            url="https://www.legislation.gov.au/F1996B03551/latest/text",
            authority="Commonwealth of Australia",
        )
        chunk = SimpleNamespace(
            id="schedule-chunk",
            source_id="schedule-source",
            section_ref="500.211",
            heading="Primary criteria",
            chunk_index=1,
            text="Exact local Schedule text.",
        )

        class FakeDb:
            def scalars(self, _statement):
                return [parent_source]

        registry = RequestEvidenceRegistry(request_id="partial-provenance")
        evidence, evidence_ref = CanonicalEvidenceService(FakeDb())._build_from_loaded(
            source=schedule_source,
            chunk=chunk,
            tool_call_id="call-1",
            registry=registry,
            provision_override=None,
        )

        assert evidence.evidence_ref == evidence_ref
        assert evidence.canonical_source_id == "schedule-source"
        assert evidence.canonical_chunk_id == "schedule-chunk"
        assert evidence.canonical_url == parent_source.url
        assert evidence.content_hash == hashlib.sha256(chunk.text.encode()).hexdigest()
        assert not evidence.provenance_complete
        assert registry.resolve_evidence(evidence_ref).canonical_chunk_id == "schedule-chunk"

    def test_ambiguous_parent_urls_fail_closed(self):
        from app.services.canonical_evidence_service import (
            CanonicalEvidenceError,
            CanonicalEvidenceService,
        )

        schedule_source = self._source(
            source_id="schedule-source",
            title="Migration Regulations 1994 - Schedule 1 Classes",
            url="",
        )
        first_parent = self._source(
            source_id="parent-a",
            title="Migration Regulations 1994 - selected provisions A",
            url="https://www.legislation.gov.au/F1996B03551/latest/text",
        )
        second_parent = self._source(
            source_id="parent-b",
            title="Migration Regulations 1994 - selected provisions B",
            url="https://www.legislation.gov.au/F1996B03551/other",
        )

        class FakeDb:
            def scalars(self, _statement):
                return [first_parent, second_parent]

        with pytest.raises(CanonicalEvidenceError) as exc_info:
            CanonicalEvidenceService(FakeDb())._resolve_canonical_url(schedule_source)

        assert exc_info.value.code == "CANONICAL_URL_UNAVAILABLE"


class TestAuthorityKindNormalization:
    """Authority follows deterministic document identity, not broad type alone."""

    @pytest.mark.parametrize(
        ("title", "version", "expected"),
        [
            ("Migration Act 1958", "C2026C00090", "statute"),
            ("Migration Regulations 1994", "F2026C00266", "delegated_legislation"),
            (
                "Migration Regulations 1994 - Schedule 2",
                None,
                "delegated_legislation",
            ),
        ],
    )
    def test_known_migration_document_identity(self, title, version, expected):
        from app.services.canonical_evidence_service import normalize_authority_kind

        assert (
            normalize_authority_kind(
                "legislation", {}, document_title=title, document_version=version
            )
            == expected
        )

    def test_unknown_generic_legislation_is_not_invented_as_statute(self):
        from app.services.canonical_evidence_service import normalize_authority_kind

        assert (
            normalize_authority_kind(
                "legislation", {}, document_title="Unclassified legal material"
            )
            == "commentary"
        )


# ---------------------------------------------------------------------------
# Cross-reference parser tests
# ---------------------------------------------------------------------------


class TestCrossReferenceParser:
    """Tests for legal cross-reference extraction."""

    def test_schedule_reference_extracted(self):
        from app.services.cross_reference_parser import extract_cross_references

        text = "Applicants must meet the criteria in Schedule 3 of the Regulations."
        refs = extract_cross_references(text)

        assert len(refs) >= 1
        schedule_refs = [r for r in refs if r.locator.locator_type == "schedule"]
        assert len(schedule_refs) == 1
        assert schedule_refs[0].locator.target_provision == "3"

    def test_schedule_7a_reference(self):
        from app.services.cross_reference_parser import extract_cross_references

        text = "See Schedule 7A for the points test."
        refs = extract_cross_references(text)

        schedule_refs = [r for r in refs if r.locator.locator_type == "schedule"]
        assert len(schedule_refs) == 1
        assert schedule_refs[0].locator.target_provision == "7A"

    def test_regulation_reference(self):
        from app.services.cross_reference_parser import extract_cross_references

        text = "Under regulation 2.07, the application must be made..."
        refs = extract_cross_references(text)

        reg_refs = [r for r in refs if r.locator.locator_type == "regulation"]
        assert len(reg_refs) == 1
        assert reg_refs[0].locator.target_provision == "2.07"

    def test_section_reference_ambiguous(self):
        from app.services.cross_reference_parser import extract_cross_references

        text = "Section 48 of the Act provides..."
        refs = extract_cross_references(text)

        section_refs = [r for r in refs if r.locator.locator_type == "section"]
        assert len(section_refs) == 1
        assert section_refs[0].locator.is_ambiguous  # Act not specified

    def test_multiple_references_extracted(self):
        from app.services.cross_reference_parser import extract_cross_references

        text = """
        The applicant must satisfy Schedule 3 criteria.
        See also regulation 2.07 and section 48 of the Migration Act.
        """
        refs = extract_cross_references(text)

        assert len(refs) >= 3

    def test_duplicate_references_deduplicated(self):
        from app.services.cross_reference_parser import extract_cross_references

        text = "Schedule 3 applies. See Schedule 3 for details."
        refs = extract_cross_references(text)

        schedule_refs = [r for r in refs if r.locator.locator_type == "schedule"]
        assert len(schedule_refs) == 1  # Deduplicated

    def test_bounded_extraction_count(self):
        from app.services.cross_reference_parser import extract_cross_references

        # Create text with many references
        text = " ".join(f"Schedule {i}" for i in range(1, 100))
        refs = extract_cross_references(text, max_refs=10)

        assert len(refs) <= 10

    def test_no_references_returns_empty(self):
        from app.services.cross_reference_parser import extract_cross_references

        text = "This is plain text with no legal references."
        refs = extract_cross_references(text)
        assert len(refs) == 0

    def test_malformed_locator_not_crash(self):
        from app.services.cross_reference_parser import extract_cross_references

        text = "Schedule ??? and regulation ....."
        refs = extract_cross_references(text)
        # Should not crash; may return empty or partial
        assert isinstance(refs, list)


class TestExactLookupScheduleFamilyDetection:
    """Named Schedule locators use the complete coverage-family mapping."""

    @pytest.mark.parametrize(
        ("locator", "expected"),
        [
            ("Schedule 1", "migration_regulations_schedule_1"),
            ("Schedule 10", "migration_regulations_schedule_10"),
            ("Schedule 13", "migration_regulations_schedule_13"),
            ("Schedule 7A", "migration_regulations_schedule_7a"),
            ("Schedule 6D", "migration_regulations_schedule_6d"),
        ],
    )
    def test_named_schedule_uses_general_locator_family(self, locator, expected):
        from app.schemas.tools import ExactLegalLookupRequest
        from app.services.exact_legal_source_service import ExactLegalSourceService

        request = ExactLegalLookupRequest(document_id=locator, as_of_date=date(2026, 8, 18))
        assert ExactLegalSourceService(None)._determine_family(request) == expected

    def test_unknown_named_schedule_remains_unknown(self):
        from app.schemas.tools import ExactLegalLookupRequest
        from app.services.exact_legal_source_service import ExactLegalSourceService

        request = ExactLegalLookupRequest(
            document_id="Migration Regulations 1994 - Schedule 12",
            as_of_date=date(2026, 8, 18),
        )
        assert ExactLegalSourceService(None)._determine_family(request) is None


# ---------------------------------------------------------------------------
# Deterministic utility tests
# ---------------------------------------------------------------------------


class TestDeterministicUtility:
    """Tests for deterministic utility operations."""

    def test_decimal_arithmetic(self):
        from app.schemas.tools import DeterministicUtilityRequest
        from app.tools.deterministic_utility import execute_utility

        request = DeterministicUtilityRequest(
            operation="arithmetic",
            operands=["0.1"],  # Schema requires at least 1 operand
            expression="0.1 + 0.2",
        )
        result = execute_utility(request)

        # Decimal precision: 0.1 + 0.2 = 0.3 exactly (not 0.30000000000000004)
        assert result.result == "0.3"

    def test_percentage(self):
        from app.schemas.tools import DeterministicUtilityRequest
        from app.tools.deterministic_utility import execute_utility

        request = DeterministicUtilityRequest(
            operation="percentage",
            operands=[25, 100],
        )
        result = execute_utility(request)
        # Result is Decimal string with default precision
        assert result.result in ("25", "25.00")

    def test_rounding_half_up(self):
        from app.schemas.tools import DeterministicUtilityRequest
        from app.tools.deterministic_utility import execute_utility

        request = DeterministicUtilityRequest(
            operation="arithmetic",
            operands=["10"],  # Schema requires at least 1 operand
            expression="10 / 3",
            rounding="half_up",
            precision=2,
        )
        result = execute_utility(request)
        assert result.result == "3.33"

    def test_date_add_days(self):
        from app.schemas.tools import DeterministicUtilityRequest
        from app.tools.deterministic_utility import execute_utility

        request = DeterministicUtilityRequest(
            operation="date_add",
            operands=["2026-01-15", 10, "days"],
        )
        result = execute_utility(request)
        assert result.result == "2026-01-25"

    def test_date_add_leap_year(self):
        from app.schemas.tools import DeterministicUtilityRequest
        from app.tools.deterministic_utility import execute_utility

        # Feb 28 2024 + 1 day = Feb 29 (leap year)
        request = DeterministicUtilityRequest(
            operation="date_add",
            operands=["2024-02-28", 1, "days"],
        )
        result = execute_utility(request)
        assert result.result == "2024-02-29"

    def test_date_add_month_boundary(self):
        from app.schemas.tools import DeterministicUtilityRequest
        from app.tools.deterministic_utility import execute_utility

        # Jan 31 + 1 month = Feb 28/29 (clamped)
        request = DeterministicUtilityRequest(
            operation="date_add",
            operands=["2026-01-31", 1, "months"],
        )
        result = execute_utility(request)
        assert result.result == "2026-02-28"  # 2026 not leap year

    def test_date_difference(self):
        from app.schemas.tools import DeterministicUtilityRequest
        from app.tools.deterministic_utility import execute_utility

        request = DeterministicUtilityRequest(
            operation="date_difference",
            operands=["2026-01-01", "2026-01-31"],
        )
        result = execute_utility(request)
        assert result.result["days"] == 30

    def test_business_days_rejected(self):
        """Business days require approved holiday calendar."""
        from app.schemas.tools import DeterministicUtilityRequest
        from app.tools.deterministic_utility import (
            UnsupportedCalendarError,
            execute_utility,
        )

        request = DeterministicUtilityRequest(
            operation="date_add",
            operands=["2026-01-15", 5, "days"],
            calendar="business_days",
        )

        with pytest.raises(UnsupportedCalendarError):
            execute_utility(request)

    def test_division_by_zero_rejected(self):
        from app.schemas.tools import DeterministicUtilityRequest
        from app.tools.deterministic_utility import DivisionByZeroError, execute_utility

        request = DeterministicUtilityRequest(
            operation="arithmetic",
            operands=["10"],  # Schema requires at least 1 operand
            expression="10 / 0",
        )

        with pytest.raises(DivisionByZeroError):
            execute_utility(request)

    def test_code_injection_rejected(self):
        """Expressions with code are rejected."""
        from app.schemas.tools import DeterministicUtilityRequest
        from app.tools.deterministic_utility import (
            InvalidExpressionError,
            execute_utility,
        )

        request = DeterministicUtilityRequest(
            operation="arithmetic",
            operands=["1"],  # Schema requires at least 1 operand
            expression="__import__('os').system('rm -rf /')",
        )

        with pytest.raises(InvalidExpressionError):
            execute_utility(request)

    def test_invalid_expression_rejected(self):
        from app.schemas.tools import DeterministicUtilityRequest
        from app.tools.deterministic_utility import (
            InvalidExpressionError,
            execute_utility,
        )

        request = DeterministicUtilityRequest(
            operation="arithmetic",
            operands=["1"],  # Schema requires at least 1 operand
            expression="eval('1+1')",
        )

        with pytest.raises(InvalidExpressionError):
            execute_utility(request)

    def test_unit_conversion(self):
        from app.schemas.tools import DeterministicUtilityRequest
        from app.tools.deterministic_utility import execute_utility

        request = DeterministicUtilityRequest(
            operation="unit_convert",
            operands=[1, "km", "m"],
        )
        result = execute_utility(request)
        assert result.result["value"] == "1000"

    def test_invalid_unit_conversion(self):
        from app.schemas.tools import DeterministicUtilityRequest
        from app.tools.deterministic_utility import UtilityError, execute_utility

        request = DeterministicUtilityRequest(
            operation="unit_convert",
            operands=[1, "banana", "apple"],
        )

        with pytest.raises(UtilityError):
            execute_utility(request)


# ---------------------------------------------------------------------------
# AgentSubmissionValidator tests
# ---------------------------------------------------------------------------


class TestAgentSubmissionValidator:
    """Tests for submission validation."""

    def _make_valid_submission(self):
        from app.schemas.agent import AgentSubmissionV2

        return AgentSubmissionV2(
            schema_version="agent_submission.v2",
            answer_class="general",
            draft_markdown="Hello, how can I help?",
            as_of_date=date(2026, 8, 18),
            claims=[],
            citations=[],
            research_status="not_required",
            state_patch=[],
        )

    def test_valid_general_submission(self):
        from app.services.agent_submission_validator import validate_submission
        from app.services.request_evidence_registry import RequestEvidenceRegistry

        registry = RequestEvidenceRegistry(request_id="req-1")
        submission = self._make_valid_submission()

        result = validate_submission(submission, registry)
        assert result.valid

    def test_claim_span_out_of_bounds_rejected(self):
        """Schema itself rejects out-of-bounds spans."""
        from app.schemas.agent import AgentClaim, AgentSubmissionV2
        import pydantic

        # The AgentSubmissionV2 schema validates span bounds
        with pytest.raises(pydantic.ValidationError) as exc_info:
            AgentSubmissionV2(
                schema_version="agent_submission.v2",
                answer_class="general",
                draft_markdown="Short text",
                claims=[
                    AgentClaim(
                        claim_id="c1",
                        claim_type="general",
                        materiality="supporting",
                        text="Text beyond bounds",
                        draft_start=0,
                        draft_end=1000,  # Beyond draft length
                        evidence_refs=[],
                    )
                ],
                citations=[],
                research_status="not_required",
                state_patch=[],
            )
        # Schema rejects at validation time
        assert "ends beyond draft_markdown" in str(exc_info.value)

    def test_unregistered_evidence_ref_rejected(self):
        from app.schemas.agent import AgentClaim, AgentSubmissionV2
        from app.services.agent_submission_validator import validate_submission
        from app.services.request_evidence_registry import RequestEvidenceRegistry

        registry = RequestEvidenceRegistry(request_id="req-1")

        submission = AgentSubmissionV2(
            schema_version="agent_submission.v2",
            answer_class="substantive_legal",
            draft_markdown="Legal claim text",
            claims=[
                AgentClaim(
                    claim_id="c1",
                    claim_type="legal_rule",
                    materiality="decisive",
                    text="Legal claim text",
                    draft_start=0,
                    draft_end=16,
                    evidence_refs=["exact:unregistered123"],
                )
            ],
            citations=[],
            research_status="complete",
            state_patch=[],
        )

        result = validate_submission(submission, registry)
        assert not result.valid
        assert any(e.code == "EVIDENCE_NOT_REGISTERED" for e in result.errors)

    def test_claim_text_must_match_the_declared_draft_span(self):
        from app.schemas.agent import AgentClaim, AgentSubmissionV2
        from app.services.agent_submission_validator import validate_submission
        from app.services.request_evidence_registry import RequestEvidenceRegistry

        submission = AgentSubmissionV2(
            schema_version="agent_submission.v2",
            answer_class="general",
            draft_markdown="A correct statement.",
            claims=[
                AgentClaim(
                    claim_id="c1",
                    claim_type="general",
                    materiality="supporting",
                    text="A different statement.",
                    draft_start=0,
                    draft_end=20,
                    evidence_refs=[],
                )
            ],
            citations=[],
            research_status="not_required",
            state_patch=[],
        )

        result = validate_submission(submission, RequestEvidenceRegistry(request_id="req-1"))
        assert not result.valid
        assert any(error.code == "CLAIM_TEXT_SPAN_MISMATCH" for error in result.errors)

    def test_substantive_with_not_required_research_rejected(self):
        from app.schemas.agent import AgentSubmissionV2
        from app.services.agent_submission_validator import validate_submission
        from app.services.request_evidence_registry import RequestEvidenceRegistry

        registry = RequestEvidenceRegistry(request_id="req-1")

        submission = AgentSubmissionV2(
            schema_version="agent_submission.v2",
            answer_class="substantive_legal",
            draft_markdown="Legal answer",
            claims=[],
            citations=[],
            research_status="not_required",  # Invalid for substantive
            state_patch=[],
        )

        result = validate_submission(submission, registry)
        assert not result.valid
        assert any(e.code == "RESEARCH_STATUS_INCONSISTENT" for e in result.errors)


# ---------------------------------------------------------------------------
# TerminalSubmissionPolicy tests
# ---------------------------------------------------------------------------


class TestTerminalSubmissionPolicy:
    """Tests for provider-agnostic terminal submission policy."""

    def test_first_missing_allows_one_continuation(self):
        from app.services.terminal_submission_policy import (
            TerminalSubmissionPolicy,
            create_terminal_submission_record,
        )

        policy = TerminalSubmissionPolicy()
        record = create_terminal_submission_record()

        action = policy.handle_missing_submission(record, deadline_remaining_ms=10000)

        assert action.can_continue
        assert action.action == "issue_continuation"
        assert record.terminal_submission_missing
        assert record.correction_count == 1
        assert not record.raw_text_publishable

    def test_second_missing_fails_closed(self):
        from app.services.terminal_submission_policy import (
            TerminalSubmissionPolicy,
            create_terminal_submission_record,
        )

        policy = TerminalSubmissionPolicy()
        record = create_terminal_submission_record()

        # First miss
        policy.handle_missing_submission(record, deadline_remaining_ms=10000)

        # Second miss
        action = policy.handle_second_miss(record)

        assert not action.can_continue
        assert action.action == "fail_closed"

    def test_deadline_expired_no_continuation(self):
        from app.services.terminal_submission_policy import (
            TerminalSubmissionPolicy,
            create_terminal_submission_record,
        )

        policy = TerminalSubmissionPolicy()
        record = create_terminal_submission_record()

        action = policy.handle_missing_submission(record, deadline_remaining_ms=0)

        assert not action.can_continue
        assert action.action == "fail_closed"

    def test_invalid_submission_consumes_allowance(self):
        from app.services.terminal_submission_policy import (
            TerminalSubmissionPolicy,
            create_terminal_submission_record,
        )

        policy = TerminalSubmissionPolicy()
        record = create_terminal_submission_record()

        # Invalid submission
        action = policy.handle_invalid_submission(
            record, errors=["test error"], deadline_remaining_ms=10000
        )

        assert action.can_continue  # One correction allowed
        assert record.correction_count == 1

        # Second invalid
        action2 = policy.handle_invalid_submission(
            record, errors=["another error"], deadline_remaining_ms=10000
        )

        assert not action2.can_continue  # Allowance consumed

    def test_valid_submission_terminal(self):
        from app.services.terminal_submission_policy import (
            TerminalSubmissionPolicy,
            create_terminal_submission_record,
        )

        policy = TerminalSubmissionPolicy()
        record = create_terminal_submission_record()

        action = policy.handle_valid_submission(record)

        assert not action.can_continue
        assert action.action == "accept_submission"
        assert record.submission_valid


# ---------------------------------------------------------------------------
# EvidencePostconditionService tests
# ---------------------------------------------------------------------------


class TestEvidencePostconditionService:
    """Tests for evidence postcondition evaluation."""

    def _make_canonical_evidence(self):
        from app.schemas.evidence import CanonicalLocalEvidenceRef

        text = "Test legal text"
        return CanonicalLocalEvidenceRef(
            evidence_origin="canonical_local",
            evidence_ref="exact:pending",
            source_type="legislation",
            source_authenticity="canonical_official",
            authority_kind="statute",
            jurisdiction="Cth",
            binding_status="binding",
            court_or_tribunal_level=None,
            retrieved_at=datetime.now(timezone.utc),
            provenance_complete=True,
            canonical_source_id="test-source-id",
            canonical_chunk_id="test-chunk-id",
            document_id="Test Document",
            document_version="v1",
            provision_or_span="s 48",
            effective_from=None,
            effective_to=None,
            canonical_url="https://www.legislation.gov.au/test",
            content_hash=hashlib.sha256(text.encode()).hexdigest(),
            text=text,
        )

    def test_general_submission_not_required(self):
        from app.schemas.agent import AgentSubmissionV2
        from app.services.evidence_postcondition_service import evaluate_postcondition
        from app.services.request_evidence_registry import RequestEvidenceRegistry

        registry = RequestEvidenceRegistry(request_id="req-1")

        submission = AgentSubmissionV2(
            schema_version="agent_submission.v2",
            answer_class="general",
            draft_markdown="Hello!",
            claims=[],
            citations=[],
            research_status="not_required",
            state_patch=[],
        )

        result = evaluate_postcondition(submission, registry)
        assert result.status == "not_required"

    def test_decisive_legal_claim_without_evidence_fails(self):
        from app.schemas.agent import AgentClaim, AgentSubmissionV2
        from app.services.evidence_postcondition_service import evaluate_postcondition
        from app.services.request_evidence_registry import RequestEvidenceRegistry

        registry = RequestEvidenceRegistry(request_id="req-1")

        draft = "The law requires X."
        submission = AgentSubmissionV2(
            schema_version="agent_submission.v2",
            answer_class="substantive_legal",
            draft_markdown=draft,
            claims=[
                AgentClaim(
                    claim_id="c1",
                    claim_type="legal_rule",
                    materiality="decisive",
                    text=draft,
                    draft_start=0,
                    draft_end=len(draft),  # Correct span
                    evidence_refs=[],  # No evidence
                )
            ],
            citations=[],
            research_status="complete",
            state_patch=[],
        )

        result = evaluate_postcondition(submission, registry)
        assert result.status == "failed"

    def test_decisive_claim_with_registered_evidence_passes(self):
        from app.schemas.agent import AgentClaim, AgentSubmissionV2
        from app.services.evidence_postcondition_service import evaluate_postcondition
        from app.services.request_evidence_registry import RequestEvidenceRegistry

        registry = RequestEvidenceRegistry(request_id="req-1")

        # Register evidence
        evidence = self._make_canonical_evidence()
        ref = registry.register_canonical_evidence(
            evidence=evidence, tool_call_id="call-1"
        )

        draft = "The law requires X."
        submission = AgentSubmissionV2(
            schema_version="agent_submission.v2",
            answer_class="substantive_legal",
            draft_markdown=draft,
            claims=[
                AgentClaim(
                    claim_id="c1",
                    claim_type="legal_rule",
                    materiality="decisive",
                    text=draft,
                    draft_start=0,
                    draft_end=len(draft),  # Correct span
                    evidence_refs=[ref],
                )
            ],
            citations=[],
            research_status="complete",
            state_patch=[],
        )

        result = evaluate_postcondition(submission, registry)
        assert result.status == "passed"

    def test_expired_evidence_cannot_support_a_current_fact(self):
        from datetime import date

        from app.schemas.agent import AgentClaim, AgentSubmissionV2
        from app.services.evidence_postcondition_service import evaluate_postcondition
        from app.services.request_evidence_registry import RequestEvidenceRegistry

        registry = RequestEvidenceRegistry(request_id="req-1")
        evidence = self._make_canonical_evidence().model_copy(
            update={"effective_to": date(2020, 1, 1)}
        )
        ref = registry.register_canonical_evidence(evidence=evidence, tool_call_id="call-1")
        draft = "The current rule is X."
        submission = AgentSubmissionV2(
            schema_version="agent_submission.v2",
            answer_class="substantive_legal",
            draft_markdown=draft,
            as_of_date=date(2026, 8, 18),
            claims=[
                AgentClaim(
                    claim_id="c1",
                    claim_type="current_fact",
                    materiality="decisive",
                    text=draft,
                    draft_start=0,
                    draft_end=len(draft),
                    evidence_refs=[ref],
                )
            ],
            citations=[],
            research_status="complete",
            state_patch=[],
        )

        result = evaluate_postcondition(submission, registry)
        assert result.status == "failed"
        assert result.claim_evaluations[0].status == "insufficient"

    def test_partial_canonical_span_supports_bounded_legal_rule_and_keeps_limitation(self):
        from app.schemas.agent import AgentClaim, AgentSubmissionV2
        from app.services.evidence_postcondition_service import evaluate_postcondition
        from app.services.request_evidence_registry import RequestEvidenceRegistry

        registry = RequestEvidenceRegistry(request_id="partial-local-span")
        evidence = self._make_canonical_evidence().model_copy(
            update={
                "document_id": "Migration Regulations 1994 - Schedule 2",
                "document_version": "unknown",
                "authority_kind": "delegated_legislation",
                "provenance_complete": False,
                "effective_from": None,
                "effective_to": None,
            }
        )
        ref = registry.register_canonical_evidence(evidence=evidence, tool_call_id="call-1")
        draft = "The registered Schedule text states the bounded rule X."
        submission = AgentSubmissionV2(
            schema_version="agent_submission.v2",
            answer_class="substantive_legal",
            draft_markdown=draft,
            claims=[
                AgentClaim(
                    claim_id="c1",
                    claim_type="legal_rule",
                    materiality="decisive",
                    text=draft,
                    draft_start=0,
                    draft_end=len(draft),
                    evidence_refs=[ref],
                )
            ],
            citations=[],
            research_status="incomplete",
            state_patch=[],
        )

        result = evaluate_postcondition(submission, registry)

        assert result.status == "passed"
        assert "Evidence provenance incomplete" in result.claim_evaluations[0].reasons
        assert registry.resolve_evidence(ref).provenance_complete is False

    def test_partial_canonical_span_cannot_support_current_law_claim(self):
        from app.schemas.agent import AgentClaim, AgentSubmissionV2
        from app.services.evidence_postcondition_service import evaluate_postcondition
        from app.services.request_evidence_registry import RequestEvidenceRegistry

        registry = RequestEvidenceRegistry(request_id="partial-current-law")
        evidence = self._make_canonical_evidence().model_copy(
            update={
                "document_version": "unknown",
                "authority_kind": "delegated_legislation",
                "provenance_complete": False,
                "effective_from": None,
                "effective_to": None,
            }
        )
        ref = registry.register_canonical_evidence(evidence=evidence, tool_call_id="call-1")
        draft = "The current law is rule X."
        submission = AgentSubmissionV2(
            schema_version="agent_submission.v2",
            answer_class="substantive_legal",
            draft_markdown=draft,
            as_of_date=date(2026, 8, 18),
            claims=[
                AgentClaim(
                    claim_id="c1",
                    claim_type="current_fact",
                    materiality="decisive",
                    text=draft,
                    draft_start=0,
                    draft_end=len(draft),
                    evidence_refs=[ref],
                )
            ],
            citations=[],
            research_status="incomplete",
            state_patch=[],
        )

        result = evaluate_postcondition(submission, registry)

        assert result.status == "failed"
        assert "Canonical evidence has no document version" in result.claim_evaluations[0].reasons
        assert "Canonical evidence has no effective interval" in result.claim_evaluations[0].reasons

    def test_unresolved_cross_references_prevent_research_complete_claim(self):
        from app.schemas.agent import AgentClaim, AgentSubmissionV2
        from app.services.evidence_postcondition_service import evaluate_postcondition
        from app.services.request_evidence_registry import RequestEvidenceRegistry

        registry = RequestEvidenceRegistry(request_id="unresolved-xref")
        ref = registry.register_canonical_evidence(
            evidence=self._make_canonical_evidence(), tool_call_id="call-1"
        )
        registry.record_exact_lookup_outcome(
            tool_call_id="call-1", unresolved_cross_references=["section 48"]
        )
        draft = "The research is complete and rule X applies."
        submission = AgentSubmissionV2(
            schema_version="agent_submission.v2",
            answer_class="substantive_legal",
            draft_markdown=draft,
            claims=[
                AgentClaim(
                    claim_id="c1",
                    claim_type="legal_rule",
                    materiality="decisive",
                    text=draft,
                    draft_start=0,
                    draft_end=len(draft),
                    evidence_refs=[ref],
                )
            ],
            citations=[],
            research_status="complete",
            state_patch=[],
        )

        result = evaluate_postcondition(submission, registry)

        assert result.status == "failed"
        assert "Research marked complete despite unresolved cross-references" in result.claim_evaluations[0].reasons

    def test_guessed_ref_fails(self):
        from app.schemas.agent import AgentClaim, AgentSubmissionV2
        from app.services.evidence_postcondition_service import evaluate_postcondition
        from app.services.request_evidence_registry import RequestEvidenceRegistry

        registry = RequestEvidenceRegistry(request_id="req-1")

        draft = "The law requires X."
        submission = AgentSubmissionV2(
            schema_version="agent_submission.v2",
            answer_class="substantive_legal",
            draft_markdown=draft,
            claims=[
                AgentClaim(
                    claim_id="c1",
                    claim_type="legal_rule",
                    materiality="decisive",
                    text=draft,
                    draft_start=0,
                    draft_end=len(draft),  # Correct span
                    evidence_refs=["exact:guessed123"],  # Not registered
                )
            ],
            citations=[],
            research_status="complete",
            state_patch=[],
        )

        result = evaluate_postcondition(submission, registry)
        assert result.status == "failed"
