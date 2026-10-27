import type { EducationDataset } from "./contracts";
import {
  EDUCATION_SOURCE_MANIFEST_SCHEMA,
  type EducationSourceManifest,
} from "./source-manifest";

export const ACQUISITION_FIXTURE_TIME = "2026-10-27T00:00:00.000Z";

export function createAcquisitionManifest(
  family: EducationSourceManifest["family"] = "INSTITUTION",
  overrides: Partial<EducationSourceManifest> = {}
): EducationSourceManifest {
  const host = "catalog.example.edu";
  const authorityKind =
    family === "CRICOS"
      ? "REGISTRY"
      : family === "STUDY_AUSTRALIA"
        ? "GOVERNMENT_DISCOVERY"
        : "INSTITUTION_SITE";
  const base: EducationSourceManifest = {
    schema: EDUCATION_SOURCE_MANIFEST_SCHEMA,
    proposalId: `proposal-${family.toLowerCase()}`,
    sourceId: `source-${family.toLowerCase()}`,
    family,
    scope:
      family === "INSTITUTION"
        ? { kind: "PROVIDER", providerId: "provider-demo" }
        : { kind: "CATALOG" },
    canonicalUrl: `https://${host}/courses/catalog`,
    approvedHosts: [host],
    allowedPathPrefixes: ["/courses"],
    rationale:
      "Synthetic offline review fixture for a bounded source proposal.",
    authorityEvidence: {
      kind: authorityKind,
      title: `Synthetic ${family} evidence`,
      referenceUrl: `https://${host}/authority`,
    },
    locale: "en-AU",
    expectedDocumentType: "HTML",
    reviewState: "APPROVED",
    enabled: true,
    syntheticFixture: false,
    accessReview: {
      reviewer: "offline-reviewer",
      reviewedAt: ACQUISITION_FIXTURE_TIME,
      asOf: ACQUISITION_FIXTURE_TIME,
      policyVersion: "edu-access-v1",
      accessDecision: "ALLOW",
      terms: { assessment: "ALLOW", evidenceUrl: `https://${host}/terms` },
      robots: {
        assessment: "ALLOW",
        evidenceUrl: `https://${host}/robots.txt`,
      },
    },
    transportPolicy: {
      redirects: "MANUAL_REVALIDATE",
      credentials: "OMIT",
      port: 443,
      retries: 0,
      maxRedirects: 3,
      maxRequests: 4,
      maxResponseBytes: 128 * 1024,
      maxTotalBytes: 256 * 1024,
      requestTimeoutMs: 2000,
      totalTimeoutMs: 8000,
      userAgent: "EducationIntelligenceOfflineAcquisition/1.0",
    },
  };
  return { ...base, ...overrides };
}

export function createUnverifiedEducationDataset(
  providerId = "provider-demo",
  courseId = "course-demo"
): EducationDataset {
  return {
    providers: [
      {
        providerId,
        recordClass: "UNVERIFIED",
        displayName: "Offline Example Provider",
      },
    ],
    courses: [
      {
        courseId,
        providerId,
        recordClass: "UNVERIFIED",
        title: "Example Certificate",
      },
    ],
    deliveries: [
      {
        deliveryId: "delivery-demo",
        courseId,
        recordClass: "UNVERIFIED",
        campusId: "campus-main",
        mode: "ON_CAMPUS",
      },
    ],
    intakes: [
      {
        intakeId: "intake-demo",
        deliveryId: "delivery-demo",
        recordClass: "UNVERIFIED",
        intakeCode: "AUTUMN",
        year: 2027,
        startDate: "2027-02-01",
      },
    ],
    sources: [],
    snapshots: [],
    observations: [],
  };
}
