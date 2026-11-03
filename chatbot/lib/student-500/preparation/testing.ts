import {
  normalizeStudent500Context,
  type Student500ContextInput,
  student500RequestSha256,
} from "../contracts";
import { createInMemoryStudent500Store } from "../in-memory-store";
import { createDeclaredStudent500LegalSourceProvider } from "../legal-source-provider";
import { createStudent500RequirementResolver } from "../requirement-resolver";
import { createInMemoryPreparationStore } from "./in-memory-store";
import type {
  Student500AdmissionLinkResolver,
  Student500FactCandidate,
  Student500FactContextPort,
} from "./ports";
import {
  createStudent500PreparationService,
  type Student500PreparationServiceOptions,
} from "./service";

/**
 * Offline harness for the M6.2 preparation service.
 *
 * Real M6.1 store + requirement resolver (declared legal sources), a controllable
 * fact port, a controllable M5.2 admission resolver, and the in-memory M6.2 store.
 * No database, no provider, no model call.
 */

export const OWNER = "11111111-1111-4111-8111-111111111201";
export const MEMBER = "11111111-1111-4111-8111-111111111202";
export const STRANGER = "11111111-1111-4111-8111-111111111203";
export const PROJECT = "22222222-2222-4222-8222-222222222301";
export const OTHER_PROJECT = "22222222-2222-4222-8222-222222222302";
export const ADMISSION_CASE = "33333333-3333-4333-8333-333333333301";
export const SCHOOL_APPLICATION = "44444444-4444-4444-8444-444444444401";

export type FactSeed = Omit<Student500FactCandidate, "valueDisplay"> & {
  readonly valueDisplay?: string;
};

export function fact(
  overrides: Partial<FactSeed> & { readonly key: string }
): Student500FactCandidate {
  return {
    aiUseAuthorized: overrides.aiUseAuthorized ?? true,
    authorizationActorUserId:
      overrides.authorizedAudience === "none"
        ? null
        : (overrides.authorizationActorUserId ?? OWNER),
    authorizedAudience: overrides.authorizedAudience ?? "project",
    conflicted: overrides.conflicted ?? false,
    customerConfirmed: overrides.customerConfirmed ?? true,
    factAssertionId:
      overrides.factAssertionId ?? "55555555-5555-4555-8555-555555555501",
    key: overrides.key,
    originKind: overrides.originKind ?? "customer_stated",
    sourceEvidenceRef: overrides.sourceEvidenceRef ?? null,
    stale: overrides.stale ?? false,
    state: overrides.state ?? "customer_confirmed",
    valueDisplay: overrides.valueDisplay ?? "recorded value 1600",
    version: overrides.version ?? 1,
  };
}

export function createHarness(
  options: {
    readonly facts?: readonly Student500FactCandidate[] | "unavailable";
    readonly admissions?: Student500AdmissionLinkResolver;
    readonly schoolApplications?: import("../service").Student500SchoolApplicationLinkResolver;
  } = {}
) {
  const applications = createInMemoryStudent500Store();
  const store = createInMemoryPreparationStore();
  let factsState: readonly Student500FactCandidate[] | "unavailable" =
    options.facts ?? [];
  const factCalls: { actorUserId: string; projectId: string }[] = [];
  const factsPort: Student500FactContextPort = {
    list(input) {
      factCalls.push({ ...input });
      if (factsState === "unavailable") {
        return Promise.resolve({
          reason: "fact_projection_unavailable",
          status: "unavailable" as const,
        });
      }
      return Promise.resolve({
        facts: factsState,
        status: "available" as const,
      });
    },
  };

  applications.seedActor(OWNER, { registeredCustomer: true });
  applications.seedActor(MEMBER, { registeredCustomer: true });
  applications.seedActor(STRANGER, { registeredCustomer: true });
  applications.seedProject(PROJECT, { ownerUserId: OWNER, status: "active" });
  applications.seedProject(OTHER_PROJECT, {
    ownerUserId: STRANGER,
    status: "active",
  });
  applications.setMembership(PROJECT, MEMBER, "active");

  const resolver = createStudent500RequirementResolver({
    provider: createDeclaredStudent500LegalSourceProvider(),
  });

  const serviceOptions: {
    -readonly [K in keyof Student500PreparationServiceOptions]: Student500PreparationServiceOptions[K];
  } = {
    admissions: options.admissions,
    schoolApplications: options.schoolApplications,
    applications,
    facts: factsPort,
    screen: async (input) => {
      const application = await applications.getApplication({
        applicationId: input.applicationId,
        ownerUserId: input.actorUserId,
        projectId: input.projectId,
      });
      if (!application) {
        const { Student500Error } = await import("../contracts");
        throw new Student500Error("application_not_found");
      }
      return resolver.resolve({
        context: application.context,
        linkedSchoolApplication: null,
      });
    },
    store,
  };

  const service = createStudent500PreparationService(serviceOptions);

  async function seedApplication(
    contextInput: Student500ContextInput = {
      applicationPlace: "offshore",
      asOfDate: "2026-11-03",
      coeStatus: "reported_not_held",
      entryRoute: "offer_only",
    },
    actorUserId: string = OWNER
  ) {
    const context = normalizeStudent500Context(contextInput);
    const result = await applications.createApplication({
      operation: {
        actorUserId,
        operationId: `seed-${actorUserId}-${Math.random().toString(36).slice(2)}`,
        operationType: "student_500_create",
        requestSha256: student500RequestSha256({
          context,
          operationType: "student_500_create",
          projectId: PROJECT,
        }),
      },
      projectId: PROJECT,
      values: {
        applicantUserId: actorUserId,
        context,
        ownerUserId: actorUserId,
      },
    });
    return result.value;
  }

  return {
    applications,
    factCalls,
    factsPort,
    seedApplication,
    service,
    setAdmissions(resolver: Student500AdmissionLinkResolver | undefined) {
      serviceOptions.admissions = resolver;
    },
    setFacts(next: readonly Student500FactCandidate[] | "unavailable") {
      factsState = next;
    },
    store,
  };
}

export type Harness = ReturnType<typeof createHarness>;
