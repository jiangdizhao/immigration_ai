// biome-ignore-all lint/suspicious/useAwait: adapter methods are asynchronous by contract.
/**
 * Phase 13 M5.3 — integrated cross-module acceptance harness.
 *
 * Composition (no module is re-implemented, no M5 boundary is faked):
 *
 *   real M5.1 `createSchoolApplicationService`
 *     over `createInMemorySchoolApplicationStore`
 *     with the shared M2 reference registry and M3 catalog registry
 *            ↓  `createSchoolAdmissionsApplicationPort` (real M5.1 service calls)
 *   real M5.2 `createSchoolAdmissionsService`
 *     over `createInMemorySchoolAdmissionsStore`
 *     with M2 evidence/document adapters over the SAME registries,
 *     the real M4 readiness evaluator composed with deny-all ports,
 *     and the production deny-only drafting/verification ports.
 *
 * Stubbed external dependencies (justified): M2 Project facts/documents/
 * requirements, M3 education catalog, the institutional providers, and every M4
 * authority port (which production also denies). Identity/session is injected
 * because a real Next.js request is not available offline.
 */
import { randomUUID } from "node:crypto";
import { evaluateManagedHandoffReadiness } from "../managed-handoff/evaluator";
import { denyAllManagedHandoffPorts } from "../managed-handoff/ports";
import { unavailableManagedTargetProvider } from "../professional-review/target-provider";
import { createSchoolAdmissionsHandlers } from "../school-admissions/http";
import {
  createInMemorySchoolAdmissionsStore,
  type InMemorySchoolAdmissionsStore,
} from "../school-admissions/in-memory-store";
import {
  disabledSchoolAdmissionsDraftingPort,
  type SchoolAdmissionsDocumentPort,
  type SchoolAdmissionsEducationPort,
  type SchoolAdmissionsEvidencePort,
  type SchoolAdmissionsManagedPort,
  unavailableSchoolAdmissionsVerificationPort,
} from "../school-admissions/ports";
import { createSchoolAdmissionsService } from "../school-admissions/service";
import { SCHOOL_APPLICATION_TARGET_KIND } from "../school-applications/contracts";
import { createSchoolApplicationHandlers } from "../school-applications/http";
import {
  createInMemorySchoolApplicationStore,
  type InMemorySchoolApplicationStore,
} from "../school-applications/in-memory-store";
import { createSchoolApplicationService } from "../school-applications/service";
import { createSchoolAdmissionsApplicationPort } from "./application-port";
import {
  createM2ReferenceRegistry,
  createM3CatalogRegistry,
  type M2ReferenceKind,
  type M2ReferenceRegistry,
  type M3CatalogEntry,
  type M3CatalogRegistry,
} from "./registries";

export const M5_PROJECT_ID = "22222222-2222-4222-8222-222222222201";
export const M5_OTHER_PROJECT_ID = "22222222-2222-4222-8222-222222222202";
export const M5_CLOSED_PROJECT_ID = "22222222-2222-4222-8222-222222222203";
export const M5_OWNER_ID = "11111111-1111-4111-8111-111111111101";
export const M5_MEMBER_ID = "11111111-1111-4111-8111-111111111102";
export const M5_STRANGER_ID = "11111111-1111-4111-8111-111111111103";
export const M5_STAFF_ID = "11111111-1111-4111-8111-111111111104";
export const M5_GUEST_ID = "11111111-1111-4111-8111-111111111105";

export const M3_INSTITUTIONS = {
  northbridge: {
    courseId: "course:northbridge:bachelor-nursing",
    courseTitle: "Bachelor of Nursing",
    deliveryId: null,
    institutionId: "provider:northbridge",
    institutionName: "Northbridge University",
    intakeId: "intake:northbridge:2027-s1",
    intakeLabel: "Semester 1 2027",
    recordClass: "UNVERIFIED" as const,
    snapshotToken: "m3-snapshot:northbridge:1",
  },
  northbridgeDataScience: {
    courseId: "course:northbridge:master-data-science",
    courseTitle: "Master of Data Science",
    deliveryId: null,
    institutionId: "provider:northbridge",
    institutionName: "Northbridge University",
    intakeId: "intake:northbridge:2027-s2",
    intakeLabel: "Semester 2 2027",
    recordClass: "UNVERIFIED" as const,
    snapshotToken: "m3-snapshot:northbridge:1",
  },
  riverside: {
    courseId: "course:riverside:diploma-business",
    courseTitle: "Diploma of Business",
    deliveryId: null,
    institutionId: "provider:riverside",
    institutionName: "Riverside Institute",
    intakeId: "intake:riverside:2027-s1",
    intakeLabel: "Trimester 1 2027",
    recordClass: "UNVERIFIED" as const,
    snapshotToken: "m3-snapshot:riverside:1",
  },
} satisfies Record<string, M3CatalogEntry>;

export type M5IntegrationDocument = {
  assetId: string;
  projectId: string;
  ownerUserId: string;
  version: number;
  sha256: string;
  canonicalMime: string;
};

type DocumentAsset = M5IntegrationDocument & {
  lifecycle: "active" | "deleted";
  securityStatus: "clean" | "pending" | "infected";
  storageStatus: "stored" | "missing";
};

export type M5IntegrationHarness = {
  readonly projectId: string;
  readonly otherProjectId: string;
  readonly closedProjectId: string;
  readonly ownerUserId: string;
  readonly memberUserId: string;
  readonly strangerUserId: string;
  readonly staffUserId: string;
  readonly guestUserId: string;
  readonly applications: ReturnType<typeof createSchoolApplicationService>;
  readonly applicationStore: InMemorySchoolApplicationStore;
  readonly admissions: ReturnType<typeof createSchoolAdmissionsService>;
  readonly admissionStore: InMemorySchoolAdmissionsStore;
  readonly m2: M2ReferenceRegistry;
  readonly m3: M3CatalogRegistry;
  readonly documents: {
    seed(input: {
      assetId?: string;
      projectId?: string;
      ownerUserId?: string;
      version?: number;
      sha256?: string;
      canonicalMime?: string;
      lifecycle?: DocumentAsset["lifecycle"];
      securityStatus?: DocumentAsset["securityStatus"];
      storageStatus?: DocumentAsset["storageStatus"];
    }): M5IntegrationDocument;
    setSecurityStatus(
      assetId: string,
      status: DocumentAsset["securityStatus"]
    ): void;
    setStorageStatus(
      assetId: string,
      status: DocumentAsset["storageStatus"]
    ): void;
    count(): number;
  };
  readonly clock: {
    now(): Date;
    advance(milliseconds: number): void;
    set(iso: string): void;
  };
  readonly session: {
    signIn(userId: string | null): void;
    signOut(): void;
  };
  readonly flags: {
    setApplicationsEnabled(enabled: boolean): void;
    setAdmissionsEnabled(enabled: boolean): void;
    setSchemaAvailable(available: boolean): void;
  };
  readonly http: {
    applicationHandlers: ReturnType<typeof createSchoolApplicationHandlers>;
    admissionHandlers: ReturnType<typeof createSchoolAdmissionsHandlers>;
  };
  /** Deterministic operation ids that are unique per scenario run. */
  readonly operationId: (prefix: string) => string;
};

export function createM5IntegrationHarness(
  options: { readonly now?: () => Date } = {}
): M5IntegrationHarness {
  let current = options.now
    ? options.now()
    : new Date("2026-11-01T00:00:00.000Z");
  const clock = {
    advance(milliseconds: number) {
      current = new Date(current.getTime() + milliseconds);
    },
    now: () => current,
    set(iso: string) {
      current = new Date(iso);
    },
  };

  const m2 = createM2ReferenceRegistry();
  const m3 = createM3CatalogRegistry();
  for (const entry of Object.values(M3_INSTITUTIONS)) {
    m3.seed(entry);
  }

  const documents = new Map<string, DocumentAsset>();

  const applicationStore = createInMemorySchoolApplicationStore({
    now: clock.now,
  });
  const admissionStore = createInMemorySchoolAdmissionsStore({
    now: clock.now,
  });

  applicationStore.seedProject(M5_PROJECT_ID, {
    ownerUserId: M5_OWNER_ID,
    status: "active",
  });
  applicationStore.seedProject(M5_OTHER_PROJECT_ID, {
    ownerUserId: M5_STRANGER_ID,
    status: "active",
  });
  applicationStore.seedProject(M5_CLOSED_PROJECT_ID, {
    ownerUserId: M5_OWNER_ID,
    status: "closed",
  });
  applicationStore.seedActor(M5_OWNER_ID, { registeredCustomer: true });
  applicationStore.seedActor(M5_MEMBER_ID, {
    memberships: { [M5_PROJECT_ID]: "active" },
    registeredCustomer: true,
  });
  applicationStore.seedActor(M5_STRANGER_ID, { registeredCustomer: true });
  applicationStore.seedActor(M5_STAFF_ID, {
    registeredCustomer: false,
    staff: true,
  });
  applicationStore.seedActor(M5_GUEST_ID, { registeredCustomer: false });

  admissionStore.seedProject(M5_PROJECT_ID, {
    ownerUserId: M5_OWNER_ID,
    status: "active",
  });
  admissionStore.seedProject(M5_OTHER_PROJECT_ID, {
    ownerUserId: M5_STRANGER_ID,
    status: "active",
  });
  admissionStore.seedProject(M5_CLOSED_PROJECT_ID, {
    ownerUserId: M5_OWNER_ID,
    status: "closed",
  });
  admissionStore.seedActor(M5_OWNER_ID, { registeredCustomer: true });
  admissionStore.seedActor(M5_MEMBER_ID, {
    memberships: { [M5_PROJECT_ID]: "active" },
    registeredCustomer: true,
  });
  admissionStore.seedActor(M5_STRANGER_ID, { registeredCustomer: true });
  admissionStore.seedActor(M5_STAFF_ID, {
    registeredCustomer: false,
    staff: true,
  });
  admissionStore.seedActor(M5_GUEST_ID, { registeredCustomer: false });

  // ---------------------------------------------------------------------------
  // Stubbed external authorities (M2 documents, M4 deny-all, production deny-only)
  // ---------------------------------------------------------------------------

  const evidencePort: SchoolAdmissionsEvidencePort = {
    async resolve(input) {
      return m2.identity({
        actorUserId: input.actorUserId,
        kind: input.kind,
        projectId: input.projectId,
        referenceId: input.referenceId,
      });
    },
    async conflictState() {
      // No approved Project-fact conflict summary adapter exists; the honest
      // answer is "cannot be established", never "no conflicts".
      return "unavailable" as const;
    },
  };

  const educationPort: SchoolAdmissionsEducationPort = {
    async resolve(input) {
      const resolved = await m3.resolver.resolve({
        courseId: input.courseId,
        deliveryId: null,
        institutionId: input.institutionId,
        intakeId: null,
      });
      if (resolved.status === "resolved") {
        return {
          courseLabel: resolved.courseTitle,
          institutionLabel: resolved.institutionName,
          recordClass: resolved.recordClass,
          snapshotToken: resolved.snapshotToken,
          status: "resolved" as const,
        };
      }
      return resolved.status === "unavailable"
        ? { status: "unavailable" as const }
        : { status: "not_found" as const };
    },
  };

  const documentPort: SchoolAdmissionsDocumentPort = {
    async list(input) {
      const selectable = [...documents.values()].filter(
        (asset) =>
          asset.projectId === input.projectId &&
          asset.ownerUserId === input.actorUserId &&
          asset.lifecycle === "active" &&
          asset.securityStatus === "clean" &&
          asset.storageStatus === "stored"
      );
      return {
        documents: selectable.map((asset) => ({
          // Neutral label only: no filename, storage key or content.
          label: `Document ${asset.assetId.slice(0, 8)} · ${asset.canonicalMime}`,
          referenceId: asset.assetId,
          version: asset.version,
        })),
        status: "listed" as const,
      };
    },
  };

  const managedPort: SchoolAdmissionsManagedPort = {
    async evaluate(input) {
      const result = await evaluateManagedHandoffReadiness(
        {
          actorUserId: input.actorUserId,
          messagingConsentPresent: false,
          projectId: input.projectId,
          target: {
            targetId: input.applicationId,
            targetKind: SCHOOL_APPLICATION_TARGET_KIND,
          },
          // VIP is context only; it is never a readiness input.
          vipEntitlementActive: false,
        },
        denyAllManagedHandoffPorts(unavailableManagedTargetProvider)
      );
      return {
        checkedAt: new Date(result.checkedAt),
        evidenceProvenance: result.evidenceProvenance,
        reasonCodes: result.reasonCodes,
        revalidationToken: result.revalidationToken,
        status: result.status,
      };
    },
  };

  // ---------------------------------------------------------------------------
  // Real accepted services
  // ---------------------------------------------------------------------------

  const applications = createSchoolApplicationService({
    catalogResolver: m3.resolver,
    referenceResolver: m2.resolver,
    store: applicationStore,
  });

  const admissions = createSchoolAdmissionsService({
    applicationPort: createSchoolAdmissionsApplicationPort(applications),
    documentPort,
    draftingPort: disabledSchoolAdmissionsDraftingPort,
    educationPort,
    evidencePort,
    managedPort,
    now: clock.now,
    store: admissionStore,
    verificationPort: unavailableSchoolAdmissionsVerificationPort,
  });

  // ---------------------------------------------------------------------------
  // Session and feature flags (production defaults are OFF / schema absent)
  // ---------------------------------------------------------------------------

  let signedInUserId: string | null = null;
  let applicationsEnabled = true;
  let admissionsEnabled = true;
  let schemaAvailable = true;

  function session() {
    if (!signedInUserId) {
      return null;
    }
    return {
      type:
        signedInUserId === M5_STAFF_ID
          ? ("staff" as const)
          : ("regular" as const),
      userId: signedInUserId,
    };
  }

  const applicationHandlers = createSchoolApplicationHandlers({
    async authenticate() {
      return session() as never;
    },
    enabled: () => applicationsEnabled,
    async schemaAvailable() {
      return schemaAvailable;
    },
    service: applications,
  });

  const admissionHandlers = createSchoolAdmissionsHandlers({
    async authenticate() {
      return session();
    },
    enabled: () => admissionsEnabled,
    async schemaAvailable() {
      return schemaAvailable;
    },
    service: admissions,
  });

  const operationCounters = new Map<string, number>();

  return {
    admissionStore,
    admissions,
    applicationStore,
    applications,
    clock,
    closedProjectId: M5_CLOSED_PROJECT_ID,
    documents: {
      count: () => documents.size,
      seed(input) {
        const asset: DocumentAsset = {
          assetId: input.assetId ?? randomUUID(),
          canonicalMime: input.canonicalMime ?? "application/pdf",
          lifecycle: input.lifecycle ?? "active",
          ownerUserId: input.ownerUserId ?? M5_OWNER_ID,
          projectId: input.projectId ?? M5_PROJECT_ID,
          securityStatus: input.securityStatus ?? "clean",
          sha256: input.sha256 ?? "c".repeat(64),
          storageStatus: input.storageStatus ?? "stored",
          version: input.version ?? 1,
        };
        documents.set(asset.assetId, asset);
        // One seed writes both M2 views, so a document-backed Offer/CoE can never
        // reference evidence that the customer cannot actually select.
        m2.seed({
          kind: "document",
          ownerUserId: asset.ownerUserId,
          projectId: asset.projectId,
          referenceId: asset.assetId,
          sha256: asset.sha256,
          version: asset.version,
        });
        return {
          assetId: asset.assetId,
          canonicalMime: asset.canonicalMime,
          ownerUserId: asset.ownerUserId,
          projectId: asset.projectId,
          sha256: asset.sha256,
          version: asset.version,
        };
      },
      setSecurityStatus(assetId, status) {
        const asset = documents.get(assetId);
        if (!asset) {
          throw new Error(`unknown document ${assetId}`);
        }
        asset.securityStatus = status;
      },
      setStorageStatus(assetId, status) {
        const asset = documents.get(assetId);
        if (!asset) {
          throw new Error(`unknown document ${assetId}`);
        }
        asset.storageStatus = status;
      },
    },
    flags: {
      setAdmissionsEnabled(enabled) {
        admissionsEnabled = enabled;
      },
      setApplicationsEnabled(enabled) {
        applicationsEnabled = enabled;
      },
      setSchemaAvailable(available) {
        schemaAvailable = available;
      },
    },
    guestUserId: M5_GUEST_ID,
    http: {
      admissionHandlers,
      applicationHandlers,
    },
    m2,
    m3,
    memberUserId: M5_MEMBER_ID,
    operationId(prefix) {
      const next = (operationCounters.get(prefix) ?? 0) + 1;
      operationCounters.set(prefix, next);
      return `${prefix}-${next}`;
    },
    otherProjectId: M5_OTHER_PROJECT_ID,
    ownerUserId: M5_OWNER_ID,
    projectId: M5_PROJECT_ID,
    session: {
      signIn(userId) {
        signedInUserId = userId;
      },
      signOut() {
        signedInUserId = null;
      },
    },
    staffUserId: M5_STAFF_ID,
    strangerUserId: M5_STRANGER_ID,
  };
}

/** Seeds one M2 reference owned by the Project owner. */
export function seedReference(
  harness: M5IntegrationHarness,
  input: {
    kind?: M2ReferenceKind;
    referenceId?: string;
    sha256?: string;
    version?: number;
    ownerUserId?: string;
    projectId?: string;
    available?: boolean;
  } = {}
): string {
  const referenceId = input.referenceId ?? randomUUID();
  harness.m2.seed({
    available: input.available ?? true,
    kind: input.kind ?? "fact",
    ownerUserId: input.ownerUserId ?? harness.ownerUserId,
    projectId: input.projectId ?? harness.projectId,
    referenceId,
    sha256: input.sha256 ?? "a".repeat(64),
    version: input.version ?? 1,
  });
  return referenceId;
}
