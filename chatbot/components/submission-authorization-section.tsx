"use client";

import { History, ShieldQuestion, UserCheck, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ManagedTargetKind } from "@/lib/managed-target/policy";
import {
  canCancelHandoff,
  offeredActions,
  parseSubmissionAuthorizationView,
  type SubmissionAuthorizationWorkspaceView,
  submissionAuthorizationActionPath,
  submissionAuthorizationPath,
} from "@/lib/workspace/submission-authorization";
import { submissionAuthorizationCopy } from "@/lib/workspace-copy";

/**
 * Phase 13 M8.2 - submission authorization surface.
 *
 * One honest action per state, the server's exact package identity, the disclosures
 * that actually apply to the chosen mode, and no approval/verification/receipt
 * language anywhere. A mode that is unavailable is shown as unavailable with the
 * server's reasons - never as if a professional were already engaged.
 */

type SectionProps = {
  readonly projectId: string;
  readonly targetId: string;
  readonly targetKind: ManagedTargetKind;
};

type SubmissionAuthorizationCopy =
  (typeof submissionAuthorizationCopy)[keyof typeof submissionAuthorizationCopy];

type LoadState =
  | { readonly status: "loading" }
  | { readonly message: string; readonly status: "unavailable" }
  | { readonly message: string; readonly status: "error" }
  | {
      readonly status: "ready";
      readonly view: SubmissionAuthorizationWorkspaceView;
    };

function resolveLocale(): keyof typeof submissionAuthorizationCopy {
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

export function submissionAuthorizationLocaleFor(
  lang: string | null | undefined
): keyof typeof submissionAuthorizationCopy {
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

function reasonText(
  copy: SubmissionAuthorizationCopy,
  codes: readonly string[]
): string {
  const map = copy.reason as Record<string, string>;
  return codes
    .map((code) => map[code])
    .filter((entry): entry is string => typeof entry === "string")
    .join(" ");
}

function ModeBadge({
  available,
  copy,
  label,
  testId,
}: {
  readonly available: boolean;
  readonly copy: SubmissionAuthorizationCopy;
  readonly label: string;
  readonly testId: string;
}) {
  return (
    <div
      className="flex items-center justify-between gap-3"
      data-testid={testId}
    >
      <span className="font-medium text-slate-900">{label}</span>
      <span
        className={
          available
            ? "rounded bg-emerald-50 px-2 py-0.5 text-emerald-800 text-xs"
            : "rounded bg-slate-100 px-2 py-0.5 text-slate-600 text-xs"
        }
      >
        {available ? copy.current : copy.modeUnavailable}
      </span>
    </div>
  );
}

export function SubmissionAuthorizationSection({
  projectId,
  targetId,
  targetKind,
}: SectionProps) {
  const [locale, setLocale] =
    useState<keyof typeof submissionAuthorizationCopy>("en");
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [pending, setPending] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setLocale(resolveLocale());
  }, []);

  const copy = submissionAuthorizationCopy[locale];
  const path = useMemo(
    () => submissionAuthorizationPath({ projectId, targetId, targetKind }),
    [projectId, targetId, targetKind]
  );

  const load = useCallback(async () => {
    try {
      const response = await fetch(path, { cache: "no-store" });
      if (response.status === 404 || response.status === 503) {
        setState({ message: copy.unavailable, status: "unavailable" });
        return;
      }
      if (!response.ok) {
        setState({ message: copy.error, status: "error" });
        return;
      }
      const view = parseSubmissionAuthorizationView(await response.json());
      if (!view) {
        setState({ message: copy.error, status: "error" });
        return;
      }
      setState({ status: "ready", view });
    } catch {
      setState({ message: copy.error, status: "error" });
    }
  }, [copy.error, copy.unavailable, path]);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  const operationId = (kind: string): string =>
    `m82ui-${kind}-${Date.now().toString(36)}-${Math.floor(
      Math.random() * 1_000_000
    ).toString(36)}`;

  const send = useCallback(
    async (body: Record<string, unknown>, label: string) => {
      setPending(label);
      setMessage(null);
      try {
        const response = await fetch(
          submissionAuthorizationActionPath(projectId),
          {
            body: JSON.stringify(body),
            headers: { "content-type": "application/json" },
            method: "POST",
          }
        );
        if (!response.ok) {
          setMessage(copy.error);
          return;
        }
        await load();
      } catch {
        setMessage(copy.error);
      } finally {
        setPending(null);
      }
    },
    [copy.error, load, projectId]
  );

  if (state.status === "loading") {
    return (
      <section
        className="rounded-lg border border-slate-200 bg-white p-4"
        data-testid="submission-authorization-section"
      >
        <p
          className="text-slate-600 text-sm"
          data-testid="submission-authorization-loading"
        >
          {copy.loading}
        </p>
      </section>
    );
  }

  if (state.status === "unavailable" || state.status === "error") {
    return (
      <section
        className="rounded-lg border border-slate-200 bg-white p-4"
        data-testid="submission-authorization-section"
      >
        <p
          className="text-slate-600 text-sm"
          data-testid={`submission-authorization-${state.status}`}
        >
          {state.message}
        </p>
      </section>
    );
  }

  const { view } = state;
  const actions = offeredActions(view);
  const status = view.authorization?.validity.status ?? "unknown";
  const statusLabel =
    (copy.status as Record<string, string>)[status] ?? copy.status.unknown;
  const submissionLabel =
    (copy.submissionState as Record<string, string>)[view.submissionState] ??
    view.submissionState;
  const nextAction =
    (copy.nextAction as Record<string, string>)[view.nextAction] ??
    view.nextAction;

  const authorize = (mode: "self_service" | "managed_service") => {
    const disclosures =
      mode === "self_service"
        ? view.modes.self_service.requiredDisclosures
        : view.modes.managed_service.requiredDisclosures;
    send(
      {
        acknowledgedDisclosures: disclosures,
        action:
          mode === "self_service"
            ? "authorize_self_service"
            : "authorize_managed_service",
        operationId: operationId(`authorize-${mode}`),
        packageVersionId: view.currentPackageVersionId,
        targetId: view.targetId,
        targetKind: view.targetKind,
      },
      `authorize-${mode}`
    );
  };

  const disclosureList = (
    mode: "self_service" | "managed_service"
  ): readonly string[] =>
    mode === "self_service"
      ? view.modes.self_service.requiredDisclosures
      : view.modes.managed_service.requiredDisclosures;

  const disclosureCopy = copy.disclosure as Record<string, string>;

  return (
    <section
      className="space-y-4 rounded-lg border border-slate-200 bg-white p-4"
      data-testid="submission-authorization-section"
    >
      <header className="space-y-1">
        <h3 className="flex items-center gap-2 font-semibold text-slate-900 text-sm">
          <UserCheck aria-hidden className="h-4 w-4" />
          {copy.title}
        </h3>
        <p className="text-slate-600 text-xs">{copy.intro}</p>
      </header>

      {/* The exact package identity being authorized. */}
      <div
        className="space-y-1 text-xs text-slate-700"
        data-testid="submission-authorization-package"
      >
        {view.currentPackageVersionId === null ? (
          <p data-testid="submission-authorization-no-package">
            {copy.noPackage}
          </p>
        ) : (
          <>
            <p>
              {copy.current} · v{view.currentPackageVersion} ·{" "}
              <span className="font-mono">
                {shortHash(view.currentManifestSha256 ?? "")}
              </span>
            </p>
            {view.package.reasonCodes.length > 0 ? (
              <p
                className="text-amber-700"
                data-testid="submission-authorization-uncertainty"
              >
                {reasonText(copy, view.package.reasonCodes)}
              </p>
            ) : null}
          </>
        )}
      </div>

      {/* Both service modes, each with its own honest availability. */}
      <div className="space-y-2 rounded border border-slate-100 bg-slate-50 p-3 text-xs">
        <ModeBadge
          available={view.modes.self_service.available}
          copy={copy}
          label={copy.modeSelf}
          testId="submission-authorization-mode-self"
        />
        <p className="text-slate-600">{copy.modeSelfHelp}</p>
        <ModeBadge
          available={view.modes.managed_service.available}
          copy={copy}
          label={copy.modeManaged}
          testId="submission-authorization-mode-managed"
        />
        <p className="text-slate-600">{copy.modeManagedHelp}</p>
        {view.modes.managed_service.available ? null : (
          <p
            className="text-slate-500"
            data-testid="submission-authorization-managed-unavailable"
          >
            {reasonText(copy, view.modes.managed_service.reasonCodes) ||
              copy.handoffNotEligible}
          </p>
        )}
      </div>

      {/* Current authorization state. */}
      <div
        className="space-y-1 text-xs"
        data-testid="submission-authorization-status"
      >
        <p className="font-medium text-slate-900">
          {copy.state}: {statusLabel}
        </p>
        {view.authorization ? (
          <>
            <p className="text-slate-600">
              {copy.authorizedAt}: {view.authorization.authorizedAt}
            </p>
            {view.authorization.validity.reasonCodes.length > 0 ? (
              <p className="text-amber-700">
                {reasonText(copy, view.authorization.validity.reasonCodes)}
              </p>
            ) : null}
          </>
        ) : null}
        <p
          className="text-slate-600"
          data-testid="submission-authorization-submission-state"
        >
          {copy.submissionState.not_submitted === submissionLabel
            ? copy.submissionState.not_submitted
            : submissionLabel}
        </p>
        <p
          className="text-slate-600"
          data-testid="submission-authorization-next-action"
        >
          {nextAction}
        </p>
      </div>

      {/* Explicit disclosures and consent per mode. */}
      {(["self_service", "managed_service"] as const).map((mode) => {
        const offered = actions.includes(
          mode === "self_service"
            ? "authorize_self_service"
            : "authorize_managed_service"
        );
        if (!offered) {
          return null;
        }
        const key = `consent-${mode}`;
        const checked = acknowledged[key] === true;
        const disclosures = disclosureList(mode);
        return (
          <div
            className="space-y-2 rounded border border-slate-200 p-3 text-xs"
            data-testid={`submission-authorization-${mode}-panel`}
            key={mode}
          >
            <p className="font-medium text-slate-900">{copy.disclosures}</p>
            <ul
              className="list-disc space-y-1 pl-4 text-slate-700"
              data-testid={`submission-authorization-disclosures-${mode}`}
            >
              {disclosures.map((disclosure) => (
                <li key={disclosure}>
                  {disclosureCopy[disclosure] ?? disclosure}
                </li>
              ))}
            </ul>
            <label className="flex items-start gap-2">
              <input
                checked={checked}
                data-testid={`submission-authorization-${key}`}
                onChange={(event) =>
                  setAcknowledged((current) => ({
                    ...current,
                    [key]: event.target.checked,
                  }))
                }
                type="checkbox"
              />
              <span className="text-slate-700">{copy.authorizeHint}</span>
            </label>
            <button
              className="rounded bg-slate-900 px-3 py-1.5 font-medium text-white text-xs disabled:bg-slate-300"
              data-testid={`submission-authorization-authorize-${mode}`}
              disabled={!checked || pending !== null}
              onClick={() => authorize(mode)}
              type="button"
            >
              {mode === "self_service"
                ? copy.authorizeSelf
                : copy.authorizeManaged}
            </button>
          </div>
        );
      })}

      {message ? (
        <p
          className="text-rose-700 text-xs"
          data-testid="submission-authorization-message"
        >
          {message}
        </p>
      ) : null}

      {/* Human handoff: requested, accepted, closed - never a submission claim. */}
      <div
        className="space-y-2 text-xs"
        data-testid="submission-authorization-handoff"
      >
        <h4 className="flex items-center gap-2 font-medium text-slate-900">
          <Users aria-hidden className="h-4 w-4" />
          {copy.handoff}
        </h4>
        <p className="text-slate-600">
          {view.handoffEligibility.status === "eligible"
            ? copy.handoffEligible
            : copy.handoffNotEligible}
        </p>
        {view.handoff ? (
          <div
            className="space-y-1"
            data-testid="submission-authorization-handoff-status"
          >
            <p>
              {(copy.handoffStatus as Record<string, string>)[
                view.handoff.status
              ] ?? view.handoff.status}{" "}
              · r{view.handoff.revision}
            </p>
            <p className="text-slate-600">
              {view.handoff.packageVersion} ·{" "}
              <span className="font-mono">
                {shortHash(view.handoff.manifestSha256)}
              </span>
            </p>
            <ol
              className="space-y-0.5 text-slate-600"
              data-testid="submission-authorization-handoff-history"
            >
              {view.handoff.history.map((entry) => (
                <li key={`${entry.status}-${entry.at}`}>
                  {entry.at} ·{" "}
                  {(copy.handoffStatus as Record<string, string>)[
                    entry.status
                  ] ?? entry.status}
                </li>
              ))}
            </ol>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {actions.includes("request_handoff") ? (
            <button
              className="rounded border border-slate-300 px-3 py-1.5 font-medium text-slate-800 text-xs disabled:opacity-50"
              data-testid="submission-authorization-request-handoff"
              disabled={pending !== null}
              onClick={() =>
                send(
                  {
                    action: "request_handoff",
                    operationId: operationId("request-handoff"),
                    packageVersionId: view.currentPackageVersionId,
                    targetId: view.targetId,
                    targetKind: view.targetKind,
                  },
                  "request-handoff"
                )
              }
              type="button"
            >
              {copy.requestHandoff}
            </button>
          ) : null}
          {canCancelHandoff(view) && view.handoff ? (
            <button
              className="rounded border border-slate-300 px-3 py-1.5 text-slate-700 text-xs disabled:opacity-50"
              data-testid="submission-authorization-cancel-handoff"
              disabled={pending !== null}
              onClick={() =>
                send(
                  {
                    action: "respond_to_handoff",
                    decision: "cancel",
                    expectedRevision: view.handoff?.revision,
                    handoffId: view.handoff?.handoffId,
                    operationId: operationId("cancel-handoff"),
                    targetId: view.targetId,
                    targetKind: view.targetKind,
                  },
                  "cancel-handoff"
                )
              }
              type="button"
            >
              {copy.cancelHandoff}
            </button>
          ) : null}
        </div>
        <p className="text-slate-500">{copy.handoffHint}</p>
      </div>

      {/* External records: labelled by provenance, never presented as receipts. */}
      <div
        className="space-y-2 text-xs"
        data-testid="submission-authorization-external-records"
      >
        <h4 className="flex items-center gap-2 font-medium text-slate-900">
          <History aria-hidden className="h-4 w-4" />
          {copy.externalRecords}
        </h4>
        {view.externalRecords.length === 0 ? (
          <p
            className="text-slate-600"
            data-testid="submission-authorization-no-external-records"
          >
            {copy.noExternalRecords}
          </p>
        ) : (
          <ul className="space-y-1">
            {view.externalRecords.map((record) => (
              <li
                className="rounded border border-slate-100 bg-slate-50 p-2"
                data-testid="submission-authorization-external-record"
                key={record.recordId}
              >
                <p className="text-slate-800">
                  {record.kind === "external_submission"
                    ? copy.submissionState.reported_unverified
                    : (record.outcomeCode ?? record.kind)}
                </p>
                <p className="text-slate-500">
                  {(copy.provenance as Record<string, string>)[
                    record.provenance
                  ] ?? record.provenance}{" "}
                  · {record.occurredAt}
                  {record.reference ? ` · ${record.reference}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
        <p className="flex items-start gap-1 text-slate-500">
          <ShieldQuestion aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {copy.externalUnverifiedNote}
        </p>
        {actions.includes("record_external_record") ? (
          <button
            className="rounded border border-slate-300 px-3 py-1.5 font-medium text-slate-800 text-xs disabled:opacity-50"
            data-testid="submission-authorization-record-external"
            disabled={pending !== null}
            onClick={() =>
              send(
                {
                  action: "record_external_record",
                  channel: "government_portal",
                  kind: "external_submission",
                  occurredAt: new Date().toISOString(),
                  operationId: operationId("record-external"),
                  packageVersionId: view.currentPackageVersionId,
                  provenance: "customer_reported",
                  targetId: view.targetId,
                  targetKind: view.targetKind,
                },
                "record-external"
              )
            }
            type="button"
          >
            {copy.recordExternal}
          </button>
        ) : null}
      </div>
    </section>
  );
}
