# Phase 5 Exit Pilot Runbook

These commands are for Rico/ChatGPT to run later. They are intentionally not
executed in the implementation session.

All commands use the approved interpreter and the frozen Phase-5 arms. Run
against an isolated local stack with the required database/configuration. Keep
Stage 1, Stage 2, and Stage 3 output directories separate.

The manifest contains 39 cases: 35 automated single-turn cases and 4
`stateful_manual` cases. The automated runner excludes the four stateful cases;
they remain available for the restricted manual/stateful review slice.

The historical `luna_web`/`luna_flat_web` outputs remain preserved for
comparison. The revised v2.1.3 Default target is named
`luna_default_local_web` and exposes the existing local retrieval tool plus
native web search; it is not a silent reinterpretation of historical Arm A.

## Local Validation

Focused evaluation tests:

```bash
cd /home/rico/immigration_ai/legal-service
export IMMIGRATION_AI_PYTHON=/home/rico/anaconda3/envs/torch/bin/python
"$IMMIGRATION_AI_PYTHON" -m pytest tests/test_phase5_architecture_eval_runner.py tests/test_phase5_exit_analysis.py
```

Full legal-service backend validation:

```bash
cd /home/rico/immigration_ai/legal-service
export IMMIGRATION_AI_PYTHON=/home/rico/anaconda3/envs/torch/bin/python
"$IMMIGRATION_AI_PYTHON" -m pytest
```

## Stage 1 Arm A

Eight representative cases: stable/general, current procedural, two
substantive legal cases including Schedule 2/3, pathway reasoning, Chinese,
current non-immigration boundary behavior, and ambiguous facts.

```bash
cd /home/rico/immigration_ai/legal-service
export IMMIGRATION_AI_PYTHON=/home/rico/anaconda3/envs/torch/bin/python
export FLAT_RAG_TOOL_ENABLED=false
export DEFAULT_AGENT_REASONING_EFFORT=low
export AGENT_MAX_FLAT_RAG_CALLS=1
export AGENT_RETRY_VIABILITY_THRESHOLD_MS=8000
"$IMMIGRATION_AI_PYTHON" -m scripts.run_architecture_eval \
  --manifest tests/eval/architecture_v2/pilot_manifest.json \
  --stage stage_1 \
  --arms luna_web \
  --output artifacts/eval/phase5-exit/stage1-arm-a
```

Extract Stage 1 Arm A results:

```bash
"$IMMIGRATION_AI_PYTHON" -m scripts.phase5_exit_analysis \
  --manifest tests/eval/architecture_v2/pilot_manifest.json \
  --results artifacts/eval/phase5-exit/stage1-arm-a/results.jsonl \
  --output artifacts/eval/phase5-exit/stage1-arm-a/analysis.json
```

## After Stage-1 Inspection: Stage 2 Arm B

The same eight case IDs are selected from the manifest. Setting
`FLAT_RAG_TOOL_ENABLED=true` is required; the runner refuses to silently run
Arm B as Arm A when it is disabled.

```bash
cd /home/rico/immigration_ai/legal-service
export IMMIGRATION_AI_PYTHON=/home/rico/anaconda3/envs/torch/bin/python
export FLAT_RAG_TOOL_ENABLED=true
export DEFAULT_AGENT_REASONING_EFFORT=low
export AGENT_MAX_FLAT_RAG_CALLS=1
export AGENT_RETRY_VIABILITY_THRESHOLD_MS=8000
"$IMMIGRATION_AI_PYTHON" -m scripts.run_architecture_eval \
  --manifest tests/eval/architecture_v2/pilot_manifest.json \
  --stage stage_2 \
  --arms luna_flat_web \
  --output artifacts/eval/phase5-exit/stage2-arm-b
```

Extract Stage 2 Arm B results:

```bash
"$IMMIGRATION_AI_PYTHON" -m scripts.phase5_exit_analysis \
  --manifest tests/eval/architecture_v2/pilot_manifest.json \
  --results artifacts/eval/phase5-exit/stage2-arm-b/results.jsonl \
  --output artifacts/eval/phase5-exit/stage2-arm-b/analysis.json
```

## Stage 3 Remaining Paired Pilot

Stage 3 selects the remaining automated single-turn cases not listed in Stage 1
and runs both arms on the same cases. Stateful/manual cases are excluded.

```bash
cd /home/rico/immigration_ai/legal-service
export IMMIGRATION_AI_PYTHON=/home/rico/anaconda3/envs/torch/bin/python
export FLAT_RAG_TOOL_ENABLED=true
export DEFAULT_AGENT_REASONING_EFFORT=low
export AGENT_MAX_FLAT_RAG_CALLS=1
export AGENT_RETRY_VIABILITY_THRESHOLD_MS=8000
"$IMMIGRATION_AI_PYTHON" -m scripts.run_architecture_eval \
  --manifest tests/eval/architecture_v2/pilot_manifest.json \
  --stage stage_3 \
  --arms luna_web,luna_flat_web \
  --output artifacts/eval/phase5-exit/stage3-remaining-ab
```

Extract the paired Stage 3 comparison:

```bash
"$IMMIGRATION_AI_PYTHON" -m scripts.phase5_exit_analysis \
  --manifest tests/eval/architecture_v2/pilot_manifest.json \
  --results artifacts/eval/phase5-exit/stage3-remaining-ab/results.jsonl \
  --output artifacts/eval/phase5-exit/stage3-remaining-ab/analysis.json
```

## Combined Exit Analysis

Merge the three already-produced stage artifacts without rerunning any case.
Repeated `(case_id, arm)` rows are rejected deterministically, and incomplete
automated coverage is reported as `coverage_status=incomplete`.

```bash
cd /home/rico/immigration_ai/legal-service
export IMMIGRATION_AI_PYTHON=/home/rico/anaconda3/envs/torch/bin/python
"$IMMIGRATION_AI_PYTHON" -m scripts.phase5_exit_analysis \
  --manifest tests/eval/architecture_v2/pilot_manifest.json \
  --results artifacts/eval/phase5-exit/stage1-arm-a/results.jsonl \
  --results artifacts/eval/phase5-exit/stage2-arm-b/results.jsonl \
  --results artifacts/eval/phase5-exit/stage3-remaining-ab/results.jsonl \
  --output artifacts/eval/phase5-exit/final-analysis.json
```

## Revised Default Evaluation

After the revised integrity/checker implementation is authorized and validated,
use the named local-plus-web Default arm. This command is not executed as part
of the implementation task.

```bash
cd /home/rico/immigration_ai/legal-service
export IMMIGRATION_AI_PYTHON=/home/rico/anaconda3/envs/torch/bin/python
export FLAT_RAG_TOOL_ENABLED=true
export DEFAULT_AGENT_REASONING_EFFORT=low
export AGENT_MAX_FLAT_RAG_CALLS=1
export AGENT_RETRY_VIABILITY_THRESHOLD_MS=8000
"$IMMIGRATION_AI_PYTHON" -m scripts.run_architecture_eval \
  --manifest tests/eval/architecture_v2/pilot_manifest.json \
  --arms luna_default_local_web \
  --output artifacts/eval/phase5-exit/revised-default-local-web
```

## Manual Review

Copy `manual_review_template.csv` into the restricted review workspace and
attach legacy, Arm A, and Arm B artifacts by case ID. Keep answer/source content
out of normal telemetry. Record fatal errors separately from 0-5 scores and
assign A1-A12 codes only after evidence/manual review.
