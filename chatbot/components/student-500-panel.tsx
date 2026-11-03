"use client";

import {
  AlertTriangle,
  BookOpenCheck,
  ClipboardList,
  Loader2,
  Plus,
  RefreshCw,
} from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  createStudent500Controller,
  draftFromStudent500Context,
  EMPTY_STUDENT_500_DRAFT,
  type LinkableSchoolApplication,
  loadLinkableSchoolApplications,
  type Student500ApplicationDetail,
  type Student500ApplicationSummary,
  type Student500Draft,
  type Student500ErrorKind,
  type Student500RequirementView,
} from "@/lib/workspace/student-500";
import type { WorkspaceCopy } from "@/lib/workspace-copy";

/**
 * Phase 13 M6.1 Student 500 application preparation panel.
 *
 * Rendered in the Project main area. Everything it shows comes from the server:
 * the persisted applicant context, the preliminary requirement assessments with
 * their source-verification state, the missing information, and exactly one
 * suggested next step. It never computes eligibility, verification, progress or
 * approval, and an archived record is read-only.
 */

type PanelCopy = WorkspaceCopy["student500"];

function errorMessage(
  error: Student500ErrorKind | null,
  copy: PanelCopy
): string | null {
  switch (error) {
    case null:
      return null;
    case "authentication_required":
      return copy.errorAuthenticationRequired;
    case "not_found":
      return copy.errorNotFound;
    case "state_changed":
      return copy.errorStateChanged;
    case "limit_reached":
      return copy.errorLimit;
    case "invalid_request":
      return copy.errorInvalid;
    case "unavailable":
      return copy.errorUnavailable;
    default:
      return copy.errorRequestFailed;
  }
}

function lookup(
  map: Record<string, string>,
  key: string | null,
  fallback: string
): string {
  if (!key) {
    return fallback;
  }
  return map[key] ?? key;
}

function SelectField({
  label,
  testId,
  value,
  options,
  onChange,
}: {
  label: string;
  testId: string;
  value: string;
  options: Record<string, string>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-xs font-medium text-slate-600">
      {label}
      <select
        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900"
        data-testid={testId}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {Object.entries(options).map(([key, text]) => (
          <option key={key} value={key}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Student500Panel({
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
    <Student500PanelInstance
      copy={copy}
      enabled={enabled}
      key={key}
      projectId={projectId}
    />
  );
}

export type Student500LinkState = "idle" | "loading" | "loaded" | "error";

/**
 * Authorized School Application selector.
 *
 * The options come from the existing M5.1 Project-scoped list endpoint, which only
 * returns the caller's own applications in this Project, so the customer can only
 * pick a record they are already authorized to see. There is deliberately no
 * free-text id field: the server re-authorizes the chosen id on save as well.
 */
export function SchoolApplicationLinkField({
  copy,
  draft,
  idPrefix,
  links,
  linkState,
  onChange,
  onLoadLinks,
}: {
  copy: PanelCopy;
  draft: Student500Draft;
  idPrefix: string;
  links: readonly LinkableSchoolApplication[];
  linkState: Student500LinkState;
  onChange: (draft: Student500Draft) => void;
  onLoadLinks: () => void;
}) {
  const visible =
    draft.entryRoute === "school_application_in_progress" ||
    draft.schoolApplicationId !== null;
  if (!visible) {
    return null;
  }
  const options = new Set(links.map((link) => link.schoolApplicationId));
  // A previously saved link that is no longer in the authorized list must stay
  // visible (and removable) instead of silently disappearing or being rewritten.
  const staleSelection =
    draft.schoolApplicationId !== null &&
    !options.has(draft.schoolApplicationId);

  return (
    <div
      className="space-y-1 rounded-lg border border-slate-200 p-2 sm:col-span-2"
      data-testid={`${idPrefix}-school-application-field`}
    >
      <label className="block text-xs font-medium text-slate-600">
        {copy.schoolApplicationLabel}
        <select
          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 disabled:bg-slate-100"
          data-testid={`${idPrefix}-school-application`}
          disabled={linkState === "loading" || links.length === 0}
          onChange={(event) =>
            onChange({
              ...draft,
              schoolApplicationId: event.target.value || null,
            })
          }
          value={draft.schoolApplicationId ?? ""}
        >
          <option value="">{copy.linkNoneOption}</option>
          {links.map((link) => (
            <option
              key={link.schoolApplicationId}
              value={link.schoolApplicationId}
            >
              {`${link.institutionName} · ${link.courseTitle} (${link.status})`}
            </option>
          ))}
          {staleSelection ? (
            <option value={draft.schoolApplicationId as string}>
              {copy.linkedSchoolUnavailable}
            </option>
          ) : null}
        </select>
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <button
          className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 disabled:opacity-50"
          data-testid={`${idPrefix}-school-application-load`}
          disabled={linkState === "loading"}
          onClick={onLoadLinks}
          type="button"
        >
          {linkState === "loading" ? copy.linkLoading : copy.linkLoad}
        </button>
        <span className="text-[10px] leading-4 text-slate-500">
          {copy.schoolApplicationHint}
        </span>
      </div>
      {linkState === "error" ? (
        <p className="text-[10px] text-red-700" role="alert">
          {copy.linkError}
        </p>
      ) : null}
      {linkState === "loaded" && links.length === 0 ? (
        <p className="text-[10px] text-amber-900">{copy.linkEmpty}</p>
      ) : null}
      {draft.entryRoute === "school_application_in_progress" &&
      draft.schoolApplicationId === null ? (
        <p className="text-[10px] text-amber-900">{copy.linkRequired}</p>
      ) : null}
    </div>
  );
}

function DraftForm({
  copy,
  draft,
  idPrefix,
  onChange,
}: {
  copy: PanelCopy;
  draft: Student500Draft;
  idPrefix: string;
  linkState: Student500LinkState;
  links: readonly LinkableSchoolApplication[];
  onLoadLinks: () => void;
  onChange: (draft: Student500Draft) => void;
}) {
  function toggleFlag(flag: string) {
    const exists = draft.historyFlags.some((entry) => entry.flag === flag);
    onChange({
      ...draft,
      historyFlags: exists
        ? draft.historyFlags.filter((entry) => entry.flag !== flag)
        : [...draft.historyFlags, { flag, reportedOn: null }],
    });
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <SelectField
        label={copy.entryRouteLabel}
        onChange={(value) =>
          onChange({
            ...draft,
            entryRoute:
              value === "" ? null : (value as Student500Draft["entryRoute"]),
          })
        }
        options={{ "": copy.optionalHint, ...copy.entryRoute }}
        testId={`${idPrefix}-entry-route`}
        value={draft.entryRoute ?? ""}
      />
      <SelectField
        label={copy.applicationPlaceLabel}
        onChange={(value) =>
          onChange({
            ...draft,
            applicationPlace: value as Student500Draft["applicationPlace"],
          })
        }
        options={copy.applicationPlace}
        testId={`${idPrefix}-application-place`}
        value={draft.applicationPlace}
      />
      <SelectField
        label={copy.coeStatusLabel}
        onChange={(value) =>
          onChange({
            ...draft,
            coeStatus: value as Student500Draft["coeStatus"],
          })
        }
        options={copy.coeStatus}
        testId={`${idPrefix}-coe-status`}
        value={draft.coeStatus}
      />
      <SelectField
        label={copy.ageBandLabel}
        onChange={(value) =>
          onChange({
            ...draft,
            applicantAgeBand: value as Student500Draft["applicantAgeBand"],
          })
        }
        options={copy.ageBand}
        testId={`${idPrefix}-age-band`}
        value={draft.applicantAgeBand}
      />
      <SelectField
        label={copy.dependantsLabel}
        onChange={(value) =>
          onChange({
            ...draft,
            dependants: value as Student500Draft["dependants"],
          })
        }
        options={copy.dependants}
        testId={`${idPrefix}-dependants`}
        value={draft.dependants}
      />
      <SelectField
        label={copy.englishLabel}
        onChange={(value) =>
          onChange({
            ...draft,
            englishEvidence: value as Student500Draft["englishEvidence"],
          })
        }
        options={copy.evidenceStatus}
        testId={`${idPrefix}-english`}
        value={draft.englishEvidence}
      />
      <SelectField
        label={copy.financialLabel}
        onChange={(value) =>
          onChange({
            ...draft,
            financialEvidence: value as Student500Draft["financialEvidence"],
          })
        }
        options={copy.evidenceStatus}
        testId={`${idPrefix}-financial`}
        value={draft.financialEvidence}
      />
      <SelectField
        label={copy.oshcLabel}
        onChange={(value) =>
          onChange({
            ...draft,
            oshcEvidence: value as Student500Draft["oshcEvidence"],
          })
        }
        options={copy.evidenceStatus}
        testId={`${idPrefix}-oshc`}
        value={draft.oshcEvidence}
      />
      <label className="block text-xs font-medium text-slate-600">
        {copy.asOfDateLabel}
        <input
          className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-900"
          data-testid={`${idPrefix}-as-of-date`}
          onChange={(event) =>
            onChange({ ...draft, asOfDate: event.target.value || null })
          }
          type="date"
          value={draft.asOfDate ?? ""}
        />
        <span className="mt-1 block text-[11px] text-slate-500">
          {copy.asOfDateHint}
        </span>
      </label>
      <label className="block text-xs font-medium text-slate-600">
        {copy.currentVisaLabel}
        <input
          className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-900"
          data-testid={`${idPrefix}-current-visa`}
          maxLength={128}
          onChange={(event) =>
            onChange({
              ...draft,
              currentVisaSubclass: event.target.value || null,
            })
          }
          value={draft.currentVisaSubclass ?? ""}
        />
        <span className="mt-1 block text-[11px] text-slate-500">
          {copy.currentVisaHint}
        </span>
      </label>
      <div className="space-y-1 rounded-lg border border-slate-200 p-2 sm:col-span-2">
        <SelectField
          label={copy.historyDeclarationLabel}
          onChange={(value) =>
            onChange({
              ...draft,
              historyDeclaration:
                value as Student500Draft["historyDeclaration"],
              historyFlags: value === "declared_some" ? draft.historyFlags : [],
            })
          }
          options={copy.historyDeclaration}
          testId={`${idPrefix}-history-declaration`}
          value={draft.historyDeclaration}
        />
        {draft.historyDeclaration === "declared_some" ? (
          <fieldset className="mt-1">
            <legend className="text-[11px] font-medium text-slate-600">
              {copy.historyFlagsLabel}
            </legend>
            <div className="mt-1 flex flex-wrap gap-2">
              {Object.entries(copy.historyFlag).map(([flag, label]) => (
                <label
                  className="flex items-center gap-1 text-[11px] text-slate-700"
                  key={flag}
                >
                  <input
                    checked={draft.historyFlags.some(
                      (entry) => entry.flag === flag
                    )}
                    data-testid={`${idPrefix}-history-flag-${flag}`}
                    onChange={() => toggleFlag(flag)}
                    type="checkbox"
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}
      </div>
    </div>
  );
}

function RequirementRow({
  copy,
  requirement,
}: {
  copy: PanelCopy;
  requirement: Student500RequirementView;
}) {
  return (
    <li
      className="rounded-lg border border-slate-200 bg-white p-2"
      data-testid={`student500-requirement-${requirement.requirementKey}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-1">
        <span className="text-[11px] font-semibold text-slate-900">
          {lookup(
            copy.requirementLabels,
            requirement.requirementKey,
            requirement.requirementKey
          )}
        </span>
        <span className="flex flex-wrap gap-1 text-[10px]">
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-700">
            {lookup(
              copy.requirementStatus,
              requirement.status,
              requirement.status
            )}
          </span>
          <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-900">
            {lookup(
              copy.sourceVerification,
              requirement.sourceVerification,
              requirement.sourceVerification
            )}
          </span>
          {requirement.evidencePreparation === "not_applicable" ? null : (
            <span className="rounded bg-slate-50 px-1.5 py-0.5 text-slate-600">
              {lookup(
                copy.evidencePreparation,
                requirement.evidencePreparation,
                requirement.evidencePreparation
              )}
            </span>
          )}
          {requirement.humanReviewRequired ? (
            <span className="inline-flex items-center gap-1 rounded bg-red-50 px-1.5 py-0.5 text-red-900">
              <AlertTriangle aria-hidden="true" className="size-3" />
              {copy.humanReviewHeading}
            </span>
          ) : null}
        </span>
      </div>
      <ul className="mt-1 space-y-0.5 text-[10px] leading-4 text-slate-600">
        {requirement.sources.map((source) => (
          <li key={source.sourceId}>
            <span className="font-medium text-slate-700">
              {lookup(
                copy.sourceAuthority,
                source.authorityClass,
                source.authorityClass
              )}
            </span>
            {" · "}
            {source.instrumentTitle}
            {" — "}
            {source.provisionLocator}
            {source.officialUrl ? (
              <>
                {" · "}
                <a
                  className="text-blue-800 underline"
                  href={source.officialUrl}
                  rel="noreferrer noopener"
                  target="_blank"
                >
                  {copy.sourceOpen}
                </a>
              </>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="mt-1 text-[10px] text-slate-500">
        {copy.sourcePendingNotice}
      </p>
    </li>
  );
}

function ScreeningView({
  copy,
  detail,
}: {
  copy: PanelCopy;
  detail: Student500ApplicationDetail;
}) {
  const screening = detail.screening;
  return (
    <section className="space-y-2" data-testid="student500-screening">
      <div className="flex flex-wrap items-center gap-1 text-[10px] text-slate-700">
        <span className="rounded bg-blue-50 px-1.5 py-0.5 font-semibold text-blue-900">
          {lookup(
            copy.preparationState,
            screening.preparationState,
            screening.preparationState
          )}
        </span>
        <span className="rounded bg-slate-100 px-1.5 py-0.5">
          {copy.countApplicable}: {screening.counts.applicable}
        </span>
        <span className="rounded bg-slate-100 px-1.5 py-0.5">
          {copy.countConditional}: {screening.counts.conditional}
        </span>
        <span className="rounded bg-slate-100 px-1.5 py-0.5">
          {copy.countNotApplicable}: {screening.counts.notApplicable}
        </span>
        <span className="rounded bg-slate-100 px-1.5 py-0.5">
          {copy.countUnknown}: {screening.counts.unknown}
        </span>
      </div>

      <p
        className="rounded-lg border border-blue-200 bg-blue-50 px-2 py-1.5 text-[11px] font-medium text-blue-950"
        data-testid="student500-next-action"
      >
        {copy.nextActionHeading}:{" "}
        {lookup(copy.nextAction, screening.nextAction, screening.nextAction)}
      </p>

      <section
        aria-label={copy.missingHeading}
        data-testid="student500-missing"
      >
        <h5 className="text-[11px] font-semibold text-slate-800">
          {copy.missingHeading}
        </h5>
        <ul className="mt-1 flex flex-wrap gap-1 text-[10px] text-slate-700">
          {screening.missingFactCodes.length === 0 ? (
            <li className="rounded bg-slate-100 px-1.5 py-0.5">
              {copy.preparationState.screening_complete_pending_review}
            </li>
          ) : (
            screening.missingFactCodes.map((code) => (
              <li className="rounded bg-slate-100 px-1.5 py-0.5" key={code}>
                {lookup(copy.missing, code, code)}
              </li>
            ))
          )}
        </ul>
      </section>

      <section
        aria-label={copy.humanReviewHeading}
        data-testid="student500-review"
      >
        <h5 className="text-[11px] font-semibold text-slate-800">
          {copy.humanReviewHeading}
        </h5>
        <ul className="mt-1 flex flex-wrap gap-1 text-[10px] text-amber-900">
          {screening.humanReviewReasons.map((reason) => (
            <li className="rounded bg-amber-50 px-1.5 py-0.5" key={reason}>
              {lookup(copy.humanReview, reason, reason)}
            </li>
          ))}
        </ul>
      </section>

      <section aria-label={copy.linkedSchoolHeading}>
        <h5 className="text-[11px] font-semibold text-slate-800">
          {copy.linkedSchoolHeading}
        </h5>
        {screening.studyEvidence.linkedSchoolApplication ? (
          <p className="mt-1 text-[10px] text-slate-600">
            {screening.studyEvidence.linkedSchoolApplication.available
              ? copy.linkedSchoolStatus(
                  screening.studyEvidence.linkedSchoolApplication.status
                )
              : copy.linkedSchoolUnavailable}
          </p>
        ) : (
          <p className="mt-1 text-[10px] text-slate-500">{copy.optionalHint}</p>
        )}
      </section>

      <section aria-label={copy.requirementsHeading}>
        <h5 className="text-[11px] font-semibold text-slate-800">
          {copy.requirementsHeading}
        </h5>
        <ul className="mt-1 space-y-1" data-testid="student500-requirements">
          {screening.requirements.map((requirement) => (
            <RequirementRow
              copy={copy}
              key={requirement.requirementKey}
              requirement={requirement}
            />
          ))}
        </ul>
      </section>

      <section aria-label={copy.disclosuresHeading}>
        <h5 className="text-[11px] font-semibold text-slate-800">
          {copy.disclosuresHeading}
        </h5>
        <ul className="mt-1 space-y-0.5 text-[10px] leading-4 text-amber-900">
          {screening.disclosures.map((code) => (
            <li key={code}>{lookup(copy.disclosure, code, code)}</li>
          ))}
        </ul>
      </section>
    </section>
  );
}

function Student500PanelInstance({
  copy,
  projectId,
  enabled,
}: {
  copy: PanelCopy;
  projectId: string;
  enabled: boolean;
}) {
  const [controller] = useState(() => createStudent500Controller());
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot
  );
  const [creating, setCreating] = useState(false);
  const [createDraft, setCreateDraft] = useState<Student500Draft>(
    EMPTY_STUDENT_500_DRAFT
  );
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState<Student500Draft>(
    EMPTY_STUDENT_500_DRAFT
  );
  /**
   * Authorized School Application options, loaded on demand from the existing M5.1
   * Project-scoped list so the select can only offer records this actor may
   * already see in this Project.
   */
  const [links, setLinks] = useState<LinkableSchoolApplication[]>([]);
  const [linkState, setLinkState] = useState<Student500LinkState>("idle");
  const loadedProject = useRef<string | null>(null);
  const loadingLinks = useRef(false);

  useEffect(() => {
    if (!enabled || loadedProject.current === projectId) {
      return;
    }
    loadedProject.current = projectId;
    controller.load(projectId).catch(() => undefined);
  }, [controller, enabled, projectId]);

  function loadLinks() {
    if (loadingLinks.current) {
      return;
    }
    loadingLinks.current = true;
    setLinkState("loading");
    loadLinkableSchoolApplications({ projectId })
      .then((result) => {
        if (result.ok) {
          setLinks(result.applications);
          setLinkState("loaded");
        } else {
          setLinks([]);
          setLinkState("error");
        }
      })
      .catch(() => {
        setLinks([]);
        setLinkState("error");
      })
      .finally(() => {
        loadingLinks.current = false;
      });
  }

  /**
   * Selecting the in-progress route is the moment the customer needs the
   * authorized School Application list, so the options are fetched then rather
   * than on every render.
   */
  function applyDraft(
    next: Student500Draft,
    apply: (draft: Student500Draft) => void
  ) {
    apply(next);
    if (
      next.entryRoute === "school_application_in_progress" &&
      linkState === "idle"
    ) {
      loadLinks();
    }
  }

  if (!enabled) {
    return null;
  }

  const detail = snapshot.detail;
  const busy = snapshot.pendingAction !== null;
  const message = errorMessage(snapshot.error, copy);
  const archived = detail?.status === "archived";

  function openApplication(applicationId: string) {
    controller.open(projectId, applicationId).catch(() => undefined);
  }

  async function submitCreate() {
    const error = await controller.create(projectId, createDraft);
    if (error === null) {
      setCreating(false);
      setCreateDraft(EMPTY_STUDENT_500_DRAFT);
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

  function beginEdit(current: Student500ApplicationSummary) {
    setEditDraft(draftFromStudent500Context(current.context));
    setEditing(true);
  }

  return (
    <section
      aria-label={copy.title}
      className="mt-3 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3"
      data-testid="student500-panel"
    >
      <header className="space-y-1">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-950">
          <BookOpenCheck aria-hidden="true" className="size-4" />
          {copy.title}
        </h3>
        <p className="text-xs leading-5 text-slate-600">{copy.subtitle}</p>
        <p className="rounded-lg bg-amber-50 px-2 py-1.5 text-[11px] leading-4 text-amber-900">
          {copy.notice}
        </p>
        <p className="rounded-lg bg-slate-100 px-2 py-1.5 text-[11px] leading-4 text-slate-700">
          {copy.sourceNotice}
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
          data-testid="student500-create-open"
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
          {snapshot.loading ? copy.loading : copy.refresh}
        </button>
      </div>

      {creating ? (
        <div
          className="space-y-2 rounded-lg border border-blue-200 bg-white p-3"
          data-testid="student500-create-form"
        >
          <h4 className="text-xs font-semibold text-slate-900">
            {copy.createTitle}
          </h4>
          <p className="text-[11px] leading-4 text-slate-600">
            {copy.createDescription}
          </p>
          <DraftForm
            copy={copy}
            draft={createDraft}
            idPrefix="student500-create"
            linkState={linkState}
            links={links}
            onChange={(next) => applyDraft(next, setCreateDraft)}
            onLoadLinks={loadLinks}
          />
          <div className="flex gap-2">
            <button
              className="rounded-lg bg-[#001736] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
              data-testid="student500-create-submit"
              disabled={busy}
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

      {editing && detail ? (
        <div
          className="space-y-2 rounded-lg border border-blue-200 bg-white p-3"
          data-testid="student500-edit-form"
        >
          <h4 className="text-xs font-semibold text-slate-900">{copy.edit}</h4>
          <DraftForm
            copy={copy}
            draft={editDraft}
            idPrefix="student500-edit"
            linkState={linkState}
            links={links}
            onChange={(next) => applyDraft(next, setEditDraft)}
            onLoadLinks={loadLinks}
          />
          <div className="flex gap-2">
            <button
              className="rounded-lg bg-[#001736] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
              data-testid="student500-edit-submit"
              disabled={busy}
              onClick={() => submitUpdate().catch(() => undefined)}
              type="button"
            >
              {busy ? copy.saving : copy.save}
            </button>
            <button
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700"
              onClick={() => setEditing(false)}
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

      {snapshot.applications.length === 0 && !snapshot.loading ? (
        <p className="text-xs text-slate-600" data-testid="student500-empty">
          {copy.empty}
        </p>
      ) : null}

      {snapshot.applications.length > 0 ? (
        <ul className="space-y-1" data-testid="student500-list">
          {snapshot.applications.map((application) => (
            <li key={application.applicationId}>
              <button
                className={
                  application.applicationId === snapshot.selectedApplicationId
                    ? "w-full rounded-lg border border-blue-700 bg-white p-2 text-left"
                    : "w-full rounded-lg border border-slate-200 bg-white p-2 text-left hover:border-blue-300"
                }
                data-testid={`student500-application-${application.applicationId}`}
                onClick={() => openApplication(application.applicationId)}
                type="button"
              >
                <span className="flex flex-wrap items-center gap-2 text-[11px] text-slate-700">
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-800">
                    {copy.revisionLabel(application.revision)}
                  </span>
                  <span className="rounded bg-slate-100 px-1.5 py-0.5">
                    {lookup(
                      copy.entryRoute,
                      application.context.entryRoute,
                      copy.optionalHint
                    )}
                  </span>
                  <span className="rounded bg-slate-100 px-1.5 py-0.5">
                    {lookup(
                      copy.applicationPlace,
                      application.context.applicationPlace,
                      application.context.applicationPlace
                    )}
                  </span>
                  <span className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-900">
                    {lookup(
                      copy.preparationState,
                      application.screening.preparationState,
                      application.screening.preparationState
                    )}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {snapshot.loadingDetail && !detail ? (
        <p className="flex items-center gap-2 text-xs text-slate-500">
          <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
          {copy.loading}
        </p>
      ) : null}

      {detail ? (
        <div
          className="space-y-3 rounded-lg border border-slate-300 bg-white p-3"
          data-testid="student500-detail"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h4 className="flex items-center gap-2 text-xs font-semibold text-slate-950">
                <ClipboardList aria-hidden="true" className="size-3.5" />
                {copy.detailTitle}
              </h4>
              <p className="text-[11px] text-slate-600">
                {lookup(
                  copy.entryRoute,
                  detail.context.entryRoute,
                  copy.optionalHint
                )}
                {" · "}
                {lookup(
                  copy.applicationPlace,
                  detail.context.applicationPlace,
                  detail.context.applicationPlace
                )}
              </p>
            </div>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
              {copy.revisionLabel(detail.revision)}
            </span>
          </div>

          {archived ? (
            <p className="rounded-lg bg-slate-100 px-2 py-1.5 text-[11px] text-slate-700">
              {copy.archivedNotice}
            </p>
          ) : null}

          <dl className="grid gap-1 text-[11px] text-slate-600 sm:grid-cols-2">
            <div>
              <dt className="font-semibold text-slate-800">
                {copy.coeStatusLabel}
              </dt>
              <dd>
                {lookup(
                  copy.coeStatus,
                  detail.context.coeStatus,
                  detail.context.coeStatus
                )}
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-800">
                {copy.asOfDateLabel}
              </dt>
              <dd>{detail.context.asOfDate ?? copy.optionalHint}</dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-800">
                {copy.historyDeclarationLabel}
              </dt>
              <dd>
                {lookup(
                  copy.historyDeclaration,
                  detail.context.historyDeclaration,
                  detail.context.historyDeclaration
                )}
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-800">
                {copy.dependantsLabel}
              </dt>
              <dd>
                {lookup(
                  copy.dependants,
                  detail.context.dependants,
                  detail.context.dependants
                )}
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-800">
                {copy.englishLabel}
              </dt>
              <dd>
                {lookup(
                  copy.evidenceStatus,
                  detail.context.englishEvidence,
                  detail.context.englishEvidence
                )}
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-800">
                {copy.financialLabel}
              </dt>
              <dd>
                {lookup(
                  copy.evidenceStatus,
                  detail.context.financialEvidence,
                  detail.context.financialEvidence
                )}
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-800">{copy.oshcLabel}</dt>
              <dd>
                {lookup(
                  copy.evidenceStatus,
                  detail.context.oshcEvidence,
                  detail.context.oshcEvidence
                )}
              </dd>
            </div>
          </dl>

          <ScreeningView copy={copy} detail={detail} />

          <p className="rounded-lg bg-amber-50 px-2 py-1.5 text-[11px] leading-4 text-amber-900">
            {copy.submissionNotice}
          </p>

          {archived ? null : (
            <div className="flex flex-wrap gap-2">
              <button
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-50"
                data-testid="student500-edit-open"
                disabled={busy}
                onClick={() => beginEdit(detail)}
                type="button"
              >
                {copy.edit}
              </button>
              <button
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-50"
                data-testid="student500-archive"
                disabled={busy}
                onClick={() =>
                  controller.archive(projectId, detail).catch(() => undefined)
                }
                type="button"
              >
                {busy ? copy.archiving : copy.archive}
              </button>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
