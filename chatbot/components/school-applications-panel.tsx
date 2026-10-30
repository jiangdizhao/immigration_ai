"use client";

import {
  AlertTriangle,
  CheckCircle2,
  FileStack,
  Loader2,
  Plus,
  RefreshCw,
  School,
} from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  createSchoolApplicationsController,
  type SchoolApplicationDetail,
  type SchoolApplicationDraft,
  type SchoolApplicationErrorKind,
  schoolApplicationStatusLabelKey,
} from "@/lib/workspace/school-applications";
import type { WorkspaceCopy } from "@/lib/workspace-copy";

/**
 * Phase 13 M5.1 School Application panel.
 *
 * Rendered inside the existing Project workspace. It is intentionally explicit
 * that a school application here is preparation data only: the status chips show
 * draft/preparing/package-prepared/stale and never an approval, submission,
 * Offer or CoE. Customers can manage several concurrent schools.
 */

type PanelCopy = WorkspaceCopy["schoolApplications"];

function errorMessage(
  error: SchoolApplicationErrorKind | null,
  copy: PanelCopy
): string | null {
  switch (error) {
    case null:
      return null;
    case "authentication_required":
      return copy.authenticationRequired;
    case "not_found":
      return copy.notFound;
    case "state_changed":
      return copy.stateChanged;
    case "limit_reached":
      return copy.limitReached;
    case "invalid_request":
      return copy.validationFailed;
    case "unavailable":
      return copy.unavailable;
    default:
      return copy.saveFailed;
  }
}

function packageNotice(
  application: { readonly staleReasonCodes: readonly string[] },
  copy: PanelCopy
): string {
  // An archived application can never be rebuilt, so it must not be told to
  // rebuild: the historical package is record-only.
  return application.staleReasonCodes.includes("application_archived")
    ? copy.packageArchivedNotice
    : copy.packageStaleNotice;
}

function statusLabel(detail: SchoolApplicationDetail, copy: PanelCopy): string {
  switch (schoolApplicationStatusLabelKey(detail.status)) {
    case "statusDraft":
      return copy.statusDraft;
    case "statusPreparing":
      return copy.statusPreparing;
    case "statusPackagePrepared":
      return copy.statusPackagePrepared;
    case "statusStale":
      return copy.statusStale;
    default:
      return copy.statusArchived;
  }
}

function sourceLabel(detail: SchoolApplicationDetail, copy: PanelCopy): string {
  switch (detail.sourceStatus) {
    case "synthetic_catalog_match":
      return copy.sourceSyntheticCatalog;
    case "unverified_catalog_match":
      return copy.sourceUnverifiedCatalog;
    default:
      return copy.sourceUnverifiedCustomer;
  }
}

function missingLabel(code: string, copy: PanelCopy): string | null {
  switch (code) {
    case "intake_not_selected":
      return copy.missingIntake;
    case "source_not_independently_verified":
      return copy.missingVerification;
    case "no_application_references":
      return copy.missingReferences;
    default:
      return null;
  }
}

const emptyDraft: SchoolApplicationDraft = {
  courseId: null,
  courseTitle: "",
  deliveryId: null,
  institutionId: null,
  institutionName: "",
  intakeId: null,
  intakeLabel: null,
};

function draftFrom(detail: SchoolApplicationDetail): SchoolApplicationDraft {
  return {
    courseId: detail.courseId,
    courseTitle: detail.courseTitle,
    deliveryId: detail.deliveryId,
    institutionId: detail.institutionId,
    institutionName: detail.institutionName,
    intakeId: detail.intakeId,
    intakeLabel: detail.intakeLabel,
  };
}

function toNullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function DraftFields({
  copy,
  draft,
  idPrefix,
  onChange,
}: {
  copy: PanelCopy;
  draft: SchoolApplicationDraft;
  idPrefix: string;
  onChange: (next: SchoolApplicationDraft) => void;
}) {
  const fields: {
    key: keyof SchoolApplicationDraft;
    label: string;
    required?: boolean;
  }[] = [
    { key: "institutionName", label: copy.institutionLabel, required: true },
    { key: "courseTitle", label: copy.courseLabel, required: true },
    { key: "intakeLabel", label: copy.intakeLabel },
    { key: "institutionId", label: copy.institutionIdLabel },
    { key: "courseId", label: copy.courseIdLabel },
    { key: "deliveryId", label: copy.deliveryIdLabel },
    { key: "intakeId", label: copy.intakeIdLabel },
  ];
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {fields.map((field) => (
        <label
          className="block text-xs font-medium text-slate-600"
          key={field.key}
        >
          {field.label}
          <input
            className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
            data-testid={`${idPrefix}-${field.key}`}
            maxLength={200}
            onChange={(event) =>
              onChange({
                ...draft,
                [field.key]: toNullable(event.target.value),
              })
            }
            required={field.required}
            value={draft[field.key] ?? ""}
          />
        </label>
      ))}
      <p className="text-[11px] leading-4 text-slate-500 sm:col-span-2">
        {copy.optionalHint}
      </p>
    </div>
  );
}

export function SchoolApplicationsPanel({
  copy,
  projectId,
  enabled = false,
}: {
  copy: PanelCopy;
  projectId: string;
  enabled?: boolean;
}) {
  const key = `${projectId}:${enabled ? "on" : "off"}`;
  return (
    <SchoolApplicationsPanelInstance
      copy={copy}
      enabled={enabled}
      key={key}
      projectId={projectId}
    />
  );
}

function SchoolApplicationsPanelInstance({
  copy,
  projectId,
  enabled,
}: {
  copy: PanelCopy;
  projectId: string;
  enabled: boolean;
}) {
  const [controller] = useState(() => createSchoolApplicationsController());
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot
  );
  const [creating, setCreating] = useState(false);
  const [createDraft, setCreateDraft] =
    useState<SchoolApplicationDraft>(emptyDraft);
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] =
    useState<SchoolApplicationDraft>(emptyDraft);
  const [referenceKind, setReferenceKind] = useState<
    "fact" | "requirement" | "document"
  >("fact");
  const [referenceId, setReferenceId] = useState("");
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

  function openApplication(applicationId: string) {
    controller.open(projectId, applicationId).catch(() => undefined);
  }

  async function submitCreate() {
    const error = await controller.create(projectId, createDraft);
    if (error === null) {
      setCreating(false);
      setCreateDraft(emptyDraft);
    }
  }

  async function submitUpdate() {
    if (!detail) {
      return;
    }
    const error = await controller.update(projectId, detail, editDraft);
    if (error === null) {
      setEditing(false);
    }
  }

  return (
    <section
      aria-label={copy.title}
      className="mt-3 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3"
      data-testid="school-applications-panel"
    >
      <header className="space-y-1">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-950">
          <School aria-hidden="true" className="size-4" />
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
          className="flex items-center gap-1 rounded-lg bg-[#001736] px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          data-testid="school-application-create-open"
          disabled={busy}
          onClick={() => setCreating((current) => !current)}
          type="button"
        >
          <Plus aria-hidden="true" className="size-3.5" />
          {copy.create}
        </button>
        <button
          className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-50"
          disabled={snapshot.loading}
          onClick={() => controller.load(projectId).catch(() => undefined)}
          type="button"
        >
          <RefreshCw aria-hidden="true" className="size-3.5" />
          {snapshot.loading ? copy.loading : copy.retry}
        </button>
        <span className="text-[11px] text-slate-500">
          {copy.threeSchoolHint}
        </span>
      </div>

      {creating ? (
        <div
          className="space-y-2 rounded-lg border border-blue-200 bg-white p-3"
          data-testid="school-application-create-form"
        >
          <h4 className="text-xs font-semibold text-slate-900">
            {copy.createTitle}
          </h4>
          <p className="text-[11px] leading-4 text-slate-600">
            {copy.createDescription}
          </p>
          <DraftFields
            copy={copy}
            draft={createDraft}
            idPrefix="school-application-create"
            onChange={setCreateDraft}
          />
          <div className="flex gap-2">
            <button
              className="rounded-lg bg-[#001736] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
              data-testid="school-application-create-submit"
              disabled={
                busy ||
                createDraft.institutionName.trim().length === 0 ||
                createDraft.courseTitle.trim().length === 0
              }
              onClick={() => submitCreate().catch(() => undefined)}
              type="button"
            >
              {busy ? copy.creating : copy.confirm}
            </button>
            <button
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700"
              onClick={() => setCreating(false)}
              type="button"
            >
              {copy.cancel}
            </button>
          </div>
        </div>
      ) : null}

      {snapshot.loading ? (
        <p className="flex items-center gap-2 text-xs text-slate-500">
          <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
          {copy.loading}
        </p>
      ) : null}

      {!snapshot.loading && snapshot.applications.length === 0 ? (
        <p className="rounded-lg bg-white p-2.5 text-xs text-slate-600">
          {copy.empty}
        </p>
      ) : null}

      <ul className="space-y-2" data-testid="school-application-list">
        {snapshot.applications.map((application) => {
          const selected = application.applicationId === detail?.applicationId;
          return (
            <li key={application.applicationId}>
              <button
                aria-pressed={selected}
                className={`w-full rounded-xl border p-2.5 text-left transition ${
                  selected
                    ? "border-[#001736] bg-white"
                    : "border-slate-200 bg-white hover:bg-slate-100"
                }`}
                data-testid="school-application-item"
                onClick={() => openApplication(application.applicationId)}
                type="button"
              >
                <span className="flex flex-wrap items-center justify-between gap-1">
                  <span className="text-xs font-semibold text-slate-950">
                    {application.institutionName} · {application.courseTitle}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                    {statusLabel(application, copy)}
                  </span>
                </span>
                <span className="mt-1 block text-[11px] text-slate-600">
                  {application.intakeLabel ?? copy.missingIntake} ·{" "}
                  {copy.revisionLabel(application.revision)}
                </span>
                <span className="mt-1 flex flex-wrap items-center gap-1 text-[10px]">
                  <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-amber-900">
                    <AlertTriangle aria-hidden="true" className="size-3" />
                    {sourceLabel(application, copy)}
                  </span>
                  {application.currentPackage ? (
                    <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-900">
                      <FileStack aria-hidden="true" className="size-3" />
                      {copy.packageVersion(application.currentPackage.version)}
                    </span>
                  ) : (
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">
                      {copy.noPackage}
                    </span>
                  )}
                  {application.packageStale ? (
                    <span className="inline-flex items-center gap-1 rounded bg-red-50 px-1.5 py-0.5 text-red-900">
                      <AlertTriangle aria-hidden="true" className="size-3" />
                      {packageNotice(application, copy)}
                    </span>
                  ) : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {snapshot.loadingDetail && !detail ? (
        <p className="flex items-center gap-2 text-xs text-slate-500">
          <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
          {copy.loading}
        </p>
      ) : null}

      {detail ? (
        <div
          className="space-y-3 rounded-lg border border-slate-300 bg-white p-3"
          data-testid="school-application-detail"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h4 className="text-xs font-semibold text-slate-950">
                {copy.detailTitle}
              </h4>
              <p className="text-[11px] text-slate-600">
                {detail.institutionName} · {detail.courseTitle}
              </p>
            </div>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
              {statusLabel(detail, copy)} ·{" "}
              {copy.revisionLabel(detail.revision)}
            </span>
          </div>

          <dl className="grid gap-1 text-[11px] text-slate-600 sm:grid-cols-2">
            <div>
              <dt className="font-semibold text-slate-800">
                {copy.institutionLabel}
              </dt>
              <dd>{detail.institutionName}</dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-800">
                {copy.courseLabel}
              </dt>
              <dd>{detail.courseTitle}</dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-800">
                {copy.intakeLabel}
              </dt>
              <dd>{detail.intakeLabel ?? copy.missingIntake}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="font-semibold text-slate-800">
                {copy.sourceHeading}
              </dt>
              <dd className="text-amber-900">{sourceLabel(detail, copy)}</dd>
            </div>
          </dl>

          <section aria-label={copy.missingDataHeading}>
            <h5 className="text-[11px] font-semibold text-slate-800">
              {copy.missingDataHeading}
            </h5>
            <ul className="mt-1 flex flex-wrap gap-1 text-[10px] text-slate-700">
              {detail.missingDataCodes
                .map((code) => missingLabel(code, copy))
                .filter((label): label is string => label !== null)
                .map((label) => (
                  <li
                    className="rounded bg-slate-100 px-1.5 py-0.5"
                    key={label}
                  >
                    {label}
                  </li>
                ))}
            </ul>
          </section>

          <section aria-label={copy.packageHeading} className="space-y-1">
            <h5 className="text-[11px] font-semibold text-slate-800">
              {copy.packageHeading}
            </h5>
            {detail.currentPackage ? (
              <div className="space-y-0.5 text-[11px] text-slate-600">
                <p className="font-semibold text-slate-800">
                  {copy.packageVersion(detail.currentPackage.version)}
                </p>
                <p>{copy.packageHash(detail.currentPackage.contentSha256)}</p>
                <p className="flex items-center gap-1 text-emerald-800">
                  {detail.currentPackage.integrityVerified ? (
                    <>
                      <CheckCircle2 aria-hidden="true" className="size-3" />
                      {copy.packageIntegrityOk}
                    </>
                  ) : (
                    <>
                      <AlertTriangle aria-hidden="true" className="size-3" />
                      {copy.packageIntegrityFailed}
                    </>
                  )}
                </p>
              </div>
            ) : (
              <p className="text-[11px] text-slate-600">{copy.noPackage}</p>
            )}
            {detail.packageStale ? (
              <p className="rounded bg-red-50 px-2 py-1 text-[10px] text-red-900">
                {packageNotice(detail, copy)}
              </p>
            ) : null}
            {detail.currentPackage?.usable ? (
              <p className="rounded bg-emerald-50 px-2 py-1 text-[10px] text-emerald-900">
                {copy.packageUsable}
              </p>
            ) : null}
            {detail.status === "archived" ? (
              <p className="rounded bg-slate-100 px-2 py-1 text-[10px] text-slate-700">
                {copy.archivedNotice}
              </p>
            ) : (
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  className="rounded-lg bg-[#001736] px-2.5 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
                  data-testid="school-application-build-package"
                  disabled={busy}
                  onClick={() =>
                    controller
                      .buildPackage(projectId, detail)
                      .catch(() => undefined)
                  }
                  type="button"
                >
                  {snapshot.pendingAction === "package"
                    ? copy.buildingPackage
                    : copy.buildPackage}
                </button>
                <button
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 disabled:opacity-50"
                  disabled={busy}
                  onClick={() => {
                    setEditing((current) => !current);
                    setEditDraft(draftFrom(detail));
                  }}
                  type="button"
                >
                  {copy.edit}
                </button>
                <button
                  className="rounded-lg border border-red-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-red-800 disabled:opacity-50"
                  data-testid="school-application-archive"
                  disabled={busy}
                  onClick={() =>
                    controller.archive(projectId, detail).catch(() => undefined)
                  }
                  type="button"
                >
                  {snapshot.pendingAction === "archive"
                    ? copy.archiving
                    : copy.archive}
                </button>
              </div>
            )}
          </section>

          {editing && detail.status !== "archived" ? (
            <div
              className="space-y-2 rounded-lg border border-blue-200 bg-blue-50/40 p-2.5"
              data-testid="school-application-edit-form"
            >
              <DraftFields
                copy={copy}
                draft={editDraft}
                idPrefix="school-application-edit"
                onChange={setEditDraft}
              />
              <div className="flex gap-2">
                <button
                  className="rounded-lg bg-[#001736] px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
                  disabled={busy}
                  onClick={() => submitUpdate().catch(() => undefined)}
                  type="button"
                >
                  {snapshot.pendingAction === "update"
                    ? copy.saving
                    : copy.save}
                </button>
                <button
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700"
                  onClick={() => setEditing(false)}
                  type="button"
                >
                  {copy.cancel}
                </button>
              </div>
            </div>
          ) : null}

          <section aria-label={copy.referencesHeading} className="space-y-1">
            <h5 className="text-[11px] font-semibold text-slate-800">
              {copy.referencesHeading}
            </h5>
            {detail.references.length === 0 ? (
              <p className="text-[11px] text-slate-600">
                {copy.referencesEmpty}
              </p>
            ) : (
              <ul className="space-y-1 text-[11px] text-slate-700">
                {detail.references.map((reference) => (
                  <li
                    className="flex flex-wrap items-center justify-between gap-1 rounded bg-slate-50 px-2 py-1"
                    key={reference.referenceRecordId}
                  >
                    <span>
                      {reference.kind === "fact"
                        ? copy.referenceKindFact
                        : reference.kind === "requirement"
                          ? copy.referenceKindRequirement
                          : copy.referenceKindDocument}{" "}
                      · {reference.referenceId.slice(0, 8)}… · v
                      {reference.referenceVersion}
                    </span>
                    <span className="flex items-center gap-1">
                      {reference.revokedAt ? (
                        <span className="text-slate-500">
                          {copy.referenceRevoked}
                        </span>
                      ) : (
                        <>
                          {reference.available ? null : (
                            <span className="text-red-800">
                              {copy.referenceUnavailable}
                            </span>
                          )}
                          {reference.available && reference.changed ? (
                            <span className="text-amber-800">
                              {copy.referenceChanged}
                            </span>
                          ) : null}
                          <button
                            className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-700 disabled:opacity-50"
                            disabled={busy}
                            onClick={() =>
                              controller
                                .revokeReference(
                                  projectId,
                                  detail,
                                  reference.referenceRecordId
                                )
                                .catch(() => undefined)
                            }
                            type="button"
                          >
                            {snapshot.pendingAction === "reference"
                              ? copy.revokingReference
                              : copy.revokeReference}
                          </button>
                        </>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {detail.status === "archived" ? null : (
            <div className="flex flex-wrap items-end gap-2 pt-1">
              <label className="text-[10px] font-medium text-slate-600">
                {copy.referenceKindLabel}
                <select
                  className="mt-0.5 block rounded-lg border border-slate-300 px-1.5 py-1 text-[11px] text-slate-900"
                  onChange={(event) =>
                    setReferenceKind(
                      event.target.value as "fact" | "requirement" | "document"
                    )
                  }
                  value={referenceKind}
                >
                  <option value="fact">{copy.referenceKindFact}</option>
                  <option value="requirement">
                    {copy.referenceKindRequirement}
                  </option>
                  <option value="document">{copy.referenceKindDocument}</option>
                </select>
              </label>
              <label className="min-w-40 flex-1 text-[10px] font-medium text-slate-600">
                {copy.referenceIdLabel}
                <input
                  className="mt-0.5 w-full rounded-lg border border-slate-300 px-1.5 py-1 text-[11px] text-slate-900"
                  data-testid="school-application-reference-id"
                  onChange={(event) => setReferenceId(event.target.value)}
                  value={referenceId}
                />
              </label>
              <button
                className="rounded-lg bg-[#001736] px-2.5 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
                data-testid="school-application-bind-reference"
                disabled={busy || referenceId.trim().length < 8}
                onClick={() => {
                  const trimmed = referenceId.trim();
                  controller
                    .bindReference(projectId, detail, {
                      kind: referenceKind,
                      referenceId: trimmed,
                    })
                    .then((error) => {
                      if (error === null) {
                        setReferenceId("");
                      }
                    })
                    .catch(() => undefined);
                }}
                type="button"
              >
                {snapshot.pendingAction === "reference"
                  ? copy.bindingReference
                  : copy.bindReference}
              </button>
            </div>
          )}
        </div>
      ) : (
        <p className="text-[11px] text-slate-500">{copy.selectPrompt}</p>
      )}
    </section>
  );
}
