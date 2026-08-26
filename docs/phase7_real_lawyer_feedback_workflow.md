# Phase 7 real lawyer-feedback workflow

This is an operational control-plane workflow. It is infrastructure-ready but
does not claim that a genuine lawyer-reviewed dataset exists yet.

1. A live interaction is archived as an immutable `ExperienceRecord`.
2. An authenticated lawyer opens the answer trace in the lawyer-review UI.
3. The lawyer records rating, severity, categories, comments, and any corrected answer.
4. The lawyer explicitly selects affected claims and writes a preferred process strategy.
5. The lawyer separately opts the reviewed interaction into the Evaluation Bank and/or a
   ReasoningLessonCandidate.
6. The backend accepts those artifacts only with the trusted server-side lawyer assertion and
   exact ExperienceRecord/trace linkage; otherwise it fails closed.
7. The EvaluationCase becomes future offline regression material, while the lesson candidate
   remains a process-learning candidate. Neither is runtime memory or legal evidence.
8. An offline bounded compiler receives a case-erased candidate packet and produces a proposal;
   review submission never calls an OpenAI provider.
9. An explicit trusted-lawyer governance action approves or rejects the real-bank proposal.
10. `PHASE7_REASONING_BANK_RUNTIME_MODE` defaults to `off` (no bank read). In `shadow`, the
    Default runtime retrieves eligible real rules for bounded telemetry but injects no guidance.
    In `active`, the same runtime may inject at most two bounded, case-erased process guidance
    bodies into the existing Default answer/research prompts (including the Luna runtime). The
    guidance is not evidence, authority, or a citation and does not enter Phase 6; retrieval
    failures are fail-neutral. Premium direct remains off for this runtime.

## ReasoningBank is not legal evidence

ReasoningBank rules are reusable process guidance, not legislation, case law,
policy, source text, citations, `EvidenceRef` values, or legal authority. They
must never enter retrieval evidence, citation assembly, or the Phase 6 checker.
Only the isolated Default Luna runtime may receive the bounded process body in
`active` mode; it is not customer-answer text. Retirement removes a rule from
runtime selection while preserving its auditable governance history.
