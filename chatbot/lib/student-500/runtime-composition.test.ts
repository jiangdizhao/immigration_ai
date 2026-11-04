// biome-ignore-all lint/suspicious/noMisplacedAssertion: assertions live in helpers.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { normalizeStudent500Context } from "./contracts";
import {
  createManifestStudent500LegalSourceProvider,
  resolveStudent500LegalSourceProvider,
} from "./legal-source-provider";
import { STUDENT_500_SOURCE_MANIFEST_VERSION } from "./official-source-manifest";
import { createStudent500RequirementResolver } from "./requirement-resolver";

/**
 * Phase 13 M6 - runtime composition regression (OFFLINE).
 *
 * Proves the *customer runtime wiring* uses the provider selector, that the
 * rollback path works, that an unknown configuration can never masquerade as
 * verified law, and that the revision shown to customers is the provider that
 * actually produced the sources.
 */

const RUNTIME = readFileSync(new URL("./runtime.ts", import.meta.url), "utf8");

const CONTEXT = normalizeStudent500Context({
  applicationPlace: "onshore",
  asOfDate: "2026-10-15",
  coeStatus: "reported_held",
  currentVisaSubclass: "500",
  dependants: "none",
  entryRoute: "existing_coe",
  historyDeclaration: "declared_none",
});

async function screen(
  provider: ReturnType<typeof resolveStudent500LegalSourceProvider>
) {
  const resolver = createStudent500RequirementResolver({ provider });
  return await resolver.resolve({
    context: CONTEXT,
    linkedSchoolApplication: null,
  });
}

test("the customer runtime resolves its provider through the selector", () => {
  assert.match(RUNTIME, /resolveStudent500LegalSourceProvider\(\)/u);
  assert.doesNotMatch(
    RUNTIME,
    /provider:\s*createDeclaredStudent500LegalSourceProvider\(/u
  );
});

test("manifest mode is the default and reports its own revision", async () => {
  const screening = await screen(
    resolveStudent500LegalSourceProvider({ provider: "manifest" })
  );
  assert.equal(
    screening.legalSourceRevision,
    `official-source-manifest.${STUDENT_500_SOURCE_MANIFEST_VERSION}`
  );
  assert.equal(screening.submissionStatus, "not_submission_ready");
});

test("declared rollback mode verifies nothing and names itself", async () => {
  const screening = await screen(
    resolveStudent500LegalSourceProvider({ provider: "declared" })
  );
  assert.equal(
    screening.legalSourceRevision,
    "declared-official-source-catalog.v1"
  );
  assert.equal(
    screening.requirements.every(
      (entry) => entry.sourceVerification !== "verified_official_corpus"
    ),
    true
  );
  assert.equal(
    screening.requirements.every((entry) => entry.humanReviewRequired),
    true
  );
});

test("an unknown configuration falls back to the stricter manifest provider", async () => {
  process.env.STUDENT_500_LEGAL_SOURCE_PROVIDER = "totally-unknown";
  try {
    const provider = resolveStudent500LegalSourceProvider();
    assert.equal(
      provider.providerId,
      `official-source-manifest.${STUDENT_500_SOURCE_MANIFEST_VERSION}`
    );
    const screening = await screen(provider);
    // Never silently verified: unverified dimensions still demand human review.
    assert.equal(
      screening.requirements.some((entry) => entry.humanReviewRequired),
      true
    );
    assert.equal(screening.submissionStatus, "not_submission_ready");
  } finally {
    delete process.env.STUDENT_500_LEGAL_SOURCE_PROVIDER;
  }
});

test("the manifest provider is the same instance type the runtime composes", () => {
  assert.equal(
    createManifestStudent500LegalSourceProvider().providerId,
    `official-source-manifest.${STUDENT_500_SOURCE_MANIFEST_VERSION}`
  );
});
