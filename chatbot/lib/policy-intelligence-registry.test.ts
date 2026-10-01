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

test("editorial registry is server-only and contains reviewed production fallbacks", () => {
  const source = readFileSync(registryPath, "utf8");

  assert.match(source, /^import "server-only";/m);
  assert.match(source, /MANUAL_POLICY_ENTRIES: readonly PolicyEntry\[\] = \[/);
  assert.match(source, /manual-skilled-processing-priorities-2026-09-19/);
  assert.match(source, /manual-student-visa-onshore-preclusion-2026-09-24/);
  assert.match(source, /manual-evisitor-arrangements-2026-09-28/);
  assert.match(source, /manual-health-specified-countries-2026-09-28/);
  assert.doesNotMatch(source, /Synthetic policy source fixture/);
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
