import "server-only";

import { constants } from "node:fs";
import { open, readFile, realpath, unlink } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  B2LivePreflightError,
  collectB2LiveObservation,
} from "./b2-live-collector";
import {
  type B2AwsCliCommandRunner,
  b2UnsafeAwsEnvironmentKeys,
  createB2AwsCliV2Executor,
  hasB2LiveControlCharacters,
  runB2AwsCliV2Process,
} from "./b2-live-executor";
import { validateB2Approval, validateB2Scope } from "./b2-scope";
import type { B2Observation, B2Scope } from "./b2-types";
import { isB2Observation } from "./b2-validation";

const MAX_CONFIG_BYTES = 64 * 1024;
const MAX_REPORT_BYTES = 128 * 1024;
const HELP = [
  "Phase 13 B2-1 AWS read-only executor (operator-only)",
  "Usage: phase13-b2-1-aws-readonly.ts --collect-read-only --scope-path <absolute-path>",
  "       --approval-path <absolute-path> --confirmed-account <12-digit-id>",
  "       --report-path <absolute-path-outside-repository>",
  "",
  "No AWS command runs on import, help, invalid arguments, or failed preflight.",
  "A completed report always remains NO_GO and requires independent owner review.",
].join("\n");

export type B2LiveCliOutput = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

type ParsedArgs = {
  help: boolean;
  collectReadOnly: boolean;
  scopePath?: string;
  approvalPath?: string;
  confirmedAccount?: string;
  reportPath?: string;
};

export type B2LiveCliDependencies = {
  environment?: NodeJS.ProcessEnv;
  repositoryRoot?: string;
  currentDirectory?: string;
  now?: () => number;
  signal?: AbortSignal;
  readAwsConfig?: (path: string) => Promise<string>;
  commandRunner?: B2AwsCliCommandRunner;
};

const REPOSITORY_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../"
);

function parseArgs(args: string[]): ParsedArgs {
  if (args.length === 0) {
    return {
      help: true,
      collectReadOnly: false,
    };
  }
  const values: ParsedArgs = { help: false, collectReadOnly: false };
  const seen = new Set<string>();
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help" || argument === "-h") {
      values.help = true;
      continue;
    }
    if (argument === "--collect-read-only") {
      if (seen.has(argument)) {
        throw new B2LivePreflightError("CLI_ARGUMENT_DUPLICATED");
      }
      seen.add(argument);
      values.collectReadOnly = true;
      continue;
    }
    if (
      argument === "--scope-path" ||
      argument === "--approval-path" ||
      argument === "--confirmed-account" ||
      argument === "--report-path"
    ) {
      if (seen.has(argument)) {
        throw new B2LivePreflightError("CLI_ARGUMENT_DUPLICATED");
      }
      seen.add(argument);
      const value = args[index + 1];
      if (!value || value.startsWith("--") || value.length > 4096) {
        throw new B2LivePreflightError("CLI_ARGUMENT_VALUE_REQUIRED");
      }
      if (argument === "--scope-path") {
        values.scopePath = value;
      }
      if (argument === "--approval-path") {
        values.approvalPath = value;
      }
      if (argument === "--confirmed-account") {
        values.confirmedAccount = value;
      }
      if (argument === "--report-path") {
        values.reportPath = value;
      }
      index += 1;
      continue;
    }
    throw new B2LivePreflightError("CLI_ARGUMENT_NOT_ALLOWLISTED");
  }
  return values;
}

function isWithin(parent: string, candidate: string): boolean {
  const path = relative(parent, candidate);
  return (
    path === "" ||
    (!path.startsWith(`..${sep}`) && path !== ".." && !isAbsolute(path))
  );
}

function realRepositoryRoot(repositoryRoot: string) {
  return realpath(repositoryRoot);
}

async function resolveExternalExistingFile(
  filePath: string,
  repositoryRoot: string,
  currentDirectory: string
) {
  if (!isAbsolute(filePath)) {
    throw new B2LivePreflightError("INPUT_PATH_MUST_BE_ABSOLUTE");
  }
  const target = await realpath(resolve(currentDirectory, filePath));
  const root = await realRepositoryRoot(repositoryRoot);
  if (isWithin(root, target)) {
    throw new B2LivePreflightError("INPUT_FILE_MUST_BE_OUTSIDE_REPOSITORY");
  }
  return target;
}

async function readBoundedJsonFile(path: string): Promise<unknown> {
  const handle = await open(path, "r");
  try {
    const stats = await handle.stat();
    if (!stats.isFile() || stats.size > MAX_CONFIG_BYTES) {
      throw new B2LivePreflightError("INPUT_FILE_SHAPE_OR_SIZE_INVALID");
    }
    const source = await handle.readFile({ encoding: "utf8" });
    if (Buffer.byteLength(source, "utf8") > MAX_CONFIG_BYTES) {
      throw new B2LivePreflightError("INPUT_FILE_SHAPE_OR_SIZE_INVALID");
    }
    try {
      return JSON.parse(source) as unknown;
    } catch {
      throw new B2LivePreflightError("INPUT_JSON_INVALID");
    }
  } finally {
    await handle.close();
  }
}

type IniSection = {
  name: string;
  values: Map<string, string>;
};

function parseAwsConfig(source: string): IniSection[] | null {
  if (Buffer.byteLength(source, "utf8") > MAX_CONFIG_BYTES) {
    return null;
  }
  const sections: IniSection[] = [];
  let current: IniSection | undefined;
  for (const line of source.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#") || trimmed.startsWith(";")) {
      continue;
    }
    const section = /^\[([^\]\r\n]{1,256})\]$/u.exec(trimmed);
    if (section) {
      const name = section[1]?.trim();
      if (!name || sections.some((entry) => entry.name === name)) {
        return null;
      }
      current = { name, values: new Map() };
      sections.push(current);
      continue;
    }
    if (!current) {
      return null;
    }
    const separator = trimmed.indexOf("=");
    if (separator <= 0) {
      return null;
    }
    const key = trimmed.slice(0, separator).trim().toLowerCase();
    const value = trimmed.slice(separator + 1).trim();
    if (
      !/^[a-z][a-z0-9_-]{0,63}$/u.test(key) ||
      value.length === 0 ||
      value.length > 2048 ||
      hasB2LiveControlCharacters(value) ||
      current.values.has(key)
    ) {
      return null;
    }
    current.values.set(key, value);
  }
  return sections;
}

function ssoStartUrlIsValid(value: string | undefined): boolean {
  if (!value || value.length > 1024) {
    return false;
  }
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.username === "" &&
      url.password === "" &&
      url.port === "" &&
      url.search === "" &&
      url.hash === ""
    );
  } catch {
    return false;
  }
}

/** Validates only the selected local profile config; never reads credentials. */
export function validateB2SsoProfileConfig(
  source: string,
  scope: B2Scope
): boolean {
  const sections = parseAwsConfig(source);
  if (!sections) {
    return false;
  }
  const unsafeGlobalKeys = new Set([
    "endpoint_url",
    "ca_bundle",
    "cli_plugin",
    "cli_plugins",
    "aws_access_key_id",
    "aws_secret_access_key",
    "aws_session_token",
  ]);
  if (
    sections.some((section) =>
      [...section.values.keys()].some((key) => unsafeGlobalKeys.has(key))
    )
  ) {
    return false;
  }
  const profile = sections.find(
    (section) => section.name === `profile ${scope.awsProfile}`
  );
  if (!profile) {
    return false;
  }
  const values = profile.values;
  const forbiddenProfileKeys = [
    "credential_process",
    "credential_source",
    "source_profile",
    "role_arn",
    "web_identity_token_file",
    "external_id",
    "services",
  ];
  if (
    forbiddenProfileKeys.some((key) => values.has(key)) ||
    values.get("region") !== scope.region ||
    values.get("sso_account_id") !== scope.approvedAccountId ||
    !values.get("sso_role_name")
  ) {
    return false;
  }

  const sessionName = values.get("sso_session");
  if (sessionName) {
    if (!/^[A-Za-z0-9_.-]{1,64}$/u.test(sessionName)) {
      return false;
    }
    const session = sections.find(
      (section) => section.name === `sso-session ${sessionName}`
    );
    return (
      session !== undefined &&
      ssoStartUrlIsValid(session.values.get("sso_start_url")) &&
      /^[a-z]{2}(?:-[a-z0-9]+)+-\d$/u.test(
        session.values.get("sso_region") ?? ""
      )
    );
  }

  return (
    ssoStartUrlIsValid(values.get("sso_start_url")) &&
    /^[a-z]{2}(?:-[a-z0-9]+)+-\d$/u.test(values.get("sso_region") ?? "")
  );
}

function safeDestination(
  requestedPath: string,
  currentDirectory: string
): string {
  if (!isAbsolute(requestedPath)) {
    throw new B2LivePreflightError("REPORT_PATH_MUST_BE_ABSOLUTE");
  }
  const absolutePath = resolve(currentDirectory, requestedPath);
  const fileName = absolutePath.slice(absolutePath.lastIndexOf(sep) + 1);
  if (!fileName || fileName === "." || fileName === "..") {
    throw new B2LivePreflightError("REPORT_PATH_INVALID");
  }
  return absolutePath;
}

export async function createB2PrivateReportWriter(
  requestedPath: string,
  repositoryRoot: string,
  currentDirectory = process.cwd()
) {
  const absolutePath = safeDestination(requestedPath, currentDirectory);
  const parentPath = await realpath(dirname(absolutePath));
  const repository = await realRepositoryRoot(repositoryRoot);
  if (isWithin(repository, parentPath)) {
    throw new B2LivePreflightError("REPORT_PATH_MUST_BE_OUTSIDE_REPOSITORY");
  }
  const path = join(
    parentPath,
    absolutePath.slice(absolutePath.lastIndexOf(sep) + 1)
  );
  const flags =
    constants.O_WRONLY |
    constants.O_CREAT |
    constants.O_EXCL |
    constants.O_NOFOLLOW;
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  let created = false;
  try {
    handle = await open(path, flags, 0o600);
    created = true;
    await handle.chmod(0o600);
    const info = await handle.stat();
    if (!info.isFile() || (info.mode & 0o777) !== 0o600) {
      throw new B2LivePreflightError("REPORT_PERMISSIONS_UNSAFE");
    }
  } catch {
    if (handle) {
      await handle.close().catch(() => undefined);
    }
    if (created) {
      await unlink(path).catch(() => undefined);
    }
    throw new B2LivePreflightError("REPORT_PATH_OR_PERMISSIONS_UNSAFE");
  }
  if (!handle) {
    throw new B2LivePreflightError("REPORT_PATH_OR_PERMISSIONS_UNSAFE");
  }
  let wrote = false;
  let closed = false;
  return {
    async write(observation: B2Observation) {
      if (wrote || !isB2Observation(observation)) {
        throw new B2LivePreflightError("REPORT_SCHEMA_INVALID");
      }
      const contents = `${JSON.stringify(observation, null, 2)}\n`;
      if (Buffer.byteLength(contents, "utf8") > MAX_REPORT_BYTES) {
        throw new B2LivePreflightError("REPORT_SIZE_LIMIT");
      }
      await handle.writeFile(contents, { encoding: "utf8" });
      await handle.sync();
      wrote = true;
    },
    async close() {
      if (closed) {
        return;
      }
      closed = true;
      try {
        await handle.close();
      } finally {
        if (!wrote) {
          await unlink(path).catch(() => undefined);
        }
      }
    },
  };
}

function errorOutput(error: unknown): B2LiveCliOutput {
  const code =
    error instanceof B2LivePreflightError
      ? error.code
      : "B2_1_PREFLIGHT_OR_EXECUTION_FAILED";
  return { stdout: "", stderr: `${code}\n`, exitCode: 2 };
}

export async function runB2LiveCli(
  args: string[],
  dependencies: B2LiveCliDependencies = {}
): Promise<B2LiveCliOutput> {
  let parsed: ParsedArgs;
  try {
    parsed = parseArgs(args);
  } catch (error) {
    return errorOutput(error);
  }
  if (parsed.help) {
    return { stdout: `${HELP}\n`, stderr: "", exitCode: 0 };
  }
  if (
    !parsed.collectReadOnly ||
    !parsed.scopePath ||
    !parsed.approvalPath ||
    !parsed.confirmedAccount ||
    !parsed.reportPath
  ) {
    return errorOutput(
      new B2LivePreflightError("B2_1_EXPLICIT_OPT_IN_REQUIRED")
    );
  }

  const environment = dependencies.environment ?? process.env;
  if (
    b2UnsafeAwsEnvironmentKeys(environment).length > 0 ||
    !environment.HOME ||
    !environment.PATH
  ) {
    return errorOutput(
      new B2LivePreflightError("AMBIENT_PROVIDER_OR_ENDPOINT_OVERRIDE")
    );
  }
  const repositoryRoot = dependencies.repositoryRoot ?? REPOSITORY_ROOT;
  const currentDirectory = dependencies.currentDirectory ?? process.cwd();
  let writer:
    | Awaited<ReturnType<typeof createB2PrivateReportWriter>>
    | undefined;
  try {
    const [scopeFile, approvalFile] = await Promise.all([
      resolveExternalExistingFile(
        parsed.scopePath,
        repositoryRoot,
        currentDirectory
      ),
      resolveExternalExistingFile(
        parsed.approvalPath,
        repositoryRoot,
        currentDirectory
      ),
    ]);
    const [scopeInput, approvalInput] = await Promise.all([
      readBoundedJsonFile(scopeFile),
      readBoundedJsonFile(approvalFile),
    ]);
    const scope = validateB2Scope(scopeInput);
    const clock = dependencies.now ?? Date.now;
    const now = clock();
    if (parsed.confirmedAccount !== scope.approvedAccountId) {
      throw new B2LivePreflightError("CONFIRMED_ACCOUNT_MISMATCH");
    }
    if (!validateB2Approval(approvalInput, scope, now)) {
      throw new B2LivePreflightError("APPROVAL_INVALID_OR_EXPIRED");
    }
    const awsConfigPath = join(environment.HOME, ".aws", "config");
    const awsConfig = dependencies.readAwsConfig
      ? await dependencies.readAwsConfig(awsConfigPath)
      : await readFile(awsConfigPath, { encoding: "utf8" });
    if (!validateB2SsoProfileConfig(awsConfig, scope)) {
      throw new B2LivePreflightError("AWS_PROFILE_NOT_BOUNDED_SSO");
    }
    writer = await createB2PrivateReportWriter(
      parsed.reportPath,
      repositoryRoot,
      currentDirectory
    );
    const executor = createB2AwsCliV2Executor(
      scope,
      dependencies.commandRunner ?? runB2AwsCliV2Process,
      environment
    );
    const observation = await collectB2LiveObservation(
      {
        scope,
        approval: approvalInput,
        confirmedAccountId: parsed.confirmedAccount,
        now,
        clock,
        signal: dependencies.signal,
      },
      executor
    );
    await writer.write(observation);
    await writer.close();
    writer = undefined;
    const callerIdentity = observation.findings.find(
      (entry) => entry.requirement === "caller_identity"
    );
    const identityStatus =
      callerIdentity?.status === "PASS" &&
      callerIdentity.reasonCode === "IDENTITY_SCOPE_MATCHED"
        ? "VERIFIED"
        : callerIdentity?.status === "FAIL" &&
            callerIdentity.reasonCode === "IDENTITY_SCOPE_MISMATCH"
          ? "REJECTED"
          : "UNVERIFIED";
    const outcome =
      identityStatus === "VERIFIED"
        ? "callerIdentity=VERIFIED; evidenceCollection=INCOMPLETE; liveDecision=NO_GO"
        : identityStatus === "REJECTED"
          ? "callerIdentity=REJECTED; evidenceCollection=STOPPED; liveDecision=NO_GO"
          : "callerIdentity=UNVERIFIED; evidenceCollection=STOPPED; liveDecision=NO_GO";
    return {
      stdout: `B2_1_SANITIZED_REPORT_WRITTEN; ${outcome}\n`,
      stderr: "",
      exitCode:
        identityStatus === "VERIFIED"
          ? 1
          : identityStatus === "REJECTED"
            ? 3
            : 4,
    };
  } catch (error) {
    if (writer) {
      await writer.close().catch(() => undefined);
    }
    return errorOutput(error);
  }
}
