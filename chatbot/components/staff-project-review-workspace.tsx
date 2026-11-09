"use client";

import { Briefcase, RefreshCw, ShieldAlert } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  applyStaffDetailResult,
  clearStaffDetail,
  EMPTY_STAFF_DETAIL_SELECTION,
  type StaffDetailRequest,
  type StaffDetailResult,
  type StaffDetailSelectionState,
  selectStaffProject,
} from "@/lib/staff-workspace/staff-detail-selection";
import type {
  StaffQueueEntry,
  StaffWorkspaceSummary,
} from "@/lib/staff-workspace/staff-queue";
import type { StaffReviewDetail } from "@/lib/staff-workspace/staff-review-detail";
import type { WorkspaceCopy } from "@/lib/workspace-copy";

type Copy = WorkspaceCopy["staffWorkspace"];

function reason(
  copy: Copy,
  code: string | null,
  fallback: string | null = null
): string | null {
  if (code === null) {
    return fallback;
  }
  return copy.reason[code] ?? fallback ?? code;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Phase 13 M9-B — Staff/Lawyer Project review workspace.
 *
 * The client renders only what the server returned. An empty queue is never claimed when a
 * category could not be read (each category row states its own reason), and the Project
 * detail shows the disclosure gate's own decision, so a denied content gate is visible
 * rather than silently blank.
 */
export function StaffProjectReviewWorkspace({
  copy,
  initialProjectId = null,
}: {
  copy: Copy;
  initialProjectId?: string | null;
}) {
  const [workspace, setWorkspace] = useState<StaffWorkspaceSummary | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  /**
   * Correction 2: the detail is driven by an explicit selection state with a monotonic
   * generation, so a late response for a previously selected Project can never overwrite
   * the currently selected one, and the previous detail disappears immediately.
   */
  const [selection, setSelection] = useState<StaffDetailSelectionState>(
    EMPTY_STAFF_DETAIL_SELECTION
  );
  const selectionRef = useRef(selection);
  selectionRef.current = selection;

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const response = await fetch("/api/staff/workspace", {
        cache: "no-store",
        credentials: "same-origin",
        headers: { accept: "application/json" },
      });
      if (!response.ok) {
        setFailed(true);
        setWorkspace(null);
        return;
      }
      const body = (await response.json()) as unknown;
      const parsed = isRecord(body) ? body.workspace : null;
      if (!isRecord(parsed) || !Array.isArray(parsed.entries)) {
        setFailed(true);
        setWorkspace(null);
        return;
      }
      setWorkspace(parsed as unknown as StaffWorkspaceSummary);
      // A reload invalidates any in-flight detail request as well.
      setSelection((current) => {
        const next = clearStaffDetail(current);
        selectionRef.current = next;
        return next;
      });
    } catch {
      setFailed(true);
      setWorkspace(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  const openDetail = useCallback(async (projectId: string) => {
    const started = selectStaffProject(selectionRef.current, projectId);
    selectionRef.current = started.state;
    // The previous Project's shell/disclosure is cleared in the same transition.
    setSelection(started.state);
    const request: StaffDetailRequest = started.request;
    let result: StaffDetailResult;
    try {
      const response = await fetch(
        `/api/staff/workspace/${encodeURIComponent(projectId)}`,
        {
          cache: "no-store",
          credentials: "same-origin",
          headers: { accept: "application/json" },
        }
      );
      if (response.ok) {
        const body = (await response.json()) as unknown;
        const parsed = isRecord(body) ? body.detail : null;
        result = isRecord(parsed)
          ? {
              detail: parsed as unknown as StaffReviewDetail,
              kind: "ok" as const,
            }
          : { kind: "failed" as const };
      } else {
        result = { kind: "failed" as const };
      }
    } catch {
      result = { kind: "failed" as const };
    }
    setSelection((current) => {
      const next = applyStaffDetailResult(current, request, result);
      selectionRef.current = next;
      return next;
    });
  }, []);

  useEffect(() => {
    if (initialProjectId) {
      openDetail(initialProjectId).catch(() => undefined);
    }
  }, [initialProjectId, openDetail]);

  const detail = selection.detail;
  const detailBusy = selection.busy;

  return (
    <section
      aria-label={copy.heading}
      className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4"
      data-testid="staff-project-review-workspace"
    >
      <header className="space-y-1">
        <h2 className="flex items-center gap-2 text-base font-semibold text-slate-950">
          <Briefcase aria-hidden="true" className="size-4" />
          {copy.heading}
        </h2>
        <p className="text-xs leading-5 text-slate-600">{copy.subtitle}</p>
        <p className="rounded-lg bg-amber-50 px-2 py-1.5 text-[11px] leading-4 text-amber-900">
          {copy.notice}
        </p>
      </header>

      <div className="flex items-center gap-2">
        <button
          className="flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 disabled:opacity-50"
          data-testid="staff-workspace-retry"
          disabled={loading}
          onClick={() => load().catch(() => undefined)}
          type="button"
        >
          <RefreshCw aria-hidden="true" className="size-3" />
          {copy.retry}
        </button>
        {workspace ? (
          <span className="text-[10px] text-slate-500">
            {workspace.counts.all}/{workspace.limits.maxEntries}
          </span>
        ) : null}
      </div>

      {loading ? (
        <p className="text-xs text-slate-500">{copy.loading}</p>
      ) : null}
      {failed ? (
        <p className="text-xs text-red-700" role="alert">
          {copy.error}
        </p>
      ) : null}

      {workspace ? (
        <>
          <div data-testid="staff-workspace-categories">
            <h3 className="text-[11px] font-semibold text-slate-800">
              {copy.categoriesHeading}
            </h3>
            <ul className="mt-1 grid gap-1 sm:grid-cols-2">
              {Object.entries(workspace.categories).map(([key, value]) => (
                <li
                  className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-[10px]"
                  data-state={value.state}
                  data-testid={`staff-workspace-category-${key}`}
                  key={key}
                >
                  <span className="flex items-center justify-between gap-1">
                    <span className="font-semibold text-slate-800">
                      {copy.category[key] ?? key}
                    </span>
                    <span className="rounded-full bg-white px-1.5 py-0.5 text-slate-600">
                      {copy.categoryState[value.state] ?? value.state}
                    </span>
                  </span>
                  {value.reasonCode ? (
                    <p className="mt-0.5 text-slate-600">
                      {reason(copy, value.reasonCode)}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>

          <div data-testid="staff-workspace-entries">
            <h3 className="text-[11px] font-semibold text-slate-800">
              {copy.bucketsHeading}
            </h3>
            {workspace.entries.length === 0 ? (
              <p className="mt-1 text-[11px] text-slate-600">{copy.empty}</p>
            ) : (
              <ul className="mt-1 space-y-1">
                {workspace.entries.map((entry: StaffQueueEntry) => (
                  <li
                    className="flex flex-wrap items-center justify-between gap-1 rounded-lg border border-slate-200 bg-white p-2 text-[11px]"
                    data-testid={`staff-workspace-entry-${entry.kind}-${entry.id}`}
                    key={`${entry.kind}:${entry.id}`}
                  >
                    <span className="text-slate-800">
                      {copy.entryLabel[entry.labelCode] ?? entry.labelCode}
                      <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                        {copy.bucket[entry.bucket] ?? entry.bucket}
                      </span>
                    </span>
                    <button
                      className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[10px] font-semibold text-slate-700 disabled:opacity-50"
                      data-testid={`staff-workspace-open-${entry.id}`}
                      disabled={detailBusy || entry.projectId === null}
                      onClick={() => {
                        if (entry.projectId) {
                          openDetail(entry.projectId).catch(() => undefined);
                        }
                      }}
                      type="button"
                    >
                      {copy.openProject}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      ) : null}

      {detail ? (
        <div
          className="space-y-2 rounded-xl border border-slate-300 bg-slate-50 p-3"
          data-testid="staff-project-detail"
        >
          <h3 className="text-[11px] font-semibold text-slate-900">
            {copy.detailHeading}
          </h3>
          {detail.shell ? (
            <dl className="grid gap-0.5 text-[10px] text-slate-700">
              <div className="flex justify-between gap-2">
                <dt>{copy.assignmentLabel}</dt>
                <dd className="font-mono">
                  {detail.shell.assignmentId.slice(0, 8)}…
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>{copy.assignmentStatusLabel}</dt>
                <dd>{detail.shell.assignmentStatus}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>{copy.lifecycleLabel}</dt>
                <dd>{detail.shell.projectLifecycle}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>{copy.acceptedLabel}</dt>
                <dd>{detail.shell.acceptedAt ?? "—"}</dd>
              </div>
            </dl>
          ) : null}
          <p
            className={
              detail.disclosure.decision === "ALLOW"
                ? "text-[10px] text-emerald-800"
                : "text-[10px] text-amber-900"
            }
            data-testid="staff-project-disclosure"
          >
            {detail.disclosure.decision === "ALLOW"
              ? copy.disclosureAllowed
              : `${copy.disclosureDenied} · ${reason(copy, detail.disclosure.reasonCode)}`}
          </p>
          <p className="flex items-start gap-1 text-[10px] leading-4 text-slate-600">
            <ShieldAlert aria-hidden="true" className="mt-0.5 size-3" />
            <span>{copy.noContentNotice}</span>
          </p>
          {detail.review === null ? (
            <p className="text-[10px] text-slate-600">
              {copy.reviewHeading}: {copy.blockedHeading}
            </p>
          ) : null}
          <p className="text-[10px] text-slate-600">
            {copy.professionalNotice}
            {detail.professionalReview.reasonCode
              ? ` · ${reason(copy, detail.professionalReview.reasonCode)}`
              : ""}
          </p>
        </div>
      ) : null}
    </section>
  );
}
