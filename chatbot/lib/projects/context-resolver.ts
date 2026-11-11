import "server-only";

import { projectFoundationRepository } from "@/lib/db/project-foundation";
import { projectFoundationSchemaStatus } from "@/lib/db/project-foundation-schema-availability";
import { getLazyDatabase } from "@/lib/db/runtime-client";
import { createDatabaseProjectFactEvidenceVerifier } from "@/lib/project-documents/fact-capabilities";
import { createProjectFactManagementService } from "@/lib/project-facts/facts";
import { PostgresProjectFactRepository } from "@/lib/project-facts/postgres-repository";
import { projectChatWritesEnabled } from "./chat-policy";
import {
  type AuthorizedProjectDocumentEvidence,
  buildProjectContextPacket,
  mapProjectFactAssertion,
  type ProjectContextPacket,
} from "./project-context";
import {
  collectVerifiedFactEvidenceRefs,
  type ProjectEvidenceRefValidator,
} from "./project-fact-evidence";

export class ProjectContextResolutionError extends Error {
  readonly code = "project_context_unavailable";
  constructor() {
    super("Project context is unavailable.");
    this.name = "ProjectContextResolutionError";
  }
}

export type ResolvedProjectContext = {
  projectId: string | null;
  packet: ProjectContextPacket | null;
  /** Re-resolves all Project authority and content permissions before provider submission. */
  refreshBeforeProvider(): Promise<ProjectContextPacket | null>;
  diagnostic:
    | "standalone"
    | "feature_disabled"
    | "no_authorized_content"
    | "document_context_unavailable";
};

type Dependencies = {
  schemaStatus: typeof projectFoundationSchemaStatus;
  getOrigin: typeof projectFoundationRepository.getProjectChatOrigin;
  authorize: typeof projectFoundationRepository.authorizeProjectAccess;
  projectChatEnabled: typeof projectChatWritesEnabled;
  contextEnabled: () => boolean;
  stableFacts: (input: { actorUserId: string; projectId: string }) => Promise<{
    authorizedForAI: ReturnType<typeof mapProjectFactAssertion>[];
    available: boolean;
  }>;
  /**
   * Phase 14-B: independently re-validates a Project Fact's source evidence reference for
   * this request. Absent from a composition means every document-extracted fact is
   * excluded (fail closed) rather than trusted on the strength of a stored string.
   */
  verifyEvidenceRef?: ProjectEvidenceRefValidator;
  /** Explicit trust capability; absent from production composition until an accepted issuer exists. */
  resolveTrustedAIContextEvidence?: (input: {
    actorUserId: string;
    projectId: string;
  }) => Promise<AuthorizedProjectDocumentEvidence[]>;
};

const productionDependencies = (): Dependencies => {
  /**
   * R1 (composition): the SQL repository enforces its own evidence gate during candidate
   * creation/confirmation, and `stableProjection` filters on it too. Both layers therefore
   * get the same deterministic, proof-checked verifier; without an approved scan-attestation
   * provider it fails closed for every document-derived fact.
   */
  const database = getLazyDatabase();
  const verifyEvidence = createDatabaseProjectFactEvidenceVerifier({
    database,
  });
  const factService = createProjectFactManagementService({
    repository: new PostgresProjectFactRepository(database, verifyEvidence),
    verifyEvidence,
  });
  /**
   * Phase 14-B: Project Fact source verification is injected, never imported here, so the
   * Project Document trust boundary stays encapsulated in `lib/project-documents` (an
   * existing architectural guard enforces that). While no composition supplies
   * `verifyEvidenceRef`, every `document_extracted` fact is excluded from the provider
   * packet (fail closed), which is the current production state: the Project Document
   * runtime is `application: null` / `trustedLiveReadiness: false`, so no Project
   * document evidence is producible at all. Customer-stated facts are unaffected.
   */
  return {
    schemaStatus: projectFoundationSchemaStatus,
    getOrigin: projectFoundationRepository.getProjectChatOrigin.bind(
      projectFoundationRepository
    ),
    authorize: projectFoundationRepository.authorizeProjectAccess.bind(
      projectFoundationRepository
    ),
    projectChatEnabled: projectChatWritesEnabled,
    contextEnabled: () =>
      process.env.PHASE13_PROJECT_CONTEXT_ENABLED === "true",
    stableFacts: async (input) => {
      const projection = await factService.stableProjection(input);
      return {
        ...projection,
        authorizedForAI: projection.authorizedForAI.map(
          mapProjectFactAssertion
        ),
      };
    },
    /**
     * R1 (composition gap): the packet-level revalidation must use the same proof-checked
     * capability. This field was previously missing here, so document-derived facts were
     * dropped before the packet builder ever saw them.
     */
    verifyEvidenceRef: verifyEvidence,
  };
};

/** Resolve only from authenticated identity plus the exact persisted Chat association. */
export async function resolveProjectContext(input: {
  actorUserId: string;
  chatId: string;
  dependencies?: Dependencies;
}): Promise<ResolvedProjectContext> {
  const deps = input.dependencies ?? productionDependencies();
  let schema: Awaited<ReturnType<Dependencies["schemaStatus"]>>;
  try {
    schema = await deps.schemaStatus();
  } catch {
    throw new ProjectContextResolutionError();
  }
  if (schema === "partial") {
    throw new ProjectContextResolutionError();
  }
  if (schema === "absent") {
    if (deps.projectChatEnabled()) {
      throw new ProjectContextResolutionError();
    }
    return {
      projectId: null,
      packet: null,
      diagnostic: "standalone",
      async refreshBeforeProvider() {
        const fresh = await resolveProjectContext({
          actorUserId: input.actorUserId,
          chatId: input.chatId,
          dependencies: deps,
        });
        if (fresh.projectId !== null) {
          throw new ProjectContextResolutionError();
        }
        return null;
      },
    };
  }
  let origin: { projectId: string } | null;
  try {
    origin = await deps.getOrigin(input.chatId);
  } catch {
    throw new ProjectContextResolutionError();
  }
  if (!origin) {
    return {
      projectId: null,
      packet: null,
      diagnostic: "standalone",
      async refreshBeforeProvider() {
        const fresh = await resolveProjectContext({
          actorUserId: input.actorUserId,
          chatId: input.chatId,
          dependencies: deps,
        });
        if (fresh.projectId !== null) {
          throw new ProjectContextResolutionError();
        }
        return null;
      },
    };
  }
  if (!deps.projectChatEnabled()) {
    throw new ProjectContextResolutionError();
  }
  const authorize = async () => {
    const [read, write] = await Promise.all([
      deps.authorize({
        actorUserId: input.actorUserId,
        projectId: origin.projectId,
        intent: "chat_history",
        chatId: input.chatId,
      }),
      deps.authorize({
        actorUserId: input.actorUserId,
        projectId: origin.projectId,
        intent: "project_write",
      }),
    ]);
    if (
      read.id !== origin.projectId ||
      write.id !== origin.projectId ||
      write.status !== "active"
    ) {
      throw new ProjectContextResolutionError();
    }
    const current = await deps.getOrigin(input.chatId);
    if (!current || current.projectId !== origin.projectId) {
      throw new ProjectContextResolutionError();
    }
  };
  try {
    await authorize();
  } catch {
    throw new ProjectContextResolutionError();
  }
  let packet: ProjectContextPacket | null = null;
  let diagnostic: ResolvedProjectContext["diagnostic"] = "feature_disabled";
  if (deps.contextEnabled()) {
    try {
      const facts = await deps.stableFacts({
        actorUserId: input.actorUserId,
        projectId: origin.projectId,
      });
      const documentEvidence = deps.resolveTrustedAIContextEvidence
        ? await deps.resolveTrustedAIContextEvidence({
            actorUserId: input.actorUserId,
            projectId: origin.projectId,
          })
        : [];
      /**
       * Phase 14-B: a confirmed fact is validated against its own evidence reference,
       * independently of which excerpts fit into this turn's prompt budget. Previously a
       * document-extracted fact disappeared whenever its excerpt was not one of the ≤4
       * selected snippets, so the same fact was "known" in one Chat and lost in the next.
       *
       * R1: the verifier comes from the injected dependencies (production composes the
       * proof-checked Project Document capability) — never from an ambient registry. When it
       * is absent the set stays empty and document-extracted facts remain excluded.
       */
      const validator = deps.verifyEvidenceRef;
      const verifiedEvidenceRefs = validator
        ? await collectVerifiedFactEvidenceRefs({
            actorUserId: input.actorUserId,
            projectId: origin.projectId,
            refs: facts.authorizedForAI.map((fact) => fact.sourceEvidenceRef),
            validate: validator,
          })
        : new Set<string>();
      packet = buildProjectContextPacket({
        projectId: origin.projectId,
        facts: facts.authorizedForAI,
        documentEvidence,
        verifiedEvidenceRefs,
      });
      // Facts can be present while Project document evidence remains blocked.
      // Keep this typed diagnostic internal to the server resolver.
      diagnostic = "document_context_unavailable";
    } catch {
      throw new ProjectContextResolutionError();
    }
  }
  try {
    await authorize();
  } catch {
    throw new ProjectContextResolutionError();
  }
  return {
    projectId: origin.projectId,
    packet:
      packet &&
      (packet.confirmedProjectFacts.length || packet.documentEvidence.length)
        ? packet
        : null,
    diagnostic,
    refreshBeforeProvider: async () => {
      const fresh = await resolveProjectContext({
        actorUserId: input.actorUserId,
        chatId: input.chatId,
        dependencies: deps,
      });
      if (fresh.projectId !== origin.projectId) {
        throw new ProjectContextResolutionError();
      }
      return fresh.packet;
    },
  };
}
