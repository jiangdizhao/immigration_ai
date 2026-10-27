import { createHash } from "node:crypto";
import {
  type AuthorizedProjectFact,
  MAX_PROJECT_FACT_BYTES,
  MAX_PROJECT_FACTS,
} from "../projects/project-context";
import {
  compareReviewedEducationCriterion,
  type EducationCriterionComparison,
  type EducationCriterionReviewAuthority,
  isReviewedEducationCriterion,
  missingReviewedRule,
  type ReviewedEducationCriterion,
} from "./option-comparison";
import {
  buildEducationResolvedReadModel,
  type EducationCatalogReader,
  type EducationCatalogReadSnapshot,
  type EducationReadField,
  type EducationReadModelRequest,
  type EducationResolvedReadModel,
  prepareEducationCatalogReadRequest,
  readEducationCatalogConsistent,
} from "./read-model";

export interface AuthenticatedProjectOptionsActor {
  /** Must come from the authenticated server session, never a browser role field. */
  readonly authenticated: true;
  readonly userId: string;
}

export type ProjectOptionsMembershipStatus =
  | "OWNER"
  | "ACTIVE_MEMBER"
  | "PENDING"
  | "REVOKED"
  | "MISSING";

/**
 * Result of one fresh, atomic authorization plus stableProjection read.
 * The injected adapter must call the real Project access boundary and M2
 * stableProjection({ actorUserId, projectId }); it must not read Chat content,
 * raw documents, unresolved fact candidates or caller-supplied context packets.
 */
export interface CurrentAuthorizedProjectOptionsContext {
  readonly actorUserId: string;
  readonly projectId: string;
  readonly chatId: string;
  readonly projectStatus: "ACTIVE" | "CLOSED";
  readonly membershipStatus: ProjectOptionsMembershipStatus;
  readonly chatStatus: "ACTIVE" | "CLOSED";
  readonly chatOwnerUserId: string;
  readonly chatProjectId: string;
  readonly projectChatEnabled: boolean;
  readonly projectContextEnabled: boolean;
  readonly factsProjectionAvailable: boolean;
  readonly accessRevision: string;
  readonly projectRevision: string;
  readonly membershipRevision: string;
  readonly chatRevision: string;
  readonly factsProjectionRevision: string;
  readonly authorizedForAI: readonly AuthorizedProjectFact[];
}

export interface CurrentAuthorizedProjectOptionsReader {
  readCurrentAuthorizedContext(input: {
    readonly actorUserId: string;
    readonly projectId: string;
    readonly chatId: string;
    readonly signal?: AbortSignal;
  }): Promise<CurrentAuthorizedProjectOptionsContext>;
}

export interface ProjectPossibleOptionsRequest {
  readonly actor: AuthenticatedProjectOptionsActor;
  /** Exact server-authorized Project and Project Chat identifiers. */
  readonly projectId: string;
  readonly chatId: string;
  readonly catalog: EducationReadModelRequest;
  readonly criteria: readonly ReviewedEducationCriterion[];
}

export interface ProjectPossibleOptionPath {
  readonly path: EducationResolvedReadModel["paths"][number];
  readonly comparisons: readonly EducationCriterionComparison[];
  readonly missingReviewedRule?: EducationCriterionComparison;
}

export interface ProjectPossibleOptionsResult {
  readonly schema: "education.project-possible-options.v1";
  readonly projectId: string;
  readonly catalogSnapshotToken: string;
  readonly assessedAt: string;
  readonly paths: readonly ProjectPossibleOptionPath[];
  readonly catalogExclusions: EducationResolvedReadModel["exclusions"];
  readonly criterionExclusions: readonly {
    readonly criterionId: string;
    readonly reason: "CRITERION_TARGET_OUTSIDE_EXACT_CATALOG_SCOPE";
  }[];
  readonly limitation: "Possible options for further review only; no admission or visa determination";
  readonly applicantFactLabel: "Customer-confirmed facts are not independently verified";
  readonly humanReviewRequired: true;
  readonly noEligibilitySignal: true;
}

export class ProjectPossibleOptionsError extends Error {
  readonly code = "PROJECT_OPTIONS_UNAVAILABLE" as const;

  constructor() {
    super("Project education options are unavailable.");
    this.name = "ProjectPossibleOptionsError";
  }
}

const AUTHORITY_READ_TIMEOUT_MS = 2000;
const MAX_OPTION_CRITERION_COMPARISONS = 5000;

const REVISION_KEYS = [
  "accessRevision",
  "projectRevision",
  "membershipRevision",
  "chatRevision",
  "factsProjectionRevision",
] as const;

function boundedId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 128 &&
    value.trim() === value &&
    !hasControlCharacters(value)
  );
}

function hasControlCharacters(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code < 0x20 || code === 0x7f) {
      return true;
    }
  }
  return false;
}

function acceptedContext(
  value: CurrentAuthorizedProjectOptionsContext,
  request: ProjectPossibleOptionsRequest
): boolean {
  return Boolean(
    value &&
      value.actorUserId === request.actor.userId &&
      value.projectId === request.projectId &&
      value.chatId === request.chatId &&
      value.projectStatus === "ACTIVE" &&
      (value.membershipStatus === "OWNER" ||
        value.membershipStatus === "ACTIVE_MEMBER") &&
      value.chatStatus === "ACTIVE" &&
      value.chatOwnerUserId === request.actor.userId &&
      value.chatProjectId === request.projectId &&
      value.projectChatEnabled === true &&
      value.projectContextEnabled === true &&
      value.factsProjectionAvailable === true &&
      REVISION_KEYS.every((key) => boundedId(value[key])) &&
      Array.isArray(value.authorizedForAI)
  );
}

function canonicalJson(value: unknown, seen = new Set<object>()): string {
  if (value === null || typeof value !== "object") {
    const primitive = JSON.stringify(value);
    if (primitive === undefined) {
      throw new TypeError("invalid_json_value");
    }
    return primitive;
  }
  if (seen.has(value)) {
    throw new TypeError("cyclic_json_value");
  }
  seen.add(value);
  let result: string;
  if (Array.isArray(value)) {
    result = `[${value.map((item) => canonicalJson(item, seen)).join(",")}]`;
  } else {
    const record = value as Record<string, unknown>;
    result = `{${Object.keys(record)
      .sort((left, right) => left.localeCompare(right))
      .map(
        (key) => `${JSON.stringify(key)}:${canonicalJson(record[key], seen)}`
      )
      .join(",")}}`;
  }
  seen.delete(value);
  return result;
}

function authorizedFactsSignature(
  facts: readonly AuthorizedProjectFact[]
): string {
  const canonical = canonicalJson(
    [...facts].sort(
      (left, right) =>
        left.assertionId.localeCompare(right.assertionId) ||
        left.assertionVersion - right.assertionVersion
    )
  );
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

function validProjectFactDate(value: string): boolean {
  if (/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    const parsed = Date.parse(`${value}T00:00:00.000Z`);
    return (
      Number.isFinite(parsed) &&
      new Date(parsed).toISOString().slice(0, 10) === value
    );
  }
  return (
    /^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/iu.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function validateAuthorizedFacts(
  facts: readonly AuthorizedProjectFact[]
): boolean {
  if (facts.length > MAX_PROJECT_FACTS) {
    return false;
  }
  const assertionIds = new Set<string>();
  for (const fact of facts) {
    if (
      !fact ||
      fact.state !== "customer_confirmed" ||
      fact.stale !== false ||
      !boundedId(fact.assertionId) ||
      assertionIds.has(fact.assertionId) ||
      !Number.isSafeInteger(fact.assertionVersion) ||
      fact.assertionVersion < 1 ||
      !/^[a-z][a-z0-9_.-]{0,127}$/u.test(fact.key) ||
      !["string", "number", "boolean", "date", "json"].includes(
        fact.valueType
      ) ||
      !fact.confirmedByUserId ||
      (fact.originKind !== "customer_stated" &&
        fact.originKind !== "document_extracted")
    ) {
      return false;
    }
    if (fact.originKind === "document_extracted" && !fact.sourceEvidenceRef) {
      return false;
    }
    if (fact.sourceEvidenceRef !== null && !boundedId(fact.sourceEvidenceRef)) {
      return false;
    }
    if (
      (fact.valueType === "string" && typeof fact.value !== "string") ||
      (fact.valueType === "number" &&
        (typeof fact.value !== "number" || !Number.isFinite(fact.value))) ||
      (fact.valueType === "boolean" && typeof fact.value !== "boolean") ||
      (fact.valueType === "date" &&
        (typeof fact.value !== "string" ||
          !validProjectFactDate(fact.value))) ||
      (fact.valueType === "json" &&
        (typeof fact.value !== "object" ||
          fact.value === null ||
          Array.isArray(fact.value)))
    ) {
      return false;
    }
    let encoded: string;
    try {
      encoded = canonicalJson(fact.value);
    } catch {
      return false;
    }
    if (new TextEncoder().encode(encoded).byteLength > MAX_PROJECT_FACT_BYTES) {
      return false;
    }
    assertionIds.add(fact.assertionId);
  }
  return true;
}

function authorityFingerprint(
  value: CurrentAuthorizedProjectOptionsContext
): string {
  const revisions = REVISION_KEYS.map((key) => value[key]);
  return createHash("sha256")
    .update(canonicalJson(revisions), "utf8")
    .update(authorizedFactsSignature(value.authorizedForAI), "utf8")
    .digest("hex");
}

function pathContainsTarget(
  path: EducationResolvedReadModel["paths"][number],
  target: ReviewedEducationCriterion["schoolField"]["target"]
): boolean {
  if (target.type === "PROVIDER") {
    return path.course.provider.providerId === target.id;
  }
  if (target.type === "COURSE") {
    return path.course.courseId === target.id;
  }
  if (target.type === "DELIVERY") {
    return path.delivery?.deliveryId === target.id;
  }
  return path.intake?.intakeId === target.id;
}

function validateCriteria(
  value: unknown
): value is readonly ReviewedEducationCriterion[] {
  try {
    if (
      !Array.isArray(value) ||
      value.length > 500 ||
      !value.every(isReviewedEducationCriterion)
    ) {
      return false;
    }
    const criteria = value as readonly ReviewedEducationCriterion[];
    return (
      new Set(criteria.map((criterion) => criterion.criterionId)).size ===
      criteria.length
    );
  } catch {
    return false;
  }
}

/**
 * Offline composition only. The authority adapter is injected and must re-run
 * current M1 Project access plus M2 stableProjection on both calls. Catalog is
 * read once as a consistent snapshot; all comparisons use that same dataset.
 */
export async function buildProjectPossibleOptions(
  input: {
    readonly authorityReader: CurrentAuthorizedProjectOptionsReader;
    readonly catalogReader: EducationCatalogReader;
    readonly reviewAuthority: EducationCriterionReviewAuthority;
  },
  request: ProjectPossibleOptionsRequest
): Promise<ProjectPossibleOptionsResult> {
  if (
    !request ||
    !request.actor ||
    request.actor.authenticated !== true ||
    !boundedId(request.actor.userId) ||
    !boundedId(request.projectId) ||
    !boundedId(request.chatId) ||
    !request.catalog ||
    !validateCriteria(request.criteria)
  ) {
    throw new ProjectPossibleOptionsError();
  }

  const readAuthority = async () => {
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => {
        controller.abort();
        reject(new Error("project_authority_timeout"));
      }, AUTHORITY_READ_TIMEOUT_MS);
    });
    try {
      return await Promise.race([
        input.authorityReader.readCurrentAuthorizedContext({
          actorUserId: request.actor.userId,
          projectId: request.projectId,
          chatId: request.chatId,
          signal: controller.signal,
        }),
        timedOut,
      ]);
    } catch {
      throw new ProjectPossibleOptionsError();
    } finally {
      if (timeout !== undefined) {
        clearTimeout(timeout);
      }
    }
  };
  const initialAuthority = await readAuthority();
  if (
    !acceptedContext(initialAuthority, request) ||
    !validateAuthorizedFacts(initialAuthority.authorizedForAI)
  ) {
    throw new ProjectPossibleOptionsError();
  }
  const initialFingerprint = authorityFingerprint(initialAuthority);

  let prepared: ReturnType<typeof prepareEducationCatalogReadRequest>;
  try {
    prepared = prepareEducationCatalogReadRequest(request.catalog);
  } catch {
    throw new ProjectPossibleOptionsError();
  }
  const fieldKeysByEntityType = {
    PROVIDER: new Set(prepared.readRequest.fieldKeysByEntityType.PROVIDER),
    COURSE: new Set(prepared.readRequest.fieldKeysByEntityType.COURSE),
    DELIVERY: new Set(prepared.readRequest.fieldKeysByEntityType.DELIVERY),
    INTAKE: new Set(prepared.readRequest.fieldKeysByEntityType.INTAKE),
  };
  for (const criterion of request.criteria) {
    fieldKeysByEntityType[criterion.schoolField.target.type].add(
      criterion.schoolField.fieldKey
    );
  }
  const catalogReadRequest = {
    ...prepared.readRequest,
    fieldKeysByEntityType: {
      PROVIDER: [...fieldKeysByEntityType.PROVIDER],
      COURSE: [...fieldKeysByEntityType.COURSE],
      DELIVERY: [...fieldKeysByEntityType.DELIVERY],
      INTAKE: [...fieldKeysByEntityType.INTAKE],
    },
  };
  let catalogSnapshot: EducationCatalogReadSnapshot;
  try {
    catalogSnapshot = await readEducationCatalogConsistent(
      input.catalogReader,
      catalogReadRequest
    );
  } catch {
    throw new ProjectPossibleOptionsError();
  }

  // Reuse the exact obtained consistent read in the public-safe projection.
  const snapshotReader: EducationCatalogReader = {
    readConsistent() {
      return Promise.resolve(catalogSnapshot);
    },
  };
  let readModel: EducationResolvedReadModel;
  try {
    readModel = await buildEducationResolvedReadModel(snapshotReader, {
      ...request.catalog,
      fieldKeysByEntityType: catalogReadRequest.fieldKeysByEntityType,
      limits: prepared.limits,
    });
  } catch {
    throw new ProjectPossibleOptionsError();
  }

  let comparisonCount = 0;
  for (const path of readModel.paths) {
    comparisonCount += request.criteria.filter((criterion) =>
      pathContainsTarget(path, criterion.schoolField.target)
    ).length;
    if (comparisonCount > MAX_OPTION_CRITERION_COMPARISONS) {
      throw new ProjectPossibleOptionsError();
    }
  }
  const criteriaByPath = readModel.paths.map((path) => {
    const applicableCriteria = request.criteria.filter((criterion) =>
      pathContainsTarget(path, criterion.schoolField.target)
    );
    const comparisons = applicableCriteria.map((criterion) =>
      compareReviewedEducationCriterion({
        dataset: catalogSnapshot.dataset,
        criterion,
        reviewAuthority: input.reviewAuthority,
        authorizedFacts: initialAuthority.authorizedForAI,
        assessedAt: request.catalog.assessedAt,
        assessmentDate: request.catalog.assessmentDate,
        ...(request.catalog.maxAgeMsByField
          ? { maxAgeMsByField: request.catalog.maxAgeMsByField }
          : {}),
      })
    );
    const hasAdmissionsRule = path.fields.some(
      (field) =>
        field.target.type === "COURSE" &&
        field.target.id === path.course.courseId &&
        field.fieldKey === "COURSE_ADMISSIONS_CRITERIA"
    );
    const reviewedAdmissionsCriterion = applicableCriteria.some(
      (criterion) =>
        criterion.schoolField.target.type === "COURSE" &&
        criterion.schoolField.target.id === path.course.courseId &&
        criterion.schoolField.fieldKey === "COURSE_ADMISSIONS_CRITERIA"
    );
    const admissionField = path.fields.find(
      (field) =>
        field.target.type === "COURSE" &&
        field.target.id === path.course.courseId &&
        field.fieldKey === "COURSE_ADMISSIONS_CRITERIA"
    );
    const missingReviewedRule =
      hasAdmissionsRule && !reviewedAdmissionsCriterion
        ? missingReviewedRuleForField(path.course.courseId, admissionField)
        : undefined;
    return {
      path,
      comparisons,
      ...(missingReviewedRule ? { missingReviewedRule } : {}),
    };
  });
  const scopedCriterionIds = new Set(
    criteriaByPath.flatMap((item) =>
      item.comparisons.map((comparison) => comparison.criterionId)
    )
  );
  const criterionExclusions = request.criteria
    .filter((criterion) => !scopedCriterionIds.has(criterion.criterionId))
    .map((criterion) => ({
      criterionId: criterion.criterionId,
      reason: "CRITERION_TARGET_OUTSIDE_EXACT_CATALOG_SCOPE" as const,
    }));
  const result: ProjectPossibleOptionsResult = {
    schema: "education.project-possible-options.v1",
    projectId: request.projectId,
    catalogSnapshotToken: readModel.snapshotToken,
    assessedAt: readModel.assessedAt,
    paths: criteriaByPath,
    catalogExclusions: readModel.exclusions,
    criterionExclusions,
    limitation:
      "Possible options for further review only; no admission or visa determination",
    applicantFactLabel:
      "Customer-confirmed facts are not independently verified",
    humanReviewRequired: true,
    noEligibilitySignal: true,
  };
  if (new TextEncoder().encode(JSON.stringify(result)).byteLength > 2_000_000) {
    throw new ProjectPossibleOptionsError();
  }
  const finalAuthority = await readAuthority();
  if (
    !acceptedContext(finalAuthority, request) ||
    !validateAuthorizedFacts(finalAuthority.authorizedForAI) ||
    authorityFingerprint(finalAuthority) !== initialFingerprint
  ) {
    throw new ProjectPossibleOptionsError();
  }
  return result;
}

function missingReviewedRuleForField(
  courseId: string,
  field: EducationReadField | undefined
): EducationCriterionComparison {
  return missingReviewedRule({
    criterionId: `missing-reviewed-admissions-rule:${courseId}`,
    ...(field?.sourceRefs[0] ? { schoolReference: field.sourceRefs[0] } : {}),
  });
}
