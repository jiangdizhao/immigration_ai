"use client";

import { RefreshCw, Scale, ShieldAlert, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  createProjectReviewClient,
  type ProjectReviewSnapshot,
  reconcileReviewSelection,
  reviewItemKey,
} from "@/lib/review/review-client";
import type { ReviewItem } from "@/lib/review/review-summary";
import type { WorkspaceCopy } from "@/lib/workspace-copy";

type PanelCopy = WorkspaceCopy["projectReview"];

function label(
  map: Record<string, string>,
  key: string | null,
  fallback: string
): string {
  if (key === null) {
    return fallback;
  }
  return map[key] ?? fallback;
}

function DimensionRow({
  copy,
  dimension,
  heading,
  labels,
  testId,
}: {
  copy: PanelCopy;
  dimension: { state: string; reasonCode: string | null };
  heading: string;
  labels: Record<string, string>;
  testId: string;
}) {
  return (
    <div
      className="rounded-lg border border-slate-200 bg-white p-2"
      data-state={dimension.state}
      data-testid={testId}
    >
      <div className="flex flex-wrap items-center justify-between gap-1">
        <span className="text-[11px] font-semibold text-slate-800">
          {heading}
        </span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
          {label(labels, dimension.state, dimension.state)}
        </span>
      </div>
      {dimension.reasonCode ? (
        <p className="mt-1 text-[10px] leading-4 text-slate-600">
          {label(copy.reason, dimension.reasonCode, dimension.reasonCode)}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Phase 13 M9-B exact-version review surface (Picture3, customer side).
 *
 * The three review dimensions are rendered as three separate cards and are never merged
 * into one badge. Every state, reason and eligibility flag comes from the server; the
 * panel adds no judgement of its own and cannot fabricate an approval.
 */
export function ProjectReviewPanel({
  copy,
  enabled = false,
  onOpenOwnerView,
  projectId,
}: {
  copy: PanelCopy;
  enabled?: boolean;
  onOpenOwnerView?: (view: string) => void;
  projectId: string;
}) {
  const [client] = useState(() => createProjectReviewClient());
  const [snapshot, setSnapshot] = useState<ProjectReviewSnapshot>({
    error: null,
    loading: true,
    request: { status: "idle" },
    review: null,
  });
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [requestBusy, setRequestBusy] = useState(false);
  const loadedProject = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || loadedProject.current === projectId) {
      return;
    }
    loadedProject.current = projectId;
    // A new Project always starts with no selection, so Project A's version cannot
    // survive into Project B's review surface.
    setSelectedKey(null);
    setSnapshot({
      error: null,
      loading: true,
      request: { status: "idle" },
      review: null,
    });
    client
      .load(projectId)
      .then((next) => setSnapshot(next))
      .catch(() =>
        setSnapshot({
          error: "unavailable",
          loading: false,
          request: { status: "idle" },
          review: null,
        })
      );
  }, [client, enabled, projectId]);

  const selected = useMemo(
    () => reconcileReviewSelection({ review: snapshot.review, selectedKey }),
    [snapshot.review, selectedKey]
  );

  if (!enabled) {
    return null;
  }

  async function requestReview(item: ReviewItem) {
    setRequestBusy(true);
    try {
      const request = await client.requestReview({ item, projectId });
      setSnapshot((current) => ({ ...current, request }));
    } finally {
      setRequestBusy(false);
    }
  }

  const review = snapshot.review;
  return (
    <section
      aria-label={copy.heading}
      className="space-y-3"
      data-testid="project-review-panel"
    >
      <header className="space-y-1">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-950">
          <Scale aria-hidden="true" className="size-4" />
          {copy.heading}
        </h3>
        <p className="text-xs leading-5 text-slate-600">{copy.subtitle}</p>
        <p className="rounded-lg bg-amber-50 px-2 py-1.5 text-[11px] leading-4 text-amber-900">
          {copy.notice}
        </p>
      </header>

      {snapshot.loading ? (
        <p className="text-xs text-slate-500">{copy.loading}</p>
      ) : null}
      {snapshot.error ? (
        <p className="text-xs text-red-700" role="alert">
          {copy.error}
        </p>
      ) : null}
      {review &&
      review.artifactSource.state !== "available" &&
      review.artifactSource.state !== "empty" ? (
        /*
          Correction 3: a source that could not be read must never look like an empty
          Project. The reason is the server's own stable code.
        */
        <p
          className="rounded-lg bg-amber-50 px-2 py-1.5 text-[11px] leading-4 text-amber-900"
          data-state={review.artifactSource.state}
          data-testid="project-review-source-state"
        >
          {label(
            copy.sourceState,
            review.artifactSource.state,
            review.artifactSource.state
          )}
          {review.artifactSource.reasonCode
            ? ` · ${label(
                copy.reason,
                review.artifactSource.reasonCode,
                review.artifactSource.reasonCode
              )}`
            : null}
        </p>
      ) : null}
      {review && review.items.length === 0 ? (
        <p className="rounded-lg bg-white p-3 text-xs leading-5 text-slate-600">
          {copy.empty}
        </p>
      ) : null}

      {review && review.items.length > 0 ? (
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-slate-900">
                {copy.selectedHeading}
              </h4>
              <button
                className="flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-[10px] font-semibold text-slate-700 disabled:opacity-50"
                data-testid="project-review-retry"
                disabled={snapshot.loading}
                onClick={() => {
                  setSnapshot((current) => ({ ...current, loading: true }));
                  client
                    .load(projectId)
                    .then((next) =>
                      setSnapshot({ ...next, request: snapshot.request })
                    )
                    .catch(() =>
                      setSnapshot((current) => ({
                        ...current,
                        error: "unavailable",
                        loading: false,
                      }))
                    );
                }}
                type="button"
              >
                <RefreshCw aria-hidden="true" className="size-3" />
                {copy.retry}
              </button>
            </div>
            <ul className="space-y-1" data-testid="project-review-items">
              {review.items.map((item) => {
                const key = reviewItemKey(item);
                const active = key === selectedKey;
                return (
                  <li key={key}>
                    <button
                      aria-pressed={active}
                      className={
                        active
                          ? "w-full rounded-lg border border-blue-400 bg-blue-50/60 p-2 text-left"
                          : "w-full rounded-lg border border-slate-200 bg-white p-2 text-left hover:border-blue-300"
                      }
                      data-testid={`project-review-item-${key}`}
                      onClick={() => setSelectedKey(key)}
                      type="button"
                    >
                      <span className="flex flex-wrap items-center justify-between gap-1">
                        <span className="text-[11px] font-semibold text-slate-900">
                          {label(
                            copy.kindLabel,
                            item.artifactKind,
                            item.artifactKind
                          )}
                        </span>
                        <span className="font-mono text-[10px] text-slate-500">
                          v{item.exactVersion.targetVersion}
                        </span>
                      </span>
                      <span className="mt-1 flex flex-wrap gap-1 text-[10px]">
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-700">
                          {copy.aiCheckLabel}:{" "}
                          {label(
                            copy.aiCheck,
                            item.aiCheck.state,
                            item.aiCheck.state
                          )}
                        </span>
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-700">
                          {copy.confirmationLabel}:{" "}
                          {label(
                            copy.confirmation,
                            item.confirmation.state,
                            item.confirmation.state
                          )}
                        </span>
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-700">
                          {copy.professionalLabel}:{" "}
                          {label(
                            copy.professional,
                            item.professionalReview.state,
                            item.professionalReview.state
                          )}
                        </span>
                      </span>
                      {item.stale ? (
                        <span className="mt-1 block text-[10px] text-amber-900">
                          {copy.staleNote}
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
            {review.truncated ? (
              <p className="text-[10px] text-slate-500">{copy.truncatedNote}</p>
            ) : null}
          </div>

          <div className="space-y-2" data-testid="project-review-selected">
            {selected ? (
              <>
                <div className="rounded-lg border border-slate-200 bg-white p-2">
                  <p className="text-[11px] font-semibold text-slate-900">
                    {label(
                      copy.kindLabel,
                      selected.artifactKind,
                      selected.artifactKind
                    )}
                  </p>
                  <dl className="mt-1 space-y-0.5 text-[10px] text-slate-600">
                    <div className="flex justify-between gap-2">
                      <dt>{copy.versionLabel}</dt>
                      <dd className="font-mono">
                        v{selected.exactVersion.targetVersion}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt>{copy.digestLabel}</dt>
                      <dd className="font-mono">
                        {selected.exactVersion.contentSha256
                          ? `${selected.exactVersion.contentSha256.slice(0, 12)}…`
                          : copy.digestUnknown}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt>{copy.integrityLabel}</dt>
                      <dd>
                        {label(
                          copy.integrity,
                          selected.integrity.state,
                          selected.integrity.state
                        )}
                      </dd>
                    </div>
                  </dl>
                </div>

                <div
                  className="space-y-1"
                  data-testid="project-review-dimensions"
                >
                  <p className="text-[11px] font-semibold text-slate-900">
                    {copy.dimensionsHeading}
                  </p>
                  <DimensionRow
                    copy={copy}
                    dimension={selected.aiCheck}
                    heading={copy.aiCheckLabel}
                    labels={copy.aiCheck}
                    testId="project-review-ai-check"
                  />
                  <DimensionRow
                    copy={copy}
                    dimension={selected.confirmation}
                    heading={copy.confirmationLabel}
                    labels={copy.confirmation}
                    testId="project-review-confirmation"
                  />
                  <DimensionRow
                    copy={copy}
                    dimension={selected.professionalReview}
                    heading={copy.professionalLabel}
                    labels={copy.professional}
                    testId="project-review-professional"
                  />
                </div>

                <div className="rounded-lg border border-slate-200 bg-white p-2">
                  <button
                    className="w-full rounded-lg bg-[#001736] px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
                    data-testid="project-review-request"
                    disabled={
                      requestBusy || !selected.requestEligibility.allowed
                    }
                    onClick={() =>
                      requestReview(selected).catch(() => undefined)
                    }
                    type="button"
                  >
                    {requestBusy ? copy.requesting : copy.requestReview}
                  </button>
                  {selected.requestEligibility.allowed ? null : (
                    <p
                      className="mt-1 flex items-start gap-1 text-[10px] leading-4 text-amber-900"
                      data-testid="project-review-request-blocked"
                    >
                      <ShieldAlert
                        aria-hidden="true"
                        className="mt-0.5 size-3"
                      />
                      <span>
                        {copy.requestBlocked}:{" "}
                        {label(
                          copy.reason,
                          selected.requestEligibility.reasonCode,
                          selected.requestEligibility.reasonCode ?? ""
                        )}
                      </span>
                    </p>
                  )}
                  {snapshot.request.status === "recorded" ? (
                    <>
                      <p className="mt-1 text-[10px] leading-4 text-emerald-800">
                        {copy.requestRecorded} ·{" "}
                        {snapshot.request.reviewRequestId.slice(0, 8)}…
                      </p>
                      <p className="mt-1 text-[10px] leading-4 text-slate-500">
                        {copy.requestHistoryNote}
                      </p>
                    </>
                  ) : null}
                  {snapshot.request.status === "blocked" ? (
                    <p
                      className="mt-1 text-[10px] leading-4 text-amber-900"
                      data-testid="project-review-request-state"
                    >
                      {copy.requestBlocked}:{" "}
                      {label(
                        copy.reason,
                        snapshot.request.reasonCode,
                        snapshot.request.reasonCode
                      )}
                    </p>
                  ) : null}
                  {snapshot.request.status === "failed" ? (
                    <p className="mt-1 text-[10px] leading-4 text-red-700">
                      {copy.error}
                    </p>
                  ) : null}
                </div>

                <p className="flex items-start gap-1 text-[10px] leading-4 text-slate-500">
                  <ShieldCheck aria-hidden="true" className="mt-0.5 size-3" />
                  <span>{copy.approvalsAreExactVersion}</span>
                </p>
                <p className="text-[10px] leading-4 text-slate-500">
                  {copy.notLegalAdvice}
                </p>
                {onOpenOwnerView ? (
                  <button
                    className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[10px] font-semibold text-slate-700"
                    onClick={() => onOpenOwnerView(selected.ownerView)}
                    type="button"
                  >
                    {copy.openOwnerView}
                  </button>
                ) : null}
              </>
            ) : (
              <p className="rounded-lg bg-white p-3 text-[11px] leading-5 text-slate-600">
                {copy.subtitle}
              </p>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
