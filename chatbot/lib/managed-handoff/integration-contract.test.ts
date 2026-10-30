import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  denyAllProfessionalReviewAuthority,
  unavailableProfessionalCredentialVerifier,
} from "@/lib/professional-review/authority";
import { isProfessionalReviewEnabled } from "@/lib/professional-review/policy";
import { unavailableManagedTargetProvider as provider } from "@/lib/professional-review/target-provider";
import { isManagedHandoffEnabled } from "./policy";
import { denyAllManagedHandoffPorts } from "./ports";

/**
 * SYS-18 and the freeze guards for the M4-006/M4-007 round.
 *
 * These are static/structural assertions: they prove that this round introduced no
 * production authority, no schema or migration change, no serving-path coupling
 * and no dependency on the frozen M4-005 implementation beyond a read-only port.
 */
const here = dirname(fileURLToPath(import.meta.url));
const chatbotRoot = resolve(here, "../..");
const repoRoot = resolve(chatbotRoot, "..");
const CONTRACT = resolve(
  repoRoot,
  "docs/agent-memory/tasks/PHASE13_M4_006_007_FROZEN_ACCEPTANCE_CONTRACT.md"
);
const NEW_MODULE_DIRS = [
  "lib/managed-target",
  "lib/professional-review",
  "lib/managed-handoff",
];
const FROZEN_M4_005_SHA =
  "d90ebf497dd049cb4f6fc221d2129639714028849a819e7dbb6e5b32a6146f0e";

function listTsFiles(directory: string): string[] {
  const absolute = resolve(chatbotRoot, directory);
  const out: string[] = [];
  for (const entry of readdirSync(absolute)) {
    const path = join(absolute, entry);
    if (statSync(path).isDirectory()) {
      out.push(...listTsFiles(join(directory, entry)));
    } else if (entry.endsWith(".ts")) {
      out.push(path);
    }
  }
  return out;
}

function importSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const pattern = /import\s+(?:type\s+)?[^;"']*from\s+["']([^"']+)["']/gu;
  for (const match of source.matchAll(pattern)) {
    specifiers.push(match[1] as string);
  }
  const sideEffect = /import\s+["']([^"']+)["']/gu;
  for (const match of source.matchAll(sideEffect)) {
    specifiers.push(match[1] as string);
  }
  return specifiers;
}

test("SYS-18: the new modules never couple to serving, agent or database-write paths", () => {
  const forbidden = [
    /^@\/lib\/db\/service-payment-repository/u,
    /^@\/lib\/db\/service-engagement-repository/u,
    /^@\/lib\/db\/project-/u,
    /^@\/lib\/legal-service/u,
    /^@\/lib\/assistant/u,
    /^@\/lib\/ai\//u,
    /^@\/lib\/default-agent/u,
    /^@\/lib\/vip\//u,
    /^@\/lib\/policy-intelligence\//u,
  ];
  for (const directory of NEW_MODULE_DIRS) {
    for (const file of listTsFiles(directory)) {
      for (const specifier of importSpecifiers(readFileSync(file, "utf8"))) {
        for (const rule of forbidden) {
          assert.equal(
            rule.test(specifier),
            false,
            `${file} must not import ${specifier}`
          );
        }
      }
    }
  }
});

test("SYS-18: production runtimes never import test-only synthetic adapters", () => {
  for (const runtimeFile of [
    resolve(chatbotRoot, "lib/professional-review/runtime.ts"),
    resolve(chatbotRoot, "lib/managed-handoff/runtime.ts"),
  ]) {
    const source = readFileSync(runtimeFile, "utf8");
    for (const specifier of importSpecifiers(source)) {
      assert.equal(
        /synthetic/u.test(specifier),
        false,
        `${runtimeFile} imports ${specifier}`
      );
      assert.equal(
        /in-memory/u.test(specifier),
        false,
        `${runtimeFile} must use durable persistence`
      );
    }
  }
  // Production composition evidence: durable store + authoritative snapshot.
  assert.ok(
    readFileSync(
      resolve(chatbotRoot, "lib/professional-review/runtime.ts"),
      "utf8"
    ).includes("createPostgresProfessionalReviewStore")
  );
  assert.ok(
    readFileSync(
      resolve(chatbotRoot, "lib/managed-handoff/runtime.ts"),
      "utf8"
    ).includes("loadManagedHandoffSnapshot")
  );
});

test("SYS-17: every production authority is deny-only or unavailable", () => {
  const denial = denyAllProfessionalReviewAuthority.decide({
    action: "record_decision",
    actorRole: "lawyer",
    actorUserId: "anyone",
    projectId: "11111111-1111-4111-8111-111111111111",
    requestSha256: "0".repeat(64),
    reviewerAssignmentId: "assignment",
    reviewerAssignmentStatus: "active",
    reviewPurpose: "managed_handoff_authorization",
    targetBindingSha256: "1".repeat(64),
    targetId: "package",
    targetKind: "managed_school_application",
    targetSha256: "2".repeat(64),
    targetVersion: 1,
  });
  assert.equal(denial.allowed, false);
  assert.equal(
    unavailableProfessionalCredentialVerifier.verify({
      actorUserId: "anyone",
      projectId: "11111111-1111-4111-8111-111111111111",
      targetId: "package",
      targetKind: "managed_school_application",
    }).status,
    "unavailable"
  );
  assert.equal(
    provider.resolve({
      projectId: "11111111-1111-4111-8111-111111111111",
      targetId: "package",
      targetKind: "managed_school_application",
    }).status,
    "unavailable"
  );
  const ports = denyAllManagedHandoffPorts(provider);
  assert.equal(ports.project.load({ projectId: "x" }), "unavailable");
  assert.equal(
    ports.membership.load({ actorUserId: "x", projectId: "y" }),
    "unavailable"
  );
  assert.equal(ports.assignment.load({ projectId: "x" }), "unavailable");
  assert.equal(ports.engagement.load({ projectId: "x" }), "unavailable");
  assert.equal(
    ports.agreement.load({ engagementId: null, projectId: "x" }),
    "unavailable"
  );
  assert.equal(
    ports.signature.load({ agreementVersionId: null, projectId: "x" }),
    "unavailable"
  );
  assert.equal(
    ports.disclosure.load({
      actorUserId: "x",
      projectId: "y",
      targetId: "z",
      targetKind: "managed_school_application",
    }),
    "unavailable"
  );
  assert.equal(
    ports.payment.load({
      agreementVersionId: null,
      engagementId: null,
      projectId: "x",
    }),
    "unavailable"
  );
});

test("SYS-18: both feature flags stay OFF by default", () => {
  assert.equal(isProfessionalReviewEnabled(undefined), false);
  assert.equal(isManagedHandoffEnabled(undefined), false);
  assert.equal(process.env.PHASE13_PROFESSIONAL_REVIEW_ENABLED ?? "", "");
  assert.equal(process.env.PHASE13_MANAGED_HANDOFF_ENABLED ?? "", "");
  assert.equal(process.env.PHASE13_SERVICE_PAYMENT_ENABLED ?? "", "");
});

test("SYS-18: frozen M4-005 migration and schema are untouched by this round", () => {
  const migration = readFileSync(
    resolve(
      chatbotRoot,
      "lib/db/migrations/0044_phase13_m4_005_service_payment.sql"
    ),
    "utf8"
  );
  assert.equal(
    createHash("sha256").update(migration, "utf8").digest("hex"),
    FROZEN_M4_005_SHA
  );
  const journal = JSON.parse(
    readFileSync(
      resolve(chatbotRoot, "lib/db/migrations/meta/_journal.json"),
      "utf8"
    )
  ) as { entries: Array<{ idx: number; tag: string; when: number }> };
  assert.equal(journal.entries.length, 46);
  assert.equal(journal.entries.at(-2)?.idx, 44);
  assert.equal(
    journal.entries.at(-2)?.tag,
    "0044_phase13_m4_005_service_payment"
  );
  assert.equal(journal.entries.at(-2)?.when, 1_793_258_050_571);
  // Migration 0045 is the authorized additive M4-006 persistence migration.
  assert.equal(journal.entries.at(-1)?.idx, 45);
  assert.equal(
    journal.entries.at(-1)?.tag,
    "0045_phase13_m4_006_professional_review"
  );
  assert.equal(journal.entries.at(-1)?.when, 1_793_320_044_169);
  const migrations = readdirSync(resolve(chatbotRoot, "lib/db/migrations"));
  assert.equal(
    migrations.filter((file) => /^0045_/u.test(file)).length,
    1,
    "exactly one M4-006 migration"
  );
  assert.equal(
    migrations.filter((file) => /^0046_/u.test(file)).length,
    0,
    "no later migration may be added in this round"
  );
  const schema = readFileSync(resolve(chatbotRoot, "lib/db/schema.ts"), "utf8");
  // Durable M4-006 persistence exists now; no M4-007 table may exist.
  assert.equal(/ProfessionalReviewRevision/u.test(schema), true);
  assert.equal(/ManagedHandoff/u.test(schema), false);
});

test("the frozen acceptance contract is fully referenced by executable tests", () => {
  const contract = readFileSync(CONTRACT, "utf8");
  assert.match(contract, /FROZEN/u);
  const revIds = Array.from(
    { length: 11 },
    (_, index) => `REV-${String(index + 1).padStart(2, "0")}`
  );
  const sysIds = Array.from(
    { length: 18 },
    (_, index) => `SYS-${String(index + 1).padStart(2, "0")}`
  );
  const testSources = [
    ...listTsFiles("lib/professional-review"),
    ...listTsFiles("lib/managed-handoff"),
  ]
    .filter((file) => file.endsWith(".test.ts"))
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");
  for (const id of [...revIds, ...sysIds]) {
    assert.ok(contract.includes(id), `contract must define ${id}`);
    assert.ok(
      testSources.includes(id),
      `${id} must appear in an executable test`
    );
  }
  // No frozen outcome may be weakened: the denial/uncertainty outcomes stay stated.
  assert.ok(contract.includes("professional_credential_unavailable"));
  assert.ok(contract.includes("never produce `READY`"));
  assert.ok(contract.includes("NOT_READY") && contract.includes("UNKNOWN"));
});
