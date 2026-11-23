"use client";

import {
  BookOpenCheck,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDashed,
  CircleHelp,
  FileText,
  GraduationCap,
  School,
  ShieldAlert,
  TriangleAlert,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import type {
  ProjectJourney,
  ProjectJourneyNode,
} from "@/lib/workspace/project-journey";
import type { ProjectJourneyClientLoad } from "@/lib/workspace/project-journey-client";
import {
  isProjectMatterExpanded,
  type ProjectMatterExpansion,
  toggleProjectMatterExpansion,
} from "@/lib/workspace/project-navigation-state";
import { getProjectWorkflowCopy } from "@/lib/workspace/project-workflow-copy";
import { projectWorkflowTaskById } from "@/lib/workspace/project-workflows";
import type { WorkspaceCopy } from "@/lib/workspace-copy";

type JourneyCopy = WorkspaceCopy["projectEntry"]["projectJourney"];

function nodeTitle(node: ProjectJourneyNode, copy: JourneyCopy): string {
  if (node.kind === "route_entry" && node.route) {
    return copy.route[node.route.kind];
  }
  return node.title.trim() || copy.status.unknown;
}

function nodeStatus(node: ProjectJourneyNode, copy: JourneyCopy): string {
  return node.progress && node.progress !== "route_recorded"
    ? copy.status[node.progress]
    : copy.status.unknown;
}

function taskStatus(
  task: ProjectJourney["workflowProjection"]["tasks"][number],
  locale: string
): string {
  const copy = getProjectWorkflowCopy(locale);
  return `${copy.applicability[task.applicability]} · ${copy.progress[task.progress]}`;
}

function StatusIcon({
  progress,
}: {
  progress: ProjectJourneyNode["progress"];
}) {
  const className = "size-4 shrink-0";
  if (progress === "completed") {
    return <CheckCircle2 aria-hidden="true" className={className} />;
  }
  if (progress === "needs_information" || progress === "waiting") {
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

function progressColor(progress: ProjectJourneyNode["progress"]): string {
  switch (progress) {
    case "completed":
      return "bg-emerald-50 text-emerald-900";
    case "needs_information":
    case "waiting":
      return "bg-amber-50 text-amber-950";
    case "blocked":
      return "bg-rose-50 text-rose-950";
    case "unknown":
    case null:
    case "archived":
    case "not_applicable":
      return "bg-slate-100 text-slate-700";
    default:
      return "bg-blue-50 text-blue-950";
  }
}

function ProjectedTaskList({
  locale,
  onSelectTask,
  selectedTaskId,
  tasks,
}: {
  locale: string;
  onSelectTask: (taskId: string) => void;
  selectedTaskId: string | null;
  tasks: readonly ProjectJourney["workflowProjection"]["tasks"][number][];
}) {
  const copy = getProjectWorkflowCopy(locale);
  return (
    <ol className="space-y-1.5" data-testid="project-workflow-task-list">
      {tasks.map((task) => {
        const selected = selectedTaskId === task.taskId;
        return (
          <li key={task.taskId}>
            <button
              aria-pressed={selected}
              className={`flex min-h-11 w-full min-w-0 items-start gap-2 rounded-lg border px-2.5 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-1 ${selected ? "border-blue-700 bg-blue-50 text-blue-950 shadow-sm" : "border-slate-200 bg-white text-slate-800 hover:border-blue-300 hover:bg-blue-50/60"}`}
              data-testid="project-workflow-navigation-task"
              data-workflow-task-id={task.taskId}
              onClick={() => onSelectTask(task.taskId)}
              type="button"
            >
              <span
                aria-hidden="true"
                className={`mt-1 size-2 shrink-0 rounded-full ${selected ? "bg-blue-700" : task.progress === "completed" ? "bg-emerald-600" : task.progress === "needs_information" || task.progress === "waiting" ? "bg-amber-600" : task.progress === "blocked" ? "bg-rose-600" : "bg-slate-400"}`}
              />
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold leading-4">
                  {copy.stepTitles[task.stepKey]}
                </span>
                <span className="mt-1 block break-words text-[10px] leading-4 text-slate-600">
                  {taskStatus(task, locale)}
                </span>
              </span>
              {selected ? (
                <span className="sr-only">{copy.selectStep}</span>
              ) : null}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function SourceUnavailable({
  copy,
  source,
}: {
  copy: JourneyCopy;
  source: ProjectJourney["sources"][number];
}) {
  return (
    <p
      className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] leading-4 text-amber-950"
      data-testid={`project-workflow-navigation-source-${source.key}`}
    >
      <span className="font-semibold">{copy.sourceNames[source.key]}</span>
      <span className="ml-1">· {copy.capability[source.state]}</span>
    </p>
  );
}

function MatterDisclosure({
  children,
  collapseLabel,
  currentTaskLabel,
  defaultExpandedMatterId,
  expandLabel,
  icon,
  id,
  onSelect,
  overrides,
  secondary,
  selectedTaskLabel,
  status,
  title,
  toggle,
}: {
  children: ReactNode;
  collapseLabel: string;
  currentTaskLabel: string;
  defaultExpandedMatterId: string | null;
  expandLabel: string;
  icon: ReactNode;
  id: string;
  onSelect?: () => void;
  overrides: ProjectMatterExpansion;
  secondary?: string | null;
  selectedTaskLabel?: string | null;
  status?: { text: string; progress: ProjectJourneyNode["progress"] };
  title: string;
  toggle: (id: string, defaultExpandedMatterId: string | null) => void;
}) {
  const expanded = isProjectMatterExpanded(
    id,
    defaultExpandedMatterId,
    overrides
  );
  const contentId = `project-navigation-matter-${encodeURIComponent(id)}`;
  return (
    <section
      className={`overflow-hidden rounded-xl border bg-white shadow-sm ${status?.progress === "completed" ? "border-emerald-200" : "border-slate-200"}`}
      data-matter-id={id}
      data-testid="project-navigation-matter"
    >
      <div className="flex min-w-0 items-center gap-1 p-1.5">
        <button
          aria-controls={contentId}
          aria-expanded={expanded}
          aria-label={`${title} · ${expanded ? collapseLabel : expandLabel}`}
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
          data-testid="project-navigation-matter-toggle"
          onClick={() => toggle(id, defaultExpandedMatterId)}
          type="button"
        >
          {expanded ? (
            <ChevronDown aria-hidden="true" className="size-4" />
          ) : (
            <ChevronRight aria-hidden="true" className="size-4" />
          )}
        </button>
        <button
          aria-pressed={onSelect ? defaultExpandedMatterId === id : undefined}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg px-1.5 py-1 text-left transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
          data-testid="project-navigation-matter-select"
          onClick={onSelect}
          type="button"
        >
          <span className="shrink-0 text-blue-800">{icon}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-semibold leading-4 text-slate-950">
              {title}
            </span>
            {secondary ? (
              <span className="mt-0.5 block truncate text-[10px] leading-4 text-slate-600">
                {secondary}
              </span>
            ) : null}
            {!expanded && selectedTaskLabel ? (
              <span
                className="mt-0.5 block truncate text-[10px] font-semibold leading-4 text-blue-800"
                data-testid="project-navigation-collapsed-current-task"
              >
                {currentTaskLabel}: {selectedTaskLabel}
              </span>
            ) : null}
          </span>
        </button>
        {status ? (
          <span
            className={`inline-flex max-w-[7rem] shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[9px] font-semibold leading-3 ${progressColor(status.progress)}`}
          >
            <StatusIcon progress={status.progress} />
            <span className="line-clamp-2">{status.text}</span>
          </span>
        ) : null}
      </div>
      <div hidden={!expanded} id={contentId}>
        <div className="space-y-1.5 border-t border-slate-100 px-2 py-2 pl-10">
          {children}
        </div>
      </div>
    </section>
  );
}

function routeNodesFor(journey: ProjectJourney, parentId: string) {
  return journey.nodes.filter(
    (node) =>
      node.kind === "route_entry" && node.route?.parentNodeId === parentId
  );
}

function defaultExpandedMatter(
  journey: ProjectJourney,
  selectedNodeId: string | null,
  selectedTaskId: string | null
): string {
  if (selectedNodeId) {
    const selectedNode = journey.nodes.find(
      (candidate) => candidate.id === selectedNodeId
    );
    if (selectedNode?.kind === "route_entry" && selectedNode.route) {
      return selectedNode.route.parentNodeId;
    }
    if (selectedNode) {
      return selectedNode.id;
    }
  }
  const task = projectWorkflowTaskById(
    journey.workflowProjection.tasks,
    selectedTaskId
  );
  if (task?.targetKind !== "project") {
    const owner = journey.nodes.find(
      (node) =>
        node.kind !== "route_entry" &&
        node.targetKind === task?.targetKind &&
        node.targetId === task?.targetId
    );
    if (owner) {
      return owner.id;
    }
  }
  return "project:planning";
}

export function ProjectWorkflowNavigation({
  journeyCopy,
  journeyLoad,
  locale,
  onRefresh,
  onSelectTarget,
  onSelectWorkflowTask,
  selectedNodeId,
  selectedWorkflowTaskId,
}: {
  journeyCopy: JourneyCopy;
  journeyLoad: ProjectJourneyClientLoad;
  locale: string;
  onRefresh: () => void;
  onSelectTarget: (nodeId: string) => void;
  onSelectWorkflowTask: (taskId: string) => void;
  selectedNodeId: string | null;
  selectedWorkflowTaskId: string | null;
}) {
  const workflowCopy = getProjectWorkflowCopy(locale);
  const [expansionOverrides, setExpansionOverrides] = useState<
    Record<string, boolean>
  >({});
  const toggleMatter = (id: string, defaultExpandedMatterId: string | null) => {
    setExpansionOverrides((current) =>
      toggleProjectMatterExpansion(id, defaultExpandedMatterId, current)
    );
  };

  if (journeyLoad.status === "idle" || journeyLoad.status === "loading") {
    return (
      <section
        aria-busy="true"
        className="space-y-2"
        data-testid="project-workflow-navigation-loading"
      >
        <h3 className="text-xs font-semibold text-slate-900">
          {workflowCopy.navigation.workflows}
        </h3>
        <p className="rounded-lg bg-white p-3 text-xs leading-5 text-slate-600">
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
        aria-label={workflowCopy.navigation.workflows}
        className="space-y-2"
        data-testid="project-workflow-navigation-unavailable"
      >
        <p
          className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950"
          role="alert"
        >
          {message}
        </p>
        <button
          className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
          onClick={onRefresh}
          type="button"
        >
          {journeyCopy.refresh}
        </button>
      </section>
    );
  }

  const { journey } = journeyLoad;
  const defaultExpandedMatterId = defaultExpandedMatter(
    journey,
    selectedNodeId,
    selectedWorkflowTaskId
  );
  const projectTasks = journey.workflowProjection.tasks.filter(
    (task) => task.targetKind === "project"
  );
  const selectedProjectTask = projectTasks.find(
    (task) => task.taskId === selectedWorkflowTaskId
  );
  const records = journey.nodes.filter((node) => node.kind !== "route_entry");
  const schools = records.filter((node) => node.kind === "school_application");
  const admissions = records.filter((node) => node.kind === "admission_case");
  const studentApplications = records.filter(
    (node) => node.kind === "student500_application"
  );
  const sourceByKey = new Map(
    journey.sources.map((source) => [source.key, source])
  );

  const renderNodeTasks = (node: ProjectJourneyNode) => {
    const tasks = journey.workflowProjection.tasks.filter(
      (task) =>
        task.targetKind === node.targetKind && task.targetId === node.targetId
    );
    const routes = routeNodesFor(journey, node.id);
    return (
      <>
        {tasks.length ? (
          <ProjectedTaskList
            locale={locale}
            onSelectTask={onSelectWorkflowTask}
            selectedTaskId={selectedWorkflowTaskId}
            tasks={tasks}
          />
        ) : null}
        {routes.map((route) => (
          <button
            aria-pressed={selectedNodeId === route.id}
            className={`min-h-10 w-full rounded-lg border px-2.5 py-2 text-left text-[11px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 ${selectedNodeId === route.id ? "border-blue-700 bg-blue-50 text-blue-950" : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-blue-50"}`}
            data-testid="project-navigation-recorded-route"
            key={route.id}
            onClick={() => onSelectTarget(route.id)}
            type="button"
          >
            {journeyCopy.relationship.recordedRoute}:{" "}
            {nodeTitle(route, journeyCopy)}
          </button>
        ))}
        {!tasks.length && !routes.length ? (
          <p className="text-[11px] leading-4 text-slate-500">
            {journeyCopy.emptyRecords}
          </p>
        ) : null}
      </>
    );
  };

  const renderBusinessMatter = (
    node: ProjectJourneyNode,
    icon: ReactNode,
    secondary: string | null = node.subtitle
  ) => {
    const selectedTask = journey.workflowProjection.tasks.find(
      (task) =>
        task.targetKind === node.targetKind &&
        task.targetId === node.targetId &&
        task.taskId === selectedWorkflowTaskId
    );
    return (
      <MatterDisclosure
        collapseLabel={workflowCopy.navigation.collapseMatter}
        currentTaskLabel={workflowCopy.navigation.currentTask}
        defaultExpandedMatterId={defaultExpandedMatterId}
        expandLabel={workflowCopy.navigation.expandMatter}
        icon={icon}
        id={node.id}
        onSelect={() => onSelectTarget(node.id)}
        overrides={expansionOverrides}
        secondary={secondary}
        selectedTaskLabel={
          selectedTask ? workflowCopy.stepTitles[selectedTask.stepKey] : null
        }
        status={{
          progress: node.progress,
          text: nodeStatus(node, journeyCopy),
        }}
        title={nodeTitle(node, journeyCopy)}
        toggle={toggleMatter}
      >
        {renderNodeTasks(node)}
      </MatterDisclosure>
    );
  };

  const renderSourceGroup = (
    sourceKey: "schoolApplications" | "schoolAdmissions" | "student500",
    nodes: ProjectJourneyNode[],
    icon: React.ReactNode
  ) => {
    const source = sourceByKey.get(sourceKey);
    if (source?.state !== "available") {
      return source ? (
        <SourceUnavailable copy={journeyCopy} source={source} />
      ) : (
        <p className="rounded-lg bg-slate-100 p-2 text-[11px] text-slate-600">
          {journeyCopy.unavailable}
        </p>
      );
    }
    if (!nodes.length) {
      return (
        <p className="rounded-lg border border-dashed border-slate-300 bg-white p-2.5 text-[11px] leading-4 text-slate-600">
          {journeyCopy.emptyRecords}
        </p>
      );
    }
    return nodes.map((node) => {
      if (node.kind !== "admission_case") {
        return <div key={node.id}>{renderBusinessMatter(node, icon)}</div>;
      }
      const linkedSchool = journey.edges
        .filter(
          (edge) =>
            edge.kind === "school_admissions_link" && edge.toNodeId === node.id
        )
        .map((edge) => schools.find((school) => school.id === edge.fromNodeId))
        .find((school) => school !== undefined);
      const secondary = linkedSchool
        ? `${node.subtitle ?? ""}${node.subtitle ? " · " : ""}${journeyCopy.relationship.schoolAdmissions}: ${nodeTitle(linkedSchool, journeyCopy)}`
        : node.subtitle;
      return (
        <div key={node.id}>{renderBusinessMatter(node, icon, secondary)}</div>
      );
    });
  };

  const projectSelected = selectedWorkflowTaskId
    ? projectWorkflowTaskById(
        journey.workflowProjection.tasks,
        selectedWorkflowTaskId
      )?.targetKind === "project"
    : selectedNodeId === null;

  return (
    <nav
      aria-label={workflowCopy.navigation.workflows}
      className="space-y-3"
      data-testid="project-workflow-navigation"
    >
      <div className="flex items-center justify-between gap-2 px-1">
        <h3 className="text-xs font-semibold tracking-wide text-slate-900">
          {workflowCopy.navigation.workflows}
        </h3>
      </div>
      {journey.project.status === "closed" ? (
        <p className="rounded-lg bg-slate-100 px-2.5 py-2 text-[11px] leading-4 text-slate-700">
          {journeyCopy.closedTitle} · {journeyCopy.closedMessage}
        </p>
      ) : null}

      <MatterDisclosure
        collapseLabel={workflowCopy.navigation.collapseMatter}
        currentTaskLabel={workflowCopy.navigation.currentTask}
        defaultExpandedMatterId={defaultExpandedMatterId}
        expandLabel={workflowCopy.navigation.expandMatter}
        icon={<FileText aria-hidden="true" className="size-4" />}
        id="project:planning"
        onSelect={
          projectTasks[0]
            ? () => onSelectWorkflowTask(projectTasks[0].taskId)
            : undefined
        }
        overrides={expansionOverrides}
        selectedTaskLabel={
          selectedProjectTask
            ? workflowCopy.stepTitles[selectedProjectTask.stepKey]
            : null
        }
        status={undefined}
        title={workflowCopy.profileLabels.project_planning}
        toggle={toggleMatter}
      >
        {projectTasks.length ? (
          <ProjectedTaskList
            locale={locale}
            onSelectTask={onSelectWorkflowTask}
            selectedTaskId={selectedWorkflowTaskId}
            tasks={projectTasks}
          />
        ) : (
          <p className="text-[11px] leading-4 text-slate-600">
            {workflowCopy.projectGoalUnknown}
          </p>
        )}
      </MatterDisclosure>

      {projectSelected && selectedWorkflowTaskId ? (
        <p className="sr-only" data-testid="project-navigation-active-task">
          {workflowCopy.selectStep}
        </p>
      ) : null}

      <section aria-label={journeyCopy.groups.schools} className="space-y-2">
        <h4 className="px-1 text-[10px] font-semibold tracking-wide text-slate-500 uppercase">
          {journeyCopy.groups.schools}
        </h4>
        {renderSourceGroup(
          "schoolApplications",
          schools,
          <School aria-hidden="true" className="size-4" />
        )}
      </section>

      <section aria-label={journeyCopy.groups.admissions} className="space-y-2">
        <h4 className="px-1 text-[10px] font-semibold tracking-wide text-slate-500 uppercase">
          {journeyCopy.groups.admissions}
        </h4>
        {renderSourceGroup(
          "schoolAdmissions",
          admissions,
          <GraduationCap aria-hidden="true" className="size-4" />
        )}
      </section>

      <section aria-label={journeyCopy.groups.student500} className="space-y-2">
        <h4 className="px-1 text-[10px] font-semibold tracking-wide text-slate-500 uppercase">
          {journeyCopy.groups.student500}
        </h4>
        {renderSourceGroup(
          "student500",
          studentApplications,
          <BookOpenCheck aria-hidden="true" className="size-4" />
        )}
      </section>

      {journey.sources.some((source) => source.state !== "available") ? (
        <section
          className="space-y-1.5"
          data-testid="project-navigation-other-sources"
        >
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
              <SourceUnavailable
                copy={journeyCopy}
                key={source.key}
                source={source}
              />
            ))}
        </section>
      ) : null}
    </nav>
  );
}
