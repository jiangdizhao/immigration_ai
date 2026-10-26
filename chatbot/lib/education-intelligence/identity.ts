import type {
  EducationCourse,
  EducationDelivery,
  EducationIntake,
  EducationProvider,
  EducationSource,
  SourceFamily,
} from "./contracts";

export type IdentityResult =
  | { readonly status: "IDENTIFIED"; readonly key: string }
  | { readonly status: "AMBIGUOUS"; readonly reason: string };

export interface IdentityCollision {
  readonly path: string;
  readonly message: string;
}

function normalizeToken(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ");
}

function encode(value: string): string {
  return encodeURIComponent(value);
}

function identified(...parts: readonly string[]): IdentityResult {
  return { status: "IDENTIFIED", key: parts.map(encode).join("|") };
}

function ambiguous(reason: string): IdentityResult {
  return { status: "AMBIGUOUS", reason };
}

function isIpAddress(hostname: string): boolean {
  return hostname.startsWith("[") || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname);
}

function isExactCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(parsed) &&
    new Date(parsed).toISOString().slice(0, 10) === value
  );
}

export function canonicalizeEducationUrl(input: string): string {
  if (typeof input !== "string" || input.length === 0 || input.length > 2048) {
    throw new TypeError("Education source URL is empty or exceeds its bound.");
  }
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new TypeError("Education source URL is malformed.");
  }
  const hostname = url.hostname.toLowerCase();
  if (
    url.protocol !== "https:" ||
    url.username.length > 0 ||
    url.password.length > 0 ||
    url.port.length > 0 ||
    hostname.length === 0 ||
    isIpAddress(hostname) ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    throw new TypeError(
      "Education source URL must use a public HTTPS hostname."
    );
  }
  url.hash = "";
  return url.toString();
}

export function isReservedSyntheticHostForFamily(
  urlValue: string,
  family: SourceFamily
): boolean {
  let hostname: string;
  try {
    hostname = new URL(urlValue).hostname.toLowerCase();
  } catch {
    return false;
  }
  const suffixByFamily: Record<SourceFamily, string> = {
    CRICOS: ".cricos.example",
    STUDY_AUSTRALIA: ".study-australia.example",
    INSTITUTION: ".institution.example",
  };
  return hostname.endsWith(suffixByFamily[family]);
}

export function normalizeDisplayName(value: string): string {
  return normalizeToken(value);
}

/** Code normalization preserves punctuation and only normalizes Unicode, whitespace and case. */
export function normalizeExternalCode(value: string): string {
  return normalizeToken(value).toUpperCase();
}

export function normalizeNameForComparison(value: string): string {
  return normalizeDisplayName(value).toLowerCase();
}

export function sourceIdentityKey(source: EducationSource): string {
  const canonicalUrl = canonicalizeEducationUrl(source.canonicalUrl);
  const scope =
    source.scope.kind === "CATALOG"
      ? "catalog"
      : `provider:${normalizeToken(source.scope.providerId)}`;
  return ["source", source.sourceFamily, scope, canonicalUrl]
    .map(encode)
    .join("|");
}

export function findSourceIdentityCollisions(
  sources: readonly EducationSource[]
): readonly IdentityCollision[] {
  const seen = new Map<string, string>();
  const collisions: IdentityCollision[] = [];
  sources.forEach((source, index) => {
    let key: string;
    try {
      key = sourceIdentityKey(source);
    } catch {
      return;
    }
    const previous = seen.get(key);
    if (previous && previous !== source.sourceId) {
      collisions.push({
        path: `$.sources[${index}]`,
        message:
          "A source family, scope and canonical URL map to multiple source IDs.",
      });
    } else {
      seen.set(key, source.sourceId);
    }
  });
  return collisions;
}

export function providerInternalIdentityKey(
  provider: EducationProvider
): string {
  return ["provider", "id", normalizeToken(provider.providerId)]
    .map(encode)
    .join("|");
}

export function providerExternalIdentityKey(
  provider: EducationProvider
): IdentityResult {
  if (
    typeof provider.cricosProviderCode !== "string" ||
    !provider.cricosProviderCode.trim()
  ) {
    return ambiguous("Provider has no evidenced external provider code.");
  }
  const code = normalizeExternalCode(provider.cricosProviderCode);
  return code
    ? identified("provider", "CRICOS_PROVIDER", code)
    : ambiguous("Provider code is blank.");
}

export function courseInternalIdentityKey(course: EducationCourse): string {
  return ["course", "id", normalizeToken(course.courseId)]
    .map(encode)
    .join("|");
}

export function courseExternalIdentityKey(
  course: EducationCourse
): IdentityResult {
  if (typeof course.providerId !== "string" || !course.providerId.trim()) {
    return ambiguous("Course has no exact provider scope.");
  }
  if (
    typeof course.cricosCourseCode === "string" &&
    course.cricosCourseCode.trim()
  ) {
    const code = normalizeExternalCode(course.cricosCourseCode);
    return code
      ? identified("course", course.providerId, "CRICOS_COURSE", code)
      : ambiguous("CRICOS course code is blank.");
  }
  if (
    typeof course.institutionCourseCode === "string" &&
    course.institutionCourseCode.trim()
  ) {
    const code = normalizeExternalCode(course.institutionCourseCode);
    return code
      ? identified("course", course.providerId, "INSTITUTION_COURSE", code)
      : ambiguous("Institution course code is blank.");
  }
  return ambiguous(
    "Course title alone is not an identity; no external course code is evidenced."
  );
}

export function deliveryInternalIdentityKey(
  delivery: EducationDelivery
): string {
  return ["delivery", "id", normalizeToken(delivery.deliveryId)]
    .map(encode)
    .join("|");
}

export function deliveryExternalIdentityKey(
  delivery: EducationDelivery,
  course: EducationCourse
): IdentityResult {
  const courseKey = courseExternalIdentityKey(course);
  if (courseKey.status !== "IDENTIFIED") {
    return ambiguous(
      `Delivery course identity is ambiguous: ${courseKey.reason}`
    );
  }
  const locationId = delivery.siteId ?? delivery.campusId;
  if (
    typeof locationId !== "string" ||
    !locationId.trim() ||
    typeof delivery.mode !== "string" ||
    !delivery.mode.trim()
  ) {
    return ambiguous(
      "Delivery needs an evidenced campus/site ID and mode; city/name text is not identity."
    );
  }
  return identified(
    "delivery",
    courseKey.key,
    normalizeToken(locationId),
    normalizeToken(delivery.mode).toLowerCase()
  );
}

export function intakeInternalIdentityKey(intake: EducationIntake): string {
  return ["intake", "id", normalizeToken(intake.intakeId)]
    .map(encode)
    .join("|");
}

export function intakeExternalIdentityKey(
  intake: EducationIntake,
  delivery: EducationDelivery,
  course: EducationCourse
): IdentityResult {
  const deliveryKey = deliveryExternalIdentityKey(delivery, course);
  if (deliveryKey.status !== "IDENTIFIED") {
    return ambiguous(
      `Intake delivery identity is ambiguous: ${deliveryKey.reason}`
    );
  }
  const hasIntakeCode = intake.intakeCode !== undefined;
  if (
    hasIntakeCode &&
    (typeof intake.intakeCode !== "string" || !intake.intakeCode.trim())
  ) {
    return ambiguous("Intake code is blank or malformed.");
  }
  if (
    intake.term !== undefined &&
    (typeof intake.term !== "string" || !intake.term.trim())
  ) {
    return ambiguous("Intake term must be non-empty text when supplied.");
  }
  if (
    intake.year !== undefined &&
    (typeof intake.year !== "number" ||
      !Number.isInteger(intake.year) ||
      intake.year < 1900 ||
      intake.year > 2200)
  ) {
    return ambiguous("Intake year must be an exact supported integer.");
  }
  if (
    intake.startDate !== undefined &&
    !isExactCalendarDate(intake.startDate)
  ) {
    return ambiguous("Intake start date must be an exact calendar date.");
  }

  const year = String(intake.year ?? "");
  const term = normalizeToken(intake.term ?? "");
  const startDate = intake.startDate ?? "";
  if (hasIntakeCode) {
    if (intake.year === undefined && intake.startDate === undefined) {
      return ambiguous(
        "Intake code needs a sourced year or start date to distinguish reused codes."
      );
    }
    return identified(
      "intake",
      deliveryKey.key,
      "code",
      normalizeExternalCode(intake.intakeCode as string),
      "term",
      term,
      "year",
      year,
      "startDate",
      startDate
    );
  }
  if (intake.startDate !== undefined) {
    return identified(
      "intake",
      deliveryKey.key,
      "startDate",
      startDate,
      "term",
      term,
      "year",
      year
    );
  }
  return ambiguous(
    "Intake needs a code plus year/start date, or an exact sourced start date."
  );
}

export function findProviderIdentityCollisions(
  providers: readonly EducationProvider[]
): readonly IdentityCollision[] {
  const seen = new Map<string, string>();
  const collisions: IdentityCollision[] = [];
  providers.forEach((provider, index) => {
    const key = providerExternalIdentityKey(provider);
    if (key.status !== "IDENTIFIED") {
      return;
    }
    const previous = seen.get(key.key);
    if (previous && previous !== provider.providerId) {
      collisions.push({
        path: `$.providers[${index}].cricosProviderCode`,
        message: "CRICOS provider code maps to multiple provider IDs.",
      });
    } else {
      seen.set(key.key, provider.providerId);
    }
  });
  return collisions;
}

export function findCourseIdentityCollisions(
  courses: readonly EducationCourse[]
): readonly IdentityCollision[] {
  const seen = new Map<string, string>();
  const collisions: IdentityCollision[] = [];
  courses.forEach((course, index) => {
    for (const [kind, value] of [
      ["CRICOS_COURSE", course.cricosCourseCode],
      ["INSTITUTION_COURSE", course.institutionCourseCode],
    ] as const) {
      if (typeof value !== "string" || !value.trim()) {
        continue;
      }
      if (
        typeof course.providerId !== "string" ||
        typeof course.courseId !== "string"
      ) {
        continue;
      }
      const key = [
        "course",
        course.providerId,
        kind,
        normalizeExternalCode(value),
      ].join("|");
      const previous = seen.get(key);
      if (previous && previous !== course.courseId) {
        collisions.push({
          path:
            "$.courses[" +
            index +
            "]." +
            (kind === "CRICOS_COURSE"
              ? "cricosCourseCode"
              : "institutionCourseCode"),
          message: "A provider-scoped course code maps to multiple course IDs.",
        });
      } else {
        seen.set(key, course.courseId);
      }
    }
  });
  return collisions;
}

export function findDeliveryIdentityCollisions(
  deliveries: readonly EducationDelivery[],
  courses: readonly EducationCourse[]
): readonly IdentityCollision[] {
  const courseById = new Map(
    courses.map((course) => [course.courseId, course])
  );
  const seen = new Map<string, string>();
  const collisions: IdentityCollision[] = [];
  deliveries.forEach((delivery, index) => {
    const course = courseById.get(delivery.courseId);
    if (!course) {
      return;
    }
    const key = deliveryExternalIdentityKey(delivery, course);
    if (key.status !== "IDENTIFIED") {
      return;
    }
    const previous = seen.get(key.key);
    if (previous && previous !== delivery.deliveryId) {
      collisions.push({
        path: `$.deliveries[${index}]`,
        message: "Course, campus/site and mode map to multiple delivery IDs.",
      });
    } else {
      seen.set(key.key, delivery.deliveryId);
    }
  });
  return collisions;
}

export function findIntakeIdentityCollisions(
  intakes: readonly EducationIntake[],
  deliveries: readonly EducationDelivery[],
  courses: readonly EducationCourse[]
): readonly IdentityCollision[] {
  const deliveryById = new Map(
    deliveries.map((delivery) => [delivery.deliveryId, delivery])
  );
  const courseById = new Map(
    courses.map((course) => [course.courseId, course])
  );
  const seen = new Map<string, string>();
  const collisions: IdentityCollision[] = [];
  intakes.forEach((intake, index) => {
    const delivery = deliveryById.get(intake.deliveryId);
    const course = delivery ? courseById.get(delivery.courseId) : undefined;
    if (!delivery || !course) {
      return;
    }
    const key = intakeExternalIdentityKey(intake, delivery, course);
    if (key.status !== "IDENTIFIED") {
      return;
    }
    const previous = seen.get(key.key);
    if (previous && previous !== intake.intakeId) {
      collisions.push({
        path: `$.intakes[${index}]`,
        message: "Delivery and intake identity map to multiple intake IDs.",
      });
    } else {
      seen.set(key.key, intake.intakeId);
    }
  });
  return collisions;
}
