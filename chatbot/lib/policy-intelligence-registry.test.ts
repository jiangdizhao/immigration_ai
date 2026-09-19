import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { validatePolicyEntries } from "./policy-intelligence";

const registryPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../content/policy-intelligence/registry.ts"
);

test("editorial registry is server-only and production-empty", () => {
  const source = readFileSync(registryPath, "utf8");

  assert.match(source, /^import "server-only";/m);
  assert.match(
    source,
    /MANUAL_POLICY_ENTRIES: readonly PolicyEntry\[\] = \[\];/
  );
  assert.doesNotThrow(() => validatePolicyEntries([]));
});

test("client presentation modules do not import the editorial registry", () => {
  const componentPaths = [
    resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../components/policy-intelligence-page.tsx"
    ),
    resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../components/immigration-service-home.tsx"
    ),
  ];

  for (const componentPath of componentPaths) {
    const source = readFileSync(componentPath, "utf8");
    assert.doesNotMatch(source, /policy-intelligence-server/);
    assert.doesNotMatch(source, /content\/policy-intelligence\/registry/);
  }
});
