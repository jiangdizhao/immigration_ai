import "server-only";

import { execFile } from "node:child_process";
import { b2RequestTemplates, canonicalizeB2Evidence } from "./b2-plan";
import { validateB2Scope } from "./b2-scope";
import type { B2ReadOnlyRequest, B2Scope } from "./b2-types";

export const B2_LIVE_MAX_RESPONSE_BYTES = 256 * 1024;
export const B2_LIVE_REQUEST_TIMEOUT_MS = 2000;
export const B2_LIVE_TOTAL_DEADLINE_MS = 30_000;

export type B2DependentIamRequest = {
  kind: "dependent_iam";
  operation: "iam:GetRolePolicy" | "iam:GetPolicy" | "iam:GetPolicyVersion";
  input: Readonly<Record<string, string>>;
};

export type B2LiveCommandRequest =
  | {
      kind: "primary";
      request: B2ReadOnlyRequest;
      pageToken?: string;
    }
  | B2DependentIamRequest;

export type B2LiveExecutor = {
  readonly kind: "aws_cli_v2";
  execute(
    request: B2LiveCommandRequest,
    options: {
      signal: AbortSignal;
      profile: string;
      region: string;
    }
  ): Promise<unknown>;
};

export type B2AwsCliCommandResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  processError?:
    | "NOT_FOUND"
    | "TIMEOUT"
    | "ABORTED"
    | "OUTPUT_LIMIT"
    | "FAILED";
};

/** Normalize the callback shape returned by Node's execFile without retaining errors. */
export function normalizeB2AwsCliProcessResult(
  error: (Error & { code?: string | number; killed?: boolean }) | null,
  stdout: string,
  stderr: string,
  signalAborted: boolean
): B2AwsCliCommandResult {
  let processError: B2AwsCliCommandResult["processError"];
  if (error?.code === "ENOENT") {
    processError = "NOT_FOUND";
  } else if (error?.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") {
    processError = "OUTPUT_LIMIT";
  } else if (error && signalAborted) {
    processError = "ABORTED";
  } else if (error?.code === "ETIMEDOUT" || error?.killed) {
    processError = "TIMEOUT";
  } else if (error && typeof error.code !== "number") {
    processError = "FAILED";
  }
  return {
    exitCode:
      error === null ? 0 : typeof error.code === "number" ? error.code : null,
    stdout,
    stderr,
    ...(processError ? { processError } : {}),
  };
}

export type B2AwsCliCommandOptions = {
  signal: AbortSignal;
  timeoutMs: number;
  maxResponseBytes: number;
  env: NodeJS.ProcessEnv;
};

export type B2AwsCliCommandRunner = (
  args: readonly string[],
  options: B2AwsCliCommandOptions
) => Promise<B2AwsCliCommandResult>;

export type B2AwsCliFailureCode =
  | "AWS_CLI_UNAVAILABLE"
  | "AWS_CLI_TIMEOUT"
  | "AWS_CLI_ABORTED"
  | "AWS_CLI_OUTPUT_LIMIT"
  | "AWS_ACCESS_DENIED"
  | "AWS_RESOURCE_MISSING"
  | "AWS_CREDENTIALS_UNAVAILABLE"
  | "AWS_THROTTLED"
  | "AWS_CLI_STDERR_UNEXPECTED"
  | "AWS_CLI_FAILED"
  | "AWS_CLI_JSON_INVALID"
  | "AWS_RESPONSE_SHAPE_INVALID"
  | "AWS_RESPONSE_SIZE_LIMIT"
  | "AWS_REQUEST_NOT_ALLOWLISTED"
  | "AWS_CALL_LIMIT_REACHED";

export class B2AwsCliFailure extends Error {
  readonly code: B2AwsCliFailureCode;

  constructor(code: B2AwsCliFailureCode) {
    super(code);
    this.name = "B2AwsCliFailure";
    this.code = code;
  }
}

const COMMON_ARGUMENTS = [
  "--output",
  "json",
  "--no-cli-pager",
  "--cli-auto-prompt",
  "off",
  "--no-paginate",
  "--cli-connect-timeout",
  "2",
  "--cli-read-timeout",
  "2",
] as const;

const IAM_POLICY_NAME_PATTERN = /^[A-Za-z0-9_+=,.@-]{1,128}$/u;
const IAM_VERSION_ID_PATTERN = /^v[1-9][0-9]{0,8}$/u;

export function hasB2LiveControlCharacters(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code <= 0x1f || code === 0x7f) {
      return true;
    }
  }
  return false;
}

function exactJson(left: unknown, right: unknown): boolean {
  const leftJson = canonicalizeB2Evidence(left);
  const rightJson = canonicalizeB2Evidence(right);
  return leftJson !== null && leftJson === rightJson;
}

function validPageToken(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 2048 &&
    !value.startsWith("-") &&
    !hasB2LiveControlCharacters(value)
  );
}

function expectedPrimaryRequest(
  scope: B2Scope,
  request: B2ReadOnlyRequest
): B2ReadOnlyRequest | null {
  const template = b2RequestTemplates(scope).find(
    (candidate) => candidate.operation === request.operation
  );
  if (
    !template ||
    request.maxPages !== template.maxPages ||
    request.maxResponseBytes !== template.maxResponseBytes ||
    request.timeoutMs !== template.timeoutMs ||
    request.maxAttempts !== 1 ||
    !exactJson(request.input, template.input)
  ) {
    return null;
  }
  return template;
}

function globalArguments(scope: B2Scope) {
  return [
    "--profile",
    scope.awsProfile,
    "--region",
    scope.region,
    ...COMMON_ARGUMENTS,
  ];
}

function primaryArguments(
  scope: B2Scope,
  request: B2ReadOnlyRequest,
  pageToken?: string
): string[] {
  if (!expectedPrimaryRequest(scope, request)) {
    throw new B2AwsCliFailure("AWS_REQUEST_NOT_ALLOWLISTED");
  }
  const input = request.input;
  let command: string[];
  let tokenFlag: "--next-token" | "--marker" | null = null;

  switch (request.operation) {
    case "sts:GetCallerIdentity":
      command = ["sts", "get-caller-identity"];
      break;
    case "s3:GetBucketLocation":
      command = [
        "s3api",
        "get-bucket-location",
        "--bucket",
        String(input.Bucket),
        "--expected-bucket-owner",
        String(input.ExpectedBucketOwner),
      ];
      break;
    case "s3:GetBucketVersioning":
      command = [
        "s3api",
        "get-bucket-versioning",
        "--bucket",
        String(input.Bucket),
        "--expected-bucket-owner",
        String(input.ExpectedBucketOwner),
      ];
      break;
    case "s3:GetPublicAccessBlock":
      command = [
        "s3api",
        "get-public-access-block",
        "--bucket",
        String(input.Bucket),
        "--expected-bucket-owner",
        String(input.ExpectedBucketOwner),
      ];
      break;
    case "s3:GetBucketEncryption":
      command = [
        "s3api",
        "get-bucket-encryption",
        "--bucket",
        String(input.Bucket),
        "--expected-bucket-owner",
        String(input.ExpectedBucketOwner),
      ];
      break;
    case "s3:GetBucketPolicyStatus":
      command = [
        "s3api",
        "get-bucket-policy-status",
        "--bucket",
        String(input.Bucket),
        "--expected-bucket-owner",
        String(input.ExpectedBucketOwner),
      ];
      break;
    case "s3:GetBucketPolicy":
      command = [
        "s3api",
        "get-bucket-policy",
        "--bucket",
        String(input.Bucket),
        "--expected-bucket-owner",
        String(input.ExpectedBucketOwner),
      ];
      break;
    case "guardduty:GetMalwareProtectionPlan":
      command = [
        "guardduty",
        "get-malware-protection-plan",
        "--malware-protection-plan-id",
        String(input.MalwareProtectionPlanId),
      ];
      break;
    case "events:DescribeEventBus":
      command = ["events", "describe-event-bus", "--name", "default"];
      break;
    case "events:DescribeRule":
      command = [
        "events",
        "describe-rule",
        "--name",
        String(input.Name),
        "--event-bus-name",
        "default",
      ];
      break;
    case "events:ListTargetsByRule":
      command = [
        "events",
        "list-targets-by-rule",
        "--rule",
        String(input.Rule),
        "--event-bus-name",
        "default",
      ];
      tokenFlag = "--next-token";
      break;
    case "sqs:GetQueueAttributes":
      command = [
        "sqs",
        "get-queue-attributes",
        "--queue-url",
        String(input.QueueUrl),
        "--attribute-names",
        ...(input.AttributeNames as string[]),
      ];
      break;
    case "iam:GetRole":
      command = ["iam", "get-role", "--role-name", String(input.RoleName)];
      break;
    case "iam:ListAttachedRolePolicies":
      command = [
        "iam",
        "list-attached-role-policies",
        "--role-name",
        String(input.RoleName),
        "--max-items",
        String(input.MaxItems),
      ];
      break;
    case "iam:ListRolePolicies":
      command = [
        "iam",
        "list-role-policies",
        "--role-name",
        String(input.RoleName),
        "--max-items",
        String(input.MaxItems),
      ];
      break;
    case "kms:DescribeKey":
      command = ["kms", "describe-key", "--key-id", String(input.KeyId)];
      break;
    case "kms:GetKeyPolicy":
      command = [
        "kms",
        "get-key-policy",
        "--key-id",
        String(input.KeyId),
        "--policy-name",
        "default",
      ];
      break;
    case "kms:ListGrants":
      command = [
        "kms",
        "list-grants",
        "--key-id",
        String(input.KeyId),
        "--limit",
        String(input.Limit),
      ];
      tokenFlag = "--marker";
      break;
    default:
      throw new B2AwsCliFailure("AWS_REQUEST_NOT_ALLOWLISTED");
  }

  if (pageToken !== undefined) {
    if (!tokenFlag || !validPageToken(pageToken)) {
      throw new B2AwsCliFailure("AWS_REQUEST_NOT_ALLOWLISTED");
    }
    command.push(tokenFlag, pageToken);
  }
  return [...command, ...globalArguments(scope)];
}

function dependentArguments(
  scope: B2Scope,
  request: B2DependentIamRequest
): string[] {
  const roleName =
    scope.resourceSelectors.applicationRoleArn.split("/").at(-1) ?? "";
  const policyArnPattern = new RegExp(
    `^arn:${scope.partition}:iam::(?:${scope.approvedAccountId}|aws):policy\\/[A-Za-z0-9_+=,.@/-]{1,512}$`,
    "u"
  );
  let command: string[];

  if (request.operation === "iam:GetRolePolicy") {
    if (
      Object.keys(request.input).length !== 2 ||
      request.input.RoleName !== roleName ||
      typeof request.input.PolicyName !== "string" ||
      !IAM_POLICY_NAME_PATTERN.test(request.input.PolicyName)
    ) {
      throw new B2AwsCliFailure("AWS_REQUEST_NOT_ALLOWLISTED");
    }
    command = [
      "iam",
      "get-role-policy",
      "--role-name",
      roleName,
      "--policy-name",
      request.input.PolicyName,
    ];
  } else if (request.operation === "iam:GetPolicy") {
    if (
      Object.keys(request.input).length !== 1 ||
      typeof request.input.PolicyArn !== "string" ||
      !policyArnPattern.test(request.input.PolicyArn)
    ) {
      throw new B2AwsCliFailure("AWS_REQUEST_NOT_ALLOWLISTED");
    }
    command = ["iam", "get-policy", "--policy-arn", request.input.PolicyArn];
  } else if (request.operation === "iam:GetPolicyVersion") {
    if (
      Object.keys(request.input).length !== 2 ||
      typeof request.input.PolicyArn !== "string" ||
      !policyArnPattern.test(request.input.PolicyArn) ||
      typeof request.input.VersionId !== "string" ||
      !IAM_VERSION_ID_PATTERN.test(request.input.VersionId)
    ) {
      throw new B2AwsCliFailure("AWS_REQUEST_NOT_ALLOWLISTED");
    }
    command = [
      "iam",
      "get-policy-version",
      "--policy-arn",
      request.input.PolicyArn,
      "--version-id",
      request.input.VersionId,
    ];
  } else {
    throw new B2AwsCliFailure("AWS_REQUEST_NOT_ALLOWLISTED");
  }
  return [...command, ...globalArguments(scope)];
}

export function buildB2AwsCliArguments(
  scope: B2Scope,
  request: B2LiveCommandRequest,
  profile: string,
  region: string
): string[] {
  let validatedScope: B2Scope;
  try {
    validatedScope = validateB2Scope(scope);
  } catch {
    throw new B2AwsCliFailure("AWS_REQUEST_NOT_ALLOWLISTED");
  }
  if (
    profile !== validatedScope.awsProfile ||
    region !== validatedScope.region
  ) {
    throw new B2AwsCliFailure("AWS_REQUEST_NOT_ALLOWLISTED");
  }
  return request.kind === "primary"
    ? primaryArguments(validatedScope, request.request, request.pageToken)
    : dependentArguments(validatedScope, request);
}

function processErrorCode(
  result: B2AwsCliCommandResult
): B2AwsCliFailureCode | null {
  if (result.processError === "NOT_FOUND") {
    return "AWS_CLI_UNAVAILABLE";
  }
  if (result.processError === "TIMEOUT") {
    return "AWS_CLI_TIMEOUT";
  }
  if (result.processError === "ABORTED") {
    return "AWS_CLI_ABORTED";
  }
  if (result.processError === "OUTPUT_LIMIT") {
    return "AWS_CLI_OUTPUT_LIMIT";
  }
  if (result.processError) {
    return "AWS_CLI_FAILED";
  }
  return null;
}

function awsErrorCode(stderr: string): B2AwsCliFailureCode {
  if (
    /\b(?:AccessDenied|AccessDeniedException|UnauthorizedOperation)\b/iu.test(
      stderr
    )
  ) {
    return "AWS_ACCESS_DENIED";
  }
  if (
    /\b(?:ResourceNotFoundException|NoSuchBucket|NoSuchEntity|NotFound)\b/iu.test(
      stderr
    )
  ) {
    return "AWS_RESOURCE_MISSING";
  }
  if (
    /\b(?:ExpiredToken|InvalidClientTokenId|SSO session|SSOProviderInvalidToken)\b/iu.test(
      stderr
    )
  ) {
    return "AWS_CREDENTIALS_UNAVAILABLE";
  }
  if (
    /\b(?:Throttling|ThrottlingException|TooManyRequestsException)\b/iu.test(
      stderr
    )
  ) {
    return "AWS_THROTTLED";
  }
  return "AWS_CLI_FAILED";
}

export function createB2AwsCliV2Executor(
  scope: B2Scope,
  runner: B2AwsCliCommandRunner,
  environment: NodeJS.ProcessEnv
): B2LiveExecutor {
  return {
    kind: "aws_cli_v2",
    async execute(request, options) {
      const args = buildB2AwsCliArguments(
        scope,
        request,
        options.profile,
        options.region
      );
      const timeoutMs =
        request.kind === "primary"
          ? request.request.timeoutMs
          : B2_LIVE_REQUEST_TIMEOUT_MS;
      const maxResponseBytes =
        request.kind === "primary"
          ? request.request.maxResponseBytes
          : B2_LIVE_MAX_RESPONSE_BYTES;
      const result = await runner(args, {
        signal: options.signal,
        timeoutMs,
        maxResponseBytes,
        env: createB2AwsCliChildEnvironment(environment),
      });
      const processFailure = processErrorCode(result);
      if (processFailure) {
        throw new B2AwsCliFailure(processFailure);
      }
      if (result.exitCode !== 0) {
        throw new B2AwsCliFailure(awsErrorCode(result.stderr));
      }
      if (result.stderr.length > 0) {
        throw new B2AwsCliFailure("AWS_CLI_STDERR_UNEXPECTED");
      }
      if (Buffer.byteLength(result.stdout, "utf8") > maxResponseBytes) {
        throw new B2AwsCliFailure("AWS_RESPONSE_SIZE_LIMIT");
      }
      let response: unknown;
      try {
        response = JSON.parse(result.stdout) as unknown;
      } catch {
        throw new B2AwsCliFailure("AWS_CLI_JSON_INVALID");
      }
      const canonicalResponse = canonicalizeB2Evidence(response);
      if (canonicalResponse === null) {
        throw new B2AwsCliFailure("AWS_RESPONSE_SHAPE_INVALID");
      }
      if (Buffer.byteLength(canonicalResponse, "utf8") > maxResponseBytes) {
        throw new B2AwsCliFailure("AWS_RESPONSE_SIZE_LIMIT");
      }
      return response;
    },
  };
}

/**
 * Runs the fixed AWS CLI v2 executable without a shell. Tests must inject a
 * fake runner; this function is only wired into the explicit operator entry.
 */
export const runB2AwsCliV2Process: B2AwsCliCommandRunner = (args, options) =>
  new Promise((resolve) => {
    execFile(
      "aws",
      [...args],
      {
        shell: false,
        windowsHide: true,
        encoding: "utf8",
        timeout: options.timeoutMs,
        maxBuffer: options.maxResponseBytes + 16 * 1024,
        signal: options.signal,
        env: options.env,
      },
      (error, stdout, stderr) => {
        resolve(
          normalizeB2AwsCliProcessResult(
            error as
              | (Error & { code?: string | number; killed?: boolean })
              | null,
            typeof stdout === "string" ? stdout : "",
            typeof stderr === "string" ? stderr : "",
            options.signal.aborted
          )
        );
      }
    );
  });

/** Reject ambient AWS/provider/endpoint/proxy overrides before the runner exists. */
export function b2UnsafeAwsEnvironmentKeys(
  environment: NodeJS.ProcessEnv
): string[] {
  return Object.keys(environment)
    .filter(
      (key) =>
        /^AWS_/iu.test(key) ||
        /^(?:http_proxy|https_proxy|all_proxy|no_proxy|HTTP_PROXY|HTTPS_PROXY|ALL_PROXY|NO_PROXY|AWS_CA_BUNDLE|SSL_CERT_FILE|SSL_CERT_DIR|CURL_CA_BUNDLE|REQUESTS_CA_BUNDLE|NODE_EXTRA_CA_CERTS)$/u.test(
          key
        )
    )
    .sort();
}

/** Build a minimal child environment; never forward ambient AWS or proxy keys. */
export function createB2AwsCliChildEnvironment(
  environment: NodeJS.ProcessEnv
): NodeJS.ProcessEnv {
  if (b2UnsafeAwsEnvironmentKeys(environment).length > 0) {
    throw new B2AwsCliFailure("AWS_REQUEST_NOT_ALLOWLISTED");
  }
  const home = environment.HOME;
  const path = environment.PATH;
  if (!home || !path) {
    throw new B2AwsCliFailure("AWS_REQUEST_NOT_ALLOWLISTED");
  }
  return {
    HOME: home,
    PATH: path,
    NODE_ENV: environment.NODE_ENV ?? "production",
    LANG: environment.LANG ?? "C",
    LC_ALL: "C",
    AWS_SHARED_CREDENTIALS_FILE: "/dev/null",
    AWS_IGNORE_CONFIGURED_ENDPOINT_URLS: "true",
    AWS_CLI_AUTO_PROMPT: "off",
    AWS_PAGER: "",
    AWS_RETRY_MODE: "standard",
    AWS_MAX_ATTEMPTS: "1",
  };
}
