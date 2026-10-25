import "server-only";

export const PROJECT_DOCUMENT_AWS_SECURITY_EVIDENCE_SCHEMA =
  "phase13.project_document.aws_security_evidence.v1" as const;

export type AwsPolicyDocument = {
  Version: string;
  Statement: AwsPolicyStatement[];
};

export type AwsPolicyStatement = {
  Effect: "Allow" | "Deny";
  Action: string | string[];
  Resource: string | string[];
  Principal?: string | Record<string, string | string[]>;
  Condition?: Record<string, Record<string, string | string[]>>;
  [key: string]: unknown;
};

export type ProjectDocumentAwsSecurityEvidenceV1 = {
  schema: typeof PROJECT_DOCUMENT_AWS_SECURITY_EVIDENCE_SCHEMA;
  capturedAt: string;
  environment: "sandbox";
  source: "operator_export" | "fixture";
  expected: {
    accountId: string;
    partition: string;
    region: string;
    bucketArn: string;
    bucketPrefix: string;
    planArn: string;
    scanPlanRoleArn: string;
    eventRuleArn: string;
    eventBusArn: string;
    queueArn: string;
    dlqArn: string;
    workerRoleArn: string;
    kmsKeyArn: string;
  };
  observed: {
    account: {
      accountId: string;
      partition: string;
      region: string;
    };
    bucket: {
      arn: string;
      ownerAccountId: string;
      region: string;
      prefix: string;
      versioning: "Enabled" | "Suspended" | "Unknown";
      publicAccessBlocked: boolean | null;
      encryption: "SSE_S3" | "SSE_KMS" | "Unknown";
      kmsKeyArn: string | null;
    };
    guardDutyPlan: {
      arn: string;
      status: "ACTIVE" | "DISABLED" | "UNKNOWN";
      accountId: string;
      region: string;
      roleArn: string;
      bucketArn: string;
      prefix: string;
    };
    eventBridge: {
      ruleArn: string;
      eventBusArn: string;
      enabled: boolean | null;
      source: string[];
      detailType: string[];
      account: string[];
      region: string[];
      planArns: string[];
      targetArns: string[];
      ruleMutationPrincipals: string[] | null;
      putEventsPrincipals: string[] | null;
    };
    queue: {
      arn: string;
      region: string;
      dlqArn: string | null;
      encryptionKeyArn: string | null;
      resourcePolicy: unknown;
      directSendMessagePrincipals: string[] | null;
      queueMutationPrincipals: string[] | null;
    };
    worker: {
      roleArn: string;
      permissionsPolicy: unknown;
      permissionsBoundaryArn: string | null;
      policySnapshotComplete: boolean | null;
      principalsInventoryComplete: boolean | null;
      unexpectedPrincipals: string[] | null;
      passRolePrincipals: string[] | null;
    };
    kms: {
      keyArn: string;
      keyPolicy: unknown;
      decryptPrincipals: string[] | null;
      grantPrincipals: string[] | null;
      grantsReviewed: boolean | null;
    };
    databaseRole: {
      migrationRoleSeparated: boolean | null;
      runtimeIsSuperuser: boolean | null;
      runtimeOwnsProtectedTables: boolean | null;
      runtimeCanTruncateOrAlter: boolean | null;
      auditMutationLimited: boolean | null;
    };
    unknownSurfaces: string[] | null;
  };
};

export type ProjectDocumentAwsSecurityFindingResult =
  | "PASS"
  | "FAIL"
  | "INCOMPLETE";

export type ProjectDocumentAwsSecurityFinding = {
  requirement: string;
  result: ProjectDocumentAwsSecurityFindingResult;
  reasonCodes: string[];
  note: string;
};

export type ProjectDocumentAwsSecurityReadinessReport = {
  schema: typeof PROJECT_DOCUMENT_AWS_SECURITY_EVIDENCE_SCHEMA;
  toolVersion: "1.0.0";
  capturedAt: string | null;
  evidenceSource: "operator_export" | "fixture" | "unrecognized";
  findings: ProjectDocumentAwsSecurityFinding[];
  staticPolicyAssessment: "NO_GO";
  requires_live_owner_verification: true;
  limitation: string;
};
