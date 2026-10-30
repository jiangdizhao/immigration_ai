// biome-ignore-all lint/suspicious/useAwait: adapter methods are asynchronous by contract.
/**
 * Phase 13 M5.3 — shared M2/M3 test authorities.
 *
 * The M5.1 application service and the M5.2 admission service must read the same
 * M2 reference identity and the same M3 catalog classification. These registries
 * are the single source of truth for both, so a revocation or a catalog change is
 * observed identically by each module instead of being duplicated into two
 * divergent fixture maps.
 *
 * Only genuine external dependencies live here (M2 Project facts/documents/
 * requirements and the M3 education catalog). No M5.1↔M5.2 boundary is faked.
 */
import type {
  SchoolApplicationCatalogRecordClass,
  SchoolApplicationReferenceKind,
} from "../school-applications/contracts";
import type {
  SchoolApplicationCatalogResolver,
  SchoolApplicationReferenceResolver,
} from "../school-applications/ports";

export type M2ReferenceKind = SchoolApplicationReferenceKind;

type M2ReferenceRecord = {
  projectId: string;
  kind: M2ReferenceKind;
  referenceId: string;
  ownerUserId: string;
  version: number;
  sha256: string;
  available: boolean;
  revoked: boolean;
};

export type M2ReferenceRegistry = {
  /** M5.1 reference port (authorization + freshness). */
  readonly resolver: SchoolApplicationReferenceResolver;
  seed(input: {
    projectId: string;
    kind: M2ReferenceKind;
    referenceId: string;
    ownerUserId: string;
    version: number;
    sha256: string;
    available?: boolean;
  }): void;
  /** Commits an M2-side change outside any M5 transaction. */
  setAvailable(input: {
    referenceId: string;
    available: boolean;
    version?: number;
    sha256?: string;
  }): void;
  revoke(input: { referenceId: string }): void;
  /** M5.2 evidence port view: identity/freshness only, never content. */
  identity(input: {
    projectId: string;
    kind: M2ReferenceKind;
    referenceId: string;
    actorUserId: string;
  }):
    | {
        status: "resolved";
        referenceVersion: number;
        referenceSha256: string;
      }
    | { status: "not_found" }
    | { status: "forbidden" }
    | { status: "unavailable" };
  record(referenceId: string): M2ReferenceRecord | null;
};

export function createM2ReferenceRegistry(): M2ReferenceRegistry {
  const records = new Map<string, M2ReferenceRecord>();

  function lookup(referenceId: string): M2ReferenceRecord | null {
    for (const record of records.values()) {
      if (record.referenceId === referenceId) {
        return record;
      }
    }
    return null;
  }

  return {
    resolver: {
      async resolve(input) {
        const record = lookup(input.referenceId);
        if (!record) {
          return { status: "not_found" as const };
        }
        if (
          record.projectId !== input.projectId ||
          record.kind !== input.kind ||
          record.ownerUserId !== input.actorUserId
        ) {
          // Existence-hiding: another member's or another Project's reference is
          // indistinguishable from an absent one at this port.
          return { status: "not_found" as const };
        }
        if (!record.available || record.revoked) {
          return { status: "not_found" as const };
        }
        return {
          referenceSha256: record.sha256,
          referenceVersion: record.version,
          status: "resolved" as const,
        };
      },
    },
    identity(input) {
      const record = lookup(input.referenceId);
      if (!record || record.kind !== input.kind) {
        return { status: "not_found" as const };
      }
      if (
        record.projectId !== input.projectId ||
        record.ownerUserId !== input.actorUserId
      ) {
        return { status: "forbidden" as const };
      }
      if (record.revoked || !record.available) {
        return { status: "unavailable" as const };
      }
      return {
        referenceSha256: record.sha256,
        referenceVersion: record.version,
        status: "resolved" as const,
      };
    },
    record(referenceId) {
      return lookup(referenceId);
    },
    seed(input) {
      records.set(`${input.projectId}:${input.kind}:${input.referenceId}`, {
        available: input.available ?? true,
        kind: input.kind,
        ownerUserId: input.ownerUserId,
        projectId: input.projectId,
        referenceId: input.referenceId,
        revoked: false,
        sha256: input.sha256,
        version: input.version,
      });
    },
    setAvailable(input) {
      const record = lookup(input.referenceId);
      if (!record) {
        throw new Error(`unknown M2 reference ${input.referenceId}`);
      }
      record.available = input.available;
      if (input.version !== undefined) {
        record.version = input.version;
      }
      if (input.sha256 !== undefined) {
        record.sha256 = input.sha256;
      }
    },
    revoke(input) {
      const record = lookup(input.referenceId);
      if (!record) {
        throw new Error(`unknown M2 reference ${input.referenceId}`);
      }
      record.revoked = true;
    },
  };
}

export type M3CatalogEntry = {
  institutionId: string;
  institutionName: string;
  courseId: string;
  courseTitle: string;
  deliveryId: string | null;
  intakeId: string | null;
  intakeLabel: string | null;
  recordClass: SchoolApplicationCatalogRecordClass;
  snapshotToken: string | null;
};

export type M3CatalogRegistry = {
  readonly resolver: SchoolApplicationCatalogResolver;
  seed(entry: M3CatalogEntry): void;
  /** Commits an M3-side relabel outside any M5 transaction. */
  relabel(input: {
    courseId: string;
    courseTitle: string;
    snapshotToken: string | null;
    recordClass?: M3CatalogEntry["recordClass"];
  }): void;
  entry(courseId: string): M3CatalogEntry | null;
  offline(offline: boolean): void;
};

export function createM3CatalogRegistry(): M3CatalogRegistry {
  const entries = new Map<string, M3CatalogEntry>();
  let unavailable = false;

  return {
    resolver: {
      async resolve(input) {
        if (unavailable) {
          return { status: "unavailable" as const };
        }
        const entry = input.courseId ? entries.get(input.courseId) : undefined;
        if (!entry) {
          return { status: "unresolved" as const };
        }
        if (
          input.institutionId &&
          entry.institutionId !== input.institutionId
        ) {
          return { status: "unresolved" as const };
        }
        return {
          courseId: entry.courseId,
          courseTitle: entry.courseTitle,
          deliveryId: entry.deliveryId,
          institutionId: entry.institutionId,
          institutionName: entry.institutionName,
          intakeId: entry.intakeId,
          intakeLabel: entry.intakeLabel,
          recordClass: entry.recordClass,
          snapshotToken: entry.snapshotToken,
          status: "resolved" as const,
        };
      },
    },
    entry(courseId) {
      return entries.get(courseId) ?? null;
    },
    offline(next) {
      unavailable = next;
    },
    relabel(input) {
      const entry = entries.get(input.courseId);
      if (!entry) {
        throw new Error(`unknown M3 course ${input.courseId}`);
      }
      entry.courseTitle = input.courseTitle;
      entry.snapshotToken = input.snapshotToken;
      if (input.recordClass) {
        entry.recordClass = input.recordClass;
      }
    },
    seed(entry) {
      entries.set(entry.courseId, entry);
    },
  };
}
