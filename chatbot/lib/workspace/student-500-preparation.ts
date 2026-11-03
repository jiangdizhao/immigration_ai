/**
 * Phase 13 M6.2 - client controller for one Student 500 preparation record.
 *
 * Mirrors the accepted M6.1 controller contract:
 *   - the actor, Project and application always come from the authenticated route;
 *   - every action is one bounded request with an operation id, so a retry replays
 *     instead of duplicating a draft version or snapshot;
 *   - a superseded load never overwrites a newer selection, and a mutation whose
 *     base state is no longer the visible one is refused locally as `state_changed`;
 *   - responses are parsed strictly: an unexpected shape becomes a bounded error,
 *     never a partially-trusted object.
 */

export type PreparationErrorKind =
  | "unauthorized"
  | "not_found"
  | "invalid"
  | "state_changed"
  | "unavailable"
  | "request_failed";

export type PreparationSection = {
  sectionKey: string;
  heading: string;
  text: string;
  source: "authorized_fact" | "customer_text" | "missing";
  factReferenceIds: string[];
  missingInformation: string[];
};

export type PreparationDraftVersion = {
  draftId: string;
  version: number;
  origin: "deterministic_starter" | "customer_edit";
  sections: PreparationSection[];
  sourceFactReferenceIds: string[];
  redactedSectionCount: number;
  createdAt: string;
  stale: boolean;
  staleReasons: string[];
};

export type PreparationSnapshotVersion = {
  snapshotId: string;
  version: number;
  applicationRevision: number;
  contentSha256: string;
  createdAt: string;
  stale: boolean;
  staleReasons: string[];
};

export type PreparationSelectedFact = {
  factReferenceId: string;
  factAssertionId: string;
  factKey: string;
  factVersion: number;
  originKind: string;
  currentState: string;
  customerConfirmed: boolean;
  aiUseAuthorized: boolean;
  sourceEvidenceRef: string | null;
};

export type PreparationAvailableFact = {
  factAssertionId: string;
  version: number;
  key: string;
  valueDisplay: string;
  customerConfirmed: boolean;
  aiUseAuthorized: boolean;
  originKind: string;
  selectable: boolean;
};

export type PreparationRequirementCoverage = {
  requirementKey: string;
  applicability: string;
  coverage: string;
  gaps: string[];
  legalSourceVerification: string;
  humanReviewRequired: boolean;
};

export type PreparationView = {
  schemaVersion: string;
  projectId: string;
  applicationId: string;
  applicationStatus: string;
  applicationRevision: number;
  screeningSubmissionStatus: "not_submission_ready";
  documentsTrust: "unavailable";
  factsAvailable: boolean;
  schoolContext: {
    kind: string;
    studyEvidenceKind: string;
    schoolApplicationId: string | null;
    admissionCaseId: string | null;
    admissionOutcomeKind: string | null;
    admissionOutcomeProvenance: string | null;
    admissionOutcomeIndependentlyVerified: boolean;
    revision: number;
    current: boolean;
    unavailableReason: string | null;
  } | null;
  selectedFacts: PreparationSelectedFact[];
  availableFacts: PreparationAvailableFact[];
  requirements: PreparationRequirementCoverage[];
  counts: {
    covered: number;
    blocked: number;
    missing: number;
    notApplicable: number;
    notAssessed: number;
  };
  conflictsVisible: boolean;
  drafts: PreparationDraftVersion[];
  snapshots: PreparationSnapshotVersion[];
  nextActions: string[];
  disclosures: string[];
};

export type PreparationSnapshot = {
  readonly loading: boolean;
  readonly pendingAction: string | null;
  readonly error: PreparationErrorKind | null;
  readonly projectId: string | null;
  readonly applicationId: string | null;
  readonly view: PreparationView | null;
};

const EMPTY: PreparationSnapshot = {
  applicationId: null,
  error: null,
  loading: false,
  pendingAction: null,
  projectId: null,
  view: null,
};

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

type RequestResult =
  | { readonly ok: true; readonly body: unknown }
  | { readonly ok: false; readonly error: PreparationErrorKind };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

async function request(
  fetchImpl: FetchLike,
  path: string
): Promise<RequestResult> {
  let response: Response;
  try {
    response = await fetchImpl(path, {
      cache: "no-store",
      credentials: "same-origin",
      headers: { accept: "application/json" },
    });
  } catch {
    return { error: "request_failed", ok: false };
  }
  if (!response.ok) {
    return { error: classify(response.status), ok: false };
  }
  try {
    return { body: (await response.json()) as unknown, ok: true };
  } catch {
    return { error: "request_failed", ok: false };
  }
}

function classify(status: number): PreparationErrorKind {
  if (status === 401) {
    return "unauthorized";
  }
  if (status === 404) {
    return "not_found";
  }
  if (status === 400 || status === 413 || status === 415) {
    return "invalid";
  }
  if (status === 409) {
    return "state_changed";
  }
  if (status === 503) {
    return "unavailable";
  }
  return "request_failed";
}

function parseSections(value: unknown): PreparationSection[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const sections: PreparationSection[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) {
      continue;
    }
    const source = asString(entry.source);
    sections.push({
      factReferenceIds: asStringArray(entry.factReferenceIds),
      heading: asString(entry.heading),
      missingInformation: asStringArray(entry.missingInformation),
      sectionKey: asString(entry.sectionKey),
      source:
        source === "authorized_fact" ||
        source === "customer_text" ||
        source === "missing"
          ? source
          : "missing",
      text: asString(entry.text),
    });
  }
  return sections;
}

function parseView(body: unknown): PreparationView | null {
  if (!isRecord(body) || !isRecord(body.preparation)) {
    return null;
  }
  const raw = body.preparation;
  const reconciliation = isRecord(raw.reconciliation) ? raw.reconciliation : {};
  const counts = isRecord(reconciliation.counts) ? reconciliation.counts : {};
  const schoolContextRaw = isRecord(raw.schoolContext)
    ? raw.schoolContext
    : null;
  return {
    applicationId: asString(raw.applicationId),
    applicationRevision: asNumber(raw.applicationRevision),
    applicationStatus: asString(raw.applicationStatus),
    availableFacts: Array.isArray(raw.availableFacts)
      ? raw.availableFacts.filter(isRecord).map((entry) => ({
          aiUseAuthorized: asBoolean(entry.aiUseAuthorized),
          customerConfirmed: asBoolean(entry.customerConfirmed),
          factAssertionId: asString(entry.factAssertionId),
          key: asString(entry.key),
          originKind: asString(entry.originKind),
          selectable: asBoolean(entry.selectable),
          valueDisplay: asString(entry.valueDisplay),
          version: asNumber(entry.version),
        }))
      : [],
    conflictsVisible: asBoolean(reconciliation.conflictsVisible),
    counts: {
      blocked: asNumber(counts.blocked),
      covered: asNumber(counts.covered),
      missing: asNumber(counts.missing),
      notApplicable: asNumber(counts.notApplicable),
      notAssessed: asNumber(counts.notAssessed),
    },
    disclosures: asStringArray(raw.disclosures),
    documentsTrust: "unavailable",
    drafts: Array.isArray(raw.drafts)
      ? raw.drafts.filter(isRecord).map((entry) => ({
          createdAt: asString(entry.createdAt),
          draftId: asString(entry.draftId),
          origin:
            asString(entry.origin) === "customer_edit"
              ? ("customer_edit" as const)
              : ("deterministic_starter" as const),
          redactedSectionCount: asNumber(entry.redactedSectionCount),
          sections: parseSections(entry.sections),
          sourceFactReferenceIds: asStringArray(entry.sourceFactReferenceIds),
          stale: asBoolean(entry.stale),
          staleReasons: asStringArray(entry.staleReasons),
          version: asNumber(entry.version),
        }))
      : [],
    factsAvailable: asBoolean(raw.factsAvailable),
    nextActions: asStringArray(raw.nextActions),
    projectId: asString(raw.projectId),
    requirements: Array.isArray(reconciliation.requirements)
      ? reconciliation.requirements.filter(isRecord).map((entry) => ({
          applicability: asString(entry.applicability),
          coverage: asString(entry.coverage),
          gaps: asStringArray(entry.gaps),
          humanReviewRequired: asBoolean(entry.humanReviewRequired),
          legalSourceVerification: asString(entry.legalSourceVerification),
          requirementKey: asString(entry.requirementKey),
        }))
      : [],
    schemaVersion: asString(raw.schemaVersion),
    schoolContext: schoolContextRaw
      ? {
          admissionCaseId:
            typeof schoolContextRaw.admissionCaseId === "string"
              ? schoolContextRaw.admissionCaseId
              : null,
          admissionOutcomeIndependentlyVerified: asBoolean(
            schoolContextRaw.admissionOutcomeIndependentlyVerified
          ),
          admissionOutcomeKind:
            typeof schoolContextRaw.admissionOutcomeKind === "string"
              ? schoolContextRaw.admissionOutcomeKind
              : null,
          admissionOutcomeProvenance:
            typeof schoolContextRaw.admissionOutcomeProvenance === "string"
              ? schoolContextRaw.admissionOutcomeProvenance
              : null,
          current: asBoolean(schoolContextRaw.current),
          kind: asString(schoolContextRaw.kind),
          unavailableReason:
            typeof schoolContextRaw.unavailableReason === "string"
              ? schoolContextRaw.unavailableReason
              : null,
          revision: asNumber(schoolContextRaw.revision),
          schoolApplicationId:
            typeof schoolContextRaw.schoolApplicationId === "string"
              ? schoolContextRaw.schoolApplicationId
              : null,
          studyEvidenceKind: asString(schoolContextRaw.studyEvidenceKind),
        }
      : null,
    screeningSubmissionStatus: "not_submission_ready",
    selectedFacts: Array.isArray(raw.selectedFacts)
      ? raw.selectedFacts.filter(isRecord).map((entry) => ({
          aiUseAuthorized: asBoolean(entry.aiUseAuthorized),
          currentState: asString(entry.currentState),
          customerConfirmed: asBoolean(entry.customerConfirmed),
          factAssertionId: asString(entry.factAssertionId),
          factKey: asString(entry.factKey),
          factReferenceId: asString(entry.factReferenceId),
          factVersion: asNumber(entry.factVersion),
          originKind: asString(entry.originKind),
          sourceEvidenceRef:
            typeof entry.sourceEvidenceRef === "string"
              ? entry.sourceEvidenceRef
              : null,
        }))
      : [],
    snapshots: Array.isArray(raw.snapshots)
      ? raw.snapshots.filter(isRecord).map((entry) => ({
          applicationRevision: asNumber(entry.applicationRevision),
          contentSha256: asString(entry.contentSha256),
          createdAt: asString(entry.createdAt),
          snapshotId: asString(entry.snapshotId),
          stale: asBoolean(entry.stale),
          staleReasons: asStringArray(entry.staleReasons),
          version: asNumber(entry.version),
        }))
      : [],
  };
}

/** One authorized M5 record the customer may bind as study evidence. */
export type LinkableStudyEvidence = {
  readonly kind: "school_application" | "admission_case";
  readonly id: string;
  readonly label: string;
  readonly detail: string;
};

/**
 * Loads the actor's own M5.1 school applications and M5.2 admission cases for this
 * Project. Only these authorized records may be selected; there is no free-text id
 * field, and the server re-authorizes the choice again on save.
 */
export async function loadLinkableStudyEvidence(input: {
  readonly projectId: string;
  readonly fetchImpl?: FetchLike;
}): Promise<
  | { readonly ok: true; readonly evidence: LinkableStudyEvidence[] }
  | { readonly ok: false; readonly error: PreparationErrorKind }
> {
  const fetchImpl: FetchLike =
    input.fetchImpl ?? ((request, init) => fetch(request, init));
  const base = `/api/projects/${encodeURIComponent(input.projectId)}`;
  const evidence: LinkableStudyEvidence[] = [];
  for (const [path, kind] of [
    [`${base}/school-applications`, "school_application"],
    [`${base}/school-admissions`, "admission_case"],
  ] as const) {
    const result = await request(fetchImpl, path);
    if (!result.ok) {
      return { error: result.error, ok: false };
    }
    const body = result.body;
    if (!isRecord(body)) {
      return { error: "request_failed", ok: false };
    }
    if (kind === "school_application") {
      for (const entry of Array.isArray(body.applications)
        ? body.applications
        : []) {
        if (!isRecord(entry) || typeof entry.applicationId !== "string") {
          continue;
        }
        if (asString(entry.status) === "archived") {
          continue;
        }
        evidence.push({
          detail: asString(entry.status),
          id: entry.applicationId,
          kind,
          label: `${asString(
            isRecord(entry.institution) ? entry.institution.name : "",
            "School application"
          )}`,
        });
      }
    } else {
      for (const entry of Array.isArray(body.cases) ? body.cases : []) {
        if (!isRecord(entry) || typeof entry.caseId !== "string") {
          continue;
        }
        evidence.push({
          detail: `${asString(entry.originKind)} · ${asString(entry.preparationState)}`,
          id: entry.caseId,
          kind,
          label: asString(entry.institutionName, "Admission case"),
        });
      }
    }
  }
  return { evidence, ok: true };
}

/**
 * Maps a selected authorized M5 record to the school-context binding payload.
 * The UI never accepts a free-text id; only a listed record can be submitted, and
 * the server re-authorizes it again.
 */
export function schoolContextRequestFromRecord(record: LinkableStudyEvidence): {
  kind: "school_application" | "admission_case";
} & {
  schoolApplicationId?: string;
  admissionCaseId?: string;
} {
  return record.kind === "admission_case"
    ? { admissionCaseId: record.id, kind: "admission_case" }
    : { kind: "school_application", schoolApplicationId: record.id };
}

/**
 * First-use interaction rule for the study-evidence kind buttons.
 *
 * Choosing `school_application` or `admission_case` does NOT submit a mutation: the
 * panel first waits for the customer to pick an authorized M5 record, because a
 * `null` identifier is not a valid binding. `none` and the directly reported CoE
 * have no external identity, so they are submitted immediately.
 */
export type SchoolKindIntent =
  | { readonly defer: true }
  | {
      readonly defer: false;
      readonly request: {
        readonly admissionCaseId: null;
        readonly kind: string;
        readonly schoolApplicationId: null;
      };
    };

export function resolveSchoolKindIntent(kind: string): SchoolKindIntent {
  if (kind === "school_application" || kind === "admission_case") {
    return { defer: true };
  }
  return {
    defer: false,
    request: { admissionCaseId: null, kind, schoolApplicationId: null },
  };
}

export function preparationPath(
  projectId: string,
  applicationId: string
): string {
  return `/api/projects/${encodeURIComponent(projectId)}/student-500-applications/${encodeURIComponent(applicationId)}/preparation`;
}

export type PreparationActionResult = PreparationErrorKind | null;

export function createStudent500PreparationController(
  options: {
    readonly fetchImpl?: FetchLike;
    readonly newOperationId?: () => string;
  } = {}
) {
  const fetchImpl: FetchLike =
    options.fetchImpl ?? ((input, init) => fetch(input, init));
  const newOperationId =
    options.newOperationId ?? (() => globalThis.crypto.randomUUID());
  let snapshot: PreparationSnapshot = EMPTY;
  const listeners = new Set<() => void>();
  let loadSequence = 0;

  function set(patch: Partial<PreparationSnapshot>) {
    snapshot = { ...snapshot, ...patch };
    for (const listener of listeners) {
      listener();
    }
  }

  async function request(
    path: string,
    init?: RequestInit
  ): Promise<RequestResult> {
    let response: Response;
    try {
      response = await fetchImpl(path, {
        cache: "no-store",
        credentials: "same-origin",
        headers: { accept: "application/json", ...(init?.headers ?? {}) },
        ...init,
      });
    } catch {
      return { error: "request_failed", ok: false };
    }
    if (!response.ok) {
      return { error: classify(response.status), ok: false };
    }
    try {
      return { body: (await response.json()) as unknown, ok: true };
    } catch {
      return { error: "request_failed", ok: false };
    }
  }

  async function load(
    projectId: string,
    applicationId: string
  ): Promise<PreparationActionResult> {
    const sequence = ++loadSequence;
    set({
      applicationId,
      error: null,
      loading: true,
      pendingAction: null,
      projectId,
      // Switching application must never show the previous preparation.
      view: snapshot.applicationId === applicationId ? snapshot.view : null,
    });
    const result = await request(preparationPath(projectId, applicationId));
    if (sequence !== loadSequence) {
      return null;
    }
    if (!result.ok) {
      set({ error: result.error, loading: false });
      return result.error;
    }
    const view = parseView(result.body);
    if (!view || view.applicationId !== applicationId) {
      set({ error: "request_failed", loading: false });
      return "request_failed";
    }
    set({ error: null, loading: false, view });
    return null;
  }

  async function act(input: {
    readonly action: string;
    readonly body: Record<string, unknown>;
  }): Promise<PreparationActionResult> {
    const { projectId, applicationId, view } = snapshot;
    if (!(projectId && applicationId && view)) {
      set({ error: "state_changed" });
      return "state_changed";
    }
    set({ error: null, pendingAction: input.action });
    const result = await request(preparationPath(projectId, applicationId), {
      body: JSON.stringify({
        ...input.body,
        action: input.action,
        operationId: newOperationId(),
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    if (!result.ok) {
      set({ error: result.error, pendingAction: null });
      return result.error;
    }
    // The authoritative state is always re-read after a write: one bounded
    // refresh, so the panel cannot drift from the server (idempotent replay,
    // other-tab edits, invalidation).
    set({ pendingAction: null });
    return await load(projectId, applicationId);
  }

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    getSnapshot() {
      return snapshot;
    },

    load,

    selectFact(factAssertionId: string, factVersion: number) {
      return act({
        action: "select_fact",
        body: { factAssertionId, factVersion },
      });
    },

    unselectFact(factReferenceId: string) {
      return act({ action: "unselect_fact", body: { factReferenceId } });
    },

    setSchoolContext(input: {
      readonly kind: string;
      readonly schoolApplicationId?: string | null;
      readonly admissionCaseId?: string | null;
    }) {
      const current = snapshot.view?.schoolContext;
      return act({
        action: "set_school_context",
        body: {
          admissionCaseId: input.admissionCaseId ?? null,
          expectedRevision: current ? current.revision : null,
          kind: input.kind,
          schoolApplicationId: input.schoolApplicationId ?? null,
        },
      });
    },

    createDraft() {
      return act({ action: "create_gs_draft", body: {} });
    },

    saveDraft(
      baseDraftId: string,
      edits: readonly { readonly sectionKey: string; readonly text: string }[]
    ) {
      const draft = snapshot.view?.drafts.find(
        (entry) => entry.draftId === baseDraftId
      );
      if (!draft) {
        set({ error: "state_changed" });
        return Promise.resolve<PreparationActionResult>("state_changed");
      }
      return act({
        action: "save_gs_draft",
        body: {
          baseDraftId,
          edits: edits.map((edit) => ({
            sectionKey: edit.sectionKey,
            text: edit.text,
          })),
        },
      });
    },

    createSnapshot() {
      return act({ action: "create_preparation_snapshot", body: {} });
    },
  };
}

export type Student500PreparationController = ReturnType<
  typeof createStudent500PreparationController
>;
