import {
  normalizeOptionalSchoolApplicationText,
  normalizeSchoolApplicationText,
  SCHOOL_APPLICATION_MAX_LABEL,
} from "@/lib/school-applications/contracts";
import type { SchoolApplicationDetailView } from "@/lib/school-applications/service";
import type {
  Student500ApplicationPlace,
  Student500Context,
} from "@/lib/student-500/contracts";

/** Rebuilds the full School update contract and changes only the intake label. */
export function schoolApplicationFieldsWithIntakeLabel(
  application: SchoolApplicationDetailView,
  intakeLabel: string | null
) {
  return {
    institutionName: application.institution.name,
    institutionId: application.institution.catalogId,
    courseTitle: application.course.title,
    courseId: application.course.catalogId,
    deliveryId: application.deliveryId,
    intakeId: application.intake.id,
    intakeLabel,
  };
}

/** Complete target replacement; candidate names never become catalog identifiers. */
export function schoolApplicationFieldsWithTarget(input: {
  institutionName: string;
  institutionId: string | null;
  courseTitle: string;
  courseId: string | null;
  deliveryId: string | null;
  intakeId: string | null;
  intakeLabel: string | null;
}) {
  return {
    institutionName: input.institutionName,
    institutionId: input.institutionId,
    courseTitle: input.courseTitle,
    courseId: input.courseId,
    deliveryId: input.deliveryId,
    intakeId: input.intakeId,
    intakeLabel: input.intakeLabel,
  };
}

/**
 * Candidate display strings are not catalog identities. Until the customer
 * chooses a complete resolver-issued identity, create an ordinary
 * customer-reported draft and clear every catalog-dependent identifier.
 */
export function schoolApplicationTargetWithCandidate(input: {
  institutionName: string;
  courseTitle: string;
  intakeLabel: string | null;
}) {
  return {
    institutionName: normalizeSchoolApplicationText(input.institutionName),
    institutionId: null,
    courseTitle: normalizeSchoolApplicationText(input.courseTitle),
    courseId: null,
    deliveryId: null,
    intakeId: null,
    intakeLabel: normalizeOptionalSchoolApplicationText(
      input.intakeLabel,
      SCHOOL_APPLICATION_MAX_LABEL
    ),
  };
}

/** Student 500 update is a complete replacement; retain every current field. */
export function student500ContextWithApplicationPlace(
  context: Student500Context,
  applicationPlace: Student500ApplicationPlace
): Student500Context {
  return { ...context, applicationPlace };
}

export function student500ContextDiffersOnlyByApplicationPlace(
  before: Student500Context,
  after: Student500Context,
  expected: Student500ApplicationPlace
): boolean {
  if (after.applicationPlace !== expected) {
    return false;
  }
  const normalizedBefore = { ...before, applicationPlace: expected };
  return JSON.stringify(normalizedBefore) === JSON.stringify(after);
}
