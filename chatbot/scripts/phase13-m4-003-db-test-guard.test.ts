// biome-ignore-all lint/suspicious/noMisplacedAssertion: helpers are invoked only by offline guard tests.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import {
  assertM4_003_DockerIdentity,
  assertM4_003_MigrationLedger,
  expectedM4_003_Migration,
  M4_003_TEST_APPROVAL,
  M4_003_TEST_TARGET,
  parseM4_003_DatabaseUrl,
  parseM4_003_DockerContainerInspection,
  parseM4_003_DockerImageInspection,
  requireM4_003_IntegrationApproval,
} from "./phase13-m4-003-db-test-guard";

const imageId = M4_003_TEST_TARGET.imageId;
const manifestDigest = `sha256:${"1".repeat(64)}`;

type DockerFixture = {
  Name: string;
  Image: string;
  Config: { Image: string; Labels: Record<string, string> };
  HostConfig: {
    Tmpfs: Record<string, string>;
    PortBindings: Record<
      string,
      Array<{ HostIp: string; HostPort: string }> | null
    >;
    Binds: string[] | null;
    Mounts: Array<{
      Type: string;
      Source: string;
      Destination?: string;
      Target?: string;
      RW: boolean;
    }> | null;
  };
  Mounts: Array<{
    Type: string;
    Source: string;
    Destination?: string;
    Target?: string;
    RW: boolean;
  }> | null;
  State: { Running: boolean };
  NetworkSettings: {
    Ports: Record<string, Array<{ HostIp: string; HostPort: string }> | null>;
  };
};

function dockerFixture(): DockerFixture {
  return {
    Name: `/${M4_003_TEST_TARGET.container}`,
    Image: imageId,
    Config: {
      Image: M4_003_TEST_TARGET.image,
      Labels: {
        [M4_003_TEST_TARGET.dockerLabel]: M4_003_TEST_TARGET.dockerLabelValue,
      },
    },
    HostConfig: {
      Tmpfs: {
        [M4_003_TEST_TARGET.dataDirectory]: M4_003_TEST_TARGET.tmpfsOptions,
      },
      PortBindings: {
        "5432/tcp": [{ HostIp: M4_003_TEST_TARGET.host, HostPort: "55433" }],
      },
      Binds: null,
      Mounts: null,
    },
    Mounts: [],
    State: { Running: true },
    NetworkSettings: {
      Ports: {
        "5432/tcp": [{ HostIp: M4_003_TEST_TARGET.host, HostPort: "55433" }],
      },
    },
  };
}

function inspectContainer(value: unknown) {
  return parseM4_003_DockerContainerInspection(JSON.stringify([value]));
}

function dockerImageFixture(
  repoDigests: string[] | null = [
    `docker.io/library/postgres@${manifestDigest}`,
  ]
) {
  return parseM4_003_DockerImageInspection(
    JSON.stringify([
      {
        Id: imageId,
        RepoDigests: repoDigests,
      },
    ])
  );
}

function expectDockerRejected(
  container: unknown,
  image = dockerImageFixture()
) {
  assert.throws(() =>
    assertM4_003_DockerIdentity(inspectContainer(container), image)
  );
}

// biome-ignore lint/style/noDoneCallback: nested tests use Node's test context.
test("M4-003 isolated PostgreSQL guard is offline and fail-closed", async (t) => {
  await t.test(
    "accepts only the proposed explicit loopback database URL",
    () => {
      assert.deepEqual(
        parseM4_003_DatabaseUrl(
          "postgresql://phase13_m4_003_tester:secret@127.0.0.1:55433/immigration_ai_phase13_m4_003_test"
        ),
        {
          host: "127.0.0.1",
          port: "55433",
          database: "immigration_ai_phase13_m4_003_test",
          role: "phase13_m4_003_tester",
        }
      );
      for (const url of [
        "postgres://phase13_m4_003_tester:secret@localhost:55433/immigration_ai_phase13_m4_003_test",
        "postgres://phase13_m4_003_tester:secret@127.0.0.1:5432/immigration_ai_phase13_m4_003_test",
        "postgres://phase13_m4_003_tester:secret@127.0.0.1:55433/immigration_legal",
        "postgres://rico:secret@127.0.0.1:55433/immigration_ai_phase13_m4_003_test",
        "postgres://phase13_m4_003_tester:secret@127.0.0.1:55433/immigration_ai_phase13_m4_003_test?sslmode=require",
      ]) {
        assert.throws(() => parseM4_003_DatabaseUrl(url));
      }
    }
  );

  await t.test("requires a separate explicit M4-003 approval token", () => {
    assert.equal(M4_003_TEST_APPROVAL, "RUN_M4_003_POSTGRES_INTEGRATION");
    requireM4_003_IntegrationApproval(M4_003_TEST_APPROVAL);
    assert.throws(() => requireM4_003_IntegrationApproval(undefined));
    assert.throws(() =>
      requireM4_003_IntegrationApproval("RUN_M4_002_POSTGRES_INTEGRATION")
    );
  });

  await t.test(
    "accepts approved Docker identity with empty or null --tmpfs Mounts representation",
    () => {
      const container = inspectContainer(dockerFixture());
      assertM4_003_DockerIdentity(container, dockerImageFixture());
      assert.deepEqual(container.Mounts, []);

      const nullMounts = dockerFixture();
      nullMounts.Mounts = null;
      const normalizedNullMounts = inspectContainer(nullMounts);
      assert.deepEqual(normalizedNullMounts.Mounts, []);
      assertM4_003_DockerIdentity(normalizedNullMounts, dockerImageFixture());

      // Docker inspect may omit HostConfig.Mounts entirely for --tmpfs.
      // The top-level Mounts array must still be present and validated.
      const omittedHostMounts = dockerFixture();
      Reflect.deleteProperty(omittedHostMounts.HostConfig, "Mounts");
      assert.equal(
        Object.hasOwn(omittedHostMounts.HostConfig, "Mounts"),
        false
      );
      const normalizedOmitted = inspectContainer(omittedHostMounts);
      assert.deepEqual(normalizedOmitted.HostConfig?.Mounts, []);
      assertM4_003_DockerIdentity(normalizedOmitted, dockerImageFixture());
    }
  );

  await t.test(
    "accepts null, empty, or different valid registry manifest RepoDigests",
    () => {
      for (const repoDigests of [
        null,
        [],
        [`docker.io/library/postgres@${manifestDigest}`],
      ]) {
        const image = dockerImageFixture(repoDigests);
        assert.equal(image.Id, imageId);
        assertM4_003_DockerIdentity(inspectContainer(dockerFixture()), image);
      }
      assert.notEqual(manifestDigest, imageId);
    }
  );

  await t.test("rejects a missing or incorrect isolation label", () => {
    const missing = dockerFixture();
    missing.Config.Labels = {};
    expectDockerRejected(missing);
    const incorrect = dockerFixture();
    incorrect.Config.Labels[M4_003_TEST_TARGET.dockerLabel] = "other";
    expectDockerRejected(incorrect);
  });

  await t.test("rejects missing or incorrect tmpfs configuration", () => {
    const missing = dockerFixture();
    missing.HostConfig.Tmpfs = {};
    expectDockerRejected(missing);
    const incorrect = dockerFixture();
    incorrect.HostConfig.Tmpfs[M4_003_TEST_TARGET.dataDirectory] = "rw,size=1g";
    expectDockerRejected(incorrect);
  });

  await t.test("rejects persistent or contradictory database mounts", () => {
    for (const type of ["volume", "bind"]) {
      const persistent = dockerFixture();
      persistent.Mounts = [
        {
          Type: type,
          Source: "/host/persistent-data",
          Destination: M4_003_TEST_TARGET.dataDirectory,
          RW: true,
        },
      ];
      expectDockerRejected(persistent);
    }
    const parentBind = dockerFixture();
    parentBind.HostConfig.Binds = ["/host/postgres:/var/lib/postgresql:rw"];
    expectDockerRejected(parentBind);
    const hostMount = dockerFixture();
    hostMount.HostConfig.Mounts = [
      {
        Type: "volume",
        Source: "durable",
        Target: M4_003_TEST_TARGET.dataDirectory,
        RW: true,
      },
    ];
    expectDockerRejected(hostMount);
    const malformedBind = dockerFixture();
    malformedBind.HostConfig.Binds = ["malformed"];
    assert.throws(() => inspectContainer(malformedBind));
  });

  await t.test(
    "rejects malformed or incomplete Docker inspection metadata",
    () => {
      assert.throws(() => parseM4_003_DockerContainerInspection("not-json"));
      assert.throws(() => parseM4_003_DockerContainerInspection("{}"));
      const malformed = dockerFixture();
      malformed.NetworkSettings.Ports["5432/tcp"] = [
        { HostIp: "0.0.0.0", HostPort: "55433" },
      ];
      expectDockerRejected(malformed);
      const incomplete = dockerFixture();
      (incomplete as { Mounts?: unknown }).Mounts = undefined;
      expectDockerRejected(incomplete);
      const malformedMounts = dockerFixture();
      (malformedMounts as { Mounts?: unknown }).Mounts = {};
      expectDockerRejected(malformedMounts);
      const arbitraryMounts = dockerFixture();
      (arbitraryMounts as { Mounts?: unknown }).Mounts = "none";
      expectDockerRejected(arbitraryMounts);
      // HostConfig.Mounts may be omitted or null, not malformed.
      const malformedHostMounts = dockerFixture();
      (malformedHostMounts.HostConfig as { Mounts?: unknown }).Mounts = {};
      assert.throws(() => inspectContainer(malformedHostMounts));
    }
  );

  await t.test("rejects container and image identity mismatches", () => {
    const wrongName = dockerFixture();
    wrongName.Name = "/another-container";
    expectDockerRejected(wrongName);
    const wrongTag = dockerFixture();
    wrongTag.Config.Image = "postgres:16";
    expectDockerRejected(wrongTag);
    const wrongContainerImageId = dockerFixture();
    wrongContainerImageId.Image = `sha256:${"0".repeat(64)}`;
    expectDockerRejected(wrongContainerImageId);
    expectDockerRejected(dockerFixture(), {
      Id: `sha256:${"0".repeat(64)}`,
      RepoDigests: [],
    });
    const wrongLabel = dockerFixture();
    wrongLabel.Config.Labels[M4_003_TEST_TARGET.dockerLabel] = "other";
    expectDockerRejected(wrongLabel);
  });

  await t.test("rejects nonloopback and incorrect published ports", () => {
    const wrongPort = dockerFixture();
    wrongPort.HostConfig.PortBindings["5432/tcp"]?.splice(0, 1, {
      HostIp: "0.0.0.0",
      HostPort: "55433",
    });
    expectDockerRejected(wrongPort);
    const incorrectPort = dockerFixture();
    incorrectPort.HostConfig.PortBindings["5432/tcp"]?.splice(0, 1, {
      HostIp: M4_003_TEST_TARGET.host,
      HostPort: "55434",
    });
    expectDockerRejected(incorrectPort);
    const extraPort = dockerFixture();
    (extraPort.NetworkSettings.Ports as Record<string, unknown>)["5433/tcp"] =
      null;
    expectDockerRejected(extraPort);
  });

  await t.test("rejects malformed registry RepoDigests metadata", () => {
    for (const repoDigests of [
      {},
      ["not-a-repo-digest"],
      [`Docker.io/library/postgres@${manifestDigest}`],
      ["docker.io/library/postgres@sha256:abc"],
      [null],
      1,
    ]) {
      assert.throws(() =>
        parseM4_003_DockerImageInspection(
          JSON.stringify([{ Id: imageId, RepoDigests: repoDigests }])
        )
      );
    }
    assert.throws(() =>
      parseM4_003_DockerImageInspection(JSON.stringify([{ Id: imageId }]))
    );
  });

  await t.test(
    "pins migration journal, SQL identity and database ledger",
    async () => {
      const journal = JSON.parse(
        await readFile(resolve("lib/db/migrations/meta/_journal.json"), "utf8")
      );
      const migration = await readFile(
        resolve("lib/db/migrations/0042_phase13_m4_003_human_messaging.sql"),
        "utf8"
      );
      const expected = expectedM4_003_Migration(journal, migration);
      assert.equal(expected.hash, M4_003_TEST_TARGET.migrationSqlSha256);
      assertM4_003_MigrationLedger({
        rowCount: 43,
        latestId: 43,
        latestHash: expected.hash,
        latestCreatedAt: expected.when,
        expected,
      });
      assert.throws(() =>
        expectedM4_003_Migration(journal, `${migration}\n-- changed`)
      );
      assert.throws(() => expectedM4_003_Migration({} as never, migration));
      assert.throws(() =>
        assertM4_003_MigrationLedger({
          rowCount: 42,
          latestId: 42,
          latestHash: expected.hash,
          latestCreatedAt: expected.when,
          expected,
        })
      );
    }
  );
});
