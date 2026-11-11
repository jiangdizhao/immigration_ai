"use client";

import { BookOpenCheck, FolderLock, GraduationCap, School } from "lucide-react";
import type { SiteLocale } from "@/lib/site-locale";
import type { ProjectArtifactsSummary } from "@/lib/workspace/project-artifacts";
import { projectDisplayLabel } from "@/lib/workspace/project-entry";
import type { ProjectOverview } from "@/lib/workspace/project-overview";
import type { ProjectStage } from "@/lib/workspace/project-stages";
import {
  PROJECT_WORKSPACE_VIEWS,
  type ProjectWorkspaceView,
} from "@/lib/workspace/project-workspace-view";
import type { WorkspaceCopy } from "@/lib/workspace-copy";
import { ProjectDocumentsCenter } from "./project-documents-center";
import { ProjectDocumentsPanel } from "./project-documents-panel";
import { ProjectFactsPanel } from "./project-facts-panel";
import { ProjectOverviewPanel } from "./project-overview-panel";
import { ProjectReviewPanel } from "./project-review-panel";
import { SchoolAdmissionsWorkflowPanel } from "./school-admissions-workflow-panel";
import { SchoolApplicationsPanel } from "./school-applications-panel";
import { Student500Panel } from "./student-500-panel";

type ProjectHomeCopy = WorkspaceCopy["projectEntry"];

const TAB_LABEL_KEYS = {
  home: "projectHomeTab",
  applications: "projectSchoolApplicationsTab",
  admissions: "projectSchoolAdmissionsTab",
  student500: "projectStudent500Tab",
  documents: "projectDocumentsTab",
  review: "projectReviewTab",
} as const satisfies Record<ProjectWorkspaceView, keyof ProjectHomeCopy>;

/**
 * The main-content Project home shown when a Project is selected and no Project
 * Chat is open. It replaces the former neutral placeholder and gives the M5
 * panels the width they need; the left rail keeps only navigation.
 *
 * Every section reuses the existing authorized panels, so draft/version/
 * archived/error/permission semantics stay exactly as the M5 APIs define them.
 * Nothing here invents stage progress, Offer, CoE or approval states.
 */
export function ProjectWorkspaceHome({
  copy,
  locale,
  project,
  view,
  onSelectView,
  navigationBusy = false,
  temporaryGuestProject = false,
  schoolPreparationRestricted = false,
  schoolApplicationsEnabled = false,
  schoolApplicationsCopy,
  schoolAdmissionsEnabled = false,
  schoolAdmissionsCopy,
  student500Enabled = false,
  student500Copy,
  projectDocumentsEnabled = false,
  projectFactsEnabled = false,
  projectReviewEnabled = false,
  projectReviewCopy,
  stages = [],
  overview = null,
  summaryState = "ready",
  onRefreshSummary,
  onReturnToPreviousView,
  returnToPreviousViewLabel,
  onOpenArtifactOwner,
  artifacts = null,
}: {
  copy: ProjectHomeCopy;
  locale: string;
  project: {
    id: string;
    /** Phase 14: null keeps the legacy localized date + short-ID label. */
    displayName: string | null;
    createdAt: string;
    revision: number;
    status: string;
  };
  view: ProjectWorkspaceView;
  onSelectView: (view: ProjectWorkspaceView) => void;
  /**
   * Mirrors the workspace navigation-busy contract: while a turn or a
   * conversation load is running, section changes are not offered.
   */
  navigationBusy?: boolean;
  temporaryGuestProject?: boolean;
  schoolPreparationRestricted?: boolean;
  schoolApplicationsEnabled?: boolean;
  schoolApplicationsCopy: WorkspaceCopy["schoolApplications"];
  schoolAdmissionsEnabled?: boolean;
  schoolAdmissionsCopy: WorkspaceCopy["schoolAdmissions"];
  /** Phase 13 M6.1 Student 500 preparation: capability + eligibility. */
  student500Enabled?: boolean;
  student500Copy: WorkspaceCopy["student500"];
  /** Remains false until the separate document privacy/scan gates open. */
  projectDocumentsEnabled?: boolean;
  /** Phase 14-B: Project basic information (candidate facts + AI-use authorization). */
  projectFactsEnabled?: boolean;
  /** Phase 13 M9-B exact-version review surface (server keeps the real gate). */
  projectReviewEnabled?: boolean;
  projectReviewCopy: WorkspaceCopy["projectReview"];
  /**
   * Phase 13 M9-A: the real, server-authorized Project stage model and overview.
   * Missing/empty values simply render the overview's honest unavailable state; they
   * never fall back to invented progress.
   */
  stages?: readonly ProjectStage[];
  overview?: ProjectOverview | null;
  summaryState?: "idle" | "loading" | "ready" | "failed";
  onRefreshSummary?: () => void;
  /**
   * Phase 13 M9-A R1-04: the document centre returns to the view the customer came
   * from. No document→step association is claimed, because none is authorized.
   */
  onReturnToPreviousView?: () => void;
  returnToPreviousViewLabel?: string;
  /** Navigation into the workspace view that owns a generated artifact. */
  onOpenArtifactOwner?: (view: ProjectWorkspaceView) => void;
  /** Metadata-only generated-artifact references (R1-05). */
  artifacts?: ProjectArtifactsSummary | null;
}) {
  const created = new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(project.createdAt));
  const label = projectDisplayLabel(project, locale, copy);
  const statusLabel =
    project.status === "closed"
      ? copy.projectStatusClosed
      : copy.projectStatusActive;
  const applicationsReady = schoolApplicationsEnabled;
  const admissionsReady = schoolAdmissionsEnabled;
  const student500Ready = student500Enabled;

  return (
    <div
      className="flex min-w-0 flex-1 flex-col bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] px-4 py-4 sm:px-6 xl:min-h-0 xl:overflow-y-auto xl:overscroll-contain"
      data-testid="project-workspace-home"
    >
      {/*
        Layout correction: this container used to stop at `max-w-3xl` (768px), so the
        Project content stayed narrow even when the centre column was much wider. It now
        fills the available width; only genuinely long-form prose keeps a reading limit.
      */}
      <div className="w-full min-w-0 max-w-none space-y-4">
        <header className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {copy.selectedProject}
          </p>
          <h2
            className="break-words text-2xl font-semibold text-slate-950"
            data-testid="project-home-title"
          >
            {label}
          </h2>
          <p className="break-all font-mono text-xs text-slate-500">
            {copy.projectId}: {project.id}
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-slate-600">
            <span
              className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 font-semibold text-blue-900"
              data-testid="project-home-status"
            >
              {statusLabel}
            </span>
            <span>
              {copy.projectCreatedOn} {created}
            </span>
          </div>
          <p className="max-w-4xl pt-1 text-[15px] leading-6 text-slate-600">
            {copy.projectHomeSubtitle}
          </p>
        </header>

        {temporaryGuestProject ? (
          <p
            className="rounded-xl border border-slate-200 bg-white p-3 text-[15px] leading-6 text-slate-600"
            data-testid="project-home-guest-notice"
            role="note"
          >
            {copy.guestTemporaryProject}
          </p>
        ) : null}

        <div
          aria-label={copy.projectHomeTitle}
          className="flex flex-wrap gap-1 border-b border-slate-200 pb-1"
          data-testid="project-home-tabs"
          role="tablist"
        >
          {PROJECT_WORKSPACE_VIEWS.map((tab) => (
            <button
              aria-selected={view === tab}
              className={
                view === tab
                  ? "rounded-t-lg border-b-2 border-blue-800 px-3.5 py-2 text-sm font-semibold text-blue-950"
                  : "rounded-t-lg border-b-2 border-transparent px-3.5 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
              }
              data-testid={`project-view-tab-${tab}`}
              disabled={navigationBusy}
              key={tab}
              onClick={() => onSelectView(tab)}
              role="tab"
              type="button"
            >
              {copy[TAB_LABEL_KEYS[tab]]}
            </button>
          ))}
        </div>

        {view === "home" ? (
          <div className="space-y-4" data-testid="project-home-overview">
            {/*
              Phase 13 M9-A: the overview is derived only from authorized reads. When
              no summary could be read the panel says so and shows a blocked area
              instead of zero progress.
            */}
            <ProjectOverviewPanel
              copy={copy.projectWorkspace}
              navigationBusy={navigationBusy}
              onRefresh={onRefreshSummary ?? (() => undefined)}
              onSelectView={onSelectView}
              overview={
                overview ?? {
                  blockers: [
                    "documents_unavailable",
                    "step_conversations_unavailable",
                  ],
                  nextAction: { kind: "none", reason: "nothing_available" },
                  preparation: {
                    needsAttention: null,
                    openItems: null,
                    readableStages: 0,
                    state: "unknown",
                    totalStages: stages.length,
                  },
                  readiness: {
                    reason: "submission_capability_disabled",
                    state: "unavailable",
                  },
                }
              }
              stages={stages}
              summaryState={summaryState}
            />
            <section className="space-y-2">
              <h3 className="text-lg font-semibold text-slate-950">
                {copy.projectHomeNextSteps}
              </h3>
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  className="rounded-xl border border-slate-200 bg-white p-3 text-left transition enabled:hover:border-blue-300 enabled:hover:bg-blue-50/40 disabled:cursor-not-allowed disabled:opacity-70"
                  data-testid="project-home-open-applications"
                  disabled={navigationBusy || !applicationsReady}
                  onClick={() => onSelectView("applications")}
                  type="button"
                >
                  <span className="flex items-center gap-2 text-base font-semibold text-slate-900">
                    <School
                      aria-hidden="true"
                      className="size-4 text-slate-500"
                    />
                    {copy.projectSchoolApplicationsTab}
                  </span>
                  <span className="mt-1 block text-[15px] leading-6 text-slate-600">
                    {applicationsReady
                      ? copy.projectHomeOpenApplications
                      : schoolPreparationRestricted
                        ? copy.projectHomeApplicationsRestricted
                        : copy.projectHomeApplicationsUnavailable}
                  </span>
                </button>
                <button
                  className="rounded-xl border border-slate-200 bg-white p-3 text-left transition enabled:hover:border-blue-300 enabled:hover:bg-blue-50/40 disabled:cursor-not-allowed disabled:opacity-70"
                  data-testid="project-home-open-admissions"
                  disabled={navigationBusy || !admissionsReady}
                  onClick={() => onSelectView("admissions")}
                  type="button"
                >
                  <span className="flex items-center gap-2 text-base font-semibold text-slate-900">
                    <GraduationCap
                      aria-hidden="true"
                      className="size-4 text-slate-500"
                    />
                    {copy.projectSchoolAdmissionsTab}
                  </span>
                  <span className="mt-1 block text-[15px] leading-6 text-slate-600">
                    {admissionsReady
                      ? copy.projectHomeOpenAdmissions
                      : schoolPreparationRestricted
                        ? copy.projectHomeAdmissionsRestricted
                        : copy.projectHomeAdmissionsUnavailable}
                  </span>
                </button>
                <button
                  className="rounded-xl border border-slate-200 bg-white p-3 text-left transition enabled:hover:border-blue-300 enabled:hover:bg-blue-50/40 disabled:cursor-not-allowed disabled:opacity-70"
                  data-testid="project-home-open-student500"
                  disabled={navigationBusy || !student500Ready}
                  onClick={() => onSelectView("student500")}
                  type="button"
                >
                  <span className="flex items-center gap-2 text-base font-semibold text-slate-900">
                    <BookOpenCheck
                      aria-hidden="true"
                      className="size-4 text-slate-500"
                    />
                    {copy.projectStudent500Tab}
                  </span>
                  <span className="mt-1 block text-[15px] leading-6 text-slate-600">
                    {student500Ready
                      ? copy.projectHomeOpenStudent500
                      : schoolPreparationRestricted
                        ? copy.projectHomeStudent500Restricted
                        : copy.projectHomeStudent500Unavailable}
                  </span>
                </button>
              </div>
            </section>

            <p
              className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] leading-5 text-amber-900"
              data-testid="project-home-limits"
            >
              {copy.projectHomeLimits}
            </p>
            <p className="text-xs leading-5 text-slate-600">
              {copy.projectHomeChatsHint}
            </p>
          </div>
        ) : null}

        {view === "applications" ? (
          <div data-testid="project-home-applications">
            {applicationsReady ? (
              <SchoolApplicationsPanel
                copy={schoolApplicationsCopy}
                enabled={schoolApplicationsEnabled}
                projectId={project.id}
              />
            ) : (
              <p className="rounded-xl border border-slate-200 bg-white p-4 text-[15px] leading-6 text-slate-600">
                <FolderLock
                  aria-hidden="true"
                  className="mr-1 inline size-3.5 text-slate-500"
                />
                {schoolPreparationRestricted
                  ? copy.schoolPreparationRestricted
                  : copy.projectHomeApplicationsUnavailable}
              </p>
            )}
          </div>
        ) : null}

        {view === "student500" ? (
          <div data-testid="project-home-student500">
            {student500Ready ? (
              <Student500Panel
                copy={student500Copy}
                enabled={student500Enabled}
                projectId={project.id}
              />
            ) : (
              <p className="rounded-xl border border-slate-200 bg-white p-4 text-[15px] leading-6 text-slate-600">
                <FolderLock
                  aria-hidden="true"
                  className="mr-1 inline size-3.5 text-slate-500"
                />
                {schoolPreparationRestricted
                  ? copy.projectHomeStudent500Restricted
                  : copy.projectHomeStudent500Unavailable}
              </p>
            )}
          </div>
        ) : null}

        {view === "admissions" ? (
          <div data-testid="project-home-admissions">
            {admissionsReady ? (
              <SchoolAdmissionsWorkflowPanel
                copy={schoolAdmissionsCopy}
                enabled={schoolAdmissionsEnabled}
                locale={locale as SiteLocale}
                projectId={project.id}
              />
            ) : (
              <p className="rounded-xl border border-slate-200 bg-white p-4 text-[15px] leading-6 text-slate-600">
                <FolderLock
                  aria-hidden="true"
                  className="mr-1 inline size-3.5 text-slate-500"
                />
                {schoolPreparationRestricted
                  ? copy.schoolPreparationRestricted
                  : copy.projectHomeAdmissionsUnavailable}
              </p>
            )}
          </div>
        ) : null}
        {view === "review" ? (
          <div className="space-y-3" data-testid="project-home-review">
            {/*
              Phase 13 M9-B: the exact-version review surface. It reads only what the
              M9-A/M8.1/M4-006 services already authorized for this actor, and every
              dimension it shows is a server-reported state. When lawyer review is
              fail-closed the panel says so instead of offering a request that would fail.
            */}
            <ProjectReviewPanel
              copy={projectReviewCopy}
              enabled={projectReviewEnabled}
              onOpenOwnerView={(next) =>
                onOpenArtifactOwner?.(next as ProjectWorkspaceView)
              }
              projectId={project.id}
            />
          </div>
        ) : null}

        {view === "documents" ? (
          <div className="space-y-3" data-testid="project-home-documents">
            <ProjectDocumentsCenter
              artifactSourceState={summaryState}
              artifacts={artifacts}
              centreCopy={copy.projectWorkspace}
              copy={copy.documents}
              enabled={projectDocumentsEnabled}
              onOpenArtifactOwner={onOpenArtifactOwner}
              onReturnToPrevious={onReturnToPreviousView}
              projectId={project.id}
              projectRevision={project.revision}
              returnLabel={returnToPreviousViewLabel}
            />
            {/*
              Upload/import stay in the same authorized panel the M2 contracts already
              define. They are only offered while the document capability is open, so a
              closed gate never renders two conflicting "unavailable" blocks.
            */}
            {projectDocumentsEnabled ? (
              <ProjectDocumentsPanel
                copy={copy.documents}
                enabled={projectDocumentsEnabled}
                projectId={project.id}
                projectRevision={project.revision}
              />
            ) : null}
            {/*
              Phase 14-B Project basic information. It lives beside the document
              library because that is where the candidates come from, and it is only
              mounted when the capability is open, so a closed gate adds no noise to
              the existing Phase 13/14-A surface.
            */}
            {projectFactsEnabled ? (
              <ProjectFactsPanel
                copy={copy.facts}
                enabled={projectFactsEnabled}
                projectId={project.id}
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
