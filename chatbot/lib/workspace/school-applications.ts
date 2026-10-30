/**
 * Phase 13 M5.1 customer client for School Applications.
 *
 * Pure, testable transport/state layer: the React panel owns rendering and this
 * module owns request shapes, strict response validation and error
 * classification. Only the actor's own applications are ever requested; the
 * server derives Project and actor identity.
 */

export type SchoolApplicationStatus =
  | "draft"
  | "preparing"
  | "package_prepared"
  | "stale"
  | "archived";

export type SchoolApplicationSourceStatus =
  | "unverified_customer_declared"
  | "unverified_catalog_match"
  | "synthetic_catalog_match";

export type SchoolApplicationPackageView = {
  packageId: string;
  version: number;
  status: "current" | "superseded" | "stale";
  contentSha256: string;
  inputsSha256: string;
  targetBindingSha256: string;
  createdAt: string;
  integrityVerified: boolean;
  /** Server-authoritative: this package is current AND all inputs still match. */
  usable: boolean;
  staleReasonCodes: string[];
};

export type SchoolApplicationReferenceView = {
  referenceRecordId: string;
  kind: "fact" | "requirement" | "document";
  referenceId: string;
  referenceVersion: number;
  available: boolean;
  changed: boolean;
  boundAt: string;
  revokedAt: string | null;
};

export type SchoolApplicationDetail = {
  applicationId: string;
  projectId: string;
  status: SchoolApplicationStatus;
  revision: number;
  institutionName: string;
  institutionId: string | null;
  courseTitle: string;
  courseId: string | null;
  deliveryId: string | null;
  intakeId: string | null;
  intakeLabel: string | null;
  sourceStatus: SchoolApplicationSourceStatus;
  catalogRecordClass: "SYNTHETIC" | "UNVERIFIED" | null;
  missingDataCodes: string[];
  disclosures: string[];
  references: SchoolApplicationReferenceView[];
  packages: SchoolApplicationPackageView[];
  currentPackage: SchoolApplicationPackageView | null;
  packageStale: boolean;
  staleReasonCodes: string[];
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
};

export type SchoolApplicationDraft = {
  institutionName: string;
  institutionId: string | null;
  courseTitle: string;
  courseId: string | null;
  deliveryId: string | null;
  intakeId: string | null;
  intakeLabel: string | null;
};

export type SchoolApplicationErrorKind =
  | "authentication_required"
  | "not_found"
  | "state_changed"
  | "limit_reached"
  | "invalid_request"
  | "unavailable"
  | "request_failed";

export type SchoolApplicationsSnapshot = {
  applications: SchoolApplicationDetail[];
  selectedApplicationId: string | null;
  detail: SchoolApplicationDetail | null;
  loading: boolean;
  loadingDetail: boolean;
  /** Name of the action currently in flight, for button-level disabling. */
  pendingAction: string | null;
  error: SchoolApplicationErrorKind | null;
};

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringOrNull(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

const STATUSES: readonly string[] = [
  "draft",
  "preparing",
  "package_prepared",
  "stale",
  "archived",
];
const SOURCE_STATUSES: readonly string[] = [
  "unverified_customer_declared",
  "unverified_catalog_match",
  "synthetic_catalog_match",
];
const REFERENCE_KINDS: readonly string[] = ["fact", "requirement", "document"];
const PACKAGE_STATUSES: readonly string[] = ["current", "superseded", "stale"];

function parsePackage(value: unknown): SchoolApplicationPackageView | null {
  if (!isRecord(value)) {
    return null;
  }
  if (
    typeof value.packageId !== "string" ||
    typeof value.version !== "number" ||
    typeof value.status !== "string" ||
    !PACKAGE_STATUSES.includes(value.status) ||
    typeof value.contentSha256 !== "string" ||
    typeof value.inputsSha256 !== "string" ||
    typeof value.targetBindingSha256 !== "string" ||
    typeof value.createdAt !== "string" ||
    typeof value.integrityVerified !== "boolean" ||
    typeof value.usable !== "boolean" ||
    !Array.isArray(value.staleReasonCodes)
  ) {
    return null;
  }
  return {
    contentSha256: value.contentSha256,
    createdAt: value.createdAt,
    inputsSha256: value.inputsSha256,
    integrityVerified: value.integrityVerified,
    packageId: value.packageId,
    staleReasonCodes: value.staleReasonCodes.filter(
      (entry): entry is string => typeof entry === "string"
    ),
    status: value.status as SchoolApplicationPackageView["status"],
    targetBindingSha256: value.targetBindingSha256,
    usable: value.usable,
    version: value.version,
  };
}

function parseReference(value: unknown): SchoolApplicationReferenceView | null {
  if (!isRecord(value)) {
    return null;
  }
  if (
    typeof value.referenceRecordId !== "string" ||
    typeof value.kind !== "string" ||
    !REFERENCE_KINDS.includes(value.kind) ||
    typeof value.referenceId !== "string" ||
    typeof value.referenceVersion !== "number" ||
    typeof value.available !== "boolean" ||
    typeof value.changed !== "boolean" ||
    typeof value.boundAt !== "string" ||
    !isStringOrNull(value.revokedAt)
  ) {
    return null;
  }
  return {
    available: value.available,
    boundAt: value.boundAt,
    changed: value.changed,
    kind: value.kind as SchoolApplicationReferenceView["kind"],
    referenceId: value.referenceId,
    referenceRecordId: value.referenceRecordId,
    referenceVersion: value.referenceVersion,
    revokedAt: value.revokedAt,
  };
}

export function parseSchoolApplication(
  value: unknown
): SchoolApplicationDetail | null {
  if (!isRecord(value)) {
    return null;
  }
  const institution = value.institution;
  const course = value.course;
  const intake = value.intake;
  const source = value.source;
  if (
    typeof value.applicationId !== "string" ||
    typeof value.projectId !== "string" ||
    typeof value.status !== "string" ||
    !STATUSES.includes(value.status) ||
    typeof value.revision !== "number" ||
    !isRecord(institution) ||
    typeof institution.name !== "string" ||
    !isStringOrNull(institution.catalogId) ||
    !isRecord(course) ||
    typeof course.title !== "string" ||
    !isStringOrNull(course.catalogId) ||
    !isRecord(intake) ||
    !isStringOrNull(intake.id) ||
    !isStringOrNull(intake.label) ||
    !isRecord(source) ||
    typeof source.status !== "string" ||
    !SOURCE_STATUSES.includes(source.status) ||
    !Array.isArray(value.missingDataCodes) ||
    !Array.isArray(value.disclosures) ||
    !Array.isArray(value.references) ||
    !Array.isArray(value.packages) ||
    typeof value.packageStale !== "boolean" ||
    !Array.isArray(value.staleReasonCodes) ||
    typeof value.createdAt !== "string" ||
    typeof value.updatedAt !== "string" ||
    !isStringOrNull(value.archivedAt)
  ) {
    return null;
  }
  const references = value.references.map(parseReference);
  const packages = value.packages.map(parsePackage);
  if (references.some((entry) => entry === null)) {
    return null;
  }
  if (packages.some((entry) => entry === null)) {
    return null;
  }
  const currentPackage =
    value.currentPackage === null ? null : parsePackage(value.currentPackage);
  if (value.currentPackage !== null && currentPackage === null) {
    return null;
  }
  return {
    applicationId: value.applicationId,
    archivedAt: value.archivedAt,
    catalogRecordClass:
      source.catalogRecordClass === "SYNTHETIC" ||
      source.catalogRecordClass === "UNVERIFIED"
        ? source.catalogRecordClass
        : null,
    courseId: course.catalogId,
    courseTitle: course.title,
    createdAt: value.createdAt,
    currentPackage,
    deliveryId: isStringOrNull(value.deliveryId) ? value.deliveryId : null,
    disclosures: value.disclosures.filter(
      (entry): entry is string => typeof entry === "string"
    ),
    institutionId: institution.catalogId,
    institutionName: institution.name,
    intakeId: intake.id,
    intakeLabel: intake.label,
    missingDataCodes: value.missingDataCodes.filter(
      (entry): entry is string => typeof entry === "string"
    ),
    packageStale: value.packageStale,
    packages: packages as SchoolApplicationPackageView[],
    projectId: value.projectId,
    references: references as SchoolApplicationReferenceView[],
    revision: value.revision,
    sourceStatus: source.status as SchoolApplicationSourceStatus,
    staleReasonCodes: value.staleReasonCodes.filter(
      (entry): entry is string => typeof entry === "string"
    ),
    status: value.status as SchoolApplicationStatus,
    updatedAt: value.updatedAt,
  };
}

export function classifySchoolApplicationError(
  status: number
): SchoolApplicationErrorKind {
  if (status === 401) {
    return "authentication_required";
  }
  if (status === 404) {
    return "not_found";
  }
  if (status === 409) {
    return "state_changed";
  }
  if (status === 400 || status === 413 || status === 415) {
    return "invalid_request";
  }
  if (status === 503) {
    return "unavailable";
  }
  return "request_failed";
}

function basePath(projectId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/school-applications`;
}

export function buildSchoolApplicationCreateBody(input: {
  operationId: string;
  draft: SchoolApplicationDraft;
}) {
  return {
    courseId: input.draft.courseId,
    courseTitle: input.draft.courseTitle,
    deliveryId: input.draft.deliveryId,
    institutionId: input.draft.institutionId,
    institutionName: input.draft.institutionName,
    intakeId: input.draft.intakeId,
    intakeLabel: input.draft.intakeLabel,
    operationId: input.operationId,
  };
}

export function buildSchoolApplicationUpdateBody(input: {
  operationId: string;
  expectedRevision: number;
  draft: SchoolApplicationDraft;
}) {
  return {
    ...buildSchoolApplicationCreateBody({
      draft: input.draft,
      operationId: input.operationId,
    }),
    expectedRevision: input.expectedRevision,
  };
}

export function buildSchoolApplicationReferenceBody(input: {
  operationId: string;
  expectedRevision: number;
  kind: "fact" | "requirement" | "document";
  referenceId: string;
}) {
  return {
    expectedRevision: input.expectedRevision,
    kind: input.kind,
    operationId: input.operationId,
    referenceId: input.referenceId,
  };
}

export function schoolApplicationStatusLabelKey(
  status: SchoolApplicationStatus
):
  | "statusDraft"
  | "statusPreparing"
  | "statusPackagePrepared"
  | "statusStale"
  | "statusArchived" {
  switch (status) {
    case "draft":
      return "statusDraft";
    case "preparing":
      return "statusPreparing";
    case "package_prepared":
      return "statusPackagePrepared";
    case "stale":
      return "statusStale";
    default:
      return "statusArchived";
  }
}

export type SchoolApplicationsController = ReturnType<
  typeof createSchoolApplicationsController
>;

export function createSchoolApplicationsController(
  options: {
    readonly fetchImpl?: FetchLike;
    /** Injected in tests; defaults to a random operation identity. */
    readonly newOperationId?: () => string;
  } = {}
) {
  const fetchImpl: FetchLike =
    options.fetchImpl ?? ((input, init) => fetch(input as string, init));
  const newOperationId =
    options.newOperationId ??
    (() =>
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `op-${Date.now()}-${Math.random().toString(16).slice(2)}`);

  let snapshot: SchoolApplicationsSnapshot = {
    applications: [],
    detail: null,
    error: null,
    loading: false,
    loadingDetail: false,
    pendingAction: null,
    selectedApplicationId: null,
  };
  const listeners = new Set<() => void>();

  function set(patch: Partial<SchoolApplicationsSnapshot>) {
    snapshot = { ...snapshot, ...patch };
    for (const listener of listeners) {
      listener();
    }
  }

  type RequestResult =
    | { ok: true; body: unknown }
    | { ok: false; error: SchoolApplicationErrorKind };

  async function request(
    path: string,
    init?: RequestInit
  ): Promise<RequestResult> {
    let response: Response;
    try {
      response = await fetchImpl(path, {
        cache: "no-store",
        credentials: "same-origin",
        ...init,
        headers: {
          accept: "application/json",
          ...(init?.body ? { "content-type": "application/json" } : {}),
          ...init?.headers,
        },
      });
    } catch {
      return { error: "request_failed", ok: false };
    }
    if (!response.ok) {
      return {
        error: classifySchoolApplicationError(response.status),
        ok: false,
      };
    }
    try {
      return { body: (await response.json()) as unknown, ok: true };
    } catch {
      return { error: "request_failed", ok: false };
    }
  }

  function detailFrom(body: unknown): SchoolApplicationDetail | null {
    return isRecord(body) ? parseSchoolApplication(body.application) : null;
  }

  function listFrom(body: unknown): SchoolApplicationDetail[] | null {
    if (!isRecord(body) || !Array.isArray(body.applications)) {
      return null;
    }
    const parsed = body.applications.map(parseSchoolApplication);
    return parsed.some((entry) => entry === null)
      ? null
      : (parsed as SchoolApplicationDetail[]);
  }

  function mergeDetail(detail: SchoolApplicationDetail) {
    return snapshot.applications.some(
      (entry) => entry.applicationId === detail.applicationId
    )
      ? snapshot.applications.map((entry) =>
          entry.applicationId === detail.applicationId ? detail : entry
        )
      : [...snapshot.applications, detail];
  }

  function applyDetail(
    result: RequestResult
  ): SchoolApplicationErrorKind | null {
    if (!result.ok) {
      set({ error: result.error, pendingAction: null });
      return result.error;
    }
    const detail = detailFrom(result.body);
    if (!detail) {
      set({ error: "request_failed", pendingAction: null });
      return "request_failed";
    }
    set({
      applications: mergeDetail(detail),
      detail,
      error: null,
      pendingAction: null,
      selectedApplicationId: detail.applicationId,
    });
    return null;
  }

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    getSnapshot(): SchoolApplicationsSnapshot {
      return snapshot;
    },

    reset() {
      snapshot = {
        applications: [],
        detail: null,
        error: null,
        loading: false,
        loadingDetail: false,
        pendingAction: null,
        selectedApplicationId: null,
      };
      for (const listener of listeners) {
        listener();
      }
    },

    async load(projectId: string): Promise<SchoolApplicationErrorKind | null> {
      set({ error: null, loading: true });
      const result = await request(basePath(projectId));
      if (!result.ok) {
        set({ error: result.error, loading: false });
        return result.error;
      }
      const applications = listFrom(result.body);
      if (!applications) {
        set({ error: "request_failed", loading: false });
        return "request_failed";
      }
      const selected =
        applications.find(
          (entry) => entry.applicationId === snapshot.selectedApplicationId
        ) ?? null;
      set({
        applications,
        detail: selected,
        error: null,
        loading: false,
        selectedApplicationId: selected?.applicationId ?? null,
      });
      return null;
    },

    async open(
      projectId: string,
      applicationId: string
    ): Promise<SchoolApplicationErrorKind | null> {
      set({
        error: null,
        loadingDetail: true,
        selectedApplicationId: applicationId,
      });
      const result = await request(
        `${basePath(projectId)}/${encodeURIComponent(applicationId)}`
      );
      if (!result.ok) {
        set({ error: result.error, loadingDetail: false });
        return result.error;
      }
      const detail = detailFrom(result.body);
      if (!detail) {
        set({ error: "request_failed", loadingDetail: false });
        return "request_failed";
      }
      set({
        applications: mergeDetail(detail),
        detail,
        error: null,
        loadingDetail: false,
      });
      return null;
    },

    async create(
      projectId: string,
      draft: SchoolApplicationDraft
    ): Promise<SchoolApplicationErrorKind | null> {
      set({ error: null, pendingAction: "create" });
      return applyDetail(
        await request(basePath(projectId), {
          body: JSON.stringify(
            buildSchoolApplicationCreateBody({
              draft,
              operationId: newOperationId(),
            })
          ),
          method: "POST",
        })
      );
    },

    async update(
      projectId: string,
      current: SchoolApplicationDetail,
      draft: SchoolApplicationDraft
    ): Promise<SchoolApplicationErrorKind | null> {
      set({ error: null, pendingAction: "update" });
      return applyDetail(
        await request(
          `${basePath(projectId)}/${encodeURIComponent(current.applicationId)}`,
          {
            body: JSON.stringify(
              buildSchoolApplicationUpdateBody({
                draft,
                expectedRevision: current.revision,
                operationId: newOperationId(),
              })
            ),
            method: "PATCH",
          }
        )
      );
    },

    async archive(
      projectId: string,
      current: SchoolApplicationDetail
    ): Promise<SchoolApplicationErrorKind | null> {
      set({ error: null, pendingAction: "archive" });
      return applyDetail(
        await request(
          `${basePath(projectId)}/${encodeURIComponent(current.applicationId)}/archive`,
          {
            body: JSON.stringify({
              expectedRevision: current.revision,
              operationId: newOperationId(),
            }),
            method: "POST",
          }
        )
      );
    },

    async buildPackage(
      projectId: string,
      current: SchoolApplicationDetail
    ): Promise<SchoolApplicationErrorKind | null> {
      set({ error: null, pendingAction: "package" });
      return applyDetail(
        await request(
          `${basePath(projectId)}/${encodeURIComponent(current.applicationId)}/packages`,
          {
            body: JSON.stringify({
              expectedRevision: current.revision,
              operationId: newOperationId(),
            }),
            method: "POST",
          }
        )
      );
    },

    async bindReference(
      projectId: string,
      current: SchoolApplicationDetail,
      input: { kind: "fact" | "requirement" | "document"; referenceId: string }
    ): Promise<SchoolApplicationErrorKind | null> {
      set({ error: null, pendingAction: "reference" });
      return applyDetail(
        await request(
          `${basePath(projectId)}/${encodeURIComponent(current.applicationId)}/references`,
          {
            body: JSON.stringify(
              buildSchoolApplicationReferenceBody({
                expectedRevision: current.revision,
                kind: input.kind,
                operationId: newOperationId(),
                referenceId: input.referenceId,
              })
            ),
            method: "POST",
          }
        )
      );
    },

    async revokeReference(
      projectId: string,
      current: SchoolApplicationDetail,
      referenceRecordId: string
    ): Promise<SchoolApplicationErrorKind | null> {
      set({ error: null, pendingAction: "reference" });
      return applyDetail(
        await request(
          `${basePath(projectId)}/${encodeURIComponent(current.applicationId)}/references/${encodeURIComponent(referenceRecordId)}/revoke`,
          {
            body: JSON.stringify({
              expectedRevision: current.revision,
              operationId: newOperationId(),
            }),
            method: "POST",
          }
        )
      );
    },
  };
}
