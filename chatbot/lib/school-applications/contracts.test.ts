import assert from "node:assert/strict";
import { test } from "node:test";
import { MANAGED_TARGET_KINDS } from "@/lib/managed-target/policy";
import {
  buildSchoolApplicationPackage,
  hashSchoolApplicationRequest,
  isSchoolCatalogIdentifier,
  normalizeOptionalSchoolApplicationText,
  normalizeSchoolApplicationText,
  planSchoolApplicationPackageBuild,
  resolveSchoolApplicationTarget,
  SCHOOL_APPLICATION_DISCLOSURE_CODES,
  SCHOOL_APPLICATION_PACKAGE_SCHEMA,
  SCHOOL_APPLICATION_SOURCE_STATUSES,
  SCHOOL_APPLICATION_TARGET_KIND,
  SchoolApplicationError,
  type SchoolApplicationPackageInputs,
  schoolApplicationActionAllowed,
  schoolApplicationInputsSha256,
  schoolApplicationPackageFreshness,
  schoolApplicationPackageUsability,
  schoolApplicationRequestSha256,
  schoolApplicationStatusAfterMaterialChange,
  schoolApplicationsEnabled,
  verifySchoolApplicationPackageSnapshot,
} from "./contracts";

const inputs: SchoolApplicationPackageInputs = {
  applicationId: "44444444-4444-4444-8444-444444444401",
  applicationRevision: 3,
  catalogRecordClass: null,
  catalogSnapshotToken: null,
  missingDataCodes: ["source_not_independently_verified"],
  projectId: "22222222-2222-4222-8222-222222222201",
  references: [
    {
      kind: "fact",
      referenceId: "33333333-3333-4333-8333-333333333302",
      referenceSha256: "b".repeat(64),
      referenceVersion: 2,
    },
    {
      kind: "fact",
      referenceId: "33333333-3333-4333-8333-333333333301",
      referenceSha256: "a".repeat(64),
      referenceVersion: 1,
    },
  ],
  sourceStatus: "unverified_customer_declared",
  target: {
    courseId: null,
    courseTitle: "Bachelor of Nursing",
    deliveryId: null,
    institutionId: null,
    institutionName: "Example University",
    intakeId: null,
    intakeLabel: "February 2027",
  },
};

test("the M5.1 capability is default OFF and the package target is an M4 target kind", () => {
  assert.equal(schoolApplicationsEnabled(undefined), false);
  assert.equal(schoolApplicationsEnabled(""), false);
  assert.equal(schoolApplicationsEnabled("false"), false);
  assert.equal(schoolApplicationsEnabled(" true "), true);
  assert.ok(
    (MANAGED_TARGET_KINDS as readonly string[]).includes(
      SCHOOL_APPLICATION_TARGET_KIND
    )
  );
  assert.deepEqual(SCHOOL_APPLICATION_SOURCE_STATUSES, [
    "unverified_customer_declared",
    "unverified_catalog_match",
    "synthetic_catalog_match",
  ]);
  // No source status can assert official/verified school data: every member is
  // explicitly an unverified or synthetic classification.
  for (const status of SCHOOL_APPLICATION_SOURCE_STATUSES) {
    assert.ok(
      status.startsWith("unverified_") || status.startsWith("synthetic_"),
      status
    );
    assert.notEqual(status, "verified");
    assert.notEqual(status, "official");
    assert.notEqual(status, "catalog_verified");
  }
});

test("bounded text and catalog identifiers reject unbounded or control input", () => {
  assert.equal(
    normalizeSchoolApplicationText("  Example   University "),
    "Example University"
  );
  assert.equal(normalizeOptionalSchoolApplicationText("   "), null);
  assert.throws(
    () => normalizeSchoolApplicationText(""),
    SchoolApplicationError
  );
  assert.throws(
    () => normalizeSchoolApplicationText("bad\u0000value"),
    SchoolApplicationError
  );
  assert.throws(
    () => normalizeSchoolApplicationText("x".repeat(201)),
    SchoolApplicationError
  );
  assert.equal(isSchoolCatalogIdentifier("provider:synthetic:1"), true);
  assert.equal(isSchoolCatalogIdentifier(""), false);
  assert.equal(isSchoolCatalogIdentifier("has space"), false);
  assert.equal(isSchoolCatalogIdentifier("x".repeat(129)), false);
});

test("catalog resolution alone decides the source status and no id may be asserted", () => {
  const manual = resolveSchoolApplicationTarget({
    fields: inputs.target,
    resolution: { status: "unresolved" },
  });
  assert.equal(manual.sourceStatus, "unverified_customer_declared");
  assert.equal(manual.catalogRecordClass, null);

  const synthetic = resolveSchoolApplicationTarget({
    fields: {
      ...inputs.target,
      courseId: "course:synthetic:1",
      institutionId: "provider:synthetic:1",
    },
    resolution: {
      courseId: "course:synthetic:1",
      courseTitle: "Synthetic Diploma",
      deliveryId: null,
      institutionId: "provider:synthetic:1",
      institutionName: "Synthetic Test College",
      intakeId: null,
      intakeLabel: null,
      recordClass: "SYNTHETIC",
      snapshotToken: "token",
      status: "resolved",
    },
  });
  assert.equal(synthetic.sourceStatus, "synthetic_catalog_match");
  assert.equal(synthetic.catalogRecordClass, "SYNTHETIC");
  assert.equal(synthetic.target.institutionName, "Synthetic Test College");

  const unverified = resolveSchoolApplicationTarget({
    fields: { ...inputs.target, institutionId: "provider:unverified:1" },
    resolution: {
      courseId: "course:unverified:1",
      courseTitle: "Master of Data Science",
      deliveryId: null,
      institutionId: "provider:unverified:1",
      institutionName: "Example Institute",
      intakeId: null,
      intakeLabel: null,
      recordClass: "UNVERIFIED",
      snapshotToken: null,
      status: "resolved",
    },
  });
  assert.equal(unverified.sourceStatus, "unverified_catalog_match");
  assert.equal(unverified.catalogRecordClass, "UNVERIFIED");

  assert.throws(
    () =>
      resolveSchoolApplicationTarget({
        fields: { ...inputs.target, institutionId: "provider:other:1" },
        resolution: { status: "unresolved" },
      }),
    (error: unknown) =>
      (error as { code?: string }).code === "reference_invalid"
  );
  assert.throws(
    () =>
      resolveSchoolApplicationTarget({
        fields: { ...inputs.target, courseId: "course:other:1" },
        resolution: { status: "unavailable" },
      }),
    (error: unknown) =>
      (error as { code?: string }).code === "reference_unavailable"
  );
});

test("the package is deterministic, reference-order independent and tamper-evident", () => {
  const first = buildSchoolApplicationPackage({ inputs, packageVersion: 1 });
  const reordered = buildSchoolApplicationPackage({
    inputs: { ...inputs, references: [...inputs.references].reverse() },
    packageVersion: 1,
  });
  assert.equal(first.contentSha256, reordered.contentSha256);
  assert.equal(first.inputsSha256, reordered.inputsSha256);
  assert.equal(first.targetBindingSha256, reordered.targetBindingSha256);
  assert.deepEqual(first.snapshot.references, reordered.snapshot.references);

  const second = buildSchoolApplicationPackage({ inputs, packageVersion: 2 });
  assert.equal(second.inputsSha256, first.inputsSha256);
  assert.notEqual(second.contentSha256, first.contentSha256);
  assert.notEqual(second.targetBindingSha256, first.targetBindingSha256);

  const changed = buildSchoolApplicationPackage({
    inputs: {
      ...inputs,
      references: inputs.references.map((reference, index) =>
        index === 0 ? { ...reference, referenceVersion: 3 } : reference
      ),
    },
    packageVersion: 1,
  });
  assert.notEqual(changed.inputsSha256, first.inputsSha256);

  assert.equal(
    verifySchoolApplicationPackageSnapshot(first.snapshot, first.contentSha256),
    true
  );
  assert.equal(
    verifySchoolApplicationPackageSnapshot(
      { ...first.snapshot, projectId: inputs.projectId.replace("2", "9") },
      first.contentSha256
    ),
    false
  );
  assert.equal(
    verifySchoolApplicationPackageSnapshot(
      { ...first.snapshot, schema: "phase13.other.v1" },
      first.contentSha256
    ),
    false
  );
  assert.equal(
    verifySchoolApplicationPackageSnapshot(null, first.contentSha256),
    false
  );

  // The revision is traceability metadata, not a material input digest component.
  assert.equal(
    schoolApplicationInputsSha256({ ...inputs, applicationRevision: 99 }),
    first.inputsSha256
  );
  assert.equal(first.snapshot.applicationRevision, 3);
  assert.equal(first.snapshot.schema, SCHOOL_APPLICATION_PACKAGE_SCHEMA);
  assert.deepEqual(first.snapshot.disclosures, [
    ...SCHOOL_APPLICATION_DISCLOSURE_CODES,
  ]);
  assert.equal(first.snapshot.target.sha256, first.contentSha256);
  assert.equal(first.snapshot.target.kind, SCHOOL_APPLICATION_TARGET_KIND);
});

test("no package can claim submission, admission, offer, CoE, payment or review", () => {
  const built = buildSchoolApplicationPackage({ inputs, packageVersion: 1 });
  assert.equal(built.snapshot.submissionStatus, "not_submitted");
  assert.equal(built.snapshot.admissionStatus, "no_decision");
  assert.equal(built.snapshot.offerStatus, "no_offer");
  assert.equal(built.snapshot.coeStatus, "no_coe");
  assert.equal(built.snapshot.professionalReviewStatus, "not_requested");
  const serialized = JSON.stringify(built.snapshot);
  for (const forbidden of [
    "approved",
    "submitted_at",
    "offer_received",
    "coe_issued",
    "receipt",
  ]) {
    assert.ok(!serialized.includes(forbidden), forbidden);
  }
});

test("package usability is the single deterministic current-and-usable decision", () => {
  const current = { inputsSha256: "a".repeat(64), status: "current" } as const;
  assert.deepEqual(
    schoolApplicationPackageUsability({
      applicationStatus: "package_prepared",
      changedReferenceCount: 0,
      currentInputsSha256: "a".repeat(64),
      currentPackage: null,
      unavailableReferenceCount: 0,
    }),
    { reasonCodes: [], usable: false, verification: "live_references" }
  );
  // Unchanged inputs and unchanged references: the package is usable.
  assert.deepEqual(
    schoolApplicationPackageUsability({
      applicationStatus: "package_prepared",
      changedReferenceCount: 0,
      currentInputsSha256: "a".repeat(64),
      currentPackage: current,
      unavailableReferenceCount: 0,
    }),
    { reasonCodes: [], usable: true, verification: "live_references" }
  );
  // A changed M2 reference alone is enough to make the package unusable.
  assert.deepEqual(
    schoolApplicationPackageUsability({
      applicationStatus: "package_prepared",
      changedReferenceCount: 1,
      currentInputsSha256: "a".repeat(64),
      currentPackage: current,
      unavailableReferenceCount: 0,
    }),
    {
      reasonCodes: ["reference_changed"],
      usable: false,
      verification: "live_references",
    }
  );
  assert.deepEqual(
    schoolApplicationPackageUsability({
      applicationStatus: "package_prepared",
      changedReferenceCount: 1,
      currentInputsSha256: "b".repeat(64),
      currentPackage: current,
      unavailableReferenceCount: 1,
    }),
    {
      reasonCodes: [
        "material_inputs_changed",
        "reference_changed",
        "reference_unavailable",
      ],
      usable: false,
      verification: "live_references",
    }
  );
  // A superseded row is never usable even if the digest happens to match.
  assert.equal(
    schoolApplicationPackageUsability({
      applicationStatus: "package_prepared",
      changedReferenceCount: 0,
      currentInputsSha256: "a".repeat(64),
      currentPackage: { inputsSha256: "a".repeat(64), status: "stale" },
      unavailableReferenceCount: 0,
    }).usable,
    false
  );
  // An archived application never keeps an operationally usable package, even
  // when every material input still matches: the historical bytes stay readable,
  // but they cannot support current preparation or future managed handoff.
  assert.deepEqual(
    schoolApplicationPackageUsability({
      applicationStatus: "archived",
      changedReferenceCount: 0,
      currentInputsSha256: "a".repeat(64),
      currentPackage: current,
      unavailableReferenceCount: 0,
    }),
    {
      reasonCodes: ["application_archived"],
      usable: false,
      verification: "live_references",
    }
  );
  assert.deepEqual(
    schoolApplicationPackageUsability({
      applicationStatus: "archived",
      changedReferenceCount: 0,
      currentInputsSha256: "a".repeat(64),
      currentPackage: null,
      unavailableReferenceCount: 0,
    }),
    {
      reasonCodes: ["application_archived"],
      usable: false,
      verification: "live_references",
    }
  );
});

test("package freshness is the projection of the same usability decision", () => {
  assert.deepEqual(
    schoolApplicationPackageFreshness({
      applicationStatus: "package_prepared",
      changedReferenceCount: 0,
      currentInputsSha256: "a".repeat(64),
      currentPackage: null,
      unavailableReferenceCount: 0,
    }),
    { reasonCodes: [], stale: false }
  );
  assert.deepEqual(
    schoolApplicationPackageFreshness({
      applicationStatus: "package_prepared",
      changedReferenceCount: 0,
      currentInputsSha256: "a".repeat(64),
      currentPackage: { inputsSha256: "a".repeat(64), status: "current" },
      unavailableReferenceCount: 0,
    }),
    { reasonCodes: [], stale: false }
  );
  assert.deepEqual(
    schoolApplicationPackageFreshness({
      applicationStatus: "package_prepared",
      changedReferenceCount: 0,
      currentInputsSha256: "b".repeat(64),
      currentPackage: { inputsSha256: "a".repeat(64), status: "current" },
      unavailableReferenceCount: 1,
    }),
    {
      reasonCodes: ["material_inputs_changed", "reference_unavailable"],
      stale: true,
    }
  );
});

test("lifecycle transitions and build planning are deterministic", () => {
  assert.equal(schoolApplicationActionAllowed("archived", "update"), false);
  assert.equal(schoolApplicationActionAllowed("archived", "archive"), false);
  assert.equal(
    schoolApplicationActionAllowed("archived", "package_build"),
    false
  );
  assert.equal(schoolApplicationActionAllowed("draft", "update"), true);
  assert.equal(schoolApplicationActionAllowed("stale", "package_build"), true);

  assert.deepEqual(
    schoolApplicationStatusAfterMaterialChange({ hasCurrentPackage: true }),
    { invalidateCurrentPackage: true, status: "stale" }
  );
  assert.deepEqual(
    schoolApplicationStatusAfterMaterialChange({ hasCurrentPackage: false }),
    { invalidateCurrentPackage: false, status: "preparing" }
  );

  assert.deepEqual(
    planSchoolApplicationPackageBuild({
      currentPackage: { inputsSha256: "a".repeat(64), version: 2 },
      highestVersion: 2,
      inputsSha256: "a".repeat(64),
    }),
    { kind: "reuse_current", version: 2 }
  );
  assert.deepEqual(
    planSchoolApplicationPackageBuild({
      currentPackage: { inputsSha256: "a".repeat(64), version: 2 },
      highestVersion: 2,
      inputsSha256: "b".repeat(64),
    }),
    { kind: "create", version: 3 }
  );
  assert.deepEqual(
    planSchoolApplicationPackageBuild({
      currentPackage: null,
      highestVersion: 4,
      inputsSha256: "b".repeat(64),
    }),
    { kind: "create", version: 5 }
  );
  assert.equal(
    hashSchoolApplicationRequest({ a: 1, b: [2, 3] }),
    hashSchoolApplicationRequest({ b: [2, 3], a: 1 })
  );
  assert.match(hashSchoolApplicationRequest({ a: 1 }), /^[0-9a-f]{64}$/u);
});

test("operation identity is the authored request, never recomputed derived state", () => {
  const base = {
    applicationId: "44444444-4444-4444-8444-444444444401",
    expectedRevision: 3,
    operationType: "school_application_package_build" as const,
    projectId: "22222222-2222-4222-8222-222222222201",
  };
  const first = schoolApplicationRequestSha256(base);
  assert.match(first, /^[0-9a-f]{64}$/u);
  // Identical authored request -> identical identity. This is why an exact replay
  // still matches after the application revision has advanced.
  assert.equal(schoolApplicationRequestSha256({ ...base }), first);
  // A different authored field is a different logical request.
  for (const changed of [
    { ...base, expectedRevision: 4 },
    { ...base, applicationId: "44444444-4444-4444-8444-444444444402" },
    { ...base, projectId: "22222222-2222-4222-8222-222222222202" },
    { ...base, operationType: "school_application_archive" as const },
  ]) {
    assert.notEqual(schoolApplicationRequestSha256(changed), first);
  }
  // Derived state cannot alter identity: the builder reads only authored keys, so
  // a package digest or resolved fingerprint attached by mistake is ignored.
  const withDerived = {
    ...base,
    contentSha256: "f".repeat(64),
    inputsSha256: "e".repeat(64),
    referenceSha256: "d".repeat(64),
  } as unknown as Parameters<typeof schoolApplicationRequestSha256>[0];
  assert.equal(schoolApplicationRequestSha256(withDerived), first);
});
