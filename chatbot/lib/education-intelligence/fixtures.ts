import { createHash } from "node:crypto";
import {
  type ClaimDomain,
  type EducationCourse,
  type EducationDataset,
  type EducationDelivery,
  type EducationFieldObservation,
  type EducationFieldValue,
  type EducationIntake,
  type EducationProvider,
  type EducationSnapshot,
  type EducationSource,
  FIELD_DEFINITIONS,
  type FieldKey,
  type ObservationDisposition,
  type SourceFamily,
} from "./contracts";
import { canonicalizeEducationUrl } from "./identity";

export type SyntheticPathway =
  | "ELICOS"
  | "VET"
  | "UNDERGRADUATE"
  | "COURSEWORK_MASTERS"
  | "RESEARCH";

export type SyntheticScenario =
  | SyntheticPathway
  | "MULTI_CAMPUS_MULTIPLE_INTAKES"
  | "MISSING_FEE_AND_DEADLINE"
  | "INCOMPATIBLE_FEES"
  | "CONFLICTING_OFFICIAL_OBSERVATIONS"
  | "WITHDRAWN_FIELD"
  | "STALE_AFTER_FAILED_PARSE"
  | "AMBIGUOUS_COURSE_IDENTITIES";

export interface SyntheticEducationFixture {
  readonly marker: "TEST_ONLY_SYNTHETIC";
  readonly scenario: SyntheticScenario;
  readonly note: string;
  readonly dataset: EducationDataset;
}

const SYNTHETIC_NOW = "2026-10-27T00:00:00.000Z";
const LATER_SYNTHETIC_TIME = "2026-10-28T00:00:00.000Z";

const PATHWAY_TITLES: Readonly<Record<SyntheticPathway, string>> = {
  ELICOS: "Synthetic English Language Program",
  VET: "Synthetic Vocational Skills Certificate",
  UNDERGRADUATE: "Synthetic Bachelor of Example Studies",
  COURSEWORK_MASTERS: "Synthetic Master of Example Coursework",
  RESEARCH: "Synthetic Research Degree Example",
};

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function syntheticHash(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function sourceHost(family: SourceFamily): string {
  if (family === "CRICOS") {
    return "registry.cricos.example";
  }
  if (family === "STUDY_AUSTRALIA") {
    return "directory.study-australia.example";
  }
  return "example-school.institution.example";
}

function sourcePath(family: SourceFamily, sourceId: string): string {
  const path =
    family === "CRICOS"
      ? "registry"
      : family === "STUDY_AUSTRALIA"
        ? "discovery"
        : "course-information";
  return (
    "https://" +
    sourceHost(family) +
    "/" +
    path +
    "/" +
    encodeURIComponent(sourceId)
  );
}

interface FixtureBuilder {
  providers: EducationProvider[];
  courses: EducationCourse[];
  deliveries: EducationDelivery[];
  intakes: EducationIntake[];
  sources: EducationSource[];
  snapshots: EducationSnapshot[];
  observations: EducationFieldObservation[];
}

function createBuilder(): FixtureBuilder {
  return {
    providers: [],
    courses: [],
    deliveries: [],
    intakes: [],
    sources: [],
    snapshots: [],
    observations: [],
  };
}

function addSourceSnapshot(
  builder: FixtureBuilder,
  input: {
    readonly sourceId: string;
    readonly snapshotId: string;
    readonly family: SourceFamily;
    readonly providerId?: string;
    readonly claims: readonly string[];
    readonly retrievedAt?: string;
    readonly outcome?: EducationSnapshot["acquisitionOutcome"];
  }
): { readonly source: EducationSource; readonly snapshot: EducationSnapshot } {
  const originalUrl = sourcePath(input.family, input.sourceId);
  const source: EducationSource = {
    sourceId: input.sourceId,
    sourceFamily: input.family,
    recordClass: "SYNTHETIC",
    authorityName: `Synthetic ${input.family} test source`,
    originalUrl,
    canonicalUrl: canonicalizeEducationUrl(originalUrl),
    scope:
      input.providerId === undefined
        ? { kind: "CATALOG" }
        : { kind: "PROVIDER", providerId: input.providerId },
    language: "en-AU",
    accessMode: "SYNTHETIC_FIXTURE",
  };
  const excerpt = JSON.stringify({
    marker: "TEST_ONLY_SYNTHETIC",
    sourceId: input.sourceId,
    claims: input.claims,
  });
  const snapshot: EducationSnapshot = {
    snapshotId: input.snapshotId,
    sourceId: input.sourceId,
    recordClass: "SYNTHETIC",
    sourceUrl: source.canonicalUrl,
    retrievedAt: input.retrievedAt ?? SYNTHETIC_NOW,
    observedAt: input.retrievedAt ?? SYNTHETIC_NOW,
    contentSha256: syntheticHash(excerpt),
    parserVersion: "synthetic-fixture-v1",
    contentExcerpt: excerpt,
    locator: `/fixture/${input.snapshotId}`,
    acquisitionOutcome: input.outcome ?? "CAPTURED",
  };
  if (
    !builder.sources.some((candidate) => candidate.sourceId === source.sourceId)
  ) {
    builder.sources.push(source);
  }
  builder.snapshots.push(snapshot);
  return { source, snapshot };
}

function addObservation(
  builder: FixtureBuilder,
  source: EducationSource,
  snapshot: EducationSnapshot,
  input: {
    readonly observationId: string;
    readonly target: EducationFieldObservation["target"];
    readonly fieldKey: FieldKey;
    readonly value?: EducationFieldValue;
    readonly disposition?: ObservationDisposition;
    readonly observedAt?: string;
    readonly effectiveFrom?: string;
    readonly effectiveTo?: string;
  }
): void {
  const fieldDefinition = FIELD_DEFINITIONS[input.fieldKey];
  const observation: EducationFieldObservation = {
    observationId: input.observationId,
    target: input.target,
    fieldKey: input.fieldKey,
    claimDomain: fieldDefinition.claimDomain as ClaimDomain,
    recordClass: "SYNTHETIC",
    disposition: input.disposition ?? "ASSERTION",
    ...(input.value === undefined ? {} : { value: input.value }),
    provenance: {
      sourceId: source.sourceId,
      snapshotId: snapshot.snapshotId,
      sourceFamily: source.sourceFamily,
      sourceUrl: snapshot.sourceUrl,
      contentSha256: snapshot.contentSha256 as string,
      locator: `/fixture/${input.observationId}`,
      excerpt:
        input.disposition === "WITHDRAWAL"
          ? undefined
          : `Synthetic observation ${input.observationId}`,
    },
    observedAt: input.observedAt ?? snapshot.observedAt,
    ...(input.effectiveFrom === undefined
      ? {}
      : { effectiveFrom: input.effectiveFrom }),
    ...(input.effectiveTo === undefined
      ? {}
      : { effectiveTo: input.effectiveTo }),
  };
  builder.observations.push(observation);
}

function makeMoney(
  amount: number,
  overrides: Partial<
    Extract<EducationFieldValue, { readonly kind: "money" }>
  > = {}
): Extract<EducationFieldValue, { readonly kind: "money" }> {
  return {
    kind: "money",
    amount,
    currency: "AUD",
    audience: "INTERNATIONAL",
    basis: "ANNUAL",
    year: 2027,
    inclusions: [],
    ...overrides,
  };
}

function makeBaseFixture(
  scenario: SyntheticScenario,
  pathway: SyntheticPathway,
  options: { readonly includeFee: boolean; readonly includeDeadline: boolean }
): FixtureBuilder {
  const builder = createBuilder();
  const key = slug(scenario);
  const providerId = `test-provider-${key}`;
  const courseId = `test-course-${key}`;
  const deliveryId = `test-delivery-${key}`;
  const intakeId = `test-intake-${key}`;
  const provider: EducationProvider = {
    providerId,
    recordClass: "SYNTHETIC",
    displayName: `Synthetic Education Provider ${key}`,
  };
  const course: EducationCourse = {
    courseId,
    providerId,
    recordClass: "SYNTHETIC",
    title: PATHWAY_TITLES[pathway],
    qualificationLevel: pathway,
  };
  const delivery: EducationDelivery = {
    deliveryId,
    courseId,
    recordClass: "SYNTHETIC",
    campusId: `test-campus-${key}`,
    campusName: "Synthetic Campus North",
    city: "Example City",
    state: "Example State",
    mode: "ON_CAMPUS",
  };
  const intake: EducationIntake = {
    intakeId,
    deliveryId,
    recordClass: "SYNTHETIC",
    term: "Example Term",
    year: 2027,
    startDate: "2027-03-01",
    ...(options.includeDeadline ? { applicationDeadline: "2027-01-15" } : {}),
  };
  builder.providers.push(provider);
  builder.courses.push(course);
  builder.deliveries.push(delivery);
  builder.intakes.push(intake);

  const cricos = addSourceSnapshot(builder, {
    sourceId: `test-source-cricos-${key}`,
    snapshotId: `test-snapshot-cricos-${key}`,
    family: "CRICOS",
    claims: ["synthetic provider and course registration status"],
  });
  addObservation(builder, cricos.source, cricos.snapshot, {
    observationId: `test-observation-provider-status-${key}`,
    target: { type: "PROVIDER", id: providerId },
    fieldKey: "CRICOS_PROVIDER_STATUS",
    value: { kind: "enum", value: "SYNTHETIC_REGISTERED" },
  });
  addObservation(builder, cricos.source, cricos.snapshot, {
    observationId: `test-observation-course-status-${key}`,
    target: { type: "COURSE", id: courseId },
    fieldKey: "CRICOS_COURSE_STATUS",
    value: { kind: "enum", value: "SYNTHETIC_REGISTERED" },
  });

  const institution = addSourceSnapshot(builder, {
    sourceId: `test-source-institution-${key}`,
    snapshotId: `test-snapshot-institution-${key}`,
    family: "INSTITUTION",
    providerId,
    claims: ["synthetic course, admission, delivery and intake examples"],
  });
  addObservation(builder, institution.source, institution.snapshot, {
    observationId: `test-observation-title-${key}`,
    target: { type: "COURSE", id: courseId },
    fieldKey: "COURSE_TITLE",
    value: { kind: "text", value: PATHWAY_TITLES[pathway] },
  });
  addObservation(builder, institution.source, institution.snapshot, {
    observationId: `test-observation-admissions-${key}`,
    target: { type: "COURSE", id: courseId },
    fieldKey: "COURSE_ADMISSIONS_CRITERIA",
    value: {
      kind: "text",
      value: "Synthetic-only criterion; not a real admissions rule.",
    },
  });
  addObservation(builder, institution.source, institution.snapshot, {
    observationId: `test-observation-course-availability-${key}`,
    target: { type: "COURSE", id: courseId },
    fieldKey: "COURSE_AVAILABILITY",
    value: { kind: "enum", value: "SYNTHETIC_EXAMPLE_ONLY" },
  });
  addObservation(builder, institution.source, institution.snapshot, {
    observationId: `test-observation-campus-name-${key}`,
    target: { type: "DELIVERY", id: deliveryId },
    fieldKey: "CAMPUS_NAME",
    value: { kind: "text", value: "Synthetic Campus North" },
  });
  addObservation(builder, institution.source, institution.snapshot, {
    observationId: `test-observation-mode-${key}`,
    target: { type: "DELIVERY", id: deliveryId },
    fieldKey: "DELIVERY_MODE",
    value: { kind: "enum", value: "ON_CAMPUS" },
  });
  addObservation(builder, institution.source, institution.snapshot, {
    observationId: `test-observation-intake-period-${key}`,
    target: { type: "INTAKE", id: intakeId },
    fieldKey: "INTAKE_PERIOD",
    value: { kind: "text", value: "Synthetic Example Term 2027" },
  });
  addObservation(builder, institution.source, institution.snapshot, {
    observationId: `test-observation-intake-date-${key}`,
    target: { type: "INTAKE", id: intakeId },
    fieldKey: "INTAKE_START_DATE",
    value: { kind: "date", value: "2027-03-01" },
  });
  addObservation(builder, institution.source, institution.snapshot, {
    observationId: `test-observation-intake-availability-${key}`,
    target: { type: "INTAKE", id: intakeId },
    fieldKey: "INTAKE_AVAILABILITY",
    value: { kind: "enum", value: "SYNTHETIC_EXAMPLE_ONLY" },
  });
  if (options.includeDeadline) {
    addObservation(builder, institution.source, institution.snapshot, {
      observationId: `test-observation-deadline-${key}`,
      target: { type: "INTAKE", id: intakeId },
      fieldKey: "APPLICATION_DEADLINE",
      value: { kind: "date", value: "2027-01-15" },
    });
  }
  if (options.includeFee) {
    addObservation(builder, institution.source, institution.snapshot, {
      observationId: `test-observation-fee-${key}`,
      target: { type: "COURSE", id: courseId },
      fieldKey: "TUITION_FEE",
      value: makeMoney(1_234_500),
    });
  }

  const discovery = addSourceSnapshot(builder, {
    sourceId: `test-source-discovery-${key}`,
    snapshotId: `test-snapshot-discovery-${key}`,
    family: "STUDY_AUSTRALIA",
    claims: ["synthetic discovery-only reference"],
  });
  addObservation(builder, discovery.source, discovery.snapshot, {
    observationId: `test-observation-discovery-${key}`,
    target: { type: "COURSE", id: courseId },
    fieldKey: "DISCOVERY_REFERENCE",
    value: { kind: "text", value: `synthetic discovery identifier ${key}` },
  });
  return builder;
}

function datasetFrom(builder: FixtureBuilder): EducationDataset {
  return {
    providers: builder.providers,
    courses: builder.courses,
    deliveries: builder.deliveries,
    intakes: builder.intakes,
    sources: builder.sources,
    snapshots: builder.snapshots,
    observations: builder.observations,
  };
}

function addSecondInstitutionFeeObservation(
  builder: FixtureBuilder,
  scenario: SyntheticScenario,
  fee: Extract<EducationFieldValue, { readonly kind: "money" }>
): void {
  const provider = builder.providers[0];
  const course = builder.courses[0];
  const source = addSourceSnapshot(builder, {
    sourceId: `test-source-institution-secondary-${slug(scenario)}`,
    snapshotId: `test-snapshot-institution-secondary-${slug(scenario)}`,
    family: "INSTITUTION",
    providerId: provider.providerId,
    claims: ["synthetic second page fee observation"],
  });
  addObservation(builder, source.source, source.snapshot, {
    observationId: `test-observation-fee-secondary-${slug(scenario)}`,
    target: { type: "COURSE", id: course.courseId },
    fieldKey: "TUITION_FEE",
    value: fee,
  });
}

function buildMultiCampusIntake(): FixtureBuilder {
  const builder = makeBaseFixture(
    "MULTI_CAMPUS_MULTIPLE_INTAKES",
    "UNDERGRADUATE",
    {
      includeFee: true,
      includeDeadline: true,
    }
  );
  const course = builder.courses[0];
  const deliveryNorth = builder.deliveries[0];
  const deliverySouth: EducationDelivery = {
    deliveryId: "test-delivery-campus-south",
    courseId: course.courseId,
    recordClass: "SYNTHETIC",
    campusId: "test-campus-south",
    campusName: "Synthetic Campus South",
    city: deliveryNorth.city,
    state: deliveryNorth.state,
    mode: "ON_CAMPUS",
  };
  builder.deliveries.push(deliverySouth);
  builder.intakes.push(
    {
      intakeId: "test-intake-north-second",
      deliveryId: deliveryNorth.deliveryId,
      recordClass: "SYNTHETIC",
      intakeCode: "TEST-INTAKE-NORTH-2",
      term: "Synthetic Example Term 2",
      year: 2027,
      startDate: "2027-07-01",
    },
    {
      intakeId: "test-intake-south-first",
      deliveryId: deliverySouth.deliveryId,
      recordClass: "SYNTHETIC",
      intakeCode: "TEST-INTAKE-SOUTH-1",
      term: "Synthetic Example Term 1",
      year: 2027,
      startDate: "2027-03-01",
    }
  );
  return builder;
}

function buildAmbiguousIdentityFixture(): FixtureBuilder {
  const builder = createBuilder();
  builder.providers.push(
    {
      providerId: "test-provider-identity-a",
      recordClass: "SYNTHETIC",
      displayName: "Synthetic School A",
    },
    {
      providerId: "test-provider-identity-b",
      recordClass: "SYNTHETIC",
      displayName: "Synthetic School B",
    }
  );
  builder.courses.push(
    {
      courseId: "test-course-identity-a",
      providerId: "test-provider-identity-a",
      recordClass: "SYNTHETIC",
      title: "Synthetic Shared Course Name",
    },
    {
      courseId: "test-course-identity-b",
      providerId: "test-provider-identity-b",
      recordClass: "SYNTHETIC",
      title: "Synthetic Shared Course Name",
    }
  );
  return builder;
}

export function createSyntheticEducationFixture(
  scenario: SyntheticScenario
): SyntheticEducationFixture {
  if (scenario === "AMBIGUOUS_COURSE_IDENTITIES") {
    return {
      marker: "TEST_ONLY_SYNTHETIC",
      scenario,
      note: "Two fictional providers use the same title; title-only matching stays ambiguous.",
      dataset: datasetFrom(buildAmbiguousIdentityFixture()),
    };
  }
  if (scenario === "MULTI_CAMPUS_MULTIPLE_INTAKES") {
    return {
      marker: "TEST_ONLY_SYNTHETIC",
      scenario,
      note: "One fictional course has distinct campus and intake identities.",
      dataset: datasetFrom(buildMultiCampusIntake()),
    };
  }
  if (
    scenario === "MISSING_FEE_AND_DEADLINE" ||
    scenario === "INCOMPATIBLE_FEES" ||
    scenario === "CONFLICTING_OFFICIAL_OBSERVATIONS" ||
    scenario === "WITHDRAWN_FIELD" ||
    scenario === "STALE_AFTER_FAILED_PARSE"
  ) {
    const builder = makeBaseFixture(scenario, "VET", {
      includeFee: scenario !== "MISSING_FEE_AND_DEADLINE",
      includeDeadline: scenario !== "MISSING_FEE_AND_DEADLINE",
    });
    const course = builder.courses[0];
    if (scenario === "CONFLICTING_OFFICIAL_OBSERVATIONS") {
      addSecondInstitutionFeeObservation(
        builder,
        scenario,
        makeMoney(1_500_000)
      );
    }
    if (scenario === "INCOMPATIBLE_FEES") {
      addSecondInstitutionFeeObservation(
        builder,
        scenario,
        makeMoney(615_000, {
          basis: "SEMESTER",
          period: "Synthetic Semester 1",
        })
      );
    }
    if (scenario === "WITHDRAWN_FIELD") {
      const source = builder.sources.find(
        (candidate) =>
          candidate.sourceId === `test-source-institution-${slug(scenario)}`
      ) as EducationSource;
      const snapshot = addSourceSnapshot(builder, {
        sourceId: source.sourceId,
        snapshotId: `test-snapshot-withdrawal-${slug(scenario)}`,
        family: "INSTITUTION",
        providerId: builder.providers[0].providerId,
        claims: ["synthetic withdrawal marker"],
        retrievedAt: LATER_SYNTHETIC_TIME,
      }).snapshot;
      addObservation(builder, source, snapshot, {
        observationId: `test-observation-fee-withdrawal-${slug(scenario)}`,
        target: { type: "COURSE", id: course.courseId },
        fieldKey: "TUITION_FEE",
        disposition: "WITHDRAWAL",
        observedAt: LATER_SYNTHETIC_TIME,
      });
    }
    if (scenario === "STALE_AFTER_FAILED_PARSE") {
      const source = builder.sources.find(
        (candidate) =>
          candidate.sourceId === `test-source-institution-${slug(scenario)}`
      ) as EducationSource;
      addSourceSnapshot(builder, {
        sourceId: source.sourceId,
        snapshotId: `test-snapshot-failed-parse-${slug(scenario)}`,
        family: "INSTITUTION",
        providerId: builder.providers[0].providerId,
        claims: ["synthetic parse failure marker"],
        retrievedAt: LATER_SYNTHETIC_TIME,
        outcome: "FAILED_PARSE",
      });
    }
    return {
      marker: "TEST_ONLY_SYNTHETIC",
      scenario,
      note:
        scenario === "MISSING_FEE_AND_DEADLINE"
          ? "Fee and deadline observations are absent; absence remains unknown."
          : "Synthetic negative fixture for deterministic field resolution.",
      dataset: datasetFrom(builder),
    };
  }

  const builder = makeBaseFixture(scenario, scenario, {
    includeFee: true,
    includeDeadline: true,
  });
  return {
    marker: "TEST_ONLY_SYNTHETIC",
    scenario,
    note:
      "Fictional " +
      scenario +
      " pathway fixture; not a real school or current course claim.",
    dataset: datasetFrom(builder),
  };
}

export function createSyntheticEducationFixtureSet(): readonly SyntheticEducationFixture[] {
  return [
    createSyntheticEducationFixture("ELICOS"),
    createSyntheticEducationFixture("VET"),
    createSyntheticEducationFixture("UNDERGRADUATE"),
    createSyntheticEducationFixture("COURSEWORK_MASTERS"),
    createSyntheticEducationFixture("RESEARCH"),
    createSyntheticEducationFixture("MULTI_CAMPUS_MULTIPLE_INTAKES"),
    createSyntheticEducationFixture("MISSING_FEE_AND_DEADLINE"),
    createSyntheticEducationFixture("INCOMPATIBLE_FEES"),
    createSyntheticEducationFixture("CONFLICTING_OFFICIAL_OBSERVATIONS"),
    createSyntheticEducationFixture("WITHDRAWN_FIELD"),
    createSyntheticEducationFixture("STALE_AFTER_FAILED_PARSE"),
    createSyntheticEducationFixture("AMBIGUOUS_COURSE_IDENTITIES"),
  ];
}

export const syntheticFixtureTimes = {
  observedAt: SYNTHETIC_NOW,
  laterAt: LATER_SYNTHETIC_TIME,
} as const;
