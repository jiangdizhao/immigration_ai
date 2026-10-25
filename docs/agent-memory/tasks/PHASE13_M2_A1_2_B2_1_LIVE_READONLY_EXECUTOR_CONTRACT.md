# Phase 13 / M2-A1.2-B2-1 — Live AWS Read-only Executor Contract

**Architect:** ChatGPT | **Architecture frozen:** 2026-10-26 | **Branch:** `phase13-study-journey-project-centric`  
**Starting HEAD:** `1fc3820b440fe1e74edbd4b24218d7717f61e234`  
**Status:** ARCHITECT-FROZEN for owner review and bounded, offline-only coding dispatch. **NO live AWS access or execution approval is implied.** The owner must separately authorize a named isolated nonproduction identity/resource manifest and an actual read-only run after independent patch acceptance. B2-2/B3/A1.3 and full M2 remain unauthorized/unaccepted.

## 1. Purpose and authoritative foundations

Extend the **accepted B2-0** offline safety-evidence harness with one operator-only, explicitly gated **real AWS read-only command executor**, while preserving its offline default. B2-1 is configuration evidence collection; it is **not** proof of authenticated GuardDuty delivery, safe/clean customer files, effective IAM or production readiness. All observations and live readiness remain `NO_GO`.

Read and defer to `AGENTS.md`, `docs/agent-memory/{DECISIONS,CURRENT_HANDOFF,CURRENT_MILESTONE,PROJECT_STATE}.md`, `tasks/PHASE13_M2_A1_2_B2_AWS_LIVE_EVIDENCE_ARCHITECTURE_CONTRACT.md`, `tasks/PHASE13_M2_A1_2_B2_LIVE_READONLY_OWNER_RUNBOOK.md`, B1 security evaluator and queue protocol, B2-0 scope/plan/types/fixtures/tests, accepted A1.2-A S3/GuardDuty adapters, and migration 0033. This contract governs **only the B2-1 addition**. Where earlier B2-0 docs say only B2-0 is authorized, this contract authorizes *design and owner-dispatched offline implementation*, **not** real cloud operations.

## 2. Two distinct gates

- **Gate A: code preparation:** Codex can implement and test locally using injected fake command runners after owner dispatch. Codex MUST NOT discover credentials, invoke AWS CLI/SDK against the network, perform STS checks, inspect live account, create resources or modify a real DB. The architect independently reviews a full uncommitted patch and tests before the owner commits/pushes.
- **Gate B: actual B2-1 experiment:** only after Gate A source acceptance and **fresh explicit owner/operator approval** of a nonproduction isolated AWS account, partition, region, exact non-default named profile, exact expected STS caller ARN, exact bucket/prefix, GuardDuty plan, default EventBridge bus/rule, SQS queue/DLQ, selected application role and optional KMS ARN. Owner executes one reviewed bounded read-only run, not Codex/CI. If resources do not exist, do not infer/create/discover replacements: return `INCOMPLETE`, leave `NO_GO`, and separately decide B2-2.

Never auto-use the existing `aulawyers-staging` profile or assume an existing staging account is a dedicated sandbox.

## 3. B2-1 operator entry and safe separation

Add a **separate server/operator-only executable** (suggest `chatbot/scripts/phase13-b2-1-aws-readonly.ts`) and a small new live collector / AWS CLI runner under `chatbot/lib/project-documents/aws/security-readiness/`. Keep `scripts/phase13-b2-aws-security-readiness.ts`, its synchronous `b2-cli.ts` and the accepted B2-0 default `plan` / `--help` / `collect-read-only` refusal unchanged. The B2-0 import/static safety regression explicitly prohibits command-execution imports in that original entry.

The new executable must default to help/refusal, and initiate any subprocess only with **all** explicit parameters: `--collect-read-only`, `--scope-path`, `--approval-path`, `--confirmed-account` and an owner-controlled sanitized report destination outside the repository. No implicit profile, environment discovery, fallback, interactive prompt, arbitrary AWS command, endpoint, shell expression, wildcard resource or caller-supplied URL. No live execution on import, help, missing/invalid options, expired/mismatched approval or missing CLI.

Reuse `validateB2Scope`, `validateB2Approval`, `b2RequestTemplates`, `B2_READ_ONLY_OPERATIONS`, the existing 30-second overall deadline, 2-second per-request target, 256 KiB maximum per API response, zero retries by default, bounded pages and total call cap. If existing limits are insufficient on a real setup, report an incomplete test and seek an independently approved contract revision, not an unreviewed expansion. The typed local approval is **self-attested workflow evidence**, not a cryptographic signature or independently verified owner consent.

## 4. Fixed AWS executor contract

Use a narrow, injectable **AWS CLI v2 argument-vector executor** (e.g., spawn/execFile with fixed binary and arguments; no shell). AWS CLI v2 is already installed on the owner's Ubuntu laptop. Explicitly pin `--profile <validated-non-default>`, `--region <validated-region>`, JSON output, no pager, no auto-prompt and no unbounded auto-pagination. Validate/fail closed on ambient AWS credential, configuration, endpoint, proxy or region override risks; never edit/read/copy the credential store, assume a role, trigger SSO login or accept caller-provided endpoint/plugin/CA overrides. Respect the chosen named profile's pre-existing operator-managed SSO session only.

Map **only** accepted operation IDs and validated selectors into literal `aws service operation` invocations; deny all unknown arguments and all writes. The accepted B2-0 fixed primary requests are STS identity, S3 bucket location/versioning/public access/encryption/policy, GuardDuty malware plan, EventBridge default bus/rule/targets, SQS queue attributes, selected IAM role/policy names and attached policies, and optionally pinned KMS metadata. The **only** dependent IAM lookups are policy names/ARNs/default versions arising from the exact allowed role and bounded B2-0 `dependentRequestPlan` (max 4 each, no account-wide enumeration). Reuse existing plan semantics rather than introducing a second, divergent list. Pages, JSON sizes, total calls, timeouts, cancellation and stderr must be bounded; CLI failures produce controlled reason codes rather than raw output. AWS SDK/CLI implicit pagination and profile credential-provider behavior must be evaluated defensively.

Prohibited in B2-1, including through fallback: `sts:AssumeRole` as an explicit operation, `s3:ListBuckets`, `s3:ListObjects*`, `s3:GetObject*`, S3 write, GuardDuty scan/enrol/update, EventBridge Put*, SQS Send/Receive/Delete, IAM policy/role mutations, `kms:Decrypt`, PostgreSQL and any production/customer-file route.

## 5. Identity-first sequence and evidence

Preflight must strictly validate the `phase13.project_document.aws_b2_scope.v1` and `phase13.project_document.aws_b2_approval.v1` records, current bounded approval window (at most 1 hour), scope fingerprint and exact confirmation. **The first and only permitted AWS request before identity validation is `sts:GetCallerIdentity`.** Compare its account ID and exact returned Caller ARN to the frozen scope; verify partition and region consistency with the pinned resource identities. Wrong or inaccessible identity -> STOP with no subsequent API call.

After identity match, run the fixed requests sequentially or with equally bounded execution and preserve operation identity, normalized response finding, error-code taxonomy, timestamp and SHA-256 evidence fingerprint. Validate exact known returned bucket/plan/rule/queue/role IDs and appropriate response shapes; absent resources, missing permissions, unsupported metadata, truncated result, inconclusive policies/SCPs/permission boundaries, unsafe input transformation, identity ambiguity or unproven origin must be `INCOMPLETE` or `FAIL` rather than `PASS`. **No read-only observation can prove actual authenticated GuardDuty-to-SQS delivery, exact scanned S3 object bytes, or production effective IAM privileges.**

Reconcile the existing `B2Observation` `source: live_operator_readonly` with per-finding provenance (existing B2-0 finding only supports fixture/plan): add a strictly validated `live_executor` source if required, without permitting fixture output to masquerade as live. Preserve `phase13.project_document.aws_b2_observation.v1` and B1 static evidence schema; no implicit schema promotion. `evaluateB2SnapshotWithB1` must maintain its explicit provenance checks and unconditional `NO_GO`.

## 6. Output and privacy

Emit **only a sanitized, versioned** operator report: scoped fingerprint, bounded operation names, result status, safe reason codes, observed timestamps and evidence fingerprints; do not echo policy bodies, queue URLs, object names, account IDs, full ARNs, principal inventories, raw stderr, access tokens, documents or malware names. Do not write raw AWS captures in this milestone. If an output file is produced, require owner-selected path outside Git and restrictive permissions (0600); failure to enforce this aborts the run. Do not commit configurations/approvals or outputs. Maintain documented retention and secure disposal choices for the sanitized report.

Reports must always say `liveDecision: NO_GO` and `requiresLiveOwnerVerification: true`; never create a `TrustedScanDeliveryContext`, certify `clean`, invoke `finalizeScan()`, enable feature flags, authorize deployment or change Project document grants. A `PASS` for a static subcheck is not an overall readiness PASS.

## 7. Offline acceptance matrix

Implement adversarial fake-command tests (no AWS network) covering: no call on import/help/invalid args/missing scope/approval/expiry/wrong account or caller; STS-first and exact stop after mismatch; profile/region/ARN/partition injection; no ambient credentials/endpoint fallback; exact CLI argument-vector mapping; deny writes/undocumented operations; bounded IAM dependent lookups and pagination; timeouts, cancellation, unexpected CLI stderr, AccessDenied, missing resource, malformed, overlarge or truncated JSON, output-path permissions; stable redaction; source distinctions; `NO_GO` invariant; no trust capability, scan, SQS consumer, DB write or feature toggle. Exercise happy-path fake observations and missing/incomplete resource cases.

Retain and run existing focused B2-0 harness, B1 evaluator/queue, A1.2-A tests; run `pnpm test:unit`, changed-source Biome and `git diff --check`, and report all skips/known TypeScript baseline differences honestly. No actual AWS, PostgreSQL, migrations, paid AI, S3 objects or deployment as part of the Codex task.

## 8. Delivery / stopping condition

Codex delivers **uncommitted and unpushed** changed files, complete cumulative patch outside repo, patch SHA-256, test commands/results and expected behavior. Update `CURRENT_HANDOFF.md`, `CURRENT_MILESTONE.md`, `PROJECT_STATE.md`; do not overwrite older history, false-claim real cloud evidence or advance B2-2/B3.

ChatGPT performs independent source/patch review. Only after owner receives an accepted review are commit/push and remote SHA verification appropriate. **Do not execute any real AWS operation in this stage without later specific identity-scoped written owner authorization.**
