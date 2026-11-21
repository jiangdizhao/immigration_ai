import { PROJECT_STATE_MAX_RESPONSE_BYTES } from "./project-state";
import type { ProjectStateLoadResult } from "./project-state-server";

export type ProjectStateHttpActor = {
  userId: string;
  type?: string;
};

export function createProjectStateHttpHandler(deps: {
  authenticate: () => Promise<ProjectStateHttpActor | null>;
  loadForActor: (input: {
    actorUserId: string;
    actorType: "guest" | "regular";
    projectId: string;
  }) => Promise<ProjectStateLoadResult>;
}) {
  return async function handle(projectId: string): Promise<Response> {
    const actor = await deps.authenticate();
    if (!actor?.userId) {
      return Response.json(
        { error: "Authentication required." },
        { headers: { "Cache-Control": "private, no-store" }, status: 401 }
      );
    }
    const result = await deps.loadForActor({
      actorType: actor.type === "guest" ? "guest" : "regular",
      actorUserId: actor.userId,
      projectId,
    });
    if (result.kind === "ok") {
      const body = JSON.stringify({ state: result.state });
      if (
        new TextEncoder().encode(body).byteLength >
        PROJECT_STATE_MAX_RESPONSE_BYTES
      ) {
        return Response.json(
          { error: "Project state is unavailable." },
          {
            headers: { "Cache-Control": "private, no-store" },
            status: 503,
          }
        );
      }
      return new Response(body, {
        headers: {
          "Cache-Control": "private, no-store",
          "Content-Type": "application/json",
        },
      });
    }
    return Response.json(
      {
        error:
          result.kind === "not_found"
            ? "Project not found."
            : "Project state is unavailable.",
      },
      {
        headers: { "Cache-Control": "private, no-store" },
        status: result.kind === "not_found" ? 404 : 503,
      }
    );
  };
}
