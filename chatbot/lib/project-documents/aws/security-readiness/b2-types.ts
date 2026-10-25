import "server-only";

export const PROJECT_DOCUMENT_AWS_B2_OBSERVATION_SCHEMA =
  "phase13.project_document.aws_b2_observation.v1" as const;

export type B2ResourceSelectors = {
  bucket: string;
  projectDocumentPrefix: "project-document/";
  guardDutyPlanId: string;
  guardDutyPlanArn: string;
  eventBusName: "default";
  eventBusArn: string;
  eventRuleName: string;
  eventRuleArn: string;
  queueName: string;
  queueArn: string;
  queueUrl: string;
  dlqArn: string;
  applicationRoleArn: string;
  kmsKeyArn: string | null;
};

export type B2Scope = {
  schema: "phase13.project_document.aws_b2_scope.v1";
  environment: "isolated_sandbox";
  approvedAccountId: string;
  region: string;
  partition: "aws" | "aws-us-gov" | "aws-cn";
  awsProfile: string;
  expectedCallerArn: string;
  resourceSelectors: B2ResourceSelectors;
};

export type B2ApprovalRecord = {
  schema: "phase13.project_document.aws_b2_approval.v1";
  approvalId: string;
  approvedAt: string;
  expiresAt: string;
  approvedScope: B2Scope;
  scope: "read_only";
  acknowledgements: {
    nonproductionOnly: true;
    noMutation: true;
    noObjectAccess: true;
    noMessageConsumption: true;
  };
};

export const B2_READ_ONLY_OPERATIONS = [
  "sts:GetCallerIdentity",
  "s3:GetBucketLocation",
  "s3:GetBucketVersioning",
  "s3:GetPublicAccessBlock",
  "s3:GetBucketEncryption",
  "s3:GetBucketPolicyStatus",
  "s3:GetBucketPolicy",
  "guardduty:GetMalwareProtectionPlan",
  "events:DescribeEventBus",
  "events:DescribeRule",
  "events:ListTargetsByRule",
  "sqs:GetQueueAttributes",
  "iam:GetRole",
  "iam:ListAttachedRolePolicies",
  "iam:ListRolePolicies",
  "iam:GetRolePolicy",
  "iam:GetPolicy",
  "iam:GetPolicyVersion",
  "kms:DescribeKey",
  "kms:GetKeyPolicy",
  "kms:ListGrants",
] as const;

export type B2ReadOnlyOperation = (typeof B2_READ_ONLY_OPERATIONS)[number];

export type B2ReadOnlyRequest = {
  readonly operation: B2ReadOnlyOperation;
  readonly input: Readonly<Record<string, string | number | string[]>>;
  readonly maxPages: number;
  readonly maxResponseBytes: number;
  readonly timeoutMs: number;
  readonly maxAttempts: 1;
};

export type B2FindingStatus = "PASS" | "FAIL" | "INCOMPLETE";

export type B2ObservationFinding = {
  requirement: string;
  source: "plan" | "fixture_executor";
  status: B2FindingStatus;
  reasonCode: string;
  observedAt: string;
  evidenceFingerprint: string | null;
  outstandingAction: string;
};

export type B2Observation = {
  schema: typeof PROJECT_DOCUMENT_AWS_B2_OBSERVATION_SCHEMA;
  source: "fixture" | "live_operator_readonly";
  scopeFingerprint: string | null;
  findings: B2ObservationFinding[];
  liveDecision: "NO_GO";
  requiresLiveOwnerVerification: true;
  limitation: string;
};

/** This executor is used only by offline fixtures; no real executor ships here. */
export interface B2FixtureExecutor {
  readonly kind: "fixture_only";
  execute(
    request: B2ReadOnlyRequest,
    options: { signal: AbortSignal; profile: string; region: string }
  ): Promise<unknown>;
}
