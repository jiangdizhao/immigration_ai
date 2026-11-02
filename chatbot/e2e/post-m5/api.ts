// biome-ignore-all lint/style/noParameterProperties: fixture identifiers are asserted to exist
/**
 * Phase 13 Post-M5 E2E — typed helpers over the real HTTP surface.
 */
import { randomUUID } from "node:crypto";
import type { HttpClient } from "./http";
import type { CatalogTarget } from "./seed";

export function operationId(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

type Json = Record<string, unknown>;

export type ApplicationView = {
  applicationId: string;
  revision: number;
  status: string;
  currentPackage?: {
    packageId: string;
    version: number;
    contentSha256: string;
  } | null;
  packageStale?: boolean;
  staleReasonCodes?: string[];
  archivedAt?: string | null;
  references?: Array<{
    referenceId: string;
    changed: boolean;
    available: boolean;
  }>;
  disclosures?: string[];
  source?: {
    status: string;
    catalogRecordClass?: string | null;
    independentlyVerified?: boolean;
  };
  course?: { catalogId?: string | null; title: string };
  institution?: {
    catalogId?: string | null;
    name: string;
    catalogRecordClass?: string | null;
  };
};

export type CaseView = {
  caseId: string;
  revision: number;
  serviceMode: string;
  preparation?: {
    preparationId: string;
    version: number;
    contentSha256: string;
    inputsSha256: string;
    confirmedAt: string | null;
    applicationRevision: number;
  } | null;
  preparationStale?: boolean;
  staleReasonCodes?: string[];
  preparationHistory?: Array<{
    preparationId: string;
    version: number;
    confirmedAt: string | null;
  }>;
  preparationState?: string;
  requirements?: Array<{ code: string; status: string }>;
  externalActions?: Array<{
    provenance: string;
    verified: boolean;
    performedOn: string;
  }>;
  outcomes?: Array<{ outcomeId: string; kind: string; status: string }>;
  managedReadiness?: {
    status: string;
    submissionState: string;
    reasonCodes?: string[];
  };
  disclosures?: string[];
  journey?: {
    student500Eligibility: string;
    offerState?: string;
    offerTerminal?: boolean;
    offerExpiryState?: string;
    coeState?: string;
    coeValidityState?: string;
    exceptionState?: string;
    hasOutcome?: boolean;
  };
  exception?: unknown;
  offer?: unknown;
  coe?: unknown;
  originKind?: string;
};

export function applicationOf(json: Json | null): ApplicationView {
  return (json?.application as ApplicationView) ?? ({} as ApplicationView);
}

export function caseOf(json: Json | null): CaseView {
  return (json?.case as CaseView) ?? ({} as CaseView);
}

export class SchoolApi {
  constructor(
    private readonly client: HttpClient,
    readonly projectId: string
  ) {}

  private async call(method: string, path: string, body?: Json) {
    const result = await this.client.request(method, path, { body });
    return {
      json: (result.json as Json | null) ?? null,
      status: result.status,
      text: result.text,
    };
  }

  private base(): string {
    return `/api/projects/${this.projectId}`;
  }

  createApplication(
    input: CatalogTarget & {
      institutionName: string;
      courseTitle: string;
      intakeLabel: string;
    }
  ) {
    return this.call("POST", `${this.base()}/school-applications`, {
      courseId: input.courseId,
      courseTitle: input.courseTitle,
      institutionId: input.institutionId,
      institutionName: input.institutionName,
      intakeId: input.intakeId,
      intakeLabel: input.intakeLabel,
      operationId: operationId("app-create"),
    });
  }

  listApplications() {
    return this.call("GET", `${this.base()}/school-applications`);
  }

  getApplication(applicationId: string) {
    return this.call(
      "GET",
      `${this.base()}/school-applications/${applicationId}`
    );
  }

  bindReference(input: {
    applicationId: string;
    expectedRevision: number;
    kind: string;
    referenceId: string;
  }) {
    return this.call(
      "POST",
      `${this.base()}/school-applications/${input.applicationId}/references`,
      {
        expectedRevision: input.expectedRevision,
        kind: input.kind,
        operationId: operationId("bind"),
        referenceId: input.referenceId,
      }
    );
  }

  revokeReference(input: {
    applicationId: string;
    expectedRevision: number;
    referenceRecordId: string;
  }) {
    return this.call(
      "POST",
      `${this.base()}/school-applications/${input.applicationId}/references/${input.referenceRecordId}/revoke`,
      {
        expectedRevision: input.expectedRevision,
        operationId: operationId("revoke"),
      }
    );
  }

  buildPackage(input: {
    applicationId: string;
    expectedRevision: number;
    operationId?: string;
  }) {
    return this.call(
      "POST",
      `${this.base()}/school-applications/${input.applicationId}/packages`,
      {
        expectedRevision: input.expectedRevision,
        operationId: input.operationId ?? operationId("build"),
      }
    );
  }

  listPackages(applicationId: string) {
    return this.call(
      "GET",
      `${this.base()}/school-applications/${applicationId}/packages`
    );
  }

  archiveApplication(input: {
    applicationId: string;
    expectedRevision: number;
  }) {
    return this.call(
      "POST",
      `${this.base()}/school-applications/${input.applicationId}/archive`,
      {
        expectedRevision: input.expectedRevision,
        operationId: operationId("archive"),
      }
    );
  }

  createCase(input: {
    originKind: string;
    applicationId?: string;
    institutionName?: string;
    courseTitle?: string;
    intakeLabel?: string;
    serviceMode?: string;
  }) {
    return this.call("POST", `${this.base()}/school-admissions`, {
      courseTitle: input.courseTitle ?? null,
      institutionName: input.institutionName ?? null,
      intakeLabel: input.intakeLabel ?? null,
      operationId: operationId("case-create"),
      originKind: input.originKind,
      serviceMode: input.serviceMode ?? "self_service",
      ...(input.applicationId ? { applicationId: input.applicationId } : {}),
    });
  }

  listCases() {
    return this.call("GET", `${this.base()}/school-admissions`);
  }

  getCase(caseId: string) {
    return this.call("GET", `${this.base()}/school-admissions/${caseId}`);
  }

  prepare(input: { caseId: string; expectedRevision: number }) {
    return this.call(
      "POST",
      `${this.base()}/school-admissions/${input.caseId}/preparation`,
      {
        expectedRevision: input.expectedRevision,
        operationId: operationId("prepare"),
      }
    );
  }

  confirmPreparation(input: {
    caseId: string;
    expectedRevision: number;
    preparationId: string;
  }) {
    return this.call(
      "POST",
      `${this.base()}/school-admissions/${input.caseId}/preparation/confirm`,
      {
        expectedRevision: input.expectedRevision,
        operationId: operationId("confirm"),
        preparationId: input.preparationId,
      }
    );
  }

  setServiceMode(input: {
    caseId: string;
    expectedRevision: number;
    serviceMode: string;
  }) {
    return this.call(
      "POST",
      `${this.base()}/school-admissions/${input.caseId}/service-mode`,
      {
        expectedRevision: input.expectedRevision,
        operationId: operationId("mode"),
        serviceMode: input.serviceMode,
      }
    );
  }

  recordExternalAction(input: {
    caseId: string;
    expectedRevision: number;
    acknowledged: boolean;
    performedOn: string;
  }) {
    return this.call(
      "POST",
      `${this.base()}/school-admissions/${input.caseId}/external-actions`,
      {
        acknowledged: input.acknowledged,
        actionKind: "school_portal_submission",
        expectedRevision: input.expectedRevision,
        note: "Self-reported portal submission during synthetic acceptance.",
        operationId: operationId("external"),
        performedOn: input.performedOn,
      }
    );
  }

  recordOutcome(input: {
    caseId: string;
    expectedRevision: number;
    kind: string;
    extra?: Json;
  }) {
    return this.call(
      "POST",
      `${this.base()}/school-admissions/${input.caseId}/outcomes`,
      {
        expectedRevision: input.expectedRevision,
        kind: input.kind,
        operationId: operationId("outcome"),
        ...(input.extra ?? {}),
      }
    );
  }

  readiness(input: { caseId: string; expectedRevision: number }) {
    return this.call(
      "POST",
      `${this.base()}/school-admissions/${input.caseId}/readiness`,
      {
        expectedRevision: input.expectedRevision,
        operationId: operationId("readiness"),
      }
    );
  }

  // --- Completion-campaign additions -----------------------------------------

  transitionOutcome(input: {
    caseId: string;
    expectedRevision: number;
    outcomeId: string;
    kind: string;
    action?: string;
    state?: string;
    decisionOn?: string | null;
  }) {
    return this.call(
      "PATCH",
      `${this.base()}/school-admissions/${input.caseId}/outcomes/${input.outcomeId}`,
      {
        action: input.action,
        decisionOn: input.decisionOn ?? null,
        expectedRevision: input.expectedRevision,
        kind: input.kind,
        operationId: operationId("outcome-transition"),
        state: input.state,
      }
    );
  }
}
