"use client";

import {
  AlertTriangle,
  Check,
  FileText,
  Loader2,
  Pencil,
  ShieldCheck,
  ShieldOff,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  buildFactActionBody,
  type FactActionBody,
  type ProjectFactRow,
  type ProjectFactsView,
  parseProjectFactsProjection,
} from "@/lib/workspace/project-facts-view";
import type { WorkspaceCopy } from "@/lib/workspace-copy";

type FactsCopy = WorkspaceCopy["projectEntry"]["facts"];

type PanelState = "disabled" | "loading" | "ready" | "error";

function newOperationId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `facts-${crypto.randomUUID()}`;
  }
  return `facts-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function stateLabel(copy: FactsCopy, state: string): string {
  switch (state) {
    case "proposed":
      return copy.stateProposed;
    case "customer_confirmed":
      return copy.stateConfirmed;
    case "rejected":
      return copy.stateRejected;
    case "superseded":
      return copy.stateSuperseded;
    default:
      // Unknown server state: show the raw state rather than inventing a friendly one.
      return state;
  }
}

const STATE_STYLES: Record<string, string> = {
  proposed: "bg-amber-50 text-amber-800 border-amber-200",
  customer_confirmed: "bg-emerald-50 text-emerald-800 border-emerald-200",
  rejected: "bg-slate-100 text-slate-600 border-slate-200",
  superseded: "bg-slate-100 text-slate-600 border-slate-200",
};

/**
 * Phase 14-B Project basic information.
 *
 * Shows only what the server authorized for this actor: candidate facts extracted from
 * their own Project documents, the confirmed ones, and the ones explicitly authorized for
 * Project AI. Confirmation, AI authorization and revocation are three separate actions and
 * every value shown here is a server value; this panel never fabricates or "verifies" one.
 */
export function ProjectFactsPanel({
  copy,
  enabled,
  projectId,
}: {
  copy: FactsCopy;
  enabled: boolean;
  projectId: string;
}) {
  const [state, setState] = useState<PanelState>(
    enabled ? "loading" : "disabled"
  );
  const [view, setView] = useState<ProjectFactsView | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(
    null
  );

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/projects/${projectId}/facts`, {
        cache: "no-store",
      });
      if (!response.ok) {
        setState("error");
        return;
      }
      const payload = (await response.json()) as { projection?: unknown };
      const parsed = parseProjectFactsProjection(payload.projection);
      if (!parsed) {
        setState("error");
        return;
      }
      setView(parsed);
      setState("ready");
    } catch {
      setState("error");
    }
  }, [projectId]);

  useEffect(() => {
    if (!enabled) {
      setState("disabled");
      return;
    }
    setState("loading");
    load().catch(() => setState("error"));
  }, [enabled, load]);

  const run = useCallback(
    async (body: FactActionBody | null, busyKey: string) => {
      if (!body) {
        return;
      }
      setBusy(busyKey);
      setNotice(null);
      try {
        const response = await fetch(`/api/projects/${projectId}/facts`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!response.ok) {
          setNotice(copy.actionError);
          // A conflict means our revision/state view is stale: reload the truth.
          await load();
          return;
        }
        const payload = (await response.json()) as { projection?: unknown };
        const parsed = parseProjectFactsProjection(payload.projection);
        if (parsed) {
          setView(parsed);
        } else {
          await load();
        }
        setEditing(null);
        setNotice(copy.saved);
      } catch {
        setNotice(copy.actionError);
      } finally {
        setBusy(null);
      }
    },
    [copy.actionError, copy.saved, load, projectId]
  );

  if (state === "disabled") {
    return (
      <section
        className="rounded-2xl border border-slate-200 bg-white p-4"
        data-testid="project-facts-panel"
      >
        <h3 className="text-sm font-semibold text-slate-950">{copy.title}</h3>
        <p className="mt-1 text-xs leading-5 text-slate-600">{copy.disabled}</p>
      </section>
    );
  }

  const candidates = view?.actionableCandidates ?? [];
  const confirmed = view?.confirmableForAI ?? [];
  const authorized = view?.authorizedForAI ?? [];

  const rowLabel = (key: string) => copy.keyLabels[key] ?? key;

  const renderSource = (row: ProjectFactRow) =>
    row.sourceEvidenceRef ? copy.sourceFromDocument : copy.sourceCustomerStated;

  return (
    <section
      className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4"
      data-testid="project-facts-panel"
    >
      <header className="space-y-1">
        <h3 className="text-sm font-semibold text-slate-950">{copy.title}</h3>
        <p className="text-xs leading-5 text-slate-600">{copy.subtitle}</p>
      </header>

      {state === "loading" ? (
        <p className="flex items-center gap-2 text-xs text-slate-500">
          <Loader2 aria-hidden="true" className="size-4 animate-spin" />
          {copy.loading}
        </p>
      ) : null}

      {state === "error" ? (
        <p className="rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">
          {copy.unavailable}
        </p>
      ) : null}

      {notice ? (
        <p
          aria-live="polite"
          className="rounded-xl bg-slate-100 p-2 text-xs text-slate-700"
          data-testid="project-facts-notice"
        >
          {notice}
        </p>
      ) : null}

      {view && view.conflictCount > 0 ? (
        <p className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">
          <AlertTriangle
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0"
          />
          {copy.conflictsWarning(view.conflictCount)}
        </p>
      ) : null}

      {state === "ready" &&
      candidates.length === 0 &&
      authorized.length === 0 &&
      confirmed.length === 0 ? (
        <p className="text-xs leading-5 text-slate-600">{copy.empty}</p>
      ) : null}

      {candidates.length > 0 ? (
        <div className="space-y-2" data-testid="project-facts-candidates">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-xs font-semibold text-slate-950">
              {copy.candidatesTitle}
            </h4>
            <button
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-800 disabled:opacity-50"
              data-testid="project-facts-confirm-all"
              disabled={busy !== null}
              onClick={() =>
                run(
                  buildFactActionBody({
                    action: "confirm",
                    operationId: newOperationId(),
                    rows: candidates,
                  }),
                  "confirm-all"
                )
              }
              type="button"
            >
              <Check aria-hidden="true" className="size-4" />
              {copy.confirmAll}
            </button>
          </div>
          <ul className="space-y-2">
            {candidates.map((row) => (
              <li
                className="rounded-xl border border-slate-200 p-3"
                data-testid="project-facts-candidate"
                key={`${row.assertionId}:${row.assertionVersion}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-medium text-slate-600">
                    {rowLabel(row.key)}
                  </span>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[11px] ${STATE_STYLES[row.state] ?? "bg-slate-100 text-slate-600 border-slate-200"}`}
                  >
                    {stateLabel(copy, row.state)}
                  </span>
                </div>
                {editing?.id === row.assertionId ? (
                  <div className="mt-2 space-y-2">
                    <input
                      aria-label={rowLabel(row.key)}
                      className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm"
                      onChange={(event) =>
                        setEditing({
                          id: row.assertionId,
                          value: event.target.value,
                        })
                      }
                      value={editing.value}
                    />
                    <div className="flex gap-2">
                      <button
                        className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-[#001736] px-3 text-xs font-semibold text-white disabled:opacity-50"
                        disabled={busy !== null}
                        onClick={() =>
                          run(
                            buildFactActionBody({
                              action: "correct",
                              operationId: newOperationId(),
                              row,
                              correction: {
                                key: row.key,
                                valueType:
                                  row.valueType === "date" ? "date" : "string",
                                value: editing.value,
                              },
                            }),
                            `correct-${row.assertionId}`
                          )
                        }
                        type="button"
                      >
                        {copy.saveCorrection}
                      </button>
                      <button
                        className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700"
                        onClick={() => setEditing(null)}
                        type="button"
                      >
                        {copy.cancelCorrection}
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-1 text-sm font-semibold text-slate-950">
                    {row.value}
                  </p>
                )}
                <p className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500">
                  <FileText aria-hidden="true" className="size-3.5" />
                  {renderSource(row)}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {copy.verificationLabel}
                </p>
                {editing?.id === row.assertionId ? null : (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white disabled:opacity-50"
                      disabled={busy !== null}
                      onClick={() =>
                        run(
                          buildFactActionBody({
                            action: "confirm",
                            operationId: newOperationId(),
                            rows: [row],
                          }),
                          `confirm-${row.assertionId}`
                        )
                      }
                      type="button"
                    >
                      <Check aria-hidden="true" className="size-4" />
                      {copy.confirm}
                    </button>
                    <button
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700 disabled:opacity-50"
                      disabled={busy !== null}
                      onClick={() =>
                        setEditing({ id: row.assertionId, value: row.value })
                      }
                      type="button"
                    >
                      <Pencil aria-hidden="true" className="size-4" />
                      {copy.correct}
                    </button>
                    <button
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700 disabled:opacity-50"
                      disabled={busy !== null}
                      onClick={() =>
                        run(
                          buildFactActionBody({
                            action: "reject",
                            operationId: newOperationId(),
                            rows: [row],
                          }),
                          `reject-${row.assertionId}`
                        )
                      }
                      type="button"
                    >
                      <X aria-hidden="true" className="size-4" />
                      {copy.reject}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {confirmed.length > 0 ? (
        <div className="space-y-2" data-testid="project-facts-confirmed">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-xs font-semibold text-slate-950">
              {copy.confirm}\u00a0\u00b7\u00a0{confirmed.length}
            </h4>
            <button
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-[#001736] px-3 text-xs font-semibold text-white disabled:opacity-50"
              data-testid="project-facts-authorize-all"
              disabled={busy !== null}
              onClick={() =>
                run(
                  buildFactActionBody({
                    action: "authorize_for_ai",
                    operationId: newOperationId(),
                    rows: confirmed,
                  }),
                  "authorize-all"
                )
              }
              type="button"
            >
              <ShieldCheck aria-hidden="true" className="size-4" />
              {copy.authorizeAll}
            </button>
          </div>
          <ul className="space-y-2">
            {confirmed.map((row) => (
              <li
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 p-3"
                data-testid="project-facts-confirmed-row"
                key={`${row.assertionId}:${row.assertionVersion}`}
              >
                <div className="min-w-0">
                  <p className="text-xs font-medium text-slate-600">
                    {rowLabel(row.key)}
                  </p>
                  <p className="text-sm font-semibold text-slate-950">
                    {row.value}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {copy.verificationLabel}
                  </p>
                </div>
                <button
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-[#001736] px-3 text-xs font-semibold text-white disabled:opacity-50"
                  disabled={busy !== null}
                  onClick={() =>
                    run(
                      buildFactActionBody({
                        action: "authorize_for_ai",
                        operationId: newOperationId(),
                        rows: [row],
                      }),
                      `authorize-${row.assertionId}`
                    )
                  }
                  type="button"
                >
                  <ShieldCheck aria-hidden="true" className="size-4" />
                  {copy.authorize}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="space-y-2" data-testid="project-facts-authorized">
        <h4 className="text-xs font-semibold text-slate-950">
          {copy.confirmedAiTitle}
        </h4>
        {authorized.length === 0 ? (
          <p className="text-xs leading-5 text-slate-600">
            {copy.noConfirmedAi}
          </p>
        ) : (
          <ul className="space-y-2">
            {authorized.map((row) => (
              <li
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3"
                data-testid="project-facts-authorized-row"
                key={`${row.assertionId}:${row.assertionVersion}`}
              >
                <div className="min-w-0">
                  <p className="text-xs font-medium text-emerald-900">
                    {rowLabel(row.key)}
                  </p>
                  <p className="text-sm font-semibold text-slate-950">
                    {row.value}
                  </p>
                  <p className="text-[11px] text-emerald-800">
                    {copy.verificationLabel}
                  </p>
                </div>
                <button
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 text-xs font-semibold text-emerald-900 disabled:opacity-50"
                  data-testid="project-facts-revoke"
                  disabled={busy !== null}
                  onClick={() =>
                    run(
                      buildFactActionBody({
                        action: "revoke_ai",
                        operationId: newOperationId(),
                        rows: [row],
                      }),
                      `revoke-${row.assertionId}`
                    )
                  }
                  type="button"
                >
                  <ShieldOff aria-hidden="true" className="size-4" />
                  {copy.revoke}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
