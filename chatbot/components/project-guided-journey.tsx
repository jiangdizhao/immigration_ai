"use client";

import {
  Archive,
  ArrowDown,
  ArrowRight,
  BookOpenCheck,
  CheckCircle2,
  CircleDashed,
  CircleHelp,
  Clock3,
  FileText,
  RefreshCw,
  School,
  ShieldAlert,
  TriangleAlert,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SiteLocale } from "@/lib/site-locale";
import {
  buildProjectJourney,
  type ProjectJourney,
  type ProjectJourneyLoadAction,
  type ProjectJourneyNode,
  type ProjectJourneySource,
  type ProjectStateLoadFailure,
  parseProjectStateResponse,
  projectJourneyActionLabelKey,
  projectJourneyFailureForStatus,
  projectJourneyLoadReducer,
  projectJourneyReasonLabelKey,
  projectJourneySelectionReducer,
  projectJourneyStateRequest,
  projectJourneyViewForAction,
} from "@/lib/workspace/project-journey";
import type { ProjectWorkspaceView } from "@/lib/workspace/project-workspace-view";
import type { WorkspaceCopy } from "@/lib/workspace-copy";

type JourneyCopy = WorkspaceCopy["projectEntry"]["projectJourney"];
type JourneyActionView = Exclude<
  ReturnType<typeof projectJourneyViewForAction>,
  null
>;

function titleForNode(node: ProjectJourneyNode, copy: JourneyCopy): string {
  if (node.kind === "route_entry" && node.route) {
    return copy.route[node.route.kind];
  }
  if (
    node.kind === "school_application" &&
    node.record &&
    "institution" in node.record
  ) {
    return node.record.institution.name.trim() || copy.unknownSchool;
  }
  if (
    node.kind === "admission_case" &&
    node.record &&
    "institutionName" in node.record
  ) {
    return node.record.institutionName.trim() || copy.unknownSchool;
  }
  return copy.groups.student500;
}

function subtitleForNode(
  node: ProjectJourneyNode,
  copy: JourneyCopy
): string | null {
  if (
    node.kind === "school_application" &&
    node.record &&
    "institution" in node.record
  ) {
    const course = node.record.course.title.trim() || copy.unknownCourse;
    const intake = node.record.intake.label?.trim() || null;
    return intake ? `${course} · ${intake}` : course;
  }
  if (
    node.kind === "admission_case" &&
    node.record &&
    "institutionName" in node.record
  ) {
    const course = node.record.courseTitle?.trim() || null;
    const intake = node.record.intakeLabel?.trim() || null;
    return [course, intake].filter(Boolean).join(" · ") || null;
  }
  return node.subtitle;
}

function statusText(node: ProjectJourneyNode, copy: JourneyCopy): string {
  if (node.kind === "route_entry") {
    return node.route ? copy.route[node.route.kind] : copy.status.unknown;
  }
  return node.progress && node.progress !== "route_recorded"
    ? copy.status[node.progress]
    : copy.status.unknown;
}

function statusClasses(progress: ProjectJourneyNode["progress"]): string {
  switch (progress) {
    case "completed":
      return "border-emerald-200 bg-emerald-50 text-emerald-950";
    case "needs_information":
    case "waiting":
      return "border-amber-200 bg-amber-50 text-amber-950";
    case "blocked":
      return "border-rose-200 bg-rose-50 text-rose-950";
    case "archived":
    case "not_applicable":
      return "border-slate-200 bg-slate-100 text-slate-700";
    case "unknown":
    case null:
      return "border-slate-300 bg-slate-50 text-slate-800";
    default:
      return "border-blue-200 bg-blue-50 text-blue-950";
  }
}

function StatusIcon({
  progress,
}: {
  progress: ProjectJourneyNode["progress"];
}) {
  const className = "size-4 shrink-0";
  switch (progress) {
    case "completed":
      return (
        <CheckCircle2
          aria-hidden="true"
          className={`${className} text-emerald-700`}
        />
      );
    case "needs_information":
      return (
        <TriangleAlert
          aria-hidden="true"
          className={`${className} text-amber-700`}
        />
      );
    case "waiting":
      return (
        <Clock3 aria-hidden="true" className={`${className} text-amber-700`} />
      );
    case "blocked":
      return (
        <ShieldAlert
          aria-hidden="true"
          className={`${className} text-rose-700`}
        />
      );
    case "archived":
      return (
        <Archive aria-hidden="true" className={`${className} text-slate-600`} />
      );
    case "not_applicable":
      return (
        <CircleDashed
          aria-hidden="true"
          className={`${className} text-slate-600`}
        />
      );
    case "unknown":
    case null:
      return (
        <CircleHelp
          aria-hidden="true"
          className={`${className} text-slate-600`}
        />
      );
    case "route_recorded":
      return (
        <FileText
          aria-hidden="true"
          className={`${className} text-indigo-700`}
        />
      );
    default:
      return (
        <CircleDashed
          aria-hidden="true"
          className={`${className} text-blue-700`}
        />
      );
  }
}

function sourceFor(
  journey: ProjectJourney,
  key: ProjectJourneySource["key"]
): ProjectJourneySource {
  return (
    journey.sources.find((source) => source.key === key) ?? {
      key,
      state: "unavailable",
      reasonCode: null,
      recordCount: null,
    }
  );
}

function SourceStateLine({
  source,
  copy,
}: {
  source: ProjectJourneySource;
  copy: JourneyCopy;
}) {
  const available = source.state === "available";
  return (
    <div
      className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2"
      data-testid={`journey-source-${source.key}`}
    >
      <span className="min-w-0 break-words text-sm font-medium text-slate-800">
        {copy.sourceNames[source.key]}
      </span>
      <span
        className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${available ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-950"}`}
      >
        {available ? (
          <CheckCircle2 aria-hidden="true" className="size-3.5" />
        ) : (
          <CircleHelp aria-hidden="true" className="size-3.5" />
        )}
        {copy.capability[source.state]}
        {source.recordCount === null ? null : ` · ${source.recordCount}`}
      </span>
    </div>
  );
}

function SourceUnavailable({
  source,
  copy,
}: {
  source: ProjectJourneySource;
  copy: JourneyCopy;
}) {
  if (source.state === "available") {
    return null;
  }
  return (
    <div
      className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-950"
      data-testid={`journey-unavailable-${source.key}`}
      role="note"
    >
      <CircleHelp aria-hidden="true" className="mt-1 size-4 shrink-0" />
      <span>
        <strong>{copy.sourceNames[source.key]}:</strong>{" "}
        {copy.capability[source.state]}. {copy.sourceUnavailable}
      </span>
    </div>
  );
}

function actionLabel(actionCode: string, copy: JourneyCopy): string {
  const key = projectJourneyActionLabelKey(actionCode);
  return key
    ? (copy.actionLabels[actionCode] ?? copy.genericReason)
    : copy.genericReason;
}

function relationshipLabel(
  kind: ProjectJourney["edges"][number]["kind"],
  copy: JourneyCopy
): string {
  switch (kind) {
    case "school_admissions_link":
      return copy.relationship.schoolAdmissions;
    case "student_school_dependency":
      return copy.relationship.studentSchool;
    case "student_admissions_dependency":
      return copy.relationship.studentAdmissions;
    case "recorded_route":
      return copy.relationship.recordedRoute;
    default:
      return copy.relationship.recordedRoute;
  }
}

function failureText(
  reason: ProjectStateLoadFailure,
  copy: JourneyCopy
): string {
  switch (reason) {
    case "unauthorized":
      return copy.unauthorized;
    case "not_found":
      return copy.notFound;
    case "invalid_response":
      return copy.invalidResponse;
    case "network_error":
      return copy.networkError;
    default:
      return copy.unavailable;
  }
}

export function ProjectGuidedJourney({
  copy,
  enabledSections,
  locale,
  navigationBusy,
  onSelectView,
  projectId,
}: {
  copy: JourneyCopy;
  enabledSections: Record<
    "applications" | "admissions" | "student500",
    boolean
  >;
  locale: string;
  navigationBusy: boolean;
  onSelectView: (view: ProjectWorkspaceView) => void;
  projectId: string;
}) {
  const [loadState, setLoadState] = useState<ReturnType<
    typeof projectJourneyLoadReducer
  > | null>(null);
  const dispatch = useCallback((action: ProjectJourneyLoadAction) => {
    setLoadState((current) => projectJourneyLoadReducer(current, action));
  }, []);
  const [refreshRevision, setRefreshRevision] = useState(0);
  const requestId = useRef(0);

  useEffect(() => {
    const currentRequestId = ++requestId.current + refreshRevision;
    const controller = new AbortController();
    dispatch({ type: "started", projectId, requestId: currentRequestId });

    async function load() {
      try {
        const request = projectJourneyStateRequest(
          projectId,
          controller.signal
        );
        const response = await fetch(request.url, request.init);
        if (!response.ok) {
          dispatch({
            type: "failed",
            projectId,
            requestId: currentRequestId,
            reason: projectJourneyFailureForStatus(response.status),
          });
          return;
        }
        const body: unknown = await response.json();
        const state = parseProjectStateResponse(body, projectId);
        if (!state) {
          dispatch({
            type: "failed",
            projectId,
            requestId: currentRequestId,
            reason: "invalid_response",
          });
          return;
        }
        dispatch({
          type: "loaded",
          projectId,
          requestId: currentRequestId,
          state,
          journey: buildProjectJourney(state),
        });
      } catch {
        if (!controller.signal.aborted) {
          dispatch({
            type: "failed",
            projectId,
            requestId: currentRequestId,
            reason: "network_error",
          });
        }
      }
    }

    load();
    return () => {
      controller.abort();
    };
  }, [dispatch, projectId, refreshRevision]);

  const visibleState = loadState?.projectId === projectId ? loadState : null;
  if (!visibleState || visibleState.status === "loading") {
    return (
      <output
        aria-busy="true"
        aria-label={copy.title}
        className="block rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        data-testid="project-guided-journey-loading"
      >
        <span className="flex items-center gap-3 text-slate-700">
          <span
            aria-hidden="true"
            className="size-5 animate-spin rounded-full border-2 border-blue-200 border-t-blue-800"
          />
          <span>{copy.loading}</span>
        </span>
      </output>
    );
  }
  if (visibleState.status === "failed") {
    return (
      <section
        aria-label={copy.title}
        className="rounded-2xl border border-amber-200 bg-white p-6 shadow-sm"
        data-testid="project-guided-journey-error"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <CircleHelp
              aria-hidden="true"
              className="mt-0.5 size-5 shrink-0 text-amber-700"
            />
            <p
              className="max-w-3xl text-[15px] leading-6 text-slate-800"
              role="alert"
            >
              {failureText(visibleState.reason, copy)}
            </p>
          </div>
          <button
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
            data-testid="project-guided-journey-refresh"
            disabled={navigationBusy}
            onClick={() => setRefreshRevision((current) => current + 1)}
            type="button"
          >
            <RefreshCw aria-hidden="true" className="size-4" />
            {copy.refresh}
          </button>
        </div>
      </section>
    );
  }

  return (
    <ProjectGuidedJourneyContent
      copy={copy}
      enabledSections={enabledSections}
      journey={visibleState.journey}
      key={visibleState.journey.project.id}
      locale={locale}
      navigationBusy={navigationBusy}
      onRefresh={() => setRefreshRevision((current) => current + 1)}
      onSelectView={onSelectView}
    />
  );
}

/** The loaded, interactive M1 journey; separately exportable for browser acceptance. */
export function ProjectGuidedJourneyContent({
  copy,
  enabledSections,
  journey,
  locale,
  navigationBusy,
  onRefresh,
  onSelectView,
}: {
  copy: JourneyCopy;
  enabledSections: Record<
    "applications" | "admissions" | "student500",
    boolean
  >;
  journey: ProjectJourney;
  locale: string;
  navigationBusy: boolean;
  onRefresh: () => void;
  onSelectView: (view: ProjectWorkspaceView) => void;
}) {
  const businessNodes = useMemo(
    () => journey.nodes.filter((node) => node.kind !== "route_entry"),
    [journey.nodes]
  );
  const defaultNodeId = useMemo(() => {
    const targetWithAction = journey.nodes.find((node) =>
      node.actions.some(
        (action) =>
          action.actionability === "executable" &&
          projectJourneyViewForAction(action) !== null
      )
    );
    return (
      targetWithAction?.id ??
      businessNodes[0]?.id ??
      journey.nodes[0]?.id ??
      null
    );
  }, [businessNodes, journey.nodes]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    defaultNodeId
  );
  const nodeById = useMemo(
    () => new Map(journey.nodes.map((node) => [node.id, node])),
    [journey.nodes]
  );
  const selectedNode =
    (selectedNodeId ? nodeById.get(selectedNodeId) : null) ??
    (defaultNodeId ? nodeById.get(defaultNodeId) : null) ??
    null;

  useEffect(() => {
    setSelectedNodeId((current) =>
      projectJourneySelectionReducer(current, {
        type: "reconcile",
        availableNodeIds: journey.nodes.map((node) => node.id),
        defaultNodeId,
      })
    );
  }, [defaultNodeId, journey.nodes]);

  const schoolNodes = journey.nodes.filter(
    (node) => node.kind === "school_application"
  );
  const admissionNodes = journey.nodes.filter(
    (node) => node.kind === "admission_case"
  );
  const studentNodes = journey.nodes.filter(
    (node) => node.kind === "student500_application"
  );
  const linkedAdmissionIds = new Set(
    journey.edges
      .filter((edge) => edge.kind === "school_admissions_link")
      .map((edge) => edge.toNodeId)
  );
  const independentAdmissions = admissionNodes.filter(
    (node) => !linkedAdmissionIds.has(node.id)
  );
  const sourceByKey = new Map(
    journey.sources.map((source) => [source.key, source])
  );
  const availableSources = journey.sources.filter(
    (source) => source.state !== "available"
  );
  const pageLocale: SiteLocale = locale === "zh-CN" ? "zh-CN" : "en";
  const dateFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(pageLocale, {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    [pageLocale]
  );

  const formatDate = (date: string | undefined) => {
    if (!date || !Number.isFinite(Date.parse(date))) {
      return null;
    }
    return dateFormat.format(new Date(date));
  };

  const routesFor = (parentNodeId: string) =>
    journey.nodes.filter(
      (node) =>
        node.kind === "route_entry" && node.route?.parentNodeId === parentNodeId
    );

  const nodeButton = (node: ProjectJourneyNode) => {
    const selected = selectedNode?.id === node.id;
    const title = titleForNode(node, copy);
    const subtitle = subtitleForNode(node, copy);
    const progress = node.progress;
    return (
      <button
        aria-controls="project-journey-selected-details"
        aria-pressed={selected}
        className={`group w-full min-w-0 rounded-xl border p-3 text-left shadow-sm transition hover:border-blue-400 hover:bg-blue-50/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800 ${selected ? "border-blue-700 bg-blue-50 ring-2 ring-blue-100" : "border-slate-200 bg-white"}`}
        data-node-id={node.id}
        data-testid={`journey-node-${node.kind}`}
        key={node.id}
        onClick={() =>
          setSelectedNodeId((current) =>
            projectJourneySelectionReducer(current, {
              type: "select",
              nodeId: node.id,
              availableNodeIds: journey.nodes.map((entry) => entry.id),
            })
          )
        }
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
            <FileText
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
            <span className="block break-words text-sm font-semibold leading-5 text-slate-950">
              {title}
            </span>
            {subtitle ? (
              <span className="mt-0.5 block break-words text-xs leading-5 text-slate-600">
                {subtitle}
              </span>
            ) : null}
          </span>
          {selected ? (
            <span className="sr-only">{copy.groups.details}</span>
          ) : null}
        </span>
        <span className="mt-2 flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-2 py-1 text-xs font-semibold ${statusClasses(progress)}`}
            data-testid="journey-node-status"
          >
            <StatusIcon progress={progress} />
            <span className="break-words">{statusText(node, copy)}</span>
          </span>
          {node.kind === "admission_case" &&
          node.record &&
          "originKind" in node.record &&
          node.record.originKind !== "school_application" ? (
            <span className="rounded-full bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-900">
              {copy.route[routeKindForOrigin(node.record.originKind)]}
            </span>
          ) : null}
        </span>
      </button>
    );
  };

  const routeKindForOrigin = (
    origin: "existing_offer" | "existing_coe" | "claimed_exception"
  ) => origin;

  const renderRouteNodes = (parentNodeId: string) =>
    routesFor(parentNodeId).map((routeNode) => (
      <div className="space-y-1" key={routeNode.id}>
        <div aria-hidden="true" className="flex justify-center text-slate-400">
          <ArrowDown className="size-4" />
        </div>
        <span className="sr-only">{copy.relationship.recordedRoute}</span>
        {nodeButton(routeNode)}
      </div>
    ));

  const relationRows = selectedNode
    ? journey.edges
        .filter(
          (edge) =>
            edge.fromNodeId === selectedNode.id ||
            edge.toNodeId === selectedNode.id
        )
        .map((edge) => {
          const otherId =
            edge.fromNodeId === selectedNode.id
              ? edge.toNodeId
              : edge.fromNodeId;
          const other = nodeById.get(otherId);
          return other
            ? {
                key: edge.id,
                label: relationshipLabel(edge.kind, copy),
                title: titleForNode(other, copy),
              }
            : null;
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    : [];

  const actions = selectedNode?.actions ?? [];
  const firstAction =
    actions.find(
      (action) =>
        action.actionability === "executable" &&
        projectJourneyViewForAction(action) !== null
    ) ??
    actions[0] ??
    null;
  const actionView: JourneyActionView | null = firstAction
    ? projectJourneyViewForAction(firstAction)
    : null;
  const actionSourceKey = actionView
    ? actionView === "applications"
      ? "schoolApplications"
      : actionView === "admissions"
        ? "schoolAdmissions"
        : "student500"
    : null;
  const actionSource = actionSourceKey
    ? sourceByKey.get(actionSourceKey)
    : undefined;
  const canOpenAction = Boolean(
    firstAction &&
      firstAction.actionability === "executable" &&
      actionView &&
      actionSource?.state === "available" &&
      enabledSections[actionView] &&
      journey.project.status === "active"
  );

  const reasonCodes = selectedNode
    ? [
        ...new Set([
          ...selectedNode.missingInformationCodes,
          ...selectedNode.issueCodes,
        ]),
      ]
    : [];

  return (
    <section
      aria-labelledby="project-guided-journey-title"
      className="space-y-4"
      data-testid="project-guided-journey"
    >
      <header className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3
              className="text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl"
              id="project-guided-journey-title"
            >
              {copy.title}
            </h3>
            <p className="mt-1 max-w-4xl text-sm leading-6 text-slate-600">
              {copy.subtitle}
            </p>
          </div>
          <button
            className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
            data-testid="project-guided-journey-refresh"
            disabled={navigationBusy}
            onClick={onRefresh}
            type="button"
          >
            <RefreshCw aria-hidden="true" className="size-4" />
            {copy.refresh}
          </button>
        </div>
        {journey.project.status === "closed" ? (
          <div
            className="mt-4 rounded-xl border border-slate-300 bg-slate-50 p-3"
            data-testid="project-guided-journey-closed"
            role="note"
          >
            <p className="font-semibold text-slate-900">{copy.closedTitle}</p>
            <p className="mt-1 text-sm leading-6 text-slate-700">
              {copy.closedMessage}
            </p>
          </div>
        ) : null}
        <div
          className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4"
          data-testid="project-journey-summary"
        >
          <SummaryChip
            label={copy.summaryKnown(journey.summary.knownRecordCount)}
          />
          <SummaryChip
            label={copy.summaryIncomplete(
              journey.summary.knownIncompleteWorkCount
            )}
          />
          <SummaryChip
            label={copy.summaryUnknown(journey.summary.unknownProgressCount)}
          />
          <SummaryChip
            label={copy.summaryUnavailable(
              journey.summary.unavailableSourceCount
            )}
          />
        </div>
        <p className="mt-3 text-sm text-slate-600">
          {copy.projectPurposeUnknown}
        </p>
      </header>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(19rem,0.85fr)]">
        <div className="min-w-0 space-y-4" data-testid="project-journey-graph">
          <section
            aria-labelledby="project-journey-schools-title"
            className="space-y-3"
          >
            <div className="flex items-center gap-2">
              <School aria-hidden="true" className="size-5 text-blue-800" />
              <h4
                className="text-lg font-semibold text-slate-950"
                id="project-journey-schools-title"
              >
                {copy.groups.schools}
              </h4>
            </div>
            <SourceUnavailable
              copy={copy}
              source={sourceFor(journey, "schoolApplications")}
            />
            {sourceFor(journey, "schoolApplications").state === "available" &&
            schoolNodes.length === 0 ? (
              <p
                className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm leading-6 text-slate-600"
                data-testid="project-journey-empty-schools"
              >
                {copy.emptyRecords}
              </p>
            ) : null}
            <div className="grid min-w-0 gap-3 md:grid-cols-2">
              {schoolNodes.map((schoolNode) => {
                const linkedAdmissions = journey.edges
                  .filter(
                    (edge) =>
                      edge.kind === "school_admissions_link" &&
                      edge.fromNodeId === schoolNode.id
                  )
                  .map((edge) => nodeById.get(edge.toNodeId))
                  .filter(
                    (node): node is ProjectJourneyNode => node !== undefined
                  );
                return (
                  <article
                    aria-label={`${copy.groups.schools}: ${titleForNode(schoolNode, copy)}`}
                    className="min-w-0 space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-3"
                    data-testid="project-journey-school-lane"
                    key={schoolNode.id}
                  >
                    {nodeButton(schoolNode)}
                    {linkedAdmissions.map((admissionNode) => (
                      <div className="space-y-1" key={admissionNode.id}>
                        <div
                          aria-hidden="true"
                          className="flex justify-center text-slate-400"
                        >
                          <ArrowDown className="size-4" />
                        </div>
                        <span className="sr-only">
                          {copy.relationship.schoolAdmissions}
                        </span>
                        {renderRouteNodes(admissionNode.id)}
                        {nodeButton(admissionNode)}
                      </div>
                    ))}
                  </article>
                );
              })}
            </div>
          </section>

          <section
            aria-labelledby="project-journey-admissions-title"
            className="space-y-3"
          >
            <h4
              className="text-lg font-semibold text-slate-950"
              id="project-journey-admissions-title"
            >
              {copy.groups.admissions}
            </h4>
            <SourceUnavailable
              copy={copy}
              source={sourceFor(journey, "schoolAdmissions")}
            />
            {sourceFor(journey, "schoolAdmissions").state === "available" &&
            admissionNodes.length === 0 ? (
              <p
                className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm leading-6 text-slate-600"
                data-testid="project-journey-empty-admissions"
              >
                {copy.emptyRecords}
              </p>
            ) : null}
            {independentAdmissions.length > 0 ? (
              <div className="grid min-w-0 gap-3 md:grid-cols-2">
                {independentAdmissions.map((admissionNode) => (
                  <article
                    className="min-w-0 space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-3"
                    key={admissionNode.id}
                  >
                    {renderRouteNodes(admissionNode.id)}
                    {nodeButton(admissionNode)}
                  </article>
                ))}
              </div>
            ) : admissionNodes.length > 0 ? (
              <p
                className="rounded-xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-600"
                data-testid="project-journey-admissions-linked-under-schools"
              >
                {copy.admissionsShownWithSchools}
              </p>
            ) : null}
          </section>

          <section
            aria-labelledby="project-journey-student-title"
            className="space-y-3"
          >
            <div className="flex items-center gap-2">
              <BookOpenCheck
                aria-hidden="true"
                className="size-5 text-blue-800"
              />
              <h4
                className="text-lg font-semibold text-slate-950"
                id="project-journey-student-title"
              >
                {copy.groups.student500}
              </h4>
            </div>
            <SourceUnavailable
              copy={copy}
              source={sourceFor(journey, "student500")}
            />
            {sourceFor(journey, "student500").state === "available" &&
            studentNodes.length === 0 ? (
              <p
                className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm leading-6 text-slate-600"
                data-testid="project-journey-empty-student500"
              >
                {copy.emptyRecords}
              </p>
            ) : null}
            {studentNodes.length > 0 ? (
              <div className="grid min-w-0 gap-3 md:grid-cols-2">
                {studentNodes.map((studentNode) => {
                  const incoming = journey.edges.filter(
                    (edge) =>
                      edge.toNodeId === studentNode.id &&
                      edge.kind !== "recorded_route"
                  );
                  return (
                    <article
                      className="min-w-0 space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-3"
                      key={studentNode.id}
                    >
                      {renderRouteNodes(studentNode.id)}
                      {incoming.map((edge) => {
                        const sourceNode = nodeById.get(edge.fromNodeId);
                        return sourceNode ? (
                          <p
                            className="flex min-w-0 items-center gap-1.5 break-words rounded-lg bg-indigo-50 px-2.5 py-2 text-xs leading-5 text-indigo-950"
                            key={edge.id}
                          >
                            <ArrowRight
                              aria-hidden="true"
                              className="size-3.5 shrink-0"
                            />
                            {relationshipLabel(edge.kind, copy)}{" "}
                            {titleForNode(sourceNode, copy)}
                          </p>
                        ) : null;
                      })}
                      {nodeButton(studentNode)}
                    </article>
                  );
                })}
              </div>
            ) : null}
          </section>

          {availableSources.length > 0 ? (
            <details
              className="rounded-xl border border-slate-200 bg-white p-3"
              data-testid="project-journey-source-details"
            >
              <summary className="cursor-pointer rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800">
                <span className="font-semibold text-slate-900">
                  {copy.groups.sources}
                </span>
              </summary>
              <div className="mt-3 space-y-2">
                {journey.sources.map((source) => (
                  <SourceStateLine
                    copy={copy}
                    key={source.key}
                    source={source}
                  />
                ))}
              </div>
            </details>
          ) : null}
        </div>

        <aside
          aria-label={copy.groups.details}
          className="min-w-0 xl:sticky xl:top-3 xl:self-start"
        >
          {selectedNode ? (
            <JourneyDetails
              action={firstAction}
              actionView={actionView}
              canOpenAction={canOpenAction}
              copy={copy}
              enabledSections={enabledSections}
              formatDate={formatDate}
              journey={journey}
              navigationBusy={navigationBusy}
              node={selectedNode}
              onSelectView={onSelectView}
              reasonCodes={reasonCodes}
              relationships={relationRows}
              sourceByKey={sourceByKey}
            />
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm leading-6 text-slate-600 shadow-sm">
              {copy.noSelectedNode}
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}

function SummaryChip({ label }: { label: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold leading-5 text-slate-800">
      {label}
    </div>
  );
}

function JourneyDetails({
  action,
  actionView,
  canOpenAction,
  copy,
  enabledSections,
  formatDate,
  journey,
  navigationBusy,
  node,
  onSelectView,
  reasonCodes,
  relationships,
  sourceByKey,
}: {
  action: ProjectJourneyNode["actions"][number] | null;
  actionView: JourneyActionView | null;
  canOpenAction: boolean;
  copy: JourneyCopy;
  enabledSections: Record<
    "applications" | "admissions" | "student500",
    boolean
  >;
  formatDate: (date: string | undefined) => string | null;
  journey: ProjectJourney;
  navigationBusy: boolean;
  node: ProjectJourneyNode;
  onSelectView: (view: ProjectWorkspaceView) => void;
  reasonCodes: string[];
  relationships: Array<{ key: string; label: string; title: string }>;
  sourceByKey: Map<ProjectJourneySource["key"], ProjectJourneySource>;
}) {
  const date = formatDate(node.provenance?.updatedAt ?? undefined);
  const school =
    node.kind === "school_application" &&
    node.record &&
    "package" in node.record
      ? node.record
      : null;
  const admission =
    node.kind === "admission_case" && node.record && "caseId" in node.record
      ? node.record
      : null;
  const student =
    node.record && "schoolDependency" in node.record ? node.record : null;
  const relatedSource = sourceByKey.get(node.sourceKey);

  const requirementRows =
    admission?.requirements.filter((requirement) =>
      ["missing", "conflicting", "unknown", "unverified"].includes(
        requirement.status
      )
    ) ?? [];

  return (
    <section
      aria-labelledby="project-journey-selected-title"
      aria-live="polite"
      className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
      data-testid="project-journey-selected-details"
      id="project-journey-selected-details"
    >
      <div className="flex items-start gap-3">
        <StatusIcon progress={node.progress} />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {copy.groups.details}
          </p>
          <h4
            className="mt-1 break-words text-lg font-semibold leading-6 text-slate-950"
            id="project-journey-selected-title"
          >
            {titleForNode(node, copy)}
          </h4>
          {subtitleForNode(node, copy) ? (
            <p className="mt-1 break-words text-sm leading-6 text-slate-600">
              {subtitleForNode(node, copy)}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClasses(node.progress)}`}
        >
          <StatusIcon progress={node.progress} />
          {statusText(node, copy)}
        </span>
        {relatedSource ? (
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
            {copy.capability[relatedSource.state]}
          </span>
        ) : null}
      </div>

      <div className="space-y-1 rounded-xl bg-slate-50 p-3 text-sm leading-6 text-slate-700">
        <p className="font-semibold text-slate-900">
          {copy.responsibilityTitle}
        </p>
        <p>
          {node.responsibleActor
            ? copy.responsibility[node.responsibleActor]
            : copy.relationship.recordedRoute}
        </p>
      </div>

      {relationships.length > 0 ? (
        <div className="space-y-2" data-testid="journey-node-relationships">
          <h5 className="text-sm font-semibold text-slate-900">
            {copy.relatedRecords}
          </h5>
          <ul className="space-y-2">
            {relationships.map((relationship) => (
              <li
                className="flex min-w-0 items-start gap-2 rounded-lg border border-indigo-100 bg-indigo-50/60 p-2.5 text-sm leading-5 text-indigo-950"
                key={relationship.key}
              >
                <ArrowRight
                  aria-hidden="true"
                  className="mt-0.5 size-3.5 shrink-0"
                />
                <span className="min-w-0 break-words">
                  {relationship.label} <strong>{relationship.title}</strong>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {admission?.schoolApplicationLinkState === "unavailable" ? (
        <p
          className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-950"
          data-testid="journey-link-unavailable"
        >
          {copy.relationship.linkUnavailable}
        </p>
      ) : null}
      {admission?.schoolApplicationLinkState === "not_linked" ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-700">
          {copy.relationship.linkNotRecorded}
        </p>
      ) : null}
      {student?.schoolDependency.state === "not_applicable" ? (
        <p
          className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm leading-6 text-blue-950"
          data-testid="journey-student-no-school-dependency"
        >
          {copy.relationship.studentNoSchool}
        </p>
      ) : null}
      {student?.schoolDependency.state === "unknown" ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-950">
          {copy.relationship.studentLinkUnknown}
        </p>
      ) : null}
      {student?.schoolDependency.state === "unavailable" ? (
        <p
          className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-950"
          data-testid="journey-student-link-unavailable"
        >
          {copy.relationship.studentLinkUnavailable}
        </p>
      ) : null}

      {selectedRouteText(node, copy) ? (
        <p
          className="rounded-lg border border-indigo-100 bg-indigo-50 p-3 text-sm leading-6 text-indigo-950"
          data-testid="journey-route-explanation"
        >
          {selectedRouteText(node, copy)}
        </p>
      ) : null}

      <section className="space-y-2">
        <h5 className="text-sm font-semibold text-slate-900">
          {copy.missingRequirements}
        </h5>
        {reasonCodes.length === 0 && requirementRows.length === 0 ? (
          <p className="text-sm leading-6 text-slate-600">
            {copy.noMissingRequirements}
          </p>
        ) : (
          <ul className="space-y-2" data-testid="journey-node-reasons">
            {reasonCodes.map((code) => {
              const reasonKey = projectJourneyReasonLabelKey(code);
              return (
                <li
                  className="rounded-lg border border-amber-100 bg-amber-50/70 p-2.5 text-sm leading-6 text-amber-950"
                  key={code}
                >
                  {reasonKey
                    ? (copy.reasonLabels[reasonKey] ?? copy.genericReason)
                    : copy.genericReason}
                  <TechnicalCode code={code} copy={copy} />
                </li>
              );
            })}
            {requirementRows.map((requirement) => (
              <li
                className="rounded-lg border border-amber-100 bg-amber-50/70 p-2.5 text-sm leading-6 text-amber-950"
                key={`${requirement.code}:${requirement.status}`}
              >
                {copy.requirementsStatus[
                  requirement.status as keyof typeof copy.requirementsStatus
                ] ?? copy.genericReason}
                {": "}
                {copy.reasonLabels[
                  projectJourneyReasonLabelKey(requirement.code) ?? ""
                ] ?? copy.genericReason}
                <TechnicalCode
                  code={`${requirement.code}:${requirement.status}`}
                  copy={copy}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {school ? (
        <div
          className="space-y-2 rounded-xl border border-slate-200 p-3 text-sm leading-6"
          data-testid="journey-school-package-details"
        >
          <p className="font-semibold text-slate-900">{copy.groups.schools}</p>
          {school.package ? (
            <>
              <p>{copy.packageRecorded(school.package.version)}</p>
              <p>
                {school.package.usable ? copy.packageUsable : copy.packageStale}
              </p>
              {school.source.independentlyVerified ? null : (
                <p className="text-amber-900">{copy.sourceNotVerified}</p>
              )}
              {school.package.staleReasonCodes.length > 0 ? (
                <TechnicalCode
                  code={school.package.staleReasonCodes.join(", ")}
                  copy={copy}
                />
              ) : null}
            </>
          ) : (
            <p>{copy.packageNotRecorded}</p>
          )}
        </div>
      ) : null}

      {admission ? (
        <div
          className="space-y-3 rounded-xl border border-slate-200 p-3 text-sm leading-6"
          data-testid="journey-admissions-details"
        >
          <div>
            <h5 className="font-semibold text-slate-900">
              {copy.recordedOutcomes}
            </h5>
            {admission.outcomes.length === 0 ? (
              <p className="mt-1 text-slate-600">
                {copy.outcomeStatusNotInterpreted}
              </p>
            ) : (
              <ul className="mt-1 space-y-2">
                {admission.outcomes.map((outcome) => (
                  <li
                    className="rounded-lg bg-slate-50 p-2.5"
                    key={outcome.outcomeId}
                  >
                    <p className="font-semibold text-slate-900">
                      {outcome.kind === "offer" ? copy.offer : copy.coe}
                    </p>
                    <p>
                      {outcome.independentlyVerified
                        ? copy.independentlyVerified
                        : copy.notIndependentlyVerified}
                    </p>
                    <p>
                      {outcome.evidenceAttached
                        ? copy.evidenceAttached
                        : copy.evidenceNotRecorded}
                    </p>
                    {outcome.superseded ? (
                      <p className="font-medium text-slate-700">
                        {copy.superseded}
                      </p>
                    ) : null}
                    <p className="text-slate-600">
                      {copy.outcomeStatusNotInterpreted}
                    </p>
                    <TechnicalCode code={outcome.state} copy={copy} />
                  </li>
                ))}
              </ul>
            )}
          </div>
          <p>{copy.receiptUnrecorded}</p>
          {admission.externalActions.length > 0 ? (
            <p>
              {copy.externalActionsReported(admission.externalActions.length)}
            </p>
          ) : null}
          <div>
            <p className="font-semibold text-slate-900">{copy.handoffLabel}</p>
            <p>{copy.handoffState[admission.externalHandoff.status]}</p>
            <p className="text-slate-600">{copy.handoffIsNotReceipt}</p>
          </div>
          {admission.externalHandoff.reasonCodes.length > 0 ? (
            <TechnicalCode
              code={admission.externalHandoff.reasonCodes.join(", ")}
              copy={copy}
            />
          ) : null}
        </div>
      ) : null}

      {student ? (
        <div
          className="space-y-2 rounded-xl border border-slate-200 p-3 text-sm leading-6"
          data-testid="journey-student-preparation-details"
        >
          <h5 className="font-semibold text-slate-900">
            {copy.studentPreparation}
          </h5>
          <p>{copy.preparationState[student.preparation.state]}</p>
          <p>{copy.preparationNotApproval}</p>
          {student.preparation.state === "available" ? (
            <>
              <p>
                {copy.preparationArtifacts(
                  student.preparation.drafts.length,
                  student.preparation.snapshots.length
                )}
              </p>
              {student.preparation.drafts.some((draft) => draft.stale) ||
              student.preparation.snapshots.some(
                (snapshot) => snapshot.stale
              ) ? (
                <p className="text-amber-900">{copy.packageStale}</p>
              ) : null}
              {student.preparation.snapshots.some(
                (snapshot) => snapshot.legalCurrentness !== "current"
              ) ? (
                <p className="text-amber-900">{copy.sourceNotVerified}</p>
              ) : null}
              {student.preparation.drafts.flatMap(
                (draft) => draft.staleReasonCodes
              ).length > 0 ? (
                <TechnicalCode
                  code={student.preparation.drafts
                    .flatMap((draft) => draft.staleReasonCodes)
                    .join(", ")}
                  copy={copy}
                />
              ) : null}
            </>
          ) : null}
          {student.entryRoute === null ? (
            <p className="text-amber-900">
              {copy.reasonLabels.studentRouteMissing}
            </p>
          ) : null}
        </div>
      ) : null}

      <section className="space-y-2 border-t border-slate-200 pt-3 text-sm leading-6 text-slate-700">
        <h5 className="font-semibold text-slate-900">
          {copy.sourceProvenance}
        </h5>
        <p>
          {copy.responsibilityTitle}:{" "}
          {node.responsibleActor
            ? copy.responsibility[node.responsibleActor]
            : copy.relationship.recordedRoute}
        </p>
        {date ? (
          <p>
            {copy.updatedAt}: {date}
          </p>
        ) : null}
        {node.provenance ? (
          <p>
            {copy.revision}: {node.provenance.revision}
          </p>
        ) : null}
        {node.provenance?.historyTruncated ? (
          <p
            className="rounded-lg bg-amber-50 p-2.5 text-amber-950"
            data-testid="journey-history-truncated"
          >
            {copy.historyTruncated}
          </p>
        ) : null}
      </section>

      <section
        className="space-y-2 rounded-xl border border-blue-100 bg-blue-50/60 p-3"
        data-testid="journey-next-action"
      >
        <h5 className="text-sm font-semibold text-slate-950">
          {copy.actionsTitle}
        </h5>
        {journey.project.status === "closed" ? (
          <p className="text-sm leading-6 text-slate-700">
            {copy.closedActionNotice}
          </p>
        ) : action ? (
          <>
            <p className="text-sm font-medium leading-6 text-slate-900">
              {actionLabel(action.code, copy)}
            </p>
            <p className="text-sm leading-6 text-slate-700">
              {action.actionability === "advisory"
                ? copy.advisoryAction
                : actionView &&
                    enabledSections[actionView] &&
                    relatedSource?.state === "available"
                  ? copy.executableAction
                  : copy.actionSectionUnavailable}
            </p>
            {action.responsibleActor !== "unknown" ? (
              <p className="text-xs leading-5 text-slate-600">
                {copy.responsibility[action.responsibleActor]}
              </p>
            ) : null}
            {canOpenAction && actionView ? (
              <button
                className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#001736] px-3.5 py-2 text-sm font-semibold text-white hover:bg-[#002b5b] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
                data-testid="journey-open-related-section"
                disabled={navigationBusy}
                onClick={() => onSelectView(actionView)}
                type="button"
              >
                {copy.openSection}
                <ArrowRight aria-hidden="true" className="size-4" />
              </button>
            ) : actionView ? (
              <p className="text-xs leading-5 text-slate-600">
                {copy.actionSectionUnavailable}
              </p>
            ) : (
              <p className="text-xs leading-5 text-slate-600">
                {copy.noSupportedAction}
              </p>
            )}
          </>
        ) : (
          <p className="text-sm leading-6 text-slate-700">
            {copy.noSupportedAction}
          </p>
        )}
      </section>

      {node.route ? <TechnicalCode code={node.route.code} copy={copy} /> : null}
    </section>
  );
}

function selectedRouteText(
  node: ProjectJourneyNode,
  copy: JourneyCopy
): string | null {
  if (node.kind !== "route_entry" || !node.route) {
    return null;
  }
  if (node.route.kind === "claimed_exception") {
    return copy.route.claimed_exception;
  }
  if (
    node.route.kind === "existing_offer" ||
    node.route.kind === "existing_coe"
  ) {
    return `${copy.route[node.route.kind]}. ${copy.outcomeStatusNotInterpreted}`;
  }
  return copy.route[node.route.kind];
}

function TechnicalCode({ code, copy }: { code: string; copy: JourneyCopy }) {
  if (!code.trim()) {
    return null;
  }
  return (
    <details className="mt-1 text-xs text-slate-500">
      <summary className="inline-flex min-h-7 cursor-pointer items-center rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800">
        {copy.technicalDetails}
      </summary>
      <code className="mt-1 block break-all rounded bg-slate-100 p-2">
        {code}
      </code>
    </details>
  );
}
