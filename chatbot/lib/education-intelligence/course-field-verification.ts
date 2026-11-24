import { createHash, randomUUID } from "node:crypto";
import type {
  AcquisitionCandidateInput,
  AcquisitionPorts,
  CandidateExtractor,
  EducationAcquisitionAttempt,
} from "./acquisition-core";
import { acquireEducationSource } from "./acquisition-core";
import type { FieldKey } from "./contracts";
import {
  educationDnsResolver,
  pinnedHttpsTransport,
} from "./pinned-https-transport";
import type { EducationSourceManifest } from "./source-manifest";

export type VerifiableCourseField =
  | "qualification"
  | "campus_location"
  | "course_code";

export type CoursePageIdentity = {
  institutionName: string;
  courseTitle: string;
};

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeIdentity(value: string): string {
  return value
    .normalize("NFC")
    .replace(/\s+/gu, " ")
    .trim()
    .toLocaleLowerCase("en-AU");
}

function values(value: unknown): unknown[] {
  return Array.isArray(value)
    ? value
    : value === undefined || value === null
      ? []
      : [value];
}

function flattenJsonLd(value: unknown, output: JsonRecord[], depth = 0): void {
  if (depth > 12) {
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 256)) {
      flattenJsonLd(item, output, depth + 1);
    }
    return;
  }
  if (!isRecord(value)) {
    return;
  }
  output.push(value);
  for (const key of ["@graph", "mainEntity", "hasCourseInstance"]) {
    if (value[key] !== undefined) {
      flattenJsonLd(value[key], output, depth + 1);
    }
  }
}

function jsonLdRecords(html: string): JsonRecord[] {
  const output: JsonRecord[] = [];
  const scripts = html.matchAll(
    /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/giu
  );
  let count = 0;
  for (const match of scripts) {
    if (++count > 32 || !match[1] || match[1].length > 256_000) {
      break;
    }
    try {
      flattenJsonLd(JSON.parse(match[1]), output);
    } catch {
      // A malformed JSON-LD script does not become evidence.
    }
  }
  return output;
}

function schemaTypeIsCourse(value: unknown): boolean {
  return values(value).some((item) => {
    if (typeof item !== "string") {
      return false;
    }
    const tail = item.split(/[/#]/u).pop()?.toLocaleLowerCase("en-AU");
    return tail === "course";
  });
}

function stringValue(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  if (isRecord(value) && typeof value.name === "string" && value.name.trim()) {
    return value.name.trim();
  }
  return null;
}

function providerName(course: JsonRecord): string | null {
  return (
    stringValue(course.provider) ??
    stringValue(course.educationalOrganization) ??
    stringValue(course.providerName)
  );
}

function matchingCourses(
  html: string,
  identity: CoursePageIdentity
): JsonRecord[] {
  return jsonLdRecords(html).filter(
    (record) =>
      schemaTypeIsCourse(record["@type"]) &&
      typeof record.name === "string" &&
      normalizeIdentity(record.name) ===
        normalizeIdentity(identity.courseTitle) &&
      providerName(record) !== null &&
      normalizeIdentity(providerName(record) as string) ===
        normalizeIdentity(identity.institutionName)
  );
}

function courseFieldValue(
  course: JsonRecord,
  field: VerifiableCourseField
): string | null {
  if (field === "qualification") {
    return (
      stringValue(course.educationalCredentialAwarded) ??
      stringValue(course.educationalLevel)
    );
  }
  if (field === "course_code") {
    return stringValue(course.courseCode);
  }
  const instances = values(course.hasCourseInstance).filter(isRecord);
  const locations = instances
    .map((instance) => stringValue(instance.location))
    .filter((value): value is string => Boolean(value));
  return new Set(locations).size === 1 ? (locations[0] ?? null) : null;
}

function exactText(value: string): string {
  return value.normalize("NFC").replace(/\s+/gu, " ").trim();
}

function extractorFor(input: {
  identity: CoursePageIdentity;
  field: VerifiableCourseField;
  expectedValue: string;
  courseId: string;
  deliveryId: string;
}): CandidateExtractor {
  const fieldDefinitions: Record<
    VerifiableCourseField,
    {
      key: FieldKey;
      type: "COURSE" | "DELIVERY";
      kind: "enum" | "text";
      property: string;
    }
  > = {
    qualification: {
      key: "COURSE_QUALIFICATION_LEVEL",
      type: "COURSE",
      kind: "enum",
      property: "educationalCredentialAwarded",
    },
    campus_location: {
      key: "CAMPUS_NAME",
      type: "DELIVERY",
      kind: "text",
      property: "hasCourseInstance.location",
    },
    course_code: {
      key: "INSTITUTION_COURSE_CODE",
      type: "COURSE",
      kind: "text",
      property: "courseCode",
    },
  };
  const fieldDefinition = fieldDefinitions[input.field];
  return {
    mode: "DETERMINISTIC_RULES",
    parserVersion: "course-jsonld-exact-v1",
    extract({ text, maxCandidates, signal }) {
      if (signal.aborted) {
        return [];
      }
      const courses = matchingCourses(text, input.identity);
      if (courses.length !== 1) {
        return [];
      }
      const extracted = courseFieldValue(courses[0] as JsonRecord, input.field);
      if (
        !extracted ||
        exactText(extracted) !== exactText(input.expectedValue) ||
        !text.includes(extracted)
      ) {
        return [];
      }
      const target =
        fieldDefinition.type === "DELIVERY"
          ? { type: "DELIVERY" as const, id: input.deliveryId }
          : { type: "COURSE" as const, id: input.courseId };
      const candidate: AcquisitionCandidateInput = {
        target,
        fieldKey: fieldDefinition.key,
        value: { kind: fieldDefinition.kind, value: extracted },
        quote: extracted,
        locator: `jsonld:Course.${fieldDefinition.property}`,
      };
      return [candidate].slice(0, maxCandidates);
    },
  };
}

export type CourseFieldVerificationResult = {
  attempt: EducationAcquisitionAttempt;
  field: {
    key: VerifiableCourseField;
    value: string;
    observedAt: string;
    sourceId: string;
    sourceUrl: string;
    snapshotSha256: string;
    locator: string;
    effectiveFrom: null;
    effectiveTo: null;
    manifestId: string;
  } | null;
  sourceTitle: string;
};

/**
 * Runs one manifest-scoped acquisition. No user/project/chat data is sent to
 * the source. The returned L3 observation is ephemeral and is not imported
 * into the durable catalog.
 */
export async function verifyCourseFieldFromManifest(input: {
  manifest: EducationSourceManifest;
  identity: CoursePageIdentity;
  field: VerifiableCourseField;
  expectedValue: string;
  attemptedAt: string;
  ports?: AcquisitionPorts;
}): Promise<CourseFieldVerificationResult> {
  const digest = createHash("sha256")
    .update(`${input.identity.institutionName}\0${input.identity.courseTitle}`)
    .digest("hex")
    .slice(0, 24);
  const providerId =
    input.manifest.scope.kind === "PROVIDER"
      ? input.manifest.scope.providerId
      : `verification-provider-${digest}`;
  const courseId = `verification-course-${digest}`;
  const deliveryId = `verification-delivery-${digest}`;
  const baseDataset = {
    providers: [
      {
        providerId,
        recordClass: "UNVERIFIED" as const,
        displayName: input.identity.institutionName,
      },
    ],
    courses: [
      {
        courseId,
        providerId,
        recordClass: "UNVERIFIED" as const,
        title: input.identity.courseTitle,
      },
    ],
    deliveries: [{ deliveryId, courseId, recordClass: "UNVERIFIED" as const }],
    intakes: [],
    sources: [],
    snapshots: [],
    observations: [],
  };
  const attempt = await acquireEducationSource({
    attemptId: `course-verify-${digest}-${input.field}`,
    attemptedAt: input.attemptedAt,
    manifest: input.manifest,
    baseDataset,
    ports: input.ports ?? {
      resolver: educationDnsResolver,
      transport: pinnedHttpsTransport,
    },
    extractor: extractorFor({
      identity: input.identity,
      field: input.field,
      expectedValue: input.expectedValue,
      courseId,
      deliveryId,
    }),
  });
  const observation = attempt.candidateObservations[0];
  const snapshot = attempt.snapshot;
  const value = observation?.value;
  const observed = value && "value" in value ? value.value : null;
  const allowedForL3 =
    input.manifest.reviewState === "APPROVED" &&
    input.manifest.enabled &&
    !input.manifest.syntheticFixture &&
    attempt.outcome === "CAPTURED" &&
    Boolean(observation && snapshot?.contentSha256 && snapshot.sourceUrl);
  return {
    attempt,
    field:
      allowedForL3 &&
      observation &&
      snapshot?.contentSha256 &&
      snapshot.sourceUrl &&
      typeof observed === "string"
        ? {
            key: input.field,
            value: observed,
            observedAt: observation.observedAt,
            sourceId: randomUUID(),
            sourceUrl: snapshot.sourceUrl,
            snapshotSha256: snapshot.contentSha256,
            locator: observation.provenance.locator,
            effectiveFrom: null,
            effectiveTo: null,
            manifestId: input.manifest.proposalId,
          }
        : null,
    sourceTitle: input.manifest.authorityEvidence.title,
  };
}
