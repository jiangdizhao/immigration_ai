// biome-ignore-all lint/suspicious/noMisplacedAssertion: pure contract assertions execute in node:test callbacks.
import assert from "node:assert/strict";
import { test } from "node:test";
import { PROJECT_REQUIREMENT_FAMILIES } from "@/lib/db/schema";
import {
  canonicalRequirementJson,
  hashRequirementTemplateContent,
  locatorBelongsToProject,
  PROVISIONAL_REQUIREMENT_CATALOG,
  redactUnauthorizedRequirementLocators,
  validateRequirementStateShape,
} from "./catalog";
import {
  PostgresProjectRequirementRepository,
  ProjectRequirementError,
} from "./postgres-repository";

test("provisional catalog contains exactly the four synthetic collection families", () => {
  assert.deepEqual(
    PROVISIONAL_REQUIREMENT_CATALOG.map((definition) => definition.family),
    PROJECT_REQUIREMENT_FAMILIES
  );
  for (const definition of PROVISIONAL_REQUIREMENT_CATALOG) {
    assert.equal(definition.sourceProvenance.sourceIdentity, null);
    assert.equal(definition.sourceProvenance.observedAt, null);
    assert.equal(definition.sourceProvenance.effectiveAt, null);
    assert.match(
      definition.sourceProvenance.note,
      /not an official checklist/u
    );
    assert.equal(definition.items.length, 1);
  }
});

test("unauthorized members receive requirement state without private source locators", () => {
  assert.deepEqual(
    redactUnauthorizedRequirementLocators({
      factLocator: {
        projectId: "11111111-1111-4111-8111-111111111111",
        assertionId: "private-assertion-id",
        version: 4,
      },
      evidenceLocator: {
        projectId: "11111111-1111-4111-8111-111111111111",
        evidenceRef: "private-evidence-ref",
        version: 2,
      },
      canReadFact: false,
      canReadEvidence: false,
    }),
    { factLocator: null, evidenceLocator: null }
  );
});

test("customer requests cannot seed or publish global templates without server-held maintenance authorization", async () => {
  let databaseCalls = 0;
  let authorizationCalls = 0;
  const database = {
    transaction() {
      databaseCalls += 1;
      throw new Error("unauthorized request reached persistence");
    },
  } as never;
  const customerRepository = new PostgresProjectRequirementRepository({
    database,
  });
  const deniedRepository = new PostgresProjectRequirementRepository({
    database,
    templateMaintenanceCapability: {
      authorize() {
        authorizationCalls += 1;
        return Promise.resolve(false);
      },
    },
  });
  const attemptedCustomerPublication = {
    actorUserId: "66666666-6666-4666-8666-666666666666",
    family: "school_facts" as const,
    templateKey: "school-facts-provisional",
    schemaVersion: "customer-proposed-v2",
    items: [{ key: "customer_claim", label: "Claim", kind: "fact" as const }],
    sourceProvenance: {
      sourceIdentity: null,
      observedAt: null,
      effectiveAt: null,
      note: "Untrusted customer input.",
    },
  };

  for (const repository of [customerRepository, deniedRepository]) {
    await assert.rejects(
      repository.ensureProvisionalCatalog(),
      (error) =>
        error instanceof ProjectRequirementError &&
        error.code === "template_maintenance_forbidden"
    );
    await assert.rejects(
      repository.publishProvisionalVersion(attemptedCustomerPublication),
      (error) =>
        error instanceof ProjectRequirementError &&
        error.code === "template_maintenance_forbidden"
    );
  }
  assert.equal(authorizationCalls, 2);
  assert.equal(databaseCalls, 0);
});

test("canonical template hashing is key-order stable and content-sensitive", () => {
  assert.equal(
    canonicalRequirementJson({ b: 2, a: { d: 4, c: 3 } }),
    '{"a":{"c":3,"d":4},"b":2}'
  );
  const content = {
    schemaVersion: "v1",
    items: [{ key: "school", label: "School detail", kind: "fact" as const }],
    sourceProvenance: { sourceIdentity: null, effectiveAt: null },
  };
  assert.equal(
    hashRequirementTemplateContent(content),
    hashRequirementTemplateContent({
      sourceProvenance: { effectiveAt: null, sourceIdentity: null },
      items: content.items,
      schemaVersion: "v1",
    })
  );
  assert.notEqual(
    hashRequirementTemplateContent(content),
    hashRequirementTemplateContent({
      ...content,
      items: [{ ...content.items[0], label: "Different detail" }],
    })
  );
});

test("fact and evidence locators stay Project-scoped and shape-validated", () => {
  const projectId = "11111111-1111-4111-8111-111111111111";
  const otherProjectId = "22222222-2222-4222-8222-222222222222";
  assert.equal(
    locatorBelongsToProject(
      { projectId, assertionId: "assertion-1", version: 1 },
      projectId
    ),
    true
  );
  assert.equal(
    locatorBelongsToProject(
      { projectId: otherProjectId, evidenceRef: "evidence-1", version: 1 },
      projectId
    ),
    false
  );

  const common = {
    family: "school_facts" as const,
    templateKey: "school-facts-provisional",
    templateVersionId: "version-id",
    itemKey: "school_identity_detail",
    applicability: "unknown" as const,
    collectionState: "not_started" as const,
    evidenceLocator: null,
  };
  assert.doesNotThrow(() =>
    validateRequirementStateShape({
      ...common,
      factLocator: { projectId, assertionId: "assertion-1", version: 1 },
    })
  );
  assert.throws(
    () =>
      validateRequirementStateShape({
        ...common,
        factLocator: { projectId, assertionId: "", version: 0 },
      }),
    /invalid_fact_locator/u
  );
  assert.throws(
    () =>
      validateRequirementStateShape({
        ...common,
        factLocator: null,
        evidenceLocator: { projectId, evidenceRef: "", version: 1 },
      }),
    /invalid_evidence_locator/u
  );
});
