"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  createStudent500PreparationController,
  type LinkableStudyEvidence,
  loadLinkableStudyEvidence,
  type PreparationDraftVersion,
  type PreparationErrorKind,
  type PreparationSnapshot,
  type PreparationView,
  resolveSchoolKindIntent,
  schoolContextRequestFromRecord,
} from "@/lib/workspace/student-500-preparation";
import type { WorkspaceCopy } from "@/lib/workspace-copy";

type PanelCopy = WorkspaceCopy["student500"];

export type EvidenceState = "idle" | "loading" | "loaded" | "error";

export type PreparationHandlers = {
  readonly selectFact: (factAssertionId: string, factVersion: number) => void;
  readonly unselectFact: (factReferenceId: string) => void;
  readonly setSchoolContext: (kind: string) => void;
  readonly createDraft: () => void;
  readonly saveDraft: (
    baseDraftId: string,
    edits: readonly { readonly sectionKey: string; readonly text: string }[]
  ) => void;
  readonly createSnapshot: () => void;
};

function errorText(
  copy: PanelCopy,
  error: PreparationErrorKind | null
): string | null {
  if (!error) {
    return null;
  }
  switch (error) {
    case "unavailable":
    case "not_found":
      return copy.prepUnavailable;
    case "unauthorized":
      return copy.errorAuthenticationRequired;
    case "state_changed":
      return copy.errorStateChanged;
    case "invalid":
      return copy.errorInvalid;
    default:
      return copy.errorRequestFailed;
  }
}

function chipClass(tone: "ok" | "warn" | "info"): string {
  if (tone === "ok") {
    return "rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-800";
  }
  if (tone === "warn") {
    return "rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-900";
  }
  return "rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700";
}

function coverageTone(coverage: string): "ok" | "warn" | "info" {
  if (coverage === "covered_by_authorized_fact") {
    return "ok";
  }
  if (coverage.startsWith("blocked") || coverage === "missing_evidence") {
    return "warn";
  }
  return "info";
}

/** School / Offer / CoE context for this application (read-only provenance). */
export function PreparationStudyEvidence({
  copy,
  evidence,
  evidenceState,
  pendingKind = null,
  view,
  onSelectKind,
  onSelectRecord,
}: {
  copy: PanelCopy;
  view: PreparationView;
  evidence: readonly LinkableStudyEvidence[];
  evidenceState: EvidenceState;
  /** Locally chosen kind awaiting an authorized record (first-use selection). */
  pendingKind?: string | null;
  onSelectKind: (kind: string) => void;
  onSelectRecord: (record: LinkableStudyEvidence) => void;
}) {
  const context = view.schoolContext;
  const kind = pendingKind ?? context?.kind ?? "none";
  const options = evidence.filter((entry) => entry.kind === kind);
  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
      <h4 className="text-xs font-semibold text-slate-900">
        {copy.prepSchoolHeading}
      </h4>
      <p
        className="text-[11px] text-slate-600"
        data-testid="prep-school-summary"
      >
        {context
          ? `${copy.prepSchoolKind[context.kind] ?? context.kind} · ${context.studyEvidenceKind}`
          : copy.prepSchoolNone}
      </p>
      {context?.admissionOutcomeKind ? (
        <p className="flex flex-wrap items-center gap-1 text-[10px] text-slate-500">
          <span>{`${context.admissionOutcomeKind} · ${context.admissionOutcomeProvenance ?? "unknown"}`}</span>
          {context.admissionOutcomeIndependentlyVerified ? null : (
            <span className={chipClass("warn")}>
              {copy.prepGap.independent_verification_unavailable}
            </span>
          )}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {[
          "none",
          "school_application",
          "admission_case",
          "customer_reported_coe",
        ].map((option) => (
          <button
            className={`rounded-lg border px-2 py-1 text-[11px] font-semibold ${kind === option ? "border-[#001736] bg-[#001736] text-white" : "border-slate-300 bg-white text-slate-700"}`}
            data-testid={`prep-school-kind-${option}`}
            key={option}
            onClick={() => onSelectKind(option)}
            type="button"
          >
            {copy.prepSchoolKind[option] ?? option}
          </button>
        ))}
      </div>
      {kind === "school_application" || kind === "admission_case" ? (
        <div className="space-y-1" data-testid="prep-school-record">
          <select
            aria-label={copy.prepSchoolSelectRecord}
            className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-900 disabled:bg-slate-100"
            data-testid="prep-school-record-select"
            disabled={options.length === 0}
            onChange={(event) => {
              const match = options.find(
                (entry) => entry.id === event.target.value
              );
              if (match) {
                onSelectRecord(match);
              }
            }}
            value={
              (kind === "school_application"
                ? context?.schoolApplicationId
                : context?.admissionCaseId) ?? ""
            }
          >
            <option value="">{copy.prepSchoolSelectRecord}</option>
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {`${option.label} · ${option.detail}`}
              </option>
            ))}
          </select>
          {evidenceState === "loading" ? (
            <p className="text-[10px] text-slate-500">{copy.prepLoading}</p>
          ) : null}
          {evidenceState === "error" ? (
            <p className="text-[10px] text-red-700" role="alert">
              {copy.prepSchoolUnavailable}
            </p>
          ) : null}
          {evidenceState === "loaded" && options.length === 0 ? (
            <p className="text-[10px] text-amber-900">{copy.prepSchoolEmpty}</p>
          ) : null}
        </div>
      ) : null}
      {context && !context.current ? (
        <p
          className="text-[10px] text-amber-900"
          data-testid="prep-school-stale"
        >
          {`${copy.prepSchoolNoLongerCurrent}${
            context.unavailableReason ? ` (${context.unavailableReason})` : ""
          }`}
        </p>
      ) : null}
    </div>
  );
}

/** Authorized fact selection: a selection never becomes a verification. */
export function PreparationFacts({
  copy,
  handlers,
  view,
}: {
  copy: PanelCopy;
  handlers: PreparationHandlers;
  view: PreparationView;
}) {
  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
      <h4 className="text-xs font-semibold text-slate-900">
        {copy.prepFactsHeading}
      </h4>
      {view.factsAvailable ? null : (
        <p
          className="text-[11px] text-amber-900"
          data-testid="prep-facts-unavailable"
        >
          {copy.prepFactsUnavailable}
        </p>
      )}
      {view.selectedFacts.length === 0 ? (
        <p className="text-[11px] text-slate-600">{copy.prepFactsEmpty}</p>
      ) : (
        <ul className="space-y-1" data-testid="prep-selected-facts">
          {view.selectedFacts.map((fact) => (
            <li
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-2 py-1"
              key={fact.factReferenceId}
            >
              <span className="text-[11px] text-slate-800">
                {`${fact.factKey} · v${fact.factVersion}`}
              </span>
              <span className="flex items-center gap-1">
                <span className={chipClass(coverageTone(fact.currentState))}>
                  {copy.prepCoverage[fact.currentState] ?? fact.currentState}
                </span>
                {fact.aiUseAuthorized ? null : (
                  <span className={chipClass("warn")}>
                    {copy.prepFactsAiGrantMissing}
                  </span>
                )}
                {fact.customerConfirmed ? null : (
                  <span className={chipClass("warn")}>
                    {copy.prepFactsUnconfirmed}
                  </span>
                )}
                <button
                  className="rounded-lg border border-slate-300 px-2 py-0.5 text-[10px] font-semibold text-slate-700"
                  data-testid={`prep-unselect-${fact.factReferenceId}`}
                  onClick={() => handlers.unselectFact(fact.factReferenceId)}
                  type="button"
                >
                  {copy.prepFactsRemove}
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <details className="rounded-lg border border-slate-200 p-2">
        <summary className="cursor-pointer text-[11px] font-semibold text-slate-700">
          {copy.prepFactsSelect}
        </summary>
        <ul className="mt-2 space-y-1" data-testid="prep-available-facts">
          {view.availableFacts
            .filter((fact) => fact.selectable)
            .slice(0, 12)
            .map((fact) => (
              <li
                className="flex flex-wrap items-center justify-between gap-2"
                key={fact.factAssertionId}
              >
                <span className="text-[11px] text-slate-800">
                  {`${fact.key} · v${fact.version} · ${fact.valueDisplay}`}
                </span>
                <button
                  className="rounded-lg border border-slate-300 px-2 py-0.5 text-[10px] font-semibold text-slate-700"
                  data-testid={`prep-select-${fact.factAssertionId}`}
                  onClick={() =>
                    handlers.selectFact(fact.factAssertionId, fact.version)
                  }
                  type="button"
                >
                  {copy.prepFactsSelect}
                </button>
              </li>
            ))}
        </ul>
      </details>
    </div>
  );
}

/** Requirement coverage and gaps: no single "complete" boolean exists. */
export function PreparationRequirements({
  copy,
  view,
}: {
  copy: PanelCopy;
  view: PreparationView;
}) {
  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
      <h4 className="text-xs font-semibold text-slate-900">
        {copy.prepGapsHeading}
      </h4>
      {view.conflictsVisible ? (
        <p
          className="text-[11px] text-amber-900"
          data-testid="prep-conflict-notice"
        >
          {copy.prepConflictVisible}
        </p>
      ) : null}
      {view.requirements.length === 0 ? (
        <p className="text-[11px] text-slate-600">{copy.prepGapsEmpty}</p>
      ) : (
        <ul className="space-y-1" data-testid="prep-requirements">
          {view.requirements.map((requirement) => (
            <li
              className="rounded-lg bg-slate-50 px-2 py-1"
              key={requirement.requirementKey}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-medium text-slate-800">
                  {copy.requirementLabels[requirement.requirementKey] ??
                    requirement.requirementKey}
                </span>
                <span className={chipClass(coverageTone(requirement.coverage))}>
                  {copy.prepCoverage[requirement.coverage] ??
                    requirement.coverage}
                </span>
              </div>
              {requirement.gaps.length > 0 ? (
                <p className="mt-1 text-[10px] text-slate-600">
                  {requirement.gaps
                    .map((gap) => copy.prepGap[gap] ?? gap)
                    .join(" · ")}
                </p>
              ) : null}
              <p className="text-[10px] text-amber-900">
                {copy.prepReviewRequired}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Editable provisional GS draft with immutable version history. */
export function PreparationDraft({
  copy,
  handlers,
  view,
}: {
  copy: PanelCopy;
  handlers: PreparationHandlers;
  view: PreparationView;
}) {
  const latest = view.drafts.at(-1) ?? null;
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [baseDraftId, setBaseDraftId] = useState<string | null>(null);

  useEffect(() => {
    // Selecting a different draft version always resets the local edit buffer so an
    // edit can never be applied to a version the customer is not looking at.
    setEdits({});
    setBaseDraftId(latest?.draftId ?? null);
  }, [latest?.draftId]);

  const base =
    view.drafts.find((draft) => draft.draftId === baseDraftId) ?? latest;

  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
      <h4 className="text-xs font-semibold text-slate-900">
        {copy.prepDraftHeading}
      </h4>
      {base ? (
        <div className="space-y-2" data-testid="prep-draft-editor">
          <p className="text-[11px] font-semibold text-slate-800">
            {copy.prepDraftVersion(base.version, base.origin)}
          </p>
          {base.stale ? (
            <p
              className="text-[11px] text-amber-900"
              data-testid="prep-draft-stale"
            >
              {`${copy.prepDraftStale}: ${base.staleReasons
                .map((reason) => copy.prepStaleReason[reason] ?? reason)
                .join(", ")}`}
            </p>
          ) : null}
          {base.sections.map((section) => (
            <label className="block" key={section.sectionKey}>
              <span className="text-[10px] font-semibold text-slate-600">
                {section.heading}
              </span>
              <textarea
                className="mt-1 h-24 w-full rounded-lg border border-slate-300 px-2 py-1 text-[11px] text-slate-900"
                data-testid={`prep-draft-section-${section.sectionKey}`}
                onChange={(event) =>
                  setEdits((current) => ({
                    ...current,
                    [section.sectionKey]: event.target.value,
                  }))
                }
                value={edits[section.sectionKey] ?? section.text}
              />
              {section.source === "missing" ? (
                <span className="text-[10px] text-amber-900">
                  {copy.prepDraftPlaceholder}
                </span>
              ) : null}
            </label>
          ))}
          <p className="text-[10px] text-slate-500">{copy.prepDraftEditHint}</p>
          <button
            className="rounded-lg bg-[#001736] px-3 py-1.5 text-xs font-semibold text-white"
            data-testid="prep-draft-save"
            onClick={() =>
              handlers.saveDraft(
                base.draftId,
                Object.entries(edits).map(([sectionKey, text]) => ({
                  sectionKey,
                  text,
                }))
              )
            }
            type="button"
          >
            {copy.prepDraftSave}
          </button>
        </div>
      ) : (
        <p className="text-[11px] text-slate-600">{copy.prepDraftEmpty}</p>
      )}
      <button
        className="rounded-lg border border-slate-300 px-3 py-1 text-[11px] font-semibold text-slate-700"
        data-testid="prep-draft-create"
        onClick={() => handlers.createDraft()}
        type="button"
      >
        {copy.prepDraftCreate}
      </button>
      <DraftHistory copy={copy} drafts={view.drafts} />
    </div>
  );
}

export function DraftHistory({
  copy,
  drafts,
}: {
  copy: PanelCopy;
  drafts: readonly PreparationDraftVersion[];
}) {
  if (drafts.length === 0) {
    return null;
  }
  return (
    <ul className="space-y-1" data-testid="prep-draft-history">
      {drafts.map((draft) => (
        <li
          className="flex flex-wrap items-center gap-2 text-[10px] text-slate-600"
          key={draft.draftId}
        >
          <span>{copy.prepDraftVersion(draft.version, draft.origin)}</span>
          {draft.stale ? (
            <span className={chipClass("warn")}>{copy.prepDraftStale}</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/** Versioned preparation summary with selective invalidation markers. */
export function PreparationSnapshots({
  copy,
  handlers,
  view,
}: {
  copy: PanelCopy;
  handlers: PreparationHandlers;
  view: PreparationView;
}) {
  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
      <h4 className="text-xs font-semibold text-slate-900">
        {copy.prepSnapshotHeading}
      </h4>
      {view.snapshots.length === 0 ? (
        <p className="text-[11px] text-slate-600">{copy.prepSnapshotEmpty}</p>
      ) : (
        <ul className="space-y-1" data-testid="prep-snapshot-history">
          {view.snapshots.map((snapshot) => (
            <li
              className="flex flex-wrap items-center gap-2 text-[10px] text-slate-600"
              key={snapshot.snapshotId}
            >
              <span>
                {copy.prepSnapshotVersion(
                  snapshot.version,
                  snapshot.applicationRevision
                )}
              </span>
              {snapshot.stale ? (
                <span className={chipClass("warn")}>
                  {`${copy.prepSnapshotStale}: ${snapshot.staleReasons
                    .map((reason) => copy.prepStaleReason[reason] ?? reason)
                    .join(", ")}`}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <button
        className="rounded-lg border border-slate-300 px-3 py-1 text-[11px] font-semibold text-slate-700"
        data-testid="prep-snapshot-create"
        onClick={() => handlers.createSnapshot()}
        type="button"
      >
        {copy.prepSnapshotCreate}
      </button>
    </div>
  );
}

/** Next actions, counts and the mandatory disclosures. */
export function PreparationOverview({
  copy,
  view,
}: {
  copy: PanelCopy;
  view: PreparationView;
}) {
  return (
    <div className="space-y-1 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="text-[11px] font-semibold text-slate-900">
        {copy.prepNextActionsHeading}
      </p>
      <ul
        className="list-inside list-disc text-[11px] text-slate-700"
        data-testid="prep-next-actions"
      >
        {view.nextActions.map((action) => (
          <li key={action}>{copy.prepAction[action] ?? action}</li>
        ))}
      </ul>
      <p className="text-[10px] text-slate-600" data-testid="prep-counts">
        {`${copy.prepCoverage.covered_by_authorized_fact}: ${view.counts.covered} · ${copy.prepCoverage.missing_evidence}: ${view.counts.missing} · ${copy.prepCoverage.blocked_fact_conflicting}: ${view.counts.blocked}`}
      </p>
      <p className="text-[10px] text-slate-500">{copy.prepNotice}</p>
      <p className="text-[10px] text-slate-500">{copy.submissionNotice}</p>
    </div>
  );
}

/** Pure, SSR-testable composition of the whole preparation section. */
export function Student500PreparationView({
  copy,
  evidence = [],
  evidenceState = "idle",
  handlers,
  onSelectRecord = () => undefined,
  pendingKind = null,
  state,
}: {
  copy: PanelCopy;
  evidence?: readonly LinkableStudyEvidence[];
  evidenceState?: EvidenceState;
  handlers: PreparationHandlers;
  onSelectRecord?: (record: LinkableStudyEvidence) => void;
  pendingKind?: string | null;
  state: PreparationSnapshot;
}) {
  if (state.loading && !state.view) {
    return (
      <section
        className="rounded-xl border border-slate-200 p-3"
        data-testid="prep-loading"
      >
        <p className="text-xs text-slate-600">{copy.prepLoading}</p>
      </section>
    );
  }
  if (!state.view) {
    return (
      <section
        className="rounded-xl border border-slate-200 p-3"
        data-testid="prep-unavailable"
      >
        <p className="text-xs text-slate-600">{copy.prepUnavailable}</p>
        {errorText(copy, state.error) ? (
          <p className="text-[11px] text-red-700" role="alert">
            {errorText(copy, state.error)}
          </p>
        ) : null}
      </section>
    );
  }
  const view = state.view;
  return (
    <section className="space-y-2" data-testid="prep-section">
      <header className="space-y-1">
        <h3 className="text-sm font-semibold text-slate-900">
          {copy.prepTitle}
        </h3>
        <p className="text-[11px] text-slate-600">{copy.prepSubtitle}</p>
      </header>
      {errorText(copy, state.error) ? (
        <p className="text-[11px] text-red-700" role="alert">
          {errorText(copy, state.error)}
        </p>
      ) : null}
      <PreparationOverview copy={copy} view={view} />
      <PreparationStudyEvidence
        copy={copy}
        evidence={evidence}
        evidenceState={evidenceState}
        onSelectKind={(kind) => handlers.setSchoolContext(kind)}
        onSelectRecord={onSelectRecord}
        pendingKind={pendingKind}
        view={view}
      />
      <PreparationFacts copy={copy} handlers={handlers} view={view} />
      <PreparationRequirements copy={copy} view={view} />
      <PreparationDraft copy={copy} handlers={handlers} view={view} />
      <PreparationSnapshots copy={copy} handlers={handlers} view={view} />
      <p className="text-[10px] text-slate-500" data-testid="prep-disclosures">
        {copy.prepUnavailable === "" ? "" : copy.prepNotice}
      </p>
    </section>
  );
}

/** Runtime wrapper: one controller per application, keyed by Project + id. */
export function Student500PreparationSection({
  applicationId,
  copy,
  projectId,
}: {
  applicationId: string;
  copy: PanelCopy;
  projectId: string;
}) {
  const [controller] = useState(() => createStudent500PreparationController());
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot
  );
  const loadedKey = useRef<string | null>(null);
  const [evidence, setEvidence] = useState<LinkableStudyEvidence[]>([]);
  const [evidenceState, setEvidenceState] = useState<EvidenceState>("idle");
  const [pendingKind, setPendingKind] = useState<string | null>(null);
  const loadingEvidence = useRef(false);

  useEffect(() => {
    if (loadingEvidence.current || evidenceState !== "idle") {
      return;
    }
    loadingEvidence.current = true;
    setEvidenceState("loading");
    loadLinkableStudyEvidence({ projectId })
      .then((result) => {
        if (result.ok) {
          setEvidence([...result.evidence]);
          setEvidenceState("loaded");
        } else {
          setEvidence([]);
          setEvidenceState("error");
        }
      })
      .catch(() => setEvidenceState("error"))
      .finally(() => {
        loadingEvidence.current = false;
      });
  }, [evidenceState, projectId]);

  useEffect(() => {
    const key = `${projectId}:${applicationId}`;
    if (loadedKey.current === key) {
      return;
    }
    loadedKey.current = key;
    controller.load(projectId, applicationId).catch(() => undefined);
  }, [applicationId, controller, projectId]);

  const handlers: PreparationHandlers = {
    createDraft: () => {
      controller.createDraft().catch(() => undefined);
    },
    createSnapshot: () => {
      controller.createSnapshot().catch(() => undefined);
    },
    saveDraft: (baseDraftId, edits) => {
      controller.saveDraft(baseDraftId, edits).catch(() => undefined);
    },
    selectFact: (factAssertionId, factVersion) => {
      controller
        .selectFact(factAssertionId, factVersion)
        .catch(() => undefined);
    },
    setSchoolContext: (kind) => {
      const intent = resolveSchoolKindIntent(kind);
      if (intent.defer) {
        // First use: no mutation until an authorized record is chosen, because a
        // null identifier is not a valid binding.
        setPendingKind(kind);
        return;
      }
      // `none` / directly reported CoE clear any binding and pending selection.
      setPendingKind(null);
      controller.setSchoolContext(intent.request).catch(() => undefined);
    },
    unselectFact: (factReferenceId) => {
      controller.unselectFact(factReferenceId).catch(() => undefined);
    },
  };

  // Selecting an authorized M5 record is the only way to bind a school/Offer/CoE
  // identity; the server re-authorizes the id again on save.
  const selectRecord = (record: LinkableStudyEvidence) => {
    setPendingKind(null);
    controller
      .setSchoolContext(schoolContextRequestFromRecord(record))
      .catch(() => undefined);
  };

  return (
    <Student500PreparationView
      copy={copy}
      evidence={evidence}
      evidenceState={evidenceState}
      handlers={handlers}
      onSelectRecord={selectRecord}
      pendingKind={pendingKind}
      state={state}
    />
  );
}
