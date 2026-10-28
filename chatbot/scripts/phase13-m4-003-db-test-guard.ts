import { createHash } from "node:crypto";
import { posix } from "node:path";

/**
 * Proposed target only. It is not an approved database or Docker environment.
 * M4-002 approval does not authorize this separate M4-003 target.
 */
export const M4_003_TEST_TARGET = {
  host: "127.0.0.1",
  port: "55433",
  database: "immigration_ai_phase13_m4_003_test",
  role: "phase13_m4_003_tester",
  migrationCount: 43,
  migrationIndex: 42,
  migrationHead: "0042_phase13_m4_003_human_messaging",
  migrationWhen: 1_793_145_662_822,
  migrationSqlSha256:
    "c5a56b63cfd60e28fde4b58cfd72f79212da1c392d7ef15cfb580fcf77f768a7",
  container: "phase13-m4-003-pg",
  image: "postgres:17",
  imageId:
    "sha256:82903352d6faf8f8a318bc4353d1cb1db67d4a5ff968d2799b2718e2cb00afa2",
  dockerLabel: "immigration-ai.phase13",
  dockerLabelValue: "m4-003-isolated-test",
  dataDirectory: "/var/lib/postgresql/data",
  tmpfsOptions: "rw,nosuid,nodev,size=1g",
} as const;

export const M4_003_TEST_APPROVAL = "RUN_M4_003_POSTGRES_INTEGRATION";

export type ParsedM4_003_DatabaseUrl = {
  host: string;
  port: string;
  database: string;
  role: string;
};

export function parseM4_003_DatabaseUrl(raw: string): ParsedM4_003_DatabaseUrl {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("M4-003 integration target URL is invalid");
  }
  const database = parsed.pathname.replace(/^\//u, "");
  let role: string;
  try {
    role = decodeURIComponent(parsed.username);
  } catch {
    throw new Error("M4-003 integration target URL is invalid");
  }
  if (
    !["postgres:", "postgresql:"].includes(parsed.protocol) ||
    parsed.hostname !== M4_003_TEST_TARGET.host ||
    parsed.port !== M4_003_TEST_TARGET.port ||
    database !== M4_003_TEST_TARGET.database ||
    role !== M4_003_TEST_TARGET.role ||
    parsed.search.length > 0 ||
    parsed.hash.length > 0
  ) {
    throw new Error("M4-003 integration target identity mismatch");
  }
  return {
    host: parsed.hostname,
    port: parsed.port,
    database,
    role,
  };
}

export function requireM4_003_IntegrationApproval(value: string | undefined) {
  if (value !== M4_003_TEST_APPROVAL) {
    throw new Error("M4-003 integration approval token is missing");
  }
}

type DockerPortBinding = { HostIp?: string; HostPort?: string };
type DockerMount = {
  Type?: string;
  Destination?: string;
  Target?: string;
  Source?: string;
  RW?: boolean;
};

export type M4_003_DockerContainerInspection = {
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

export type M4_003_DockerImageInspection = {
  Id?: string;
  RepoDigests?: string[] | null;
};

function failMalformedInspection(): never {
  throw new Error("Docker identity inspection metadata is malformed");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseDockerInspectionObject(output: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch {
    return failMalformedInspection();
  }
  if (!Array.isArray(parsed) || parsed.length !== 1 || !isRecord(parsed[0])) {
    return failMalformedInspection();
  }
  return parsed[0];
}

function validateMountArray(value: unknown): DockerMount[] {
  if (!Array.isArray(value)) {
    return failMalformedInspection();
  }
  return value.map((entry) => {
    if (!isRecord(entry)) {
      return failMalformedInspection();
    }
    const target = entry.Destination ?? entry.Target;
    if (
      typeof target !== "string" ||
      !target.startsWith("/") ||
      typeof entry.Type !== "string" ||
      typeof entry.Source !== "string" ||
      ((entry.Type === "bind" || entry.Type === "volume") &&
        entry.Source.length === 0) ||
      typeof entry.RW !== "boolean"
    ) {
      return failMalformedInspection();
    }
    return {
      Type: entry.Type,
      Destination: target,
      Source: entry.Source,
      RW: entry.RW,
    };
  });
}

function validatePortMap(
  value: unknown
): Record<string, DockerPortBinding[] | null> {
  if (!isRecord(value)) {
    return failMalformedInspection();
  }
  const result: Record<string, DockerPortBinding[] | null> = {};
  for (const [containerPort, rawBindings] of Object.entries(value)) {
    if (rawBindings === null) {
      result[containerPort] = null;
      continue;
    }
    if (!Array.isArray(rawBindings)) {
      return failMalformedInspection();
    }
    result[containerPort] = rawBindings.map((rawBinding) => {
      if (
        !isRecord(rawBinding) ||
        typeof rawBinding.HostIp !== "string" ||
        typeof rawBinding.HostPort !== "string"
      ) {
        return failMalformedInspection();
      }
      return { HostIp: rawBinding.HostIp, HostPort: rawBinding.HostPort };
    });
  }
  return result;
}

export function parseM4_003_DockerContainerInspection(
  output: string
): M4_003_DockerContainerInspection {
  const raw = parseDockerInspectionObject(output);
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
    !isRecord(network.Ports) ||
    !Object.hasOwn(raw, "Mounts") ||
    (raw.Mounts !== null && !Array.isArray(raw.Mounts)) ||
    (hostConfig.Binds !== null && !Array.isArray(hostConfig.Binds)) ||
    (hostConfig.Mounts !== undefined &&
      hostConfig.Mounts !== null &&
      !Array.isArray(hostConfig.Mounts))
  ) {
    return failMalformedInspection();
  }
  if (Object.values(config.Labels).some((value) => typeof value !== "string")) {
    return failMalformedInspection();
  }
  const tmpfs = hostConfig.Tmpfs as Record<string, unknown>;
  if (Object.values(tmpfs).some((value) => typeof value !== "string")) {
    return failMalformedInspection();
  }
  const binds = (hostConfig.Binds ?? []) as unknown[];
  if (
    binds.some((value) => {
      if (typeof value !== "string") {
        return true;
      }
      const parts = value.split(":");
      return (
        parts.length < 2 ||
        parts.length > 3 ||
        !parts[0] ||
        !parts[1]?.startsWith("/")
      );
    })
  ) {
    return failMalformedInspection();
  }
  const hostMounts = hostConfig.Mounts ?? [];
  return {
    Name: typeof raw.Name === "string" ? raw.Name : undefined,
    Image: typeof raw.Image === "string" ? raw.Image : undefined,
    Config: {
      Image: typeof config.Image === "string" ? config.Image : undefined,
      Labels: config.Labels as Record<string, string | undefined>,
    },
    HostConfig: {
      Tmpfs: tmpfs as Record<string, string>,
      PortBindings: validatePortMap(hostConfig.PortBindings),
      Binds: binds as string[],
      Mounts: validateMountArray(hostMounts),
    },
    Mounts: validateMountArray(raw.Mounts ?? []),
    State: {
      Running: typeof state.Running === "boolean" ? state.Running : undefined,
    },
    NetworkSettings: { Ports: validatePortMap(network.Ports) },
  };
}

export function parseM4_003_DockerImageInspection(
  output: string
): M4_003_DockerImageInspection {
  const raw = parseDockerInspectionObject(output);
  const validRepoDigests =
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
    !validRepoDigests
  ) {
    return failMalformedInspection();
  }
  return {
    Id: raw.Id,
    RepoDigests: raw.RepoDigests as string[] | null,
  };
}

function overlapsDataDirectory(path: string) {
  const normalized = posix.normalize(path);
  const dataDirectory = M4_003_TEST_TARGET.dataDirectory;
  return (
    normalized === dataDirectory ||
    normalized.startsWith(`${dataDirectory}/`) ||
    dataDirectory.startsWith(`${normalized}/`)
  );
}

function mountTargetsDataDirectory(mount: DockerMount) {
  const destination = mount.Destination ?? mount.Target;
  return typeof destination === "string" && overlapsDataDirectory(destination);
}

export function assertM4_003_DockerIdentity(
  container: M4_003_DockerContainerInspection,
  image: M4_003_DockerImageInspection
) {
  const hostPorts = container.HostConfig?.PortBindings;
  const runtimePorts = container.NetworkSettings?.Ports;
  const hostBindings = hostPorts?.["5432/tcp"] ?? [];
  const runtimeBindings = runtimePorts?.["5432/tcp"] ?? [];
  const portsAreExact =
    hostPorts !== null &&
    runtimePorts !== null &&
    Object.keys(hostPorts ?? {}).length === 1 &&
    Object.keys(runtimePorts ?? {}).length === 1 &&
    hostBindings.length === 1 &&
    runtimeBindings.length === 1 &&
    hostBindings[0]?.HostIp === M4_003_TEST_TARGET.host &&
    hostBindings[0]?.HostPort === M4_003_TEST_TARGET.port &&
    runtimeBindings[0]?.HostIp === M4_003_TEST_TARGET.host &&
    runtimeBindings[0]?.HostPort === M4_003_TEST_TARGET.port;
  const mounts = container.Mounts;
  const hostMounts = container.HostConfig?.Mounts;
  const binds = container.HostConfig?.Binds;
  const mountMetadataValid =
    Array.isArray(mounts) &&
    Array.isArray(hostMounts) &&
    Array.isArray(binds) &&
    !mounts.some(mountTargetsDataDirectory) &&
    !hostMounts.some(mountTargetsDataDirectory) &&
    !binds.some((bind) => {
      const parts = bind.split(":");
      return parts.length >= 2 && overlapsDataDirectory(parts[1] ?? "");
    });
  const tmpfsIsExact =
    Object.keys(container.HostConfig?.Tmpfs ?? {}).length === 1 &&
    container.HostConfig?.Tmpfs?.[M4_003_TEST_TARGET.dataDirectory] ===
      M4_003_TEST_TARGET.tmpfsOptions &&
    mountMetadataValid;
  if (
    container.Name !== `/${M4_003_TEST_TARGET.container}` ||
    container.Config?.Image !== M4_003_TEST_TARGET.image ||
    container.State?.Running !== true ||
    container.Image !== M4_003_TEST_TARGET.imageId ||
    image.Id !== M4_003_TEST_TARGET.imageId ||
    container.Config.Labels?.[M4_003_TEST_TARGET.dockerLabel] !==
      M4_003_TEST_TARGET.dockerLabelValue ||
    !portsAreExact ||
    !tmpfsIsExact
  ) {
    throw new Error("M4-003 isolated PostgreSQL container identity mismatch");
  }
}

export type M4_003_MigrationJournal = {
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

export function expectedM4_003_Migration(
  journal: M4_003_MigrationJournal,
  migrationSql: string
) {
  if (
    typeof journal !== "object" ||
    journal === null ||
    !Array.isArray(journal.entries) ||
    typeof migrationSql !== "string"
  ) {
    throw new Error("M4-003 migration verification metadata is malformed");
  }
  const entry = journal.entries.at(-1);
  if (
    journal.version !== "7" ||
    journal.dialect !== "postgresql" ||
    journal.entries.length !== M4_003_TEST_TARGET.migrationCount ||
    journal.entries.some(
      (candidate, index) =>
        candidate.idx !== index ||
        candidate.version !== "7" ||
        typeof candidate.when !== "number" ||
        !Number.isSafeInteger(candidate.when) ||
        typeof candidate.tag !== "string" ||
        candidate.breakpoints !== true
    ) ||
    entry?.idx !== M4_003_TEST_TARGET.migrationIndex ||
    entry.tag !== M4_003_TEST_TARGET.migrationHead ||
    entry.when !== M4_003_TEST_TARGET.migrationWhen
  ) {
    throw new Error("M4-003 source migration journal mismatch");
  }
  const hash = createHash("sha256").update(migrationSql).digest("hex");
  if (hash !== M4_003_TEST_TARGET.migrationSqlSha256) {
    throw new Error("M4-003 migration 0042 source hash mismatch");
  }
  return { tag: entry.tag, index: entry.idx, when: entry.when, hash };
}

export function assertM4_003_MigrationLedger(input: {
  rowCount: number;
  latestId: number;
  latestHash: string;
  latestCreatedAt: number;
  expected: ReturnType<typeof expectedM4_003_Migration>;
}) {
  if (
    input.rowCount !== M4_003_TEST_TARGET.migrationCount ||
    input.latestId !== M4_003_TEST_TARGET.migrationCount ||
    input.latestHash !== input.expected.hash ||
    input.latestCreatedAt !== input.expected.when
  ) {
    throw new Error("M4-003 database migration ledger head mismatch");
  }
}
