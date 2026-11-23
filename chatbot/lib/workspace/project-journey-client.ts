"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  buildProjectJourney,
  type ProjectJourneyLoadAction,
  type ProjectJourneyLoadState,
  parseProjectStateResponse,
  projectJourneyFailureForStatus,
  projectJourneyLoadReducer,
  projectJourneyStateRequest,
} from "./project-journey";

export type ProjectJourneyClientLoad =
  | { projectId: null; status: "idle" }
  | { projectId: string; requestId: number; status: "loading" }
  | Extract<ProjectJourneyLoadState, { status: "ready" | "failed" }>;

export function useProjectJourney(projectId: string | null): {
  load: ProjectJourneyClientLoad;
  refresh: () => void;
} {
  const [loadState, setLoadState] = useState<ProjectJourneyLoadState | null>(
    null
  );
  const [refreshRevision, setRefreshRevision] = useState(0);
  const requestId = useRef(0);

  const dispatch = useCallback((action: ProjectJourneyLoadAction) => {
    setLoadState((current) => projectJourneyLoadReducer(current, action));
  }, []);

  const refresh = useCallback(() => {
    if (projectId) {
      setRefreshRevision((current) => current + 1);
    }
  }, [projectId]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshRevision deliberately invalidates this read effect.
  useEffect(() => {
    if (!projectId) {
      setLoadState(null);
      return;
    }

    const activeProjectId = projectId;
    const currentRequestId = ++requestId.current;
    const controller = new AbortController();
    dispatch({
      type: "started",
      projectId: activeProjectId,
      requestId: currentRequestId,
    });

    async function load() {
      try {
        const request = projectJourneyStateRequest(
          activeProjectId,
          controller.signal
        );
        const response = await fetch(request.url, request.init);
        if (!response.ok) {
          dispatch({
            type: "failed",
            projectId: activeProjectId,
            requestId: currentRequestId,
            reason: projectJourneyFailureForStatus(response.status),
          });
          return;
        }

        const body: unknown = await response.json();
        const state = parseProjectStateResponse(body, activeProjectId);
        if (!state) {
          dispatch({
            type: "failed",
            projectId: activeProjectId,
            requestId: currentRequestId,
            reason: "invalid_response",
          });
          return;
        }

        dispatch({
          type: "loaded",
          projectId: activeProjectId,
          requestId: currentRequestId,
          state,
          journey: buildProjectJourney(state),
        });
      } catch {
        if (!controller.signal.aborted) {
          dispatch({
            type: "failed",
            projectId: activeProjectId,
            requestId: currentRequestId,
            reason: "network_error",
          });
        }
      }
    }

    load();
    return () => controller.abort();
  }, [dispatch, projectId, refreshRevision]);

  if (!projectId) {
    return { load: { projectId: null, status: "idle" }, refresh };
  }

  const visibleState = loadState?.projectId === projectId ? loadState : null;
  return {
    load: visibleState ?? {
      projectId,
      requestId: requestId.current,
      status: "loading",
    },
    refresh,
  };
}
