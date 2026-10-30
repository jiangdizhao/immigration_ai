import { createHash } from "node:crypto";
import { posix } from "node:path";

/**
 * Proposed M4-004 target only.
 *
 * It is not an approved database, container or environment, and neither the
 * M4-002 nor the M4-003 approval authorizes this target. This module is pure: it
 * parses and validates preflight metadata and never connects to a database,
 * inspects Docker, creates containers or runs SQL. The launcher
 * (`phase13-m4-004-db-test.ts`) performs side effects only after the owner
 * authorizes them.
 *
 * R2-04: the previous launcher cleared `POSTGRES_URL`, which the runtime
 * repositories require. The child environment is now *derived* from the approved
 * URL (`buildM4_004_ChildEnvironment`) and re-verified
 * (`assertM4_004_ChildEnvironment`), so the runtime can only connect to this exact
 * isolated database and no inherited business target can survive.
 */
export const M4_004_TEST_TARGET = {
  host: "127.0.0.1",
  port: "55444",
  database: "immigration_ai_phase13_m4_004_test",
  role: "phase13_m4_004_tester",
  migrationCount: 44,
  migrationIndex: 43,
  migrationHead: "0043_phase13_m4_004_service_engagement",
  migrationWhen: 1_793_233_341_879,
  migrationSqlPath:
    "lib/db/migrations/0043_phase13_m4_004_service_engagement.sql",
  migrationSqlSha256:
    "4cc2861c545ecc0d7dce1c06899b78172aa8466b0969c10b4af785aa23c06dfe",
  container: "phase13-m4-004-pg",
  image: "postgres:17",
  dockerLabel: "immigration-ai.phase13",
  dockerLabelValue: "m4-004-isolated-test",
  dataDirectory: "/var/lib/postgresql/data",
  tmpfsOptions: "rw,nosuid,nodev,size=1g",
  containerPort: "5432/tcp",
  minServerVersionNum: 170_000,
  maxServerVersionNumExclusive: 180_000,
  /** Variables that must never carry a different target into the child. */
  clearedChildEnvKeys: [
    "DATABASE_URL",
    "PGURL",
    "POSTGRES_URL_UNPOOLED",
    "PHASE13_M4_002_TEST_DATABASE_URL",
    "PHASE13_M4_003_TEST_DATABASE_URL",
  ],
} as const;

export const M4_004_TEST_APPROVAL = "RUN_M4_004_POSTGRES_INTEGRATION";

export const M4_004_RUNNER_ENVIRONMENT_FLAG =
  "PHASE13_M4_004_TEST_RUNNER_VERIFIED";

export type ParsedM4_004_DatabaseUrl = {
  host: string;
  port: string;
  database: string;
  role: string;
};

export function parseM4_004_DatabaseUrl(raw: string): ParsedM4_004_DatabaseUrl {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("M4-004 integration target URL is invalid");
  }
  const database = parsed.pathname.replace(/^\//u, "");
  let role: string;
  try {
    role = decodeURIComponent(parsed.username);
  } catch {
    throw new Error("M4-004 integration target URL is invalid");
  }
  if (
    !["postgres:", "postgresql:"].includes(parsed.protocol) ||
    parsed.hostname !== M4_004_TEST_TARGET.host ||
    parsed.port !== M4_004_TEST_TARGET.port ||
    database !== M4_004_TEST_TARGET.database ||
    role !== M4_004_TEST_TARGET.role ||
    parsed.search.length > 0 ||
    parsed.hash.length > 0 ||
    parsed.password.length === 0
  ) {
    throw new Error("M4-004 integration target identity mismatch");
  }
  return { host: parsed.hostname, port: parsed.port, database, role };
}

export function requireM4_004_IntegrationApproval(value: string | undefined) {
  if (value !== M4_004_TEST_APPROVAL) {
    throw new Error("M4-004 integration approval token is missing");
  }
}

/**
 * R2-04: build the child environment for the integration run.
 *
 * The runtime needs `POSTGRES_URL`; it is set to the already-validated approved
 * URL and every alternative database variable is cleared so nothing inherited
 * from the parent shell can redirect the runtime.
 */
export function buildM4_004_ChildEnvironment(input: {
  approvedUrl: string;
  baseEnv: Record<string, string | undefined>;
}) {
  parseM4_004_DatabaseUrl(input.approvedUrl);
  const env: Record<string, string | undefined> = {
    ...input.baseEnv,
    POSTGRES_URL: input.approvedUrl,
    PHASE13_M4_004_TEST_DATABASE_URL: input.approvedUrl,
    PHASE13_M4_004_TEST_APPROVAL: M4_004_TEST_APPROVAL,
    [M4_004_RUNNER_ENVIRONMENT_FLAG]: "1",
    // M4-004 routes stay behind their own flag; the DB suite exercises the
    // repository directly rather than the HTTP surface.
    PHASE13_SERVICE_ENGAGEMENT_ENABLED: "",
    PHASE13_PROJECT_HUMAN_MESSAGING_ENABLED: "",
  };
  for (const key of M4_004_TEST_TARGET.clearedChildEnvKeys) {
    env[key] = "";
  }
  return env;
}

/**
 * Fail-closed re-verification of the environment that will actually be handed to
 * the child process. It must point at the approved URL and nowhere else.
 */
export function assertM4_004_ChildEnvironment(
  env: Record<string, string | undefined>,
  approvedUrl: string
) {
  parseM4_004_DatabaseUrl(approvedUrl);
  if (env.POSTGRES_URL !== approvedUrl) {
    throw new Error("M4-004 child POSTGRES_URL is not the approved target");
  }
  if (env.PHASE13_M4_004_TEST_DATABASE_URL !== approvedUrl) {
    throw new Error("M4-004 child test URL is not the approved target");
  }
  if (env[M4_004_RUNNER_ENVIRONMENT_FLAG] !== "1") {
    throw new Error("M4-004 child runner marker is missing");
  }
  for (const key of M4_004_TEST_TARGET.clearedChildEnvKeys) {
    const value = env[key];
    if (value !== undefined && value !== "") {
      throw new Error(`M4-004 child environment leaks ${key}`);
    }
  }
  return { databaseUrl: approvedUrl };
}

type DockerPortBinding = { HostIp?: string; HostPort?: string };
type DockerMount = {
  Type?: string;
  Destination?: string;
  Target?: string;
  Source?: string;
  RW?: boolean;
};

export type M4_004_DockerContainerInspection = {
  Name?: string;
  Image?: string;
  Config?: {
    Image?: string;
    Labels?: Record<string, string | undefined> | null;
  };
  HostConfig?: {
    Tmpfs?: Record<string, string> | null;
    PortBindings?: Record<string, DockerPortBinding[] | null> | null;
    Binds?: string[] | null;
    Mounts?: DockerMount[] | null;
  };
  Mounts?: DockerMount[] | null;
  State?: { Running?: boolean };
  NetworkSettings?: {
    Ports?: Record<string, DockerPortBinding[] | null> | null;
  };
};

export type M4_004_DockerImageInspection = {
  Id?: string;
  RepoDigests?: string[] | null;
};

function malformedDocker(): never {
  throw new Error("M4-004 Docker identity inspection metadata is malformed");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseInspectionObject(output: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch {
    malformedDocker();
  }
  if (!Array.isArray(parsed) || parsed.length !== 1 || !isRecord(parsed[0])) {
    malformedDocker();
  }
  return parsed[0];
}

function validateMounts(value: unknown): DockerMount[] {
  if (!Array.isArray(value)) {
    malformedDocker();
  }
  return value.map((entry) => {
    if (!isRecord(entry)) {
      malformedDocker();
    }
    const target = entry.Destination ?? entry.Target;
    if (
      typeof target !== "string" ||
      !target.startsWith("/") ||
      typeof entry.Type !== "string" ||
      typeof entry.Source !== "string" ||
      typeof entry.RW !== "boolean"
    ) {
      malformedDocker();
    }
    return {
      Destination: target as string,
      RW: entry.RW as boolean,
      Source: entry.Source as string,
      Type: entry.Type as string,
    };
  });
}

function validatePorts(
  value: unknown
): Record<string, DockerPortBinding[] | null> {
  if (!isRecord(value)) {
    malformedDocker();
  }
  const result: Record<string, DockerPortBinding[] | null> = {};
  for (const [containerPort, bindings] of Object.entries(value)) {
    if (bindings === null) {
      result[containerPort] = null;
      continue;
    }
    if (!Array.isArray(bindings)) {
      malformedDocker();
    }
    result[containerPort] = bindings.map((binding) => {
      if (
        !isRecord(binding) ||
        typeof binding.HostIp !== "string" ||
        typeof binding.HostPort !== "string"
      ) {
        malformedDocker();
      }
      return {
        HostIp: binding.HostIp as string,
        HostPort: binding.HostPort as string,
      };
    });
  }
  return result;
}

export function parseM4_004_DockerContainerInspection(
  output: string
): M4_004_DockerContainerInspection {
  const raw = parseInspectionObject(output);
  const config = raw.Config;
  const hostConfig = raw.HostConfig;
  const state = raw.State;
  const network = raw.NetworkSettings;
  if (
    !isRecord(config) ||
    !isRecord(hostConfig) ||
    !isRecord(state) ||
    !isRecord(network) ||
    !isRecord(config.Labels) ||
    !isRecord(hostConfig.Tmpfs) ||
    !isRecord(hostConfig.PortBindings) ||
    !isRecord(network.Ports)
  ) {
    malformedDocker();
  }
  if (Object.values(config.Labels).some((value) => typeof value !== "string")) {
    malformedDocker();
  }
  if (
    Object.values(hostConfig.Tmpfs).some((value) => typeof value !== "string")
  ) {
    malformedDocker();
  }
  return {
    Config: {
      Image: typeof config.Image === "string" ? config.Image : undefined,
      Labels: config.Labels as Record<string, string | undefined>,
    },
    HostConfig: {
      Binds: Array.isArray(hostConfig.Binds)
        ? (hostConfig.Binds as string[])
        : [],
      Mounts: validateMounts(hostConfig.Mounts ?? []),
      PortBindings: validatePorts(hostConfig.PortBindings),
      Tmpfs: hostConfig.Tmpfs as Record<string, string>,
    },
    Image: typeof raw.Image === "string" ? raw.Image : undefined,
    Mounts: validateMounts(raw.Mounts ?? []),
    Name: typeof raw.Name === "string" ? raw.Name : undefined,
    NetworkSettings: { Ports: validatePorts(network.Ports) },
    State: {
      Running: typeof state.Running === "boolean" ? state.Running : undefined,
    },
  };
}

export function parseM4_004_DockerImageInspection(
  output: string
): M4_004_DockerImageInspection {
  const raw = parseInspectionObject(output);
  const validDigests =
    raw.RepoDigests === null ||
    (Array.isArray(raw.RepoDigests) &&
      raw.RepoDigests.every(
        (digest) =>
          typeof digest === "string" &&
          /^[a-z0-9][a-z0-9._:/-]*@sha256:[0-9a-f]{64}$/u.test(digest)
      ));
  if (
    typeof raw.Id !== "string" ||
    !/^sha256:[0-9a-f]{64}$/u.test(raw.Id) ||
    !validDigests
  ) {
    malformedDocker();
  }
  return { Id: raw.Id, RepoDigests: raw.RepoDigests as string[] | null };
}

function overlapsDataDirectory(path: string) {
  const normalized = posix.normalize(path);
  const dataDirectory = M4_004_TEST_TARGET.dataDirectory;
  return (
    normalized === dataDirectory ||
    normalized.startsWith(`${dataDirectory}/`) ||
    dataDirectory.startsWith(`${normalized}/`)
  );
}

function mountTargets(mount: DockerMount) {
  return (
    typeof mount.Destination === "string" &&
    overlapsDataDirectory(mount.Destination)
  );
}

/**
 * R2-04: exact container identity. The pinned image *tag* is enforced and the
 * inspected image id must match the container's own `Image` reference, so a
 * re-tagged or substituted image is rejected. The absolute image digest is
 * recorded (not pinned) because the container is provisioned after this patch;
 * the harness documents that an owner must pin it at provisioning time.
 */
export function assertM4_004_DockerIdentity(
  container: M4_004_DockerContainerInspection,
  image: M4_004_DockerImageInspection
) {
  const portBindings =
    container.HostConfig?.PortBindings?.[M4_004_TEST_TARGET.containerPort];
  const publishedPorts =
    container.NetworkSettings?.Ports?.[M4_004_TEST_TARGET.containerPort];
  const portsAreExact =
    Array.isArray(portBindings) &&
    portBindings.length === 1 &&
    portBindings[0]?.HostIp === M4_004_TEST_TARGET.host &&
    portBindings[0]?.HostPort === M4_004_TEST_TARGET.port &&
    Array.isArray(publishedPorts) &&
    publishedPorts.length === 1 &&
    publishedPorts[0]?.HostIp === M4_004_TEST_TARGET.host &&
    publishedPorts[0]?.HostPort === M4_004_TEST_TARGET.port &&
    Object.keys(container.HostConfig?.PortBindings ?? {}).length === 1;
  const tmpfs = container.HostConfig?.Tmpfs ?? {};
  const tmpfsIsExact =
    Object.keys(tmpfs).length === 1 &&
    tmpfs[M4_004_TEST_TARGET.dataDirectory] === M4_004_TEST_TARGET.tmpfsOptions;
  const noDataDirectoryMount =
    !(container.Mounts ?? []).some(mountTargets) &&
    !(container.HostConfig?.Mounts ?? []).some(mountTargets) &&
    !(container.HostConfig?.Binds ?? []).some((bind) => {
      const parts = bind.split(":");
      return parts.length >= 2 && overlapsDataDirectory(parts[1] ?? "");
    });
  if (
    container.Name !== `/${M4_004_TEST_TARGET.container}` ||
    container.Config?.Image !== M4_004_TEST_TARGET.image ||
    container.State?.Running !== true ||
    typeof container.Image !== "string" ||
    container.Image !== image.Id ||
    container.Config.Labels?.[M4_004_TEST_TARGET.dockerLabel] !==
      M4_004_TEST_TARGET.dockerLabelValue ||
    !portsAreExact ||
    !tmpfsIsExact ||
    !noDataDirectoryMount
  ) {
    throw new Error("M4-004 isolated PostgreSQL container identity mismatch");
  }
  return { imageId: image.Id, repoDigests: image.RepoDigests ?? [] };
}

export type M4_004_DatabaseIdentity = {
  database: string;
  role: string;
  serverVersionNum: number;
  canLogin: boolean;
  isSuperuser: boolean;
  canCreateDatabase: boolean;
  canCreateRole: boolean;
  canCreateSchemaPublic: boolean;
};

export function parseM4_004_DatabaseIdentity(
  row: Record<string, unknown> | undefined
): M4_004_DatabaseIdentity {
  if (
    !row ||
    typeof row.database !== "string" ||
    typeof row.role !== "string" ||
    typeof row.serverVersionNum !== "number" ||
    typeof row.canLogin !== "boolean" ||
    typeof row.isSuperuser !== "boolean" ||
    typeof row.canCreateDatabase !== "boolean" ||
    typeof row.canCreateRole !== "boolean" ||
    typeof row.canCreateSchemaPublic !== "boolean"
  ) {
    throw new Error("M4-004 database identity metadata is malformed");
  }
  return {
    canCreateDatabase: row.canCreateDatabase,
    canCreateRole: row.canCreateRole,
    canCreateSchemaPublic: row.canCreateSchemaPublic,
    canLogin: row.canLogin,
    database: row.database,
    isSuperuser: row.isSuperuser,
    role: row.role,
    serverVersionNum: row.serverVersionNum,
  };
}

/**
 * R2-04: the server must be the exact database/role, a supported PostgreSQL
 * major, and a restricted (non-superuser, non-DDL) login role.
 */
export function assertM4_004_DatabaseIdentity(
  identity: M4_004_DatabaseIdentity,
  parsedUrl: ParsedM4_004_DatabaseUrl
) {
  if (
    identity.database !== parsedUrl.database ||
    identity.role !== parsedUrl.role ||
    identity.serverVersionNum < M4_004_TEST_TARGET.minServerVersionNum ||
    identity.serverVersionNum >=
      M4_004_TEST_TARGET.maxServerVersionNumExclusive ||
    identity.canLogin !== true ||
    identity.isSuperuser !== false ||
    identity.canCreateDatabase !== false ||
    identity.canCreateRole !== false ||
    identity.canCreateSchemaPublic !== false
  ) {
    throw new Error("M4-004 PostgreSQL server identity mismatch");
  }
}

export type M4_004_MigrationJournal = {
  version: string;
  dialect: string;
  entries: Array<{
    idx: number;
    version: string;
    when: number;
    tag: string;
    breakpoints: boolean;
  }>;
};

export function parseM4_004_MigrationJournal(
  raw: unknown
): M4_004_MigrationJournal {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("M4-004 migration journal is malformed");
  }
  const candidate = raw as {
    version?: unknown;
    dialect?: unknown;
    entries?: unknown;
  };
  if (
    typeof candidate.version !== "string" ||
    typeof candidate.dialect !== "string" ||
    !Array.isArray(candidate.entries) ||
    candidate.entries.some(
      (entry) =>
        typeof entry !== "object" ||
        entry === null ||
        typeof (entry as { idx?: unknown }).idx !== "number" ||
        typeof (entry as { tag?: unknown }).tag !== "string" ||
        typeof (entry as { when?: unknown }).when !== "number" ||
        typeof (entry as { version?: unknown }).version !== "string" ||
        typeof (entry as { breakpoints?: unknown }).breakpoints !== "boolean"
    )
  ) {
    throw new Error("M4-004 migration journal is malformed");
  }
  return raw as M4_004_MigrationJournal;
}

/**
 * R2-04: pin Migration 0043 source identity. The journal entry must exist at the
 * expected index/tag/time and the checked-in SQL bytes must hash to the pinned
 * value, so the database run applies exactly the reviewed migration.
 */
export function expectedM4_004_Migration(
  journal: M4_004_MigrationJournal,
  migrationSql: string
) {
  if (
    typeof journal !== "object" ||
    journal === null ||
    !Array.isArray(journal.entries) ||
    typeof migrationSql !== "string"
  ) {
    throw new Error("M4-004 migration verification metadata is malformed");
  }
  const entry = journal.entries.find(
    (candidate) => candidate.idx === M4_004_TEST_TARGET.migrationIndex
  );
  if (
    journal.version !== "7" ||
    journal.dialect !== "postgresql" ||
    journal.entries.length < M4_004_TEST_TARGET.migrationCount ||
    journal.entries.some(
      (candidate, index) =>
        candidate.idx !== index ||
        candidate.version !== "7" ||
        typeof candidate.when !== "number" ||
        !Number.isSafeInteger(candidate.when) ||
        typeof candidate.tag !== "string" ||
        candidate.breakpoints !== true
    ) ||
    entry?.tag !== M4_004_TEST_TARGET.migrationHead ||
    entry.when !== M4_004_TEST_TARGET.migrationWhen
  ) {
    throw new Error("M4-004 source migration journal mismatch");
  }
  const hash = createHash("sha256").update(migrationSql).digest("hex");
  if (hash !== M4_004_TEST_TARGET.migrationSqlSha256) {
    throw new Error("M4-004 migration 0043 source hash mismatch");
  }
  return { hash, index: entry.idx, tag: entry.tag, when: entry.when };
}

export function parseM4_004_MigrationLedger(
  row: Record<string, unknown> | undefined
) {
  if (
    !row ||
    typeof row.rowCount !== "number" ||
    typeof row.latestId !== "number" ||
    typeof row.latestHash !== "string" ||
    typeof row.latestCreatedAt !== "string"
  ) {
    throw new Error("M4-004 database migration ledger is malformed");
  }
  return {
    latestCreatedAt: Number(row.latestCreatedAt),
    latestHash: row.latestHash,
    latestId: row.latestId,
    rowCount: row.rowCount,
  };
}

export function assertM4_004_MigrationLedger(input: {
  ledger: ReturnType<typeof parseM4_004_MigrationLedger>;
  expected: ReturnType<typeof expectedM4_004_Migration>;
}) {
  if (
    input.ledger.rowCount !== M4_004_TEST_TARGET.migrationCount ||
    input.ledger.latestId !== M4_004_TEST_TARGET.migrationCount ||
    input.ledger.latestHash !== input.expected.hash ||
    input.ledger.latestCreatedAt !== input.expected.when
  ) {
    throw new Error("M4-004 database migration ledger head mismatch");
  }
}
