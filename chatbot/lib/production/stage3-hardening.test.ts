// biome-ignore-all lint/suspicious/useAwait: injected async doubles intentionally return resolved values.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { createMatterDocumentMaintenanceService } from "../matter-documents/maintenance";
import { createSecurityReconciliationService } from "../matter-documents/security-reconciliation";
import {
  assertExpectedDatabase,
  createMigrationPreflight,
  resolveMigrationLedger,
  safeDatabaseIdentity,
} from "./migration-preflight";
import { verifyNativeRuntime } from "./native-runtime-verifier.mjs";
import { evaluateS3SecurityState } from "./s3-security-preflight";

const runtime = { node: "v22.0.0", platform: "linux", arch: "arm64" };

test("native runtime verifier renders canvas and loads parser worker", async () => {
  const result = await verifyNativeRuntime({
    runtime,
    async loadCanvas() {
      return {
        version: "1.0",
        createCanvas: () => ({
          getContext: () => ({
            fillRect() {
              // The fake renderer intentionally records no pixel operations.
            },
            getImageData: () => ({
              data: new Uint8ClampedArray([0, 0, 0, 255]),
            }),
          }),
        }),
      };
    },
    async loadParserRuntime() {
      return {
        parserWorkerLoaded: true,
        getDocument: () => undefined,
        pdfJsVersion: "6.0",
      };
    },
  });
  assert.deepEqual(result, {
    ...runtime,
    canvasVersion: "1.0",
    parserWorker: "loaded",
    pdfJsVersion: "6.0",
    pdfJsApi: "getDocument",
  });
});

test("native runtime verifier fails closed when canvas or worker is missing", async () => {
  await assert.rejects(
    verifyNativeRuntime({
      runtime,
      async loadCanvas() {
        throw new Error("missing");
      },
      async loadParserRuntime() {
        return {
          parserWorkerLoaded: true,
          getDocument: () => undefined,
          pdfJsVersion: "6",
        };
      },
    })
  );
  await assert.rejects(
    verifyNativeRuntime({
      runtime,
      async loadCanvas() {
        return {
          version: "1",
          createCanvas: () => ({
            getContext: () => ({
              fillRect() {
                // The fake renderer intentionally records no pixel operations.
              },
              getImageData: () => ({
                data: new Uint8ClampedArray([0, 0, 0, 255]),
              }),
            }),
          }),
        };
      },
      async loadParserRuntime() {
        throw new Error("missing");
      },
    })
  );
  await assert.rejects(
    verifyNativeRuntime({
      runtime,
      async loadCanvas() {
        return {
          version: "1",
          createCanvas: () => ({
            getContext: () => ({
              fillRect() {
                // The fake renderer intentionally records no pixel operations.
              },
              getImageData: () => ({
                data: new Uint8ClampedArray([0, 0, 0, 255]),
              }),
            }),
          }),
        };
      },
      async loadParserRuntime() {
        return {
          parserWorkerLoaded: true,
          getDocument: undefined,
          pdfJsVersion: "6.0",
        };
      },
    }),
    /parser_runtime_invalid/
  );
});

test("stock migration CLI runs under tsx without top-level-await module detection", () => {
  const result = spawnSync("pnpm", ["db:preflight"], {
    cwd: resolve("."),
    env: { ...process.env, POSTGRES_URL: "" },
    encoding: "utf8",
    timeout: 15_000,
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /POSTGRES_URL is required/);
  assert.doesNotMatch(result.stderr, /top-level await|Transform failed/);
  assert.doesNotMatch(result.stdout, /top-level await|Transform failed/);
});

test("migration ledger resolver distinguishes missing, behind, current, and unknown", () => {
  const journal = [
    { when: 100, tag: "0001_initial" },
    { when: 200, tag: "0002_next" },
  ];
  assert.deepEqual(resolveMigrationLedger({ timestamp: null, journal }), {
    ledgerLatest: null,
    ledgerStatus: "missing",
  });
  assert.deepEqual(resolveMigrationLedger({ timestamp: 100, journal }), {
    ledgerLatest: "0001_initial",
    ledgerStatus: "behind",
  });
  assert.deepEqual(resolveMigrationLedger({ timestamp: 200, journal }), {
    ledgerLatest: "0002_next",
    ledgerStatus: "current",
  });
  assert.deepEqual(resolveMigrationLedger({ timestamp: 150, journal }), {
    ledgerLatest: "unknown-ledger-entry:150",
    ledgerStatus: "unknown",
  });
});

test("migration target requires an exact expected database identity", () => {
  assert.doesNotThrow(() => assertExpectedDatabase("chatbot", "chatbot"));
  assert.throws(
    () => assertExpectedDatabase("immigration_legal", "chatbot"),
    /migration_database_target_mismatch/
  );
  assert.throws(
    () => assertExpectedDatabase("chatbot", ""),
    /migration_database_target_mismatch/
  );
});

test("migration preflight displays safe database identity and omits credentials", async () => {
  assert.deepEqual(
    safeDatabaseIdentity(
      "postgres://private-user:secret@db.example:5432/immigration"
    ),
    { database: "immigration", server: "db.example:5432" }
  );
  const result = await createMigrationPreflight({
    target: () =>
      safeDatabaseIdentity(
        "postgres://private-user:secret@db.example:5432/immigration"
      ),
    async ledger() {
      return { ledgerLatest: "0022", ledgerStatus: "behind" as const };
    },
    repositoryHead: () => "0023",
  });
  assert.deepEqual(result, {
    database: "immigration",
    server: "db.example:5432",
    ledgerLatest: "0022",
    ledgerStatus: "behind",
    repositoryHead: "0023",
  });
  assert.equal(JSON.stringify(result).includes("secret"), false);
});

const healthyS3 = {
  bucketExists: true,
  region: "ap-southeast-2",
  encryption: "AES256",
  blockPublicAccess: {
    blockPublicAcls: true,
    ignorePublicAcls: true,
    blockPublicPolicy: true,
    restrictPublicBuckets: true,
  },
  policyIsPublic: false,
};
test("S3 preflight fails on missing block public access, public policy, and weak encryption", () => {
  assert.ok(
    evaluateS3SecurityState({
      expectedRegion: "ap-southeast-2",
      state: { ...healthyS3, blockPublicAccess: null },
    }).failures.includes("block_public_access_incomplete")
  );
  assert.ok(
    evaluateS3SecurityState({
      expectedRegion: "ap-southeast-2",
      state: { ...healthyS3, policyIsPublic: true },
    }).failures.includes("bucket_policy_public_or_unknown")
  );
  assert.ok(
    evaluateS3SecurityState({
      expectedRegion: "ap-southeast-2",
      state: { ...healthyS3, encryption: "NONE" },
    }).failures.includes("encryption_unacceptable")
  );
  assert.ok(
    evaluateS3SecurityState({
      expectedRegion: "ap-southeast-2",
      state: { ...healthyS3, encryption: "aws:kms" },
    }).failures.includes("encryption_unacceptable")
  );
});

test("private object authorization stays in owner-scoped handlers, not public URLs", () => {
  const storage = readFileSync(
    resolve("lib/matter-documents/storage.ts"),
    "utf8"
  );
  const documentService = readFileSync(
    resolve("lib/matter-documents/service.ts"),
    "utf8"
  );
  const documentTests = readFileSync(
    resolve("lib/matter-documents/service.test.ts"),
    "utf8"
  );
  assert.match(
    storage,
    /new PutObjectCommand\(\{[\s\S]*Bucket: configuredBucket\(\),[\s\S]*Key: key/
  );
  assert.match(
    storage,
    /new GetObjectCommand\(\{ Bucket: configuredBucket\(\), Key: key \}\)/
  );
  assert.doesNotMatch(storage, /getSignedUrl|presign|public-read|publicUrl/i);
  assert.match(documentService, /deps\.repository\.getForOwner\(input\)/);
  assert.match(documentTests, /only through private authorized route/);
  assert.match(
    documentTests,
    /assert\.equal\("url" in body\.document, false\)/
  );
});

test("scanner reconciliation is pending-only, explicit, and idempotent", async () => {
  let status: string | null = "pending";
  let scans = 0;
  const service = createSecurityReconciliationService({
    repository: {
      async getSecurityStatus() {
        return status;
      },
      async transitionSecurityStatus({ next }) {
        if (status !== "pending") {
          return false;
        }
        status = next;
        return true;
      },
    },
    scanner: {
      async scan() {
        scans += 1;
        return {
          verdict: "clean" as const,
          scannerId: "fake",
          scanId: "scan-1",
        };
      },
    },
  });
  assert.deepEqual(await service.scanAndReconcile("doc"), {
    result: "reconciled",
    verdict: "clean",
  });
  assert.deepEqual(await service.scanAndReconcile("doc"), {
    result: "already_terminal",
  });
  assert.equal(scans, 1);
});

test("maintenance defaults to dry-run and purges storage before metadata with per-record recovery", async () => {
  const cutoff = new Date("2026-01-01T00:00:00Z");
  const events: string[] = [];
  const rows = [
    {
      id: "a",
      storageKey: "secret-key-a",
      storageStatus: "stored" as const,
      processingStatus: "complete",
      deletedAt: new Date("2025-01-01"),
      updatedAt: new Date("2025-01-01"),
    },
    {
      id: "active",
      storageKey: "secret-active",
      storageStatus: "stored" as const,
      processingStatus: "complete",
      deletedAt: null,
      updatedAt: new Date("2025-01-01"),
    },
    {
      id: "processing",
      storageKey: "secret-processing",
      storageStatus: "stored" as const,
      processingStatus: "processing",
      deletedAt: new Date("2025-01-01"),
      updatedAt: new Date("2025-01-01"),
    },
    {
      id: "b",
      storageKey: "secret-key-b",
      storageStatus: "stored" as const,
      processingStatus: "complete",
      deletedAt: new Date("2025-01-01"),
      updatedAt: new Date("2025-01-01"),
    },
  ];
  const service = createMatterDocumentMaintenanceService({
    repository: {
      async listStale() {
        return rows;
      },
      async listDeleted() {
        return rows;
      },
      async hardDeleteDeleted({ documentId }) {
        events.push(`db:${documentId}`);
        return true;
      },
    },
    storage: {
      async delete({ key }) {
        events.push(`s3:${key}`);
        if (key === "secret-key-b") {
          throw new Error("private failure");
        }
      },
    },
    cleanup: {
      async cleanupUpload(id) {
        events.push(`cleanup:${id}`);
        return true;
      },
    },
  });
  const dry = await service.purgeDeleted({ cutoff, limit: 5 });
  assert.equal(dry.results[0]?.result, "would_purge");
  assert.deepEqual(events, []);
  const purged = await service.purgeDeleted({ cutoff, limit: 5, apply: true });
  assert.deepEqual(events, ["s3:secret-key-a", "db:a", "s3:secret-key-b"]);
  assert.deepEqual(
    purged.results.map((item) => item.documentId),
    ["a", "b"]
  );
  assert.equal(purged.results[1]?.result, "storage_delete_failed");
});

test("stale cleanup is dry-run first and retries each candidate independently", async () => {
  const cutoff = new Date("2026-01-01T00:00:00Z");
  const calls: string[] = [];
  const service = createMatterDocumentMaintenanceService({
    repository: {
      async listStale() {
        return [
          {
            id: "doc",
            storageKey: "never-printed",
            storageStatus: "cleanup_pending" as const,
            processingStatus: "not_started",
            deletedAt: null,
            updatedAt: new Date("2025-01-01"),
          },
        ];
      },
      async listDeleted() {
        return [];
      },
      async hardDeleteDeleted() {
        return false;
      },
    },
    storage: {
      async delete() {
        await Promise.resolve();
      },
    },
    cleanup: {
      async cleanupUpload(id) {
        calls.push(id);
        return true;
      },
    },
  });
  assert.equal(
    (await service.recoverStale({ cutoff, limit: 1 })).results[0]?.result,
    "would_recover"
  );
  assert.deepEqual(calls, []);
  assert.equal(
    (await service.recoverStale({ cutoff, limit: 1, apply: true })).results[0]
      ?.result,
    "recovered"
  );
  assert.deepEqual(calls, ["doc"]);
});

test("Phase1B has an explicit completed migration job before migration-free chatbot startup", () => {
  const compose = readFileSync(
    resolve("../docker-compose.phase1b.yml"),
    "utf8"
  );
  const localDocker = readFileSync(resolve("Dockerfile.local"), "utf8");
  const job =
    compose
      .split("  phase1b-chatbot-prepare:")[1]
      ?.split("  phase1b-chatbot:")[0] ?? "";
  const service =
    compose.split("  phase1b-chatbot:")[1]?.split("\nvolumes:")[0] ?? "";
  assert.match(localDocker.split("CMD").at(-1) ?? "", /pnpm.*start/);
  assert.doesNotMatch(localDocker.split("CMD").at(-1) ?? "", /migrat|schema/i);
  assert.match(
    job,
    /db:migrate.*--acknowledge-migrations.*--expect-database=chatbot/s
  );
  assert.match(job, /apply-phase0-chatbot-schema/);
  assert.match(
    service,
    /phase1b-chatbot-prepare:[\s\S]*condition: service_completed_successfully/
  );
});

test("migration operator uses Drizzle's schema-qualified ledger and rejects unknown timestamps", () => {
  const operator = readFileSync(
    resolve("scripts/db-migration-operator.ts"),
    "utf8"
  );
  assert.match(operator, /to_regclass\('drizzle\.__drizzle_migrations'\)/);
  assert.match(operator, /from "drizzle"\."__drizzle_migrations"/);
  assert.doesNotMatch(operator, /code === "42P01"/);
  assert.match(operator, /summary\.ledgerStatus === "unknown"/);
  assert.match(operator, /current_database\(\)/);
});

test("production service start paths never execute migrations", () => {
  const packageJson = JSON.parse(
    readFileSync(resolve("package.json"), "utf8")
  ) as { scripts: Record<string, string> };
  const docker = readFileSync(resolve("Dockerfile.production"), "utf8");
  const localDocker = readFileSync(resolve("Dockerfile.local"), "utf8");
  assert.doesNotMatch(packageJson.scripts.start, /migrat|schema/i);
  assert.doesNotMatch(packageJson.scripts["prod:start"], /migrat|schema/i);
  assert.doesNotMatch(docker.split("CMD").at(-1) ?? "", /migrat|schema/i);
  assert.doesNotMatch(localDocker.split("CMD").at(-1) ?? "", /migrat|schema/i);
});

test("stale database query excludes terminal storage_failed rows", () => {
  const queries = readFileSync(resolve("lib/db/queries.ts"), "utf8");
  const staleQuery =
    queries
      .split(
        "export async function listStaleMatterDocumentMaintenanceCandidates"
      )[1]
      ?.split(
        "export async function listSoftDeletedMatterDocumentPurgeCandidates"
      )[0] ?? "";
  assert.match(staleQuery, /"uploading", "cleanup_pending"/);
  assert.doesNotMatch(staleQuery, /"storage_failed"/);
});

test("stale maintenance applies cutoff, deterministic order, and batch limit", async () => {
  const cutoff = new Date("2026-01-01T00:00:00Z");
  const calls: string[] = [];
  const service = createMatterDocumentMaintenanceService({
    repository: {
      async listStale() {
        return [
          {
            id: "later",
            storageKey: "k",
            storageStatus: "uploading" as const,
            processingStatus: "not_started",
            deletedAt: null,
            updatedAt: new Date("2025-12-01"),
          },
          {
            id: "too-new",
            storageKey: "k",
            storageStatus: "uploading" as const,
            processingStatus: "not_started",
            deletedAt: null,
            updatedAt: new Date("2026-02-01"),
          },
          {
            id: "first",
            storageKey: "k",
            storageStatus: "uploading" as const,
            processingStatus: "not_started",
            deletedAt: null,
            updatedAt: new Date("2025-01-01"),
          },
          {
            id: "already-cleaned",
            storageKey: "k",
            storageStatus: "storage_failed" as const,
            processingStatus: "not_started",
            deletedAt: null,
            updatedAt: new Date("2025-01-02"),
          },
        ];
      },
      async listDeleted() {
        return [];
      },
      async hardDeleteDeleted() {
        return false;
      },
    },
    storage: {
      async delete() {
        await Promise.resolve();
      },
    },
    cleanup: {
      async cleanupUpload(id) {
        calls.push(id);
        return true;
      },
    },
  });
  const result = await service.recoverStale({ cutoff, limit: 5, apply: true });
  assert.equal(result.scanned, 2);
  assert.deepEqual(calls, ["first", "later"]);
});

test("terminal storage_failed records are not sent through cleanup again", async () => {
  const cutoff = new Date("2026-01-01T00:00:00Z");
  let cleanupCalls = 0;
  const service = createMatterDocumentMaintenanceService({
    repository: {
      async listStale() {
        return [
          {
            id: "cleaned",
            storageKey: "private-key",
            storageStatus: "storage_failed" as const,
            processingStatus: "not_started",
            deletedAt: null,
            updatedAt: new Date("2025-01-01"),
          },
        ];
      },
      async listDeleted() {
        return [];
      },
      async hardDeleteDeleted() {
        return false;
      },
    },
    storage: {
      async delete() {
        await Promise.resolve();
      },
    },
    cleanup: {
      async cleanupUpload() {
        cleanupCalls += 1;
        return true;
      },
    },
  });
  const first = await service.recoverStale({ cutoff, limit: 10, apply: true });
  const second = await service.recoverStale({ cutoff, limit: 10, apply: true });
  assert.deepEqual(first, { scanned: 0, results: [] });
  assert.deepEqual(second, { scanned: 0, results: [] });
  assert.equal(cleanupCalls, 0);
});
