import assert from "node:assert/strict";
import test from "node:test";
import {
  ACQUISITION_FIXTURE_TIME,
  createAcquisitionManifest,
} from "./acquisition-fixtures";
import { createSyntheticEducationFixture } from "./fixtures";
import {
  createProposedEducationSourceManifest,
  MAX_SERIALIZED_SOURCE_MANIFEST_BYTES,
  parseEducationSourceManifest,
  serializeEducationSourceManifest,
  validateEducationSourceManifest,
  validateEducationSourceManifestCollection,
} from "./source-manifest";

function issues(manifest: unknown) {
  return validateEducationSourceManifest(manifest, {
    assessedAt: ACQUISITION_FIXTURE_TIME,
    knownProviderIds: new Set(["provider-demo"]),
  }).issues.map((item) => item.code);
}

test("manifest v1 binds authority family and entity scope explicitly", () => {
  assert.equal(
    validateEducationSourceManifest(createAcquisitionManifest(), {
      assessedAt: ACQUISITION_FIXTURE_TIME,
      knownProviderIds: new Set(["provider-demo"]),
    }).ok,
    true
  );
  assert.ok(
    issues(
      createAcquisitionManifest("CRICOS", {
        authorityEvidence: {
          kind: "INSTITUTION_SITE",
          title: "wrong",
          referenceUrl: "https://catalog.example.edu/authority",
        },
      })
    ).includes("AUTHORITY_FAMILY_MISMATCH")
  );
  assert.ok(
    issues(
      createAcquisitionManifest("INSTITUTION", { scope: { kind: "CATALOG" } })
    ).includes("FAMILY_SCOPE_MISMATCH")
  );
  assert.ok(
    issues(
      createAcquisitionManifest("STUDY_AUSTRALIA", {
        scope: { kind: "PROVIDER", providerId: "provider-demo" },
      })
    ).includes("FAMILY_SCOPE_MISMATCH")
  );
  assert.ok(
    issues(
      createAcquisitionManifest("INSTITUTION", {
        scope: { kind: "PROVIDER", providerId: "unknown-provider" },
      })
    ).includes("UNKNOWN_PROVIDER_SCOPE")
  );
});

test("only hostname controls reserved synthetic family mapping", () => {
  const realUrl =
    "https://catalog.example.edu/courses/.example?marker=.example";
  assert.equal(
    issues(
      createAcquisitionManifest("INSTITUTION", { canonicalUrl: realUrl })
    ).includes("RESERVED_HOST_REQUIRES_SYNTHETIC"),
    false
  );
  const wrongSynthetic = createAcquisitionManifest("CRICOS", {
    canonicalUrl: "https://directory.study-australia.example/courses/catalog",
    approvedHosts: ["directory.study-australia.example"],
    authorityEvidence: {
      kind: "REGISTRY",
      title: "Synthetic evidence",
      referenceUrl: "https://directory.study-australia.example/authority",
    },
    accessReview: {
      ...createAcquisitionManifest("CRICOS").accessReview,
      terms: {
        assessment: "ALLOW",
        evidenceUrl: "https://directory.study-australia.example/terms",
      },
      robots: {
        assessment: "ALLOW",
        evidenceUrl: "https://directory.study-australia.example/robots.txt",
      },
    },
    syntheticFixture: true,
  });
  assert.ok(issues(wrongSynthetic).includes("SYNTHETIC_HOST_FAMILY_MISMATCH"));
  const proper = createAcquisitionManifest("CRICOS", {
    canonicalUrl: "https://pilot.cricos.example/courses/catalog",
    approvedHosts: ["pilot.cricos.example"],
    authorityEvidence: {
      kind: "REGISTRY",
      title: "Synthetic CRICOS evidence",
      referenceUrl: "https://pilot.cricos.example/authority",
    },
    accessReview: {
      ...createAcquisitionManifest("CRICOS").accessReview,
      terms: {
        assessment: "ALLOW",
        evidenceUrl: "https://pilot.cricos.example/terms",
      },
      robots: {
        assessment: "ALLOW",
        evidenceUrl: "https://pilot.cricos.example/robots.txt",
      },
    },
    syntheticFixture: true,
  });
  assert.equal(
    issues(proper).includes("SYNTHETIC_HOST_FAMILY_MISMATCH"),
    false
  );
});

test("manifest access approval requires affirmative, current independent review evidence", () => {
  const approvedTemplate = createAcquisitionManifest("INSTITUTION");
  const proposed = createProposedEducationSourceManifest({
    ...approvedTemplate,
    accessReview: {
      asOf: ACQUISITION_FIXTURE_TIME,
      policyVersion: "edu-access-v1",
      accessDecision: "UNKNOWN",
      terms: { assessment: "UNKNOWN" },
      robots: { assessment: "UNKNOWN" },
    },
  });
  assert.equal(
    validateEducationSourceManifest(proposed, {
      assessedAt: ACQUISITION_FIXTURE_TIME,
      knownProviderIds: new Set(["provider-demo"]),
    }).ok,
    true
  );
  assert.ok(
    issues(
      createAcquisitionManifest("INSTITUTION", {
        reviewState: "APPROVED",
        enabled: false,
      })
    ).includes("INCOMPLETE_APPROVAL")
  );
  assert.ok(
    issues(
      createAcquisitionManifest("INSTITUTION", {
        accessReview: {
          ...createAcquisitionManifest().accessReview,
          terms: { assessment: "UNKNOWN" },
        },
      })
    ).includes("INCOMPLETE_APPROVAL")
  );
  assert.ok(
    issues(
      createAcquisitionManifest("INSTITUTION", {
        accessReview: {
          ...createAcquisitionManifest().accessReview,
          asOf: "2026-01-01T00:00:00.000Z",
          reviewedAt: "2026-01-01T00:00:00.000Z",
        },
      })
    ).includes("STALE_ACCESS_REVIEW")
  );
  assert.ok(
    issues(
      createAcquisitionManifest("INSTITUTION", {
        accessReview: {
          ...createAcquisitionManifest().accessReview,
          robots: {
            assessment: "DENY",
            evidenceUrl: "https://catalog.example.edu/robots.txt",
          },
        },
      })
    ).includes("INCOMPLETE_APPROVAL")
  );
});

test("manifest rejects userinfo, unsafe ports, broad host rules, and malformed path scope", () => {
  assert.ok(
    issues(
      createAcquisitionManifest("INSTITUTION", {
        canonicalUrl: "https://user:secret@catalog.example.edu/courses/catalog",
      })
    ).includes("INVALID_CANONICAL_URL")
  );
  assert.ok(
    issues(
      createAcquisitionManifest("INSTITUTION", {
        canonicalUrl: "https://catalog.example.edu:8443/courses/catalog",
      })
    ).includes("INVALID_CANONICAL_URL")
  );
  for (const canonicalUrl of [
    "https://127.0.0.1/courses/catalog",
    "https://[::1]/courses/catalog",
    "https://[::ffff:127.0.0.1]/courses/catalog",
  ]) {
    assert.ok(
      issues(
        createAcquisitionManifest("INSTITUTION", { canonicalUrl })
      ).includes("INVALID_CANONICAL_URL")
    );
  }
  assert.ok(
    issues(
      createAcquisitionManifest("INSTITUTION", {
        approvedHosts: ["*.example.edu"],
      })
    ).includes("INVALID_HOST_ALLOWLIST")
  );
  assert.ok(
    issues(
      createAcquisitionManifest("INSTITUTION", {
        allowedPathPrefixes: ["/courses/../admin"],
      })
    ).includes("INVALID_PATH_SCOPE")
  );
  assert.equal(
    validateEducationSourceManifest(createSyntheticEducationFixture("VET"), {
      assessedAt: ACQUISITION_FIXTURE_TIME,
    }).ok,
    false
  );
});

test("manifest JSON serialization is stable, versioned and size bounded", () => {
  const manifest = createAcquisitionManifest();
  const serialized = serializeEducationSourceManifest(manifest);
  assert.equal(serialized, serializeEducationSourceManifest({ ...manifest }));
  const parsed = parseEducationSourceManifest(serialized, {
    assessedAt: ACQUISITION_FIXTURE_TIME,
    knownProviderIds: new Set(["provider-demo"]),
  });
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.deepEqual(parsed.manifest, manifest);
  }
  assert.equal(parseEducationSourceManifest("{broken").ok, false);
  assert.equal(
    parseEducationSourceManifest(
      "x".repeat(MAX_SERIALIZED_SOURCE_MANIFEST_BYTES + 1)
    ).ok,
    false
  );
});

test("manifest collections reject proposal, source-ID and exact source-identity collisions", () => {
  const first = createAcquisitionManifest("INSTITUTION");
  const sameIdentity = createAcquisitionManifest("INSTITUTION", {
    proposalId: "proposal-other",
    sourceId: "source-other",
  });
  const sameSourceId = createAcquisitionManifest("CRICOS", {
    sourceId: first.sourceId,
  });
  const sameProposalId = createAcquisitionManifest("CRICOS", {
    proposalId: first.proposalId,
    sourceId: "source-third",
  });
  const result = validateEducationSourceManifestCollection(
    [first, sameIdentity, sameSourceId, sameProposalId],
    {
      assessedAt: ACQUISITION_FIXTURE_TIME,
      knownProviderIds: new Set(["provider-demo"]),
    }
  );
  assert.equal(result.ok, false);
  assert.ok(
    result.issues.some((issue) => issue.code === "DUPLICATE_SOURCE_IDENTITY")
  );
  assert.ok(
    result.issues.some((issue) => issue.code === "DUPLICATE_SOURCE_ID")
  );
  assert.ok(
    result.issues.some((issue) => issue.code === "DUPLICATE_PROPOSAL_ID")
  );
});
