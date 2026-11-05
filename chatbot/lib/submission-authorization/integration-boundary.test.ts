import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { test } from "node:test";

/**
 * Phase 13 M8.2 - integration boundary contract.
 *
 * M8.2 is an extension of M8.1 and M4, not a parallel system. Two directions are
 * checked, and both are regression guards rather than style preferences:
 *
 *   1. no M4/M5/M6/M7/M8.1 serving module may import M8.2, so authorizations can
 *      never leak into an answer, package, review or readiness path;
 *   2. M8.2 may only reach M4/M8.1 through the documented seams - the M8.1 package
 *      service, the M4-007 evaluator/read model, the M4-006 authority ports and the
 *      managed-target policy. Re-implementing engagement, payment, signature,
 *      disclosure or professional-review logic here is refused by policy.
 */

const ROOT = resolve(process.cwd());
const MODULE_DIR = resolve(ROOT, "lib/submission-authorization");

function filesUnder(directory: string, out: string[] = []): string[] {
  for (const entry of readdirSync(directory)) {
    if (entry === "node_modules" || entry.startsWith(".")) {
      continue;
    }
    const full = join(directory, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      filesUnder(full, out);
    } else if (/\.(ts|tsx)$/u.test(entry) && !/\.test\.tsx?$/u.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

function importsOf(file: string): string[] {
  const source = readFileSync(file, "utf8");
  const specifiers: string[] = [];
  // Only real module specifiers: a statement-initial `import ... from "x"`,
  // the closing line of a multi-line import, and a side-effect import. Matching any
  // `from "..."` would also match SQL (`from "SubmissionHandoff"`) and prose.
  const patterns = [
    /^\s*import\s+(?:type\s+)?[\w${}*,\s]+from\s+["']([^"']+)["'];?/gmu,
    /^\}\s*from\s+["']([^"']+)["'];?/gmu,
    /^\s*import\s+["']([^"']+)["'];?/gmu,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      if (match[1]) {
        specifiers.push(match[1]);
      }
    }
  }
  return [...new Set(specifiers)];
}

test("no M4-M8.1 serving logic imports M8.2", () => {
  const violations: string[] = [];
  for (const file of filesUnder(resolve(ROOT, "lib"))) {
    const path = relative(ROOT, file);
    // The M8.2 module and its client workspace surface are the only lib entries that
    // may name it.
    if (path.includes("submission-authorization")) {
      continue;
    }
    for (const specifier of importsOf(file)) {
      if (
        specifier.includes("submission-authorization") ||
        specifier.includes("submissionAuthorization")
      ) {
        violations.push(`${path} -> ${specifier}`);
      }
    }
  }
  assert.deepEqual(
    violations,
    [],
    "M8.2 must stay out of every answer, package, review and readiness path"
  );
});

test("only the dedicated route and the customer panel render M8.2", () => {
  const allowed = new Set([
    "@/components/submission-authorization-section",
    "@/lib/submission-authorization/runtime",
    "@/lib/workspace/submission-authorization",
  ]);
  const violations: string[] = [];
  for (const directory of ["app", "components"]) {
    for (const file of filesUnder(resolve(ROOT, directory))) {
      const path = relative(ROOT, file);
      if (path.includes("submission-authorization")) {
        continue;
      }
      for (const specifier of importsOf(file)) {
        if (
          (specifier.includes("submission-authorization") ||
            specifier.includes("submissionAuthorization")) &&
          !allowed.has(specifier)
        ) {
          violations.push(`${path} -> ${specifier}`);
        }
      }
    }
  }
  assert.deepEqual(
    violations,
    [],
    "a new UI surface touching M8.2 needs an explicit review"
  );
});

test("M8.2 reaches M4 and M8.1 only through the documented seams", () => {
  const allowed = [
    "@/lib/db/managed-handoff-snapshot-repository",
    "@/lib/db/runtime-client",
    "@/lib/db/submission-authorization-schema-availability",
    "@/lib/constants",
    "@/lib/managed-handoff/evaluator",
    "@/lib/managed-handoff/policy",
    "@/lib/managed-handoff/snapshot",
    "@/lib/managed-target/policy",
    "@/lib/platform/capability-environment",
    "@/lib/professional-review/authority",
    "@/lib/professional-review/policy",
    "@/lib/professional-review/target-provider",
    "@/lib/projects/chat-policy",
    "@/lib/submission-packages/contracts",
    "@/lib/submission-packages/runtime",
    "@/app/(auth)/auth",
    "drizzle-orm",
    "server-only",
    "zod",
  ];
  const violations: string[] = [];
  for (const entry of readdirSync(MODULE_DIR)) {
    if (!/\.ts$/u.test(entry) || /\.test\.ts$/u.test(entry)) {
      continue;
    }
    const file = join(MODULE_DIR, entry);
    for (const specifier of importsOf(file)) {
      if (specifier.startsWith(".") || specifier.startsWith("node:")) {
        continue;
      }
      if (!allowed.includes(specifier)) {
        violations.push(`${entry} -> ${specifier}`);
      }
    }
  }
  assert.deepEqual(
    violations,
    [],
    "a new cross-module dependency needs an explicit boundary review"
  );
});

test("M8.2 does not re-implement engagement, payment, signature or review", () => {
  // The M8.2 mode vocabulary names `self_service`/`managed_service`; that is a
  // reference to M4-004 semantics, not a second engagement model. What must not
  // exist here is an exported M4-shaped concept of its own.
  const forbidden = [
    "agreement",
    "engagement",
    "payment",
    "signature",
    "disclosure_grant",
  ];
  const offenders: string[] = [];
  for (const entry of readdirSync(MODULE_DIR)) {
    if (!/\.ts$/u.test(entry) || /\.test\.ts$/u.test(entry)) {
      continue;
    }
    const source = readFileSync(join(MODULE_DIR, entry), "utf8");
    for (const term of forbidden) {
      const pattern = new RegExp(
        `export (?:const|type|function|class) \\w*\\b${term}\\b`,
        "iu"
      );
      if (pattern.test(source)) {
        offenders.push(`${entry}: exported ${term}`);
      }
    }
  }
  assert.deepEqual(offenders, []);
});
