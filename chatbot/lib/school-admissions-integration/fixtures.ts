/**
 * Phase 13 M5.3 — journey fixtures.
 *
 * These helpers drive the *accepted* services only; they contain no domain logic
 * of their own beyond sequencing real calls, so a scenario cannot "pass" by
 * asserting on a hand-built mirror of the domain.
 */
import type { M5IntegrationHarness } from "./harness";
import { M3_INSTITUTIONS, seedReference } from "./harness";

export type JourneyApplication = {
  applicationId: string;
  institutionKey: keyof typeof M3_INSTITUTIONS;
  revision: number;
};

export async function createApplication(
  harness: M5IntegrationHarness,
  options: {
    institutionKey?: keyof typeof M3_INSTITUTIONS;
    intakeLabel?: string;
    ownerUserId?: string;
    projectId?: string;
    operationPrefix?: string;
  } = {}
): Promise<JourneyApplication> {
  const institutionKey = options.institutionKey ?? "northbridge";
  const entry = M3_INSTITUTIONS[institutionKey];
  const result = await harness.applications.create({
    actorUserId: options.ownerUserId ?? harness.ownerUserId,
    courseId: entry.courseId,
    courseTitle: entry.courseTitle,
    institutionId: entry.institutionId,
    institutionName: entry.institutionName,
    intakeId: entry.intakeId,
    intakeLabel: options.intakeLabel ?? entry.intakeLabel,
    operationId: harness.operationId(options.operationPrefix ?? "app-create"),
    projectId: options.projectId ?? harness.projectId,
  });
  return {
    applicationId: result.application.applicationId,
    institutionKey,
    revision: result.application.revision,
  };
}

/** Binds M2 references and returns the advanced application revision. */
export async function bindReferences(
  harness: M5IntegrationHarness,
  input: {
    applicationId: string;
    references: readonly {
      kind: "fact" | "requirement" | "document";
      referenceId: string;
    }[];
    projectId?: string;
    ownerUserId?: string;
  }
): Promise<number> {
  const projectId = input.projectId ?? harness.projectId;
  const actorUserId = input.ownerUserId ?? harness.ownerUserId;
  let revision = (
    await harness.applications.get({
      actorUserId,
      applicationId: input.applicationId,
      projectId,
    })
  ).revision;
  for (const reference of input.references) {
    const bound = await harness.applications.bindReference({
      actorUserId,
      applicationId: input.applicationId,
      expectedRevision: revision,
      kind: reference.kind,
      operationId: harness.operationId("app-bind"),
      projectId,
      referenceId: reference.referenceId,
    });
    revision = bound.application.revision;
  }
  return revision;
}

export type JourneyPackage = {
  applicationId: string;
  packageId: string;
  version: number;
  contentSha256: string;
  inputsSha256: string;
  targetBindingSha256: string;
  usable: boolean;
  staleReasonCodes: readonly string[];
  revision: number;
};

export async function buildPackage(
  harness: M5IntegrationHarness,
  input: {
    applicationId: string;
    expectedRevision: number;
    projectId?: string;
    ownerUserId?: string;
  }
): Promise<JourneyPackage> {
  const result = await harness.applications.buildPackage({
    actorUserId: input.ownerUserId ?? harness.ownerUserId,
    applicationId: input.applicationId,
    expectedRevision: input.expectedRevision,
    operationId: harness.operationId("app-package"),
    projectId: input.projectId ?? harness.projectId,
  });
  return {
    applicationId: input.applicationId,
    contentSha256: result.package.contentSha256,
    inputsSha256: result.package.inputsSha256,
    packageId: result.package.packageId,
    revision: result.application.revision,
    staleReasonCodes: result.package.staleReasonCodes,
    targetBindingSha256: result.package.targetBindingSha256,
    usable: result.package.usable,
    version: result.package.version,
  };
}

/**
 * Creates the M5.1 application, binds one fact + one document reference and
 * builds its immutable package — the exact-path prerequisite for an M5.2 case.
 */
export async function readyApplication(
  harness: M5IntegrationHarness,
  options: {
    institutionKey?: keyof typeof M3_INSTITUTIONS;
    intakeLabel?: string;
    ownerUserId?: string;
    projectId?: string;
    extraReferences?: readonly {
      kind: "fact" | "requirement" | "document";
      referenceId: string;
    }[];
  } = {}
): Promise<{
  application: JourneyApplication;
  package: JourneyPackage;
  factReferenceId: string;
  documentReferenceId: string;
}> {
  const ownerUserId = options.ownerUserId ?? harness.ownerUserId;
  const projectId = options.projectId ?? harness.projectId;
  const factReferenceId = seedReference(harness, {
    kind: "fact",
    ownerUserId,
    projectId,
    sha256: "1".repeat(64),
  });
  const documentReferenceId = seedReference(harness, {
    kind: "document",
    ownerUserId,
    projectId,
    sha256: "2".repeat(64),
  });
  const application = await createApplication(harness, {
    institutionKey: options.institutionKey,
    intakeLabel: options.intakeLabel,
    ownerUserId,
    projectId,
  });
  const revision = await bindReferences(harness, {
    applicationId: application.applicationId,
    ownerUserId,
    projectId,
    references: [
      { kind: "fact", referenceId: factReferenceId },
      { kind: "document", referenceId: documentReferenceId },
      ...(options.extraReferences ?? []),
    ],
  });
  const pkg = await buildPackage(harness, {
    applicationId: application.applicationId,
    expectedRevision: revision,
    ownerUserId,
    projectId,
  });
  return { application, documentReferenceId, factReferenceId, package: pkg };
}
