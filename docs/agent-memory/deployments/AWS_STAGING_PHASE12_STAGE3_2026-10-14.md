# Phase 12 Stage 3 — AWS Staging deployment record (2026-10-14)

**Status:** DEPLOYED / OWNER ACCEPTED FOR STAGING. Deployment and narrow functional acceptance are complete; do not schedule another broad test campaign without an observed defect or fresh owner direction. This is an operational handoff, **not** approval for production rollout, a protected-branch merge, China payment activation, or retrospective proof of unrun formal Gates 1–3.

**Evidence basis:** Owner-executed AWS CLI outputs, ECS/CloudWatch summaries, and owner browser smoke confirmation during the 2026-10-14 deployment conversation. This document records those results; its author did not independently execute commands in the owner's AWS account. Never put SSM/Secrets Manager values, database URLs containing credentials, OpenAI keys, or user conversation contents in this repository.

## Source, target, and immutable artifacts

- Repository: `jiangdizhao/immigration_ai`; implementation branch `codex/phase12-stage3-policy-intelligence`; deployed source commit `b760c028674efe4fd40190d8b212167729e74348` (`b760c02`). The source branch was committed/pushed before this AWS deployment; this deployment record is a subsequent **documentation-only** update.
- AWS profile `aulawyers-staging`, account `747452892291`, region `ap-southeast-2`. ECS cluster `immigration-ai-staging`, service `immigration-ai-staging-web`.
- `chatbot` Stage 3 ECR image, pinned by digest: `747452892291.dkr.ecr.ap-southeast-2.amazonaws.com/immigration-ai/chatbot@sha256:716d6df7f4e130664f1805576adc8007fed3f2711bc9681b47b5670c518ee56c`.
- `legal-service` Stage 3 ECR image: `747452892291.dkr.ecr.ap-southeast-2.amazonaws.com/immigration-ai/legal-service@sha256:9aee74d0305519296133f0409e542bd8ded0e63f6507cf8bb1af1b92965a41c5`.
- Migration-only runner, ECR tag `stage3-migration-b760c02`, digest `sha256:c2579d7015ea38dbfa555effbdaec32b11dbf061bc3b42b18ca1ce4467d404c5` in `immigration-ai/chatbot`.
- Policy-sync-only runner, ECR tag `stage3-policy-sync-b760c02`, digest `sha256:b8eb9b4dd2cee08cc7bc7e68411c982da9d443f9e75fd3b57dee1f1bf8e01027` in `immigration-ai/chatbot`.

## Database migration — completed and verified

- Target was explicitly confirmed by a one-off in-VPC ECS migration preflight: **Secure RDS** `immigration-ai-staging-postgres-secure.ctkuiomwqo61.ap-southeast-2.rds.amazonaws.com:5432`, database `chatbot`. The runner validates an old-RDS SSM connection string and retargets its host to this private RDS **in memory**.
- Before migration, `drizzle.__drizzle_migrations` reported `ledgerLatest=0023_chief_famine`, `ledgerStatus=behind`, `repositoryHead=0029_phase12_stage3_r2_draft_snapshot_history`. The runner used ECS task-definition family `immigration-ai-staging-p11-009-migration:4` and a dedicated security group `sg-0fe4dadb2de1ce6dd`, with DB ingress permitted by `sg-0c4361ad74a4183cb`.
- Manual pre-migration RDS snapshot **`immigration-ai-staging-secure-pre-stage3-20261014`** was confirmed `available`, `encrypted=true`, for `immigration-ai-staging-postgres-secure` (snapshot time `2026-10-13T22:17:03.037Z`).
- One-off migration ECS task `0cb9044ab4b747f9b8484ded2f3140af` executed **six migrations, 0024–0029**, via the explicit runner override `["migrate","chatbot"]`, exited `0`, and logged `Migration operation completed.` PostgreSQL `NOTICE` entries about existing Drizzle schema/ledger and truncation of long identifier names were non-fatal; no reported SQL failure.
- A **separate read-only post-migration preflight** exited `0` and reported `database=chatbot`, `ledgerLatest=0029_phase12_stage3_r2_draft_snapshot_history`, `ledgerStatus=current`, `repositoryHead=0029_phase12_stage3_r2_draft_snapshot_history`. This is the authoritative database migration completion evidence.
- The running Web Task Definition's SSM secret targets were inspected without logging secrets: `chatbot.POSTGRES_URL` points to the Secure RDS `chatbot` database; `legal-service.DATABASE_URL` points to the same Secure RDS's separate `immigration_legal` database. No migration of `immigration_legal` was claimed.

## ECS Web rollout — completed

- Previous stable Task Definition: `immigration-ai-staging-web:43`. New one: **`immigration-ai-staging-web:44`**. A read-only comparison verified **exactly two image digests and six Legal Service model environment settings changed**, with all other task-definition settings preserved (including IAM, secrets, health-check configuration, and resource settings).
- Model environment replacements: `DEFAULT_AGENT_MODEL`, `COMPACT_CHECKER_MODEL`, `LEGAL_FACT_CHECK_MODEL`, `PREMIUM_DIRECT_FALLBACK_MODEL` → **`gpt-6-luna`**; `PREMIUM_AGENT_MODEL`, `PREMIUM_DIRECT_PRIMARY_MODEL` → **`gpt-6.1-sol`**. `GENERAL_QA_MODEL` and `REASONING_MODEL` remained `gpt-5.4-mini`; existing reasoning-effort values were not changed.
- `aws ecs update-service` requested `:44`; `aws ecs wait services-stable` returned success. Final service observation: `:44` as sole `PRIMARY` deployment, `rolloutState=COMPLETED`, desired/running/pending **1/1/0**. Existing rolling configuration remains `maximumPercent=200`, `minimumHealthyPercent=100`, circuit breaker enabled with **automatic rollback**. Keep `:43` available as an application rollback reference; reverting app code does **not** undo migrations or subsequent database writes.
- Observed new ECS task `7d090e9110e14bbb82ce9c23ae3c9e5c`; both containers `RUNNING`. ALB chatbot target `172.31.32.47:3000` was **healthy**. Previous target `172.31.25.166:3000` was draining normally.
- Both containers report ECS `healthStatus=UNKNOWN` because their Task Definition `healthCheck` fields are `null`, **not** because an ECS container check failed. ALB health succeeded. Do not treat this as a release blocker; optional future container probe work requires a separate request.
- Owner manually tested **all three** AI answer modes (Fast, Legal Check and Premium): each returned a usable answer. For the new Legal Service log stream, `legal_query_finished` appeared with three HTTP **200** results and elapsed times **8101 ms, 30814 ms, 40715 ms**. Source route review showed each widget path calls the FastAPI `/api/v1/query` endpoint. This supports the owner's **core question-answer E2E PASS**; it does not purport to validate every workflow or prove which provider model handled each internal fallback call.

## Policy Intelligence scheduled sync — configuration deployed

- Previous Policy Sync ECS task definition: `immigration-ai-staging-policy-sync:10`; updated to **`:11`** using policy-sync image digest `sha256:b8eb9b4dd2cee08cc7bc7e68411c982da9d443f9e75fd3b57dee1f1bf8e01027`.
- The original task environment had `NODE_ENV=production`, `POLICY_INTELLIGENCE_ENABLED=true`; `POSTGRES_URL` and `OPENAI_API_KEY` are ECS secrets, not written to documents. Explicit **`POLICY_INTELLIGENCE_MODEL=gpt-6.1-sol`** was added because the source-level default in `chatbot/lib/policy-intelligence/provider.ts` otherwise remains `gpt-5.6-sol`. Default `high` reasoning effort remains unchanged.
- Existing EventBridge **Scheduler** schedule `default/immigration-ai-staging-policy-sync-daily` (not an EventBridge Rule) was updated **in place** to use `immigration-ai-staging-policy-sync:11`; read-back confirmed `State=ENABLED` and unchanged `ScheduleExpression=cron(0 6 * * ? *)`. The schedule's timezone was **not** reported; do not infer local wall-clock time from this expression without reading `ScheduleExpressionTimezone`.
- The Scheduler update did **not** run a Policy Sync immediately. **First future `:11` scheduled execution is not yet observed or accepted as a runtime success.** Owner explicitly elected not to add more smoke tests before closing this staging deployment.

## Owner acceptance, boundaries, and next-session rules

- Owner accepted the **Staging deployment and core AI smoke** on 2026-10-14, and waived further optional broad functional testing (including additional conversation persistence/policy editor browser scenarios) for this rollout. Record those as **waived/owner accepted**, never as independently executed PASS. Existing Stage 3 source-level functional sign-off stands.
- **Do not conflate this staging operational acceptance with formal Gate 3 acceptance**: exhaustive integration, negative authorization, security/environment gates, production rollout and older Phase 12 Gate 1/2 exclusions were not collectively rerun or signed off. Production **was not deployed**. No production billing, Stripe China/WeChat or Alipay activation was performed.
- No further AWS deployment, forced ECS restart, database migration, policy sync manual run, or test campaign is requested. Address new real-world defects individually when observed.
- Recovery anchors: prior ECS Web Task Definition **`:43`**, previous Policy Sync Task Definition **`:10`**, immutable ECR digests above, and the encrypted **pre-Stage-3 Secure RDS snapshot**. Restoring that snapshot is an explicit database restore, not an instantaneous or lossless app rollback; newer writes will not be included.
- AWS notified the owner of Fargate platform revision maintenance: tasks launched **after 2026-10-12 18:00 UTC** use the new revision; maintenance of older tasks begins **2026-10-19 18:00 UTC**. The Web `:44` task launched on 2026-10-14, so no extra `--force-new-deployment` is needed for it. Other always-running services (e.g., malware reconciler) were **not** independently audited against the AWS Health affected-resource list; AWS reports routine automatic replacement under ECS service settings. Owner requested **no action** on the notification.

## Useful future read-only checks (only when actually needed)

```bash
aws ecs describe-services --profile aulawyers-staging --region ap-southeast-2 --cluster immigration-ai-staging --services immigration-ai-staging-web --query 'services[0].{taskDefinition:taskDefinition,deployments:deployments,desired:desiredCount,running:runningCount}' --output json

aws ecs describe-task-definition --profile aulawyers-staging --region ap-southeast-2 --task-definition immigration-ai-staging-policy-sync:11 --query 'taskDefinition.containerDefinitions[].{name:name,image:image,environment:environment}' --output json

aws scheduler get-schedule --profile aulawyers-staging --region ap-southeast-2 --group-name default --name immigration-ai-staging-policy-sync-daily --query '{state:State,expression:ScheduleExpression,timezone:ScheduleExpressionTimezone,taskDefinition:Target.EcsParameters.TaskDefinitionArn}' --output json
```

**Code-change scope of this handoff:** documentation only. No application code changes, new migrations, AWS mutations, or model calls.
