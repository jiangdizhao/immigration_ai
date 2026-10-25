import assert from "node:assert/strict";
import test from "node:test";
import { evaluateProjectDocumentAwsSecurityEvidence } from "./evaluator";
import type { ProjectDocumentAwsSecurityEvidenceV1 } from "./types";
import { PROJECT_DOCUMENT_AWS_SECURITY_EVIDENCE_SCHEMA } from "./types";

const accountId = "123456789012";
const region = "ap-southeast-2";
const bucketArn = `arn:aws:s3:::phase13-project-documents-${accountId}`;
const bucketPrefix = "project-document/";
const planArn = `arn:aws:guardduty:${region}:${accountId}:malware-protection-plan/plan-12345678`;
const eventRuleArn = `arn:aws:events:${region}:${accountId}:rule/project-document-scan`;
const eventBusArn = `arn:aws:events:${region}:${accountId}:event-bus/default`;
const queueArn = `arn:aws:sqs:${region}:${accountId}:project-document-scan`;
const dlqArn = `arn:aws:sqs:${region}:${accountId}:project-document-scan-dlq`;
const workerRoleArn = `arn:aws:iam::${accountId}:role/project-document-worker`;
const kmsKeyArn = `arn:aws:kms:${region}:${accountId}:key/11111111-2222-4333-8444-555555555555`;

function fixture(): ProjectDocumentAwsSecurityEvidenceV1 {
  return {
    schema: PROJECT_DOCUMENT_AWS_SECURITY_EVIDENCE_SCHEMA,
    capturedAt: "2026-10-25T01:02:03.000Z",
    environment: "sandbox",
    source: "fixture",
    expected: {
      accountId,
      partition: "aws",
      region,
      bucketArn,
      bucketPrefix,
      planArn,
      scanPlanRoleArn: `arn:aws:iam::${accountId}:role/guardduty-scan-plan`,
      eventRuleArn,
      eventBusArn,
      queueArn,
      dlqArn,
      workerRoleArn,
      kmsKeyArn,
    },
    observed: {
      account: { accountId, partition: "aws", region },
      bucket: {
        arn: bucketArn,
        ownerAccountId: accountId,
        region,
        prefix: bucketPrefix,
        versioning: "Enabled",
        publicAccessBlocked: true,
        encryption: "SSE_KMS",
        kmsKeyArn,
      },
      guardDutyPlan: {
        arn: planArn,
        status: "ACTIVE",
        accountId,
        region,
        roleArn: `arn:aws:iam::${accountId}:role/guardduty-scan-plan`,
        bucketArn,
        prefix: bucketPrefix,
      },
      eventBridge: {
        ruleArn: eventRuleArn,
        eventBusArn,
        enabled: true,
        source: ["aws.guardduty"],
        detailType: ["GuardDuty Malware Protection Object Scan Result"],
        account: [accountId],
        region: [region],
        planArns: [planArn],
        targetArns: [queueArn],
        ruleMutationPrincipals: [],
        putEventsPrincipals: [],
      },
      queue: {
        arn: queueArn,
        region,
        dlqArn,
        encryptionKeyArn: kmsKeyArn,
        resourcePolicy: {
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Principal: { Service: "events.amazonaws.com" },
              Action: "sqs:SendMessage",
              Resource: queueArn,
              Condition: {
                ArnEquals: { "aws:SourceArn": eventRuleArn },
                StringEquals: { "aws:SourceAccount": accountId },
              },
            },
          ],
        },
        directSendMessagePrincipals: ["events.amazonaws.com"],
        queueMutationPrincipals: [],
      },
      worker: {
        roleArn: workerRoleArn,
        permissionsPolicy: {
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Action: ["sqs:ReceiveMessage", "sqs:DeleteMessage"],
              Resource: queueArn,
            },
          ],
        },
        permissionsBoundaryArn: `arn:aws:iam::${accountId}:policy/project-document-worker-boundary`,
        policySnapshotComplete: true,
        principalsInventoryComplete: true,
        unexpectedPrincipals: [],
        passRolePrincipals: [],
      },
      kms: {
        keyArn: kmsKeyArn,
        keyPolicy: {
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Principal: {
                AWS: [
                  workerRoleArn,
                  `arn:aws:iam::${accountId}:role/guardduty-scan-plan`,
                ],
              },
              Action: "kms:Decrypt",
              Resource: kmsKeyArn,
            },
          ],
        },
        decryptPrincipals: [
          workerRoleArn,
          `arn:aws:iam::${accountId}:role/guardduty-scan-plan`,
        ],
        grantPrincipals: [],
        grantsReviewed: true,
      },
      databaseRole: {
        migrationRoleSeparated: true,
        runtimeIsSuperuser: false,
        runtimeOwnsProtectedTables: false,
        runtimeCanTruncateOrAlter: false,
        auditMutationLimited: true,
      },
      unknownSurfaces: [],
    },
  };
}

function finding(
  report: ReturnType<typeof evaluateProjectDocumentAwsSecurityEvidence>,
  requirement: string
) {
  const result = report.findings.find(
    (item) => item.requirement === requirement
  );
  if (!result) {
    throw new Error(`missing finding: ${requirement}`);
  }
  return result;
}

test("static readiness checks scoped evidence but always reports live NO-GO", () => {
  const report = evaluateProjectDocumentAwsSecurityEvidence(fixture());
  assert.equal(report.staticPolicyAssessment, "NO_GO");
  assert.equal(report.requires_live_owner_verification, true);
  assert.equal(finding(report, "s3_versioning").result, "PASS");
  assert.equal(finding(report, "sqs_resource_policy").result, "PASS");
  assert.equal(finding(report, "worker_iam_snapshot").result, "PASS");
  assert.equal(finding(report, "kms_key_policy").result, "PASS");
  assert.equal(finding(report, "kms_permissions").result, "PASS");
  assert.equal(finding(report, "database_runtime_role").result, "PASS");
  assert.equal(
    finding(report, "live_origin_and_effective_permissions").result,
    "INCOMPLETE"
  );
  assert.equal(report.staticPolicyAssessment, "NO_GO");
  assert.equal(report.requires_live_owner_verification, true);
});

test("spoofed account and resource metadata fails exact scope comparisons", () => {
  const input = fixture();
  input.observed.account.accountId = "999999999999";
  const report = evaluateProjectDocumentAwsSecurityEvidence(input);
  assert.equal(finding(report, "account_partition_region").result, "FAIL");
  assert.ok(
    finding(report, "account_partition_region").reasonCodes.includes(
      "ACCOUNT_PARTITION_REGION_MISMATCH"
    )
  );
});

test("wildcard IAM action/resource is a fail-closed policy failure", () => {
  const input = fixture();
  input.observed.worker.permissionsPolicy = {
    Version: "2012-10-17",
    Statement: [{ Effect: "Allow", Action: "*", Resource: "*" }],
  };
  const report = evaluateProjectDocumentAwsSecurityEvidence(input);
  assert.equal(finding(report, "worker_iam_snapshot").result, "FAIL");
  assert.ok(
    finding(report, "worker_iam_snapshot").reasonCodes.includes(
      "POLICY_WILDCARD_PERMISSION"
    )
  );
});

test("worker direct SendMessage and matching-bus PutEvents permissions fail", () => {
  for (const [action, resource] of [
    ["sqs:SendMessage", queueArn],
    ["events:PutEvents", eventBusArn],
  ]) {
    const input = fixture();
    input.observed.worker.permissionsPolicy = {
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Action: action,
          Resource: resource,
        },
      ],
    };
    const report = evaluateProjectDocumentAwsSecurityEvidence(input);
    assert.equal(finding(report, "worker_iam_snapshot").result, "FAIL");
    assert.ok(
      finding(report, "worker_iam_snapshot").reasonCodes.includes(
        "BROAD_WORKER_PERMISSION"
      )
    );
  }
});

test("unexpected IAM principals and PassRole surfaces fail security assessment", () => {
  const input = fixture();
  input.observed.worker.unexpectedPrincipals = [
    "arn:aws:iam::999999999999:role/unreviewed",
  ];
  input.observed.worker.passRolePrincipals = [
    "arn:aws:iam::123456789012:role/unreviewed",
  ];
  const report = evaluateProjectDocumentAwsSecurityEvidence(input);
  assert.equal(finding(report, "worker_iam_snapshot").result, "FAIL");
  assert.equal(
    finding(report, "event_injection_and_policy_mutation").result,
    "FAIL"
  );
});

test("wildcard and cross-principal SQS SendMessage grants fail closed", () => {
  const input = fixture();
  input.observed.queue.resourcePolicy = {
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: "*",
        Action: "sqs:SendMessage",
        Resource: queueArn,
      },
    ],
  };
  input.observed.queue.directSendMessagePrincipals = ["*"];
  const report = evaluateProjectDocumentAwsSecurityEvidence(input);
  assert.equal(finding(report, "sqs_resource_policy").result, "FAIL");
  assert.ok(
    finding(report, "sqs_resource_policy").reasonCodes.includes(
      "POLICY_WILDCARD_PERMISSION"
    )
  );

  for (const [action, resource] of [
    ["sqs:*", queueArn],
    ["sqs:SendMessage", "*"],
  ]) {
    const broadInput = fixture();
    broadInput.observed.queue.resourcePolicy = {
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Principal: { Service: "events.amazonaws.com" },
          Action: action,
          Resource: resource,
        },
      ],
    };
    const broadReport = evaluateProjectDocumentAwsSecurityEvidence(broadInput);
    assert.equal(finding(broadReport, "sqs_resource_policy").result, "FAIL");
    assert.ok(
      finding(broadReport, "sqs_resource_policy").reasonCodes.includes(
        "POLICY_WILDCARD_PERMISSION"
      )
    );
  }
});

test("SQS EventBridge grants preserve IAM Principal category", () => {
  const valid = fixture();
  assert.equal(
    finding(
      evaluateProjectDocumentAwsSecurityEvidence(valid),
      "sqs_resource_policy"
    ).result,
    "PASS"
  );

  const invalidPrincipals: unknown[] = [
    { AWS: "events.amazonaws.com" },
    { Federated: "events.amazonaws.com" },
    { Service: "events.amazonaws.com", AWS: "events.amazonaws.com" },
    { Service: "events.amazonaws.com", Unexpected: "example" },
    "events.amazonaws.com",
  ];
  for (const principal of invalidPrincipals) {
    const input = fixture();
    const policy = input.observed.queue.resourcePolicy as {
      Statement: Record<string, unknown>[];
    };
    const statement = policy.Statement[0];
    assert.ok(statement);
    statement.Principal = principal;
    const report = evaluateProjectDocumentAwsSecurityEvidence(input);
    assert.notEqual(finding(report, "sqs_resource_policy").result, "PASS");
    assert.equal(report.staticPolicyAssessment, "NO_GO");
    assert.equal(report.requires_live_owner_verification, true);
  }
});

test("extra or broadened EventBridge source conditions cannot pass the queue policy check", () => {
  const extraAccount = fixture();
  const accountPolicy = extraAccount.observed.queue.resourcePolicy as {
    Statement: Record<string, unknown>[];
  };
  const accountStatement = accountPolicy.Statement[0];
  assert.ok(accountStatement);
  accountStatement.Condition = {
    ArnEquals: { "aws:SourceArn": eventRuleArn },
    StringEquals: { "aws:SourceAccount": [accountId, "999999999999"] },
  };
  const accountReport =
    evaluateProjectDocumentAwsSecurityEvidence(extraAccount);
  assert.notEqual(finding(accountReport, "sqs_resource_policy").result, "PASS");
  assert.equal(accountReport.staticPolicyAssessment, "NO_GO");
  assert.equal(accountReport.requires_live_owner_verification, true);

  const unsupportedBroadening = fixture();
  const broadPolicy = unsupportedBroadening.observed.queue.resourcePolicy as {
    Statement: Record<string, unknown>[];
  };
  const broadStatement = broadPolicy.Statement[0];
  assert.ok(broadStatement);
  broadStatement.Condition = {
    ArnEquals: { "aws:SourceArn": eventRuleArn },
    ArnLike: { "aws:SourceArn": "*" },
    StringEquals: { "aws:SourceAccount": accountId },
  };
  const broadReport = evaluateProjectDocumentAwsSecurityEvidence(
    unsupportedBroadening
  );
  assert.notEqual(finding(broadReport, "sqs_resource_policy").result, "PASS");
  assert.ok(
    finding(broadReport, "sqs_resource_policy").reasonCodes.includes(
      "POLICY_SEMANTICS_UNSUPPORTED"
    )
  );
  assert.equal(broadReport.staticPolicyAssessment, "NO_GO");
  assert.equal(broadReport.requires_live_owner_verification, true);
});

test("exact cross-account SQS SendMessage grant is reported as unexpected", () => {
  const input = fixture();
  input.observed.queue.resourcePolicy = {
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: { AWS: "arn:aws:iam::999999999999:role/other-account" },
        Action: "sqs:SendMessage",
        Resource: queueArn,
      },
    ],
  };
  const report = evaluateProjectDocumentAwsSecurityEvidence(input);
  assert.equal(finding(report, "sqs_resource_policy").result, "FAIL");
  assert.ok(
    finding(report, "sqs_resource_policy").reasonCodes.includes(
      "QUEUE_DIRECT_SEND_PRINCIPAL_UNEXPECTED"
    )
  );
});

test("multiple SourceArn values and unexpected KMS policy principals fail closed", () => {
  const queueInput = fixture();
  const queuePolicy = queueInput.observed.queue.resourcePolicy as {
    Statement: Record<string, unknown>[];
  };
  const queueStatement = queuePolicy.Statement[0];
  assert.ok(queueStatement);
  queueStatement.Condition = {
    ArnEquals: {
      "aws:SourceArn": [
        eventRuleArn,
        `arn:aws:events:${region}:${accountId}:rule/other`,
      ],
    },
    StringEquals: { "aws:SourceAccount": accountId },
  };
  assert.equal(
    finding(
      evaluateProjectDocumentAwsSecurityEvidence(queueInput),
      "sqs_resource_policy"
    ).result,
    "FAIL"
  );

  const kmsInput = fixture();
  const keyPolicy = kmsInput.observed.kms.keyPolicy as {
    Statement: Record<string, unknown>[];
  };
  const keyStatement = keyPolicy.Statement[0];
  assert.ok(keyStatement);
  const principal = keyStatement.Principal as { AWS: string[] };
  principal.AWS.push("arn:aws:iam::999999999999:role/unexpected-kms-reader");
  const report = evaluateProjectDocumentAwsSecurityEvidence(kmsInput);
  assert.equal(finding(report, "kms_key_policy").result, "FAIL");
  assert.ok(
    finding(report, "kms_key_policy").reasonCodes.includes(
      "UNEXPECTED_KMS_KEY_POLICY_PRINCIPAL"
    )
  );
});

test("matching EventBridge bus PutEvents grant is an injection risk", () => {
  const input = fixture();
  input.observed.eventBridge.putEventsPrincipals = [
    "arn:aws:iam::123456789012:role/event-publisher",
  ];
  const report = evaluateProjectDocumentAwsSecurityEvidence(input);
  assert.equal(
    finding(report, "event_injection_and_policy_mutation").result,
    "FAIL"
  );
  assert.ok(
    finding(report, "event_injection_and_policy_mutation").reasonCodes.includes(
      "EVENT_BUS_PUT_EVENTS_PRINCIPAL_PRESENT"
    )
  );
});

test("unrestricted PostgreSQL runtime role evidence fails the audit boundary", () => {
  const input = fixture();
  input.observed.databaseRole.runtimeIsSuperuser = true;
  const report = evaluateProjectDocumentAwsSecurityEvidence(input);
  assert.equal(finding(report, "database_runtime_role").result, "FAIL");
  assert.ok(
    finding(report, "database_runtime_role").reasonCodes.includes(
      "DB_RUNTIME_ROLE_SUPERUSER"
    )
  );
});

test("unsupported policy condition semantics are incomplete, not assumed safe", () => {
  const input = fixture();
  const policy = input.observed.queue.resourcePolicy as {
    Statement: Record<string, unknown>[];
  };
  const statement = policy.Statement[0];
  assert.ok(statement);
  statement.Condition = {
    StringLike: { "aws:SourceArn": eventRuleArn },
  };
  const report = evaluateProjectDocumentAwsSecurityEvidence(input);
  assert.equal(finding(report, "sqs_resource_policy").result, "INCOMPLETE");
  assert.ok(
    finding(report, "sqs_resource_policy").reasonCodes.includes(
      "POLICY_SEMANTICS_UNSUPPORTED"
    )
  );
});

test("missing evidence returns bounded INCOMPLETE report without echoing supplied data", () => {
  const report = evaluateProjectDocumentAwsSecurityEvidence({
    schema: PROJECT_DOCUMENT_AWS_SECURITY_EVIDENCE_SCHEMA,
    source: "fixture",
    environment: "sandbox",
    capturedAt: "2026-10-25T01:02:03.000Z",
    secretMarker: "do-not-echo-raw-policy-or-arn",
  });
  assert.equal(report.staticPolicyAssessment, "NO_GO");
  assert.equal(report.findings[0]?.result, "INCOMPLETE");
  assert.equal(JSON.stringify(report).includes("do-not-echo"), false);
  assert.equal(JSON.stringify(report).includes(accountId), false);
});

test("cyclic and oversized non-JSON evidence fails before policy traversal", () => {
  const cyclic = fixture() as unknown as Record<string, unknown>;
  cyclic.self = cyclic;
  assert.equal(
    evaluateProjectDocumentAwsSecurityEvidence(cyclic).findings[0]?.result,
    "INCOMPLETE"
  );

  const oversized = fixture() as unknown as Record<string, unknown>;
  oversized.unused = "x".repeat(2049);
  const report = evaluateProjectDocumentAwsSecurityEvidence(oversized);
  assert.equal(report.findings[0]?.result, "INCOMPLETE");
  assert.equal(JSON.stringify(report).includes("xxxx"), false);
});

test("wildcard expected scope, duplicate policy statements, and malformed required arrays fail closed", () => {
  const wildcardScope = fixture();
  wildcardScope.expected.planArn = `arn:aws:guardduty:${region}:${accountId}:malware-protection-plan/*`;
  assert.equal(
    evaluateProjectDocumentAwsSecurityEvidence(wildcardScope).findings[0]
      ?.result,
    "INCOMPLETE"
  );

  const duplicatePolicy = fixture();
  const policy = duplicatePolicy.observed.queue.resourcePolicy as {
    Statement: Record<string, unknown>[];
  };
  policy.Statement.push(
    JSON.parse(JSON.stringify(policy.Statement[0])) as Record<string, unknown>
  );
  assert.equal(
    finding(
      evaluateProjectDocumentAwsSecurityEvidence(duplicatePolicy),
      "sqs_resource_policy"
    ).result,
    "INCOMPLETE"
  );

  const malformedArray = fixture() as unknown as {
    observed: { eventBridge: Record<string, unknown> };
  };
  malformedArray.observed.eventBridge.source = null;
  assert.equal(
    evaluateProjectDocumentAwsSecurityEvidence(malformedArray).findings[0]
      ?.result,
    "INCOMPLETE"
  );
});
