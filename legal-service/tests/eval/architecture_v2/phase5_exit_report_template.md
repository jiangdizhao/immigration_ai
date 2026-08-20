# Phase 5 Exit Report

Status: `DRAFT`

Decision options: `PASS TO PHASE 6` or `HOLD FOR ARCHITECTURE CORRECTION`

## Baseline

- Branch:
- HEAD SHA:
- Worktree dirty:
- Frozen specifications:
- Architecture proposal copy:
- Model:
- Reasoning effort:
- Prompt/tool/evidence-policy versions:
- Manifest path and version:
- Total manifest cases:
- Automated single-turn cases:
- Stateful/manual cases:
- Stage-1 case IDs:
- Stage-3 automated case count:
- Manifest defines complete pilot scope:
- Execution completion status:
- Execution covers complete automated pilot:
- Automated coverage status:
- Arm-A analyzed case count:
- Arm-B analyzed case count:
- Missing Arm-A case IDs:
- Missing Arm-B case IDs:
- Paired automated case count:
- Canonical corpus coverage report/version:
- Python executable/version:

## Pilot

- Manifest case count:
- Stage 1 case count:
- Stage 1 Arm A runs:
- Stage 2 Arm B runs:
- Stage 3 remaining paired runs:
- Total result rows:
- Repetition plan:
- State/session isolation:

## Correctness

| Metric | Arm A | Arm B | Notes |
| --- | ---: | ---: | --- |
| Completion rate | | | |
| Accepted terminal run rate | | | |
| Submission attempt acceptance rate | | | |
| Controlled incomplete submissions | | | |
| Failed without accepted submission | | | |
| Timeout/error rate | | | |
| Postcondition pass rate | | | |
| Postcondition rejection rate | | | |
| Unsupported decisive claims accepted | | | |
| Fatal legal errors | | | |

## Architecture Gates

| Gate | Observed count | Status | Evidence/artifact |
| --- | ---: | --- | --- |
| Cross-request evidence use | | | |
| Guessed/invalid canonical EvidenceRef | | | |
| `INVALID_EVIDENCE_REF_FORMAT` | | | |
| Privacy leakage | | | |
| Unbounded retry/tool loop | | | |
| Deadline reset | | | |
| Silent architecture fallback | | | |
| Unsupported decisive legal claims accepted | | | |

List every `unmeasured` gate as an open blocker. Do not convert missing
telemetry into zero.

## Failure Taxonomy

| Code | Count | Representative case IDs | Automatic or adjudicated | Notes |
| --- | ---: | --- | --- | --- |
| A1 | | | | |
| A2 | | | | |
| A3 | | | | |
| A4 | | | | |
| A5 | | | | |
| A6 | | | | |
| A7 | | | | |
| A8 | | | | |
| A9 | | | | |
| A10 | | | | |
| A11 | | | | |
| A12 | | | | |

## Exact/Applicability Gap

- Inspected claim classifications:
- Applicability-gap cases:
- Co-occurring candidate claims (not causal claim attribution):
- `NO_DOCUMENT_VERSION` count:
- `NO_EFFECTIVE_INTERVAL` count:
- `NO_APPLICABLE_INTERVAL` count:
- Manual interpretation:
- Phase-6 implication:

## Performance and Resource Use

| Metric | Arm A | Arm B | Delta B - A |
| --- | ---: | ---: | ---: |
| Latency P50 (ms) | | | |
| Latency P90 (ms) | | | |
| Maximum latency (ms) | | | |
| Provider calls | | | |
| Tool calls | | | |
| Tool rounds | | | |
| Native web calls | | | |
| Flat-RAG calls | 0 | | |
| Repair/continuation count | | | |
| Input tokens | | | |
| Output tokens | | | |
| Reasoning tokens | | | |

Also report first provider/research-stage duration, terminal continuation
duration, timeout stage, and category slices when telemetry supports them.

## A/B Result

- Measurable Arm-B legal benefit:
- Added latency/call/cost burden:
- Evidence-quality difference:
- Version/applicability difference:
- Fatal-error difference:
- Lawyer-review conclusion:

Flat-RAG must not be promoted merely because it increases completion. Record
whether its marginal legal value justifies retrieval cost and complexity.

## Manual Review

- Artifact:
- Cases reviewed:
- Reviewer/adjudicator:
- Score summary:
- Fatal errors by arm:
- Unresolved disagreements:

Use the 0-5 dimensions in `manual_review_template.csv`. Fatal errors remain a
separate count, including wrong pathway recommendation, invented requirement,
wrong date/version, unsupported decisive statement, guidance represented as
binding law, and missed decisive condition.

## Open Blockers

- [ ]

Distinguish expected Phase-5 capability limitations from defects requiring
architecture correction. Do not weaken evidence rules to clear this section.

## Final Decision

`PASS TO PHASE 6` / `HOLD FOR ARCHITECTURE CORRECTION`

Decision rationale:

Approved by:
Date:
