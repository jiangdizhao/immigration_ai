"use client";

import { CheckCircle2, FileCheck2, History, ShieldAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ManagedTargetKind } from "@/lib/managed-target/policy";
import {
  consentBindingForView,
  consentBindingKey,
  consentMustReset,
  createSubmissionPackageController,
  EMPTY_SUBMISSION_CONSENT,
  type SubmissionConsentState,
  type SubmissionConsentType,
  type SubmissionPackageState,
  type SubmissionPackageVersionView,
  type SubmissionWorkspaceView,
  submissionConsentAllows,
  submissionConsentReducer,
} from "@/lib/workspace/submission-packages";
import { submissionPackageCopy } from "@/lib/workspace-copy";

/**
 * Phase 13 M8.1 - submission package surface.
 *
 * One honest primary action per state, the frozen content the server returned, and
 * no approval/score/receipt language anywhere: a package is what the customer
 * reviewed, not a decision about their application.
 */

type SectionProps = {
  readonly projectId: string;
  readonly targetId: string;
  readonly targetKind: ManagedTargetKind;
  readonly targetName?: string;
};

function resolveSubmissionLocale(): keyof typeof submissionPackageCopy {
  if (typeof document === "undefined") {
    return "en";
  }
  const value = (document.documentElement.lang || "").toLowerCase();
  if (value.startsWith("zh")) {
    return value.includes("hant") ||
      value.includes("tw") ||
      value.includes("hk")
      ? "zh-Hant"
      : "zh-Hans";
  }
  return "en";
}

export function submissionPackageLocaleFor(
  lang: string | null | undefined
): keyof typeof submissionPackageCopy {
  const value = (lang ?? "").toLowerCase();
  if (value.startsWith("zh")) {
    return value.includes("hant") ||
      value.includes("tw") ||
      value.includes("hk")
      ? "zh-Hant"
      : "zh-Hans";
  }
  return "en";
}

function shortHash(value: string): string {
  return value.slice(0, 12);
}

type SubmissionCopy =
  (typeof submissionPackageCopy)[keyof typeof submissionPackageCopy];

/** Immutable-version summary: identity, integrity and any live staleness. */
function VersionSummary({
  copy,
  version,
}: {
  readonly copy: SubmissionCopy;
  readonly version: SubmissionPackageVersionView;
}) {
  return (
    <div className="space-y-1 text-xs text-slate-700">
      <p>
        {copy.version(version.version)} ·{" "}
        <span className="font-mono">{shortHash(version.manifestSha256)}</span>
      </p>
      <p data-testid="submission-package-integrity">
        {version.integrityVerified ? copy.integrity : copy.integrityFailed}
      </p>
      {version.freshness.reasonCodes.length > 0 ? (
        <ul className="list-disc pl-5">
          {version.freshness.reasonCodes.map((reason) => (
            <li key={reason}>{copy.reason[reason] ?? reason}</li>
          ))}
        </ul>
      ) : null}
      {version.redactedFactReferenceCount > 0 ? (
        <p data-testid="submission-package-redacted">{copy.redacted}</p>
      ) : null}
    </div>
  );
}

/** The honest "what this is not" block. */
function DisclosureBlock({
  copy,
  disclosures,
}: {
  readonly copy: SubmissionCopy;
  readonly disclosures: readonly string[];
}) {
  return (
    <div data-testid="submission-package-disclosures">
      <p className="text-xs font-medium text-slate-700">{copy.disclosures}</p>
      <ul className="list-disc pl-5 text-[11px] text-slate-600">
        {disclosures.map((disclosure) => (
          <li key={disclosure}>{copy.disclosure[disclosure] ?? disclosure}</li>
        ))}
      </ul>
    </div>
  );
}

export function SubmissionPackageSection({
  projectId,
  targetId,
  targetKind,
  targetName,
}: SectionProps) {
  const controller = useRef(createSubmissionPackageController());
  const [state, setState] = useState<SubmissionPackageState>({
    status: "idle",
  });
  const [locale, setLocale] =
    useState<keyof typeof submissionPackageCopy>("en");
  // Both checkboxes share one versioned consent state: a check binds the whole
  // consent to the exact identity currently on screen.
  const [consent, setConsent] = useState<SubmissionConsentState>(
    EMPTY_SUBMISSION_CONSENT
  );

  useEffect(() => {
    setLocale(resolveSubmissionLocale());
  }, []);

  const request = { projectId, targetId, targetKind };

  // A consent belongs to one exact package version. Switching target, building a new
  // version, reloading a changed version or losing validity clears it.
  const currentConsentKey =
    state.status === "ready" && state.view.currentPackage
      ? consentBindingKey(
          consentBindingForView({
            manifestSha256: state.view.currentPackage.manifestSha256,
            packageVersionId: state.view.currentPackage.packageVersionId,
            projectId: state.view.projectId,
            statementPolicyVersion:
              state.view.statements[0]?.policyVersion ?? "",
            targetId: state.view.targetId,
            targetKind: state.view.targetKind,
          })
        )
      : null;

  useEffect(() => {
    if (
      consentMustReset({
        consented: consent.consentedKey,
        current: currentConsentKey,
      })
    ) {
      setConsent(EMPTY_SUBMISSION_CONSENT);
    }
  }, [consent.consentedKey, currentConsentKey]);

  const applyConsent = (type: SubmissionConsentType, checked: boolean) => {
    setConsent((previous) =>
      submissionConsentReducer(previous, {
        checked,
        currentKey: currentConsentKey,
        type,
      })
    );
  };

  useEffect(() => {
    let active = true;
    setState({ status: "loading" });
    controller.current
      .load({ projectId, targetId, targetKind })
      .then((next) => {
        if (active) {
          setState(next);
        }
      })
      .catch(() => {
        if (active) {
          setState({ message: "error", status: "error" });
        }
      });
    return () => {
      active = false;
    };
  }, [projectId, targetId, targetKind]);

  const copy = submissionPackageCopy[locale];

  if (state.status === "loading" || state.status === "idle") {
    return (
      <section
        className="space-y-2 rounded-lg border border-slate-300 bg-white p-3 text-sm text-slate-600"
        data-testid="submission-package-section"
      >
        <h3 className="font-medium text-slate-900">{copy.title}</h3>
        <p data-testid="submission-package-loading">{copy.loading}</p>
      </section>
    );
  }

  if (state.status === "unavailable") {
    return (
      <section
        className="space-y-2 rounded-lg border border-slate-300 bg-slate-50 p-3 text-sm text-slate-600"
        data-testid="submission-package-section"
      >
        <h3 className="font-medium text-slate-900">{copy.title}</h3>
        <p data-testid="submission-package-unavailable">{copy.unavailable}</p>
      </section>
    );
  }

  if (state.status === "error") {
    return (
      <section
        className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
        data-testid="submission-package-section"
      >
        <h3 className="font-medium">{copy.title}</h3>
        <p data-testid="submission-package-error">
          {state.message === "consent_required"
            ? copy.confirmHint
            : copy.nextAction.unavailable}
        </p>
      </section>
    );
  }

  return renderReady(state.view, state.pending);

  function renderReady(
    view: SubmissionWorkspaceView,
    pending: null | "build" | "confirm"
  ) {
    const current = view.currentPackage;
    const newest = view.packages[0] ?? null;
    const contentStatement = view.statements.find(
      (statement) => statement.confirmationType === "package_content_review"
    );
    const declarationStatement = view.statements.find(
      (statement) => statement.confirmationType === "customer_declarations"
    );
    const canConfirm = (type: SubmissionConsentType, confirmable: boolean) =>
      current !== null &&
      submissionConsentAllows({
        confirmable,
        consent,
        currentKey: currentConsentKey,
        type,
      });
    const canConfirmContent = canConfirm(
      "package_content_review",
      contentStatement?.confirmable ?? false
    );
    const canConfirmDeclarations = canConfirm(
      "customer_declarations",
      declarationStatement?.confirmable ?? false
    );

    return (
      <section
        className="space-y-3 rounded-lg border border-slate-300 bg-white p-3"
        data-testid="submission-package-section"
      >
        <header className="space-y-1">
          <h3 className="flex items-center gap-2 font-medium text-slate-900">
            <FileCheck2 aria-hidden="true" className="h-4 w-4" />
            {copy.title}
          </h3>
          <p className="text-xs text-slate-600">
            {targetName ?? view.targetKind} · {copy.submission}
          </p>
          <p
            className="text-xs text-slate-600"
            data-testid="submission-package-next-action"
          >
            {copy.nextAction[view.nextAction] ?? copy.nextAction.unavailable}
          </p>
        </header>

        <div className="rounded border border-slate-200 bg-slate-50 p-2">
          <p className="text-xs font-medium text-slate-700">{copy.indicator}</p>
          {view.indicators.length === 0 ? (
            <p className="text-xs text-slate-600">—</p>
          ) : (
            <ul
              className="mt-1 flex flex-wrap gap-1"
              data-testid="submission-package-indicators"
            >
              {view.indicators.map((indicator) => (
                <li
                  className="rounded bg-white px-2 py-1 text-[11px] text-slate-700 ring-1 ring-slate-200"
                  key={`${indicator.kind}:${indicator.code}`}
                >
                  {copy.indicatorKind[indicator.kind] ?? indicator.kind}:{" "}
                  {indicator.code}
                </li>
              ))}
            </ul>
          )}
        </div>

        {view.packages.length === 0 ? (
          <p
            className="text-sm text-slate-700"
            data-testid="submission-package-empty"
          >
            {copy.empty}
          </p>
        ) : null}

        <div
          className="space-y-2 rounded border border-slate-200 p-2"
          data-testid="submission-package-review"
        >
          <p className="text-xs font-medium text-slate-700">{copy.review}</p>
          {view.review === null ? (
            <p
              className="text-xs text-amber-800"
              data-testid="submission-package-review-unavailable"
            >
              {copy.reviewUnavailable}
              {view.reviewUnavailableReason
                ? ` (${copy.reason[view.reviewUnavailableReason] ?? view.reviewUnavailableReason})`
                : ""}
            </p>
          ) : (
            <div className="space-y-2">
              {view.review.sections.map((section) => (
                <div key={section.key}>
                  <p className="text-[11px] font-medium text-slate-800">
                    {section.heading}
                  </p>
                  <dl className="text-[11px] text-slate-700">
                    {section.lines.map((line) => (
                      <div
                        className="flex gap-2"
                        key={`${section.key}:${line.label}`}
                      >
                        <dt className="min-w-24 text-slate-500">
                          {line.label}
                        </dt>
                        <dd>{line.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
              {view.review.gsDraft ? (
                <div
                  className="space-y-1 rounded bg-slate-50 p-2"
                  data-testid="submission-package-review-draft"
                >
                  <p className="text-[11px] font-medium text-slate-800">
                    {copy.reviewPinnedDraft(view.review.gsDraft.version)}
                  </p>
                  <p className="font-mono text-[10px] text-slate-500">
                    {shortHash(view.review.gsDraft.contentSha256)}
                  </p>
                  {view.review.gsDraft.sections.map((section) => (
                    <div
                      className="text-[11px] text-slate-700"
                      key={section.sectionKey}
                    >
                      <p className="font-medium">{section.heading}</p>
                      <p className="whitespace-pre-wrap">{section.text}</p>
                      {section.missingInformation.length > 0 ? (
                        <p className="text-amber-800">
                          {copy.reviewMissingInfo}:{" "}
                          {section.missingInformation.join(", ")}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
            data-testid="submission-package-build"
            disabled={pending !== null || view.archived}
            onClick={() => {
              setState({ pending: "build", status: "ready", view });
              controller.current
                .build(request)
                .then(setState)
                .catch(() => setState({ message: "error", status: "error" }));
            }}
            type="button"
          >
            {copy.build}
          </button>
          <span className="text-xs text-slate-600">{copy.buildHint}</span>
        </div>

        {current ? (
          <div
            className="space-y-2 rounded border border-slate-200 p-2"
            data-testid="submission-package-current"
          >
            <p className="flex items-center gap-1 text-sm font-medium text-slate-900">
              <CheckCircle2
                aria-hidden="true"
                className="h-4 w-4 text-emerald-600"
              />
              {copy.currentPackage}
            </p>
            <VersionSummary copy={copy} version={current} />
            <DisclosureBlock copy={copy} disclosures={view.disclosures} />
            <div className="space-y-2 border-t border-slate-200 pt-2">
              <p className="text-xs font-medium text-slate-700">
                {copy.statement}
              </p>
              <label className="flex items-start gap-2 text-xs text-slate-700">
                <input
                  checked={consent.checks.package_content_review}
                  data-testid="submission-package-consent-content"
                  onChange={(event) =>
                    applyConsent("package_content_review", event.target.checked)
                  }
                  type="checkbox"
                />
                <span>{copy.confirmContent}</span>
              </label>
              <button
                className="rounded border border-slate-900 px-3 py-1.5 text-sm disabled:opacity-50"
                data-testid="submission-package-confirm-content"
                disabled={!canConfirmContent || pending !== null}
                onClick={() => confirm("package_content_review")}
                type="button"
              >
                {copy.confirm}
              </button>
              <label className="flex items-start gap-2 text-xs text-slate-700">
                <input
                  checked={consent.checks.customer_declarations}
                  data-testid="submission-package-consent-declarations"
                  onChange={(event) =>
                    applyConsent("customer_declarations", event.target.checked)
                  }
                  type="checkbox"
                />
                <span>{copy.confirmDeclarations}</span>
              </label>
              <button
                className="rounded border border-slate-900 px-3 py-1.5 text-sm disabled:opacity-50"
                data-testid="submission-package-confirm-declarations"
                disabled={!canConfirmDeclarations || pending !== null}
                onClick={() => confirm("customer_declarations")}
                type="button"
              >
                {copy.confirm}
              </button>
              <p className="text-[11px] text-slate-600">{copy.confirmHint}</p>
            </div>
          </div>
        ) : null}

        {newest && current === null ? (
          <div
            className="space-y-2 rounded border border-amber-300 bg-amber-50 p-2"
            data-testid="submission-package-stale"
          >
            <p className="flex items-center gap-1 text-sm font-medium text-amber-900">
              <ShieldAlert aria-hidden="true" className="h-4 w-4" />
              {copy.stale}
            </p>
            <ul className="list-disc pl-5 text-xs text-amber-900">
              {newest.freshness.reasonCodes.map((reason) => (
                <li key={reason}>{copy.reason[reason] ?? reason}</li>
              ))}
            </ul>
            <VersionSummary copy={copy} version={newest} />
          </div>
        ) : null}

        {view.packages.length > 0 ? (
          <div className="space-y-1" data-testid="submission-package-history">
            <p className="flex items-center gap-1 text-xs font-medium text-slate-700">
              <History aria-hidden="true" className="h-3.5 w-3.5" />
              {copy.history}
            </p>
            <ul className="space-y-1">
              {view.packages.map((version) => (
                <li
                  className="flex flex-wrap items-center gap-2 text-xs text-slate-700"
                  data-testid="submission-package-version"
                  key={version.packageVersionId}
                >
                  <span className="font-medium">
                    {copy.version(version.version)}
                  </span>
                  <span className="font-mono text-[11px] text-slate-500">
                    {shortHash(version.manifestSha256)}
                  </span>
                  <span>
                    {version.freshness.current ? copy.current : copy.stale}
                  </span>
                  {version.confirmations.length > 0 ? (
                    <span data-testid="submission-package-confirmed">
                      {copy.confirmedAt}: {version.confirmations.length}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>
    );

    function confirm(type: "package_content_review" | "customer_declarations") {
      if (!current) {
        return;
      }
      const statement = view.statements.find(
        (entry) => entry.confirmationType === type
      );
      // Defence in depth: a click that arrives with a stale or absent consent (for
      // example after a rebuild rendered between click and handler) never sends.
      if (
        !submissionConsentAllows({
          confirmable: statement?.confirmable ?? false,
          consent,
          currentKey: currentConsentKey,
          type,
        })
      ) {
        setConsent(EMPTY_SUBMISSION_CONSENT);
        return;
      }
      setState({ pending: "confirm", status: "ready", view });
      controller.current
        .confirm({
          confirmationType: type,
          consentBinding: consentBindingForView({
            manifestSha256: current.manifestSha256,
            packageVersionId: current.packageVersionId,
            projectId: view.projectId,
            statementPolicyVersion: statement?.policyVersion ?? "",
            targetId: view.targetId,
            targetKind: view.targetKind,
          }),
          consentGranted: true,
          manifestSha256: current.manifestSha256,
          packageVersionId: current.packageVersionId,
          request,
          statementPolicyVersion: statement?.policyVersion ?? "",
          targetVersion: current.targetVersion,
        })
        .then(setState)
        .catch(() => setState({ message: "error", status: "error" }));
    }
  }
}
