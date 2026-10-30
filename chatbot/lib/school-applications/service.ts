import {
  buildSchoolApplicationPackage,
  isSchoolApplicationReferenceKind,
  isSchoolApplicationUuid,
  normalizeOptionalSchoolApplicationText,
  normalizeOptionalSchoolCatalogIdentifier,
  normalizeSchoolApplicationText,
  planSchoolApplicationPackageBuild,
  resolveSchoolApplicationTarget,
  SCHOOL_APPLICATION_DISCLOSURE_CODES,
  SCHOOL_APPLICATION_MAX_LABEL,
  SCHOOL_APPLICATION_MAX_REFERENCES,
  SCHOOL_APPLICATION_MAX_TEXT,
  type SchoolApplicationCatalogRecordClass,
  SchoolApplicationError,
  type SchoolApplicationPackageReference,
  type SchoolApplicationPackageStatus,
  type SchoolApplicationPackageUsability,
  type SchoolApplicationPackageVerification,
  type SchoolApplicationReferenceKind,
  type SchoolApplicationRequestIdentity,
  type SchoolApplicationSourceStatus,
  type SchoolApplicationStaleReasonCode,
  type SchoolApplicationStatus,
  type SchoolApplicationTargetFields,
  schoolApplicationActionAllowed,
  schoolApplicationInputsSha256,
  schoolApplicationMissingDataCodes,
  schoolApplicationPackageUsability,
  schoolApplicationRequestSha256,
  validateSchoolApplicationOperationId,
  validateSchoolApplicationRevision,
  verifySchoolApplicationPackageSnapshot,
} from "./contracts";
import type {
  SchoolApplicationActorContext,
  SchoolApplicationCatalogResolver,
  SchoolApplicationPackageRecord,
  SchoolApplicationRecord,
  SchoolApplicationReferenceRecord,
  SchoolApplicationReferenceResolver,
  SchoolApplicationStore,
} from "./ports";

export type SchoolApplicationReferenceView = {
  readonly referenceRecordId: string;
  readonly kind: SchoolApplicationReferenceKind;
  readonly referenceId: string;
  readonly referenceVersion: number;
  readonly available: boolean;
  readonly changed: boolean;
  readonly boundAt: string;
  readonly revokedAt: string | null;
};

export type SchoolApplicationPackageView = {
  readonly packageId: string;
  readonly version: number;
  readonly status: SchoolApplicationPackageStatus;
  readonly contentSha256: string;
  readonly inputsSha256: string;
  readonly targetKind: string;
  readonly targetVersion: number;
  readonly targetBindingSha256: string;
  readonly createdAt: string;
  readonly integrityVerified: boolean;
  /**
   * Authoritative usability of this package for this read: it is the stored
   * `current` package AND every material input (including live M2 reference
   * identity) still matches. A package whose inputs changed is never `usable`.
   */
  readonly usable: boolean;
  readonly staleReasonCodes: readonly SchoolApplicationStaleReasonCode[];
  readonly verification: SchoolApplicationPackageVerification;
};

export type SchoolApplicationView = {
  readonly applicationId: string;
  readonly projectId: string;
  readonly status: SchoolApplicationStatus;
  readonly revision: number;
  readonly institution: {
    readonly name: string;
    readonly catalogId: string | null;
    readonly catalogRecordClass: SchoolApplicationCatalogRecordClass | null;
    readonly catalogSnapshotToken: string | null;
  };
  readonly course: {
    readonly title: string;
    readonly catalogId: string | null;
  };
  readonly deliveryId: string | null;
  readonly intake: {
    readonly id: string | null;
    readonly label: string | null;
  };
  readonly source: {
    readonly status: SchoolApplicationSourceStatus;
    /** M5.1 never independently verifies institution/course data. */
    readonly independentlyVerified: false;
    readonly catalogRecordClass: SchoolApplicationCatalogRecordClass | null;
    readonly catalogSnapshotToken: string | null;
  };
  readonly missingDataCodes: readonly string[];
  readonly disclosures: readonly string[];
  readonly references: readonly SchoolApplicationReferenceView[];
  readonly packages: readonly SchoolApplicationPackageView[];
  readonly currentPackage: SchoolApplicationPackageView | null;
  /** True only when a stored `current` package exists and is not usable. */
  readonly packageStale: boolean;
  readonly staleReasonCodes: readonly SchoolApplicationStaleReasonCode[];
  readonly packageVerification: SchoolApplicationPackageVerification;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly archivedAt: string | null;
};

export type SchoolApplicationDetailView = SchoolApplicationView & {
  readonly events: readonly {
    readonly eventType: string;
    readonly subjectKind: string;
    readonly subjectId: string;
    readonly applicationRevision: number;
    readonly createdAt: string;
  }[];
};

export type SchoolApplicationTargetRequest = {
  readonly institutionName: string;
  readonly institutionId?: string | null;
  readonly courseTitle: string;
  readonly courseId?: string | null;
  readonly deliveryId?: string | null;
  readonly intakeId?: string | null;
  readonly intakeLabel?: string | null;
};

export type SchoolApplicationServiceOptions = {
  readonly store: SchoolApplicationStore;
  readonly referenceResolver: SchoolApplicationReferenceResolver;
  readonly catalogResolver: SchoolApplicationCatalogResolver;
};

function toIso(value: Date): string {
  return value.toISOString();
}

function targetFields(
  input: SchoolApplicationTargetRequest
): SchoolApplicationTargetFields {
  return {
    courseId: normalizeOptionalSchoolCatalogIdentifier(input.courseId),
    courseTitle: normalizeSchoolApplicationText(
      input.courseTitle,
      SCHOOL_APPLICATION_MAX_TEXT
    ),
    deliveryId: normalizeOptionalSchoolCatalogIdentifier(input.deliveryId),
    institutionId: normalizeOptionalSchoolCatalogIdentifier(
      input.institutionId
    ),
    institutionName: normalizeSchoolApplicationText(
      input.institutionName,
      SCHOOL_APPLICATION_MAX_TEXT
    ),
    intakeId: normalizeOptionalSchoolCatalogIdentifier(input.intakeId),
    intakeLabel: normalizeOptionalSchoolApplicationText(
      input.intakeLabel,
      SCHOOL_APPLICATION_MAX_LABEL
    ),
  };
}

type ResolvedReference = {
  readonly record: SchoolApplicationReferenceRecord;
  readonly available: boolean;
  readonly changed: boolean;
  readonly referenceVersion: number;
  readonly referenceSha256: string;
};

export function createSchoolApplicationService(
  options: SchoolApplicationServiceOptions
) {
  const { store, referenceResolver, catalogResolver } = options;

  /**
   * Server-derived authorization. Project identity and actor identity always come
   * from the caller's authenticated session; nothing in the payload can widen it.
   */
  async function authorize(input: {
    readonly actorUserId: string;
    readonly projectId: string;
  }): Promise<SchoolApplicationActorContext> {
    if (
      !(
        isSchoolApplicationUuid(input.actorUserId) &&
        isSchoolApplicationUuid(input.projectId)
      )
    ) {
      throw new SchoolApplicationError("invalid_request");
    }
    const context = await store.readActorContext({ ...input });
    if (context.staff || !context.registeredCustomer) {
      throw new SchoolApplicationError("actor_not_eligible");
    }
    if (!context.project) {
      throw new SchoolApplicationError("project_not_found");
    }
    const authorized =
      context.project.ownerUserId === input.actorUserId ||
      context.membershipStatus === "active_member";
    if (!authorized) {
      throw new SchoolApplicationError("project_forbidden");
    }
    return context;
  }

  function assertWritable(context: SchoolApplicationActorContext) {
    if (context.project?.status !== "active") {
      throw new SchoolApplicationError("project_closed");
    }
  }

  async function resolveTarget(fields: SchoolApplicationTargetFields) {
    const anyCatalogId = Boolean(
      fields.institutionId ||
        fields.courseId ||
        fields.deliveryId ||
        fields.intakeId
    );
    const resolution = anyCatalogId
      ? await catalogResolver.resolve({
          courseId: fields.courseId,
          deliveryId: fields.deliveryId,
          institutionId: fields.institutionId,
          intakeId: fields.intakeId,
        })
      : ({ status: "unresolved" } as const);
    const resolved = resolveSchoolApplicationTarget({ fields, resolution });
    return {
      catalogRecordClass: resolved.catalogRecordClass,
      catalogSnapshotToken: resolved.catalogSnapshotToken,
      fields: resolved.target,
      sourceStatus: resolved.sourceStatus,
    };
  }

  async function requireApplication(input: {
    readonly actorUserId: string;
    readonly projectId: string;
    readonly applicationId: string;
  }): Promise<SchoolApplicationRecord> {
    if (!isSchoolApplicationUuid(input.applicationId)) {
      throw new SchoolApplicationError("application_not_found");
    }
    const application = await store.getApplication({
      applicationId: input.applicationId,
      ownerUserId: input.actorUserId,
      projectId: input.projectId,
    });
    if (!application) {
      // Existence-hiding: another member's, another Project's or a staff-owned
      // application is indistinguishable from a missing one.
      throw new SchoolApplicationError("application_not_found");
    }
    return application;
  }

  async function resolveReferences(input: {
    readonly actorUserId: string;
    readonly projectId: string;
    readonly references: readonly SchoolApplicationReferenceRecord[];
  }): Promise<ResolvedReference[]> {
    const resolved: ResolvedReference[] = [];
    for (const record of input.references) {
      if (record.revokedAt) {
        continue;
      }
      const resolution = await referenceResolver.resolve({
        actorUserId: input.actorUserId,
        kind: record.kind,
        projectId: input.projectId,
        referenceId: record.referenceId,
      });
      if (resolution.status === "resolved") {
        resolved.push({
          available: true,
          changed:
            resolution.referenceSha256 !== record.referenceSha256 ||
            resolution.referenceVersion !== record.referenceVersion,
          record,
          referenceSha256: resolution.referenceSha256,
          referenceVersion: resolution.referenceVersion,
        });
      } else {
        resolved.push({
          available: false,
          changed: false,
          record,
          referenceSha256: record.referenceSha256,
          referenceVersion: record.referenceVersion,
        });
      }
    }
    return resolved;
  }

  function packageInputs(input: {
    readonly application: SchoolApplicationRecord;
    readonly references: readonly ResolvedReference[];
  }) {
    return {
      applicationId: input.application.id,
      applicationRevision: input.application.revision,
      catalogRecordClass: input.application.catalogRecordClass,
      catalogSnapshotToken: input.application.catalogSnapshotToken,
      missingDataCodes: schoolApplicationMissingDataCodes({
        intakeId: input.application.intakeId,
        intakeLabel: input.application.intakeLabel,
        referenceCount: input.references.length,
      }),
      projectId: input.application.projectId,
      references: input.references.map<SchoolApplicationPackageReference>(
        (reference) => ({
          kind: reference.record.kind,
          referenceId: reference.record.referenceId,
          referenceSha256: reference.referenceSha256,
          referenceVersion: reference.referenceVersion,
        })
      ),
      sourceStatus: input.application.sourceStatus,
      target: {
        courseId: input.application.courseId,
        courseTitle: input.application.courseTitle,
        deliveryId: input.application.deliveryId,
        institutionId: input.application.institutionId,
        institutionName: input.application.institutionName,
        intakeId: input.application.intakeId,
        intakeLabel: input.application.intakeLabel,
      },
    };
  }

  function packageView(
    record: SchoolApplicationPackageRecord,
    usability: SchoolApplicationPackageUsability,
    isCurrent: boolean
  ): SchoolApplicationPackageView {
    return {
      contentSha256: record.contentSha256,
      createdAt: toIso(record.createdAt),
      inputsSha256: record.inputsSha256,
      integrityVerified: verifySchoolApplicationPackageSnapshot(
        record.snapshot,
        record.contentSha256
      ),
      packageId: record.id,
      staleReasonCodes: isCurrent ? usability.reasonCodes : [],
      status: record.status,
      targetBindingSha256: record.targetBindingSha256,
      targetKind: record.targetKind,
      targetVersion: record.targetVersion,
      usable: isCurrent && usability.usable,
      verification: usability.verification,
      version: record.version,
    };
  }

  function referenceViews(
    records: readonly SchoolApplicationReferenceRecord[],
    resolved: readonly ResolvedReference[]
  ): SchoolApplicationReferenceView[] {
    const byId = new Map(resolved.map((entry) => [entry.record.id, entry]));
    return records.map((record) => {
      const entry = byId.get(record.id);
      return {
        available: entry?.available ?? false,
        boundAt: toIso(record.createdAt),
        changed: entry?.changed ?? false,
        kind: record.kind,
        referenceId: record.referenceId,
        referenceRecordId: record.id,
        referenceVersion: entry?.referenceVersion ?? record.referenceVersion,
        revokedAt: record.revokedAt ? toIso(record.revokedAt) : null,
      };
    });
  }

  function assembleView(input: {
    readonly application: SchoolApplicationRecord;
    readonly references: readonly SchoolApplicationReferenceRecord[];
    readonly resolved: readonly ResolvedReference[];
    readonly packages: readonly SchoolApplicationPackageRecord[];
  }): SchoolApplicationView {
    const current = input.packages.find((entry) => entry.status === "current");
    const inputs = packageInputs({
      application: input.application,
      references: input.resolved,
    });
    // One definition of usability for every read path and for package planning.
    const usability = schoolApplicationPackageUsability({
      applicationStatus: input.application.status,
      changedReferenceCount: input.resolved.filter((entry) => entry.changed)
        .length,
      currentInputsSha256: schoolApplicationInputsSha256(inputs),
      currentPackage: current
        ? { inputsSha256: current.inputsSha256, status: current.status }
        : null,
      unavailableReferenceCount: input.resolved.filter(
        (entry) => !entry.available
      ).length,
    });
    return {
      applicationId: input.application.id,
      archivedAt: input.application.archivedAt
        ? toIso(input.application.archivedAt)
        : null,
      course: {
        catalogId: input.application.courseId,
        title: input.application.courseTitle,
      },
      createdAt: toIso(input.application.createdAt),
      currentPackage: current ? packageView(current, usability, true) : null,
      deliveryId: input.application.deliveryId,
      disclosures: [...SCHOOL_APPLICATION_DISCLOSURE_CODES],
      institution: {
        catalogId: input.application.institutionId,
        catalogRecordClass: input.application.catalogRecordClass,
        catalogSnapshotToken: input.application.catalogSnapshotToken,
        name: input.application.institutionName,
      },
      intake: {
        id: input.application.intakeId,
        label: input.application.intakeLabel,
      },
      missingDataCodes: schoolApplicationMissingDataCodes({
        intakeId: input.application.intakeId,
        intakeLabel: input.application.intakeLabel,
        referenceCount: input.resolved.length,
      }),
      packageStale: Boolean(current) && !usability.usable,
      packageVerification: usability.verification,
      packages: [...input.packages]
        .sort((left, right) => right.version - left.version)
        .map((entry) =>
          packageView(entry, usability, entry.status === "current")
        ),
      projectId: input.application.projectId,
      references: referenceViews(input.references, input.resolved),
      revision: input.application.revision,
      source: {
        catalogRecordClass: input.application.catalogRecordClass,
        catalogSnapshotToken: input.application.catalogSnapshotToken,
        independentlyVerified: false,
        status: input.application.sourceStatus,
      },
      staleReasonCodes: [...usability.reasonCodes],
      status: input.application.status,
      updatedAt: toIso(input.application.updatedAt),
    };
  }

  async function loadDetail(input: {
    readonly actorUserId: string;
    readonly projectId: string;
    readonly application: SchoolApplicationRecord;
  }): Promise<SchoolApplicationDetailView> {
    const references = await store.listReferences({
      applicationId: input.application.id,
    });
    const packages = await store.listPackages({
      applicationId: input.application.id,
    });
    const events = await store.listEvents({
      applicationId: input.application.id,
    });
    const resolved = await resolveReferences({
      actorUserId: input.actorUserId,
      projectId: input.projectId,
      references,
    });
    return {
      ...assembleView({
        application: input.application,
        packages,
        references,
        resolved,
      }),
      events: events.map((event) => ({
        applicationRevision: event.applicationRevision,
        createdAt: toIso(event.createdAt),
        eventType: event.eventType,
        subjectId: event.subjectId,
        subjectKind: event.subjectKind,
      })),
    };
  }

  /**
   * Operation stamp. `requestSha256` is derived from the authored request
   * identity only, so an exact retry of the same logical request always matches
   * the recorded operation even after the application revision has advanced.
   */
  function operationStamp(input: {
    readonly actorUserId: string;
    readonly operationId: string;
    readonly identity: SchoolApplicationRequestIdentity;
  }) {
    return {
      actorUserId: input.actorUserId,
      operationId: validateSchoolApplicationOperationId(input.operationId),
      operationType: input.identity.operationType,
      requestSha256: schoolApplicationRequestSha256(input.identity),
    } as const;
  }

  /**
   * Exact-replay resolution that runs *before* state preconditions.
   *
   * A successful archive makes the application terminal, and a successful
   * revocation makes the reference inactive, so the ordinary preconditions would
   * reject a legitimate retry. The recorded operation is therefore consulted
   * first. Authorization has already run (actor role, Project status, active
   * membership and existence-hiding ownership), so idempotency can never bypass a
   * revoked membership or a foreign application.
   */
  async function replayRecorded(input: {
    readonly application: SchoolApplicationRecord | null;
    readonly actorUserId: string;
    readonly identity: SchoolApplicationRequestIdentity;
    readonly operationId: string;
    readonly projectId: string;
  }): Promise<SchoolApplicationDetailView | null> {
    const stamp = operationStamp({
      actorUserId: input.actorUserId,
      identity: input.identity,
      operationId: input.operationId,
    });
    const lookup = await store.findOperation({ ...stamp });
    if (lookup.status === "absent") {
      return null;
    }
    if (lookup.status === "conflict") {
      // Same operationId, materially different request.
      throw new SchoolApplicationError("idempotency_conflict");
    }
    const application =
      input.application ??
      (await store.getApplication({
        applicationId: lookup.resultId,
        ownerUserId: input.actorUserId,
        projectId: input.projectId,
      }));
    if (!application) {
      throw new SchoolApplicationError("application_not_found");
    }
    return await loadDetail({
      actorUserId: input.actorUserId,
      application,
      projectId: input.projectId,
    });
  }

  return {
    /** Customer-visible list of the actor's own applications in this Project. */
    async list(input: {
      readonly actorUserId: string;
      readonly projectId: string;
    }): Promise<readonly SchoolApplicationView[]> {
      await authorize(input);
      const applications = await store.listApplications({
        ownerUserId: input.actorUserId,
        projectId: input.projectId,
      });
      const views: SchoolApplicationView[] = [];
      for (const application of applications) {
        const references = await store.listReferences({
          applicationId: application.id,
        });
        const packages = await store.listPackages({
          applicationId: application.id,
        });
        // The list performs the same live M2 verification as the detail read so a
        // package can never look usable in one view and stale in another.
        const resolved = await resolveReferences({
          actorUserId: input.actorUserId,
          projectId: input.projectId,
          references,
        });
        views.push(
          assembleView({
            application,
            packages,
            references,
            resolved,
          })
        );
      }
      return views;
    },

    async get(input: {
      readonly actorUserId: string;
      readonly projectId: string;
      readonly applicationId: string;
    }): Promise<SchoolApplicationDetailView> {
      await authorize(input);
      const application = await requireApplication(input);
      return await loadDetail({
        actorUserId: input.actorUserId,
        application,
        projectId: input.projectId,
      });
    },

    async create(
      input: {
        readonly actorUserId: string;
        readonly projectId: string;
        readonly operationId: string;
      } & SchoolApplicationTargetRequest
    ): Promise<{
      readonly application: SchoolApplicationDetailView;
      readonly replayed: boolean;
    }> {
      const context = await authorize(input);
      assertWritable(context);
      // Request identity uses the *authored* fields only, so an exact retry is
      // recognized even if the M3 catalog classification changed in between.
      const fields = targetFields(input);
      const identity = {
        operationType: "school_application_create",
        projectId: input.projectId,
        target: fields,
      } as const;
      const replayedDetail = await replayRecorded({
        actorUserId: input.actorUserId,
        application: null,
        identity,
        operationId: input.operationId,
        projectId: input.projectId,
      });
      if (replayedDetail) {
        return { application: replayedDetail, replayed: true };
      }
      // The per-Project bound is enforced inside the store transaction, after any
      // idempotent replay has been resolved, so a retry never fails on the bound.
      const resolved = await resolveTarget(fields);
      const values = {
        catalogRecordClass: resolved.catalogRecordClass,
        catalogSnapshotToken: resolved.catalogSnapshotToken,
        courseId: resolved.fields.courseId,
        courseTitle: resolved.fields.courseTitle,
        deliveryId: resolved.fields.deliveryId,
        institutionId: resolved.fields.institutionId,
        institutionName: resolved.fields.institutionName,
        intakeId: resolved.fields.intakeId,
        intakeLabel: resolved.fields.intakeLabel,
        ownerUserId: input.actorUserId,
        sourceStatus: resolved.sourceStatus,
      };
      const result = await store.createApplication({
        operation: operationStamp({
          actorUserId: input.actorUserId,
          identity,
          operationId: input.operationId,
        }),
        projectId: input.projectId,
        values,
      });
      return {
        application: await loadDetail({
          actorUserId: input.actorUserId,
          application: result.value,
          projectId: input.projectId,
        }),
        replayed: result.replayed,
      };
    },

    async update(
      input: {
        readonly actorUserId: string;
        readonly projectId: string;
        readonly applicationId: string;
        readonly expectedRevision: number;
        readonly operationId: string;
      } & SchoolApplicationTargetRequest
    ): Promise<{
      readonly application: SchoolApplicationDetailView;
      readonly replayed: boolean;
    }> {
      const context = await authorize(input);
      assertWritable(context);
      const application = await requireApplication(input);
      const expectedRevision = validateSchoolApplicationRevision(
        input.expectedRevision
      );
      const fields = targetFields(input);
      const identity = {
        applicationId: application.id,
        expectedRevision,
        operationType: "school_application_update",
        projectId: input.projectId,
        target: fields,
      } as const;
      const replayedDetail = await replayRecorded({
        actorUserId: input.actorUserId,
        application,
        identity,
        operationId: input.operationId,
        projectId: input.projectId,
      });
      if (replayedDetail) {
        return { application: replayedDetail, replayed: true };
      }
      if (!schoolApplicationActionAllowed(application.status, "update")) {
        throw new SchoolApplicationError("state_conflict");
      }
      const resolved = await resolveTarget(fields);
      const values = {
        catalogRecordClass: resolved.catalogRecordClass,
        catalogSnapshotToken: resolved.catalogSnapshotToken,
        courseId: resolved.fields.courseId,
        courseTitle: resolved.fields.courseTitle,
        deliveryId: resolved.fields.deliveryId,
        institutionId: resolved.fields.institutionId,
        institutionName: resolved.fields.institutionName,
        intakeId: resolved.fields.intakeId,
        intakeLabel: resolved.fields.intakeLabel,
        ownerUserId: input.actorUserId,
        sourceStatus: resolved.sourceStatus,
      };
      const result = await store.updateApplication({
        applicationId: application.id,
        expectedRevision,
        operation: operationStamp({
          actorUserId: input.actorUserId,
          identity,
          operationId: input.operationId,
        }),
        ownerUserId: input.actorUserId,
        projectId: input.projectId,
        values,
      });
      return {
        application: await loadDetail({
          actorUserId: input.actorUserId,
          application: result.value,
          projectId: input.projectId,
        }),
        replayed: result.replayed,
      };
    },

    async archive(input: {
      readonly actorUserId: string;
      readonly projectId: string;
      readonly applicationId: string;
      readonly expectedRevision: number;
      readonly operationId: string;
    }): Promise<{
      readonly application: SchoolApplicationDetailView;
      readonly replayed: boolean;
    }> {
      const context = await authorize(input);
      assertWritable(context);
      const application = await requireApplication(input);
      const expectedRevision = validateSchoolApplicationRevision(
        input.expectedRevision
      );
      const identity = {
        applicationId: application.id,
        expectedRevision,
        operationType: "school_application_archive",
        projectId: input.projectId,
      } as const;
      // An archived application is terminal, so the recorded operation must be
      // resolved before the terminal check: an exact retry returns the recorded
      // result and creates no second event.
      const replayedDetail = await replayRecorded({
        actorUserId: input.actorUserId,
        application,
        identity,
        operationId: input.operationId,
        projectId: input.projectId,
      });
      if (replayedDetail) {
        return { application: replayedDetail, replayed: true };
      }
      if (!schoolApplicationActionAllowed(application.status, "archive")) {
        throw new SchoolApplicationError("state_conflict");
      }
      const result = await store.archiveApplication({
        applicationId: application.id,
        expectedRevision,
        operation: operationStamp({
          actorUserId: input.actorUserId,
          identity,
          operationId: input.operationId,
        }),
        ownerUserId: input.actorUserId,
        projectId: input.projectId,
      });
      return {
        application: await loadDetail({
          actorUserId: input.actorUserId,
          application: result.value,
          projectId: input.projectId,
        }),
        replayed: result.replayed,
      };
    },

    async bindReference(input: {
      readonly actorUserId: string;
      readonly projectId: string;
      readonly applicationId: string;
      readonly expectedRevision: number;
      readonly operationId: string;
      readonly kind: SchoolApplicationReferenceKind;
      readonly referenceId: string;
    }): Promise<{
      readonly application: SchoolApplicationDetailView;
      readonly replayed: boolean;
    }> {
      const context = await authorize(input);
      assertWritable(context);
      const application = await requireApplication(input);
      if (
        !(
          isSchoolApplicationReferenceKind(input.kind) &&
          isSchoolApplicationUuid(input.referenceId)
        )
      ) {
        throw new SchoolApplicationError("invalid_request");
      }
      const expectedRevision = validateSchoolApplicationRevision(
        input.expectedRevision
      );
      const identity = {
        applicationId: application.id,
        expectedRevision,
        kind: input.kind,
        operationType: "school_application_reference_bind",
        projectId: input.projectId,
        referenceId: input.referenceId,
      } as const;
      const replayedDetail = await replayRecorded({
        actorUserId: input.actorUserId,
        application,
        identity,
        operationId: input.operationId,
        projectId: input.projectId,
      });
      if (replayedDetail) {
        return { application: replayedDetail, replayed: true };
      }
      if (
        !schoolApplicationActionAllowed(application.status, "reference_bind")
      ) {
        throw new SchoolApplicationError("state_conflict");
      }
      const existing = await store.listReferences({
        applicationId: application.id,
      });
      const active = existing.filter((reference) => !reference.revokedAt);
      const alreadyBound = active.some(
        (reference) =>
          reference.kind === input.kind &&
          reference.referenceId === input.referenceId
      );
      if (!alreadyBound && active.length >= SCHOOL_APPLICATION_MAX_REFERENCES) {
        throw new SchoolApplicationError("limit_exceeded");
      }
      // The resolver applies the caller's own M2 ownership and Project rules and
      // returns only an identity fingerprint — never fact, requirement or
      // document content. A reference is not an AI-use or staff-disclosure grant.
      const resolution = await referenceResolver.resolve({
        actorUserId: input.actorUserId,
        kind: input.kind,
        projectId: input.projectId,
        referenceId: input.referenceId,
      });
      if (resolution.status !== "resolved") {
        throw new SchoolApplicationError("reference_invalid");
      }
      const result = await store.bindReference({
        applicationId: application.id,
        expectedRevision,
        kind: input.kind,
        operation: operationStamp({
          actorUserId: input.actorUserId,
          identity,
          operationId: input.operationId,
        }),
        ownerUserId: input.actorUserId,
        projectId: input.projectId,
        referenceId: input.referenceId,
        referenceSha256: resolution.referenceSha256,
        referenceVersion: resolution.referenceVersion,
      });
      return {
        application: await loadDetail({
          actorUserId: input.actorUserId,
          application: await requireApplication(input),
          projectId: input.projectId,
        }),
        replayed: result.replayed,
      };
    },

    async revokeReference(input: {
      readonly actorUserId: string;
      readonly projectId: string;
      readonly applicationId: string;
      readonly referenceRecordId: string;
      readonly expectedRevision: number;
      readonly operationId: string;
    }): Promise<{
      readonly application: SchoolApplicationDetailView;
      readonly replayed: boolean;
    }> {
      const context = await authorize(input);
      assertWritable(context);
      const application = await requireApplication(input);
      if (!isSchoolApplicationUuid(input.referenceRecordId)) {
        throw new SchoolApplicationError("invalid_request");
      }
      const expectedRevision = validateSchoolApplicationRevision(
        input.expectedRevision
      );
      const identity = {
        applicationId: application.id,
        expectedRevision,
        operationType: "school_application_reference_revoke",
        projectId: input.projectId,
        referenceRecordId: input.referenceRecordId,
      } as const;
      // Revocation is final, so a successful revocation makes the reference
      // inactive. Resolve an exact retry before the "still active" check.
      const replayedDetail = await replayRecorded({
        actorUserId: input.actorUserId,
        application,
        identity,
        operationId: input.operationId,
        projectId: input.projectId,
      });
      if (replayedDetail) {
        return { application: replayedDetail, replayed: true };
      }
      if (
        !schoolApplicationActionAllowed(application.status, "reference_bind")
      ) {
        throw new SchoolApplicationError("state_conflict");
      }
      const references = await store.listReferences({
        applicationId: application.id,
      });
      const target = references.find(
        (reference) =>
          reference.id === input.referenceRecordId &&
          reference.revokedAt === null
      );
      if (!target) {
        throw new SchoolApplicationError("reference_invalid");
      }
      const result = await store.revokeReference({
        applicationId: application.id,
        expectedRevision,
        operation: operationStamp({
          actorUserId: input.actorUserId,
          identity,
          operationId: input.operationId,
        }),
        ownerUserId: input.actorUserId,
        projectId: input.projectId,
        referenceRecordId: input.referenceRecordId,
      });
      return {
        application: await loadDetail({
          actorUserId: input.actorUserId,
          application: await requireApplication(input),
          projectId: input.projectId,
        }),
        replayed: result.replayed,
      };
    },

    /**
     * Builds one immutable preparation package. A package never implies
     * submission, admission, offer, CoE, payment confirmation or professional
     * review: those statuses are frozen literals inside the snapshot.
     */
    async buildPackage(input: {
      readonly actorUserId: string;
      readonly projectId: string;
      readonly applicationId: string;
      readonly expectedRevision: number;
      readonly operationId: string;
    }): Promise<{
      readonly application: SchoolApplicationDetailView;
      readonly package: SchoolApplicationPackageView;
      readonly replayed: boolean;
      readonly reusedCurrentPackage: boolean;
    }> {
      const context = await authorize(input);
      assertWritable(context);
      const application = await requireApplication(input);
      const expectedRevision = validateSchoolApplicationRevision(
        input.expectedRevision
      );
      const identity = {
        applicationId: application.id,
        expectedRevision,
        operationType: "school_application_package_build",
        projectId: input.projectId,
      } as const;
      const replayedDetail = await replayRecorded({
        actorUserId: input.actorUserId,
        application,
        identity,
        operationId: input.operationId,
        projectId: input.projectId,
      });
      if (replayedDetail) {
        const replayedPackage =
          replayedDetail.currentPackage ??
          replayedDetail.packages.find((entry) => entry.usable) ??
          replayedDetail.packages[0];
        if (!replayedPackage) {
          throw new SchoolApplicationError("integrity_conflict");
        }
        return {
          application: replayedDetail,
          package: replayedPackage,
          replayed: true,
          reusedCurrentPackage: false,
        };
      }
      if (
        !schoolApplicationActionAllowed(application.status, "package_build")
      ) {
        throw new SchoolApplicationError("state_conflict");
      }
      const references = await store.listReferences({
        applicationId: application.id,
      });
      const resolved = await resolveReferences({
        actorUserId: input.actorUserId,
        projectId: input.projectId,
        references,
      });
      if (resolved.some((reference) => !reference.available)) {
        // Never build a package that silently drops an input the customer
        // believes is included, or that relies on access the actor has lost.
        throw new SchoolApplicationError("reference_unavailable");
      }
      const packages = await store.listPackages({
        applicationId: application.id,
      });
      const current = packages.find((entry) => entry.status === "current");
      const inputs = packageInputs({ application, references: resolved });
      const inputsSha256 = schoolApplicationInputsSha256(inputs);
      // Package planning consumes the same usability decision the read paths use,
      // so an unusable current package is never "reused" as if it were valid.
      const usability = schoolApplicationPackageUsability({
        applicationStatus: application.status,
        changedReferenceCount: resolved.filter((reference) => reference.changed)
          .length,
        currentInputsSha256: inputsSha256,
        currentPackage: current
          ? { inputsSha256: current.inputsSha256, status: current.status }
          : null,
        unavailableReferenceCount: 0,
      });
      const highestVersion = packages.reduce(
        (highest, entry) => Math.max(highest, entry.version),
        0
      );
      const plan = planSchoolApplicationPackageBuild({
        currentPackage:
          current && usability.usable
            ? { inputsSha256: current.inputsSha256, version: current.version }
            : null,
        highestVersion,
        inputsSha256,
      });
      const built = buildSchoolApplicationPackage({
        inputs,
        packageVersion: plan.version,
      });
      const result = await store.buildPackage({
        applicationId: application.id,
        expectedRevision,
        operation: operationStamp({
          actorUserId: input.actorUserId,
          identity,
          operationId: input.operationId,
        }),
        ownerUserId: input.actorUserId,
        package: built,
        projectId: input.projectId,
        references: resolved.map((reference) => ({
          referenceRecordId: reference.record.id,
          referenceSha256: reference.referenceSha256,
          referenceVersion: reference.referenceVersion,
        })),
      });
      const refreshed = await requireApplication(input);
      const detail = await loadDetail({
        actorUserId: input.actorUserId,
        application: refreshed,
        projectId: input.projectId,
      });
      // The returned package view is taken from the same usability computation the
      // detail read uses, so the build response cannot disagree with a later read.
      const builtView =
        detail.packages.find((entry) => entry.packageId === result.value.id) ??
        packageView(
          result.value,
          { reasonCodes: [], usable: false, verification: "live_references" },
          false
        );
      return {
        application: detail,
        package: builtView,
        replayed: result.replayed,
        reusedCurrentPackage: plan.kind === "reuse_current",
      };
    },

    /**
     * Read the immutable packages. Only metadata is returned; a snapshot is
     * exposed only while the package is genuinely usable, so an API read can
     * never hand out stale or unauthorized inputs as if they were current.
     */
    async listPackages(input: {
      readonly actorUserId: string;
      readonly projectId: string;
      readonly applicationId: string;
    }): Promise<{
      readonly packages: readonly SchoolApplicationPackageView[];
      readonly currentPackage: SchoolApplicationPackageView | null;
      readonly currentSnapshot: unknown | null;
      readonly snapshotUnavailableReasonCodes: readonly SchoolApplicationStaleReasonCode[];
    }> {
      await authorize(input);
      const application = await requireApplication(input);
      const references = await store.listReferences({
        applicationId: application.id,
      });
      const packages = await store.listPackages({
        applicationId: application.id,
      });
      const resolved = await resolveReferences({
        actorUserId: input.actorUserId,
        projectId: input.projectId,
        references,
      });
      const view = assembleView({
        application,
        packages,
        references,
        resolved,
      });
      const currentRecord = packages.find(
        (entry) => entry.status === "current"
      );
      return {
        currentPackage: view.currentPackage,
        currentSnapshot:
          view.currentPackage?.usable === true
            ? (currentRecord?.snapshot ?? null)
            : null,
        packages: view.packages,
        snapshotUnavailableReasonCodes: view.currentPackage?.usable
          ? []
          : [...view.staleReasonCodes],
      };
    },
  };
}

export type SchoolApplicationService = ReturnType<
  typeof createSchoolApplicationService
>;
