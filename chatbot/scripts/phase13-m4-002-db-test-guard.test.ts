import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertM4DockerIdentity,
  assertM4MigrationLedger,
  type DockerContainerIdentity,
  expectedM4Migration,
  M4_002_TEST_APPROVAL,
  M4_002_TEST_TARGET,
  parseM4DatabaseUrl,
  parseM4DockerContainerInspection,
  parseM4DockerImageInspection,
  parseM4DockerMountsInspection,
  requireM4IntegrationApproval,
} from "./phase13-m4-002-db-test-guard";

test("M4-002 database URL accepts only the exact isolated target", () => {
  const accepted = parseM4DatabaseUrl(
    "postgresql://phase13_m4_tester:synthetic@127.0.0.1:55432/immigration_ai_phase13_m4_002_test"
  );
  assert.deepEqual(accepted, {
    host: M4_002_TEST_TARGET.host,
    port: M4_002_TEST_TARGET.port,
    database: M4_002_TEST_TARGET.database,
    role: M4_002_TEST_TARGET.role,
  });

  for (const target of [
    "postgresql://phase13_m4_tester:synthetic@127.0.0.1:5432/immigration_ai_phase13_m4_002_test",
    "postgresql://phase13_m4_tester:synthetic@127.0.0.1:55432/immigration_legal",
    "postgresql://rico_local:synthetic@127.0.0.1:55432/immigration_ai_phase13_m4_002_test",
    "postgresql://phase13_m4_tester:synthetic@localhost:55432/immigration_ai_phase13_m4_002_test",
    "postgresql://phase13_m4_tester:synthetic@127.0.0.1:55432/immigration_ai_phase13_m4_002_test?host=127.0.0.1",
  ]) {
    assert.throws(() => parseM4DatabaseUrl(target));
  }
});

test("M4-002 integration requires its explicit test-only approval token", () => {
  assert.throws(() => requireM4IntegrationApproval(undefined));
  assert.throws(() => requireM4IntegrationApproval("true"));
  assert.doesNotThrow(() => requireM4IntegrationApproval(M4_002_TEST_APPROVAL));
});

test("M4-002 launcher recognizes only the named running PostgreSQL container", () => {
  const image = {
    Id: M4_002_TEST_TARGET.imageDigest,
    RepoDigests: null,
  };
  const container = {
    Name: `/${M4_002_TEST_TARGET.container}`,
    Image: M4_002_TEST_TARGET.imageDigest,
    Config: { Image: M4_002_TEST_TARGET.image },
    HostConfig: {
      Tmpfs: {
        [M4_002_TEST_TARGET.dataDirectory]: M4_002_TEST_TARGET.tmpfsOptions,
      },
    },
    Labels: {
      [M4_002_TEST_TARGET.dockerLabel]: M4_002_TEST_TARGET.dockerLabelValue,
    },
    Mounts: [],
    State: { Running: true },
    NetworkSettings: {
      Ports: {
        "5432/tcp": [
          {
            HostIp: M4_002_TEST_TARGET.host,
            HostPort: M4_002_TEST_TARGET.port,
          },
        ],
      },
    },
  };
  assert.doesNotThrow(() => assertM4DockerIdentity(container, image));

  const invalidContainers: DockerContainerIdentity[] = [
    { ...container, Name: "/another-postgres" },
    { ...container, Image: "sha256:wrong-image" },
    { ...container, Config: { Image: "postgres:16" } },
    {
      ...container,
      NetworkSettings: {
        Ports: {
          "5432/tcp": [
            { HostIp: "0.0.0.0", HostPort: M4_002_TEST_TARGET.port },
          ],
        },
      },
    },
    {
      ...container,
      NetworkSettings: {
        Ports: {
          "5432/tcp": [{ HostIp: M4_002_TEST_TARGET.host, HostPort: "5432" }],
        },
      },
    },
    {
      ...container,
      NetworkSettings: {
        Ports: {
          "5432/tcp": [
            {
              HostIp: M4_002_TEST_TARGET.host,
              HostPort: M4_002_TEST_TARGET.port,
            },
            { HostIp: "0.0.0.0", HostPort: "55433" },
          ],
        },
      },
    },
    {
      ...container,
      NetworkSettings: {
        Ports: {
          "5432/tcp": [
            {
              HostIp: M4_002_TEST_TARGET.host,
              HostPort: M4_002_TEST_TARGET.port,
            },
          ],
          "8080/tcp": [{ HostIp: "0.0.0.0", HostPort: "8080" }],
        },
      },
    },
  ];
  for (const invalid of invalidContainers) {
    assert.throws(() => assertM4DockerIdentity(invalid, image));
  }

  assert.throws(() =>
    assertM4DockerIdentity(container, { ...image, Id: "wrong" })
  );
});

test("M4-002 Docker guard rejects missing or incorrect isolation labels", () => {
  const image = { Id: M4_002_TEST_TARGET.imageDigest };
  const approved = {
    Name: `/${M4_002_TEST_TARGET.container}`,
    Image: M4_002_TEST_TARGET.imageDigest,
    Config: { Image: M4_002_TEST_TARGET.image },
    HostConfig: {
      Tmpfs: {
        [M4_002_TEST_TARGET.dataDirectory]: M4_002_TEST_TARGET.tmpfsOptions,
      },
    },
    Labels: {
      [M4_002_TEST_TARGET.dockerLabel]: M4_002_TEST_TARGET.dockerLabelValue,
    },
    Mounts: [],
    State: { Running: true },
    NetworkSettings: {
      Ports: {
        "5432/tcp": [
          {
            HostIp: M4_002_TEST_TARGET.host,
            HostPort: M4_002_TEST_TARGET.port,
          },
        ],
      },
    },
  };
  assert.doesNotThrow(() => assertM4DockerIdentity(approved, image));
  assert.throws(() =>
    assertM4DockerIdentity({ ...approved, Labels: {} }, image)
  );
  assert.throws(() =>
    assertM4DockerIdentity(
      {
        ...approved,
        Labels: { [M4_002_TEST_TARGET.dockerLabel]: "other-purpose" },
      },
      image
    )
  );
});

test("M4-002 Docker guard requires tmpfs storage and rejects persistent mounts", () => {
  const image = { Id: M4_002_TEST_TARGET.imageDigest };
  const approved = {
    Name: `/${M4_002_TEST_TARGET.container}`,
    Image: M4_002_TEST_TARGET.imageDigest,
    Config: { Image: M4_002_TEST_TARGET.image },
    Labels: {
      [M4_002_TEST_TARGET.dockerLabel]: M4_002_TEST_TARGET.dockerLabelValue,
    },
    HostConfig: {
      Tmpfs: {
        [M4_002_TEST_TARGET.dataDirectory]: M4_002_TEST_TARGET.tmpfsOptions,
      },
    },
    Mounts: [],
    State: { Running: true },
    NetworkSettings: {
      Ports: {
        "5432/tcp": [
          {
            HostIp: M4_002_TEST_TARGET.host,
            HostPort: M4_002_TEST_TARGET.port,
          },
        ],
      },
    },
  };
  assert.throws(() =>
    assertM4DockerIdentity({ ...approved, HostConfig: { Tmpfs: {} } }, image)
  );
  assert.throws(() =>
    assertM4DockerIdentity({ ...approved, Mounts: undefined }, image)
  );
  assert.throws(() =>
    assertM4DockerIdentity({ ...approved, Mounts: null }, image)
  );
  assert.throws(() =>
    assertM4DockerIdentity(
      {
        ...approved,
        HostConfig: {
          Tmpfs: { [M4_002_TEST_TARGET.dataDirectory]: "rw,size=1g" },
        },
      },
      image
    )
  );

  for (const mount of [
    {
      Type: "volume",
      Destination: M4_002_TEST_TARGET.dataDirectory,
      Source: "phase13-persistent-volume",
      RW: true,
    },
    {
      Type: "bind",
      Destination: M4_002_TEST_TARGET.dataDirectory,
      Source: "/host/postgres-data",
      RW: true,
    },
    {
      Type: "tmpfs",
      Destination: M4_002_TEST_TARGET.dataDirectory,
      Source: "",
      RW: true,
    },
  ]) {
    assert.throws(
      () => assertM4DockerIdentity({ ...approved, Mounts: [mount] }, image),
      /M4-002 isolated PostgreSQL container identity mismatch/u
    );
  }
});

test("M4-002 Docker inspection parsers reject malformed metadata generically", () => {
  const goodContainerInspection = [
    `/${M4_002_TEST_TARGET.container}`,
    M4_002_TEST_TARGET.imageDigest,
    M4_002_TEST_TARGET.image,
    "true",
    `5432/tcp~${M4_002_TEST_TARGET.host}~${M4_002_TEST_TARGET.port};`,
    M4_002_TEST_TARGET.dockerLabelValue,
    M4_002_TEST_TARGET.tmpfsOptions,
    "END",
  ].join("|");
  const parsedContainer = parseM4DockerContainerInspection(
    goodContainerInspection,
    "[]"
  );
  const parsedImage = parseM4DockerImageInspection(
    `${M4_002_TEST_TARGET.imageDigest}|null`
  );
  assert.doesNotThrow(() =>
    assertM4DockerIdentity(parsedContainer, parsedImage)
  );
  assert.deepEqual(parseM4DockerMountsInspection("null"), []);
  for (const malformed of [
    "secret-bearing unexpected output",
    goodContainerInspection.replace("true|", "unknown|"),
  ]) {
    assert.throws(
      () => parseM4DockerContainerInspection(malformed, "[]"),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(
          error.message,
          "Docker identity inspection metadata is malformed"
        );
        assert.equal(error.message.includes("secret-bearing"), false);
        return true;
      }
    );
  }
  for (const malformedMounts of ["not-json", "{}", "[{}]"]) {
    assert.throws(() => parseM4DockerMountsInspection(malformedMounts), {
      message: "Docker identity inspection metadata is malformed",
    });
  }
  assert.throws(() => parseM4DockerImageInspection("sha256:bad|not-json"), {
    message: "Docker identity inspection metadata is malformed",
  });
});

test("M4-002 ledger guard requires the exact journal head and file hash", () => {
  const sql = "synthetic migration text";
  const journal = {
    entries: Array.from(
      { length: M4_002_TEST_TARGET.migrationCount },
      (_, idx) => ({
        idx,
        when:
          idx === M4_002_TEST_TARGET.migrationIndex ? 1_798_000_000_000 : idx,
        tag:
          idx === M4_002_TEST_TARGET.migrationIndex
            ? M4_002_TEST_TARGET.migrationHead
            : `synthetic_${idx}`,
        breakpoints: true,
      })
    ),
  };
  const expected = expectedM4Migration(journal, sql);
  assert.doesNotThrow(() =>
    assertM4MigrationLedger({
      rowCount: M4_002_TEST_TARGET.migrationCount,
      latestId: M4_002_TEST_TARGET.migrationCount,
      latestHash: expected.hash,
      latestCreatedAt: expected.when,
      expected,
    })
  );
  assert.throws(() =>
    assertM4MigrationLedger({
      rowCount: M4_002_TEST_TARGET.migrationCount - 1,
      latestId: M4_002_TEST_TARGET.migrationCount - 1,
      latestHash: expected.hash,
      latestCreatedAt: expected.when,
      expected,
    })
  );
});
