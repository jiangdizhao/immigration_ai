import { createHash } from "node:crypto";

export const M4_002_TEST_TARGET = {
  host: "127.0.0.1",
  port: "55432",
  database: "immigration_ai_phase13_m4_002_test",
  role: "phase13_m4_tester",
  migrationCount: 42,
  migrationIndex: 41,
  migrationHead: "0041_phase13_m4_002_staff_assignments",
  container: "phase13-m4-002-pg",
  image: "postgres:17",
  imageDigest:
    "sha256:82903352d6faf8f8a318bc4353d1cb1db67d4a5ff968d2799b2718e2cb00afa2",
  dockerLabel: "immigration-ai.phase13",
  dockerLabelValue: "m4-002-isolated-test",
  dataDirectory: "/var/lib/postgresql/data",
  tmpfsOptions: "rw,nosuid,nodev,size=1g",
} as const;

export const M4_002_TEST_APPROVAL = "RUN_M4_002_POSTGRES_INTEGRATION";

export type ParsedM4DatabaseUrl = {
  host: string;
  port: string;
  database: string;
  role: string;
};

export function parseM4DatabaseUrl(raw: string): ParsedM4DatabaseUrl {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("M4-002 integration target URL is invalid");
  }
  const database = parsed.pathname.replace(/^\//u, "");
  const role = decodeURIComponent(parsed.username);
  if (
    !["postgres:", "postgresql:"].includes(parsed.protocol) ||
    parsed.hostname !== M4_002_TEST_TARGET.host ||
    parsed.port !== M4_002_TEST_TARGET.port ||
    database !== M4_002_TEST_TARGET.database ||
    role !== M4_002_TEST_TARGET.role ||
    parsed.search.length > 0 ||
    parsed.hash.length > 0
  ) {
    throw new Error("M4-002 integration target identity mismatch");
  }
  return {
    host: parsed.hostname,
    port: parsed.port,
    database,
    role,
  };
}

export function requireM4IntegrationApproval(value: string | undefined) {
  if (value !== M4_002_TEST_APPROVAL) {
    throw new Error("M4-002 integration approval token is missing");
  }
}

export type DockerContainerIdentity = {
  Name?: string;
  Image?: string;
  Config?: { Image?: string };
  HostConfig?: { Tmpfs?: Record<string, string> | null };
  Labels?: Record<string, string | undefined> | null;
  Mounts?: DockerMountIdentity[] | null;
  State?: { Running?: boolean };
  NetworkSettings?: {
    Ports?: Record<
      string,
      Array<{ HostIp?: string; HostPort?: string }> | null
    >;
  };
};

export type DockerMountIdentity = {
  Type: string;
  Destination: string;
  Source: string;
  RW: boolean;
};

export type DockerImageIdentity = {
  Id?: string;
  RepoDigests?: string[] | null;
};

function malformedDockerInspection(): never {
  throw new Error("Docker identity inspection metadata is malformed");
}

export function parseM4DockerMountsInspection(
  output: string
): DockerMountIdentity[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch {
    return malformedDockerInspection();
  }
  if (parsed === null) {
    return [];
  }
  if (!Array.isArray(parsed)) {
    return malformedDockerInspection();
  }
  return parsed.map((value) => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return malformedDockerInspection();
    }
    const mount = value as Record<string, unknown>;
    if (
      typeof mount.Type !== "string" ||
      typeof mount.Destination !== "string" ||
      typeof mount.Source !== "string" ||
      typeof mount.RW !== "boolean"
    ) {
      return malformedDockerInspection();
    }
    return {
      Type: mount.Type,
      Destination: mount.Destination,
      Source: mount.Source,
      RW: mount.RW,
    };
  });
}

export function parseM4DockerContainerInspection(
  output: string,
  mountsOutput: string
): DockerContainerIdentity {
  const fields = output.split("|");
  if (fields.length !== 8 || fields[7] !== "END") {
    return malformedDockerInspection();
  }
  const [name, imageId, imageTag, running, rawBindings, label, tmpfsOptions] =
    fields;
  if (
    !name ||
    !imageId ||
    !/^sha256:[0-9a-f]{64}$/u.test(imageId) ||
    !imageTag ||
    (running !== "true" && running !== "false")
  ) {
    return malformedDockerInspection();
  }

  const ports: NonNullable<
    NonNullable<DockerContainerIdentity["NetworkSettings"]>["Ports"]
  > = {};
  if (rawBindings) {
    for (const record of rawBindings.split(";")) {
      if (!record) {
        continue;
      }
      const parts = record.split("~");
      if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
        return malformedDockerInspection();
      }
      let portBindings = ports[parts[0]];
      if (!portBindings) {
        portBindings = [];
        ports[parts[0]] = portBindings;
      }
      portBindings.push({ HostIp: parts[1], HostPort: parts[2] });
    }
  }

  return {
    Name: name,
    Image: imageId,
    Config: { Image: imageTag },
    HostConfig: {
      Tmpfs: {
        [M4_002_TEST_TARGET.dataDirectory]: tmpfsOptions,
      },
    },
    Labels: { [M4_002_TEST_TARGET.dockerLabel]: label },
    Mounts: parseM4DockerMountsInspection(mountsOutput),
    State: { Running: running === "true" },
    NetworkSettings: { Ports: ports },
  };
}

export function parseM4DockerImageInspection(
  output: string
): DockerImageIdentity {
  const fields = output.split("|");
  if (fields.length !== 2 || !/^sha256:[0-9a-f]{64}$/u.test(fields[0] ?? "")) {
    return malformedDockerInspection();
  }
  let repoDigests: unknown;
  try {
    repoDigests = JSON.parse(fields[1] ?? "");
  } catch {
    return malformedDockerInspection();
  }
  if (
    repoDigests !== null &&
    (!Array.isArray(repoDigests) ||
      repoDigests.some((value) => typeof value !== "string"))
  ) {
    return malformedDockerInspection();
  }
  return { Id: fields[0], RepoDigests: repoDigests as string[] | null };
}

export function assertM4DockerIdentity(
  container: DockerContainerIdentity,
  image: DockerImageIdentity
) {
  const publishedPorts = container.NetworkSettings?.Ports ?? {};
  const bindings = publishedPorts["5432/tcp"] ?? [];
  const mounts = container.Mounts;
  const mountsAreConsistent =
    Array.isArray(mounts) &&
    mounts.every(
      (mount) =>
        typeof mount.Type === "string" &&
        typeof mount.Destination === "string" &&
        typeof mount.Source === "string" &&
        typeof mount.RW === "boolean"
    ) &&
    !mounts.some(
      (mount) => mount.Destination === M4_002_TEST_TARGET.dataDirectory
    );
  const portsAreExact =
    Object.keys(publishedPorts).length === 1 &&
    publishedPorts["5432/tcp"]?.length === 1 &&
    bindings[0]?.HostIp === M4_002_TEST_TARGET.host &&
    bindings[0]?.HostPort === M4_002_TEST_TARGET.port;
  const tmpfsIsExact =
    container.HostConfig?.Tmpfs?.[M4_002_TEST_TARGET.dataDirectory] ===
      M4_002_TEST_TARGET.tmpfsOptions && mountsAreConsistent;
  if (
    container.Name !== `/${M4_002_TEST_TARGET.container}` ||
    container.Config?.Image !== M4_002_TEST_TARGET.image ||
    container.State?.Running !== true ||
    container.Image !== M4_002_TEST_TARGET.imageDigest ||
    image.Id !== M4_002_TEST_TARGET.imageDigest ||
    container.Labels?.[M4_002_TEST_TARGET.dockerLabel] !==
      M4_002_TEST_TARGET.dockerLabelValue ||
    !portsAreExact ||
    !tmpfsIsExact
  ) {
    throw new Error("M4-002 isolated PostgreSQL container identity mismatch");
  }
}

export type M4MigrationJournal = {
  entries: Array<{
    idx: number;
    when: number;
    tag: string;
    breakpoints: boolean;
  }>;
};

export function expectedM4Migration(journal: M4MigrationJournal, sql: string) {
  const entry = journal.entries.at(-1);
  if (
    journal.entries.length !== M4_002_TEST_TARGET.migrationCount ||
    entry?.idx !== M4_002_TEST_TARGET.migrationIndex ||
    entry.tag !== M4_002_TEST_TARGET.migrationHead
  ) {
    throw new Error("M4-002 source migration head mismatch");
  }
  return {
    tag: entry.tag,
    index: entry.idx,
    when: entry.when,
    hash: createHash("sha256").update(sql).digest("hex"),
  };
}

export function assertM4MigrationLedger(input: {
  rowCount: number;
  latestId: number;
  latestHash: string;
  latestCreatedAt: number;
  expected: ReturnType<typeof expectedM4Migration>;
}) {
  if (
    input.rowCount !== M4_002_TEST_TARGET.migrationCount ||
    input.latestId !== M4_002_TEST_TARGET.migrationCount ||
    input.latestHash !== input.expected.hash ||
    input.latestCreatedAt !== input.expected.when
  ) {
    throw new Error("M4-002 database migration ledger head mismatch");
  }
}
