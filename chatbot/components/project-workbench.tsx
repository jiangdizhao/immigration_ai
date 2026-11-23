"use client";

import {
  ArrowRight,
  BookOpenCheck,
  CheckCircle2,
  CircleDashed,
  CircleHelp,
  FileText,
  FolderKanban,
  RefreshCw,
  School,
  ShieldAlert,
  TriangleAlert,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import type { ProjectEntryProject } from "@/lib/workspace/project-entry";
import type {
  ProjectJourney,
  ProjectJourneyEdge,
  ProjectJourneyNode,
} from "@/lib/workspace/project-journey";
import type { ProjectJourneyClientLoad } from "@/lib/workspace/project-journey-client";
import {
  linkedAdmissionsNodeIds,
  projectWorkbenchNodeById,
  projectWorkbenchPanelKind,
  recordedRoutesForTarget,
} from "@/lib/workspace/project-workbench-model";
import { getProjectWorkflowCopy } from "@/lib/workspace/project-workflow-copy";
import {
  defaultWorkflowTaskForTarget,
  projectWorkflowTaskById,
  type WorkflowTaskProjectionV1,
  workflowTasksForTarget,
} from "@/lib/workspace/project-workflows";
import type { ProjectWorkspaceView } from "@/lib/workspace/project-workspace-view";
import type { WorkspaceCopy } from "@/lib/workspace-copy";
import { ProjectGuidedJourneyContent } from "./project-guided-journey";
import {
  ProjectWorkflowProgressDetails,
  ProjectWorkflowProgressSummary,
  ProjectWorkflowStepList,
  ProjectWorkflowTaskDetails,
} from "./project-workflow-components";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";

type ProjectJourneyCopy = WorkspaceCopy["projectEntry"]["projectJourney"];
type ProjectWorkbenchCopy = WorkspaceCopy["projectEntry"]["projectWorkbench"];

function nodeTitle(node: ProjectJourneyNode, copy: ProjectJourneyCopy): string {
  if (node.kind === "route_entry" && node.route) {
    return copy.route[node.route.kind];
  }
  return node.title.trim() || copy.genericReason;
}

function nodeStatus(
  node: ProjectJourneyNode,
  copy: ProjectJourneyCopy
): string {
  if (node.kind === "route_entry") {
    return node.route ? copy.route[node.route.kind] : copy.status.unknown;
  }
  return node.progress && node.progress !== "route_recorded"
    ? copy.status[node.progress]
    : copy.status.unknown;
}

function statusStyle(progress: ProjectJourneyNode["progress"]): string {
  switch (progress) {
    case "completed":
      return "bg-emerald-50 text-emerald-950";
    case "needs_information":
    case "waiting":
      return "bg-amber-50 text-amber-950";
    case "blocked":
      return "bg-rose-50 text-rose-950";
    case "archived":
    case "not_applicable":
      return "bg-slate-100 text-slate-700";
    case "unknown":
    case null:
      return "bg-slate-50 text-slate-800";
    default:
      return "bg-blue-50 text-blue-950";
  }
}

function StatusMark({
  progress,
}: {
  progress: ProjectJourneyNode["progress"];
}) {
  const className = "size-3.5 shrink-0";
  if (progress === "completed") {
    return <CheckCircle2 aria-hidden="true" className={className} />;
  }
  if (progress === "needs_information") {
    return <TriangleAlert aria-hidden="true" className={className} />;
  }
  if (progress === "blocked") {
    return <ShieldAlert aria-hidden="true" className={className} />;
  }
  if (progress === "unknown" || progress === null) {
    return <CircleHelp aria-hidden="true" className={className} />;
  }
  return <CircleDashed aria-hidden="true" className={className} />;
}

function SourceState({
  source,
  fallbackSourceKey,
  copy,
}: {
  source: ProjectJourney["sources"][number] | undefined;
  fallbackSourceKey: ProjectJourney["sources"][number]["key"];
  copy: ProjectJourneyCopy;
}) {
  const sourceKey = source?.key ?? fallbackSourceKey;
  const sourceState = source?.state ?? "unavailable";
  return (
    <div
      className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
      data-testid={`project-workbench-source-${sourceKey}`}
    >
      <span className="min-w-0 break-words text-slate-700">
        {copy.sourceNames[sourceKey]}
      </span>
      <span
        className={`shrink-0 rounded-full px-2 py-1 font-semibold ${sourceState === "available" ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-950"}`}
      >
        {copy.capability[sourceState]}
        {source?.recordCount == null ? "" : ` · ${source.recordCount}`}
      </span>
    </div>
  );
}

function WorkflowTaskGroup({
  label,
  locale,
  onSelectTask,
  selectedTaskId,
  tasks,
}: {
  label: string;
  locale: string;
  onSelectTask: (taskId: string) => void;
  selectedTaskId: string | null;
  tasks: readonly WorkflowTaskProjectionV1[];
}) {
  if (!tasks.length) {
    return null;
  }
  return (
    <details
      className="rounded-lg border border-slate-200 bg-white p-1.5"
      data-testid="project-workflow-task-group"
      open={tasks.some((task) => task.taskId === selectedTaskId)}
    >
      <summary className="cursor-pointer list-none break-words px-1 py-1 text-[10px] font-semibold text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-800">
        {label} · {tasks.length}
      </summary>
      <div className="mt-1">
        <ProjectWorkflowStepList
          locale={locale}
          onSelectTask={onSelectTask}
          selectedTaskId={selectedTaskId}
          tasks={tasks}
        />
      </div>
    </details>
  );
}

export function ProjectWorkbenchTargetRail({
  journeyLoad,
  locale,
  onRefresh,
  onSelectTarget,
  onSelectWorkflowTask,
  selectedNodeId,
  selectedWorkflowTaskId,
  workbenchCopy,
  journeyCopy,
}: {
  journeyLoad: ProjectJourneyClientLoad;
  locale: string;
  onRefresh: () => void;
  onSelectTarget: (nodeId: string) => void;
  onSelectWorkflowTask: (taskId: string) => void;
  selectedNodeId: string | null;
  selectedWorkflowTaskId: string | null;
  workbenchCopy: ProjectWorkbenchCopy;
  journeyCopy: ProjectJourneyCopy;
}) {
  if (journeyLoad.status === "idle" || journeyLoad.status === "loading") {
    return (
      <section
        aria-busy="true"
        className="space-y-3 border-t border-slate-200 pt-3"
        data-testid="project-target-rail-loading"
      >
        <h3 className="text-xs font-semibold text-slate-800">
          {workbenchCopy.railTitle}
        </h3>
        <p className="text-xs leading-5 text-slate-600">
          {journeyCopy.loading}
        </p>
      </section>
    );
  }

  if (journeyLoad.status === "failed") {
    const message =
      journeyLoad.reason === "unauthorized"
        ? journeyCopy.unauthorized
        : journeyLoad.reason === "not_found"
          ? journeyCopy.notFound
          : journeyLoad.reason === "invalid_response"
            ? journeyCopy.invalidResponse
            : journeyLoad.reason === "network_error"
              ? journeyCopy.networkError
              : journeyCopy.unavailable;
    return (
      <section
        aria-label={workbenchCopy.railTitle}
        className="space-y-2 border-t border-slate-200 pt-3"
        data-testid="project-target-rail-unavailable"
      >
        <h3 className="text-xs font-semibold text-slate-800">
          {workbenchCopy.railTitle}
        </h3>
        <p className="text-xs leading-5 text-amber-950" role="alert">
          {message}
        </p>
        <button
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-800 disabled:opacity-60"
          onClick={onRefresh}
          type="button"
        >
          <RefreshCw aria-hidden="true" className="size-3.5" />
          {journeyCopy.refresh}
        </button>
      </section>
    );
  }

  const { journey } = journeyLoad;
  const workflowCopy = getProjectWorkflowCopy(locale);
  const schools = journey.nodes.filter(
    (node) => node.kind === "school_application"
  );
  const admissions = journey.nodes.filter(
    (node) => node.kind === "admission_case"
  );
  const studentApplications = journey.nodes.filter(
    (node) => node.kind === "student500_application"
  );
  const sourceByKey = new Map(
    journey.sources.map((source) => [source.key, source])
  );
  const schoolSource = sourceByKey.get("schoolApplications");
  const admissionsSource = sourceByKey.get("schoolAdmissions");
  const studentSource = sourceByKey.get("student500");
  const linkedAdmissions = linkedAdmissionsNodeIds(journey);
  const independentAdmissions = admissions.filter(
    (node) => !linkedAdmissions.has(node.id)
  );
  const renderedRouteIds = new Set<string>();

  const workflowSteps = (node: ProjectJourneyNode) => (
    <WorkflowTaskGroup
      label={
        workflowCopy.profileLabels[
          node.kind === "school_application"
            ? "school_application"
            : node.kind === "admission_case"
              ? "school_admissions"
              : "student_500"
        ]
      }
      locale={locale}
      onSelectTask={onSelectWorkflowTask}
      selectedTaskId={selectedWorkflowTaskId}
      tasks={workflowTasksForTarget(
        journey.workflowProjection.tasks,
        node.targetKind,
        node.targetId
      )}
    />
  );

  const nodeButton = (node: ProjectJourneyNode, nested = false) => {
    const title = nodeTitle(node, journeyCopy);
    const selected = node.id === selectedNodeId;
    return (
      <button
        aria-label={`${title}. ${nodeStatus(node, journeyCopy)}`}
        aria-pressed={selected}
        className={`w-full min-w-0 rounded-lg border px-2.5 py-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800 ${nested ? "ml-2 w-[calc(100%-0.5rem)]" : ""} ${selected ? "border-blue-700 bg-blue-50 ring-2 ring-blue-100" : "border-slate-200 bg-white hover:bg-slate-50"}`}
        data-node-id={node.id}
        data-testid={`project-target-${node.kind}`}
        key={node.id}
        onClick={() => onSelectTarget(node.id)}
        type="button"
      >
        <span className="flex min-w-0 items-start gap-2">
          {node.kind === "school_application" ? (
            <School
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 text-blue-800"
            />
          ) : node.kind === "student500_application" ? (
            <BookOpenCheck
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 text-blue-800"
            />
          ) : node.kind === "route_entry" ? (
            <ArrowRight
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 text-indigo-700"
            />
          ) : (
            <FileText
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 text-blue-800"
            />
          )}
          <span className="min-w-0 flex-1">
            <span className="block break-words text-xs font-semibold leading-5 text-slate-950">
              {title}
            </span>
            {node.subtitle && node.kind !== "route_entry" ? (
              <span className="mt-0.5 block break-words text-[10px] leading-4 text-slate-600">
                {node.subtitle}
              </span>
            ) : null}
          </span>
        </span>
        <span
          className={`mt-2 inline-flex max-w-full items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold ${statusStyle(node.progress)}`}
        >
          <StatusMark progress={node.progress} />
          <span className="break-words">{nodeStatus(node, journeyCopy)}</span>
        </span>
      </button>
    );
  };

  const renderRoutes = (parentId: string) =>
    recordedRoutesForTarget(journey, parentId).map((route) => {
      renderedRouteIds.add(route.id);
      return nodeButton(route, true);
    });

  return (
    <nav
      aria-label={workbenchCopy.railTitle}
      className="space-y-4 border-t border-slate-200 pt-3"
      data-testid="project-target-rail"
    >
      <h3 className="text-xs font-semibold text-slate-800">
        {workbenchCopy.railTitle}
      </h3>
      {journey.project.status === "closed" ? (
        <p className="rounded-lg bg-slate-100 p-2 text-[11px] leading-4 text-slate-700">
          {journeyCopy.closedTitle} · {journeyCopy.closedMessage}
        </p>
      ) : null}
      <section
        className="space-y-2"
        data-testid="project-workflow-project-profile"
      >
        <h4 className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          {workflowCopy.profileLabels.project_planning}
        </h4>
        <WorkflowTaskGroup
          label={workflowCopy.profileLabels.project_planning}
          locale={locale}
          onSelectTask={onSelectWorkflowTask}
          selectedTaskId={selectedWorkflowTaskId}
          tasks={journey.workflowProjection.tasks.filter(
            (task) =>
              task.targetKind === "project" &&
              task.workflowKind === "project_planning"
          )}
        />
        {(
          ["school_application", "school_admissions", "student_500"] as const
        ).map((workflowKind) => {
          const tasks = journey.workflowProjection.tasks.filter(
            (task) =>
              task.targetKind === "project" &&
              task.workflowKind === workflowKind
          );
          return (
            <WorkflowTaskGroup
              key={workflowKind}
              label={`${workflowCopy.profileLabels[workflowKind]} · ${workflowCopy.stepTitles.source_coverage}`}
              locale={locale}
              onSelectTask={onSelectWorkflowTask}
              selectedTaskId={selectedWorkflowTaskId}
              tasks={tasks}
            />
          );
        })}
      </section>
      <div className="space-y-2">
        <h4 className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          {journeyCopy.groups.schools}
        </h4>
        {schoolSource?.state !== "available" ? (
          <SourceState
            copy={journeyCopy}
            fallbackSourceKey="schoolApplications"
            source={schoolSource}
          />
        ) : schools.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 bg-white p-2 text-[11px] leading-4 text-slate-600">
            {journeyCopy.emptyRecords}
          </p>
        ) : (
          <ul className="space-y-2">
            {schools.map((school) => {
              const linked = journey.edges
                .filter(
                  (edge) =>
                    edge.kind === "school_admissions_link" &&
                    edge.fromNodeId === school.id
                )
                .map((edge) =>
                  admissions.find((admission) => admission.id === edge.toNodeId)
                )
                .filter(
                  (node): node is ProjectJourneyNode => node !== undefined
                );
              return (
                <li className="space-y-1.5" key={school.id}>
                  {nodeButton(school)}
                  {workflowSteps(school)}
                  {linked.map((admission) => (
                    <div className="space-y-1.5" key={admission.id}>
                      <p className="ml-3 border-l-2 border-slate-300 pl-2 text-[9px] text-slate-500">
                        {journeyCopy.relationship.schoolAdmissions}
                      </p>
                      {nodeButton(admission, true)}
                      {workflowSteps(admission)}
                      {renderRoutes(admission.id)}
                    </div>
                  ))}
                  {renderRoutes(school.id)}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {independentAdmissions.length > 0 ||
      admissionsSource?.state !== "available" ? (
        <div className="space-y-2">
          <h4 className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            {journeyCopy.groups.admissions}
          </h4>
          {admissionsSource?.state !== "available" ? (
            <SourceState
              copy={journeyCopy}
              fallbackSourceKey="schoolAdmissions"
              source={admissionsSource}
            />
          ) : (
            independentAdmissions.map((node) => (
              <div className="space-y-1.5" key={node.id}>
                {nodeButton(node)}
                {workflowSteps(node)}
                {renderRoutes(node.id)}
              </div>
            ))
          )}
        </div>
      ) : admissions.length > 0 ? (
        <p
          className="rounded-lg bg-slate-50 p-2 text-[10px] leading-4 text-slate-600"
          data-testid="project-target-admissions-linked"
        >
          {journeyCopy.admissionsShownWithSchools}
        </p>
      ) : null}

      <div className="space-y-2">
        <h4 className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          {journeyCopy.groups.student500}
        </h4>
        {studentSource?.state !== "available" ? (
          <SourceState
            copy={journeyCopy}
            fallbackSourceKey="student500"
            source={studentSource}
          />
        ) : studentApplications.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 bg-white p-2 text-[11px] leading-4 text-slate-600">
            {journeyCopy.emptyRecords}
          </p>
        ) : (
          <ul className="space-y-2">
            {studentApplications.map((node) => (
              <li className="space-y-1.5" key={node.id}>
                {nodeButton(node)}
                {workflowSteps(node)}
                {renderRoutes(node.id)}
              </li>
            ))}
          </ul>
        )}
      </div>
      {journey.sources.some((source) => source.state !== "available") ? (
        <div className="space-y-2" data-testid="project-target-other-sources">
          {journey.sources
            .filter(
              (source) =>
                source.state !== "available" &&
                ![
                  "schoolApplications",
                  "schoolAdmissions",
                  "student500",
                ].includes(source.key)
            )
            .map((source) => (
              <SourceState
                copy={journeyCopy}
                fallbackSourceKey={source.key}
                key={source.key}
                source={source}
              />
            ))}
        </div>
      ) : null}
      {journey.nodes.some(
        (node) => node.kind === "route_entry" && !renderedRouteIds.has(node.id)
      ) ? (
        <div className="space-y-2" data-testid="project-target-recorded-routes">
          <h4 className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            {journeyCopy.groups.routes}
          </h4>
          {journey.nodes
            .filter(
              (node) =>
                node.kind === "route_entry" && !renderedRouteIds.has(node.id)
            )
            .map((route) => nodeButton(route))}
        </div>
      ) : null}
    </nav>
  );
}

function connectedEdges(
  journey: ProjectJourney,
  node: ProjectJourneyNode
): ProjectJourneyEdge[] {
  return journey.edges.filter(
    (edge) => edge.fromNodeId === node.id || edge.toNodeId === node.id
  );
}

function destinationForNode(node: ProjectJourneyNode): ProjectWorkspaceView {
  const targetNode =
    node.kind === "route_entry" ? node.route?.parentNodeId : node.id;
  if (targetNode?.startsWith("school:")) {
    return "applications";
  }
  if (targetNode?.startsWith("admissions:")) {
    return "admissions";
  }
  return "student500";
}

function actionText(code: string, copy: ProjectJourneyCopy): string {
  return copy.actionLabels[code] ?? copy.genericReason;
}

function relationshipText(
  edge: ProjectJourneyEdge,
  copy: ProjectJourneyCopy
): string {
  switch (edge.kind) {
    case "school_admissions_link":
      return copy.relationship.schoolAdmissions;
    case "student_school_dependency":
      return copy.relationship.studentSchool;
    case "student_admissions_dependency":
      return copy.relationship.studentAdmissions;
    case "recorded_route":
      return copy.relationship.recordedRoute;
    default:
      return copy.genericReason;
  }
}

function TargetRecordDetails({
  journey,
  node,
  workbenchCopy,
  journeyCopy,
}: {
  journey: ProjectJourney;
  node: ProjectJourneyNode;
  workbenchCopy: ProjectWorkbenchCopy;
  journeyCopy: ProjectJourneyCopy;
}) {
  const record = node.record;
  if (!record) {
    return null;
  }

  if (
    node.kind === "school_application" &&
    "institution" in record &&
    "course" in record
  ) {
    return (
      <section className="space-y-2" data-testid="project-task-school-details">
        <h4 className="text-xs font-semibold text-slate-800">
          {workbenchCopy.projectTaskDetails}
        </h4>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs leading-5">
          <dt className="text-slate-500">{workbenchCopy.courseLabel}</dt>
          <dd className="break-words text-right text-slate-800">
            {record.course.title.trim() || journeyCopy.unknownCourse}
          </dd>
          <dt className="text-slate-500">{workbenchCopy.intakeLabel}</dt>
          <dd className="break-words text-right text-slate-800">
            {record.intake.label?.trim() || journeyCopy.unknownIntake}
          </dd>
          <dt className="text-slate-500">{journeyCopy.responsibilityTitle}</dt>
          <dd className="break-words text-right text-slate-800">
            {journeyCopy.responsibility[record.responsibleActor]}
          </dd>
        </dl>
        {record.package ? (
          <div className="rounded-lg bg-slate-50 p-2 text-xs leading-5 text-slate-700">
            <p>{journeyCopy.packageRecorded(record.package.version)}</p>
            <p>
              {record.package.usable
                ? journeyCopy.packageUsable
                : journeyCopy.packageStale}
            </p>
            {record.package.staleReasonCodes.length > 0 ? (
              <p className="mt-1 text-slate-600">
                {record.package.staleReasonCodes
                  .map(
                    (code) =>
                      journeyCopy.reasonLabels[code] ??
                      journeyCopy.genericReason
                  )
                  .join(" · ")}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="text-xs leading-5 text-slate-600">
            {journeyCopy.packageNotRecorded}
          </p>
        )}
        {record.source.independentlyVerified ? null : (
          <p className="text-xs leading-5 text-amber-900">
            {journeyCopy.sourceNotVerified}
          </p>
        )}
      </section>
    );
  }

  if (node.kind === "admission_case" && "outcomes" in record) {
    return (
      <section
        className="space-y-2"
        data-testid="project-task-admissions-details"
      >
        <h4 className="text-xs font-semibold text-slate-800">
          {workbenchCopy.projectTaskDetails}
        </h4>
        {record.outcomes.length === 0 ? (
          <p className="text-xs leading-5 text-slate-600">
            {journeyCopy.outcomeStatusNotInterpreted}
          </p>
        ) : (
          <ul className="space-y-2">
            {record.outcomes.map((outcome) => (
              <li
                className="rounded-lg border border-slate-200 bg-white p-2 text-xs leading-5"
                key={outcome.outcomeId}
              >
                <p className="font-semibold text-slate-800">
                  {outcome.kind === "offer"
                    ? journeyCopy.offer
                    : journeyCopy.coe}
                </p>
                <p className="text-slate-600">
                  {outcome.independentlyVerified
                    ? journeyCopy.independentlyVerified
                    : journeyCopy.notIndependentlyVerified}
                  {" · "}
                  {outcome.evidenceAttached
                    ? journeyCopy.evidenceAttached
                    : journeyCopy.evidenceNotRecorded}
                </p>
                {outcome.superseded ? (
                  <p className="text-slate-600">{journeyCopy.superseded}</p>
                ) : null}
                <p className="text-slate-500">
                  {journeyCopy.outcomeStatusNotInterpreted}
                </p>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs leading-5 text-slate-600">
          {journeyCopy.receiptUnrecorded}
        </p>
        <p className="text-xs leading-5 text-slate-600">
          {journeyCopy.handoffLabel}:{" "}
          {journeyCopy.handoffState[record.externalHandoff.status]}
          {" · "}
          {journeyCopy.handoffIsNotReceipt}
        </p>
        {record.externalActions.length > 0 ? (
          <p className="text-xs leading-5 text-slate-600">
            {journeyCopy.externalActionsReported(record.externalActions.length)}
          </p>
        ) : null}
      </section>
    );
  }

  if (node.kind === "student500_application" && "preparation" in record) {
    const routes = recordedRoutesForTarget(journey, node.id);
    const staleArtifacts =
      record.preparation.drafts.some((draft) => draft.stale) ||
      record.preparation.snapshots.some((snapshot) => snapshot.stale);
    return (
      <section
        className="space-y-2"
        data-testid="project-task-student500-details"
      >
        <h4 className="text-xs font-semibold text-slate-800">
          {journeyCopy.studentPreparation}
        </h4>
        <p className="text-xs leading-5 text-slate-700">
          {journeyCopy.preparationState[record.preparation.state]}
        </p>
        {record.preparation.state === "available" ? (
          <>
            <p className="text-xs leading-5 text-slate-600">
              {journeyCopy.preparationArtifacts(
                record.preparation.drafts.length,
                record.preparation.snapshots.length
              )}
            </p>
            {staleArtifacts ? (
              <p className="text-xs leading-5 text-amber-900">
                {journeyCopy.packageStale}
              </p>
            ) : null}
            <p className="text-xs leading-5 text-slate-600">
              {journeyCopy.preparationNotApproval}
            </p>
          </>
        ) : null}
        {routes.map((route) => (
          <p
            className="rounded-lg bg-indigo-50 p-2 text-xs leading-5 text-indigo-950"
            key={route.id}
          >
            {workbenchCopy.recordedAlternative}:{" "}
            {route.route
              ? journeyCopy.route[route.route.kind]
              : journeyCopy.genericReason}
          </p>
        ))}
      </section>
    );
  }

  return null;
}

function SelectedMatterDetails({
  journey,
  locale,
  node,
  workbenchCopy,
  journeyCopy,
  onOpenWorkspace,
  navigationBusy,
}: {
  journey: ProjectJourney;
  locale: string;
  node: ProjectJourneyNode | null;
  workbenchCopy: ProjectWorkbenchCopy;
  journeyCopy: ProjectJourneyCopy;
  onOpenWorkspace: (view: ProjectWorkspaceView) => void;
  navigationBusy: boolean;
}) {
  if (!node) {
    return (
      <div className="space-y-3" data-testid="project-task-no-target">
        <p className="text-sm leading-6 text-slate-700">
          {workbenchCopy.noTarget}
        </p>
        <p className="text-xs leading-5 text-slate-600">
          {workbenchCopy.chooseTarget}
        </p>
        {journey.sources.map((source) => (
          <SourceState
            copy={journeyCopy}
            fallbackSourceKey={source.key}
            key={source.key}
            source={source}
          />
        ))}
      </div>
    );
  }

  const panelKind = projectWorkbenchPanelKind(
    journey,
    node,
    journey.project.id
  );
  if (panelKind === "unavailable") {
    return (
      <p
        className="rounded-lg bg-amber-50 p-3 text-sm leading-6 text-amber-950"
        role="alert"
      >
        {workbenchCopy.targetUnavailable}
      </p>
    );
  }

  const source = journey.sources.find((entry) => entry.key === node.sourceKey);
  const edges = connectedEdges(journey, node);
  const closed = journey.project.status === "closed";
  const destination = destinationForNode(node);
  const routeDetails = node.kind === "route_entry" && node.route;
  const record = node.record;
  const missing = node.missingInformationCodes.map(
    (code) => journeyCopy.reasonLabels[code] ?? journeyCopy.genericReason
  );
  const issues = node.issueCodes.map(
    (code) => journeyCopy.reasonLabels[code] ?? journeyCopy.genericReason
  );

  return (
    <div
      className="space-y-4"
      data-panel-kind={panelKind}
      data-testid="project-task-selected"
    >
      <section className="space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              {workbenchCopy.selectedTarget}
            </p>
            <h3 className="mt-1 break-words text-base font-semibold text-slate-950">
              {nodeTitle(node, journeyCopy)}
            </h3>
            {node.kind !== "route_entry" && node.subtitle ? (
              <p className="mt-1 break-words text-xs leading-5 text-slate-600">
                {node.subtitle}
              </p>
            ) : null}
          </div>
          <span
            className={`inline-flex max-w-full items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold ${statusStyle(node.progress)}`}
          >
            <StatusMark progress={node.progress} />
            {nodeStatus(node, journeyCopy)}
          </span>
        </div>
        {routeDetails ? (
          <p
            className="rounded-lg bg-indigo-50 p-2 text-xs leading-5 text-indigo-950"
            data-testid="project-task-route"
          >
            {workbenchCopy.recordedAlternative}:{" "}
            {journeyCopy.route[routeDetails.kind]}
          </p>
        ) : null}
        <SourceState
          copy={journeyCopy}
          fallbackSourceKey={node.sourceKey}
          source={source}
        />
        <p className="text-xs leading-5 text-slate-600">
          {workbenchCopy.targetReadOnly}
        </p>
      </section>

      {node.missingInformationCodes.length > 0 ? (
        <section
          className="space-y-2"
          data-testid="project-task-missing-information"
        >
          <h4 className="text-xs font-semibold text-slate-800">
            {journeyCopy.actionsTitle}
          </h4>
          <ul className="list-disc space-y-1 pl-5 text-xs leading-5 text-slate-700">
            {missing.map((label, index) => (
              <li key={`${node.missingInformationCodes[index]}-${index}`}>
                {label}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {issues.length > 0 ? (
        <section className="space-y-2" data-testid="project-task-issues">
          <h4 className="text-xs font-semibold text-slate-800">
            {journeyCopy.projectIssuesTitle}
          </h4>
          <ul className="list-disc space-y-1 pl-5 text-xs leading-5 text-slate-700">
            {issues.map((label, index) => (
              <li key={`${node.issueCodes[index]}-${index}`}>{label}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <TargetRecordDetails
        journey={journey}
        journeyCopy={journeyCopy}
        node={node}
        workbenchCopy={workbenchCopy}
      />

      {edges.length > 0 ? (
        <section
          className="space-y-2"
          data-testid="project-task-recorded-relations"
        >
          <h4 className="text-xs font-semibold text-slate-800">
            {journeyCopy.relatedRecords}
          </h4>
          <ul className="space-y-1.5 text-xs leading-5 text-slate-700">
            {edges.map((edge) => (
              <li className="rounded-lg bg-slate-50 p-2" key={edge.id}>
                {relationshipText(edge, journeyCopy)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {record ? (
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs leading-5">
          <dt className="text-slate-500">{journeyCopy.responsibilityTitle}</dt>
          <dd className="break-words text-right text-slate-800">
            {journeyCopy.responsibility[node.responsibleActor ?? "unknown"]}
          </dd>
          {node.provenance ? (
            <>
              <dt className="text-slate-500">{journeyCopy.updatedAt}</dt>
              <dd className="break-words text-right text-slate-800">
                {new Date(node.provenance.updatedAt).toLocaleString(locale, {
                  timeZone: "UTC",
                })}{" "}
                UTC
              </dd>
              <dt className="text-slate-500">{journeyCopy.revision}</dt>
              <dd className="text-right text-slate-800">
                {node.provenance.revision}
              </dd>
              {node.provenance.historyTruncated ? (
                <dt className="col-span-2 rounded-lg bg-amber-50 p-2 text-amber-950">
                  {journeyCopy.historyTruncated}
                </dt>
              ) : null}
            </>
          ) : null}
        </dl>
      ) : null}

      {node.provenance && node.provenance.history.length > 0 ? (
        <section
          className="space-y-2"
          data-testid="project-task-record-history"
        >
          <h4 className="text-xs font-semibold text-slate-800">
            {workbenchCopy.recordHistoryTitle}
          </h4>
          <ol className="space-y-1.5">
            {node.provenance.history.map((event) => (
              <li
                className="rounded-lg bg-slate-50 p-2 text-xs leading-5 text-slate-700"
                key={`${event.eventType}-${event.revision}-${event.createdAt}`}
              >
                <span className="block font-medium capitalize">
                  {event.eventType.replaceAll("_", " ")}
                </span>
                <span className="block text-[10px] text-slate-600">
                  {new Date(event.createdAt).toLocaleString(locale, {
                    timeZone: "UTC",
                  })}{" "}
                  UTC · {workbenchCopy.recordHistoryRevision(event.revision)}
                </span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {node.actions.length > 0 ? (
        <section className="space-y-2" data-testid="project-task-next-actions">
          <h4 className="text-xs font-semibold text-slate-800">
            {journeyCopy.actionsTitle}
          </h4>
          <ul className="space-y-1.5">
            {node.actions.map((action) => (
              <li
                className="rounded-lg border border-slate-200 bg-white p-2 text-xs leading-5"
                key={`${action.code}-${action.targetId}`}
              >
                <span className="font-medium text-slate-800">
                  {actionText(action.code, journeyCopy)}
                </span>
                <span className="mt-0.5 block text-[10px] text-slate-500">
                  {action.actionability === "executable"
                    ? journeyCopy.executableAction
                    : journeyCopy.advisoryAction}
                  {" · "}
                  {journeyCopy.responsibility[action.responsibleActor]}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {closed ? (
        <p
          className="rounded-lg bg-slate-100 p-2 text-xs leading-5 text-slate-700"
          data-testid="project-task-closed-read-only"
        >
          {journeyCopy.closedActionNotice}
        </p>
      ) : (
        <div className="space-y-2 border-t border-slate-200 pt-3">
          <button
            className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-blue-700 bg-white px-3 py-2 text-xs font-semibold text-blue-900 hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={navigationBusy}
            onClick={() => onOpenWorkspace(destination)}
            type="button"
          >
            {workbenchCopy.openExistingWorkspace}
            <ArrowRight aria-hidden="true" className="size-3.5" />
          </button>
          <p className="text-[10px] leading-4 text-slate-500">
            {journeyCopy.sectionNavigationOnly}
          </p>
        </div>
      )}
    </div>
  );
}

export function ProjectTaskWorkspacePanel({
  children,
  journeyLoad,
  onOpenWorkspace,
  onRefresh,
  onReturnToTarget,
  projectId,
  selectedNodeId,
  selectedWorkflowTaskId,
  workbenchCopy,
  journeyCopy,
  projectView,
  locale,
  navigationBusy,
}: {
  children?: ReactNode;
  journeyLoad: ProjectJourneyClientLoad;
  onOpenWorkspace: (view: ProjectWorkspaceView) => void;
  onRefresh: () => void;
  onReturnToTarget: () => void;
  projectId: string;
  selectedNodeId: string | null;
  selectedWorkflowTaskId: string | null;
  workbenchCopy: ProjectWorkbenchCopy;
  journeyCopy: ProjectJourneyCopy;
  projectView: ProjectWorkspaceView;
  locale: string;
  navigationBusy: boolean;
}) {
  const journey = journeyLoad.status === "ready" ? journeyLoad.journey : null;
  const selectedNode = projectWorkbenchNodeById(journey, selectedNodeId);
  const selectedWorkflowTaskCandidate = projectWorkflowTaskById(
    journey?.workflowProjection.tasks ?? [],
    selectedWorkflowTaskId
  );
  const selectedWorkflowTask =
    journey &&
    selectedWorkflowTaskCandidate?.projectId === journey.project.id &&
    ((selectedNodeId === null &&
      selectedWorkflowTaskCandidate.targetKind === "project") ||
      (selectedNodeId !== null &&
        selectedNode &&
        selectedWorkflowTaskCandidate.targetKind === selectedNode.targetKind &&
        selectedWorkflowTaskCandidate.targetId === selectedNode.targetId))
      ? selectedWorkflowTaskCandidate
      : journey && selectedNode
        ? defaultWorkflowTaskForTarget(
            journey.workflowProjection.tasks,
            selectedNode.targetKind,
            selectedNode.targetId
          )
        : null;

  return (
    <section
      aria-label={workbenchCopy.panelTitle}
      className="flex min-h-0 min-w-0 flex-col bg-white"
      data-testid="project-task-workspace"
    >
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 px-3 py-2.5">
        <h2 className="min-w-0 truncate text-sm font-semibold text-slate-950">
          {projectView === "home"
            ? workbenchCopy.panelTitle
            : workbenchCopy.selectedTarget}
        </h2>
        <button
          aria-label={workbenchCopy.refresh}
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800 disabled:opacity-50"
          disabled={
            journeyLoad.status === "loading" || journeyLoad.status === "idle"
          }
          onClick={onRefresh}
          type="button"
        >
          <RefreshCw aria-hidden="true" className="size-4" />
        </button>
      </header>
      {projectView !== "home" && journey ? (
        <div
          className="min-h-0 flex-1 overflow-y-auto p-3"
          data-testid="project-task-existing-workspace"
        >
          {journey.project.id !== projectId ? (
            <p
              className="rounded-lg bg-amber-50 p-3 text-sm leading-6 text-amber-950"
              role="alert"
            >
              {workbenchCopy.targetUnavailable}
            </p>
          ) : journey.project.status === "closed" ? (
            <p className="rounded-lg bg-slate-100 p-3 text-sm leading-6 text-slate-700">
              {journeyCopy.closedMessage}
            </p>
          ) : (
            <>
              <button
                className="mb-3 inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                disabled={navigationBusy}
                onClick={onReturnToTarget}
                type="button"
              >
                <ArrowRight
                  aria-hidden="true"
                  className="size-3.5 rotate-180"
                />
                {workbenchCopy.selectedTarget}
              </button>
              {children}
            </>
          )}
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {journeyLoad.status === "idle" || journeyLoad.status === "loading" ? (
            <p
              aria-busy="true"
              className="text-sm leading-6 text-slate-600"
              data-testid="project-task-loading"
            >
              {journeyCopy.loading}
            </p>
          ) : journeyLoad.status === "failed" ? (
            <p
              className="rounded-lg bg-amber-50 p-3 text-sm leading-6 text-amber-950"
              data-testid="project-task-unavailable"
              role="alert"
            >
              {journeyLoad.reason === "unauthorized"
                ? journeyCopy.unauthorized
                : journeyLoad.reason === "not_found"
                  ? journeyCopy.notFound
                  : journeyLoad.reason === "invalid_response"
                    ? journeyCopy.invalidResponse
                    : journeyLoad.reason === "network_error"
                      ? journeyCopy.networkError
                      : journeyCopy.unavailable}
            </p>
          ) : journey === null ? (
            <p className="text-sm leading-6 text-amber-950" role="alert">
              {workbenchCopy.targetUnavailable}
            </p>
          ) : journey.project.id !== projectId ? (
            <p className="text-sm leading-6 text-amber-950" role="alert">
              {workbenchCopy.targetUnavailable}
            </p>
          ) : (
            <div
              className="space-y-3"
              data-testid="project-task-workflow-context"
            >
              <ProjectWorkflowTaskDetails
                journey={journey}
                journeyCopy={journeyCopy}
                locale={locale}
                task={selectedWorkflowTask}
              />
              <SelectedMatterDetails
                journey={journey}
                journeyCopy={journeyCopy}
                locale={locale}
                navigationBusy={navigationBusy}
                node={selectedNode}
                onOpenWorkspace={onOpenWorkspace}
                workbenchCopy={workbenchCopy}
              />
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export function ProjectWorkbenchHeader({
  enabledSections,
  journeyLoad,
  locale,
  navigationBusy,
  onRefresh,
  onSelectNode,
  project,
  projectId,
  selectedNodeId,
  mobileSurface,
  onMobileSurfaceChange,
  onSelectView,
  workbenchCopy,
  journeyCopy,
}: {
  enabledSections: Record<
    "applications" | "admissions" | "student500",
    boolean
  >;
  journeyLoad: ProjectJourneyClientLoad;
  locale: string;
  navigationBusy: boolean;
  onRefresh: () => void;
  onSelectNode: (nodeId: string) => void;
  project: ProjectEntryProject | null;
  projectId: string;
  selectedNodeId: string | null;
  mobileSurface: "chat" | "task";
  onMobileSurfaceChange: (surface: "chat" | "task") => void;
  onSelectView: (view: ProjectWorkspaceView) => void;
  workbenchCopy: ProjectWorkbenchCopy;
  journeyCopy: ProjectJourneyCopy;
}) {
  const [progressOpen, setProgressOpen] = useState(false);
  const selected =
    journeyLoad.status === "ready"
      ? projectWorkbenchNodeById(journeyLoad.journey, selectedNodeId)
      : null;
  const title =
    project?.displayName?.trim() ||
    `${workbenchCopy.unnamedProject} #${projectId.slice(0, 8)}`;
  const selectedContext = selected
    ? nodeTitle(selected, journeyCopy)
    : workbenchCopy.purposeUnknown;
  const isReady =
    journeyLoad.status === "ready" &&
    journeyLoad.journey.project.id === projectId;
  const workflowCopy = getProjectWorkflowCopy(locale);
  const projectStatus = isReady
    ? journeyLoad.journey.project.status === "closed"
      ? workbenchCopy.closedStatus
      : workbenchCopy.activeStatus
    : journeyLoad.status === "failed"
      ? journeyCopy.unavailable
      : journeyCopy.loading;
  const workflowProgress = isReady
    ? journeyLoad.journey.workflowProjection.progress
    : null;

  return (
    <>
      <header
        className="sticky top-0 z-20 shrink-0 border-b border-slate-200 bg-white/95 px-3 py-2 shadow-sm backdrop-blur sm:px-4 xl:min-h-[84px] xl:px-5"
        data-testid="project-workbench-header"
      >
        <div className="flex min-w-0 flex-col gap-2 xl:min-h-[64px] xl:flex-row xl:items-center xl:justify-between xl:gap-6">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <FolderKanban
                aria-hidden="true"
                className="size-5 shrink-0 text-blue-800"
              />
              <h1
                className="min-w-0 flex-1 line-clamp-2 break-normal text-base font-semibold text-slate-950 sm:text-lg xl:line-clamp-1 xl:text-xl"
                title={title}
              >
                {title}
              </h1>
              <span
                className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${isReady && journeyLoad.journey.project.status === "closed" ? "bg-slate-100 text-slate-700" : "bg-blue-50 text-blue-900"}`}
              >
                {projectStatus}
              </span>
            </div>
            <p
              className="mt-0.5 truncate text-xs leading-4 text-slate-600"
              title={selectedContext}
            >
              {selectedContext}
            </p>
          </div>
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 xl:shrink-0 xl:flex-nowrap xl:justify-end">
            {workflowProgress ? (
              <ProjectWorkflowProgressSummary
                compact
                locale={locale}
                progress={workflowProgress}
              />
            ) : (
              <p className="text-xs font-semibold text-slate-800">
                {workbenchCopy.progressNotDetermined}
              </p>
            )}
            <button
              className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-blue-700 bg-white px-2 py-2 text-xs font-semibold text-blue-900 hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800 sm:px-3"
              data-testid="view-project-progress"
              onClick={() => setProgressOpen(true)}
              type="button"
            >
              <FolderKanban aria-hidden="true" className="size-4" />
              {workbenchCopy.viewProgress}
            </button>
          </div>
        </div>
        <fieldset className="mt-2 flex min-w-0 gap-2 border-0 p-0 xl:hidden">
          <legend className="sr-only">{workbenchCopy.panelTitle}</legend>
          <button
            aria-controls="project-chat-region"
            aria-pressed={mobileSurface === "chat"}
            className={`min-h-10 flex-1 rounded-lg border px-3 text-sm font-semibold ${mobileSurface === "chat" ? "border-blue-700 bg-blue-50 text-blue-900" : "border-slate-200 bg-white text-slate-700"}`}
            data-testid="project-mobile-chat-tab-label"
            onClick={() => onMobileSurfaceChange("chat")}
            type="button"
          >
            {workbenchCopy.chatTab}
          </button>
          <button
            aria-controls="project-task-region"
            aria-pressed={mobileSurface === "task"}
            className={`min-h-10 flex-1 rounded-lg border px-3 text-sm font-semibold ${mobileSurface === "task" ? "border-blue-700 bg-blue-50 text-blue-900" : "border-slate-200 bg-white text-slate-700"}`}
            data-testid="project-mobile-task-tab-label"
            onClick={() => onMobileSurfaceChange("task")}
            type="button"
          >
            {workbenchCopy.taskTab}
          </button>
        </fieldset>
      </header>

      <Dialog onOpenChange={setProgressOpen} open={progressOpen}>
        <DialogContent className="max-h-[92dvh] w-[min(96vw,1500px)] max-w-[1500px] overflow-hidden p-3 sm:p-5">
          <DialogHeader className="pr-10">
            <DialogTitle>{workflowCopy.progressTitle}</DialogTitle>
            <DialogDescription>
              {
                workflowCopy.coverage[
                  workflowProgress?.coverage ?? "unavailable"
                ]
              }
            </DialogDescription>
          </DialogHeader>
          <div
            className="min-h-0 overflow-y-auto pr-1"
            data-testid="project-progress-details"
          >
            {journeyLoad.status === "ready" && isReady ? (
              <div className="space-y-6">
                <ProjectWorkflowProgressDetails
                  locale={locale}
                  projection={journeyLoad.journey.workflowProjection}
                />
                <section className="border-t border-slate-200 pt-4">
                  <h3 className="mb-2 text-sm font-semibold text-slate-900">
                    {journeyCopy.title}
                  </h3>
                  <ProjectGuidedJourneyContent
                    copy={journeyCopy}
                    enabledSections={enabledSections}
                    journey={journeyLoad.journey}
                    key={journeyLoad.journey.project.id}
                    locale={locale}
                    navigationBusy={navigationBusy}
                    onNodeSelect={onSelectNode}
                    onRefresh={onRefresh}
                    onSelectView={(view) => {
                      setProgressOpen(false);
                      onSelectView(view);
                    }}
                    selectedNodeId={selectedNodeId}
                  />
                </section>
              </div>
            ) : journeyLoad.status === "failed" ? (
              <div
                className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950"
                role="alert"
              >
                {journeyLoad.reason === "unauthorized"
                  ? journeyCopy.unauthorized
                  : journeyLoad.reason === "not_found"
                    ? journeyCopy.notFound
                    : journeyLoad.reason === "invalid_response"
                      ? journeyCopy.invalidResponse
                      : journeyLoad.reason === "network_error"
                        ? journeyCopy.networkError
                        : journeyCopy.unavailable}
                <button
                  className="ml-3 font-semibold underline"
                  onClick={onRefresh}
                  type="button"
                >
                  {journeyCopy.refresh}
                </button>
              </div>
            ) : (
              <p aria-busy="true" className="p-4 text-sm text-slate-700">
                {journeyCopy.loading}
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
