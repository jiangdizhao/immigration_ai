# Phase 13 M2-A1.2-B2 — Live Read-only Owner Runbook

**Status:** B2-0 offline harness implementation only. This runbook prepares a later owner-operated B2-1 review; it does not authorize any AWS access. B2-2 resource changes, uploads, GuardDuty scans, queue consumption, B3 worker integration, production deployment and customer documents remain separately gated.

## B2-0 local plan

From `chatbot/`, inspect the harness help and plan. Both commands are offline; neither loads credentials nor calls AWS or PostgreSQL:

```sh
node --conditions=react-server --import tsx scripts/phase13-b2-aws-security-readiness.ts --help
node --conditions=react-server --import tsx scripts/phase13-b2-aws-security-readiness.ts plan
```

An operator may keep an exact scope JSON file outside the repository and pass `--config <path>` for a redacted plan. Do not place credentials, raw policies or live account evidence in Git or chat. The CLI's `--collect-read-only` option intentionally refuses execution with `B2_1_SEPARATE_AUTHORIZATION_REQUIRED` in B2-0. Do not try to bypass this stop with AWS CLI, SDK, shell commands or another profile.

The scope file must have this exact shape; angle-bracket values are placeholders and fail validation until replaced with exact owner-confirmed selectors:

```json
{
  "schema": "phase13.project_document.aws_b2_scope.v1",
  "environment": "isolated_sandbox",
  "approvedAccountId": "<12-digit-account-id>",
  "region": "<region>",
  "partition": "aws",
  "awsProfile": "<named-non-default-profile>",
  "expectedCallerArn": "<exact-expected-STS-caller-ARN>",
  "resourceSelectors": {
    "bucket": "<exact-bucket>",
    "projectDocumentPrefix": "project-document/",
    "guardDutyPlanId": "<exact-plan-id>",
    "guardDutyPlanArn": "<exact-plan-ARN>",
    "eventBusName": "default",
    "eventBusArn": "<exact-default-bus-ARN>",
    "eventRuleName": "<exact-rule-name>",
    "eventRuleArn": "<exact-rule-ARN>",
    "queueName": "<exact-queue-name>",
    "queueArn": "<exact-queue-ARN>",
    "queueUrl": "<exact-queue-URL>",
    "dlqArn": "<exact-DLQ-ARN>",
    "applicationRoleArn": "<exact-application-role-ARN>",
    "kmsKeyArn": null
  }
}
```

If a KMS ARN is omitted, KMS evidence remains incomplete. The local approval record is separately scoped and is not a substitute for the B2-1 owner approval gate.

## B2-1 prerequisites — not yet authorized

Before a future B2-1 implementation or run, the owner and security operator must record and approve all of the following in the separately authorized change record:

- Named operator, nonproduction isolated sandbox account, AWS partition, region, exact profile name and exact expected caller ARN. Use a dedicated read-only SSO profile; do not use `default`, ambient `AWS_PROFILE`, static keys supplied to Codex, role assumption, credential-file edits or profile discovery.
- Exact bucket and fixed `project-document/` prefix; GuardDuty Malware Protection plan ID/ARN; default EventBridge bus and exact rule; exact queue name/ARN/URL and DLQ ARN; selected application role ARN; optional KMS key ARN. If a resource is absent, record it as absent; do not discover or create replacements.
- A local approval record with unique ID, exact identity/resources, approval timestamp, expiry within one hour, `read_only` scope and explicit acknowledgements for nonproduction-only, no mutation, no object access and no message consumption. The record is workflow evidence, not cryptographic proof of the approver or production consent.
- Separate source review and explicit owner authorization for live read-only API access. Confirm the operator understands infrastructure metadata may be sensitive and read-only requests can still incur cost.

If B2-1 is later authorized, the reviewed collector must obtain STS `GetCallerIdentity` first and stop immediately unless exact account, partition and caller ARN match. Only then may it issue the fixed read-only calls from the plan using exact selectors. Keep the API count, pages, response sizes, retries, request timeouts and total deadline bounded. Use no endpoint overrides or arbitrary CLI/API inputs. AccessDenied, truncation, missing resources, unknown policy semantics and incomplete IAM/organization evidence stay `INCOMPLETE`; never request broader permissions automatically.

## Evidence handling and interpretation

- Store any owner-approved raw capture only in an owner-controlled, access-restricted local location with an explicit retention and secure disposal date. The harness report must contain only allowlisted status/reason codes, timestamps and non-sensitive fingerprints; no full account/resource identifiers, queue URL, policy document, principal inventory, object key or message body.
- Do not interpret a static policy snapshot, SQS message ID, queue URL, event JSON, `source=aws.guardduty`, matching rule pattern or STS identity as authenticated GuardDuty source proof. B2-0 never creates `TrustedScanDeliveryContext`.
- Review EventBridge V2/custom-bus `aws.` source reservation only for its documented API scope. Do not generalize it to every classic/default bus, legacy `PutEvents`, forwarding path, direct SQS `SendMessage`, cross-account route or privileged rule/queue mutation. Do not make the opposite blanket claim that every `PutEvents` caller can impersonate GuardDuty. Unresolved topology is `NO_GO`.
- Review S3 owner/location, Versioning, public-access block, policy status, encryption and prefix scope; GuardDuty plan; exact EventBridge rule/queue target; SQS queue policy, redrive and encryption; selected IAM trust/permissions/boundary; and KMS key/policy/grants. Selected-role policy export does not prove effective permissions: session policies, SCPs, other principals, grants, explicit denies and administrators may remain unknown.
- The B1 static evaluator may be applied only to a schema-valid B1 snapshot with matching explicit `fixture` or `operator_export` provenance. Its decision remains `NO_GO`, and its incomplete findings must not be promoted.
- Report all B2 observations as `NO_GO` requiring live owner verification. In particular, database runtime grants, exact S3 version bytes/digest, authenticated event origin and effective permissions are not established by B2-0.

## B2-2 and rollback gates — not authorized

Do not create or change buckets, Versioning, Object Lock, GuardDuty plans, EventBridge rules, queues/DLQs, IAM or KMS. Do not upload an object, trigger a scan, send/receive/delete a queue message or run a paid/mutating experiment under B2-1 approval.

B2-2 needs a new written owner/security/privacy approval naming synthetic-only content, exact sandbox resources, allowed mutations, request/object/message limits, cost ceiling and alerts, test window, operator and rollback owner. Privacy/legal/records owners must decide residency, retention, lawful deletion, legal holds, Object Lock mode and proof of erasure before any object trial. Define and exercise rollback and incident stops. A successful B2-2 review still does not authorize B3 or customer-facing document processing.

## Stop conditions

Stop and report `NO_GO` on identity/resource mismatch, expired or scope-mismatched approval, wrong or ambient profile, unexpected operation, API denial, truncated/oversized evidence, unresolved direct queue injection or mutation path, incomplete IAM/KMS/SCP/grant inventory, missing resource, customer data exposure, cost/residency uncertainty or failed rollback. Do not retry with broader permissions or substitute another account, region, queue, bus, bucket, database or profile.
