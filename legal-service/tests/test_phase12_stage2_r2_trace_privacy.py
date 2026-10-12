"""Phase 12 Stage 2 R2-B — customer filenames never enter traces or archives.

Reviewer finding R2-B: the review trace recorded ``customer_document_summary``,
which carries ``unusableFilenames`` (customer content), and the archive received
the full request once the summary field existed. A stored filename can itself be
personal data, and traces/archives are read far more widely than the
authenticated customer's own UI.

These tests lock the corrected contract:

* routine trace payloads keep only numeric counts and availability/packaging
  states — never a filename, whether via the request dump or the explicit
  summary field;
* the experience archive can no longer receive a filename through
  ``customer_document_summary``;
* the authenticated application's own file display (which reads the application
  database, not these traces) is untouched.
"""
from __future__ import annotations

from types import SimpleNamespace

from app.schemas.query import (
    CustomerDocumentSummary,
    QueryRequest,
    QueryResponse,
)
from app.services.customer_document_context import sanitized_customer_document_summary
from app.services.experience_archive_service import ExperienceArchiveService
from app.services.review_trace_service import ReviewTraceService

SENSITIVE_FILENAME = "Client_Passport_12345678.pdf"
OTHER_FILENAMES = ["Bank statement 2026.pdf", "TRN letter.pdf"]


def _summary() -> CustomerDocumentSummary:
    return CustomerDocumentSummary(
        total=65,
        usable=62,
        usableTruncated=4,
        noUsableContent=2,
        processing=1,
        failed=1,
        packaged=8,
        unusableFilenames=[SENSITIVE_FILENAME, *OTHER_FILENAMES],
    )


def _payload() -> QueryRequest:
    return QueryRequest(
        question="Summarise my uploaded documents",
        customer_document_summary=_summary(),
        customer_document_evidence={
            "documents": [
                {
                    "documentId": "doc-1",
                    "runId": "run-1",
                    "originalFilename": SENSITIVE_FILENAME,
                    "mimeType": "application/pdf",
                    "runStatus": "complete",
                    "extractionMethod": "native",
                    "truncated": False,
                    "includedUnitOrdinals": [1],
                    "locators": [{"kind": "page", "page": 1}],
                    "units": [
                        {
                            "ordinal": 1,
                            "locator": {"kind": "page", "page": 1},
                            "text": "Grant of visa until 2027.",
                            "extractionMethod": "native",
                        }
                    ],
                }
            ]
        },
    )


def _response() -> QueryResponse:
    return QueryResponse(
        matter_id="matter-1",
        answer="Acknowledged answer",
        response_language="en",
        confidence="medium",
        next_action="answer",
        customer_document_usage="confirmed",
        customer_document_evidence_used=True,
        customer_document_used_ids=["doc-1"],
    )


def _contains(value, needle: str) -> bool:
    if isinstance(value, str):
        return needle in value
    if isinstance(value, dict):
        return any(
            _contains(key, needle) or _contains(item, needle)
            for key, item in value.items()
        )
    if isinstance(value, (list, tuple, set)):
        return any(_contains(item, needle) for item in value)
    return False


class CapturingSession:
    def __init__(self, *, existing_matter_ids=None) -> None:
        self.added = None
        self.existing_matter_ids = set(existing_matter_ids or ())

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def add(self, value) -> None:
        self.added = value

    def commit(self) -> None:
        return None

    def refresh(self, _value) -> None:
        return None

    def get(self, _model, matter_id):
        return SimpleNamespace(id=matter_id) if matter_id in self.existing_matter_ids else None


def test_summary_sanitizer_keeps_counts_and_drops_filenames():
    sanitized = sanitized_customer_document_summary(_summary())
    assert sanitized == {
        "total": 65,
        "usable": 62,
        "usableTruncated": 4,
        "noUsableContent": 2,
        "processing": 1,
        "failed": 1,
        "packaged": 8,
        "unusableFilenameCount": 3,
    }
    assert SENSITIVE_FILENAME not in str(sanitized)
    # A mapping with snake_case aliases and unknown keys keeps only safe counts.
    assert sanitized_customer_document_summary(
        {
            "total": 3,
            "no_usable_content": 1,
            "unusable_filenames": [SENSITIVE_FILENAME],
            "originalFilename": SENSITIVE_FILENAME,
        }
    ) == {"total": 3, "noUsableContent": 1, "unusableFilenameCount": 1}
    assert sanitized_customer_document_summary(None) is None
    assert sanitized_customer_document_summary({"unusableFilenames": []}) == {
        "unusableFilenameCount": 0
    }
    assert sanitized_customer_document_summary({"total": "65"}) is None


def test_trace_request_dump_records_counts_without_filenames(monkeypatch):
    import app.services.review_trace_service as review_module

    session = CapturingSession(existing_matter_ids={"matter-1"})
    monkeypatch.setattr(review_module, "SessionLocal", lambda: session)
    service = ReviewTraceService()
    service.settings = SimpleNamespace(enable_lawyer_review_trace=True)
    trace_id = service.safe_record_answer_trace(
        matter=SimpleNamespace(id="matter-1", session_id="session-1"),
        payload=_payload(),
        response=_response(),
        state=None,
    )

    assert trace_id is not None or session.added is not None
    trace_json = session.added.trace_json
    assert not _contains(trace_json, SENSITIVE_FILENAME)
    for filename in OTHER_FILENAMES:
        assert not _contains(trace_json, filename)
    summary = trace_json["customer_document_evidence_summary"]["customer_document_summary"]
    assert summary == {
        "total": 65,
        "usable": 62,
        "usableTruncated": 4,
        "noUsableContent": 2,
        "processing": 1,
        "failed": 1,
        "packaged": 8,
        "unusableFilenameCount": 3,
    }
    # The request dump keeps the typed summary with every filename removed.
    assert trace_json["request"]["customer_document_summary"]["unusableFilenames"] == []
    assert trace_json["request"]["customer_document_summary"]["total"] == 65
    assert (
        trace_json["customer_document_evidence_summary"]["customer_document_used_ids"]
        == ["doc-1"]
    )


def test_trace_payload_helper_drops_evidence_and_filenames():
    payload = _payload()
    safe = ReviewTraceService._trace_safe_payload(payload)
    assert safe.customer_document_evidence.documents == []
    assert safe.customer_document_summary.unusableFilenames == []
    assert safe.customer_document_summary.total == 65
    assert safe.customer_document_summary.packaged == 8
    assert not _contains(safe.model_dump(mode="json"), SENSITIVE_FILENAME)
    # The caller's own request object is never mutated.
    assert payload.customer_document_evidence.documents != []
    assert payload.customer_document_summary.unusableFilenames == [
        SENSITIVE_FILENAME,
        *OTHER_FILENAMES,
    ]


def test_trace_archive_capture_receives_a_filename_free_request(monkeypatch):
    import app.services.review_trace_service as review_module

    session = CapturingSession(existing_matter_ids={"matter-1"})
    monkeypatch.setattr(review_module, "SessionLocal", lambda: session)
    captured = []

    class ArchiveSpy:
        def safe_capture(self, **kwargs):
            captured.append(kwargs)

        def safe_capture_async(self, **kwargs):
            captured.append(kwargs)

    service = ReviewTraceService(experience_archive_service=ArchiveSpy())
    service.settings = SimpleNamespace(enable_lawyer_review_trace=True)
    service.safe_record_answer_trace(
        matter=SimpleNamespace(id="matter-1", session_id="session-1"),
        payload=_payload(),
        response=_response(),
        state=None,
    )

    assert len(captured) == 1
    archived_payload = captured[0]["payload"]
    assert archived_payload.customer_document_evidence.documents == []
    assert archived_payload.customer_document_summary.unusableFilenames == []
    assert archived_payload.customer_document_summary.total == 65
    assert not _contains(archived_payload.model_dump(mode="json"), SENSITIVE_FILENAME)
