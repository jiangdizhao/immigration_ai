"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminPolicyIntelligenceItem } from "@/lib/policy-intelligence/admin-api";

function formatDateTime(value: string | null) {
  if (!value) {
    return "—";
  }
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Australia/Sydney",
  }).format(new Date(value));
}

function formatDate(value: string | null) {
  if (!value) {
    return "—";
  }
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeZone: "Australia/Sydney",
  }).format(new Date(value));
}

export function AdminPolicyIntelligence({
  initialItems,
}: {
  initialItems: AdminPolicyIntelligenceItem[];
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function update(itemId: string, action: "archive" | "restore") {
    setPendingId(itemId);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/policy-intelligence", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, action }),
      });
      const data = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!response.ok) {
        setNotice(data?.error ?? "Unable to update this policy item.");
        return;
      }
      setNotice(action === "archive" ? "Policy archived." : "Policy restored.");
      router.refresh();
    } catch {
      setNotice("Unable to update this policy item.");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] border-collapse text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Policy / source</th>
              <th className="px-4 py-3 font-semibold">Source status</th>
              <th className="px-4 py-3 font-semibold">Editorial status</th>
              <th className="px-4 py-3 font-semibold">Published / updated</th>
              <th className="px-4 py-3 font-semibold">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {initialItems.map((item) => {
              const archived = item.editorialStatus === "archived";
              return (
                <Fragment key={item.id}>
                  <tr>
                    <td className="px-4 py-4 align-top">
                      <p className="font-semibold text-slate-900">
                        {item.title ?? item.slug}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {item.authority ?? item.sourceConfigId} · {item.slug}
                      </p>
                    </td>
                    <td className="px-4 py-4 align-top text-slate-700">
                      {item.sourceStatus}
                    </td>
                    <td className="px-4 py-4 align-top text-slate-700">
                      {item.editorialStatus}
                    </td>
                    <td className="px-4 py-4 align-top text-slate-700">
                      {formatDate(item.publishedAt ?? item.updatedAt)}
                    </td>
                    <td className="px-4 py-4 align-top">
                      <button
                        className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                        disabled={pendingId !== null}
                        onClick={() =>
                          update(item.id, archived ? "restore" : "archive")
                        }
                        type="button"
                      >
                        {pendingId === item.id
                          ? "Saving…"
                          : archived
                            ? "Restore"
                            : "Archive / Unpublish"}
                      </button>
                    </td>
                  </tr>
                  {item.editorialStatus !== "published" ||
                  item.analysisAttempts.length > 0 ||
                  item.sourceSyncDiagnostic !== null ? (
                    <tr>
                      <td
                        className="border-t border-slate-100 bg-slate-50 px-4 py-5"
                        colSpan={5}
                      >
                        <section aria-label="Publication Status Detail">
                          <h2 className="font-semibold text-slate-900">
                            Publication Status Detail
                          </h2>
                          <dl className="mt-3 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
                            <div>
                              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                Current item status
                              </dt>
                              <dd className="mt-1 text-slate-800">
                                {item.editorialStatus}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                Latest source snapshot
                              </dt>
                              <dd className="mt-1 break-words text-slate-800">
                                {item.latestSnapshot ? (
                                  <>
                                    <a
                                      className="text-sky-800 underline"
                                      href={item.latestSnapshot.sourceUrl}
                                      rel="noreferrer"
                                      target="_blank"
                                    >
                                      {item.latestSnapshot.sourceTitle}
                                    </a>
                                    <span className="block break-all text-xs text-slate-600">
                                      {item.latestSnapshot.sourceUrl}
                                    </span>
                                    <span className="block text-xs text-slate-600">
                                      Retrieved{" "}
                                      {formatDateTime(
                                        item.latestSnapshot.retrievedAt
                                      )}
                                    </span>
                                  </>
                                ) : (
                                  "No snapshot stored"
                                )}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                Latest analysis revision
                              </dt>
                              <dd className="mt-1 text-slate-800">
                                {item.latestRevision ? (
                                  <>
                                    <span>
                                      Revision{" "}
                                      {item.latestRevision.revisionNumber} ·{" "}
                                      {item.latestRevision.editorialStatus}
                                    </span>
                                    <span className="block text-xs text-slate-600">
                                      Generated{" "}
                                      {formatDateTime(
                                        item.latestRevision.generatedAt
                                      )}
                                    </span>
                                  </>
                                ) : (
                                  "No analysis revision stored"
                                )}
                              </dd>
                            </div>
                          </dl>
                          <div className="mt-4 border-t border-slate-200 pt-4">
                            <h3 className="text-sm font-semibold text-slate-900">
                              {item.publicationDiagnostics.published
                                ? "PUBLISHED"
                                : "NOT PUBLISHED"}
                            </h3>
                            {item.publicationDiagnostics.reasons.length > 0 ? (
                              <>
                                <p className="mt-2 text-sm text-slate-700">
                                  Publication blocked because:
                                </p>
                                <ul className="mt-2 space-y-2 text-sm">
                                  {item.publicationDiagnostics.reasons.map(
                                    (reason, index) => (
                                      <li
                                        className="rounded-lg border border-slate-200 bg-white px-3 py-2"
                                        key={`${reason.reasonCode}-${reason.unitId ?? "item"}-${index}`}
                                      >
                                        <code className="font-semibold text-slate-900">
                                          {reason.reasonCode}
                                        </code>
                                        {reason.unitId ? (
                                          <span className="ml-2 text-xs text-slate-500">
                                            Unit: {reason.unitId}
                                          </span>
                                        ) : null}
                                        <p className="mt-1 text-slate-700">
                                          {reason.explanation}
                                        </p>
                                      </li>
                                    )
                                  )}
                                </ul>
                              </>
                            ) : (
                              <p className="mt-2 text-sm text-slate-600">
                                No blocking reason is available in the stored
                                diagnostics.
                              </p>
                            )}
                          </div>
                          {item.sourceSyncDiagnostic ? (
                            <div className="mt-4 border-t border-sky-200 pt-4">
                              <h3 className="text-sm font-semibold text-sky-900">
                                Source sync diagnostic (source-wide)
                              </h3>
                              <p className="mt-1 text-xs text-slate-600">
                                Latest source sync status:{" "}
                                {item.sourceSyncDiagnostic.status}
                              </p>
                              <p className="mt-2 font-mono text-sm text-slate-900">
                                {item.sourceSyncDiagnostic.errorCode}
                              </p>
                              <p className="mt-1 text-sm text-slate-700">
                                {item.sourceSyncDiagnostic.explanation}
                              </p>
                            </div>
                          ) : null}
                          {item.analysisAttempts.length > 0 ? (
                            <div className="mt-4 border-t border-slate-200 pt-4">
                              <h3 className="text-sm font-semibold text-slate-900">
                                Analysis attempt telemetry
                              </h3>
                              <ul className="mt-2 grid gap-3 lg:grid-cols-2">
                                {item.analysisAttempts.map((attempt, index) => (
                                  <li
                                    className="rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm"
                                    key={`${attempt.snapshotId}-${attempt.attemptNumber}-${index}`}
                                  >
                                    <p className="font-semibold text-slate-900">
                                      Attempt {attempt.attemptNumber}:{" "}
                                      {attempt.outcome}
                                    </p>
                                    <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-slate-700">
                                      <div>
                                        <dt className="text-xs text-slate-500">Timeout</dt>
                                        <dd>{attempt.timeoutSeconds}s</dd>
                                      </div>
                                      <div>
                                        <dt className="text-xs text-slate-500">Elapsed</dt>
                                        <dd>{attempt.elapsedMs} ms</dd>
                                      </div>
                                      <div>
                                        <dt className="text-xs text-slate-500">Evidence packets</dt>
                                        <dd>{attempt.evidencePacketCount}</dd>
                                      </div>
                                      <div>
                                        <dt className="text-xs text-slate-500">Evidence characters</dt>
                                        <dd>{attempt.totalEvidenceChars}</dd>
                                      </div>
                                      {attempt.approximateInputChars !== null ? (
                                        <div>
                                          <dt className="text-xs text-slate-500">
                                            Approx. input characters
                                          </dt>
                                          <dd>{attempt.approximateInputChars}</dd>
                                        </div>
                                      ) : null}
                                      <div>
                                        <dt className="text-xs text-slate-500">
                                          Model / reasoning
                                        </dt>
                                        <dd>
                                          {attempt.modelName} · {attempt.reasoningEffort}
                                        </dd>
                                      </div>
                                    </dl>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                          {item.pipelineFailures.length > 0 ? (
                            <div className="mt-4 border-t border-amber-200 pt-4">
                              <h3 className="text-sm font-semibold text-amber-900">
                                Pipeline failure
                              </h3>
                              <ul className="mt-2 space-y-3">
                                {item.pipelineFailures.map((failure, index) => (
                                  <li
                                    className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm"
                                    key={`${failure.timestamp}-${failure.stage}-${index}`}
                                  >
                                    <dl className="grid gap-2 sm:grid-cols-2">
                                      <div>
                                        <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                          Stage
                                        </dt>
                                        <dd className="mt-1 text-slate-800">
                                          {failure.stage}
                                        </dd>
                                      </div>
                                      <div>
                                        <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                          Error code
                                        </dt>
                                        <dd className="mt-1 font-mono text-slate-800">
                                          {failure.errorCode}
                                        </dd>
                                      </div>
                                      {failure.errorName ? (
                                        <div>
                                          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                            Error class
                                          </dt>
                                          <dd className="mt-1 font-mono text-slate-800">
                                            {failure.errorName}
                                          </dd>
                                        </div>
                                      ) : null}
                                      <div className="sm:col-span-2">
                                        <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                          Message
                                        </dt>
                                        <dd className="mt-1 text-slate-700">
                                          {failure.message}
                                        </dd>
                                      </div>
                                      <div>
                                        <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                          Failed at
                                        </dt>
                                        <dd className="mt-1 text-slate-700">
                                          {formatDateTime(failure.timestamp)}
                                        </dd>
                                      </div>
                                      {failure.attemptCount === 2 ? (
                                        <div>
                                          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                            Retry details
                                          </dt>
                                          <dd className="mt-1 text-slate-700">
                                            2 attempts · final timeout {failure.timeoutSeconds}s · reason {failure.retryReason}
                                          </dd>
                                        </div>
                                      ) : null}
                                    </dl>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                        </section>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
            {initialItems.length === 0 ? (
              <tr>
                <td
                  className="px-4 py-8 text-center text-slate-500"
                  colSpan={5}
                >
                  No durable Policy Intelligence items yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {notice ? (
        <p
          aria-live="polite"
          className="border-t border-slate-100 px-4 py-3 text-sm text-slate-700"
        >
          {notice}
        </p>
      ) : null}
    </section>
  );
}
