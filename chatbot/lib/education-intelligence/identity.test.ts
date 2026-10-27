import assert from "node:assert/strict";
import test from "node:test";
import { validateEducationDataset } from "./contracts";
import { createSyntheticEducationFixture } from "./fixtures";
import {
  canonicalizeEducationUrl,
  courseExternalIdentityKey,
  deliveryExternalIdentityKey,
  findIntakeIdentityCollisions,
  intakeExternalIdentityKey,
  isReservedSyntheticHostForFamily,
  normalizeDisplayName,
  normalizeExternalCode,
  normalizeNameForComparison,
  providerExternalIdentityKey,
  sourceIdentityKey,
} from "./identity";

test("synthetic URL host classification uses the exact source-family host mapping", () => {
  const familyHosts = [
    ["CRICOS", "https://registry.cricos.example/provider/"],
    ["STUDY_AUSTRALIA", "https://directory.study-australia.example/course/"],
    ["INSTITUTION", "https://school.institution.example/course/"],
  ] as const;
  for (const [family, url] of familyHosts) {
    assert.equal(
      isReservedSyntheticHostForFamily(canonicalizeEducationUrl(url), family),
      true
    );
    for (const otherFamily of [
      "CRICOS",
      "STUDY_AUSTRALIA",
      "INSTITUTION",
    ] as const) {
      if (otherFamily !== family) {
        assert.equal(isReservedSyntheticHostForFamily(url, otherFamily), false);
      }
    }
  }

  for (const url of [
    "https://catalog.education.gov.au/path/.example",
    "https://catalog.education.gov.au/search?mirror=.example",
    "https://registry.cricos.example.attacker.invalid/provider",
    "https://unrelated.example/provider",
  ]) {
    const canonicalUrl = canonicalizeEducationUrl(url);
    for (const family of [
      "CRICOS",
      "STUDY_AUSTRALIA",
      "INSTITUTION",
    ] as const) {
      assert.equal(
        isReservedSyntheticHostForFamily(canonicalUrl, family),
        false
      );
    }
  }
});

test("normalization is bounded and exact; names do not become identity", () => {
  assert.equal(
    normalizeDisplayName("  Example\u00a0  Provider "),
    "Example Provider"
  );
  assert.equal(
    normalizeNameForComparison("EXAMPLE Provider"),
    "example provider"
  );
  assert.equal(normalizeExternalCode(" cricos  Ab-12 "), "CRICOS AB-12");

  const a = {
    providerId: "test-provider-a",
    recordClass: "SYNTHETIC" as const,
    displayName: "Same Synthetic Name",
    cricosProviderCode: "TEST-PROVIDER-A",
  };
  const b = {
    providerId: "test-provider-b",
    recordClass: "SYNTHETIC" as const,
    displayName: "Same Synthetic Name",
    cricosProviderCode: "TEST-PROVIDER-B",
  };
  const keyA = providerExternalIdentityKey(a);
  const keyB = providerExternalIdentityKey(b);
  assert.equal(keyA.status, "IDENTIFIED");
  assert.equal(keyB.status, "IDENTIFIED");
  if (keyA.status === "IDENTIFIED" && keyB.status === "IDENTIFIED") {
    assert.notEqual(keyA.key, keyB.key);
  }
});

test("provider CRICOS code and course CRICOS code are separate scoped identities", () => {
  const provider = {
    providerId: "test-provider-code",
    recordClass: "SYNTHETIC" as const,
    displayName: "Synthetic Provider",
    cricosProviderCode: "TEST-PROVIDER-1",
  };
  const course = {
    courseId: "test-course-code",
    providerId: provider.providerId,
    recordClass: "SYNTHETIC" as const,
    title: "Synthetic Course",
    cricosCourseCode: "TEST-COURSE-1",
  };
  const providerKey = providerExternalIdentityKey(provider);
  const courseKey = courseExternalIdentityKey(course);
  assert.equal(providerKey.status, "IDENTIFIED");
  assert.equal(courseKey.status, "IDENTIFIED");
  if (
    providerKey.status === "IDENTIFIED" &&
    courseKey.status === "IDENTIFIED"
  ) {
    assert.notEqual(providerKey.key, courseKey.key);
    assert.match(providerKey.key, /CRICOS_PROVIDER/);
    assert.match(courseKey.key, /CRICOS_COURSE/);
  }
});

test("the same course title at different schools never merges; title-only stays ambiguous", () => {
  const fixture = createSyntheticEducationFixture(
    "AMBIGUOUS_COURSE_IDENTITIES"
  );
  const [first, second] = fixture.dataset.courses;
  assert.equal(first.title, second.title);
  assert.equal(courseExternalIdentityKey(first).status, "AMBIGUOUS");
  assert.equal(courseExternalIdentityKey(second).status, "AMBIGUOUS");

  const codeA = { ...first, cricosCourseCode: "TEST-COURSE-42" };
  const codeB = { ...second, cricosCourseCode: "TEST-COURSE-42" };
  const keyA = courseExternalIdentityKey(codeA);
  const keyB = courseExternalIdentityKey(codeB);
  assert.equal(keyA.status, "IDENTIFIED");
  assert.equal(keyB.status, "IDENTIFIED");
  if (keyA.status === "IDENTIFIED" && keyB.status === "IDENTIFIED") {
    assert.notEqual(keyA.key, keyB.key);
  }
});

test("delivery identity requires course, campus/site and mode rather than city text", () => {
  const course = {
    courseId: "test-course-delivery",
    providerId: "test-provider-delivery",
    recordClass: "SYNTHETIC" as const,
    title: "Synthetic Shared Course",
    institutionCourseCode: "TEST-CODE-1",
  };
  const north = {
    deliveryId: "test-delivery-north",
    courseId: course.courseId,
    recordClass: "SYNTHETIC" as const,
    campusId: "campus-north",
    city: "Example City",
    mode: "ON_CAMPUS",
  };
  const south = {
    ...north,
    deliveryId: "test-delivery-south",
    campusId: "campus-south",
  };
  const northKey = deliveryExternalIdentityKey(north, course);
  const southKey = deliveryExternalIdentityKey(south, course);
  assert.equal(northKey.status, "IDENTIFIED");
  assert.equal(southKey.status, "IDENTIFIED");
  if (northKey.status === "IDENTIFIED" && southKey.status === "IDENTIFIED") {
    assert.notEqual(northKey.key, southKey.key);
  }
  assert.equal(
    deliveryExternalIdentityKey(
      { ...north, campusId: undefined, mode: undefined },
      course
    ).status,
    "AMBIGUOUS"
  );
});

test("intakes remain distinct and application deadlines do not identify them", () => {
  const course = {
    courseId: "test-course-intake",
    providerId: "test-provider-intake",
    recordClass: "SYNTHETIC" as const,
    title: "Synthetic Intake Course",
    institutionCourseCode: "TEST-INTAKE-COURSE",
  };
  const delivery = {
    deliveryId: "test-delivery-intake",
    courseId: course.courseId,
    recordClass: "SYNTHETIC" as const,
    campusId: "test-campus-intake",
    mode: "ON_CAMPUS",
  };
  const first = {
    intakeId: "test-intake-first",
    deliveryId: delivery.deliveryId,
    recordClass: "SYNTHETIC" as const,
    term: "Synthetic Term 1",
    year: 2027,
    startDate: "2027-03-01",
    applicationDeadline: "2027-01-15",
  };
  const second = {
    ...first,
    intakeId: "test-intake-second",
    term: "Synthetic Term 2",
    startDate: "2027-07-01",
    applicationDeadline: "2027-05-15",
  };
  const firstKey = intakeExternalIdentityKey(first, delivery, course);
  const secondKey = intakeExternalIdentityKey(second, delivery, course);
  assert.equal(firstKey.status, "IDENTIFIED");
  assert.equal(secondKey.status, "IDENTIFIED");
  if (firstKey.status === "IDENTIFIED" && secondKey.status === "IDENTIFIED") {
    assert.notEqual(firstKey.key, secondKey.key);
  }
  assert.equal(
    intakeExternalIdentityKey(
      { ...first, startDate: undefined },
      delivery,
      course
    ).status,
    "AMBIGUOUS"
  );
});

test("reused intake codes include supplied year and date, while insufficient identity stays ambiguous", () => {
  const course = {
    courseId: "test-course-reused-intake-code",
    providerId: "test-provider-reused-intake-code",
    recordClass: "SYNTHETIC" as const,
    title: "Synthetic Intake Course",
    institutionCourseCode: "TEST-REUSED-INTAKE-COURSE",
  };
  const delivery = {
    deliveryId: "test-delivery-reused-intake-code",
    courseId: course.courseId,
    recordClass: "SYNTHETIC" as const,
    campusId: "test-campus-reused-intake-code",
    mode: "ON_CAMPUS",
  };
  const first = {
    intakeId: "test-intake-code-2027",
    deliveryId: delivery.deliveryId,
    recordClass: "SYNTHETIC" as const,
    intakeCode: "T1",
    term: "Semester 1",
    year: 2027,
    startDate: "2027-02-15",
  };
  const nextYear = {
    ...first,
    intakeId: "test-intake-code-2028",
    year: 2028,
    startDate: "2028-02-14",
  };
  const firstKey = intakeExternalIdentityKey(first, delivery, course);
  const nextYearKey = intakeExternalIdentityKey(nextYear, delivery, course);
  assert.equal(firstKey.status, "IDENTIFIED");
  assert.equal(nextYearKey.status, "IDENTIFIED");
  if (firstKey.status === "IDENTIFIED" && nextYearKey.status === "IDENTIFIED") {
    assert.notEqual(firstKey.key, nextYearKey.key);
  }
  assert.equal(
    intakeExternalIdentityKey(
      { ...first, year: undefined, startDate: undefined },
      delivery,
      course
    ).status,
    "AMBIGUOUS"
  );
  const repeated = { ...first, intakeId: "test-intake-code-2027-copy" };
  assert.equal(
    findIntakeIdentityCollisions(
      [first, repeated, nextYear],
      [delivery],
      [course]
    ).length,
    1
  );
  assert.equal(
    findIntakeIdentityCollisions([first, nextYear], [delivery], [course])
      .length,
    0
  );

  const codeAndYearOnly = intakeExternalIdentityKey(
    { ...first, startDate: undefined },
    delivery,
    course
  );
  assert.equal(codeAndYearOnly.status, "IDENTIFIED");
});

test("duplicate provider-scoped external codes are structural ambiguity", () => {
  const fixture = createSyntheticEducationFixture(
    "AMBIGUOUS_COURSE_IDENTITIES"
  );
  const [first, second] = fixture.dataset.providers;
  const invalid = {
    ...fixture.dataset,
    providers: [
      { ...first, cricosProviderCode: "TEST-COLLISION" },
      { ...second, cricosProviderCode: " test-collision " },
    ],
  };
  const validation = validateEducationDataset(invalid);
  assert.equal(validation.ok, false);
  assert.equal(
    validation.issues.some(
      (issue) => issue.code === "AMBIGUOUS_EXTERNAL_IDENTITY"
    ),
    true
  );
});

test("source identity includes family and scope; URL fragments do not fork a source", () => {
  const fixture = createSyntheticEducationFixture("UNDERGRADUATE");
  const source = fixture.dataset.sources.find(
    (item) => item.sourceFamily === "CRICOS"
  );
  assert.ok(source);
  const equivalent = {
    ...source,
    originalUrl: `${source.originalUrl}#details`,
    canonicalUrl: source.canonicalUrl,
  };
  assert.equal(sourceIdentityKey(source), sourceIdentityKey(equivalent));
  assert.notEqual(
    sourceIdentityKey(source),
    sourceIdentityKey({ ...source, sourceFamily: "STUDY_AUSTRALIA" })
  );
});
