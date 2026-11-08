"use client";

import { ArrowRight, RefreshCw } from "lucide-react";
import type { ProjectOverview } from "@/lib/workspace/project-overview";
import type {
  ProjectStage,
  ProjectStageKey,
  ProjectStageStatus,
} from "@/lib/workspace/project-stages";
import type { ProjectWorkspaceView } from "@/lib/workspace/project-workspace-view";
import type { WorkspaceCopy } from "@/lib/workspace-copy";

type OverviewCopy = WorkspaceCopy["projectEntry"]["projectWorkspace"];

const STAGE_LABEL_KEYS = {
  admissions: "stageAdmissions",
  applications: "stageApplications",
  documents: "stageDocuments",
  student500: "stageStudent500",
} as const satisfies Record<ProjectStageKey, keyof OverviewCopy>;

const STATUS_LABEL_KEYS = {
  blocked: "statusBlocked",
  in_progress: "statusInProgress",
  needs_information: "statusNeedsInformation",
  not_started: "statusNotStarted",
  unknown: "statusUnknown",
} as const satisfies Record<ProjectStageStatus, keyof OverviewCopy>;

const BLOCKER_LABEL_KEYS = {
  documents_unavailable: "blockerDocumentsUnavailable",
  school_application_missing_information:
    "blockerApplicationMissingInformation",
  school_application_package_stale: "blockerApplicationPackageStale",
  school_applications_disabled: "blockerApplicationsDisabled",
  step_conversations_unavailable: "blockerStepChatsUnavailable",
  student500_disabled: "blockerStudent500Disabled",
  student500_human_review_required: "blockerStudent500HumanReview",
  student500_missing_facts: "blockerStudent500MissingFacts",
} as const;

export function statusTone(status: ProjectStageStatus) {
  switch (status) {
    case "needs_information": {
      return "bg-amber-100 text-amber-900";
    }
    case "in_progress": {
      return "bg-blue-100 text-blue-900";
    }
    case "not_started": {
      return "bg-slate-100 text-slate-700";
    }
    default: {
      return "bg-slate-200 text-slate-700";
    }
  }
}

/**
 * Phase 13 M9-A Project overview.
 *
 * Truthful by construction: every number here came from an authorized read, and a
 * capability that could not be read is shown as a blocked area rather than as zero
 * progress. There is no percentage, no `x/y completed` denominator and no readiness
 * claim — preparation and submission readiness are separate statements, and readiness
 * stays unavailable while the submission capability is default-OFF.
 */
export function ProjectOverviewPanel({
  copy,
  navigationBusy,
  onRefresh,
  onSelectView,
  overview,
  stages,
  summaryState,
}: {
  copy: OverviewCopy;
  navigationBusy: boolean;
  onRefresh: () => void;
  onSelectView: (view: ProjectWorkspaceView) => void;
  overview: ProjectOverview;
  stages: readonly ProjectStage[];
  summaryState: "idle" | "loading" | "ready" | "failed";
}) {
  const next = overview.nextAction;
  return (
    <div className="space-y-3" data-testid="project-overview">
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-950">
            {copy.overviewPreparation}
          </h3>
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusTone(overview.preparation.state)}`}
              data-testid="project-overview-preparation-state"
            >
              {copy[STATUS_LABEL_KEYS[overview.preparation.state]]}
            </span>
            <button
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-[11px] font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
              data-testid="project-overview-refresh"
              disabled={summaryState === "loading"}
              onClick={onRefresh}
              type="button"
            >
              <RefreshCw aria-hidden="true" className="size-3.5" />
              {copy.refresh}
            </button>
          </div>
        </div>
        {summaryState === "loading" ? (
          <p aria-live="polite" className="mt-2 text-[11px] text-slate-600">
            {copy.loading}
          </p>
        ) : summaryState === "failed" ? (
          <p
            className="mt-2 text-[11px] font-semibold text-red-700"
            data-testid="project-overview-load-failed"
          >
            {copy.loadFailed}
          </p>
        ) : null}
        <p className="mt-2 text-[11px] leading-5 text-slate-600">
          {copy.coverage(
            overview.preparation.readableStages,
            overview.preparation.totalStages
          )}
        </p>
        {overview.preparation.openItems === null ? (
          <p className="mt-1 text-[11px] leading-5 text-slate-600">
            {copy.progressUnavailable}
          </p>
        ) : (
          <p
            className="mt-1 text-[11px] leading-5 text-slate-700"
            data-testid="project-overview-counts"
          >
            {copy.openItems(overview.preparation.openItems)}
            {" · "}
            <span className="font-semibold">
              {copy.needsAttention(overview.preparation.needsAttention ?? 0)}
            </span>
          </p>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-950">
          {copy.overviewReadiness}
        </h3>
        <p
          className="mt-1 text-[11px] leading-5 text-slate-600"
          data-testid="project-overview-readiness"
        >
          {overview.readiness.reason === "submission_capability_disabled"
            ? copy.readinessDisabled
            : copy.readinessNotAssessed}
        </p>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-950">
          {copy.overviewNextAction}
        </h3>
        <p className="mt-1 text-[11px] leading-5 text-slate-700">
          {next.kind === "open_stage"
            ? next.reason === "needs_information"
              ? copy.nextNeedsInformation
              : next.reason === "in_progress"
                ? copy.nextInProgress
                : copy.nextNotStarted
            : next.kind === "open_documents"
              ? copy.nextDocuments
              : copy.nextNone}
        </p>
        {next.kind === "open_stage" ? (
          <button
            className="mt-2 inline-flex items-center gap-1 rounded-lg bg-[#001736] px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-[#002b5b] disabled:opacity-50"
            data-testid="project-overview-next-action"
            disabled={navigationBusy}
            onClick={() =>
              onSelectView(
                stages.find((stage) => stage.key === next.stageKey)?.view ??
                  "home"
              )
            }
            type="button"
          >
            {copy[STAGE_LABEL_KEYS[next.stageKey]]}
            <ArrowRight aria-hidden="true" className="size-3.5" />
          </button>
        ) : null}
        {next.kind === "open_documents" ? (
          <button
            className="mt-2 inline-flex items-center gap-1 rounded-lg bg-[#001736] px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-[#002b5b] disabled:opacity-50"
            data-testid="project-overview-next-documents"
            disabled={navigationBusy}
            onClick={() => onSelectView("documents")}
            type="button"
          >
            {copy.materialsOpenDocuments}
            <ArrowRight aria-hidden="true" className="size-3.5" />
          </button>
        ) : null}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-950">
          {copy.overviewBlockers}
        </h3>
        {overview.blockers.length === 0 ? (
          <p
            className="mt-1 text-[11px] leading-5 text-slate-600"
            data-testid="project-overview-no-blockers"
          >
            {copy.overviewNoBlockers}
          </p>
        ) : (
          <ul
            className="mt-2 space-y-1 text-[11px] leading-5 text-amber-900"
            data-testid="project-overview-blockers"
          >
            {overview.blockers.map((blocker) => (
              <li key={blocker}>· {copy[BLOCKER_LABEL_KEYS[blocker]]}</li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
