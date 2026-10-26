import "server-only";

import { randomUUID } from "node:crypto";
import { and, asc, desc, eq } from "drizzle-orm";
import { guestRegex } from "@/lib/constants";
import {
  hashProjectOperationRequest,
  validateProjectOperationId,
} from "@/lib/db/project-foundation-utils";
import type { getLazyDatabase } from "@/lib/db/runtime-client";
import {
  PROJECT_REQUIREMENT_FAMILIES,
  type ProjectRequirementApplicability,
  type ProjectRequirementCollectionState,
  type ProjectRequirementFamily,
  projectEvent,
  projectMembership,
  projectOperation,
  projectRequirementState,
  projectRequirementStateEvent,
  type RequirementTemplateVersion,
  requirementTemplate,
  requirementTemplateVersion,
  studyJourneyProject,
  user,
} from "@/lib/db/schema";
import {
  type EvidenceRequirementLocator,
  type FactRequirementLocator,
  hashRequirementTemplateContent,
  locatorBelongsToProject,
  PROVISIONAL_REQUIREMENT_CATALOG,
  type RequirementItem,
  type RequirementLocator,
  redactUnauthorizedRequirementLocators,
  validateRequirementStateShape,
} from "./catalog";

type Database = ReturnType<typeof getLazyDatabase>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export type ProjectRequirementErrorCode =
  | "project_not_found"
  | "project_forbidden"
  | "project_closed"
  | "template_not_found"
  | "version_conflict"
  | "state_conflict"
  | "revision_conflict"
  | "idempotency_conflict"
  | "invalid_request"
  | "locator_unverified"
  | "template_maintenance_forbidden";

export class ProjectRequirementError extends Error {
  readonly code: ProjectRequirementErrorCode;

  constructor(code: ProjectRequirementErrorCode) {
    super(code);
    this.name = "ProjectRequirementError";
    this.code = code;
  }
}

export type ProjectRequirementLocatorVerifier = (input: {
  projectId: string;
  actorUserId: string;
  factLocator: FactRequirementLocator | null;
  evidenceLocator: EvidenceRequirementLocator | null;
  access: "read" | "write";
}) => Promise<boolean>;

/** Server-held authorization port; never supplied by a customer request. */
export type ProjectRequirementTemplateMaintenanceCapability = {
  authorize: () => Promise<boolean>;
};

function invalid(code: ProjectRequirementErrorCode): never {
  throw new ProjectRequirementError(code);
}

function safeActorId(value: string): string {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      value
    )
  ) {
    return invalid("invalid_request");
  }
  return value;
}

function safeTemplateItems(
  items: readonly RequirementItem[]
): RequirementItem[] {
  if (!Array.isArray(items) || items.length === 0 || items.length > 100) {
    return invalid("invalid_request");
  }
  const keys = new Set<string>();
  return items.map((item) => {
    if (
      !item ||
      typeof item.key !== "string" ||
      !/^[a-z][a-z0-9_.-]{0,127}$/u.test(item.key) ||
      typeof item.label !== "string" ||
      !item.label.trim() ||
      item.label.length > 256 ||
      (item.kind !== "fact" && item.kind !== "evidence") ||
      keys.has(item.key)
    ) {
      return invalid("invalid_request");
    }
    keys.add(item.key);
    return { key: item.key, label: item.label.trim(), kind: item.kind };
  });
}

function safeSourceProvenance(input: unknown): {
  sourceIdentity: string | null;
  observedAt: string | null;
  effectiveAt: string | null;
  note: string;
} {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return invalid("invalid_request");
  }
  const value = input as Record<string, unknown>;
  const allowed = new Set([
    "sourceIdentity",
    "observedAt",
    "effectiveAt",
    "note",
  ]);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    return invalid("invalid_request");
  }
  const validNullableText = (candidate: unknown, maxLength: number) =>
    candidate === null ||
    (typeof candidate === "string" &&
      candidate.length > 0 &&
      candidate.length <= maxLength);
  const validNullableDate = (candidate: unknown) =>
    candidate === null ||
    (typeof candidate === "string" &&
      Number.isFinite(Date.parse(candidate)) &&
      new Date(candidate).toISOString() === candidate);
  if (
    !validNullableText(value.sourceIdentity, 512) ||
    !validNullableDate(value.observedAt) ||
    !validNullableDate(value.effectiveAt) ||
    typeof value.note !== "string" ||
    value.note.trim().length === 0 ||
    value.note.length > 1024
  ) {
    return invalid("invalid_request");
  }
  return {
    sourceIdentity: value.sourceIdentity as string | null,
    observedAt: value.observedAt as string | null,
    effectiveAt: value.effectiveAt as string | null,
    note: value.note.trim(),
  };
}

async function assertProjectActor(
  tx: Transaction,
  projectId: string,
  actorUserId: string,
  write: boolean
) {
  const [project] = await tx
    .select({
      id: studyJourneyProject.id,
      ownerUserId: studyJourneyProject.ownerUserId,
      status: studyJourneyProject.status,
      revision: studyJourneyProject.revision,
    })
    .from(studyJourneyProject)
    .where(eq(studyJourneyProject.id, projectId))
    .for("update")
    .limit(1);
  if (!project) {
    return invalid("project_not_found");
  }
  if (write && project.status !== "active") {
    return invalid("project_closed");
  }
  const [actor] = await tx
    .select({ email: user.email, role: user.role })
    .from(user)
    .where(eq(user.id, actorUserId))
    .limit(1);
  if (!actor || actor.role !== "user" || guestRegex.test(actor.email)) {
    return invalid("project_forbidden");
  }
  if (project.ownerUserId !== actorUserId) {
    const [membership] = await tx
      .select({ status: projectMembership.status })
      .from(projectMembership)
      .where(
        and(
          eq(projectMembership.projectId, projectId),
          eq(projectMembership.userId, actorUserId)
        )
      )
      .for("update")
      .limit(1);
    if (membership?.status !== "active") {
      return invalid("project_forbidden");
    }
  }
  return project;
}

function stateValue(input: {
  applicability: ProjectRequirementApplicability;
  collectionState: ProjectRequirementCollectionState;
  factLocator: RequirementLocator | null;
  evidenceLocator: RequirementLocator | null;
  templateVersionId: string;
}) {
  return {
    applicability: input.applicability,
    collectionState: input.collectionState,
    factLocator: input.factLocator,
    evidenceLocator: input.evidenceLocator,
    templateVersionId: input.templateVersionId,
  };
}

function snapshotRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function snapshotFactLocator(value: unknown): FactRequirementLocator | null {
  const record = snapshotRecord(value);
  return record &&
    typeof record.projectId === "string" &&
    typeof record.assertionId === "string" &&
    Number.isSafeInteger(record.version)
    ? (record as unknown as FactRequirementLocator)
    : null;
}

function snapshotEvidenceLocator(
  value: unknown
): EvidenceRequirementLocator | null {
  const record = snapshotRecord(value);
  return record &&
    typeof record.projectId === "string" &&
    typeof record.evidenceRef === "string" &&
    Number.isSafeInteger(record.version)
    ? (record as unknown as EvidenceRequirementLocator)
    : null;
}

export class PostgresProjectRequirementRepository {
  private readonly database: Database;
  private readonly verifyLocators?: ProjectRequirementLocatorVerifier;
  private readonly templateMaintenanceCapability?: ProjectRequirementTemplateMaintenanceCapability;

  constructor(input: {
    database: Database;
    verifyLocators?: ProjectRequirementLocatorVerifier;
    templateMaintenanceCapability?: ProjectRequirementTemplateMaintenanceCapability;
  }) {
    this.database = input.database;
    this.verifyLocators = input.verifyLocators;
    this.templateMaintenanceCapability = input.templateMaintenanceCapability;
  }

  private async requireTemplateMaintenanceCapability() {
    if (!this.templateMaintenanceCapability) {
      return invalid("template_maintenance_forbidden");
    }
    try {
      if (await this.templateMaintenanceCapability.authorize()) {
        return;
      }
    } catch {
      // A maintenance authorization failure is deliberately indistinguishable
      // from a denied capability at this persistence boundary.
    }
    return invalid("template_maintenance_forbidden");
  }

  private async visibleLocators(input: {
    projectId: string;
    actorUserId: string;
    factLocator: FactRequirementLocator | null;
    evidenceLocator: EvidenceRequirementLocator | null;
  }) {
    const [canReadFact, canReadEvidence] = await Promise.all([
      input.factLocator &&
      locatorBelongsToProject(input.factLocator, input.projectId) &&
      this.verifyLocators
        ? this.verifyLocators({
            ...input,
            factLocator: input.factLocator,
            evidenceLocator: null,
            access: "read",
          })
        : Promise.resolve(false),
      input.evidenceLocator &&
      locatorBelongsToProject(input.evidenceLocator, input.projectId) &&
      this.verifyLocators
        ? this.verifyLocators({
            ...input,
            factLocator: null,
            evidenceLocator: input.evidenceLocator,
            access: "read",
          })
        : Promise.resolve(false),
    ]);
    return redactUnauthorizedRequirementLocators({
      factLocator: input.factLocator,
      evidenceLocator: input.evidenceLocator,
      canReadFact,
      canReadEvidence,
    });
  }

  /** Installs only clearly synthetic, provisional collection placeholders. */
  async ensureProvisionalCatalog(): Promise<RequirementTemplateVersion[]> {
    await this.requireTemplateMaintenanceCapability();
    return this.database.transaction(async (tx) => {
      const result: RequirementTemplateVersion[] = [];
      for (const definition of PROVISIONAL_REQUIREMENT_CATALOG) {
        let [template] = await tx
          .select()
          .from(requirementTemplate)
          .where(
            and(
              eq(requirementTemplate.family, definition.family),
              eq(requirementTemplate.templateKey, definition.templateKey)
            )
          )
          .for("update")
          .limit(1);
        if (!template) {
          [template] = await tx
            .insert(requirementTemplate)
            .values({
              family: definition.family,
              templateKey: definition.templateKey,
            })
            .onConflictDoNothing()
            .returning();
          if (!template) {
            [template] = await tx
              .select()
              .from(requirementTemplate)
              .where(
                and(
                  eq(requirementTemplate.family, definition.family),
                  eq(requirementTemplate.templateKey, definition.templateKey)
                )
              )
              .for("update")
              .limit(1);
          }
        }
        if (!template) {
          return invalid("state_conflict");
        }
        let [version] = await tx
          .select()
          .from(requirementTemplateVersion)
          .where(eq(requirementTemplateVersion.templateId, template.id))
          .orderBy(desc(requirementTemplateVersion.version))
          .limit(1);
        if (!version) {
          const items = safeTemplateItems(definition.items);
          const contentHash = hashRequirementTemplateContent({
            schemaVersion: definition.schemaVersion,
            items,
            sourceProvenance: definition.sourceProvenance,
          });
          [version] = await tx
            .insert(requirementTemplateVersion)
            .values({
              templateId: template.id,
              version: 1,
              contentHash,
              schemaVersion: definition.schemaVersion,
              items,
              sourceProvenance: definition.sourceProvenance,
              reviewState: "provisional",
              authoredByUserId: null,
              reviewedByUserId: null,
            })
            .onConflictDoNothing()
            .returning();
          if (!version) {
            [version] = await tx
              .select()
              .from(requirementTemplateVersion)
              .where(eq(requirementTemplateVersion.templateId, template.id))
              .orderBy(desc(requirementTemplateVersion.version))
              .limit(1);
          }
        }
        if (!version) {
          return invalid("state_conflict");
        }
        result.push(version);
      }
      return result;
    });
  }

  listTemplateVersions(input: {
    family: ProjectRequirementFamily;
    templateKey: string;
  }): Promise<RequirementTemplateVersion[]> {
    if (!input.templateKey.trim()) {
      return invalid("invalid_request");
    }
    return this.database
      .select({ version: requirementTemplateVersion })
      .from(requirementTemplateVersion)
      .innerJoin(
        requirementTemplate,
        eq(requirementTemplate.id, requirementTemplateVersion.templateId)
      )
      .where(
        and(
          eq(requirementTemplate.family, input.family),
          eq(requirementTemplate.templateKey, input.templateKey)
        )
      )
      .orderBy(asc(requirementTemplateVersion.version))
      .then((rows) => rows.map((row) => row.version));
  }

  publishProvisionalVersion(input: {
    family: ProjectRequirementFamily;
    templateKey: string;
    schemaVersion: string;
    items: readonly RequirementItem[];
    sourceProvenance: {
      sourceIdentity: string | null;
      observedAt: string | null;
      effectiveAt: string | null;
      note: string;
    };
  }): Promise<RequirementTemplateVersion> {
    if (!PROJECT_REQUIREMENT_FAMILIES.includes(input.family)) {
      return invalid("invalid_request");
    }
    if (!input.templateKey.trim() || !input.schemaVersion.trim()) {
      return invalid("invalid_request");
    }
    const items = safeTemplateItems(input.items);
    const sourceProvenance = safeSourceProvenance(input.sourceProvenance);
    const contentHash = hashRequirementTemplateContent({
      schemaVersion: input.schemaVersion,
      items,
      sourceProvenance,
    });
    return this.requireTemplateMaintenanceCapability().then(() =>
      this.database.transaction(async (tx) => {
        let [template] = await tx
          .select()
          .from(requirementTemplate)
          .where(
            and(
              eq(requirementTemplate.family, input.family),
              eq(requirementTemplate.templateKey, input.templateKey)
            )
          )
          .for("update")
          .limit(1);
        if (!template) {
          [template] = await tx
            .insert(requirementTemplate)
            .values({ family: input.family, templateKey: input.templateKey })
            .onConflictDoNothing()
            .returning();
          if (!template) {
            [template] = await tx
              .select()
              .from(requirementTemplate)
              .where(
                and(
                  eq(requirementTemplate.family, input.family),
                  eq(requirementTemplate.templateKey, input.templateKey)
                )
              )
              .for("update")
              .limit(1);
          }
        }
        if (!template) {
          return invalid("state_conflict");
        }
        const [identical] = await tx
          .select()
          .from(requirementTemplateVersion)
          .where(
            and(
              eq(requirementTemplateVersion.templateId, template.id),
              eq(requirementTemplateVersion.contentHash, contentHash)
            )
          )
          .limit(1);
        if (identical) {
          return identical;
        }
        const [latest] = await tx
          .select()
          .from(requirementTemplateVersion)
          .where(eq(requirementTemplateVersion.templateId, template.id))
          .orderBy(desc(requirementTemplateVersion.version))
          .limit(1);
        const [version] = await tx
          .insert(requirementTemplateVersion)
          .values({
            templateId: template.id,
            version: (latest?.version ?? 0) + 1,
            contentHash,
            schemaVersion: input.schemaVersion,
            items,
            sourceProvenance,
            reviewState: "provisional",
            authoredByUserId: null,
            reviewedByUserId: null,
          })
          .returning();
        return version;
      })
    );
  }

  listStates(input: { actorUserId: string; projectId: string }) {
    const actorUserId = safeActorId(input.actorUserId);
    return this.database.transaction(async (tx) => {
      await assertProjectActor(tx, input.projectId, actorUserId, false);
      const rows = await tx
        .select({
          state: projectRequirementState,
          template: requirementTemplate,
          version: requirementTemplateVersion,
        })
        .from(projectRequirementState)
        .innerJoin(
          requirementTemplate,
          eq(requirementTemplate.id, projectRequirementState.templateId)
        )
        .innerJoin(
          requirementTemplateVersion,
          and(
            eq(
              requirementTemplateVersion.id,
              projectRequirementState.templateVersionId
            ),
            eq(
              requirementTemplateVersion.templateId,
              projectRequirementState.templateId
            )
          )
        )
        .where(eq(projectRequirementState.projectId, input.projectId))
        .orderBy(
          asc(requirementTemplate.family),
          asc(projectRequirementState.itemKey)
        );
      const currentVersions = new Map<string, string>();
      for (const row of rows) {
        if (!currentVersions.has(row.template.id)) {
          const [latest] = await tx
            .select({ id: requirementTemplateVersion.id })
            .from(requirementTemplateVersion)
            .where(eq(requirementTemplateVersion.templateId, row.template.id))
            .orderBy(desc(requirementTemplateVersion.version))
            .limit(1);
          if (latest) {
            currentVersions.set(row.template.id, latest.id);
          }
        }
      }
      return Promise.all(
        rows.map(async (row) => {
          const visible = await this.visibleLocators({
            projectId: input.projectId,
            actorUserId,
            factLocator: row.state.factLocator,
            evidenceLocator: row.state.evidenceLocator,
          });
          return {
            id: row.state.id,
            projectId: row.state.projectId,
            family: row.template.family,
            templateKey: row.template.templateKey,
            templateVersionId: row.state.templateVersionId,
            itemKey: row.state.itemKey,
            applicability: row.state.applicability,
            collectionState: row.state.collectionState,
            ...visible,
            revision: row.state.revision,
            stale:
              currentVersions.get(row.template.id) !==
              row.state.templateVersionId,
          };
        })
      );
    });
  }

  getHistory(input: {
    actorUserId: string;
    projectId: string;
    stateId: string;
  }) {
    const actorUserId = safeActorId(input.actorUserId);
    return this.database.transaction(async (tx) => {
      await assertProjectActor(tx, input.projectId, actorUserId, false);
      const [state] = await tx
        .select({ id: projectRequirementState.id })
        .from(projectRequirementState)
        .where(
          and(
            eq(projectRequirementState.projectId, input.projectId),
            eq(projectRequirementState.id, input.stateId)
          )
        )
        .limit(1);
      if (!state) {
        return invalid("project_forbidden");
      }
      const history = await tx
        .select()
        .from(projectRequirementStateEvent)
        .where(
          and(
            eq(projectRequirementStateEvent.projectId, input.projectId),
            eq(projectRequirementStateEvent.stateId, input.stateId)
          )
        )
        .orderBy(asc(projectRequirementStateEvent.createdAt));
      return Promise.all(
        history.map(async (event) => {
          const oldRecord = snapshotRecord(event.oldValue);
          const newRecord = snapshotRecord(event.newValue) ?? {};
          const [oldVisible, newVisible] = await Promise.all([
            oldRecord
              ? this.visibleLocators({
                  projectId: input.projectId,
                  actorUserId,
                  factLocator: snapshotFactLocator(oldRecord.factLocator),
                  evidenceLocator: snapshotEvidenceLocator(
                    oldRecord.evidenceLocator
                  ),
                })
              : Promise.resolve(null),
            this.visibleLocators({
              projectId: input.projectId,
              actorUserId,
              factLocator: snapshotFactLocator(newRecord.factLocator),
              evidenceLocator: snapshotEvidenceLocator(
                newRecord.evidenceLocator
              ),
            }),
          ]);
          return {
            ...event,
            oldValue: oldRecord ? { ...oldRecord, ...oldVisible } : null,
            newValue: { ...newRecord, ...newVisible },
          };
        })
      );
    });
  }

  async setCollectionState(input: {
    actorUserId: string;
    projectId: string;
    operationId: string;
    expectedProjectRevision: number;
    family: ProjectRequirementFamily;
    templateKey: string;
    templateVersionId: string;
    itemKey: string;
    applicability: ProjectRequirementApplicability;
    collectionState: ProjectRequirementCollectionState;
    factLocator?: FactRequirementLocator | null;
    evidenceLocator?: EvidenceRequirementLocator | null;
  }) {
    const actorUserId = safeActorId(input.actorUserId);
    const factLocator = input.factLocator ?? null;
    const evidenceLocator = input.evidenceLocator ?? null;
    validateRequirementStateShape({ ...input, factLocator, evidenceLocator });
    if (
      !locatorBelongsToProject(factLocator, input.projectId) ||
      !locatorBelongsToProject(evidenceLocator, input.projectId)
    ) {
      return invalid("locator_unverified");
    }
    let operationId: string;
    try {
      operationId = validateProjectOperationId(input.operationId);
    } catch {
      return invalid("invalid_request");
    }
    if (
      !Number.isSafeInteger(input.expectedProjectRevision) ||
      input.expectedProjectRevision < 1
    ) {
      return invalid("invalid_request");
    }
    const inputValue = stateValue({ ...input, factLocator, evidenceLocator });
    const requestHash = hashProjectOperationRequest({
      operationType: "project_requirement_state_change",
      actorUserId,
      projectId: input.projectId,
      family: input.family,
      templateKey: input.templateKey,
      itemKey: input.itemKey,
      ...inputValue,
    });
    const candidateStateId = randomUUID();
    return this.database.transaction(async (tx) => {
      const project = await assertProjectActor(
        tx,
        input.projectId,
        actorUserId,
        true
      );
      const [existingOperation] = await tx
        .select()
        .from(projectOperation)
        .where(
          and(
            eq(projectOperation.actorUserId, actorUserId),
            eq(
              projectOperation.operationType,
              "project_requirement_state_change"
            ),
            eq(projectOperation.operationId, operationId)
          )
        )
        .for("update")
        .limit(1);
      if (existingOperation) {
        if (
          existingOperation.requestHash !== requestHash ||
          existingOperation.resultKind !== "project_requirement_state"
        ) {
          return invalid("idempotency_conflict");
        }
        const stateId = existingOperation.resultId;
        const [state] = await tx
          .select()
          .from(projectRequirementState)
          .where(
            and(
              eq(projectRequirementState.projectId, input.projectId),
              eq(projectRequirementState.id, stateId)
            )
          )
          .limit(1);
        const [event] = await tx
          .select()
          .from(projectRequirementStateEvent)
          .where(
            and(
              eq(
                projectRequirementStateEvent.operationRecordId,
                existingOperation.id
              ),
              eq(projectRequirementStateEvent.projectId, input.projectId),
              eq(projectRequirementStateEvent.stateId, stateId)
            )
          )
          .limit(1);
        const [auditEvent] = await tx
          .select()
          .from(projectEvent)
          .where(
            and(
              eq(projectEvent.operationRecordId, existingOperation.id),
              eq(projectEvent.projectId, input.projectId),
              eq(projectEvent.eventType, "project_requirement_state_changed"),
              eq(projectEvent.subjectKind, "requirement_state"),
              eq(projectEvent.subjectId, stateId)
            )
          )
          .limit(1);
        const storedOutcome = snapshotRecord(event?.newValue);
        if (!state || !event || !auditEvent || !storedOutcome) {
          return invalid("state_conflict");
        }
        const storedFactLocator = snapshotFactLocator(
          storedOutcome.factLocator
        );
        const storedEvidenceLocator = snapshotEvidenceLocator(
          storedOutcome.evidenceLocator
        );
        const visible = await this.visibleLocators({
          projectId: input.projectId,
          actorUserId,
          factLocator: storedFactLocator,
          evidenceLocator: storedEvidenceLocator,
        });
        const outcome = { ...storedOutcome, ...visible };
        const storedRevision =
          typeof storedOutcome.stateRevision === "number" &&
          Number.isSafeInteger(storedOutcome.stateRevision)
            ? storedOutcome.stateRevision
            : state.revision;
        return {
          state: {
            ...state,
            applicability:
              storedOutcome.applicability === "unknown" ||
              storedOutcome.applicability === "true" ||
              storedOutcome.applicability === "false"
                ? storedOutcome.applicability
                : state.applicability,
            collectionState:
              typeof storedOutcome.collectionState === "string"
                ? (storedOutcome.collectionState as ProjectRequirementCollectionState)
                : state.collectionState,
            templateVersionId:
              typeof storedOutcome.templateVersionId === "string"
                ? storedOutcome.templateVersionId
                : state.templateVersionId,
            revision: storedRevision,
            updatedAt: event.createdAt,
            ...visible,
          },
          projectRevision: auditEvent.projectRevision,
          replayed: true,
          outcome,
        };
      }
      if (
        (factLocator || evidenceLocator) &&
        (!this.verifyLocators ||
          !(await this.verifyLocators({
            projectId: input.projectId,
            actorUserId,
            factLocator,
            evidenceLocator,
            access: "write",
          })))
      ) {
        return invalid("locator_unverified");
      }
      const [template] = await tx
        .select()
        .from(requirementTemplate)
        .where(
          and(
            eq(requirementTemplate.family, input.family),
            eq(requirementTemplate.templateKey, input.templateKey)
          )
        )
        .for("update")
        .limit(1);
      if (!template) {
        return invalid("template_not_found");
      }
      const [version] = await tx
        .select()
        .from(requirementTemplateVersion)
        .where(
          and(
            eq(requirementTemplateVersion.id, input.templateVersionId),
            eq(requirementTemplateVersion.templateId, template.id)
          )
        )
        .limit(1);
      if (!version || version.reviewState !== "provisional") {
        return invalid("template_not_found");
      }
      const [latest] = await tx
        .select({ id: requirementTemplateVersion.id })
        .from(requirementTemplateVersion)
        .where(eq(requirementTemplateVersion.templateId, template.id))
        .orderBy(desc(requirementTemplateVersion.version))
        .limit(1);
      if (latest?.id !== version.id) {
        return invalid("version_conflict");
      }
      const itemRows = safeTemplateItems(version.items ?? []);
      const item = itemRows.find(
        (candidate) => candidate.key === input.itemKey
      );
      if (!item) {
        return invalid("invalid_request");
      }
      if (
        (item.kind === "fact" && evidenceLocator !== null) ||
        (item.kind === "evidence" && factLocator !== null)
      ) {
        return invalid("invalid_request");
      }

      const [existingState] = await tx
        .select()
        .from(projectRequirementState)
        .where(
          and(
            eq(projectRequirementState.projectId, input.projectId),
            eq(projectRequirementState.templateVersionId, version.id),
            eq(projectRequirementState.itemKey, input.itemKey)
          )
        )
        .for("update")
        .limit(1);

      const [operation] = await tx
        .insert(projectOperation)
        .values({
          actorUserId,
          actorKind: "user",
          servicePrincipalCode: null,
          operationType: "project_requirement_state_change",
          operationId,
          requestHash,
          resultKind: "project_requirement_state",
          resultId: existingState?.id ?? candidateStateId,
        })
        .onConflictDoNothing()
        .returning();
      if (!operation) {
        return invalid("idempotency_conflict");
      }
      const operationRecordId = operation.id;
      let stateId = existingState?.id ?? candidateStateId;
      if (project.revision !== input.expectedProjectRevision) {
        return invalid("revision_conflict");
      }
      const before = existingState
        ? {
            applicability: existingState.applicability,
            collectionState: existingState.collectionState,
            factLocator: existingState.factLocator,
            evidenceLocator: existingState.evidenceLocator,
            templateVersionId: existingState.templateVersionId,
            stateRevision: existingState.revision,
          }
        : null;
      let state: typeof existingState;
      if (existingState) {
        [state] = await tx
          .update(projectRequirementState)
          .set({
            applicability: input.applicability,
            collectionState: input.collectionState,
            factLocator,
            evidenceLocator,
            revision: existingState.revision + 1,
            staleAt: null,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(projectRequirementState.projectId, input.projectId),
              eq(projectRequirementState.id, existingState.id),
              eq(projectRequirementState.revision, existingState.revision)
            )
          )
          .returning();
        if (!state) {
          return invalid("revision_conflict");
        }
        stateId = state.id;
      } else {
        [state] = await tx
          .insert(projectRequirementState)
          .values({
            id: stateId,
            projectId: input.projectId,
            templateId: template.id,
            templateVersionId: version.id,
            itemKey: input.itemKey,
            applicability: input.applicability,
            collectionState: input.collectionState,
            factLocator,
            evidenceLocator,
            revision: 1,
            staleAt: null,
            createdByUserId: actorUserId,
          })
          .returning();
      }
      if (!state) {
        return invalid("state_conflict");
      }
      const projectRevision = project.revision + 1;
      const [updatedProject] = await tx
        .update(studyJourneyProject)
        .set({ revision: projectRevision, updatedAt: new Date() })
        .where(
          and(
            eq(studyJourneyProject.id, input.projectId),
            eq(studyJourneyProject.revision, project.revision),
            eq(studyJourneyProject.status, "active")
          )
        )
        .returning({ revision: studyJourneyProject.revision });
      if (!updatedProject) {
        return invalid("revision_conflict");
      }
      const after = stateValue({ ...input, factLocator, evidenceLocator });
      const storedOutcome = { ...after, stateRevision: state.revision };
      await tx.insert(projectRequirementStateEvent).values({
        projectId: input.projectId,
        stateId,
        actorUserId,
        actorBasis: "customer_collection_update",
        operationRecordId,
        oldValue: before,
        newValue: storedOutcome,
      });
      await tx.insert(projectEvent).values({
        projectId: input.projectId,
        actorKind: "user",
        actorUserId,
        servicePrincipalCode: null,
        projectRevision,
        eventType: "project_requirement_state_changed",
        subjectKind: "requirement_state",
        subjectId: stateId,
        operationRecordId,
      });
      const visible = await this.visibleLocators({
        projectId: input.projectId,
        actorUserId,
        factLocator: state.factLocator,
        evidenceLocator: state.evidenceLocator,
      });
      return {
        state: { ...state, ...visible },
        projectRevision,
        replayed: false,
        outcome: { ...storedOutcome, ...visible },
      };
    });
  }
}
