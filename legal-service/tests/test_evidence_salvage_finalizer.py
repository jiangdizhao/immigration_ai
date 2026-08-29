from __future__ import annotations

from types import SimpleNamespace

from app.schemas.agent import AgentExecutionMetrics
from app.services.evidence_salvage_finalizer import EvidenceSalvageFinalizer


def _entry(*, origin: str, ref: str, title: str = "Recovered source", url: str = ""):
    return SimpleNamespace(
        evidence_origin=origin,
        evidence_ref=ref,
        canonical_source_id="Migration Regulations",
        canonical_chunk_id="chunk-1",
        provision_or_span="Schedule 2, item 1",
        url=url,
        search_call_id="search-1",
        native_web_citation=None,
        evidence_record=SimpleNamespace(title=title, canonical_url=url),
    )


def test_salvage_requires_completed_legal_or_usable_web_evidence():
    assert EvidenceSalvageFinalizer.build(
        is_zh=False,
        local_entries=[_entry(origin="derived_relationship", ref="graph:1")],
    ) is None
    assert EvidenceSalvageFinalizer.build(is_zh=False) is None

    result = EvidenceSalvageFinalizer.build(
        is_zh=False,
        local_entries=[_entry(origin="canonical_local", ref="exact:1")],
    )
    assert result is not None
    assert result.recovered_legal_evidence_count == 1
    assert "definitive case-specific" in result.answer


def test_salvage_deduplicates_and_caps_display_without_losing_counts():
    sources = [
        {"title": f"Source {index}", "url": f"https://example.gov.au/{index}"}
        for index in range(12)
    ]
    sources.append({"title": "Duplicate", "url": "https://example.gov.au/1/"})

    result = EvidenceSalvageFinalizer.build(
        is_zh=False,
        web_sources=sources,
        citation_count=4,
    )

    assert result is not None
    assert result.recovered_web_source_count == 12
    assert result.recovered_citation_count == 4
    assert result.displayed_source_count == 10
    assert len(result.compact_sources) == 10
    assert "internal call" not in result.answer.lower()


def test_salvage_does_not_expose_partial_prose_or_diagnostic_metadata():
    result = EvidenceSalvageFinalizer.build(
        is_zh=False,
        web_sources=[{"title": "Official page", "url": "https://example.gov.au/page"}],
    )

    assert result is not None
    assert "partial" not in result.answer.lower()
    assert "provider" not in result.answer.lower()
    assert "https://example.gov.au/page" in result.answer


def test_salvage_uses_displayable_labels_and_deduplicates_local_provisions():
    first = _entry(origin="canonical_local", ref="exact:one", url="")
    first.canonical_source_id = "9f4a9d8e-6b8e-4f2d-9f4b-123456789abc"
    first.provision_or_span = "s 347"
    first.evidence_record.title = "Migration Act 1958"
    second = _entry(origin="canonical_local", ref="exact:two", url="")
    second.canonical_source_id = first.canonical_source_id
    second.provision_or_span = first.provision_or_span
    second.evidence_record.title = first.evidence_record.title

    result = EvidenceSalvageFinalizer.build(
        is_zh=False,
        local_entries=[first, second],
        web_sources=[
            {"title": "page_333", "url": "https://www.homeaffairs.gov.au/visa"},
            {"title": "duplicate", "url": "https://www.homeaffairs.gov.au/visa/"},
        ],
    )

    assert result is not None
    assert result.answer.count("Migration Act 1958 — s 347") == 1
    assert "9f4a9d8e-6b8e-4f2d-9f4b-123456789abc" not in result.answer
    assert "page_333" not in result.answer
    assert result.answer.count("https://www.homeaffairs.gov.au/visa") == 1


def test_default_failure_path_uses_salvage_for_recovered_registry_evidence():
    from app.services.default_agent_serving_service import DefaultAgentServingService

    metrics = AgentExecutionMetrics(
        turn_deadline_ms=60000,
        remaining_deadline_before_call_ms=1000,
        terminal_recovery_triggered=True,
        completion_status="safe_failure",
        metrics_complete=True,
    )
    result = SimpleNamespace(
        model="gpt-5.6-luna",
        metrics=metrics,
        completion_status="safe_failure",
        terminal_continuation_triggered=True,
        checker_status="not_required",
        checker_provider_call_count=0,
        checker_result_tool_call_count=0,
        reasoning_bank_telemetry={"mode": "off", "guidance_injected": False},
    )
    exact = _entry(origin="canonical_local", ref="exact:1")
    web = _entry(
        origin="openai_web_native",
        ref="web:1",
        title="Official government page",
        url="https://example.gov.au/official",
    )

    class Registry:
        def get_all_refs(self):
            return ["exact:1", "web:1"]

        def resolve(self, ref):
            return {"exact:1": exact, "web:1": web}[ref]

        def get_refs_by_origin(self, origin):
            return [
                ref
                for ref, entry in {"exact:1": exact, "web:1": web}.items()
                if entry.evidence_origin == origin
            ]

    response = DefaultAgentServingService()._failure_response(
        matter_id=None,
        response_language="en",
        result=result,
        registry=Registry(),
    )

    assert response.research_status == "incomplete"
    assert response.retrieval_debug["completion_status"] == "evidence_salvage"
    assert response.retrieval_debug["evidence_salvage"]["evidence_salvage_triggered"] is True
    assert response.retrieval_debug["execution_metrics"]["completion_status"] == "evidence_salvage"
    assert response.escalate is True
    assert "couldn't complete the research" not in response.answer.lower()
    assert "https://example.gov.au/official" in response.answer
