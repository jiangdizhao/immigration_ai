import "server-only";

import { projectFoundationRepository } from "@/lib/db/project-foundation";
import { projectFoundationSchemaStatus } from "@/lib/db/project-foundation-schema-availability";
import { getLazyDatabase } from "@/lib/db/runtime-client";
import { createProjectFactManagementService } from "@/lib/project-facts/facts";
import { PostgresProjectFactRepository } from "@/lib/project-facts/postgres-repository";
import { projectChatWritesEnabled } from "./chat-policy";
import {
  type AuthorizedProjectDocumentEvidence,
  buildProjectContextPacket,
  mapProjectFactAssertion,
  type ProjectContextPacket,
} from "./project-context";

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
  /** Explicit trust capability; absent from production composition until an accepted issuer exists. */
  resolveTrustedAIContextEvidence?: (input: {
    actorUserId: string;
    projectId: string;
  }) => Promise<AuthorizedProjectDocumentEvidence[]>;
};

const productionDependencies = (): Dependencies => {
  const factService = createProjectFactManagementService({
    repository: new PostgresProjectFactRepository(getLazyDatabase()),
  });
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
      packet = buildProjectContextPacket({
        projectId: origin.projectId,
        facts: facts.authorizedForAI,
        documentEvidence,
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
