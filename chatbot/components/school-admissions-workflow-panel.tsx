"use client";

import { GraduationCap, Loader2, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  createSchoolAdmissionsController,
  type SchoolAdmissionsCase,
  type SchoolAdmissionsErrorKind,
} from "@/lib/workspace/school-admissions";
import type { WorkspaceCopy } from "@/lib/workspace-copy";

/**
 * Phase 13 M5.2 School Admissions workflow panel.
 *
 * Rendered inside the existing Project workspace. Every state shown is a
 * preparation/observation state: no admission decision, no verified Offer/CoE, no
 * Student 500 eligibility and no institutional submission is ever displayed.
 */

type PanelCopy = WorkspaceCopy["schoolAdmissions"];

function errorMessage(
  error: SchoolAdmissionsErrorKind | null,
  copy: PanelCopy
): string | null {
  switch (error) {
    case null:
      return null;
    case "authentication_required":
    case "not_found":
      return copy.errorNotFound;
    case "state_changed":
      return copy.errorStateChanged;
    case "authority_unavailable":
      return copy.errorAuthority;
    case "unavailable":
      return copy.errorUnavailable;
    case "invalid_request":
      return copy.errorInvalid;
    default:
      return copy.actionFailed;
  }
}

function label(
  dictionary: Record<string, string>,
  key: string | null | undefined
): string {
  if (!key) {
    return "";
  }
  return dictionary[key] ?? key;
}

function statusTone(status: string): string {
  if (status === "satisfied") {
    return "bg-emerald-50 text-emerald-800";
  }
  if (status === "missing") {
    return "bg-red-50 text-red-800";
  }
  if (status === "conflicting") {
    return "bg-amber-50 text-amber-900";
  }
  if (status === "unverified") {
    return "bg-sky-50 text-sky-900";
  }
  return "bg-slate-100 text-slate-700";
}

export function SchoolAdmissionsWorkflowPanel({
  copy,
  projectId,
  enabled = false,
}: {
  copy: PanelCopy;
  projectId: string;
  enabled?: boolean;
}) {
  return (
    <SchoolAdmissionsWorkflowPanelInstance
      copy={copy}
      enabled={enabled}
      key={`${projectId}:${enabled ? "on" : "off"}`}
      projectId={projectId}
    />
  );
}

function SchoolAdmissionsWorkflowPanelInstance({
  copy,
  projectId,
  enabled,
}: {
  copy: PanelCopy;
  projectId: string;
  enabled: boolean;
}) {
  const [controller] = useState(() => createSchoolAdmissionsController());
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot
  );
  const [creating, setCreating] = useState(false);
  const [originKind, setOriginKind] = useState("school_application");
  const [selectedApplicationId, setSelectedApplicationId] = useState("");
  const [institutionName, setInstitutionName] = useState("");
  const [courseTitle, setCourseTitle] = useState("");
  const [intakeLabel, setIntakeLabel] = useState("");
  const [selectedDocumentId, setSelectedDocumentId] = useState("");
  const [externalAction, setExternalAction] = useState(
    "school_portal_submission"
  );
  const [exceptionText, setExceptionText] = useState("");
  const loadedProject = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || loadedProject.current === projectId) {
      return;
    }
    loadedProject.current = projectId;
    controller.load(projectId).catch(() => undefined);
  }, [controller, enabled, projectId]);

  if (!enabled) {
    return null;
  }

  const detail = snapshot.detail;
  const busy = snapshot.pendingAction !== null;
  const message = errorMessage(snapshot.error, copy);
  const selectableApplications = snapshot.applications.filter(
    (entry) => !(entry.archived || entry.hasCase)
  );

  async function submitCreate() {
    const standalone = originKind !== "school_application";
    const error = await controller.create(projectId, {
      applicationId: standalone ? null : selectedApplicationId,
      courseTitle: standalone ? courseTitle : null,
      institutionName: standalone ? institutionName : null,
      intakeLabel: standalone ? intakeLabel : null,
      originKind,
    });
    if (error === null) {
      setCreating(false);
      setSelectedApplicationId("");
      setInstitutionName("");
      setCourseTitle("");
      setIntakeLabel("");
    }
  }

  function renderOutcome(
    outcome: NonNullable<SchoolAdmissionsCase["offer"]>,
    actions: readonly string[]
  ) {
    return (
      <div
        className="rounded-lg border border-slate-200 bg-white p-2 text-xs"
        data-testid={`admissions-outcome-${outcome.kind}`}
        key={outcome.outcomeId}
      >
        <p className="font-semibold text-slate-900">
          {outcome.kind === "offer" ? copy.offerHeading : copy.coeHeading} ·{" "}
          {label(
            outcome.kind === "offer" ? copy.offerState : copy.coeState,
            outcome.state
          )}
        </p>
        <p className="text-[11px] text-slate-600">
          {outcome.provenance}
          {outcome.independentlyVerified ? " · verified" : ""}
          {outcome.evidenceAttached ? " · evidence attached" : ""}
        </p>
        {outcome.kind === "offer" ? (
          <p className="text-[11px] text-slate-600">
            {label(copy.expiryState, outcome.expiryState)}
            {outcome.expiresOn ? ` · ${outcome.expiresOn}` : ""}
          </p>
        ) : null}
        {actions.length > 0 && !outcome.superseded && detail ? (
          <div className="mt-1 flex flex-wrap gap-1">
            {actions.map((action) => (
              <button
                className="rounded-md bg-slate-900 px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
                data-testid={`admissions-transition-${outcome.kind}-${action}`}
                disabled={busy}
                key={action}
                onClick={() =>
                  controller
                    .transitionOutcome(projectId, detail, outcome, action)
                    .catch(() => undefined)
                }
                type="button"
              >
                {label(copy.offerAction, action)}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <section
      aria-label={copy.title}
      className="mt-3 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3"
      data-testid="school-admissions-panel"
    >
      <header className="space-y-1">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-950">
          <GraduationCap aria-hidden="true" className="size-4" />
          {copy.title}
        </h3>
        <p className="text-xs leading-5 text-slate-600">{copy.subtitle}</p>
        <p className="rounded-lg bg-amber-50 px-2 py-1.5 text-[11px] leading-4 text-amber-900">
          {copy.notice}
        </p>
      </header>

      {message ? (
        <p className="text-xs text-red-700" role="alert">
          {message}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <button
          className="rounded-lg bg-[#001736] px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          data-testid="admissions-create-open"
          disabled={busy}
          onClick={() => setCreating((value) => !value)}
          type="button"
        >
          {copy.createTitle}
        </button>
        <button
          className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-50"
          disabled={busy}
          onClick={() => controller.load(projectId).catch(() => undefined)}
          type="button"
        >
          <RefreshCw aria-hidden="true" className="size-3" />
          {copy.refresh}
        </button>
        {busy ? (
          <Loader2
            aria-hidden="true"
            className="size-3 animate-spin text-slate-500"
          />
        ) : null}
      </div>

      {creating ? (
        <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-2">
          <p className="text-xs font-semibold text-slate-900">
            {copy.createTitle}
          </p>
          <p className="text-[11px] leading-4 text-slate-600">
            {copy.createDescription}
          </p>
          <label className="block text-[11px] font-medium text-slate-700">
            {copy.originLabel}
            <select
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
              data-testid="admissions-origin"
              onChange={(event) => setOriginKind(event.target.value)}
              value={originKind}
            >
              {Object.keys(copy.origin).map((key) => (
                <option key={key} value={key}>
                  {copy.origin[key]}
                </option>
              ))}
            </select>
          </label>
          {originKind === "school_application" ? (
            <div className="space-y-1">
              <label className="block text-[11px] font-medium text-slate-700">
                {copy.selectApplicationLabel}
                <select
                  className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
                  data-testid="admissions-application"
                  onChange={(event) =>
                    setSelectedApplicationId(event.target.value)
                  }
                  value={selectedApplicationId}
                >
                  <option value="">
                    {selectableApplications.length === 0
                      ? copy.noSelectableApplications
                      : copy.selectApplicationPlaceholder}
                  </option>
                  {selectableApplications.map((entry) => (
                    <option
                      key={entry.applicationId}
                      value={entry.applicationId}
                    >
                      {entry.institutionName} · {entry.courseTitle}
                      {entry.intakeLabel ? ` · ${entry.intakeLabel}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <p className="text-[11px] text-slate-600">
                {copy.createFromApplication}
              </p>
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-3">
              <input
                className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                data-testid="admissions-institution"
                onChange={(event) => setInstitutionName(event.target.value)}
                placeholder={copy.institutionLabel}
                value={institutionName}
              />
              <input
                className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                data-testid="admissions-course"
                onChange={(event) => setCourseTitle(event.target.value)}
                placeholder={copy.courseLabel}
                value={courseTitle}
              />
              <input
                className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                onChange={(event) => setIntakeLabel(event.target.value)}
                placeholder={copy.intakeLabel}
                value={intakeLabel}
              />
            </div>
          )}
          <div className="flex gap-2">
            <button
              className="rounded-lg bg-[#001736] px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
              data-testid="admissions-create-submit"
              disabled={busy}
              onClick={() => submitCreate().catch(() => undefined)}
              type="button"
            >
              {copy.createTitle}
            </button>
            <button
              className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700"
              onClick={() => setCreating(false)}
              type="button"
            >
              ✕
            </button>
          </div>
        </div>
      ) : null}

      {snapshot.loading ? (
        <p className="text-xs text-slate-500">{copy.loading}</p>
      ) : null}

      {snapshot.loading || snapshot.cases.length > 0 ? null : (
        <p className="rounded-lg bg-white p-2 text-xs text-slate-500">
          {copy.empty}
        </p>
      )}

      <div className="space-y-1">
        {snapshot.cases.map((entry) => (
          <button
            className={`w-full rounded-lg border px-2 py-1.5 text-left text-xs ${
              detail?.caseId === entry.caseId
                ? "border-slate-900 bg-white"
                : "border-slate-200 bg-white/60"
            }`}
            data-testid="admissions-case"
            key={entry.caseId}
            onClick={() =>
              controller.open(projectId, entry.caseId).catch(() => undefined)
            }
            type="button"
          >
            <span className="flex items-center justify-between gap-2">
              <span className="font-semibold text-slate-900">
                {entry.institutionName}
                {entry.courseTitle ? ` · ${entry.courseTitle}` : ""}
              </span>
              <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-700">
                {label(copy.serviceMode, entry.serviceMode)}
              </span>
            </span>
            <span className="mt-0.5 block text-[11px] text-slate-600">
              {label(copy.origin, entry.originKind)} ·{" "}
              {label(copy.offerState, entry.journey.offerState)} ·{" "}
              {label(copy.coeState, entry.journey.coeState)}
            </span>
          </button>
        ))}
      </div>

      {detail ? (
        <div className="space-y-2" data-testid="admissions-detail">
          <div className="rounded-lg bg-white p-2 text-xs">
            <p className="font-semibold text-slate-900">
              {detail.institutionName}
              {detail.courseTitle ? ` · ${detail.courseTitle}` : ""}
            </p>
            <p className="text-[11px] text-slate-600">
              {label(copy.origin, detail.originKind)} ·{" "}
              {detail.intakeLabel ?? "—"} · rev {detail.revision}
            </p>
            <div className="mt-1 flex flex-wrap gap-1">
              {(["self_service", "managed_service"] as const).map((mode) => (
                <button
                  className={`rounded-md px-2 py-1 text-[11px] font-semibold ${
                    detail.serviceMode === mode
                      ? "bg-slate-900 text-white"
                      : "border border-slate-300 bg-white text-slate-700"
                  } disabled:opacity-50`}
                  data-testid={`admissions-mode-${mode}`}
                  disabled={busy || detail.serviceMode === mode}
                  key={mode}
                  onClick={() =>
                    controller
                      .setServiceMode(projectId, detail, mode)
                      .catch(() => undefined)
                  }
                  type="button"
                >
                  {label(copy.serviceMode, mode)}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[11px] leading-4 text-slate-600">
              {detail.serviceMode === "managed_service"
                ? copy.managedNotice
                : copy.selfNotice}
            </p>
          </div>

          <div className="rounded-lg bg-white p-2">
            <p className="text-xs font-semibold text-slate-900">
              {copy.checklistHeading}
            </p>
            <ul className="mt-1 space-y-1">
              {detail.requirements.map((requirement) => (
                <li
                  className="flex items-center justify-between gap-2 text-[11px]"
                  key={requirement.code}
                >
                  <span className="text-slate-700">
                    {label(copy.requirement, requirement.code)}
                  </span>
                  <span
                    className={`rounded-full px-1.5 py-0.5 ${statusTone(requirement.status)}`}
                  >
                    {label(copy.requirementStatus, requirement.status)}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-lg bg-white p-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-slate-900">
                {copy.draftHeading}
              </p>
              <div className="flex gap-1">
                <button
                  className="rounded-md border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-700 disabled:opacity-50"
                  data-testid="admissions-prepare"
                  disabled={busy}
                  onClick={() =>
                    controller.prepare(projectId, detail).catch(() => undefined)
                  }
                  type="button"
                >
                  {copy.draftHeading}
                </button>
                <button
                  className="rounded-md bg-slate-900 px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
                  data-testid="admissions-confirm"
                  disabled={
                    busy ||
                    !detail.preparation ||
                    detail.preparation.stale ||
                    detail.preparation.confirmedAt !== null
                  }
                  onClick={() =>
                    controller
                      .confirmPreparation(projectId, detail)
                      .catch(() => undefined)
                  }
                  type="button"
                >
                  {copy.confirmDraft}
                </button>
              </div>
            </div>
            <p className="mt-1 text-[11px] leading-4 text-amber-900">
              {detail.preparationStale
                ? copy.staleNotice
                : detail.preparation?.confirmedAt
                  ? copy.confirmedNotice
                  : copy.provisionalNotice}
            </p>
            {detail.preparation ? (
              <div className="mt-1 space-y-1">
                {detail.preparation.sections.map((section) => (
                  <div key={section.code}>
                    <p className="text-[11px] font-semibold text-slate-800">
                      {label(copy.section, section.code)}
                    </p>
                    <p className="text-[11px] leading-4 text-slate-600">
                      {section.text}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {detail ? (
        <div className="space-y-2">
          <div className="rounded-lg bg-white p-2">
            <p className="text-xs font-semibold text-slate-900">
              {copy.offerHeading}
            </p>
            {detail.offer ? (
              renderOutcome(detail.offer, [
                "start_review",
                "accept",
                "decline",
                "defer",
                "expire",
              ])
            ) : (
              <p className="text-[11px] text-slate-600">
                {label(copy.offerState, detail.journey.offerState)}
              </p>
            )}
            <button
              className="mt-1 rounded-md border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-700 disabled:opacity-50"
              data-testid="admissions-record-offer"
              disabled={busy}
              onClick={() =>
                controller.recordOffer(projectId, detail).catch(() => undefined)
              }
              type="button"
            >
              {copy.recordOffer}
            </button>
            {snapshot.documents.length > 0 ? (
              <button
                className="mt-1 ml-1 rounded-md border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-700 disabled:opacity-50"
                data-testid="admissions-record-offer-document"
                disabled={busy || selectedDocumentId.length === 0}
                onClick={() =>
                  controller
                    .recordOffer(projectId, detail, {
                      evidenceReferenceId: selectedDocumentId,
                    })
                    .catch(() => undefined)
                }
                type="button"
              >
                {copy.recordWithDocument}
              </button>
            ) : null}
          </div>

          <div className="rounded-lg bg-white p-2">
            <p className="text-xs font-semibold text-slate-900">
              {copy.coeHeading}
            </p>
            {detail.coe ? (
              renderOutcome(detail.coe, [])
            ) : (
              <p className="text-[11px] text-slate-600">
                {label(copy.coeState, detail.journey.coeState)}
              </p>
            )}
            <p className="mt-1 text-[11px] leading-4 text-slate-600">
              {copy.evidenceNotice}
            </p>
            {snapshot.documents.length > 0 ? (
              <label className="mt-1 block text-[11px] font-medium text-slate-700">
                {copy.selectDocumentLabel}
                <select
                  className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-[11px]"
                  data-testid="admissions-document"
                  onChange={(event) =>
                    setSelectedDocumentId(event.target.value)
                  }
                  value={selectedDocumentId}
                >
                  <option value="">{copy.selectDocumentPlaceholder}</option>
                  {snapshot.documents.map((entry) => (
                    <option key={entry.referenceId} value={entry.referenceId}>
                      {entry.label ?? entry.referenceId}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <p className="mt-1 text-[11px] text-slate-500">
                {snapshot.documentsUnavailable
                  ? copy.documentsUnavailable
                  : copy.documentsEmpty}
              </p>
            )}
            <button
              className="mt-1 rounded-md border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-700 disabled:opacity-50"
              data-testid="admissions-record-coe"
              disabled={busy}
              onClick={() =>
                controller.recordCoe(projectId, detail).catch(() => undefined)
              }
              type="button"
            >
              {copy.recordCoe}
            </button>
            {snapshot.documents.length > 0 ? (
              <button
                className="mt-1 ml-1 rounded-md border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-700 disabled:opacity-50"
                data-testid="admissions-record-coe-document"
                disabled={busy || selectedDocumentId.length === 0}
                onClick={() =>
                  controller
                    .recordCoe(projectId, detail, {
                      evidenceReferenceId: selectedDocumentId,
                    })
                    .catch(() => undefined)
                }
                type="button"
              >
                {copy.recordWithDocument}
              </button>
            ) : null}
          </div>

          {detail.serviceMode === "self_service" ? (
            <div className="rounded-lg bg-white p-2">
              <p className="text-xs font-semibold text-slate-900">
                {copy.externalActionHeading}
              </p>
              <p className="mt-1 text-[11px] leading-4 text-slate-600">
                {copy.externalActionNotice}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-1">
                <select
                  className="rounded-md border border-slate-300 px-2 py-1 text-[11px]"
                  data-testid="admissions-external-action-kind"
                  onChange={(event) => setExternalAction(event.target.value)}
                  value={externalAction}
                >
                  {Object.keys(copy.externalAction).map((key) => (
                    <option key={key} value={key}>
                      {copy.externalAction[key]}
                    </option>
                  ))}
                </select>
                <button
                  className="rounded-md bg-slate-900 px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
                  data-testid="admissions-external-action"
                  disabled={busy}
                  onClick={() =>
                    controller
                      .recordExternalAction(projectId, detail, externalAction)
                      .catch(() => undefined)
                  }
                  type="button"
                >
                  {copy.recordExternalAction}
                </button>
              </div>
              <ul className="mt-1 space-y-0.5">
                {detail.externalActions.map((action) => (
                  <li
                    className="text-[11px] text-slate-600"
                    key={action.actionId}
                  >
                    {label(copy.externalAction, action.actionKind)} ·{" "}
                    {action.performedOn}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="rounded-lg bg-white p-2">
            <p className="text-xs font-semibold text-slate-900">
              {copy.exceptionHeading}
            </p>
            <p className="mt-1 text-[11px] leading-4 text-slate-600">
              {copy.exceptionNotice}
            </p>
            {detail.exception ? (
              <p
                className="text-[11px] text-slate-700"
                data-testid="admissions-exception-state"
              >
                {detail.exception.state}
                {detail.exception.authorityReference
                  ? ` · ${detail.exception.authorityReference}`
                  : ""}
              </p>
            ) : null}
            <div className="mt-1 flex flex-col gap-1 sm:flex-row">
              <input
                className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-[11px]"
                data-testid="admissions-exception-input"
                onChange={(event) => setExceptionText(event.target.value)}
                placeholder={copy.claimException}
                value={exceptionText}
              />
              <button
                className="rounded-md border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-700 disabled:opacity-50"
                data-testid="admissions-claim-exception"
                disabled={busy || exceptionText.trim().length === 0}
                onClick={() => {
                  controller
                    .claimException(projectId, detail, exceptionText)
                    .then((error) => {
                      if (error === null) {
                        setExceptionText("");
                      }
                    })
                    .catch(() => undefined);
                }}
                type="button"
              >
                {copy.claimException}
              </button>
            </div>
          </div>

          {detail.serviceMode === "managed_service" ? (
            <div className="rounded-lg bg-white p-2">
              <p className="text-xs font-semibold text-slate-900">
                {copy.readinessHeading}
              </p>
              <p
                className="text-[11px] text-slate-700"
                data-testid="admissions-readiness"
              >
                {label(copy.readinessStatus, detail.managedReadiness.status)}
                {detail.managedReadiness.reasonCodes.length > 0
                  ? ` · ${detail.managedReadiness.reasonCodes.join(", ")}`
                  : ""}
              </p>
              <p className="mt-1 text-[11px] leading-4 text-slate-600">
                {copy.submissionNotice}
              </p>
              <button
                className="mt-1 rounded-md bg-slate-900 px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
                data-testid="admissions-evaluate-readiness"
                disabled={busy}
                onClick={() =>
                  controller
                    .evaluateReadiness(projectId, detail)
                    .catch(() => undefined)
                }
                type="button"
              >
                {copy.evaluateReadiness}
              </button>
            </div>
          ) : null}

          <div className="rounded-lg bg-white p-2">
            <p className="text-xs font-semibold text-slate-900">
              {copy.nextStepsHeading}
            </p>
            <ul className="mt-1 list-disc pl-4">
              {detail.nextStepCodes.map((step) => (
                <li className="text-[11px] text-slate-700" key={step}>
                  {label(copy.nextStep, step)}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-lg bg-slate-900/5 p-2">
            <p className="text-xs font-semibold text-slate-900">
              {copy.disclosuresHeading}
            </p>
            <ul className="mt-1 space-y-0.5">
              {detail.disclosures.map((code) => (
                <li className="text-[11px] text-slate-700" key={code}>
                  {label(copy.disclosure, code)}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </section>
  );
}
