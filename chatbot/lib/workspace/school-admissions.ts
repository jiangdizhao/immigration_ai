/**
 * Phase 13 M5.2 customer client for the School Admissions workflow.
 *
 * Pure, testable transport/state layer: the React panel owns rendering, this
 * module owns request shapes, strict-enough response validation and error
 * classification. The server derives Project, actor, provenance and readiness;
 * nothing here can widen authority.
 */

export type SchoolAdmissionsServiceMode = "self_service" | "managed_service";

export type SchoolAdmissionsRequirement = {
  code: string;
  status: string;
  appliesTo: string;
  required: boolean;
  uncertaintyCodes: string[];
};

export type SchoolAdmissionsSection = {
  code: string;
  text: string;
  sources: string[];
  uncertaintyCodes: string[];
};

export type SchoolAdmissionsOutcome = {
  outcomeId: string;
  kind: "offer" | "coe";
  version: number;
  state: string;
  provenance: string;
  independentlyVerified: boolean;
  evidenceAttached: boolean;
  receivedOn: string | null;
  expiresOn: string | null;
  validTo: string | null;
  decisionOn: string | null;
  expiryState: string;
  superseded: boolean;
};

export type SchoolAdmissionsExternalAction = {
  actionId: string;
  actionKind: string;
  performedOn: string;
  note: string | null;
  verified: false;
};

export type SchoolAdmissionsExceptionView = {
  exceptionId: string;
  state: string;
  description: string;
  authorityReference: string | null;
};

export type SchoolAdmissionsReadiness = {
  status: string;
  reasonCodes: string[];
  checkedAt: string | null;
  submissionState: "not_connected";
};

export type SchoolAdmissionsCase = {
  caseId: string;
  projectId: string;
  applicationId: string | null;
  originKind: string;
  institutionName: string;
  courseTitle: string | null;
  intakeLabel: string | null;
  serviceMode: SchoolAdmissionsServiceMode;
  preparationState: string;
  revision: number;
  offer: SchoolAdmissionsOutcome | null;
  coe: SchoolAdmissionsOutcome | null;
  exception: SchoolAdmissionsExceptionView | null;
  managedReadiness: SchoolAdmissionsReadiness;
  journey: {
    offerState: string;
    offerExpiryState: string;
    coeState: string;
    coeValidityState: string;
    exceptionState: string;
    hasOutcome: boolean;
    offerTerminal: boolean;
    student500Eligibility: "not_determined";
  };
  nextStepCodes: string[];
  disclosures: string[];
  preparationStale: boolean;
  staleReasonCodes: string[];
  requirements: SchoolAdmissionsRequirement[];
  preparation: {
    preparationId: string;
    version: number;
    provisional: true;
    confirmedAt: string | null;
    stale: boolean;
    assistKind: string;
    sections: SchoolAdmissionsSection[];
  } | null;
  externalActions: SchoolAdmissionsExternalAction[];
  outcomeHistory: SchoolAdmissionsOutcome[];
  createdAt: string;
  updatedAt: string;
};

export type SchoolAdmissionsErrorKind =
  | "authentication_required"
  | "not_found"
  | "state_changed"
  | "authority_unavailable"
  | "unavailable"
  | "invalid_request"
  | "request_failed";

export type SchoolAdmissionsApplicationOption = {
  applicationId: string;
  institutionName: string;
  courseTitle: string;
  intakeLabel: string | null;
  sourceStatus: string;
  revision: number;
  archived: boolean;
  hasCase: boolean;
};

export type SchoolAdmissionsDocumentOption = {
  referenceId: string;
  version: number;
  label: string | null;
};

export type SchoolAdmissionsSnapshot = {
  cases: SchoolAdmissionsCase[];
  /** Creator-private M5.1 applications that may open their own admission case. */
  applications: SchoolAdmissionsApplicationOption[];
  /** Scan-clean, stored M2 documents that may be attached as evidence. */
  documents: SchoolAdmissionsDocumentOption[];
  documentsUnavailable: boolean;
  detail: SchoolAdmissionsCase | null;
  loading: boolean;
  pendingAction: string | null;
  error: SchoolAdmissionsErrorKind | null;
};

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function parseOutcome(value: unknown): SchoolAdmissionsOutcome | null {
  if (!isRecord(value)) {
    return null;
  }
  if (
    typeof value.outcomeId !== "string" ||
    (value.kind !== "offer" && value.kind !== "coe") ||
    typeof value.version !== "number" ||
    typeof value.state !== "string" ||
    typeof value.provenance !== "string"
  ) {
    return null;
  }
  return {
    decisionOn: stringOrNull(value.decisionOn),
    evidenceAttached: value.evidenceAttached === true,
    expiresOn: stringOrNull(value.expiresOn),
    expiryState:
      typeof value.expiryState === "string" ? value.expiryState : "unknown",
    independentlyVerified: value.independentlyVerified === true,
    kind: value.kind,
    outcomeId: value.outcomeId,
    provenance: value.provenance,
    receivedOn: stringOrNull(value.receivedOn),
    state: value.state,
    superseded: value.superseded === true,
    validTo: stringOrNull(value.validTo),
    version: value.version,
  };
}

function parseRequirement(value: unknown): SchoolAdmissionsRequirement | null {
  if (
    !isRecord(value) ||
    typeof value.code !== "string" ||
    typeof value.status !== "string"
  ) {
    return null;
  }
  return {
    appliesTo: typeof value.appliesTo === "string" ? value.appliesTo : "both",
    code: value.code,
    required: value.required !== false,
    status: value.status,
    uncertaintyCodes: stringArray(value.uncertaintyCodes),
  };
}

function parseSection(value: unknown): SchoolAdmissionsSection | null {
  if (
    !isRecord(value) ||
    typeof value.code !== "string" ||
    typeof value.text !== "string"
  ) {
    return null;
  }
  return {
    code: value.code,
    sources: stringArray(value.sources),
    text: value.text,
    uncertaintyCodes: stringArray(value.uncertaintyCodes),
  };
}

export function parseSchoolAdmissionsCase(
  value: unknown
): SchoolAdmissionsCase | null {
  if (!isRecord(value)) {
    return null;
  }
  if (
    typeof value.caseId !== "string" ||
    typeof value.projectId !== "string" ||
    typeof value.originKind !== "string" ||
    typeof value.institutionName !== "string" ||
    (value.serviceMode !== "self_service" &&
      value.serviceMode !== "managed_service") ||
    typeof value.revision !== "number" ||
    typeof value.preparationState !== "string" ||
    !isRecord(value.journey) ||
    !isRecord(value.managedReadiness)
  ) {
    return null;
  }
  const requirements = Array.isArray(value.requirements)
    ? value.requirements.map(parseRequirement)
    : [];
  if (requirements.some((entry) => entry === null)) {
    return null;
  }
  const preparation = isRecord(value.preparation)
    ? {
        assistKind:
          typeof value.preparation.assistKind === "string"
            ? value.preparation.assistKind
            : "disabled",
        confirmedAt: stringOrNull(value.preparation.confirmedAt),
        preparationId:
          typeof value.preparation.preparationId === "string"
            ? value.preparation.preparationId
            : "",
        provisional: true as const,
        sections: Array.isArray(value.preparation.sections)
          ? value.preparation.sections
              .map(parseSection)
              .filter(
                (entry): entry is SchoolAdmissionsSection => entry !== null
              )
          : [],
        stale: value.preparation.stale === true,
        version:
          typeof value.preparation.version === "number"
            ? value.preparation.version
            : 0,
      }
    : null;
  const offer = parseOutcome(value.offer);
  const coe = parseOutcome(value.coe);
  const exception =
    isRecord(value.exception) && typeof value.exception.state === "string"
      ? {
          authorityReference: stringOrNull(value.exception.authorityReference),
          description:
            typeof value.exception.description === "string"
              ? value.exception.description
              : "",
          exceptionId:
            typeof value.exception.exceptionId === "string"
              ? value.exception.exceptionId
              : "",
          state: value.exception.state,
        }
      : null;
  return {
    applicationId: stringOrNull(value.applicationId),
    caseId: value.caseId,
    coe,
    courseTitle: stringOrNull(value.courseTitle),
    createdAt: typeof value.createdAt === "string" ? value.createdAt : "",
    disclosures: stringArray(value.disclosures),
    exception,
    externalActions: Array.isArray(value.externalActions)
      ? value.externalActions.filter(isRecord).map((entry) => ({
          actionId: typeof entry.actionId === "string" ? entry.actionId : "",
          actionKind:
            typeof entry.actionKind === "string" ? entry.actionKind : "other",
          note: stringOrNull(entry.note),
          performedOn:
            typeof entry.performedOn === "string" ? entry.performedOn : "",
          verified: false as const,
        }))
      : [],
    institutionName: value.institutionName,
    intakeLabel: stringOrNull(value.intakeLabel),
    journey: {
      coeState:
        typeof value.journey.coeState === "string"
          ? value.journey.coeState
          : "none",
      coeValidityState:
        typeof value.journey.coeValidityState === "string"
          ? value.journey.coeValidityState
          : "unknown",
      exceptionState:
        typeof value.journey.exceptionState === "string"
          ? value.journey.exceptionState
          : "none",
      hasOutcome: value.journey.hasOutcome === true,
      offerExpiryState:
        typeof value.journey.offerExpiryState === "string"
          ? value.journey.offerExpiryState
          : "unknown",
      offerState:
        typeof value.journey.offerState === "string"
          ? value.journey.offerState
          : "none",
      offerTerminal: value.journey.offerTerminal === true,
      student500Eligibility: "not_determined" as const,
    },
    managedReadiness: {
      checkedAt: stringOrNull(value.managedReadiness.checkedAt),
      reasonCodes: stringArray(value.managedReadiness.reasonCodes),
      status:
        typeof value.managedReadiness.status === "string"
          ? value.managedReadiness.status
          : "NOT_EVALUATED",
      submissionState: "not_connected" as const,
    },
    nextStepCodes: stringArray(value.nextStepCodes),
    offer,
    originKind: value.originKind,
    outcomeHistory: Array.isArray(value.outcomeHistory)
      ? value.outcomeHistory
          .map(parseOutcome)
          .filter((entry): entry is SchoolAdmissionsOutcome => entry !== null)
      : [],
    preparation,
    preparationState: value.preparationState,
    preparationStale: value.preparationStale === true,
    projectId: value.projectId,
    requirements: requirements as SchoolAdmissionsRequirement[],
    revision: value.revision,
    serviceMode: value.serviceMode,
    staleReasonCodes: stringArray(value.staleReasonCodes),
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : "",
  };
}

export function classifySchoolAdmissionsError(
  status: number
): SchoolAdmissionsErrorKind {
  switch (status) {
    case 401:
      return "authentication_required";
    case 404:
      return "not_found";
    case 409:
      return "state_changed";
    case 422:
      return "authority_unavailable";
    case 503:
      return "unavailable";
    case 400:
    case 415:
    case 413:
      return "invalid_request";
    default:
      return "request_failed";
  }
}

export type SchoolAdmissionsController = {
  readonly subscribe: (listener: () => void) => () => void;
  readonly getSnapshot: () => SchoolAdmissionsSnapshot;
  load(projectId: string): Promise<SchoolAdmissionsErrorKind | null>;
  open(
    projectId: string,
    caseId: string
  ): Promise<SchoolAdmissionsErrorKind | null>;
  create(
    projectId: string,
    body: {
      originKind: string;
      applicationId?: string | null;
      institutionName?: string | null;
      courseTitle?: string | null;
      intakeLabel?: string | null;
    }
  ): Promise<SchoolAdmissionsErrorKind | null>;
  setServiceMode(
    projectId: string,
    detail: SchoolAdmissionsCase,
    serviceMode: SchoolAdmissionsServiceMode
  ): Promise<SchoolAdmissionsErrorKind | null>;
  prepare(
    projectId: string,
    detail: SchoolAdmissionsCase
  ): Promise<SchoolAdmissionsErrorKind | null>;
  confirmPreparation(
    projectId: string,
    detail: SchoolAdmissionsCase
  ): Promise<SchoolAdmissionsErrorKind | null>;
  recordOffer(
    projectId: string,
    detail: SchoolAdmissionsCase,
    options?: { readonly evidenceReferenceId?: string | null }
  ): Promise<SchoolAdmissionsErrorKind | null>;
  recordCoe(
    projectId: string,
    detail: SchoolAdmissionsCase,
    options?: {
      readonly evidenceReferenceId?: string | null;
      readonly validTo?: string | null;
    }
  ): Promise<SchoolAdmissionsErrorKind | null>;
  transitionOutcome(
    projectId: string,
    detail: SchoolAdmissionsCase,
    outcome: SchoolAdmissionsOutcome,
    action: string
  ): Promise<SchoolAdmissionsErrorKind | null>;
  recordExternalAction(
    projectId: string,
    detail: SchoolAdmissionsCase,
    actionKind: string
  ): Promise<SchoolAdmissionsErrorKind | null>;
  claimException(
    projectId: string,
    detail: SchoolAdmissionsCase,
    description: string
  ): Promise<SchoolAdmissionsErrorKind | null>;
  evaluateReadiness(
    projectId: string,
    detail: SchoolAdmissionsCase
  ): Promise<SchoolAdmissionsErrorKind | null>;
};

export function createSchoolAdmissionsController(
  options: {
    readonly fetchImpl?: FetchLike;
    readonly newOperationId?: () => string;
    readonly today?: () => string;
  } = {}
): SchoolAdmissionsController {
  const fetchImpl: FetchLike =
    options.fetchImpl ?? ((input, init) => fetch(input as string, init));
  const newOperationId =
    options.newOperationId ??
    (() =>
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `op-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const today = options.today ?? (() => new Date().toISOString().slice(0, 10));

  let snapshot: SchoolAdmissionsSnapshot = {
    applications: [],
    cases: [],
    detail: null,
    documents: [],
    documentsUnavailable: false,
    error: null,
    loading: false,
    pendingAction: null,
  };
  const listeners = new Set<() => void>();

  function set(patch: Partial<SchoolAdmissionsSnapshot>) {
    snapshot = { ...snapshot, ...patch };
    for (const listener of listeners) {
      listener();
    }
  }

  type RequestResult =
    | { readonly ok: true; readonly body: unknown }
    | { readonly ok: false; readonly error: SchoolAdmissionsErrorKind };

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
        error: classifySchoolAdmissionsError(response.status),
        ok: false,
      };
    }
    try {
      return { body: (await response.json()) as unknown, ok: true };
    } catch {
      return { error: "request_failed", ok: false };
    }
  }

  function basePath(projectId: string) {
    return `/api/projects/${encodeURIComponent(projectId)}/school-admissions`;
  }

  function casePath(projectId: string, caseId: string) {
    return `${basePath(projectId)}/${encodeURIComponent(caseId)}`;
  }

  function applyDetail(body: unknown): SchoolAdmissionsCase | null {
    return isRecord(body) ? parseSchoolAdmissionsCase(body.case) : null;
  }

  function mergeDetail(detail: SchoolAdmissionsCase) {
    set({
      cases: snapshot.cases.some((entry) => entry.caseId === detail.caseId)
        ? snapshot.cases.map((entry) =>
            entry.caseId === detail.caseId ? detail : entry
          )
        : [...snapshot.cases, detail],
      detail,
      error: null,
    });
  }

  async function mutate(
    action: string,
    path: string,
    body: unknown
  ): Promise<SchoolAdmissionsErrorKind | null> {
    set({ error: null, pendingAction: action });
    const result = await request(path, {
      body: JSON.stringify(body),
      method: "POST",
    });
    set({ pendingAction: null });
    if (!result.ok) {
      set({ error: result.error });
      return result.error;
    }
    const detail = applyDetail(result.body);
    if (!detail) {
      set({ error: "request_failed" });
      return "request_failed";
    }
    mergeDetail(detail);
    return null;
  }

  return {
    getSnapshot() {
      return snapshot;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    async load(projectId) {
      set({ error: null, loading: true });
      const result = await request(basePath(projectId));
      set({ loading: false });
      if (!result.ok) {
        set({ error: result.error });
        return result.error;
      }
      const body = isRecord(result.body) ? result.body : null;
      const cases =
        body && Array.isArray(body.cases)
          ? body.cases
              .map(parseSchoolAdmissionsCase)
              .filter((entry): entry is SchoolAdmissionsCase => entry !== null)
          : null;
      if (!(body && cases)) {
        set({ error: "request_failed" });
        return "request_failed";
      }
      set({
        applications: Array.isArray(body.applications)
          ? body.applications
              .filter(isRecord)
              .map((entry) => ({
                applicationId:
                  typeof entry.applicationId === "string"
                    ? entry.applicationId
                    : "",
                archived: entry.archived === true,
                courseTitle:
                  typeof entry.courseTitle === "string"
                    ? entry.courseTitle
                    : "",
                hasCase: entry.hasCase === true,
                institutionName:
                  typeof entry.institutionName === "string"
                    ? entry.institutionName
                    : "",
                intakeLabel: stringOrNull(entry.intakeLabel),
                revision:
                  typeof entry.revision === "number" ? entry.revision : 0,
                sourceStatus:
                  typeof entry.sourceStatus === "string"
                    ? entry.sourceStatus
                    : "unverified_customer_declared",
              }))
              .filter((entry) => entry.applicationId.length > 0)
          : [],
        cases,
        documents: Array.isArray(body.documents)
          ? body.documents
              .filter(isRecord)
              .map((entry) => ({
                label: stringOrNull(entry.label),
                referenceId:
                  typeof entry.referenceId === "string"
                    ? entry.referenceId
                    : "",
                version: typeof entry.version === "number" ? entry.version : 0,
              }))
              .filter((entry) => entry.referenceId.length > 0)
          : [],
        documentsUnavailable: body.documentsUnavailable === true,
        error: null,
      });
      return null;
    },

    async open(projectId, caseId) {
      set({ error: null, loading: true });
      const result = await request(casePath(projectId, caseId));
      set({ loading: false });
      if (!result.ok) {
        set({ error: result.error });
        return result.error;
      }
      const detail = applyDetail(result.body);
      if (!detail) {
        set({ error: "request_failed" });
        return "request_failed";
      }
      mergeDetail(detail);
      return null;
    },

    async create(projectId, body) {
      set({ error: null, pendingAction: "create" });
      const result = await request(basePath(projectId), {
        body: JSON.stringify({ ...body, operationId: newOperationId() }),
        method: "POST",
      });
      set({ pendingAction: null });
      if (!result.ok) {
        set({ error: result.error });
        return result.error;
      }
      const detail = applyDetail(result.body);
      if (!detail) {
        set({ error: "request_failed" });
        return "request_failed";
      }
      mergeDetail(detail);
      return null;
    },

    setServiceMode(projectId, detail, serviceMode) {
      return mutate(
        "service-mode",
        `${casePath(projectId, detail.caseId)}/service-mode`,
        {
          expectedRevision: detail.revision,
          operationId: newOperationId(),
          serviceMode,
        }
      );
    },

    prepare(projectId, detail) {
      return mutate(
        "prepare",
        `${casePath(projectId, detail.caseId)}/preparation`,
        {
          expectedRevision: detail.revision,
          operationId: newOperationId(),
        }
      );
    },

    confirmPreparation(projectId, detail) {
      const preparationId = detail.preparation?.preparationId;
      if (!preparationId) {
        set({ error: "state_changed" });
        return Promise.resolve("state_changed" as const);
      }
      return mutate(
        "confirm",
        `${casePath(projectId, detail.caseId)}/preparation/confirm`,
        {
          expectedRevision: detail.revision,
          operationId: newOperationId(),
          preparationId,
        }
      );
    },

    recordOffer(projectId, detail, options) {
      const evidence = options?.evidenceReferenceId ?? null;
      return mutate("offer", `${casePath(projectId, detail.caseId)}/outcomes`, {
        ...(evidence ? { evidenceReferenceId: evidence } : {}),
        expectedRevision: detail.revision,
        kind: "offer",
        operationId: newOperationId(),
        provenance: evidence
          ? "document_backed_unverified"
          : "customer_reported",
        receivedOn: today(),
      });
    },

    recordCoe(projectId, detail, options) {
      const evidence = options?.evidenceReferenceId ?? null;
      return mutate("coe", `${casePath(projectId, detail.caseId)}/outcomes`, {
        ...(evidence ? { evidenceReferenceId: evidence } : {}),
        ...(options?.validTo ? { validTo: options.validTo } : {}),
        expectedRevision: detail.revision,
        kind: "coe",
        operationId: newOperationId(),
        provenance: evidence
          ? "document_backed_unverified"
          : "customer_reported",
      });
    },

    transitionOutcome(projectId, detail, outcome, action) {
      return mutate(
        `transition-${action}`,
        `${casePath(projectId, detail.caseId)}/outcomes/${encodeURIComponent(outcome.outcomeId)}`,
        {
          action,
          decisionOn: today(),
          expectedRevision: detail.revision,
          kind: outcome.kind,
          operationId: newOperationId(),
        }
      );
    },

    recordExternalAction(projectId, detail, actionKind) {
      return mutate(
        "external-action",
        `${casePath(projectId, detail.caseId)}/external-actions`,
        {
          acknowledged: true,
          actionKind,
          expectedRevision: detail.revision,
          operationId: newOperationId(),
          performedOn: today(),
        }
      );
    },

    claimException(projectId, detail, description) {
      return mutate(
        "exception",
        `${casePath(projectId, detail.caseId)}/exceptions`,
        {
          description,
          expectedRevision: detail.revision,
          operationId: newOperationId(),
        }
      );
    },

    evaluateReadiness(projectId, detail) {
      return mutate(
        "readiness",
        `${casePath(projectId, detail.caseId)}/readiness`,
        {
          expectedRevision: detail.revision,
          operationId: newOperationId(),
        }
      );
    },
  };
}
