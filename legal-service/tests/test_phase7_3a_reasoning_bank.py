"""Offline Phase 7.3A tests; no configured SessionLocal or provider is allowed."""

from copy import deepcopy
import pytest
from sqlalchemy.exc import OperationalError

from app.db.models import AnswerReview, AnswerTrace, ExperienceRecord, ReviewArtifact
from app.schemas.learning import (
    EvaluationCase,
    ReasoningLessonCandidate,
    ReasoningRuleDecisionRequest,
    ReasoningRuleProposal,
    RuleCompilerOutput,
    RuleCompilerProposalDraft,
)
from app.services.phase7_3a_reasoning_bank import (
    CandidatePoolService,
    Phase73RuleCompilerService,
    ReasoningBankManager,
    ReasoningBankService,
    RuleFormationError,
    RuleQualityGateService,
    candidate_processing_state,
    decision_fingerprint,
    exact_rule_body_fingerprint,
    conflict_group_id,
    _seal,
)
from app.services.phase7_artifact_service import Phase7ArtifactService
from app.api.routes.review import _commit_or_rollback

from test_phase7_2_control_plane import _FakeSession, _trace


@pytest.fixture(autouse=True)
def forbid_configured_session_factory(monkeypatch):
    import app.db.session as db_module

    monkeypatch.setattr(
        db_module,
        "SessionLocal",
        lambda: (_ for _ in ()).throw(
            AssertionError("Phase 7.3A tests must inject a fake session")
        ),
    )


def _candidate(
    db,
    *,
    candidate_id="candidate-1",
    review_id="review-1",
    provenance="synthetic_test",
    origin="manual_fixture",
):
    if not db.get(AnswerTrace, "trace-1"):
        db.add(_trace())
    db.add(AnswerReview(id=review_id, answer_trace_id="trace-1", matter_id="matter-1"))
    candidate = ReasoningLessonCandidate(
        candidate_id=candidate_id,
        source_review_id=review_id,
        provenance=provenance,
        origin=origin,
        lesson_text="Check the decisive facts before selecting the next research step.",
        issue_categories=["process"],
        scope_applicability={"topic": "general"},
    )
    row = ReviewArtifact(
        id=f"artifact-{candidate_id}",
        answer_review_id=review_id,
        artifact_type="phase7_reasoning_lesson_candidate",
        artifact_payload=_seal(candidate, 1, None).model_dump(mode="json"),
        artifact_status="active",
    )
    db.add(row)


def _proposal(
    *,
    candidate_id="candidate-1",
    review_id="review-1",
    namespace="simulation",
    provenance="synthetic_test",
    origin="manual_fixture",
    proposal_id="proposal-1",
    **changes,
):
    data = dict(
        proposal_id=proposal_id,
        bank_namespace=namespace,
        source_candidate_ids=[candidate_id],
        source_review_ids=[review_id],
        proposal_origin="synthetic_simulation" if namespace == "simulation" else "manual",
        provenance=provenance,
        origin=origin,
        rule_type="research_strategy",
        title="Sequence research around decisive facts",
        trigger_conditions=["The issue has unresolved decisive facts."],
        applicability_conditions=["The question is within the agent's research scope."],
        action_steps=["Identify the decisive facts before selecting research steps."],
        verification_steps=["Confirm each decisive fact has a documented resolution."],
        prohibited_behaviors=["Do not treat memory as legal authority."],
        exceptions_or_limits=["Do not apply when the user only requests navigation."],
        case_erasure_confirmation=True,
        procedural_only_confirmation=True,
    )
    data.update(changes)
    return ReasoningRuleProposal(**data)


def test_candidate_hash_and_current_version_are_validated():
    db = _FakeSession()
    _candidate(db)
    assert [item.candidate_id for item in CandidatePoolService().list_candidates(db)] == [
        "candidate-1"
    ]
    row = db.rows_for(ReviewArtifact)[0]
    row.artifact_payload["lesson_text"] = "tampered"
    with pytest.raises(RuleFormationError, match="invalid canonical hash"):
        CandidatePoolService().list_candidates(db)


def test_packet_is_allowlisted_and_prompt_makes_no_provider_call():
    db = _FakeSession()
    _candidate(db)
    packet = Phase73RuleCompilerService().build_packet(
        db, candidate_ids=["candidate-1"], bank_namespace="simulation"
    )
    dumped = packet.model_dump(mode="json")
    assert "question" not in str(dumped)
    assert "evidence" not in str(dumped).lower()
    assert "memory as legal authority" in Phase73RuleCompilerService().build_prompt(packet)


def test_quality_gate_rejects_residue_and_missing_confirmations():
    proposal = _proposal(
        title="Use https://example.test for request-123 on 2026-08-26",
        case_erasure_confirmation=False,
        procedural_only_confirmation=False,
    )
    report = RuleQualityGateService().evaluate(proposal)
    assert report.result == "FAIL"
    assert {
        "contains_url",
        "contains_identifier",
        "case_erasure_not_confirmed",
        "procedural_only_not_confirmed",
    } <= set(report.reason_codes)


def test_simulation_approve_is_explicit_and_never_real():
    db = _FakeSession()
    _candidate(db)
    manager = ReasoningBankManager()
    proposal = _proposal()
    manager.persist_proposal(db, proposal)
    rule = manager.approve_new(
        db,
        proposal,
        decided_by="offline-test",
        case_erasure_confirmed=True,
        procedural_only_confirmed=True,
    )
    assert rule.bank_namespace == "simulation"
    assert rule.lifecycle == "approved"
    assert rule.validation_state == "unvalidated"
    assert rule.approval_mode == "simulation_offline"
    with pytest.raises(RuleFormationError, match="namespace"):
        manager.persist_proposal(
            db,
            _proposal(namespace="real", provenance="lawyer_reviewed", origin="live_interaction"),
            trusted_lawyer_review=True,
        )


def test_proposal_persistence_is_retry_safe_and_keeps_prior_payload_immutable():
    db = _FakeSession()
    _candidate(db)
    manager = ReasoningBankManager()
    proposal = _proposal()
    first = manager.persist_proposal(db, proposal)
    retry = manager.persist_proposal(db, proposal)
    assert retry is first
    changed = _proposal(title="A different process strategy")
    successor = manager.persist_proposal(db, changed)
    assert successor.id != first.id
    assert first.artifact_status == "superseded"
    assert first.artifact_payload["title"] == "Sequence research around decisive facts"


def test_real_approval_requires_trusted_assertion_and_body_identity_cannot_authorize():
    db = _FakeSession()
    _candidate(db, provenance="lawyer_reviewed", origin="live_interaction")
    manager = ReasoningBankManager()
    proposal = _proposal(namespace="real", provenance="lawyer_reviewed", origin="live_interaction")
    with pytest.raises(RuleFormationError, match="trusted lawyer"):
        manager.persist_proposal(db, proposal)
    manager.persist_proposal(db, proposal, trusted_lawyer_review=True)
    with pytest.raises(RuleFormationError, match="trusted lawyer"):
        manager.approve_new(db, proposal, decided_by="name-only")
    rule = manager.approve_new(
        db,
        proposal,
        decided_by="lawyer",
        trusted_lawyer_review=True,
        case_erasure_confirmed=True,
        procedural_only_confirmed=True,
    )
    assert rule.provenance == "lawyer_reviewed"


def test_merge_revision_conflict_and_retirement_are_successor_versions():
    db = _FakeSession()
    _candidate(db)
    manager = ReasoningBankManager()
    proposal = _proposal()
    manager.persist_proposal(db, proposal)
    first = manager.approve_new(
        db,
        proposal,
        decided_by="offline",
        case_erasure_confirmed=True,
        procedural_only_confirmed=True,
    )
    support = _proposal(proposal_id="proposal-2", candidate_id="candidate-1")
    manager.persist_proposal(db, support)
    merged = manager.merge_support(
        db,
        support,
        target_rule_key=first.rule_key,
        decided_by="offline",
        case_erasure_confirmed=True,
        procedural_only_confirmed=True,
    )
    assert merged.rule_key == first.rule_key
    assert merged.rule_version == 2
    assert db.rows_for(ReviewArtifact)[-2].artifact_status == "superseded" or any(
        row.artifact_payload.get("rule_key") == first.rule_key
        and row.artifact_status == "superseded"
        for row in db.rows_for(ReviewArtifact)
    )
    revised_proposal = _proposal(
        proposal_id="proposal-3", candidate_id="candidate-1", title="A revised process strategy"
    )
    manager.persist_proposal(db, revised_proposal)
    revised = manager.revise_existing(
        db,
        revised_proposal,
        target_rule_key=first.rule_key,
        decided_by="offline",
        case_erasure_confirmed=True,
        procedural_only_confirmed=True,
    )
    assert revised.rule_key == first.rule_key
    assert revised.rule_version == 3
    retired = manager.retire(db, rule_key=first.rule_key, reason_code="stale", decided_by="offline")
    assert retired.lifecycle == "retired"
    assert ReasoningBankService().state(db, bank_namespace="simulation").current_rule_count == 0


def test_capacity_blocks_only_new_rules_and_reject_creates_no_rule():
    db = _FakeSession()
    _candidate(db)
    manager = ReasoningBankManager(max_rules=0, max_rules_per_type=1)
    proposal = _proposal()
    manager.persist_proposal(db, proposal)
    with pytest.raises(RuleFormationError, match="capacity_review_required"):
        manager.approve_new(
            db,
            proposal,
            decided_by="offline",
            case_erasure_confirmed=True,
            procedural_only_confirmed=True,
        )
    decision = manager.reject(
        db, proposal, decided_by="offline", reason_code="no_reusable_strategy"
    )
    assert decision.action == "reject"
    assert not any(
        row.artifact_type == "phase7_reasoning_lesson" for row in db.rows_for(ReviewArtifact)
    )


def test_phase73a_cannot_create_shadow_or_active_rules():
    with pytest.raises(ValueError, match="shadow or active"):
        _proposal()  # proposal is valid; the final contract below enforces the lifecycle boundary
        from app.schemas.learning import ReasoningLesson

        ReasoningLesson(
            lesson_id="r:v1",
            rule_key="r",
            bank_namespace="simulation",
            provenance="synthetic_test",
            origin="manual_fixture",
            lifecycle="shadow",
            rule_type="research_strategy",
            title="t",
            trigger_conditions=["t"],
            applicability_conditions=["a"],
            action_steps=["d"],
            verification_steps=["v"],
            prohibited_behaviors=["p"],
            exceptions_or_limits=["l"],
            lesson_text="x",
            source_proposal_id="p",
            source_candidate_ids=["c"],
            approval_mode="simulation_offline",
        )


def _replace_candidate(db, **updates):
    row = next(
        row
        for row in db.rows_for(ReviewArtifact)
        if row.artifact_type == "phase7_reasoning_lesson_candidate"
    )
    candidate = ReasoningLessonCandidate.model_validate(row.artifact_payload)
    row.artifact_payload = _seal(
        candidate.model_copy(update=updates),
        candidate.artifact_version,
        candidate.supersedes_artifact_id,
    ).model_dump(mode="json")
    return row


def _candidate_version(db, *, version, artifact_status="active", supersedes=None):
    current = next(
        row
        for row in db.rows_for(ReviewArtifact)
        if row.artifact_type == "phase7_reasoning_lesson_candidate"
        and (row.artifact_payload or {}).get("candidate_id") == "candidate-1"
    )
    candidate = ReasoningLessonCandidate.model_validate(current.artifact_payload)
    link = current.id if supersedes is None else supersedes
    successor = _seal(
        candidate.model_copy(update={"artifact_version": version, "supersedes_artifact_id": link}),
        version,
        link,
    )
    current.artifact_status = "superseded"
    db.add(
        ReviewArtifact(
            id=f"artifact-candidate-{version}",
            answer_review_id=current.answer_review_id,
            artifact_type="phase7_reasoning_lesson_candidate",
            artifact_payload=successor.model_dump(mode="json"),
            artifact_status=artifact_status,
        )
    )


class _Savepoint:
    def __init__(self, session):
        self.session = session
        self.snapshot = {model: list(rows) for model, rows in session.rows.items()}
        self.statuses = {
            id(row): getattr(row, "artifact_status", None)
            for rows in session.rows.values()
            for row in rows
        }

    def __enter__(self):
        return self

    def __exit__(self, exc_type, _exc, _tb):
        if exc_type:
            self.session.rows = {model: list(rows) for model, rows in self.snapshot.items()}
            for rows in self.session.rows.values():
                for row in rows:
                    if id(row) in self.statuses:
                        row.artifact_status = self.statuses[id(row)]
        return False


class _SavepointFakeSession(_FakeSession):
    def begin_nested(self):
        return _Savepoint(self)


def _experience(experience_id="experience-1", *, origin="synthetic_test", valid=True):
    snapshot = {
        "request": {"original_question": "offline"},
        "matter": {"topic": "test"},
        "answer": {"claims": []},
    }
    return ExperienceRecord(
        id=experience_id,
        origin=origin,
        experience_schema_version="phase7.experience.v1",
        snapshot_json=snapshot,
        snapshot_sha256=Phase7ArtifactService.snapshot_sha256(snapshot) if valid else "0" * 64,
    )


def _evaluation(
    case_id="case-1", *, provenance="synthetic_test", origin="manual_fixture", valid=True
):
    case = EvaluationCase(
        case_id=case_id,
        provenance=provenance,
        origin=origin,
        question="A bounded offline test question",
    )
    if not valid:
        payload = case.model_dump(mode="json")
        payload["canonical_payload_sha256"] = "0" * 64
        return ReviewArtifact(
            id=f"artifact-{case_id}",
            answer_review_id="review-1",
            artifact_type="phase7_evaluation_case",
            artifact_payload=payload,
            artifact_status="active",
        )
    return ReviewArtifact(
        id=f"artifact-{case_id}",
        answer_review_id="review-1",
        artifact_type="phase7_evaluation_case",
        artifact_payload=_seal(case, 1, None).model_dump(mode="json"),
        artifact_status="active",
    )


def test_lineage_resolution_rejects_missing_anchor_trace_and_experience():
    db = _FakeSession()
    _candidate(db)
    manager = ReasoningBankManager()
    with pytest.raises(RuleFormationError, match="missing"):
        manager.persist_proposal(db, _proposal(source_candidate_ids=["missing"]))

    db = _FakeSession()
    _candidate(db)
    db.add(AnswerReview(id="review-2", answer_trace_id="trace-1", matter_id="matter-1"))
    row = next(
        row
        for row in db.rows_for(ReviewArtifact)
        if row.artifact_type == "phase7_reasoning_lesson_candidate"
    )
    row.answer_review_id = "review-2"
    with pytest.raises(RuleFormationError, match="anchor"):
        CandidatePoolService().list_candidates(db)

    db = _FakeSession()
    _candidate(db)
    _replace_candidate(db, source_answer_trace_id="trace-other")
    with pytest.raises(RuleFormationError, match="trace"):
        CandidatePoolService().list_candidates(db)

    db = _FakeSession()
    _candidate(db)
    db.add(_experience())
    _replace_candidate(
        db, source_experience_record_id="experience-1", source_experience_snapshot_sha256="0" * 64
    )
    with pytest.raises(RuleFormationError, match="SHA"):
        CandidatePoolService().list_candidates(db)


def test_lineage_resolution_rejects_fabricated_support_and_wrong_case_namespace():
    db = _FakeSession()
    _candidate(db)
    manager = ReasoningBankManager()
    with pytest.raises(RuleFormationError, match="ExperienceRecord"):
        manager.persist_proposal(db, _proposal(source_experience_ids=["not-real"]))

    db = _FakeSession()
    _candidate(db, provenance="lawyer_reviewed", origin="live_interaction")
    db.add(_evaluation())
    with pytest.raises(RuleFormationError, match="synthetic"):
        manager.persist_proposal(
            db,
            _proposal(
                namespace="real",
                provenance="lawyer_reviewed",
                origin="live_interaction",
                supporting_evaluation_case_ids=["case-1"],
            ),
            trusted_lawyer_review=True,
        )

    db = _FakeSession()
    _candidate(db)
    db.add(_evaluation("case-real", provenance="lawyer_reviewed", origin="live_interaction"))
    with pytest.raises(RuleFormationError, match="simulation"):
        manager.persist_proposal(db, _proposal(supporting_evaluation_case_ids=["case-real"]))


def test_history_and_duplicate_resolution_fail_closed():
    db = _FakeSession()
    _candidate(db)
    row = next(
        row
        for row in db.rows_for(ReviewArtifact)
        if row.artifact_type == "phase7_reasoning_lesson_candidate"
    )
    duplicate = deepcopy(row)
    duplicate.id = "candidate-duplicate"
    db.add(duplicate)
    with pytest.raises(RuleFormationError, match="duplicate"):
        CandidatePoolService().list_candidates(db)

    db = _FakeSession()
    _candidate(db)
    manager = ReasoningBankManager()
    proposal = _proposal()
    manager.persist_proposal(db, proposal)
    rule = manager.approve_new(
        db,
        proposal,
        decided_by="offline",
        case_erasure_confirmed=True,
        procedural_only_confirmed=True,
    )
    old = next(
        row for row in db.rows_for(ReviewArtifact) if row.artifact_type == "phase7_reasoning_lesson"
    )
    old.artifact_payload["title"] = "tampered history"
    with pytest.raises(RuleFormationError, match="canonical hash"):
        ReasoningBankService().get_rule(db, rule.rule_key)


def test_namespace_lock_is_deterministic_and_precedes_bank_queries():
    db = _FakeSession()
    calls = []
    db.execute = lambda statement, params: calls.append((str(statement), params))
    _candidate(db)
    manager = ReasoningBankManager()
    manager.persist_proposal(db, _proposal())
    assert calls
    assert calls[0][1]["lock_key"] == manager.advisory_lock_key("simulation")
    assert manager.advisory_lock_key("simulation") == manager.advisory_lock_key("simulation")
    assert manager.advisory_lock_key("real") != manager.advisory_lock_key("simulation")
    lock_index = next(i for i, item in enumerate(db.lock_requests) if item[0] == "query")
    assert calls[0][1]["lock_key"] == manager.advisory_lock_key("simulation")
    assert lock_index >= 0


def test_governance_retries_are_single_assignment_and_fingerprint_is_content_bound():
    db = _FakeSession()
    _candidate(db)
    manager = ReasoningBankManager()
    proposal = _proposal()
    manager.persist_proposal(db, proposal)
    first = manager.approve_new(
        db,
        proposal,
        decided_by="offline",
        case_erasure_confirmed=True,
        procedural_only_confirmed=True,
    )
    second = manager.approve_new(
        db,
        proposal,
        decided_by="different",
        case_erasure_confirmed=True,
        procedural_only_confirmed=True,
    )
    assert second.lesson_id == first.lesson_id
    assert (
        len(
            [
                row
                for row in db.rows_for(ReviewArtifact)
                if row.artifact_type == "phase7_reasoning_lesson"
            ]
        )
        == 1
    )
    with pytest.raises(RuleFormationError, match="conflicting_terminal_decision"):
        manager.reject(db, proposal, decided_by="offline", reason_code="different")
    assert decision_fingerprint(
        proposal_id="p",
        action="reject",
        namespace="simulation",
        target_rule_key=None,
        target_rule_version=None,
        second_target_rule_key=None,
        reason_code="a",
        case_erasure_confirmed=False,
        procedural_only_confirmed=False,
    ) != decision_fingerprint(
        proposal_id="p",
        action="reject",
        namespace="simulation",
        target_rule_key=None,
        target_rule_version=None,
        second_target_rule_key=None,
        reason_code="b",
        case_erasure_confirmed=False,
        procedural_only_confirmed=False,
    )


def test_revision_preserves_lineage_and_retired_rules_are_terminal():
    db = _FakeSession()
    _candidate(db)
    manager = ReasoningBankManager()
    first_proposal = _proposal()
    manager.persist_proposal(db, first_proposal)
    first = manager.approve_new(
        db,
        first_proposal,
        decided_by="offline",
        case_erasure_confirmed=True,
        procedural_only_confirmed=True,
    )
    revised_proposal = _proposal(
        proposal_id="proposal-revision", title="A revised process strategy"
    )
    manager.persist_proposal(db, revised_proposal)
    revised = manager.revise_existing(
        db,
        revised_proposal,
        target_rule_key=first.rule_key,
        decided_by="offline",
        case_erasure_confirmed=True,
        procedural_only_confirmed=True,
    )
    assert revised.source_candidate_ids == ["candidate-1"]
    assert revised.supporting_review_ids == ["review-1"]
    retired = manager.retire(db, rule_key=first.rule_key, reason_code="stale", decided_by="offline")
    retired_attempt = _proposal(
        proposal_id="proposal-after-retirement", title="Another revised process strategy"
    )
    manager.persist_proposal(db, retired_attempt)
    with pytest.raises(RuleFormationError, match="retired"):
        manager.revise_existing(
            db,
            retired_attempt,
            target_rule_key=first.rule_key,
            decided_by="offline",
            case_erasure_confirmed=True,
            procedural_only_confirmed=True,
        )
    assert retired.lifecycle == "retired"


def test_compiler_output_is_strict_and_server_derives_authority():
    draft = dict(
        rule_type="research_strategy",
        title="A bounded strategy",
        trigger_conditions=["A trigger"],
        applicability_conditions=["A scope"],
        action_steps=["Take a step"],
        verification_steps=["Verify the step"],
        prohibited_behaviors=["Avoid guessing"],
        exceptions_or_limits=["Not for navigation"],
    )
    with pytest.raises(ValueError):
        RuleCompilerProposalDraft(**draft, provenance="lawyer_reviewed")
    with pytest.raises(ValueError):
        RuleCompilerOutput(
            output_id="o", packet_id="p", proposals=[RuleCompilerProposalDraft(**draft)] * 4
        )
    assert RuleCompilerOutput(output_id="o", packet_id="p", proposals=[]).proposals == []
    assert exact_rule_body_fingerprint(
        _proposal(title="  Sequence   research around decisive facts  ")
    ) == exact_rule_body_fingerprint(_proposal())
    assert conflict_group_id("simulation", "rule-a", "rule-b") == conflict_group_id(
        "simulation", "rule-b", "rule-a"
    )


def test_candidate_processing_state_is_derived_from_proposals_and_decisions():
    db = _FakeSession()
    _candidate(db)
    assert candidate_processing_state(db, "candidate-1") == "unprocessed"
    manager = ReasoningBankManager()
    proposal = _proposal()
    manager.persist_proposal(db, proposal)
    assert candidate_processing_state(db, "candidate-1") == "pending"
    manager.reject(db, proposal, decided_by="offline")
    assert candidate_processing_state(db, "candidate-1") == "processed"


def test_configured_capacity_is_used_by_manager():
    class Config:
        phase7_reasoning_bank_max_rules = 0
        phase7_reasoning_bank_max_rules_per_type = 1

    db = _FakeSession()
    _candidate(db)
    manager = ReasoningBankManager(settings=Config())
    proposal = _proposal()
    manager.persist_proposal(db, proposal)
    with pytest.raises(RuleFormationError, match="capacity_review_required"):
        manager.approve_new(
            db,
            proposal,
            decided_by="offline",
            case_erasure_confirmed=True,
            procedural_only_confirmed=True,
        )


def test_candidate_history_requires_one_coherent_current_chain():
    db = _FakeSession()
    _candidate(db)
    base = next(
        row
        for row in db.rows_for(ReviewArtifact)
        if row.artifact_type == "phase7_reasoning_lesson_candidate"
    )
    candidate = ReasoningLessonCandidate.model_validate(base.artifact_payload)
    second = _seal(
        candidate.model_copy(update={"artifact_version": 2, "supersedes_artifact_id": base.id}),
        2,
        base.id,
    )
    db.add(
        ReviewArtifact(
            id="candidate-v2-current",
            answer_review_id="review-1",
            artifact_type="phase7_reasoning_lesson_candidate",
            artifact_payload=second.model_dump(mode="json"),
            artifact_status="active",
        )
    )
    with pytest.raises(RuleFormationError, match="ambiguous current"):
        CandidatePoolService().list_candidates(db)

    db = _FakeSession()
    _candidate(db)
    base = next(
        row
        for row in db.rows_for(ReviewArtifact)
        if row.artifact_type == "phase7_reasoning_lesson_candidate"
    )
    candidate = ReasoningLessonCandidate.model_validate(base.artifact_payload)
    base.artifact_status = "superseded"
    third = _seal(
        candidate.model_copy(
            update={"artifact_version": 3, "supersedes_artifact_id": "missing-v2"}
        ),
        3,
        "missing-v2",
    )
    db.add(
        ReviewArtifact(
            id="candidate-v3-current",
            answer_review_id="review-1",
            artifact_type="phase7_reasoning_lesson_candidate",
            artifact_payload=third.model_dump(mode="json"),
            artifact_status="active",
        )
    )
    with pytest.raises(RuleFormationError, match="version chain"):
        CandidatePoolService().list_candidates(db)

    db = _FakeSession()
    _candidate(db)
    _candidate_version(db, version=2)
    duplicate = next(row for row in db.rows_for(ReviewArtifact) if row.id == "artifact-candidate-2")
    db.add(deepcopy(duplicate))
    with pytest.raises(RuleFormationError, match="duplicate version"):
        CandidatePoolService().list_candidates(db)

    db = _FakeSession()
    _candidate(db)
    base = next(
        row
        for row in db.rows_for(ReviewArtifact)
        if row.artifact_type == "phase7_reasoning_lesson_candidate"
    )
    base.artifact_status = "superseded"
    candidate = ReasoningLessonCandidate.model_validate(base.artifact_payload)
    old_payload = candidate.model_dump(mode="json")
    old_payload["canonical_payload_sha256"] = "0" * 64
    db.add(
        ReviewArtifact(
            id="candidate-v1-corrupt",
            answer_review_id="review-1",
            artifact_type="phase7_reasoning_lesson_candidate",
            artifact_payload=old_payload,
            artifact_status="superseded",
        )
    )
    with pytest.raises(RuleFormationError, match="canonical hash"):
        CandidatePoolService().list_candidates(db)

    db = _FakeSession()
    _candidate(db)
    _candidate_version(db, version=2)
    current = CandidatePoolService().list_candidates(db)
    assert current[0].candidate_id == "candidate-1"


def test_experience_support_is_derived_and_trace_bound():
    db = _FakeSession()
    _candidate(db)
    db.add(_experience("unrelated", origin="synthetic_test"))
    with pytest.raises(RuleFormationError, match="ExperienceRecord support"):
        ReasoningBankManager().persist_proposal(db, _proposal(source_experience_ids=["unrelated"]))

    db = _FakeSession()
    _candidate(db)
    linked = _experience("experience-1", origin="synthetic_test")
    linked.answer_trace_id = "trace-other"
    db.add(linked)
    _replace_candidate(
        db,
        source_experience_record_id="experience-1",
        source_experience_snapshot_sha256=linked.snapshot_sha256,
    )
    with pytest.raises(RuleFormationError, match="answer-trace"):
        CandidatePoolService().list_candidates(db)

    db = _FakeSession()
    _candidate(db)
    linked = _experience("experience-1", origin="synthetic_test")
    linked.answer_trace_id = "trace-1"
    db.add(linked)
    _replace_candidate(
        db,
        source_experience_record_id="experience-1",
        source_experience_snapshot_sha256=linked.snapshot_sha256,
    )
    proposal = _proposal(source_experience_ids=["experience-1"])
    assert (
        ReasoningBankManager().persist_proposal(db, proposal).artifact_type
        == "phase7_reasoning_rule_proposal"
    )


@pytest.mark.parametrize(
    "case, status, expected",
    [
        (
            _evaluation("draft-real", provenance="lawyer_reviewed", origin="live_interaction"),
            "draft",
            "active",
        ),
        (
            _evaluation("system-real", provenance="system_generated", origin="live_interaction"),
            "active",
            "eligible",
        ),
        (_evaluation("synthetic-real"), "active", "eligible"),
        (
            _evaluation(
                "bad-hash", provenance="lawyer_reviewed", origin="live_interaction", valid=False
            ),
            "active",
            "canonical",
        ),
        (
            _evaluation("superseded-real", provenance="lawyer_reviewed", origin="live_interaction"),
            "superseded",
            "missing",
        ),
    ],
)
def test_real_evaluation_support_requires_default_bank_eligibility(case, status, expected):
    db = _FakeSession()
    _candidate(db, provenance="lawyer_reviewed", origin="live_interaction")
    case.artifact_status = status
    db.add(case)
    proposal = _proposal(
        namespace="real",
        provenance="lawyer_reviewed",
        origin="live_interaction",
        supporting_evaluation_case_ids=[case.artifact_payload["case_id"]],
    )
    with pytest.raises(RuleFormationError, match=expected):
        ReasoningBankManager().persist_proposal(db, proposal, trusted_lawyer_review=True)


def test_simulation_evaluation_support_remains_synthetic_only():
    db = _FakeSession()
    _candidate(db)
    case = _evaluation("real-case", provenance="lawyer_reviewed", origin="live_interaction")
    db.add(case)
    with pytest.raises(RuleFormationError, match="simulation"):
        ReasoningBankManager().persist_proposal(
            db, _proposal(supporting_evaluation_case_ids=["real-case"])
        )


def test_decision_reason_code_participates_in_terminal_identity():
    db = _FakeSession()
    _candidate(db)
    manager = ReasoningBankManager()
    proposal = _proposal()
    manager.persist_proposal(db, proposal)
    first = manager.approve_new(
        db,
        proposal,
        decided_by="offline",
        decision_reason_code="approved_after_review",
        case_erasure_confirmed=True,
        procedural_only_confirmed=True,
    )
    retry = manager.approve_new(
        db,
        proposal,
        decided_by="different",
        decision_reason_code="approved_after_review",
        case_erasure_confirmed=True,
        procedural_only_confirmed=True,
    )
    assert retry.lesson_id == first.lesson_id
    with pytest.raises(RuleFormationError, match="conflicting_terminal_decision"):
        manager.approve_new(
            db,
            proposal,
            decided_by="offline",
            decision_reason_code="different_reason",
            case_erasure_confirmed=True,
            procedural_only_confirmed=True,
        )


def _compiler_draft(**changes):
    data = dict(
        rule_type="research_strategy",
        title="Sequence research around decisive facts",
        trigger_conditions=["The issue has unresolved decisive facts."],
        applicability_conditions=["The question is within scope."],
        action_steps=["Identify facts.", "Select research."],
        verification_steps=["Verify the resolution."],
        prohibited_behaviors=["Do not guess."],
        exceptions_or_limits=["Not for navigation."],
        case_erasure_confirmation=True,
        procedural_only_confirmation=True,
    )
    data.update(changes)
    return RuleCompilerProposalDraft(**data)


def test_compiler_proposal_identity_normalizes_text_but_preserves_order():
    db = _FakeSession()
    _candidate(db)
    compiler = Phase73RuleCompilerService()
    packet = compiler.build_packet(db, candidate_ids=["candidate-1"], bank_namespace="simulation")
    first = RuleCompilerOutput(
        output_id="output-1", packet_id=packet.packet_id, proposals=[_compiler_draft()]
    )
    second = RuleCompilerOutput(
        output_id="output-2",
        packet_id=packet.packet_id,
        proposals=[
            _compiler_draft(
                title="  SEQUENCE   RESEARCH AROUND DECISIVE FACTS  ",
                action_steps=["Identify facts.", "Select research."],
            )
        ],
    )
    first_artifact = compiler.create_proposals_from_output(
        db, source_candidate_ids=["candidate-1"], compiler_output=first, namespace="simulation"
    )[0]
    second_artifact = compiler.create_proposals_from_output(
        db, source_candidate_ids=["candidate-1"], compiler_output=second, namespace="simulation"
    )[0]
    assert second_artifact is first_artifact

    reordered = RuleCompilerOutput(
        output_id="output-3",
        packet_id=packet.packet_id,
        proposals=[_compiler_draft(action_steps=["Select research.", "Identify facts."])],
    )
    different = compiler.create_proposals_from_output(
        db, source_candidate_ids=["candidate-1"], compiler_output=reordered, namespace="simulation"
    )[0]
    assert different.id != first_artifact.id


def test_bank_digest_ignores_storage_timestamp_and_uuid_details():
    def build(row_id, timestamp):
        db = _FakeSession()
        _candidate(db)
        manager = ReasoningBankManager()
        proposal = _proposal()
        manager.persist_proposal(db, proposal)
        rule = manager.approve_new(
            db,
            proposal,
            decided_by="offline",
            case_erasure_confirmed=True,
            procedural_only_confirmed=True,
        )
        row = next(
            row
            for row in db.rows_for(ReviewArtifact)
            if row.artifact_type == "phase7_reasoning_lesson"
        )
        row.id = row_id
        row.artifact_payload = _seal(
            rule.model_copy(update={"artifact_created_at": timestamp}), 1, None
        ).model_dump(mode="json")
        return ReasoningBankService().state(db, bank_namespace="simulation").bank_digest

    assert build("rule-row-a", "2020-01-01T00:00:00+00:00") == build(
        "rule-row-b", "2030-01-01T00:00:00+00:00"
    )


def test_retirement_retry_with_different_reason_is_explicitly_rejected():
    db = _FakeSession()
    _candidate(db)
    manager = ReasoningBankManager()
    proposal = _proposal()
    manager.persist_proposal(db, proposal)
    rule = manager.approve_new(
        db,
        proposal,
        decided_by="offline",
        case_erasure_confirmed=True,
        procedural_only_confirmed=True,
    )
    retired = manager.retire(db, rule_key=rule.rule_key, reason_code="stale", decided_by="offline")
    retry = manager.retire(db, rule_key=rule.rule_key, reason_code="stale", decided_by="offline")
    assert retry.rule_key == retired.rule_key
    assert retry.rule_version == retired.rule_version
    with pytest.raises(RuleFormationError, match="already_retired"):
        manager.retire(db, rule_key=rule.rule_key, reason_code="wrong", decided_by="offline")


def test_conflict_pair_identity_and_retry_are_stable():
    db = _FakeSession()
    _candidate(db)
    manager = ReasoningBankManager()
    first_proposal = _proposal(proposal_id="proposal-a")
    manager.persist_proposal(db, first_proposal)
    first = manager.approve_new(
        db,
        first_proposal,
        decided_by="offline",
        case_erasure_confirmed=True,
        procedural_only_confirmed=True,
    )
    second_proposal = _proposal(proposal_id="proposal-b", title="A distinct process strategy")
    manager.persist_proposal(db, second_proposal)
    left, right = manager.mark_conflict(
        db,
        second_proposal,
        target_rule_key=first.rule_key,
        decided_by="offline",
        case_erasure_confirmed=True,
        procedural_only_confirmed=True,
    )
    retry_left, retry_right = manager.mark_conflict(
        db,
        second_proposal,
        target_rule_key=first.rule_key,
        decided_by="offline",
        case_erasure_confirmed=True,
        procedural_only_confirmed=True,
    )
    assert retry_left.rule_version == left.rule_version
    assert retry_right.rule_version == right.rule_version
    assert conflict_group_id("simulation", left.rule_key, right.rule_key) == conflict_group_id(
        "simulation", right.rule_key, left.rule_key
    )


def test_conflict_savepoint_rolls_back_both_successors_and_decision(monkeypatch):
    db = _SavepointFakeSession()
    _candidate(db)
    manager = ReasoningBankManager()
    first_proposal = _proposal()
    manager.persist_proposal(db, first_proposal)
    first = manager.approve_new(
        db,
        first_proposal,
        decided_by="offline",
        case_erasure_confirmed=True,
        procedural_only_confirmed=True,
    )
    second_proposal = _proposal(proposal_id="proposal-conflict")
    manager.persist_proposal(db, second_proposal)
    original = manager._persist_rule
    calls = 0

    def fail_on_second(db_arg, rule, review_ids):
        nonlocal calls
        calls += 1
        if calls == 2:
            raise OperationalError("injected", {}, RuntimeError("flush"))
        return original(db_arg, rule, review_ids)

    monkeypatch.setattr(manager, "_persist_rule", fail_on_second)
    decisions_before = len(
        [
            row
            for row in db.rows_for(ReviewArtifact)
            if row.artifact_type == "phase7_reasoning_rule_decision"
        ]
    )
    with pytest.raises(OperationalError):
        manager.mark_conflict(
            db,
            second_proposal,
            target_rule_key=first.rule_key,
            decided_by="offline",
            case_erasure_confirmed=True,
            procedural_only_confirmed=True,
        )
    assert (
        len(
            [
                row
                for row in db.rows_for(ReviewArtifact)
                if row.artifact_type == "phase7_reasoning_rule_decision"
            ]
        )
        == decisions_before
    )
    assert (
        len(
            [
                row
                for row in db.rows_for(ReviewArtifact)
                if row.artifact_type == "phase7_reasoning_lesson"
            ]
        )
        == 1
    )


def test_api_commit_database_failure_rolls_back():
    class CommitFails:
        rolled_back = False

        def commit(self):
            raise OperationalError("commit", {}, RuntimeError("database"))

        def rollback(self):
            self.rolled_back = True

    db = CommitFails()
    with pytest.raises(OperationalError):
        _commit_or_rollback(db)
    assert db.rolled_back is True


def test_decision_request_has_no_free_form_governance_note():
    with pytest.raises(ValueError):
        ReasoningRuleDecisionRequest(
            proposal_id="p",
            action="reject",
            decided_by="lawyer",
            concise_note="customer narrative",
        )


def test_configured_capacity_is_reported_by_bank_state():
    class Config:
        phase7_reasoning_bank_max_rules = 2
        phase7_reasoning_bank_max_rules_per_type = 1

    state = ReasoningBankService(settings=Config()).state(
        _FakeSession(), bank_namespace="simulation"
    )
    assert state.max_rules == 2
    assert state.max_rules_per_type == 1
