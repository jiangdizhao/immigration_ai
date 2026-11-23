"use client";

import type { ReactNode } from "react";
import type {
  ProjectJourney,
  ProjectJourneyNode,
} from "@/lib/workspace/project-journey";
import { projectWorkbenchNodeIdForWorkflowTask } from "@/lib/workspace/project-workbench-model";
import { getProjectWorkflowCopy } from "@/lib/workspace/project-workflow-copy";
import type {
  ProjectProgressV1,
  ProjectWorkflowProjectionV1,
  WorkflowTaskProjectionV1,
} from "@/lib/workspace/project-workflows";
import type { WorkspaceCopy } from "@/lib/workspace-copy";

type JourneyCopy = WorkspaceCopy["projectEntry"]["projectJourney"];

function progressClasses(
  progress: WorkflowTaskProjectionV1["progress"]
): string {
  switch (progress) {
    case "completed":
      return "bg-emerald-100 text-emerald-900";
    case "needs_information":
    case "waiting":
      return "bg-amber-100 text-amber-950";
    case "blocked":
      return "bg-rose-100 text-rose-950";
    case "unknown":
      return "bg-slate-100 text-slate-700";
    default:
      return "bg-blue-50 text-blue-900";
  }
}

function taskStatus(task: WorkflowTaskProjectionV1, locale: string): string {
  const copy = getProjectWorkflowCopy(locale);
  return `${copy.applicability[task.applicability]} · ${copy.progress[task.progress]}`;
}

function TaskReasons({
  task,
  locale,
}: {
  task: WorkflowTaskProjectionV1;
  locale: string;
}) {
  const copy = getProjectWorkflowCopy(locale);
  return (
    <ul className="mt-1 space-y-1 text-[10px] leading-4 text-slate-600">
      {(task.reasonCodes.length ? task.reasonCodes : ["unknown"]).map(
        (code) => (
          <li key={code}>{copy.reasons[code] ?? copy.genericReason}</li>
        )
      )}
    </ul>
  );
}

export function ProjectWorkflowStepList({
  locale,
  onSelectTask,
  selectedTaskId,
  tasks,
}: {
  locale: string;
  onSelectTask: (taskId: string) => void;
  selectedTaskId: string | null;
  tasks: readonly WorkflowTaskProjectionV1[];
}) {
  const workflowCopy = getProjectWorkflowCopy(locale);
  if (!tasks.length) {
    return null;
  }
  return (
    <ol
      aria-label={workflowCopy.railHeading}
      className="space-y-1"
      data-testid="project-workflow-step-list"
    >
      {tasks.map((task) => (
        <li key={task.taskId}>
          <button
            aria-pressed={selectedTaskId === task.taskId}
            className={`w-full rounded-lg border px-2 py-1.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800 ${selectedTaskId === task.taskId ? "border-blue-700 bg-blue-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}
            data-testid="project-workflow-step"
            data-workflow-task-id={task.taskId}
            onClick={() => onSelectTask(task.taskId)}
            type="button"
          >
            <span className="block break-words text-[11px] font-semibold leading-4 text-slate-900">
              {workflowCopy.stepTitles[task.stepKey]}
            </span>
            <span className="mt-1 block text-[9px] leading-4 text-slate-600">
              {taskStatus(task, locale)}
            </span>
            <span className="mt-0.5 block text-[9px] leading-4 text-slate-500">
              {workflowCopy.responsibleActorTitle}:{" "}
              {workflowCopy.responsibleActor[task.responsibleActor]}
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}

function SourceRevisionList({
  task,
  locale,
}: {
  task: WorkflowTaskProjectionV1;
  locale: string;
}) {
  const copy = getProjectWorkflowCopy(locale);
  if (!task.sourceRevisions.length) {
    return null;
  }
  return (
    <ul className="mt-1 space-y-1 text-[10px] leading-4 text-slate-500">
      {task.sourceRevisions.map((source) => (
        <li key={`${source.targetKind}:${source.targetId}`}>
          {copy.sourceRevision(
            source.targetKind,
            source.targetId,
            source.revision
          )}
        </li>
      ))}
    </ul>
  );
}

function fieldValue(
  value: string | null | undefined,
  fallback: string
): string {
  return value?.trim() || fallback;
}

function MetadataRows({ children }: { children: ReactNode }) {
  return (
    <dl className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-x-3 gap-y-1 text-xs leading-5">
      {children}
    </dl>
  );
}

function MetadataRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <>
      <dt className="text-slate-500">{label}</dt>
      <dd className="break-words text-right text-slate-800">{value}</dd>
    </>
  );
}

function ProjectWorkflowBusinessContext({
  journey,
  task,
  node,
  locale,
  journeyCopy,
}: {
  journey: ProjectJourney;
  task: WorkflowTaskProjectionV1;
  node: ProjectJourneyNode | null;
  locale: string;
  journeyCopy: JourneyCopy;
}) {
  const copy = getProjectWorkflowCopy(locale);
  const fallback = copy.unknownValue;
  if (task.targetKind === "project") {
    if (task.stepKey === "source_coverage") {
      const sourceKey =
        task.workflowKind === "school_application"
          ? "schoolApplications"
          : task.workflowKind === "school_admissions"
            ? "schoolAdmissions"
            : "student500";
      const source = journey.sources.find((entry) => entry.key === sourceKey);
      return (
        <div
          className="space-y-3"
          data-testid="project-workflow-source-context"
        >
          <MetadataRows>
            <MetadataRow
              label={copy.targetIdentity}
              value={journey.project.id}
            />
            <MetadataRow
              label={copy.projectStatus}
              value={journey.project.status}
            />
            <MetadataRow
              label={copy.projectRevision}
              value={journey.project.revision}
            />
          </MetadataRows>
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs leading-5 text-amber-950">
            {source
              ? `${journeyCopy.sourceNames[source.key]} · ${journeyCopy.capability[source.state]}`
              : copy.genericReason}
            {source?.reasonCode
              ? ` · ${journeyCopy.reasonLabels[source.reasonCode] ?? journeyCopy.genericReason}`
              : ""}
          </p>
        </div>
      );
    }
    const recordedRoutes = journey.nodes.filter(
      (candidate) => candidate.kind === "route_entry" && candidate.route
    );
    return (
      <div
        className="space-y-3"
        data-testid="project-workflow-planning-context"
      >
        <p className="rounded-lg bg-amber-50 p-2 text-xs leading-5 text-amber-950">
          {copy.projectGoalUnknown} {copy.projectScopeUnknown}
        </p>
        <MetadataRows>
          <MetadataRow label={copy.targetIdentity} value={journey.project.id} />
          <MetadataRow
            label={copy.projectStatus}
            value={journey.project.status}
          />
          <MetadataRow
            label={copy.projectRevision}
            value={journey.project.revision}
          />
          <MetadataRow
            label={copy.fields.serviceScope}
            value={`${journey.project.serviceScope.state} · ${journey.project.serviceScope.engagements?.length ?? 0}`}
          />
        </MetadataRows>
        <section aria-label={copy.panelHeading} className="space-y-1.5">
          {journey.sources.map((source) => (
            <div
              className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[11px]"
              key={source.key}
            >
              <span className="break-words text-slate-700">
                {journeyCopy.sourceNames[source.key]}
              </span>
              <span className="shrink-0 font-semibold text-slate-800">
                {journeyCopy.capability[source.state]}
                {source.recordCount === null ? "" : ` · ${source.recordCount}`}
              </span>
            </div>
          ))}
        </section>
        <section
          aria-label={copy.recordedProjectRoutes}
          className="space-y-1.5"
          data-testid="project-workflow-recorded-routes"
        >
          <h4 className="text-xs font-semibold text-slate-800">
            {copy.recordedProjectRoutes}
          </h4>
          {recordedRoutes.length ? (
            <ul className="space-y-1 text-[11px] leading-5 text-slate-700">
              {recordedRoutes.map((routeNode) => {
                const route = routeNode.route;
                if (!route) {
                  return null;
                }
                const parent = journey.nodes.find(
                  (candidate) => candidate.id === route.parentNodeId
                );
                const admission =
                  parent?.kind === "admission_case" &&
                  parent.record &&
                  "outcomes" in parent.record
                    ? parent.record
                    : null;
                const student =
                  parent?.kind === "student500_application" &&
                  parent.record &&
                  "entryRoute" in parent.record
                    ? parent.record
                    : null;
                const routeLabel =
                  routeNode.sourceKey === "schoolAdmissions"
                    ? (copy.admissions.originLabels[route.code] ?? fallback)
                    : (copy.student.routeLabels[route.code] ?? fallback);
                return (
                  <li className="rounded bg-white px-2 py-1" key={routeNode.id}>
                    <p>
                      {routeLabel} · {copy.targetIdentity}: {routeNode.targetId}
                    </p>
                    <p>
                      {copy.fields.status}: {parent?.progress ?? fallback}
                    </p>
                    {admission?.outcomes.length ? (
                      <ul className="ml-3 list-disc">
                        {admission.outcomes.map((outcome) => (
                          <li key={outcome.outcomeId}>
                            {outcome.kind.toUpperCase()} · {outcome.state} ·{" "}
                            {outcome.independentlyVerified
                              ? journeyCopy.independentlyVerified
                              : journeyCopy.notIndependentlyVerified}{" "}
                            ·{" "}
                            {outcome.evidenceAttached
                              ? journeyCopy.evidenceAttached
                              : journeyCopy.evidenceNotRecorded}
                            {outcome.superseded
                              ? ` · ${journeyCopy.superseded}`
                              : ""}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {student ? (
                      <p>
                        {copy.student.coeStatus}:{" "}
                        {copy.student.coeStatusLabels[student.coeStatus] ??
                          fallback}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-[11px] leading-5 text-slate-600">
              {copy.noRecordedProjectRoutes}
            </p>
          )}
        </section>
        {journey.projectIssues.length ? (
          <section
            className="space-y-1.5"
            data-testid="project-workflow-project-issues"
          >
            <h4 className="text-xs font-semibold text-slate-800">
              {journeyCopy.projectIssuesTitle}
            </h4>
            <ul className="space-y-1 text-[11px] leading-5 text-slate-700">
              {journey.projectIssues.map((code) => (
                <li className="rounded bg-amber-50 px-2 py-1" key={code}>
                  {journeyCopy.reasonLabels[code] ?? journeyCopy.genericReason}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {journey.projectActions.length ? (
          <section
            className="space-y-1.5"
            data-testid="project-workflow-project-next-actions"
          >
            <h4 className="text-xs font-semibold text-slate-800">
              {journeyCopy.actionsTitle}
            </h4>
            <ul className="space-y-1 text-[11px] leading-5 text-slate-700">
              {journey.projectActions.map((action) => (
                <li
                  className="rounded bg-white px-2 py-1"
                  key={`${action.code}:${action.targetId}`}
                >
                  {journeyCopy.actionLabels[action.code] ??
                    journeyCopy.genericReason}{" "}
                  · {journeyCopy.responsibility[action.responsibleActor]}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    );
  }
  if (!node?.record) {
    return (
      <p className="rounded-lg bg-amber-50 p-2 text-xs leading-5 text-amber-950">
        {journeyCopy.unavailable}
      </p>
    );
  }
  if (node.kind === "school_application" && "institution" in node.record) {
    const record = node.record;
    return (
      <div className="space-y-3" data-testid="project-workflow-school-context">
        <MetadataRows>
          <MetadataRow
            label={copy.targetIdentity}
            value={record.applicationId}
          />
          <MetadataRow
            label={copy.fields.institution}
            value={record.institution.name}
          />
          <MetadataRow label={copy.fields.course} value={record.course.title} />
          <MetadataRow
            label={copy.fields.intake}
            value={record.intake.label ?? fallback}
          />
          <MetadataRow label={copy.fields.status} value={record.status} />
          <MetadataRow
            label={copy.school.sourceStatus}
            value={
              copy.school.sourceStatusLabels[record.source.status] ?? fallback
            }
          />
          <MetadataRow
            label={copy.school.packageState}
            value={
              record.package
                ? `${record.package.status} · v${record.package.version}`
                : fallback
            }
          />
          <MetadataRow
            label={copy.fields.missingInformation}
            value={
              record.missingInformationCodes.length
                ? record.missingInformationCodes
                    .map(
                      (code) =>
                        journeyCopy.reasonLabels[code] ??
                        journeyCopy.genericReason
                    )
                    .join(" · ")
                : fallback
            }
          />
        </MetadataRows>
        {record.package?.staleReasonCodes.length ? (
          <p className="rounded-lg bg-amber-50 p-2 text-[11px] leading-5 text-amber-950">
            {record.package.staleReasonCodes
              .map(
                (code) =>
                  journeyCopy.reasonLabels[code] ?? journeyCopy.genericReason
              )
              .join(" · ")}
          </p>
        ) : null}
        <p className="text-[11px] leading-5 text-slate-600">
          {copy.school.noRequirements} {copy.school.noSubmission}
        </p>
      </div>
    );
  }
  if (node.kind === "admission_case" && "outcomes" in node.record) {
    const record = node.record;
    return (
      <div
        className="space-y-3"
        data-testid="project-workflow-admissions-context"
      >
        <MetadataRows>
          <MetadataRow label={copy.targetIdentity} value={record.caseId} />
          <MetadataRow
            label={copy.admissions.origin}
            value={copy.admissions.originLabels[record.originKind] ?? fallback}
          />
          <MetadataRow
            label={copy.fields.institution}
            value={record.institutionName}
          />
          <MetadataRow
            label={copy.fields.course}
            value={fieldValue(record.courseTitle, fallback)}
          />
          <MetadataRow
            label={copy.fields.intake}
            value={fieldValue(record.intakeLabel, fallback)}
          />
          <MetadataRow
            label={copy.admissions.serviceMode}
            value={
              copy.admissions.serviceModeLabels[record.serviceMode] ?? fallback
            }
          />
          <MetadataRow
            label={copy.admissions.preparation}
            value={record.preparationState}
          />
          <MetadataRow
            label={copy.admissions.handoff}
            value={`${record.externalHandoff.status} · ${journeyCopy.handoffIsNotReceipt}`}
          />
        </MetadataRows>
        <section className="space-y-1.5">
          <h4 className="text-xs font-semibold text-slate-800">
            {copy.admissions.requirementStatus}
          </h4>
          {record.requirements.length ? (
            <ul className="space-y-1 text-[11px] leading-5 text-slate-700">
              {record.requirements.map((requirement, index) => (
                <li
                  className="rounded bg-slate-50 px-2 py-1"
                  key={`${requirement.code}-${index}`}
                >
                  {requirement.code} · {requirement.status}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[11px] text-slate-600">
              {copy.fields.noRequirements}
            </p>
          )}
        </section>
        <section className="space-y-1.5">
          <h4 className="text-xs font-semibold text-slate-800">
            {copy.admissions.outcomeEvidence}
          </h4>
          {record.outcomes.length ? (
            <ul className="space-y-1 text-[11px] leading-5 text-slate-700">
              {record.outcomes.map((outcome) => (
                <li
                  className="rounded bg-slate-50 px-2 py-1"
                  key={outcome.outcomeId}
                >
                  {outcome.kind.toUpperCase()} · {outcome.state} ·{" "}
                  {outcome.independentlyVerified
                    ? journeyCopy.independentlyVerified
                    : journeyCopy.notIndependentlyVerified}{" "}
                  ·{" "}
                  {outcome.evidenceAttached
                    ? journeyCopy.evidenceAttached
                    : journeyCopy.evidenceNotRecorded}
                  {outcome.superseded ? ` · ${journeyCopy.superseded}` : ""}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[11px] text-slate-600">
              {copy.admissions.noOutcome}
            </p>
          )}
        </section>
      </div>
    );
  }
  if (node.kind === "student500_application" && "preparation" in node.record) {
    const record = node.record;
    const dependency = record.schoolDependency;
    const studyContext = record.preparation.schoolContext;
    const dependencyIdentity =
      "schoolApplicationId" in dependency
        ? dependency.schoolApplicationId
        : "admissionCaseId" in dependency
          ? dependency.admissionCaseId
          : null;
    return (
      <div
        className="space-y-3"
        data-testid="project-workflow-student500-context"
      >
        <MetadataRows>
          <MetadataRow
            label={copy.targetIdentity}
            value={record.applicationId}
          />
          <MetadataRow
            label={copy.student.route}
            value={
              copy.student.routeLabels[record.entryRoute ?? ""] ?? fallback
            }
          />
          <MetadataRow
            label={copy.student.coeStatus}
            value={copy.student.coeStatusLabels[record.coeStatus] ?? fallback}
          />
          <MetadataRow
            label={copy.student.schoolDependency}
            value={`${copy.student.dependencyLabels[dependency.state] ?? fallback}${dependencyIdentity ? ` · ${dependencyIdentity}` : ""}`}
          />
          <MetadataRow
            label={copy.student.sourceVerification}
            value={record.sourceVerification}
          />
          <MetadataRow
            label={copy.student.preparation}
            value={journeyCopy.preparationState[record.preparation.state]}
          />
          <MetadataRow
            label={copy.student.drafts(record.preparation.drafts.length)}
            value={
              record.preparation.drafts
                .map(
                  (draft) =>
                    `v${draft.version}${draft.stale ? ` · ${copy.fields.stale}` : ""}`
                )
                .join(", ") || fallback
            }
          />
          <MetadataRow
            label={copy.student.snapshots(record.preparation.snapshots.length)}
            value={
              record.preparation.snapshots
                .map(
                  (snapshot) =>
                    `v${snapshot.version} · ${copy.student.currentnessLabels[snapshot.legalCurrentness] ?? fallback}${snapshot.stale ? ` · ${copy.fields.stale}` : ""}`
                )
                .join(", ") || fallback
            }
          />
        </MetadataRows>
        {studyContext ? (
          <div className="rounded-lg bg-slate-50 p-2 text-[11px] leading-5 text-slate-700">
            <p>
              {copy.student.schoolContext}: {studyContext.kind}
              {"schoolApplicationId" in studyContext &&
              studyContext.schoolApplicationId
                ? ` · ${studyContext.schoolApplicationId}`
                : "admissionCaseId" in studyContext &&
                    studyContext.admissionCaseId
                  ? ` · ${studyContext.admissionCaseId}`
                  : ""}
            </p>
            <p>
              {copy.student.studyEvidenceKind}:{" "}
              {copy.student.studyEvidenceLabels[
                studyContext.studyEvidenceKind
              ] ?? fallback}
            </p>
            <p>
              {studyContext.current
                ? copy.student.contextCurrent
                : copy.student.contextNotCurrent}{" "}
              ·{" "}
              {studyContext.independentlyVerified
                ? copy.student.independent
                : copy.student.notIndependent}
            </p>
          </div>
        ) : (
          <p className="text-[11px] leading-5 text-slate-600">
            {copy.student.noStudyContext}
          </p>
        )}
        {record.missingInformationCodes.length ? (
          <p className="rounded-lg bg-amber-50 p-2 text-[11px] leading-5 text-amber-950">
            {record.missingInformationCodes
              .map(
                (code) =>
                  journeyCopy.reasonLabels[code] ?? journeyCopy.genericReason
              )
              .join(" · ")}
          </p>
        ) : null}
        <p className="text-[11px] leading-5 text-slate-600">
          {copy.student.noGovernmentState}
        </p>
      </div>
    );
  }
  return <p className="text-xs text-slate-600">{copy.genericReason}</p>;
}

export function ProjectWorkflowTaskDetails({
  journey,
  journeyCopy,
  locale,
  task,
}: {
  journey: ProjectJourney;
  journeyCopy: JourneyCopy;
  locale: string;
  task: WorkflowTaskProjectionV1 | null;
}) {
  const copy = getProjectWorkflowCopy(locale);
  if (!task) {
    return (
      <p className="text-xs leading-5 text-slate-600">{copy.selectStep}</p>
    );
  }
  const nodeId = projectWorkbenchNodeIdForWorkflowTask(journey, task);
  const node = nodeId
    ? (journey.nodes.find((entry) => entry.id === nodeId) ?? null)
    : null;
  return (
    <section
      className="space-y-3 rounded-xl border border-slate-200 bg-white p-3"
      data-testid="project-workflow-task-details"
    >
      <div className="space-y-1">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          {copy.profileLabels[task.workflowKind]} · {task.definitionVersion}
        </p>
        <h3 className="text-sm font-semibold text-slate-950">
          {copy.stepTitles[task.stepKey]}
        </h3>
        <p className="text-[11px] leading-5 text-slate-600">
          {copy.stepDescriptions[task.stepKey]}
        </p>
        <span
          className={`inline-flex rounded-full px-2 py-1 text-[10px] font-semibold ${progressClasses(task.progress)}`}
        >
          {taskStatus(task, locale)}
        </span>
        <p className="text-[10px] leading-4 text-slate-600">
          {copy.responsibleActorTitle}:{" "}
          {copy.responsibleActor[task.responsibleActor]}
        </p>
      </div>
      <ProjectWorkflowBusinessContext
        journey={journey}
        journeyCopy={journeyCopy}
        locale={locale}
        node={node}
        task={task}
      />
      <div className="border-t border-slate-200 pt-2">
        <h4 className="text-xs font-semibold text-slate-800">
          {copy.stepDetails}
        </h4>
        <TaskReasons locale={locale} task={task} />
        {task.sourceRevisions.length ? (
          <SourceRevisionList locale={locale} task={task} />
        ) : null}
        {task.dependencies.length ? (
          <div className="mt-2 rounded-lg bg-indigo-50 p-2 text-[10px] leading-4 text-indigo-950">
            <p className="font-semibold">{copy.relatedRecords}</p>
            <p>{copy.relationshipOnly}</p>
            {task.dependencies.map((dependencyId) => {
              const dependency = journey.workflowProjection.tasks.find(
                (entry) => entry.taskId === dependencyId
              );
              return dependency ? (
                <p key={dependencyId}>
                  {copy.stepTitles[dependency.stepKey]} ·{" "}
                  {dependency.targetKind} {dependency.targetId}
                </p>
              ) : null;
            })}
          </div>
        ) : null}
        <p className="mt-2 text-[10px] leading-4 text-slate-500">
          {copy.completionEvidence} {copy.notEligibility}
        </p>
      </div>
    </section>
  );
}

export function ProjectWorkflowProgressSummary({
  compact = false,
  progress,
  locale,
}: {
  compact?: boolean;
  progress: ProjectProgressV1;
  locale: string;
}) {
  const copy = getProjectWorkflowCopy(locale);
  if (compact) {
    const compactCoverageClass =
      progress.coverage === "complete"
        ? "bg-emerald-50 text-emerald-900"
        : "bg-amber-100 text-amber-950";
    return (
      <output
        aria-live="polite"
        className="flex min-w-0 items-center gap-2 rounded-lg bg-slate-50 px-2 py-1"
        data-testid="project-workflow-progress-summary"
        data-variant="compact"
      >
        <span
          aria-hidden="true"
          className="whitespace-nowrap text-xs font-semibold text-slate-900"
        >
          {copy.compactKnownProgress(
            progress.completedKnownApplicable,
            progress.knownApplicableTotal
          )}
        </span>
        <span
          aria-hidden="true"
          className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${compactCoverageClass}`}
          title={copy.coverage[progress.coverage]}
        >
          {copy.compactCoverage[progress.coverage]}
        </span>
        <span className="sr-only">
          {copy.knownProgress(
            progress.completedKnownApplicable,
            progress.knownApplicableTotal
          )}
          . {copy.coverage[progress.coverage]}
        </span>
      </output>
    );
  }

  const lines = [
    copy.unknownApplicability(progress.unknownApplicabilityCount),
    copy.unavailableTasks(progress.unavailableCount),
    copy.notApplicableTasks(progress.notApplicableCount),
    copy.unknownProgressTasks(progress.unknownProgressCount),
  ].filter(
    (_line, index) =>
      [
        progress.unknownApplicabilityCount,
        progress.unavailableCount,
        progress.notApplicableCount,
        progress.unknownProgressCount,
      ][index] > 0
  );
  return (
    <div
      className="space-y-1.5 rounded-lg bg-slate-50 p-3"
      data-testid="project-workflow-progress-summary"
      data-variant="detailed"
    >
      <p className="text-sm font-semibold text-slate-900">
        {copy.knownProgress(
          progress.completedKnownApplicable,
          progress.knownApplicableTotal
        )}
      </p>
      <p className="text-xs leading-5 text-slate-600">
        {copy.coverage[progress.coverage]}
      </p>
      {progress.percent !== null ? (
        <progress
          aria-label={copy.progressBarLabel}
          className="h-2 w-full accent-blue-800"
          max={100}
          value={progress.percent}
        >
          {progress.percent}%
        </progress>
      ) : null}
      {lines.map((line) => (
        <p className="text-xs text-amber-900" key={line}>
          {line}
        </p>
      ))}
    </div>
  );
}

export function ProjectWorkflowProgressDetails({
  projection,
  locale,
}: {
  projection: ProjectWorkflowProjectionV1;
  locale: string;
}) {
  const copy = getProjectWorkflowCopy(locale);
  return (
    <section
      className="space-y-3"
      data-testid="project-workflow-progress-details"
    >
      <ProjectWorkflowProgressSummary
        locale={locale}
        progress={projection.progress}
      />
      <p className="text-xs leading-5 text-slate-600">{copy.notEligibility}</p>
      <ol className="space-y-2">
        {projection.tasks.map((task) => (
          <li
            className="rounded-lg border border-slate-200 p-3"
            key={task.taskId}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-900">
                  {copy.profileLabels[task.workflowKind]} ·{" "}
                  {copy.stepTitles[task.stepKey]}
                </p>
                <p className="break-all font-mono text-[10px] text-slate-500">
                  {task.targetKind} · {task.targetId}
                </p>
              </div>
              <span
                className={`rounded-full px-2 py-1 text-[10px] font-semibold ${progressClasses(task.progress)}`}
              >
                {taskStatus(task, locale)}
              </span>
            </div>
            <TaskReasons locale={locale} task={task} />
            <SourceRevisionList locale={locale} task={task} />
            {task.dependencies.length ? (
              <div className="mt-1 space-y-1 text-[10px] leading-4 text-indigo-900">
                {task.dependencies.map((dependencyId) => {
                  const related = projection.tasks.find(
                    (entry) => entry.taskId === dependencyId
                  );
                  return related ? (
                    <p key={dependencyId}>
                      {copy.relationshipOnly} {copy.stepTitles[related.stepKey]}{" "}
                      · {related.targetKind} {related.targetId}
                    </p>
                  ) : null;
                })}
              </div>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
