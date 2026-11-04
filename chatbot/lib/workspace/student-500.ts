/**
 * Phase 13 M6.1 customer client for Student 500 application preparation.
 *
 * Pure, testable transport/state layer: the React panel owns rendering and this
 * module owns request shapes, strict response validation and error
 * classification. Only the actor's own applications are ever requested; the
 * server derives Project, actor and applicant identity.
 *
 * Nothing here can express eligibility, approval, verification or readiness: the
 * parsed vocabulary is a preparation vocabulary, and any unknown server value is
 * rejected instead of being coerced.
 */

import { parseSchoolApplication } from "./school-applications";

export type Student500ApplicationStatus = "draft" | "in_progress" | "archived";

export type Student500ContextView = {
  entryRoute:
    | "existing_coe"
    | "offer_only"
    | "school_application_in_progress"
    | "no_school_application"
    | null;
  coeStatus: "reported_held" | "reported_not_held" | "unknown";
  applicationPlace: "onshore" | "offshore" | "unknown";
  asOfDate: string | null;
  currentVisaSubclass: string | null;
  historyDeclaration: "not_declared" | "declared_none" | "declared_some";
  historyFlags: { flag: string; reportedOn: string | null }[];
  applicantAgeBand: "adult" | "under_18" | "unknown";
  dependants: "none" | "one_or_more" | "unknown";
  englishEvidence: "reported_held" | "reported_not_held" | "unknown";
  financialEvidence: "reported_held" | "reported_not_held" | "unknown";
  oshcEvidence: "reported_held" | "reported_not_held" | "unknown";
  schoolApplicationId: string | null;
};

export type Student500Draft = Student500ContextView;

export type Student500RequirementView = {
  requirementKey: string;
  status: "applicable" | "conditional" | "not_applicable" | "unknown";
  reasonCode: string;
  missingFactCodes: string[];
  evidencePreparation:
    | "reported_held"
    | "reported_not_held"
    | "not_declared"
    | "not_applicable";
  sourceVerification:
    | "verified_official_corpus"
    | "declared_pending_verification"
    | "insufficient_authority"
    | "unavailable";
  humanReviewRequired: boolean;
  sources: Student500SourceView[];
};

export type Student500SourceView = {
  sourceId: string;
  authorityClass:
    | "legislation"
    | "legislative_instrument"
    | "official_guidance";
  instrumentTitle: string;
  provisionLocator: string;
  officialReference: string | null;
  officialUrl: string | null;
  urlVerified: boolean;
  compilationLabel: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  verification: string;
  asOfCoverage: "covered" | "outside_declared_coverage" | "unknown";
};

export type Student500ScreeningView = {
  asOfDate: string | null;
  legalSourceRevision: string;
  legalSourceVersions: string[];
  legalSourceTransitionNote: string | null;
  officialChecklist: {
    status: string;
    toolUrl: string;
    missingToolInputs: string[];
  };
  submissionStatus: "not_submission_ready";
  preparationState:
    | "screening_incomplete"
    | "screening_complete_pending_review";
  requirements: Student500RequirementView[];
  counts: {
    applicable: number;
    conditional: number;
    notApplicable: number;
    unknown: number;
  };
  missingFactCodes: string[];
  humanReviewReasons: string[];
  nextAction: string;
  disclosures: string[];
  studyEvidence: {
    route: string | null;
    coeStatus: string;
    coeVerification:
      | "customer_reported_not_verified"
      | "none_reported"
      | "unknown";
    linkedSchoolApplication: {
      schoolApplicationId: string;
      status: string;
      sourceStatus: string;
      available: boolean;
    } | null;
  };
};

export type Student500ApplicationSummary = {
  applicationId: string;
  projectId: string;
  status: Student500ApplicationStatus;
  revision: number;
  context: Student500ContextView;
  screening: Student500ScreeningView;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
};

export type Student500ApplicationDetail = Student500ApplicationSummary & {
  events: {
    eventType: string;
    subjectKind: string;
    applicationRevision: number;
    createdAt: string;
  }[];
};

export type Student500ErrorKind =
  | "authentication_required"
  | "not_found"
  | "state_changed"
  | "limit_reached"
  | "invalid_request"
  | "unavailable"
  | "request_failed";

export type Student500Snapshot = {
  applications: Student500ApplicationSummary[];
  selectedApplicationId: string | null;
  detail: Student500ApplicationDetail | null;
  loading: boolean;
  loadingDetail: boolean;
  pendingAction: string | null;
  error: Student500ErrorKind | null;
};

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

export function baseStudent500Path(projectId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/student-500-applications`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringOrNull(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isEnum<T extends string>(
  values: readonly T[],
  value: unknown
): value is T {
  return (
    typeof value === "string" && (values as readonly string[]).includes(value)
  );
}

const STATUSES = ["draft", "in_progress", "archived"] as const;
const REQUIREMENT_STATUSES = [
  "applicable",
  "conditional",
  "not_applicable",
  "unknown",
] as const;
const SOURCE_VERIFICATIONS = [
  "verified_official_corpus",
  "declared_pending_verification",
  "insufficient_authority",
  "unavailable",
] as const;
const EVIDENCE_PREPARATIONS = [
  "reported_held",
  "reported_not_held",
  "not_declared",
  "not_applicable",
] as const;
const AUTHORITY_CLASSES = [
  "legislation",
  "legislative_instrument",
  "official_guidance",
] as const;
const AS_OF_COVERAGE = [
  "covered",
  "outside_declared_coverage",
  "unknown",
] as const;
const PREPARATION_STATES = [
  "screening_incomplete",
  "screening_complete_pending_review",
] as const;
const COE_STATUSES = ["reported_held", "reported_not_held", "unknown"] as const;
const ENTRY_ROUTES = [
  "existing_coe",
  "offer_only",
  "school_application_in_progress",
  "no_school_application",
] as const;
const APPLICATION_PLACES = ["onshore", "offshore", "unknown"] as const;
const AGE_BANDS = ["adult", "under_18", "unknown"] as const;
const DEPENDANT_BANDS = ["none", "one_or_more", "unknown"] as const;
const EVIDENCE_STATUSES = [
  "reported_held",
  "reported_not_held",
  "unknown",
] as const;
const HISTORY_DECLARATIONS = [
  "not_declared",
  "declared_none",
  "declared_some",
] as const;
const COE_VERIFICATIONS = [
  "customer_reported_not_verified",
  "none_reported",
  "unknown",
] as const;

function parseSource(value: unknown): Student500SourceView | null {
  if (!isRecord(value)) {
    return null;
  }
  if (
    typeof value.sourceId !== "string" ||
    typeof value.instrumentTitle !== "string" ||
    typeof value.provisionLocator !== "string" ||
    !isEnum(AUTHORITY_CLASSES, value.authorityClass) ||
    !isEnum(AS_OF_COVERAGE, value.asOfCoverage) ||
    typeof value.urlVerified !== "boolean" ||
    !isStringOrNull(value.officialReference) ||
    !isStringOrNull(value.officialUrl) ||
    !isStringOrNull(value.compilationLabel) ||
    !isStringOrNull(value.effectiveFrom) ||
    !isStringOrNull(value.effectiveTo) ||
    typeof value.verification !== "string"
  ) {
    return null;
  }
  return {
    asOfCoverage: value.asOfCoverage,
    authorityClass: value.authorityClass,
    compilationLabel: value.compilationLabel,
    effectiveFrom: value.effectiveFrom,
    effectiveTo: value.effectiveTo,
    instrumentTitle: value.instrumentTitle,
    officialReference: value.officialReference,
    officialUrl: value.officialUrl,
    provisionLocator: value.provisionLocator,
    sourceId: value.sourceId,
    urlVerified: value.urlVerified,
    verification: value.verification,
  };
}

function parseRequirement(value: unknown): Student500RequirementView | null {
  if (!isRecord(value)) {
    return null;
  }
  if (
    typeof value.requirementKey !== "string" ||
    typeof value.reasonCode !== "string" ||
    !isEnum(REQUIREMENT_STATUSES, value.status) ||
    !isEnum(SOURCE_VERIFICATIONS, value.sourceVerification) ||
    !isEnum(EVIDENCE_PREPARATIONS, value.evidencePreparation) ||
    typeof value.humanReviewRequired !== "boolean" ||
    !Array.isArray(value.missingFactCodes) ||
    !value.missingFactCodes.every((code) => typeof code === "string") ||
    !Array.isArray(value.sources)
  ) {
    return null;
  }
  const sources: Student500SourceView[] = [];
  for (const entry of value.sources) {
    const source = parseSource(entry);
    if (!source) {
      return null;
    }
    sources.push(source);
  }
  return {
    evidencePreparation: value.evidencePreparation,
    humanReviewRequired: value.humanReviewRequired,
    missingFactCodes: value.missingFactCodes as string[],
    reasonCode: value.reasonCode,
    requirementKey: value.requirementKey,
    sourceVerification: value.sourceVerification,
    sources,
    status: value.status,
  };
}

function parseStringArray(value: unknown): string[] | null {
  if (
    !Array.isArray(value) ||
    !value.every((entry) => typeof entry === "string")
  ) {
    return null;
  }
  return value as string[];
}

function parseContext(value: unknown): Student500ContextView | null {
  if (!isRecord(value)) {
    return null;
  }
  if (
    !isEnum(COE_STATUSES, value.coeStatus) ||
    !isEnum(APPLICATION_PLACES, value.applicationPlace) ||
    !isEnum(AGE_BANDS, value.applicantAgeBand) ||
    !isEnum(DEPENDANT_BANDS, value.dependants) ||
    !isEnum(EVIDENCE_STATUSES, value.englishEvidence) ||
    !isEnum(EVIDENCE_STATUSES, value.financialEvidence) ||
    !isEnum(EVIDENCE_STATUSES, value.oshcEvidence) ||
    !isEnum(HISTORY_DECLARATIONS, value.historyDeclaration) ||
    !isStringOrNull(value.asOfDate) ||
    !isStringOrNull(value.currentVisaSubclass) ||
    !isStringOrNull(value.schoolApplicationId) ||
    !Array.isArray(value.historyFlags)
  ) {
    return null;
  }
  const entryRoute =
    value.entryRoute === null
      ? null
      : isEnum(ENTRY_ROUTES, value.entryRoute)
        ? value.entryRoute
        : undefined;
  if (entryRoute === undefined) {
    return null;
  }
  const historyFlags: { flag: string; reportedOn: string | null }[] = [];
  for (const entry of value.historyFlags) {
    if (
      !isRecord(entry) ||
      typeof entry.flag !== "string" ||
      !isStringOrNull(entry.reportedOn)
    ) {
      return null;
    }
    historyFlags.push({ flag: entry.flag, reportedOn: entry.reportedOn });
  }
  return {
    applicantAgeBand: value.applicantAgeBand,
    applicationPlace: value.applicationPlace,
    asOfDate: value.asOfDate,
    coeStatus: value.coeStatus,
    currentVisaSubclass: value.currentVisaSubclass,
    dependants: value.dependants,
    englishEvidence: value.englishEvidence,
    entryRoute,
    financialEvidence: value.financialEvidence,
    historyDeclaration: value.historyDeclaration,
    historyFlags,
    oshcEvidence: value.oshcEvidence,
    schoolApplicationId: value.schoolApplicationId,
  };
}

function parseScreening(value: unknown): Student500ScreeningView | null {
  if (!isRecord(value) || !isRecord(value.studyEvidence)) {
    return null;
  }
  if (!isRecord(value.counts)) {
    return null;
  }
  const requirements: Student500RequirementView[] = [];
  if (!Array.isArray(value.requirements)) {
    return null;
  }
  for (const entry of value.requirements) {
    const requirement = parseRequirement(entry);
    if (!requirement) {
      return null;
    }
    requirements.push(requirement);
  }
  const missingFactCodes = parseStringArray(value.missingFactCodes);
  const humanReviewReasons = parseStringArray(value.humanReviewReasons);
  const disclosures = parseStringArray(value.disclosures);
  const counts = value.counts;
  if (
    missingFactCodes === null ||
    humanReviewReasons === null ||
    disclosures === null ||
    typeof counts.applicable !== "number" ||
    typeof counts.conditional !== "number" ||
    typeof counts.notApplicable !== "number" ||
    typeof counts.unknown !== "number" ||
    typeof value.nextAction !== "string" ||
    typeof value.legalSourceRevision !== "string" ||
    value.submissionStatus !== "not_submission_ready" ||
    !isEnum(PREPARATION_STATES, value.preparationState) ||
    !isStringOrNull(value.asOfDate)
  ) {
    return null;
  }
  const study = value.studyEvidence;
  if (
    !isStringOrNull(study.route) ||
    typeof study.coeStatus !== "string" ||
    !isEnum(COE_VERIFICATIONS, study.coeVerification)
  ) {
    return null;
  }
  let linked: Student500ScreeningView["studyEvidence"]["linkedSchoolApplication"] =
    null;
  if (study.linkedSchoolApplication !== null) {
    const entry = study.linkedSchoolApplication;
    if (
      !isRecord(entry) ||
      typeof entry.schoolApplicationId !== "string" ||
      typeof entry.status !== "string" ||
      typeof entry.sourceStatus !== "string" ||
      typeof entry.available !== "boolean"
    ) {
      return null;
    }
    linked = {
      available: entry.available,
      schoolApplicationId: entry.schoolApplicationId,
      sourceStatus: entry.sourceStatus,
      status: entry.status,
    };
  }
  const legalSourceVersions = parseStringArray(value.legalSourceVersions);
  const checklist = value.officialChecklist;
  if (
    legalSourceVersions === null ||
    !isRecord(checklist) ||
    typeof checklist.status !== "string" ||
    typeof checklist.toolUrl !== "string"
  ) {
    return null;
  }
  const checklistInputs = parseStringArray(checklist.missingToolInputs);
  if (checklistInputs === null) {
    return null;
  }
  return {
    asOfDate: value.asOfDate,
    legalSourceRevision: value.legalSourceRevision,
    legalSourceTransitionNote: isStringOrNull(value.legalSourceTransitionNote)
      ? value.legalSourceTransitionNote
      : null,
    legalSourceVersions,
    officialChecklist: {
      missingToolInputs: checklistInputs,
      status: checklist.status,
      toolUrl: checklist.toolUrl,
    },
    counts: {
      applicable: counts.applicable,
      conditional: counts.conditional,
      notApplicable: counts.notApplicable,
      unknown: counts.unknown,
    },
    disclosures,
    humanReviewReasons,
    missingFactCodes,
    nextAction: value.nextAction,
    preparationState: value.preparationState,
    requirements,
    studyEvidence: {
      coeStatus: study.coeStatus,
      coeVerification: study.coeVerification,
      linkedSchoolApplication: linked,
      route: study.route,
    },
    submissionStatus: "not_submission_ready",
  };
}

/** Strict parse of one application payload; any unknown enum is rejected. */
export function parseStudent500Application(
  value: unknown
): Student500ApplicationSummary | null {
  if (!isRecord(value)) {
    return null;
  }
  if (
    typeof value.applicationId !== "string" ||
    typeof value.projectId !== "string" ||
    typeof value.revision !== "number" ||
    typeof value.createdAt !== "string" ||
    typeof value.updatedAt !== "string" ||
    !isStringOrNull(value.archivedAt) ||
    !isEnum(STATUSES, value.status)
  ) {
    return null;
  }
  const context = parseContext(value.context);
  const screening = parseScreening(value.screening);
  if (!(context && screening)) {
    return null;
  }
  return {
    applicationId: value.applicationId,
    archivedAt: value.archivedAt,
    context,
    createdAt: value.createdAt,
    projectId: value.projectId,
    revision: value.revision,
    screening,
    status: value.status,
    updatedAt: value.updatedAt,
  };
}

export function parseStudent500Detail(
  value: unknown
): Student500ApplicationDetail | null {
  const summary = parseStudent500Application(value);
  if (!(summary && isRecord(value) && Array.isArray(value.events))) {
    return null;
  }
  const events: Student500ApplicationDetail["events"] = [];
  for (const entry of value.events) {
    if (
      !isRecord(entry) ||
      typeof entry.eventType !== "string" ||
      typeof entry.subjectKind !== "string" ||
      typeof entry.applicationRevision !== "number" ||
      typeof entry.createdAt !== "string"
    ) {
      return null;
    }
    events.push({
      applicationRevision: entry.applicationRevision,
      createdAt: entry.createdAt,
      eventType: entry.eventType,
      subjectKind: entry.subjectKind,
    });
  }
  return { ...summary, events };
}

export function classifyStudent500Error(status: number): Student500ErrorKind {
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

/** Bounded request body for create; only authored applicant fields are sent. */
export function buildStudent500CreateBody(input: {
  draft: Student500Draft;
  operationId: string;
}): Record<string, unknown> {
  return { context: input.draft, operationId: input.operationId };
}

export function buildStudent500UpdateBody(input: {
  draft: Student500Draft;
  expectedRevision: number;
  operationId: string;
}): Record<string, unknown> {
  return {
    context: input.draft,
    expectedRevision: input.expectedRevision,
    operationId: input.operationId,
  };
}

export const EMPTY_STUDENT_500_DRAFT: Student500Draft = {
  applicantAgeBand: "unknown",
  applicationPlace: "unknown",
  asOfDate: null,
  coeStatus: "unknown",
  currentVisaSubclass: null,
  dependants: "unknown",
  englishEvidence: "unknown",
  entryRoute: null,
  financialEvidence: "unknown",
  historyDeclaration: "not_declared",
  historyFlags: [],
  oshcEvidence: "unknown",
  schoolApplicationId: null,
};

export function draftFromStudent500Context(
  context: Student500ContextView
): Student500Draft {
  return {
    ...context,
    historyFlags: context.historyFlags.map((entry) => ({ ...entry })),
  };
}

export function createStudent500Controller(
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

  let snapshot: Student500Snapshot = {
    applications: [],
    detail: null,
    error: null,
    loading: false,
    loadingDetail: false,
    pendingAction: null,
    selectedApplicationId: null,
  };
  const listeners = new Set<() => void>();
  /**
   * Monotonic detail-request sequence. A detail response may only be applied when
   * it still belongs to the newest `open()` call, so a slow response for a
   * previously selected application can never overwrite the current one.
   */
  let detailRequestSeq = 0;

  function set(patch: Partial<Student500Snapshot>) {
    snapshot = { ...snapshot, ...patch };
    for (const listener of listeners) {
      listener();
    }
  }

  type RequestResult =
    | { ok: true; body: unknown }
    | { ok: false; error: Student500ErrorKind };

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
      return { error: classifyStudent500Error(response.status), ok: false };
    }
    try {
      return { body: (await response.json()) as unknown, ok: true };
    } catch {
      return { error: "request_failed", ok: false };
    }
  }

  function detailFrom(body: unknown): Student500ApplicationDetail | null {
    return isRecord(body) ? parseStudent500Detail(body.application) : null;
  }

  /**
   * Applies a mutation response.
   *
   * The list entry is always refreshed (it is authoritative data for that
   * application), but the visible detail and selection are only replaced when this
   * response belongs to the application the customer is currently looking at. A
   * slow response for a superseded selection therefore cannot overwrite newer
   * content, and `create` is the one action that legitimately claims selection.
   */
  function applyDetail(
    result: RequestResult,
    options: {
      readonly claimSelection: boolean;
      readonly expectedApplicationId: string | null;
    }
  ): Student500ErrorKind | null {
    if (!result.ok) {
      set({ error: result.error, pendingAction: null });
      return result.error;
    }
    const detail = detailFrom(result.body);
    if (!detail) {
      set({ error: "request_failed", pendingAction: null });
      return "request_failed";
    }
    if (
      options.expectedApplicationId !== null &&
      detail.applicationId !== options.expectedApplicationId
    ) {
      // A response that does not describe the application we acted on is never
      // applied to the visible record.
      set({ error: "request_failed", pendingAction: null });
      return "request_failed";
    }
    const summary: Student500ApplicationSummary = detail;
    const applications = snapshot.applications.some(
      (entry) => entry.applicationId === detail.applicationId
    )
      ? snapshot.applications.map((entry) =>
          entry.applicationId === detail.applicationId ? summary : entry
        )
      : [...snapshot.applications, summary];
    const isVisible =
      options.claimSelection ||
      snapshot.selectedApplicationId === detail.applicationId;
    if (!isVisible) {
      set({ applications, error: null, pendingAction: null });
      return null;
    }
    set({
      applications,
      detail,
      error: null,
      pendingAction: null,
      selectedApplicationId: detail.applicationId,
    });
    return null;
  }

  /**
   * A mutation is only issued against a detail that is still the visible one for
   * the current selection and revision. Anything else means the customer is
   * acting on superseded content, which is reported as a state change instead of
   * writing it back to the server.
   */
  function staleDetailReason(
    current: Student500ApplicationSummary
  ): Student500ErrorKind | null {
    const visible = snapshot.detail;
    if (
      visible === null ||
      visible.applicationId !== current.applicationId ||
      snapshot.selectedApplicationId !== current.applicationId ||
      visible.revision !== current.revision
    ) {
      set({ error: "state_changed", pendingAction: null });
      return "state_changed";
    }
    return null;
  }

  function basePath(projectId: string): string {
    return baseStudent500Path(projectId);
  }

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    getSnapshot(): Student500Snapshot {
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

    async load(projectId: string): Promise<Student500ErrorKind | null> {
      set({ error: null, loading: true });
      const result = await request(basePath(projectId));
      if (!result.ok) {
        set({ error: result.error, loading: false });
        return result.error;
      }
      if (!(isRecord(result.body) && Array.isArray(result.body.applications))) {
        set({ error: "request_failed", loading: false });
        return "request_failed";
      }
      const applications: Student500ApplicationSummary[] = [];
      for (const entry of result.body.applications) {
        const parsed = parseStudent500Application(entry);
        if (!parsed) {
          set({ error: "request_failed", loading: false });
          return "request_failed";
        }
        applications.push(parsed);
      }
      const selected = snapshot.selectedApplicationId;
      const detail = snapshot.detail;
      // A list refresh never resurrects or silently replaces the visible detail.
      const detailStillListed = Boolean(
        detail &&
          applications.some(
            (entry) => entry.applicationId === detail.applicationId
          )
      );
      const nextSelection = detailStillListed
        ? (detail?.applicationId ?? null)
        : selected &&
            applications.some((entry) => entry.applicationId === selected)
          ? selected
          : (applications[0]?.applicationId ?? null);
      set({
        applications,
        detail: detailStillListed ? detail : null,
        error: null,
        loading: false,
        selectedApplicationId: nextSelection,
      });
      return null;
    },

    async open(
      projectId: string,
      applicationId: string
    ): Promise<Student500ErrorKind | null> {
      const requestId = ++detailRequestSeq;
      // The previous detail belongs to a different application, so it is cleared
      // immediately: switching A -> B must never display A's data under B.
      set({
        detail: null,
        error: null,
        loadingDetail: true,
        selectedApplicationId: applicationId,
      });
      const result = await request(
        `${basePath(projectId)}/${encodeURIComponent(applicationId)}`
      );
      if (requestId !== detailRequestSeq) {
        // A newer selection superseded this request; its response is discarded
        // rather than overwriting the newer detail.
        return null;
      }
      if (!result.ok) {
        set({ error: result.error, loadingDetail: false });
        return result.error;
      }
      const detail = detailFrom(result.body);
      if (!detail || detail.applicationId !== applicationId) {
        // A response describing another application is never displayed.
        set({ error: "request_failed", loadingDetail: false });
        return "request_failed";
      }
      set({ detail, error: null, loadingDetail: false });
      return null;
    },

    async create(
      projectId: string,
      draft: Student500Draft
    ): Promise<Student500ErrorKind | null> {
      set({ error: null, pendingAction: "create" });
      return applyDetail(
        await request(basePath(projectId), {
          body: JSON.stringify(
            buildStudent500CreateBody({ draft, operationId: newOperationId() })
          ),
          method: "POST",
        }),
        // Creating a new record is the one action that legitimately moves the
        // selection to the returned application.
        { claimSelection: true, expectedApplicationId: null }
      );
    },

    async update(
      projectId: string,
      current: Student500ApplicationSummary,
      draft: Student500Draft
    ): Promise<Student500ErrorKind | null> {
      const stale = staleDetailReason(current);
      if (stale) {
        return stale;
      }
      set({ error: null, pendingAction: "update" });
      return applyDetail(
        await request(
          `${basePath(projectId)}/${encodeURIComponent(current.applicationId)}`,
          {
            body: JSON.stringify(
              buildStudent500UpdateBody({
                draft,
                expectedRevision: current.revision,
                operationId: newOperationId(),
              })
            ),
            method: "PATCH",
          }
        ),
        { claimSelection: false, expectedApplicationId: current.applicationId }
      );
    },

    async archive(
      projectId: string,
      current: Student500ApplicationSummary
    ): Promise<Student500ErrorKind | null> {
      const stale = staleDetailReason(current);
      if (stale) {
        return stale;
      }
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
        ),
        { claimSelection: false, expectedApplicationId: current.applicationId }
      );
    },
  };
}

export type Student500Controller = ReturnType<
  typeof createStudent500Controller
>;

/**
 * A School Application the actor may legitimately link.
 *
 * The list is produced by the existing M5.1 Project-scoped endpoint, which returns
 * only the caller's own applications inside the authorized Project. The panel can
 * therefore offer a real selection instead of a free-text UUID field, and the
 * server re-authorizes the link again on save (`assertLinkAuthorized`), so a
 * tampered client still cannot associate a foreign application.
 */
export type LinkableSchoolApplication = {
  schoolApplicationId: string;
  institutionName: string;
  courseTitle: string;
  status: string;
  sourceStatus: string;
  revision: number;
};

export function schoolApplicationsPath(projectId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/school-applications`;
}

/**
 * Loads the actor's own linkable School Applications.
 *
 * Nothing is inferred: an empty list means "none exist yet", a failed request means
 * "could not load", and both are reported to the customer instead of silently
 * leaving the previous selection in place.
 */
export async function loadLinkableSchoolApplications(input: {
  readonly projectId: string;
  readonly fetchImpl?: FetchLike;
}): Promise<
  | { readonly ok: true; readonly applications: LinkableSchoolApplication[] }
  | { readonly ok: false; readonly error: Student500ErrorKind }
> {
  const fetchImpl: FetchLike =
    input.fetchImpl ?? ((request, init) => fetch(request as string, init));
  let response: Response;
  try {
    response = await fetchImpl(schoolApplicationsPath(input.projectId), {
      cache: "no-store",
      credentials: "same-origin",
      headers: { accept: "application/json" },
    });
  } catch {
    return { error: "request_failed", ok: false };
  }
  if (!response.ok) {
    return { error: classifyStudent500Error(response.status), ok: false };
  }
  let body: unknown;
  try {
    body = (await response.json()) as unknown;
  } catch {
    return { error: "request_failed", ok: false };
  }
  if (!(isRecord(body) && Array.isArray(body.applications))) {
    return { error: "request_failed", ok: false };
  }
  const applications: LinkableSchoolApplication[] = [];
  for (const entry of body.applications) {
    const parsed = parseSchoolApplication(entry);
    if (!parsed) {
      return { error: "request_failed", ok: false };
    }
    applications.push({
      courseTitle: parsed.courseTitle,
      institutionName: parsed.institutionName,
      revision: parsed.revision,
      schoolApplicationId: parsed.applicationId,
      sourceStatus: parsed.sourceStatus,
      status: parsed.status,
    });
  }
  return { applications, ok: true };
}
