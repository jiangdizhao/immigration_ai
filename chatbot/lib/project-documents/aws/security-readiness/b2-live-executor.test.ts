import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { evaluateB2SnapshotWithB1 } from "./b2-evaluator-bridge";
import {
  createB2PrivateReportWriter,
  runB2LiveCli,
  validateB2SsoProfileConfig,
} from "./b2-live-cli";
import {
  collectB2LiveObservation,
  validateB2LiveCollectionInput,
} from "./b2-live-collector";
import {
  type B2AwsCliCommandResult,
  type B2AwsCliCommandRunner,
  B2AwsCliFailure,
  type B2LiveCommandRequest,
  type B2LiveExecutor,
  b2UnsafeAwsEnvironmentKeys,
  buildB2AwsCliArguments,
  createB2AwsCliV2Executor,
  normalizeB2AwsCliProcessResult,
} from "./b2-live-executor";
import { b2RequestTemplates } from "./b2-plan";
import { validateB2Scope } from "./b2-scope";
import type { B2ApprovalRecord, B2ReadOnlyRequest, B2Scope } from "./b2-types";
import { isB2Observation } from "./b2-validation";
import { PROJECT_DOCUMENT_AWS_SECURITY_EVIDENCE_SCHEMA } from "./types";

const now = Date.parse("2026-10-26T00:00:00.000Z");

function scopeFixture(): B2Scope {
  const account = "123456789012";
  const region = "ap-southeast-2";
  const planId = "plan-12345678";
  const ruleName = "project-document-scan";
  const queueName = "project-document-scan";
  return {
    schema: "phase13.project_document.aws_b2_scope.v1",
    environment: "isolated_sandbox",
    approvedAccountId: account,
    region,
    partition: "aws",
    awsProfile: "phase13-b2-readonly",
    expectedCallerArn: `arn:aws:sts::${account}:assumed-role/Phase13ReadOnly/operator-session`,
    resourceSelectors: {
      bucket: "phase13-b2-sandbox-documents",
      projectDocumentPrefix: "project-document/",
      guardDutyPlanId: planId,
      guardDutyPlanArn: `arn:aws:guardduty:${region}:${account}:malware-protection-plan/${planId}`,
      eventBusName: "default",
      eventBusArn: `arn:aws:events:${region}:${account}:event-bus/default`,
      eventRuleName: ruleName,
      eventRuleArn: `arn:aws:events:${region}:${account}:rule/${ruleName}`,
      queueName,
      queueArn: `arn:aws:sqs:${region}:${account}:${queueName}`,
      queueUrl: `https://sqs.${region}.amazonaws.com/${account}/${queueName}`,
      dlqArn: `arn:aws:sqs:${region}:${account}:${queueName}-dlq`,
      applicationRoleArn: `arn:aws:iam::${account}:role/project-document-worker`,
      kmsKeyArn: `arn:aws:kms:${region}:${account}:key/11111111-2222-4333-8444-555555555555`,
    },
  };
}

function approvalFixture(scope = scopeFixture()): B2ApprovalRecord {
  return {
    schema: "phase13.project_document.aws_b2_approval.v1",
    approvalId: "aabbbccc-dddd-4eee-8fff-000000000001",
    approvedAt: new Date(now - 60_000).toISOString(),
    expiresAt: new Date(now + 30 * 60_000).toISOString(),
    approvedScope: scope,
    scope: "read_only",
    acknowledgements: {
      nonproductionOnly: true,
      noMutation: true,
      noObjectAccess: true,
      noMessageConsumption: true,
    },
  };
}

const validAwsConfig = (scope = scopeFixture()) => `
[profile ${scope.awsProfile}]
sso_session = phase13-sandbox
sso_account_id = ${scope.approvedAccountId}
sso_role_name = Phase13ReadOnly
region = ${scope.region}

[sso-session phase13-sandbox]
sso_start_url = https://phase13.awsapps.com/start
sso_region = us-east-1
sso_registration_scopes = sso:account:access
`;

function identity(scope = scopeFixture()) {
  return { Account: scope.approvedAccountId, Arn: scope.expectedCallerArn };
}

function responseFor(request: B2LiveCommandRequest, scope: B2Scope) {
  if (request.kind === "dependent_iam") {
    if (request.operation === "iam:GetPolicy") {
      return {
        Policy: { Arn: request.input.PolicyArn, DefaultVersionId: "v4" },
      };
    }
    if (request.operation === "iam:GetPolicyVersion") {
      return {
        PolicyVersion: { VersionId: request.input.VersionId, Document: {} },
      };
    }
    return { PolicyName: request.input.PolicyName, PolicyDocument: {} };
  }
  switch (request.request.operation) {
    case "sts:GetCallerIdentity":
      return identity(scope);
    case "guardduty:GetMalwareProtectionPlan":
      return {
        MalwareProtectionPlan: {
          Arn: scope.resourceSelectors.guardDutyPlanArn,
          Status: "ACTIVE",
          ProtectedResource: {
            S3Bucket: {
              BucketName: scope.resourceSelectors.bucket,
              ObjectPrefixes: [scope.resourceSelectors.projectDocumentPrefix],
            },
          },
        },
      };
    case "events:ListTargetsByRule":
      return { Targets: [{ Arn: scope.resourceSelectors.queueArn }] };
    case "iam:ListRolePolicies":
      return { PolicyNames: [] };
    case "iam:ListAttachedRolePolicies":
      return { AttachedPolicies: [] };
    case "s3:GetBucketPolicy":
      return { Policy: "POLICY_SECRET_DO_NOT_LEAK" };
    default:
      return {};
  }
}

function fakeExecutor(
  scope = scopeFixture(),
  respond: (request: B2LiveCommandRequest) => unknown = (request) =>
    responseFor(request, scope)
) {
  const calls: Array<{
    request: B2LiveCommandRequest;
    profile: string;
    region: string;
    signal: AbortSignal;
  }> = [];
  const executor: B2LiveExecutor = {
    kind: "aws_cli_v2",
    execute(request, options) {
      calls.push({ request, ...options });
      return Promise.resolve(respond(request));
    },
  };
  return { executor, calls };
}

function safeEnvironment(home = "/tmp/b2-profile-home"): NodeJS.ProcessEnv {
  return {
    HOME: home,
    PATH: "/usr/bin:/bin",
    LANG: "C.UTF-8",
    NODE_ENV: "test",
  };
}

async function cliFixture() {
  const root = await mkdtemp(join(tmpdir(), "phase13-b2-1-test-"));
  const repositoryRoot = join(root, "repo");
  const external = join(root, "owner-private");
  const home = join(root, "home");
  await Promise.all([
    mkdir(repositoryRoot, { recursive: true }),
    mkdir(external, { recursive: true }),
    mkdir(join(home, ".aws"), { recursive: true }),
  ]);
  const scope = scopeFixture();
  const scopePath = join(external, "scope.json");
  const approvalPath = join(external, "approval.json");
  const reportPath = join(external, "sanitized-report.json");
  await Promise.all([
    writeFile(scopePath, JSON.stringify(scope)),
    writeFile(approvalPath, JSON.stringify(approvalFixture(scope))),
  ]);
  const calls: string[][] = [];
  const runner: B2AwsCliCommandRunner = (args) => {
    calls.push([...args]);
    return Promise.resolve({
      exitCode: 0,
      stdout: JSON.stringify(identity(scope)),
      stderr: "",
    });
  };
  return {
    root,
    repositoryRoot,
    external,
    scope,
    scopePath,
    approvalPath,
    reportPath,
    calls,
    dependencies: {
      environment: safeEnvironment(home),
      repositoryRoot,
      currentDirectory: root,
      now: () => now,
      readAwsConfig: () => Promise.resolve(validAwsConfig(scope)),
      commandRunner: runner,
    },
  };
}

async function cleanFixture(root: string) {
  await rm(root, { recursive: true, force: true });
}

function cliArgs(fixture: Awaited<ReturnType<typeof cliFixture>>) {
  return [
    "--collect-read-only",
    "--scope-path",
    fixture.scopePath,
    "--approval-path",
    fixture.approvalPath,
    "--confirmed-account",
    fixture.scope.approvedAccountId,
    "--report-path",
    fixture.reportPath,
  ];
}

test("SSO profile preflight requires pinned account, region, SSO session, and no endpoint/plugin/CA/provider overrides", () => {
  const scope = scopeFixture();
  assert.equal(validateB2SsoProfileConfig(validAwsConfig(scope), scope), true);
  const invalidConfigs = [
    validAwsConfig(scope).replace(
      "region = ap-southeast-2",
      "region = us-east-1"
    ),
    validAwsConfig(scope).replace("region = ap-southeast-2\n", ""),
    validAwsConfig(scope).replace(
      "sso_account_id = 123456789012",
      "sso_account_id = 000000000000"
    ),
    validAwsConfig(scope).replace(
      "sso_session = phase13-sandbox",
      "credential_process = external-helper"
    ),
    `${validAwsConfig(scope)}\n[profile unrelated]\nendpoint_url = https://override.invalid\n`,
    `${validAwsConfig(scope)}\n[profile unrelated]\nca_bundle = /tmp/custom-ca.pem\n`,
    `${validAwsConfig(scope)}\n[profile unrelated]\ncli_plugins = custom\n`,
  ];
  for (const invalid of invalidConfigs) {
    assert.equal(validateB2SsoProfileConfig(invalid, scope), false);
  }
});

test("help, missing/invalid arguments, and failed CLI preflight never invoke the fake command runner", async () => {
  const fixture = await cliFixture();
  try {
    assert.equal((await runB2LiveCli([], fixture.dependencies)).exitCode, 0);
    assert.equal(
      (
        await runB2LiveCli(
          ["--help", "--collect-read-only"],
          fixture.dependencies
        )
      ).exitCode,
      0
    );
    assert.equal(fixture.calls.length, 0);

    const invalid = await runB2LiveCli(
      ["--collect-read-only", "--endpoint-url", "https://override.invalid"],
      fixture.dependencies
    );
    assert.equal(invalid.exitCode, 2);
    const missing = await runB2LiveCli(
      ["--collect-read-only", "--scope-path", fixture.scopePath],
      fixture.dependencies
    );
    assert.equal(missing.exitCode, 2);
    const noOptIn = await runB2LiveCli(
      cliArgs(fixture).slice(1),
      fixture.dependencies
    );
    assert.equal(noOptIn.exitCode, 2);
    assert.equal(fixture.calls.length, 0);
  } finally {
    await cleanFixture(fixture.root);
  }
});

test("ambient credentials, endpoint, region, CA, profile, and proxy environment overrides fail closed", async () => {
  for (const key of [
    "AWS_ACCESS_KEY_ID",
    "AWS_PROFILE",
    "AWS_REGION",
    "AWS_ENDPOINT_URL",
    "AWS_ENDPOINT_URL_STS",
    "AWS_CA_BUNDLE",
    "HTTPS_PROXY",
  ]) {
    assert.ok(
      b2UnsafeAwsEnvironmentKeys({
        ...safeEnvironment(),
        [key]: "redacted",
      }).includes(key)
    );
  }
  const fixture = await cliFixture();
  try {
    const result = await runB2LiveCli(cliArgs(fixture), {
      ...fixture.dependencies,
      environment: {
        ...safeEnvironment(),
        AWS_ACCESS_KEY_ID: "must-not-be-echoed",
      },
    });
    assert.equal(result.exitCode, 2);
    assert.doesNotMatch(result.stderr, /must-not-be-echoed/u);
    assert.equal(fixture.calls.length, 0);
  } finally {
    await cleanFixture(fixture.root);
  }
});

test("invalid selected SSO profile configuration never starts the fake AWS command", async () => {
  const fixture = await cliFixture();
  try {
    const result = await runB2LiveCli(cliArgs(fixture), {
      ...fixture.dependencies,
      readAwsConfig: () =>
        Promise.resolve(
          validAwsConfig(fixture.scope).replace(
            "sso_role_name = Phase13ReadOnly",
            "credential_process = untrusted-helper"
          )
        ),
    });
    assert.equal(result.exitCode, 2);
    assert.match(result.stderr, /AWS_PROFILE_NOT_BOUNDED_SSO/u);
    assert.equal(fixture.calls.length, 0);
  } finally {
    await cleanFixture(fixture.root);
  }
});

test("missing, expired, scope-mismatched, and wrong-account approval preflight never reaches STS", async () => {
  const scope = scopeFixture();
  const fake = fakeExecutor(scope);
  const valid = {
    scope,
    approval: approvalFixture(scope),
    confirmedAccountId: scope.approvedAccountId,
    now,
  };
  assert.equal(
    validateB2LiveCollectionInput(valid, fake.executor).scope,
    scope
  );
  for (const invalid of [
    { ...valid, approval: undefined },
    { ...valid, now: Date.parse("2026-10-27T00:00:00.000Z") },
    { ...valid, confirmedAccountId: "000000000000" },
    {
      ...valid,
      approval: approvalFixture({ ...scope, region: "us-east-1" } as B2Scope),
    },
  ]) {
    await assert.rejects(collectB2LiveObservation(invalid, fake.executor));
  }
  assert.equal(fake.calls.length, 0);
});

test("approval expiry after preflight but before STS records an aborted outcome without a request", async () => {
  const scope = scopeFixture();
  const fake = fakeExecutor(scope);
  const expiredAt = Date.parse(approvalFixture(scope).expiresAt);
  const observation = await collectB2LiveObservation(
    { ...collectionInput(scope), clock: () => expiredAt },
    fake.executor
  );
  assert.equal(fake.calls.length, 0);
  assert.equal(observation.liveDecision, "NO_GO");
  assert.ok(
    observation.findings.some(
      (entry) =>
        entry.requirement === "caller_identity" &&
        entry.reasonCode === "APPROVAL_EXPIRED_DURING_COLLECTION" &&
        entry.status === "INCOMPLETE"
    )
  );
});

test("approval expiry during collection prevents every subsequent AWS request", async () => {
  const scope = scopeFixture();
  const fake = fakeExecutor(scope);
  let clockCalls = 0;
  const expiresAt = Date.parse(approvalFixture(scope).expiresAt);
  const observation = await collectB2LiveObservation(
    {
      ...collectionInput(scope),
      clock: () => {
        clockCalls += 1;
        return clockCalls === 1 ? now : expiresAt;
      },
    },
    fake.executor
  );
  assert.equal(fake.calls.length, 1);
  const firstCall = fake.calls[0];
  assert.ok(firstCall);
  assert.equal(operationOf(firstCall), "sts:GetCallerIdentity");
  assert.ok(
    observation.findings.some(
      (entry) =>
        entry.reasonCode === "APPROVAL_EXPIRED_DURING_COLLECTION" &&
        entry.status === "INCOMPLETE"
    )
  );
  assert.equal(observation.liveDecision, "NO_GO");
});

test("scope account/partition/profile/region/ARN injection is rejected before executor calls", async () => {
  const scope = scopeFixture();
  for (const invalid of [
    { ...scope, approvedAccountId: "000000000000" },
    { ...scope, partition: "aws-cn" },
    { ...scope, region: "cn-north-1" },
    {
      ...scope,
      expectedCallerArn: "arn:aws:sts::000000000000:assumed-role/Other/session",
    },
  ]) {
    assert.throws(() => validateB2Scope(invalid));
  }
  const fake = fakeExecutor(scope);
  await assert.rejects(
    collectB2LiveObservation(
      {
        scope: { ...scope, awsProfile: "default" },
        approval: approvalFixture(scope),
        confirmedAccountId: scope.approvedAccountId,
        now,
      },
      fake.executor
    )
  );
  assert.equal(fake.calls.length, 0);
});

function collectionInput(scope = scopeFixture()) {
  return {
    scope,
    approval: approvalFixture(scope),
    confirmedAccountId: scope.approvedAccountId,
    now,
  };
}

function operationOf(call: ReturnType<typeof fakeExecutor>["calls"][number]) {
  return call.request.kind === "primary"
    ? call.request.request.operation
    : call.request.operation;
}

test("STS is first and a wrong account or exact caller ARN stops every resource request", async () => {
  const scope = scopeFixture();
  for (const result of [
    { Account: "000000000000", Arn: scope.expectedCallerArn },
    {
      Account: scope.approvedAccountId,
      Arn: "arn:aws:sts::123456789012:assumed-role/Other/session",
    },
  ]) {
    const fake = fakeExecutor(scope, () => result);
    const observation = await collectB2LiveObservation(
      collectionInput(scope),
      fake.executor
    );
    assert.equal(fake.calls.length, 1);
    const firstCall = fake.calls[0];
    assert.ok(firstCall);
    assert.equal(operationOf(firstCall), "sts:GetCallerIdentity");
    assert.equal(observation.findings[0]?.requirement, "caller_identity");
    assert.equal(observation.findings[0]?.status, "FAIL");
    assert.equal(observation.liveDecision, "NO_GO");
  }
});

test("a matching identity permits only scoped reads and emits sanitized live evidence that stays NO_GO", async () => {
  const scope = scopeFixture();
  const fake = fakeExecutor(scope);
  const observation = await collectB2LiveObservation(
    collectionInput(scope),
    fake.executor
  );
  const serialized = JSON.stringify(observation);

  const firstCall = fake.calls[0];
  assert.ok(firstCall);
  assert.equal(operationOf(firstCall), "sts:GetCallerIdentity");
  assert.equal(observation.source, "live_operator_readonly");
  assert.equal(observation.liveDecision, "NO_GO");
  assert.equal(observation.requiresLiveOwnerVerification, true);
  assert.ok(
    observation.findings.every((finding) => finding.source === "live_executor")
  );
  assert.equal(
    isB2Observation(observation),
    true,
    JSON.stringify({
      source: observation.source,
      fingerprint: observation.scopeFingerprint,
      limitationLength: observation.limitation.length,
      findingCount: observation.findings.length,
      badFindings: observation.findings
        .filter(
          (finding) =>
            !/^[a-z0-9_.:-]+$/u.test(finding.requirement) ||
            !/^[A-Z0-9_]+$/u.test(finding.reasonCode) ||
            finding.outstandingAction.length > 512 ||
            !/^\d{4}-\d{2}-\d{2}T/u.test(finding.observedAt) ||
            (finding.evidenceFingerprint !== null &&
              !/^[0-9a-f]{64}$/u.test(finding.evidenceFingerprint))
        )
        .map(
          ({
            requirement,
            reasonCode,
            outstandingAction,
            evidenceFingerprint,
          }) => ({
            requirement,
            reasonCode,
            outstandingActionLength: outstandingAction.length,
            evidenceFingerprint,
          })
        ),
    })
  );
  assert.doesNotMatch(serialized, /POLICY_SECRET_DO_NOT_LEAK/u);
  assert.doesNotMatch(serialized, new RegExp(scope.expectedCallerArn, "u"));
  assert.doesNotMatch(
    serialized,
    /TrustedScanDeliveryContext|finalizeScan|feature.?flag|ReceiveMessage|database_url/iu
  );
});

test("GuardDuty response validation follows the AWS response schema and pins request PlanId", async () => {
  const scope = scopeFixture();
  const expected = {
    Arn: scope.resourceSelectors.guardDutyPlanArn,
    Status: "ACTIVE",
    ProtectedResource: {
      S3Bucket: {
        BucketName: scope.resourceSelectors.bucket,
        ObjectPrefixes: [scope.resourceSelectors.projectDocumentPrefix],
      },
    },
  };
  const cases: Array<{
    name: string;
    plan: unknown;
    status: string;
  }> = [
    { name: "valid without response PlanId", plan: expected, status: "PASS" },
    {
      name: "mismatched ARN",
      plan: { ...expected, Arn: "arn:aws:guardduty:other" },
      status: "FAIL",
    },
    {
      name: "mismatched bucket",
      plan: {
        ...expected,
        ProtectedResource: {
          S3Bucket: {
            BucketName: "other-bucket",
            ObjectPrefixes: [scope.resourceSelectors.projectDocumentPrefix],
          },
        },
      },
      status: "FAIL",
    },
    {
      name: "mismatched prefix",
      plan: {
        ...expected,
        ProtectedResource: {
          S3Bucket: {
            BucketName: scope.resourceSelectors.bucket,
            ObjectPrefixes: ["unrelated/"],
          },
        },
      },
      status: "FAIL",
    },
    {
      name: "inactive",
      plan: { ...expected, Status: "WARNING" },
      status: "FAIL",
    },
    {
      name: "incomplete",
      plan: { Arn: expected.Arn, Status: "ACTIVE" },
      status: "INCOMPLETE",
    },
  ];
  for (const item of cases) {
    const fake = fakeExecutor(scope, (request) => {
      if (
        request.kind === "primary" &&
        request.request.operation === "guardduty:GetMalwareProtectionPlan"
      ) {
        return { MalwareProtectionPlan: item.plan };
      }
      return responseFor(request, scope);
    });
    const observation = await collectB2LiveObservation(
      collectionInput(scope),
      fake.executor
    );
    assert.equal(
      observation.findings.find(
        (entry) => entry.requirement === "guardduty:getmalwareprotectionplan"
      )?.status,
      item.status,
      item.name
    );
    assert.equal(observation.liveDecision, "NO_GO");
    const planRequest = fake.calls.find(
      (entry) =>
        entry.request.kind === "primary" &&
        entry.request.request.operation === "guardduty:GetMalwareProtectionPlan"
    )?.request;
    assert.ok(planRequest?.kind === "primary");
    assert.equal(
      planRequest.request.input.MalwareProtectionPlanId,
      scope.resourceSelectors.guardDutyPlanId
    );
  }
});

test("primary CLI arguments exactly map the B2-0 allowlist and reject writes or altered selectors", () => {
  const scope = scopeFixture();
  const expectedCommands: Record<string, string> = {
    "sts:GetCallerIdentity": "sts get-caller-identity",
    "s3:GetBucketLocation": "s3api get-bucket-location",
    "s3:GetBucketVersioning": "s3api get-bucket-versioning",
    "s3:GetPublicAccessBlock": "s3api get-public-access-block",
    "s3:GetBucketEncryption": "s3api get-bucket-encryption",
    "s3:GetBucketPolicyStatus": "s3api get-bucket-policy-status",
    "s3:GetBucketPolicy": "s3api get-bucket-policy",
    "guardduty:GetMalwareProtectionPlan":
      "guardduty get-malware-protection-plan",
    "events:DescribeEventBus": "events describe-event-bus",
    "events:DescribeRule": "events describe-rule",
    "events:ListTargetsByRule": "events list-targets-by-rule",
    "sqs:GetQueueAttributes": "sqs get-queue-attributes",
    "iam:GetRole": "iam get-role",
    "iam:ListAttachedRolePolicies": "iam list-attached-role-policies",
    "iam:ListRolePolicies": "iam list-role-policies",
    "kms:DescribeKey": "kms describe-key",
    "kms:GetKeyPolicy": "kms get-key-policy",
    "kms:ListGrants": "kms list-grants",
  };
  for (const request of b2RequestTemplates(scope)) {
    const args = buildB2AwsCliArguments(
      scope,
      { kind: "primary", request },
      scope.awsProfile,
      scope.region
    );
    assert.equal(`${args[0]} ${args[1]}`, expectedCommands[request.operation]);
    assert.ok(args.includes("--profile") && args.includes(scope.awsProfile));
    assert.ok(args.includes("--region") && args.includes(scope.region));
    assert.ok(args.includes("--output") && args.includes("json"));
    assert.ok(args.includes("--no-cli-pager"));
    assert.ok(args.includes("--no-paginate"));
    assert.ok(args.includes("--cli-auto-prompt") && args.includes("off"));
    assert.ok(args.includes("--cli-connect-timeout") && args.includes("2"));
    assert.ok(args.includes("--cli-read-timeout") && args.includes("2"));
    assert.ok(
      !args.some((argument) =>
        /(?:put-|delete-|create-|update-|send-message|receive-message|decrypt|assume-role)/iu.test(
          argument
        )
      )
    );
    assert.ok(!args.includes("--endpoint-url"));
  }
  const templates = b2RequestTemplates(scope);
  const request = templates[1];
  assert.ok(request);
  assert.throws(
    () =>
      buildB2AwsCliArguments(
        scope,
        {
          kind: "primary",
          request: {
            ...request,
            input: {
              Bucket: "other-bucket",
              ExpectedBucketOwner: scope.approvedAccountId,
            },
          },
        },
        scope.awsProfile,
        scope.region
      ),
    (error: unknown) =>
      error instanceof B2AwsCliFailure &&
      error.code === "AWS_REQUEST_NOT_ALLOWLISTED"
  );
  assert.throws(
    () =>
      buildB2AwsCliArguments(
        scope,
        {
          kind: "primary",
          request: {
            ...request,
            operation: "s3:PutObject" as B2ReadOnlyRequest["operation"],
          },
        },
        scope.awsProfile,
        scope.region
      ),
    (error: unknown) =>
      error instanceof B2AwsCliFailure &&
      error.code === "AWS_REQUEST_NOT_ALLOWLISTED"
  );
  assert.throws(
    () =>
      buildB2AwsCliArguments(
        scope,
        {
          kind: "primary",
          request,
          pageToken: "token",
        },
        scope.awsProfile,
        scope.region
      ),
    (error: unknown) =>
      error instanceof B2AwsCliFailure &&
      error.code === "AWS_REQUEST_NOT_ALLOWLISTED"
  );
});

test("dependent IAM argument mapping accepts only bounded role-derived lookups", () => {
  const scope = scopeFixture();
  const roleName = scope.resourceSelectors.applicationRoleArn.split("/").at(-1);
  assert.ok(roleName);
  const policyArn = "arn:aws:iam::123456789012:policy/ProjectDocumentReadOnly";
  const allowed: B2LiveCommandRequest[] = [
    {
      kind: "dependent_iam" as const,
      operation: "iam:GetRolePolicy" as const,
      input: { RoleName: roleName, PolicyName: "InlinePolicy_1" },
    },
    {
      kind: "dependent_iam" as const,
      operation: "iam:GetPolicy" as const,
      input: { PolicyArn: policyArn },
    },
    {
      kind: "dependent_iam" as const,
      operation: "iam:GetPolicyVersion" as const,
      input: { PolicyArn: policyArn, VersionId: "v4" },
    },
  ];
  assert.deepEqual(
    allowed.map((request) =>
      buildB2AwsCliArguments(
        scope,
        request,
        scope.awsProfile,
        scope.region
      ).slice(0, 2)
    ),
    [
      ["iam", "get-role-policy"],
      ["iam", "get-policy"],
      ["iam", "get-policy-version"],
    ]
  );
  const denied: B2LiveCommandRequest[] = [
    {
      kind: "dependent_iam" as const,
      operation: "iam:GetRolePolicy" as const,
      input: { RoleName: "other", PolicyName: "InlinePolicy_1" },
    },
    {
      kind: "dependent_iam" as const,
      operation: "iam:GetPolicy" as const,
      input: { PolicyArn: "arn:aws:iam::000000000000:policy/Other" },
    },
    {
      kind: "dependent_iam" as const,
      operation: "iam:GetPolicyVersion" as const,
      input: { PolicyArn: policyArn, VersionId: "latest" },
    },
    {
      kind: "dependent_iam" as const,
      operation: "iam:GetRolePolicy" as const,
      input: { RoleName: roleName, PolicyName: "valid", Extra: "unexpected" },
    },
  ];
  for (const request of denied) {
    assert.throws(
      () =>
        buildB2AwsCliArguments(scope, request, scope.awsProfile, scope.region),
      (error: unknown) =>
        error instanceof B2AwsCliFailure &&
        error.code === "AWS_REQUEST_NOT_ALLOWLISTED"
    );
  }
});

test("AWS CLI executor pins the safe child environment and returns only typed failures", async () => {
  const scope = scopeFixture();
  let capturedArgs: readonly string[] = [];
  let capturedOptions: Parameters<B2AwsCliCommandRunner>[1] | undefined;
  const successRunner: B2AwsCliCommandRunner = (args, options) => {
    capturedArgs = [...args];
    capturedOptions = options;
    return Promise.resolve({
      exitCode: 0,
      stdout: JSON.stringify(identity(scope)),
      stderr: "",
    });
  };
  const executor = createB2AwsCliV2Executor(
    scope,
    successRunner,
    safeEnvironment()
  );
  const identityRequest = b2RequestTemplates(scope)[0];
  assert.ok(identityRequest);
  const response = await executor.execute(
    { kind: "primary", request: identityRequest },
    {
      signal: new AbortController().signal,
      profile: scope.awsProfile,
      region: scope.region,
    }
  );
  assert.deepEqual(response, identity(scope));
  assert.equal(capturedArgs[0], "sts");
  assert.equal(capturedOptions?.timeoutMs, 2000);
  assert.equal(capturedOptions?.maxResponseBytes, 256 * 1024);
  assert.equal(capturedOptions?.env.AWS_SHARED_CREDENTIALS_FILE, "/dev/null");
  assert.equal(
    capturedOptions?.env.AWS_IGNORE_CONFIGURED_ENDPOINT_URLS,
    "true"
  );
  assert.equal(capturedOptions?.env.AWS_MAX_ATTEMPTS, "1");
  assert.equal(capturedOptions?.env.AWS_PROFILE, undefined);
  assert.equal(capturedOptions?.env.AWS_ACCESS_KEY_ID, undefined);

  const failures: [B2AwsCliCommandResult, string][] = [
    [
      { exitCode: 254, stdout: "", stderr: "AccessDenied SECRET_SENTINEL" },
      "AWS_ACCESS_DENIED",
    ],
    [
      { exitCode: 254, stdout: "", stderr: "NoSuchBucket SECRET_SENTINEL" },
      "AWS_RESOURCE_MISSING",
    ],
    [
      { exitCode: 0, stdout: "{}", stderr: "WARNING SECRET_SENTINEL" },
      "AWS_CLI_STDERR_UNEXPECTED",
    ],
    [
      { exitCode: 0, stdout: '{"Account":', stderr: "" },
      "AWS_CLI_JSON_INVALID",
    ],
    [
      { exitCode: 0, stdout: " ".repeat(256 * 1024 + 1), stderr: "" },
      "AWS_RESPONSE_SIZE_LIMIT",
    ],
    [
      {
        exitCode: null,
        stdout: "",
        stderr: "SECRET_SENTINEL",
        processError: "TIMEOUT",
      },
      "AWS_CLI_TIMEOUT",
    ],
    [
      {
        exitCode: null,
        stdout: "",
        stderr: "SECRET_SENTINEL",
        processError: "ABORTED",
      },
      "AWS_CLI_ABORTED",
    ],
    [
      {
        exitCode: null,
        stdout: "",
        stderr: "SECRET_SENTINEL",
        processError: "NOT_FOUND",
      },
      "AWS_CLI_UNAVAILABLE",
    ],
    [
      {
        exitCode: null,
        stdout: "",
        stderr: "SECRET_SENTINEL",
        processError: "OUTPUT_LIMIT",
      },
      "AWS_CLI_OUTPUT_LIMIT",
    ],
  ];
  for (const [result, code] of failures) {
    const failingExecutor = createB2AwsCliV2Executor(
      scope,
      () => Promise.resolve(result),
      safeEnvironment()
    );
    await assert.rejects(
      failingExecutor.execute(
        { kind: "primary", request: identityRequest },
        {
          signal: new AbortController().signal,
          profile: scope.awsProfile,
          region: scope.region,
        }
      ),
      (error: unknown) =>
        error instanceof B2AwsCliFailure &&
        error.code === code &&
        !error.message.includes("SECRET_SENTINEL")
    );
  }
  const unsafeExecutor = createB2AwsCliV2Executor(scope, successRunner, {
    ...safeEnvironment(),
    AWS_PROFILE: "must-not-run",
  });
  await assert.rejects(
    unsafeExecutor.execute(
      { kind: "primary", request: identityRequest },
      {
        signal: new AbortController().signal,
        profile: scope.awsProfile,
        region: scope.region,
      }
    )
  );
});

test("execFile numeric exits classify AWS errors while infrastructure failures stay distinct", async () => {
  const scope = scopeFixture();
  const request = b2RequestTemplates(scope)[0];
  assert.ok(request);
  const cases: Array<{
    name: string;
    error: Error & { code?: string | number; killed?: boolean };
    stderr: string;
    signalAborted?: boolean;
    expected: string;
    exitCode: number | null;
    processError?: string;
  }> = [
    {
      name: "AccessDenied service response",
      error: Object.assign(new Error("Command failed"), {
        code: 254,
        killed: false,
      }),
      stderr: "An error occurred (AccessDeniedException): SECRET_SENTINEL",
      expected: "AWS_ACCESS_DENIED",
      exitCode: 254,
    },
    {
      name: "NoSuchBucket service response",
      error: Object.assign(new Error("Command failed"), {
        code: 254,
        killed: false,
      }),
      stderr: "An error occurred (NoSuchBucket): SECRET_SENTINEL",
      expected: "AWS_RESOURCE_MISSING",
      exitCode: 254,
    },
    {
      name: "timeout",
      error: Object.assign(new Error("timed out"), {
        code: "ETIMEDOUT",
        killed: true,
      }),
      stderr: "bounded timeout stderr",
      expected: "AWS_CLI_TIMEOUT",
      exitCode: null,
      processError: "TIMEOUT",
    },
    {
      name: "abort",
      error: Object.assign(new Error("aborted"), { code: "ABORT_ERR" }),
      stderr: "bounded abort stderr",
      signalAborted: true,
      expected: "AWS_CLI_ABORTED",
      exitCode: null,
      processError: "ABORTED",
    },
    {
      name: "executable not found",
      error: Object.assign(new Error("not found"), { code: "ENOENT" }),
      stderr: "",
      expected: "AWS_CLI_UNAVAILABLE",
      exitCode: null,
      processError: "NOT_FOUND",
    },
    {
      name: "output buffer limit",
      error: Object.assign(new Error("max buffer"), {
        code: "ERR_CHILD_PROCESS_STDIO_MAXBUFFER",
        killed: true,
      }),
      stderr: "",
      expected: "AWS_CLI_OUTPUT_LIMIT",
      exitCode: null,
      processError: "OUTPUT_LIMIT",
    },
    {
      name: "unexpected infrastructure error",
      error: Object.assign(new Error("permission denied"), { code: "EACCES" }),
      stderr: "PRIVATE_PATH_SECRET_SENTINEL",
      expected: "AWS_CLI_FAILED",
      exitCode: null,
      processError: "FAILED",
    },
  ];
  for (const item of cases) {
    const result = normalizeB2AwsCliProcessResult(
      item.error,
      "",
      item.stderr,
      item.signalAborted ?? false
    );
    assert.equal(result.exitCode, item.exitCode, item.name);
    assert.equal(result.processError, item.processError, item.name);
    if (item.exitCode === 254) {
      assert.equal(result.stderr, item.stderr, item.name);
    }
    const executor = createB2AwsCliV2Executor(
      scope,
      () => Promise.resolve(result),
      safeEnvironment()
    );
    await assert.rejects(
      executor.execute(
        { kind: "primary", request },
        {
          signal: new AbortController().signal,
          profile: scope.awsProfile,
          region: scope.region,
        }
      ),
      (error: unknown) =>
        error instanceof B2AwsCliFailure &&
        error.code === item.expected &&
        error.message === item.expected &&
        !error.message.includes("SECRET_SENTINEL") &&
        !error.message.includes("PRIVATE_PATH")
    );
  }
});

test("live pagination follows only bounded EventBridge and KMS cursors and merges the pages", async () => {
  const scope = scopeFixture();
  const fake = fakeExecutor(scope, (command) => {
    if (command.kind !== "primary") {
      return responseFor(command, scope);
    }
    if (command.request.operation === "sts:GetCallerIdentity") {
      return identity(scope);
    }
    if (command.request.operation === "events:ListTargetsByRule") {
      return command.pageToken
        ? { Targets: [{ Arn: scope.resourceSelectors.queueArn }] }
        : { Targets: [], NextToken: "event-next-token" };
    }
    if (command.request.operation === "kms:ListGrants") {
      return command.pageToken
        ? { Grants: [], IsTruncated: false }
        : { Grants: [], IsTruncated: true, Marker: "kms-next-marker" };
    }
    return responseFor(command, scope);
  });
  const observation = await collectB2LiveObservation(
    collectionInput(scope),
    fake.executor
  );
  const eventCalls = fake.calls.filter(
    (call) =>
      call.request.kind === "primary" &&
      call.request.request.operation === "events:ListTargetsByRule"
  );
  const kmsCalls = fake.calls.filter(
    (call) =>
      call.request.kind === "primary" &&
      call.request.request.operation === "kms:ListGrants"
  );
  assert.equal(eventCalls.length, 2);
  assert.equal(
    eventCalls[1]?.request.kind === "primary"
      ? eventCalls[1].request.pageToken
      : undefined,
    "event-next-token"
  );
  assert.equal(kmsCalls.length, 2);
  assert.equal(
    kmsCalls[1]?.request.kind === "primary"
      ? kmsCalls[1].request.pageToken
      : undefined,
    "kms-next-marker"
  );
  assert.ok(
    observation.findings.every((finding) => finding.source === "live_executor")
  );
  assert.ok(fake.calls.length <= createPlanCallLimit(scope));
});

function createPlanCallLimit(scope: B2Scope) {
  return b2RequestTemplates(scope).reduce(
    (count, request) => count + request.maxPages,
    12
  );
}

test("malformed and over-limit cursors stay incomplete and never exceed the fixed page or call limit", async () => {
  const scope = scopeFixture();
  const fake = fakeExecutor(scope, (command) => {
    if (
      command.kind === "primary" &&
      command.request.operation === "sts:GetCallerIdentity"
    ) {
      return identity(scope);
    }
    if (
      command.kind === "primary" &&
      command.request.operation === "events:ListTargetsByRule"
    ) {
      return {
        Targets: [],
        NextToken: command.pageToken ? "next" : "--profile",
      };
    }
    if (
      command.kind === "primary" &&
      command.request.operation === "kms:ListGrants"
    ) {
      return {
        Grants: [],
        IsTruncated: true,
        Marker: `marker-${command.pageToken ?? "first"}`,
      };
    }
    return responseFor(command, scope);
  });
  const observation = await collectB2LiveObservation(
    collectionInput(scope),
    fake.executor
  );
  assert.equal(
    fake.calls.filter(
      (call) => operationOf(call) === "events:ListTargetsByRule"
    ).length,
    1
  );
  assert.equal(
    fake.calls.filter((call) => operationOf(call) === "kms:ListGrants").length,
    3
  );
  assert.ok(
    observation.findings.some(
      (finding) =>
        finding.requirement === "events:listtargetsbyrule" &&
        finding.status === "INCOMPLETE"
    )
  );
  assert.ok(
    observation.findings.some(
      (finding) =>
        finding.requirement === "kms:listgrants" &&
        finding.reasonCode === "PAGINATION_INCOMPLETE"
    )
  );
  assert.ok(fake.calls.length <= createPlanCallLimit(scope));
});

test("IAM dependent inspection caps inline, managed-policy, and version lookups at four each", async () => {
  const scope = scopeFixture();
  const attached = Array.from({ length: 6 }, (_, index) => ({
    PolicyArn: `arn:aws:iam::123456789012:policy/ManagedPolicy${index}`,
  }));
  const fake = fakeExecutor(scope, (command) => {
    if (
      command.kind === "primary" &&
      command.request.operation === "sts:GetCallerIdentity"
    ) {
      return identity(scope);
    }
    if (
      command.kind === "primary" &&
      command.request.operation === "iam:ListRolePolicies"
    ) {
      return {
        PolicyNames: ["Inline1", "Inline2", "Inline3", "Inline4", "Inline5"],
      };
    }
    if (
      command.kind === "primary" &&
      command.request.operation === "iam:ListAttachedRolePolicies"
    ) {
      return { AttachedPolicies: attached };
    }
    return responseFor(command, scope);
  });
  const observation = await collectB2LiveObservation(
    collectionInput(scope),
    fake.executor
  );
  assert.equal(
    fake.calls.filter((call) => operationOf(call) === "iam:GetRolePolicy")
      .length,
    4
  );
  assert.equal(
    fake.calls.filter((call) => operationOf(call) === "iam:GetPolicy").length,
    4
  );
  assert.equal(
    fake.calls.filter((call) => operationOf(call) === "iam:GetPolicyVersion")
      .length,
    4
  );
  assert.ok(fake.calls.length <= createPlanCallLimit(scope));
  assert.ok(
    observation.findings.some(
      (finding) =>
        finding.reasonCode === "IAM_INLINE_POLICY_LIMIT_OR_TRUNCATION"
    )
  );
  assert.ok(
    observation.findings.some(
      (finding) =>
        finding.reasonCode === "IAM_ATTACHED_POLICY_LIMIT_OR_TRUNCATION"
    )
  );
  assert.ok(
    observation.findings.every((finding) => finding.source === "live_executor")
  );
  assert.equal(observation.liveDecision, "NO_GO");
});

test("pre-aborted collection performs no command and preserves the unconditional NO_GO report", async () => {
  const scope = scopeFixture();
  const fake = fakeExecutor(scope);
  const controller = new AbortController();
  controller.abort();
  const observation = await collectB2LiveObservation(
    { ...collectionInput(scope), signal: controller.signal },
    fake.executor
  );
  assert.equal(fake.calls.length, 0);
  assert.equal(observation.liveDecision, "NO_GO");
  assert.ok(
    observation.findings.some(
      (finding) => finding.reasonCode === "AWS_CLI_ABORTED"
    )
  );
});

test("bounded request timeout and cancellation stop before any resource request", async () => {
  const scope = scopeFixture();
  const timeoutFake = fakeExecutor(
    scope,
    () =>
      new Promise<never>(() => {
        // Deliberately pending until the bounded executor aborts it.
      })
  );
  const timedOut = await collectB2LiveObservation(
    collectionInput(scope),
    timeoutFake.executor
  );
  assert.equal(timeoutFake.calls.length, 1);
  const timedOutFirstCall = timeoutFake.calls[0];
  assert.ok(timedOutFirstCall);
  assert.equal(operationOf(timedOutFirstCall), "sts:GetCallerIdentity");
  assert.ok(
    timedOut.findings.some(
      (finding) => finding.reasonCode === "AWS_CLI_TIMEOUT"
    )
  );
  assert.equal(timedOut.liveDecision, "NO_GO");

  const controller = new AbortController();
  const cancelledFake = fakeExecutor(scope, () => {
    setTimeout(() => controller.abort(), 10);
    return new Promise<never>(() => {
      // Deliberately pending until the injected cancellation aborts it.
    });
  });
  const cancelled = await collectB2LiveObservation(
    { ...collectionInput(scope), signal: controller.signal },
    cancelledFake.executor
  );
  assert.equal(cancelledFake.calls.length, 1);
  assert.ok(
    cancelled.findings.some(
      (finding) => finding.reasonCode === "AWS_CLI_ABORTED"
    )
  );
  assert.equal(cancelled.liveDecision, "NO_GO");
});

test("AccessDenied and missing-resource failures become redacted incomplete findings", async () => {
  const scope = scopeFixture();
  const fake = fakeExecutor(scope, (command) => {
    if (
      command.kind === "primary" &&
      command.request.operation === "sts:GetCallerIdentity"
    ) {
      return identity(scope);
    }
    if (
      command.kind === "primary" &&
      command.request.operation === "s3:GetBucketVersioning"
    ) {
      throw new B2AwsCliFailure("AWS_RESOURCE_MISSING");
    }
    if (
      command.kind === "primary" &&
      command.request.operation === "s3:GetPublicAccessBlock"
    ) {
      throw new B2AwsCliFailure("AWS_ACCESS_DENIED");
    }
    return responseFor(command, scope);
  });
  const observation = await collectB2LiveObservation(
    collectionInput(scope),
    fake.executor
  );
  const serialized = JSON.stringify(observation);
  assert.ok(
    observation.findings.some(
      (finding) => finding.reasonCode === "AWS_RESOURCE_MISSING"
    )
  );
  assert.ok(
    observation.findings.some(
      (finding) => finding.reasonCode === "AWS_ACCESS_DENIED"
    )
  );
  assert.doesNotMatch(
    serialized,
    /AccessDenied|NoSuchBucket|raw stderr|POLICY_SECRET/u
  );
  assert.equal(observation.liveDecision, "NO_GO");
});

test("private report writer refuses repository paths and existing files, and writes mode 0600 outside the repository", async () => {
  const fixture = await cliFixture();
  try {
    await assert.rejects(
      createB2PrivateReportWriter(
        join(fixture.repositoryRoot, "inside.json"),
        fixture.repositoryRoot,
        fixture.root
      )
    );
    const existingPath = join(fixture.external, "existing.json");
    await writeFile(existingPath, "OWNER_FILE_MUST_REMAIN");
    await assert.rejects(
      createB2PrivateReportWriter(
        existingPath,
        fixture.repositoryRoot,
        fixture.root
      )
    );
    const symlinkPath = join(fixture.external, "symlink-report.json");
    await symlink(existingPath, symlinkPath);
    await assert.rejects(
      createB2PrivateReportWriter(
        symlinkPath,
        fixture.repositoryRoot,
        fixture.root
      )
    );
    assert.equal(
      await readFile(existingPath, "utf8"),
      "OWNER_FILE_MUST_REMAIN"
    );

    const writer = await createB2PrivateReportWriter(
      fixture.reportPath,
      fixture.repositoryRoot,
      fixture.root
    );
    const fake = fakeExecutor(fixture.scope);
    const observation = await collectB2LiveObservation(
      collectionInput(fixture.scope),
      fake.executor
    );
    await writer.write(observation);
    await writer.close();
    const info = await stat(fixture.reportPath);
    assert.equal(info.mode & 0o777, 0o600);
    assert.equal(
      isB2Observation(JSON.parse(await readFile(fixture.reportPath, "utf8"))),
      true
    );
  } finally {
    await cleanFixture(fixture.root);
  }
});

test("operator CLI writes one sanitized no-go report only after all preflight gates and fake STS", async () => {
  const fixture = await cliFixture();
  try {
    const result = await runB2LiveCli(cliArgs(fixture), fixture.dependencies);
    assert.equal(result.exitCode, 1);
    assert.match(result.stdout, /callerIdentity=VERIFIED/u);
    assert.match(result.stdout, /evidenceCollection=INCOMPLETE/u);
    assert.equal(fixture.calls[0]?.[0], "sts");
    assert.ok(fixture.calls.length > 1);
    const report = await readFile(fixture.reportPath, "utf8");
    const parsed = JSON.parse(report) as Record<string, unknown>;
    assert.equal(parsed.liveDecision, "NO_GO");
    assert.equal(parsed.requiresLiveOwnerVerification, true);
    assert.doesNotMatch(
      report,
      /POLICY_SECRET_DO_NOT_LEAK|123456789012|Phase13ReadOnly|queueUrl/u
    );
    assert.equal((await stat(fixture.reportPath)).mode & 0o777, 0o600);
  } finally {
    await cleanFixture(fixture.root);
  }
});

test("CLI wrong identity calls only STS, writes a no-go report, and leaks neither account nor caller ARN", async () => {
  const fixture = await cliFixture();
  try {
    fixture.dependencies.commandRunner = (args) => {
      fixture.calls.push([...args]);
      return Promise.resolve({
        exitCode: 0,
        stdout: JSON.stringify({
          Account: "000000000000",
          Arn: "arn:aws:sts::000000000000:assumed-role/wrong/session",
        }),
        stderr: "",
      });
    };
    const result = await runB2LiveCli(cliArgs(fixture), fixture.dependencies);
    assert.equal(result.exitCode, 3);
    assert.match(result.stdout, /SANITIZED_REPORT_WRITTEN/u);
    assert.match(result.stdout, /callerIdentity=REJECTED/u);
    assert.match(result.stdout, /evidenceCollection=STOPPED/u);
    assert.equal(fixture.calls.length, 1);
    assert.equal(fixture.calls[0]?.[0], "sts");
    const report = await readFile(fixture.reportPath, "utf8");
    assert.match(report, /NO_GO/u);
    assert.doesNotMatch(report, /000000000000|wrong\/session/u);
  } finally {
    await cleanFixture(fixture.root);
  }
});

test("CLI records an expired authorization after preflight without invoking STS", async () => {
  const fixture = await cliFixture();
  try {
    let clockCalls = 0;
    fixture.dependencies.now = () => {
      clockCalls += 1;
      return clockCalls === 1
        ? now
        : Date.parse(approvalFixture(fixture.scope).expiresAt);
    };
    const result = await runB2LiveCli(cliArgs(fixture), fixture.dependencies);
    assert.equal(result.exitCode, 4);
    assert.match(result.stdout, /callerIdentity=UNVERIFIED/u);
    assert.equal(fixture.calls.length, 0);
    const report = JSON.parse(await readFile(fixture.reportPath, "utf8")) as {
      findings: Array<{ reasonCode: string }>;
      liveDecision: string;
    };
    assert.equal(report.liveDecision, "NO_GO");
    assert.ok(
      report.findings.some(
        (entry) => entry.reasonCode === "APPROVAL_EXPIRED_DURING_COLLECTION"
      )
    );
  } finally {
    await cleanFixture(fixture.root);
  }
});

test("CLI missing, invalid, expired, mismatched, or unsafe output inputs never invoke the fake runner", async () => {
  const fixture = await cliFixture();
  try {
    const cases: string[][] = [
      cliArgs(fixture).filter(
        (argument) =>
          argument !== "--scope-path" && argument !== fixture.scopePath
      ),
      cliArgs(fixture).filter(
        (argument) =>
          argument !== "--approval-path" && argument !== fixture.approvalPath
      ),
      cliArgs(fixture).map((argument) =>
        argument === fixture.scope.approvedAccountId ? "000000000000" : argument
      ),
      [...cliArgs(fixture), "--extra", "value"],
    ];
    for (const args of cases) {
      const result = await runB2LiveCli(args, fixture.dependencies);
      assert.equal(result.exitCode, 2);
    }
    const missingApprovalFile = cliArgs(fixture).map((argument) =>
      argument === fixture.approvalPath
        ? join(fixture.external, "missing-approval.json")
        : argument
    );
    assert.equal(
      (await runB2LiveCli(missingApprovalFile, fixture.dependencies)).exitCode,
      2
    );
    const expired = approvalFixture(fixture.scope);
    expired.expiresAt = new Date(now - 1).toISOString();
    await writeFile(fixture.approvalPath, JSON.stringify(expired));
    assert.equal(
      (await runB2LiveCli(cliArgs(fixture), fixture.dependencies)).exitCode,
      2
    );
    await writeFile(
      fixture.approvalPath,
      JSON.stringify(approvalFixture(fixture.scope))
    );
    const unsafeReportArgs = cliArgs(fixture).map((argument) =>
      argument === fixture.reportPath
        ? join(fixture.repositoryRoot, "report.json")
        : argument
    );
    assert.equal(
      (await runB2LiveCli(unsafeReportArgs, fixture.dependencies)).exitCode,
      2
    );
    assert.equal(fixture.calls.length, 0);
  } finally {
    await cleanFixture(fixture.root);
  }
});

test("live provenance cannot be relabeled as fixture evidence, while B1 bridge still rejects fixture/live mismatch", async () => {
  const scope = scopeFixture();
  const fake = fakeExecutor(scope);
  const observation = await collectB2LiveObservation(
    collectionInput(scope),
    fake.executor
  );
  const relabeled = {
    ...observation,
    findings: observation.findings.map((finding) => ({
      ...finding,
      source: "fixture_executor",
    })),
  };
  assert.equal(isB2Observation(relabeled), false);
  assert.throws(
    () =>
      evaluateB2SnapshotWithB1(observation, {
        schema: PROJECT_DOCUMENT_AWS_SECURITY_EVIDENCE_SCHEMA,
        source: "fixture",
        findings: [],
      }),
    /B2_B1_PROVENANCE_MISMATCH/u
  );
});

test("operator entry import is inert and the B2-0 plan/refusal regression remains intact", async () => {
  await import("../../../../scripts/phase13-b2-1-aws-readonly");
  const fixture = await cliFixture();
  try {
    assert.equal(
      (await runB2LiveCli(["--help"], fixture.dependencies)).exitCode,
      0
    );
    assert.equal(
      (await runB2LiveCli(["--collect-read-only"], fixture.dependencies))
        .exitCode,
      2
    );
    assert.equal(fixture.calls.length, 0);
  } finally {
    await cleanFixture(fixture.root);
  }
});
