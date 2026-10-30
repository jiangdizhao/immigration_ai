// biome-ignore-all lint/suspicious/useAwait: fake adapters are asynchronous by contract.
// biome-ignore-all lint/style/noExportedImports: the reference type is re-exported for tests.
import type { SchoolAdmissionsSectionCode } from "./contracts";
import {
  createInMemorySchoolAdmissionsStore,
  type InMemorySchoolAdmissionsStore,
} from "./in-memory-store";
import {
  disabledSchoolAdmissionsDraftingPort,
  type SchoolAdmissionsApplicationPort,
  type SchoolAdmissionsDocumentPort,
  type SchoolAdmissionsDraftingPort,
  type SchoolAdmissionsEducationPort,
  type SchoolAdmissionsEvidencePort,
  type SchoolAdmissionsManagedPort,
  type SchoolAdmissionsVerificationPort,
} from "./ports";
import {
  createSchoolAdmissionsService,
  type SchoolAdmissionsService,
} from "./service";
import type {
  SchoolAdmissionsApplicationReference,
  SchoolAdmissionsApplicationSnapshot,
  SchoolAdmissionsEducationSummary,
} from "./workflow";

/**
 * Offline composition for M5.2 tests.
 *
 * The adapters below are explicit fakes: they never reach M1/M2/M3/M4, never call
 * a model and never submit anything. They exist so authorization, provenance,
 * staleness and fail-closed behaviour can be exercised deterministically.
 */

export type SeedReference = {
  readonly kind: "fact" | "document" | "requirement";
  readonly referenceId: string;
  readonly referenceVersion: number;
  readonly referenceSha256: string;
  readonly available: boolean;
  readonly changed: boolean;
  readonly revoked: boolean;
};

export type SeedApplication = {
  readonly projectId: string;
  readonly ownerUserId: string;
  readonly applicationId: string;
  readonly revision?: number;
  readonly applicationStatus?: SchoolAdmissionsApplicationSnapshot["applicationStatus"];
  readonly institutionName?: string;
  readonly institutionId?: string | null;
  readonly courseTitle?: string;
  readonly courseId?: string | null;
  readonly deliveryId?: string | null;
  readonly intakeId?: string | null;
  readonly intakeLabel?: string | null;
  readonly sourceStatus?: SchoolAdmissionsApplicationSnapshot["sourceStatus"];
  readonly catalogRecordClass?: "SYNTHETIC" | "UNVERIFIED" | null;
  readonly catalogSnapshotToken?: string | null;
  readonly missingDataCodes?: readonly string[];
  readonly references?: readonly SeedReference[];
  readonly currentPackage?: SchoolAdmissionsApplicationSnapshot["currentPackage"];
};

export type SchoolAdmissionsTestHarness = {
  readonly store: InMemorySchoolAdmissionsStore;
  readonly service: SchoolAdmissionsService;
  seedApplication(input: SeedApplication): SchoolAdmissionsApplicationSnapshot;
  updateApplication(
    applicationId: string,
    patch: Partial<SchoolAdmissionsApplicationSnapshot>
  ): void;
  seedDocument(input: {
    readonly projectId: string;
    readonly referenceId: string;
    readonly version?: number;
    readonly sha256?: string;
    readonly available?: boolean;
    readonly label?: string | null;
    readonly ownerUserId?: string | null;
  }): void;
  seedEducation(input: {
    readonly projectId: string;
    readonly institutionId: string | null;
    readonly courseId: string | null;
    readonly summary: SchoolAdmissionsEducationSummary;
  }): void;
  setConflictState(
    projectId: string,
    state: "none" | "conflicts" | "unavailable"
  ): void;
  setManagedReadiness(
    applicationId: string,
    result:
      | {
          readonly status: "READY" | "NOT_READY" | "UNKNOWN";
          readonly reasonCodes: readonly string[];
        }
      | "unavailable"
  ): void;
  setVerification(
    result:
      | {
          readonly status: "verified" | "rejected";
          readonly authorityReference: string;
        }
      | { readonly status: "unknown" }
      | { readonly status: "unavailable" }
  ): void;
  setDrafting(
    kind: "stub_suggestion" | "disabled",
    suggestions?: readonly {
      readonly sectionCode: SchoolAdmissionsSectionCode;
      readonly text: string;
      readonly sourceCodes: readonly string[];
      readonly uncertaintyCodes: readonly string[];
    }[]
  ): void;
};

const FALLBACK_SHA =
  "0000000000000000000000000000000000000000000000000000000000000000";

export function createSchoolAdmissionsTestHarness(
  options: {
    readonly now?: () => Date;
    readonly newId?: () => string;
    readonly draftingKind?: "stub_suggestion" | "disabled";
  } = {}
): SchoolAdmissionsTestHarness {
  const store = createInMemorySchoolAdmissionsStore(options);
  const now = options.now ?? (() => new Date());
  const applications = new Map<string, SchoolAdmissionsApplicationSnapshot>();
  const applicationOwners = new Map<
    string,
    { projectId: string; ownerUserId: string }
  >();
  const documents = new Map<
    string,
    {
      projectId: string;
      version: number;
      sha256: string;
      available: boolean;
      label: string | null;
      ownerUserId: string | null;
    }
  >();
  const education = new Map<string, SchoolAdmissionsEducationSummary>();
  const conflicts = new Map<string, "none" | "conflicts" | "unavailable">();
  const managed = new Map<
    string,
    | {
        status: "READY" | "NOT_READY" | "UNKNOWN";
        reasonCodes: readonly string[];
      }
    | "unavailable"
  >();
  let verification:
    | { status: "verified" | "rejected"; authorityReference: string }
    | { status: "unknown" }
    | { status: "unavailable" } = { status: "unavailable" };
  let drafting: SchoolAdmissionsDraftingPort =
    disabledSchoolAdmissionsDraftingPort;

  /** Authorization predicate reused by every fake adapter. */
  async function actorAuthorized(actorUserId: string, projectId: string) {
    const context = await store.readActorContext({ actorUserId, projectId });
    if (context.staff || !context.registeredCustomer) {
      return false;
    }
    return (
      context.project !== null &&
      (context.project.ownerUserId === actorUserId ||
        context.membershipStatus === "active_member")
    );
  }

  const applicationPort: SchoolAdmissionsApplicationPort = {
    async list(input) {
      if (!(await actorAuthorized(input.actorUserId, input.projectId))) {
        return { status: "unavailable" as const };
      }
      // Creator-private, exactly like the production M5.1 adapter.
      const owned = [...applications.values()].filter(
        (entry) =>
          entry.projectId === input.projectId &&
          applicationOwners.get(entry.applicationId)?.ownerUserId ===
            input.actorUserId
      );
      return {
        applications: owned.map((entry) => ({
          applicationId: entry.applicationId,
          archived: entry.archived,
          courseTitle: entry.courseTitle,
          institutionName: entry.institutionName,
          intakeLabel: entry.intakeLabel,
          revision: entry.revision,
          sourceStatus: entry.sourceStatus,
        })),
        status: "listed" as const,
      };
    },
    async load(input) {
      const snapshot = applications.get(input.applicationId);
      const owner = applicationOwners.get(input.applicationId);
      if (!(snapshot && owner)) {
        return { status: "not_found" };
      }
      if (owner.projectId !== input.projectId) {
        return { status: "not_found" };
      }
      if (!(await actorAuthorized(input.actorUserId, input.projectId))) {
        return { status: "forbidden" };
      }
      return { application: snapshot, status: "found" };
    },
  };

  const evidencePort: SchoolAdmissionsEvidencePort = {
    async resolve(input) {
      if (!(await actorAuthorized(input.actorUserId, input.projectId))) {
        return { status: "forbidden" };
      }
      if (input.kind !== "document") {
        return { status: "not_found" };
      }
      const document = documents.get(input.referenceId);
      if (!document || document.projectId !== input.projectId) {
        return { status: "not_found" };
      }
      if (!document.available) {
        return { status: "unavailable" };
      }
      return {
        referenceSha256: document.sha256,
        referenceVersion: document.version,
        status: "resolved",
      };
    },
    async conflictState(input) {
      if (!(await actorAuthorized(input.actorUserId, input.projectId))) {
        return "unavailable";
      }
      return conflicts.get(input.projectId) ?? "none";
    },
  };

  const educationPort: SchoolAdmissionsEducationPort = {
    async resolve(input) {
      if (!(await actorAuthorized(input.actorUserId, input.projectId))) {
        return { status: "unavailable" };
      }
      const key = `${input.projectId}:${input.institutionId ?? ""}:${input.courseId ?? ""}`;
      return education.get(key) ?? { status: "not_found" };
    },
  };

  const documentPort: SchoolAdmissionsDocumentPort = {
    async list(input) {
      if (!(await actorAuthorized(input.actorUserId, input.projectId))) {
        return { status: "unavailable" as const };
      }
      return {
        documents: [...documents.entries()]
          .filter(
            ([, entry]) =>
              entry.projectId === input.projectId &&
              entry.available &&
              (!entry.ownerUserId || entry.ownerUserId === input.actorUserId)
          )
          .map(([referenceId, entry]) => ({
            label: entry.label,
            referenceId,
            version: entry.version,
          })),
        status: "listed" as const,
      };
    },
  };

  const managedPort: SchoolAdmissionsManagedPort = {
    async evaluate(input) {
      const configured = managed.get(input.applicationId);
      if (!configured || configured === "unavailable") {
        return { status: "unavailable" };
      }
      return {
        checkedAt: now(),
        evidenceProvenance: "synthetic_test",
        reasonCodes: configured.reasonCodes,
        revalidationToken: `token:${input.applicationId}:${configured.status}`,
        status: configured.status,
      };
    },
  };

  const verificationPort: SchoolAdmissionsVerificationPort = {
    async verifyException() {
      return verification;
    },
  };

  const draftingProxy: SchoolAdmissionsDraftingPort = {
    get kind() {
      return drafting.kind;
    },
    suggest: (request) => drafting.suggest(request),
  };

  const service = createSchoolAdmissionsService({
    applicationPort,
    documentPort,
    draftingPort: draftingProxy,
    educationPort,
    evidencePort,
    managedPort,
    now,
    store,
    verificationPort,
  });

  return {
    get service() {
      return service;
    },
    setConflictState(projectId, state) {
      conflicts.set(projectId, state);
    },
    setDrafting(kind, suggestions = []) {
      drafting =
        kind === "stub_suggestion"
          ? {
              kind: "stub_suggestion",
              suggest: async () => ({
                status: "suggested" as const,
                suggestions,
              }),
            }
          : disabledSchoolAdmissionsDraftingPort;
    },
    setManagedReadiness(applicationId, result) {
      managed.set(applicationId, result);
    },
    setVerification(result) {
      verification = result;
    },
    seedApplication(input) {
      const snapshot: SchoolAdmissionsApplicationSnapshot = {
        applicationId: input.applicationId,
        applicationStatus: input.applicationStatus ?? "package_prepared",
        archived: input.applicationStatus === "archived",
        catalogRecordClass: input.catalogRecordClass ?? null,
        catalogSnapshotToken: input.catalogSnapshotToken ?? null,
        courseId: input.courseId ?? null,
        courseTitle: input.courseTitle ?? "Master of Data Science",
        currentPackage: input.currentPackage ?? null,
        deliveryId: input.deliveryId ?? null,
        institutionId: input.institutionId ?? null,
        institutionName: input.institutionName ?? "Example University",
        intakeId: input.intakeId ?? null,
        intakeLabel: input.intakeLabel ?? "2027 Semester 1",
        missingDataCodes: input.missingDataCodes ?? [],
        projectId: input.projectId,
        references: input.references ?? [],
        revision: input.revision ?? 1,
        sourceStatus: input.sourceStatus ?? "unverified_customer_declared",
      };
      applications.set(input.applicationId, snapshot);
      applicationOwners.set(input.applicationId, {
        ownerUserId: input.ownerUserId,
        projectId: input.projectId,
      });
      return snapshot;
    },
    seedDocument(input) {
      documents.set(input.referenceId, {
        available: input.available ?? true,
        label: input.label ?? null,
        ownerUserId: input.ownerUserId ?? null,
        projectId: input.projectId,
        sha256: input.sha256 ?? FALLBACK_SHA,
        version: input.version ?? 1,
      });
    },
    seedEducation(input) {
      education.set(
        `${input.projectId}:${input.institutionId ?? ""}:${input.courseId ?? ""}`,
        input.summary
      );
    },
    store,
    updateApplication(applicationId, patch) {
      const existing = applications.get(applicationId);
      if (!existing) {
        throw new Error(`unknown application ${applicationId}`);
      }
      applications.set(applicationId, { ...existing, ...patch });
    },
  };
}

export type { SchoolAdmissionsApplicationReference };
