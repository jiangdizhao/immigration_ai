import type { AdminPolicyIntelligenceSyncRun } from "@/lib/policy-intelligence/admin-api";

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

export function AdminPolicySyncRuns({
  runs,
}: {
  runs: AdminPolicyIntelligenceSyncRun[];
}) {
  return (
    <section
      aria-label="Recent Policy Intelligence source sync runs"
      className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
    >
      <div className="border-b border-slate-200 px-4 py-4 sm:px-5">
        <h2 className="font-semibold text-slate-900">
          Recent source sync runs
        </h2>
        <p className="mt-1 text-xs text-slate-600">
          Latest five recorded runs per source. Counts describe the sync funnel;
          error codes are safe operational identifiers.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] border-collapse text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Source</th>
              <th className="px-4 py-3 font-semibold">Status / error</th>
              <th className="px-4 py-3 font-semibold">Started / completed</th>
              <th className="px-4 py-3 font-semibold">Discovered</th>
              <th className="px-4 py-3 font-semibold">Snapshots / unchanged</th>
              <th className="px-4 py-3 font-semibold">Analyzed / published</th>
              <th className="px-4 py-3 font-semibold">Held / failures</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {runs.length > 0 ? (
              runs.map((run) => (
                <tr key={run.sourceConfigId.concat("-", run.startedAt)}>
                  <td className="px-4 py-3 align-top font-medium text-slate-900">
                    {run.sourceConfigId}
                  </td>
                  <td className="px-4 py-3 align-top text-slate-700">
                    <span>{run.status}</span>
                    {run.safeErrorCode ? (
                      <code className="mt-1 block text-xs text-amber-800">
                        {run.safeErrorCode}
                      </code>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 align-top text-xs text-slate-700">
                    <span className="block">
                      {formatDateTime(run.startedAt)}
                    </span>
                    <span className="mt-1 block text-slate-500">
                      {formatDateTime(run.completedAt)}
                    </span>
                  </td>
                  <td className="px-4 py-3 align-top text-slate-700">
                    {run.discoveredCount}
                  </td>
                  <td className="px-4 py-3 align-top text-slate-700">
                    {run.snapshottedCount} / {run.unchangedCount}
                  </td>
                  <td className="px-4 py-3 align-top text-slate-700">
                    {run.analyzedCount} / {run.publishedCount}
                  </td>
                  <td className="px-4 py-3 align-top text-slate-700">
                    {run.heldCount} / {run.failureCount}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="px-4 py-6 text-sm text-slate-600" colSpan={7}>
                  No source sync runs are recorded.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
