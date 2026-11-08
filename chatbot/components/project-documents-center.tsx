"use client";

import { FileLock2, RefreshCw, Undo2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ProjectArtifactKind,
  ProjectArtifactOwnerView,
  ProjectArtifactsSummary,
} from "@/lib/workspace/project-artifacts";
import {
  DEFAULT_DOCUMENT_FILTER,
  filterProjectDocuments,
  type ProjectDocumentFilter,
  type ProjectDocumentOriginKind,
  type ProjectDocumentRow,
  type ProjectDocumentSelection,
  parseProjectDocumentRows,
  projectDocumentDownloadUrl,
  projectDocumentVersionKey,
  selectProjectDocumentVersion,
} from "@/lib/workspace/project-documents-view";
import type { ProjectWorkspaceView } from "@/lib/workspace/project-workspace-view";
import type { WorkspaceCopy } from "@/lib/workspace-copy";

type DocumentsCopy = WorkspaceCopy["projectEntry"]["documents"];
type CentreCopy = WorkspaceCopy["projectEntry"]["projectWorkspace"];

const ARTIFACT_KIND_LABEL_KEYS = {
  school_application_package: "artifactKindSchoolApplicationPackage",
  student500_gs_draft: "artifactKindStudent500GsDraft",
  student500_snapshot: "artifactKindStudent500Snapshot",
  submission_package: "artifactKindSubmissionPackage",
} as const satisfies Record<ProjectArtifactKind, keyof CentreCopy>;

const ARTIFACT_OWNER_VIEWS: Record<
  ProjectArtifactOwnerView,
  ProjectWorkspaceView
> = {
  applications: "applications",
  student500: "student500",
};

/**
 * Phase 13 M9-A Project document centre.
 *
 * Real M2 metadata only, and only the versions the server authorized for this actor.
 * Categories that are *not* project documents (AI drafts, checked reports, immutable
 * submission packages) are never dressed up as uploaded files: they appear in the
 * separate *reference* list below, backed by the workflow service that owns them, and
 * the capability is reported as closed while the production storage/scan gate is
 * closed.
 *
 * Selection is by **exact version**, not by asset: one asset can expose several granted
 * versions, so both the React key and the selected state include `versionId`. Download
 * is offered only for a stored, clean, active version of the selected version, and the
 * download endpoint re-checks authorization independently — a visible filename is never
 * permission to read the content.
 */
export function ProjectDocumentsCenter({
  copy,
  centreCopy,
  enabled,
  projectId,
  artifacts = null,
  onReturnToPrevious,
  returnLabel,
  onOpenArtifactOwner,
}: {
  copy: DocumentsCopy;
  centreCopy: CentreCopy;
  enabled: boolean;
  projectId: string;
  projectRevision?: number;
  /** Read-only generated-artifact references (metadata only, no content). */
  artifacts?: ProjectArtifactsSummary | null;
  /**
   * Returns to the view the customer came from. There is no authorized
   * document→step association in this milestone, so the label must never claim the
   * document's "originating step".
   */
  onReturnToPrevious?: () => void;
  returnLabel?: string;
  /** Navigation into the existing workspace view that owns an artifact. */
  onOpenArtifactOwner?: (view: ProjectWorkspaceView) => void;
}) {
  const [rows, setRows] = useState<ProjectDocumentRow[]>([]);
  const [filter, setFilter] = useState<ProjectDocumentFilter>(
    DEFAULT_DOCUMENT_FILTER
  );
  const [selected, setSelected] = useState<ProjectDocumentSelection | null>(
    null
  );
  const [loading, setLoading] = useState(enabled);
  const [failed, setFailed] = useState(false);
  const generation = useRef(0);

  const endpoint = `/api/projects/${encodeURIComponent(projectId)}/documents`;

  const load = useCallback(async () => {
    if (!enabled) {
      setRows([]);
      setLoading(false);
      return;
    }
    generation.current += 1;
    const requestId = generation.current;
    setLoading(true);
    setFailed(false);
    try {
      const response = await fetch(endpoint, {
        cache: "no-store",
        credentials: "same-origin",
        headers: { accept: "application/json" },
      });
      if (!response.ok) {
        throw new Error("document_list_failed");
      }
      const parsed = parseProjectDocumentRows(
        await response.json(),
        "documents"
      );
      if (generation.current !== requestId) {
        return;
      }
      if (!Array.isArray(parsed)) {
        throw new Error("invalid_document_response");
      }
      setRows(parsed);
    } catch {
      if (generation.current === requestId) {
        setRows([]);
        setFailed(true);
      }
    } finally {
      if (generation.current === requestId) {
        setLoading(false);
      }
    }
  }, [enabled, endpoint]);

  useEffect(() => {
    load().catch(() => undefined);
    return () => {
      generation.current += 1;
    };
  }, [load]);

  const visible = useMemo(
    () => filterProjectDocuments(rows, filter),
    [rows, filter]
  );
  const selectedRow = selectProjectDocumentVersion(visible, selected);
  const selectedKey = selectedRow
    ? projectDocumentVersionKey(selectedRow)
    : null;
  const attention = rows.filter(
    (row) =>
      row.storageStatus !== "stored" ||
      row.securityStatus !== "clean" ||
      row.lifecycle !== "active"
  ).length;

  return (
    <section
      className="space-y-3 rounded-xl border border-slate-200 bg-white p-4"
      data-testid="project-documents-centre"
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-950">
            {centreCopy.documentsCenterTitle}
          </h3>
          <p className="mt-1 max-w-xl text-[11px] leading-5 text-slate-600">
            {centreCopy.documentsCenterSubtitle}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {onReturnToPrevious ? (
            <button
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-[11px] font-semibold text-slate-800 hover:bg-slate-50"
              data-testid="project-documents-return-to-previous"
              onClick={onReturnToPrevious}
              type="button"
            >
              <Undo2 aria-hidden="true" className="size-3.5" />
              {returnLabel ?? centreCopy.documentsBackToPrevious}
            </button>
          ) : null}
          <button
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-[11px] font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
            data-testid="project-documents-refresh"
            disabled={!enabled || loading}
            onClick={() => {
              load().catch(() => undefined);
            }}
            type="button"
          >
            <RefreshCw aria-hidden="true" className="size-3.5" />
            {centreCopy.refresh}
          </button>
        </div>
      </header>

      {enabled ? null : (
        <div
          className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11px] leading-5 text-amber-900"
          data-testid="project-documents-centre-unavailable"
        >
          <p className="flex items-center gap-1 font-semibold">
            <FileLock2 aria-hidden="true" className="size-3.5" />
            {copy.unavailable}
          </p>
          <p className="mt-1">{copy.scannerGate}</p>
          <p className="mt-1">{copy.ownOnly}</p>
        </div>
      )}

      {enabled ? (
        <div className="space-y-3">
          <div
            className="flex flex-wrap items-center gap-2"
            data-testid="project-documents-filters"
          >
            <select
              aria-label={centreCopy.documentsFilterSource}
              className="rounded border border-slate-200 px-1.5 py-1 text-[11px]"
              data-testid="project-documents-filter-origin"
              onChange={(event) => {
                setFilter((current) => ({
                  ...current,
                  origin: event.target.value as
                    | "all"
                    | ProjectDocumentOriginKind,
                }));
              }}
              value={filter.origin}
            >
              <option value="all">{centreCopy.documentsFilterAll}</option>
              <option value="direct_upload">
                {centreCopy.sourceDirectUpload}
              </option>
              <option value="explicit_chat_import">
                {centreCopy.sourceChatImport}
              </option>
            </select>
            <select
              aria-label={centreCopy.documentsFilterState}
              className="rounded border border-slate-200 px-1.5 py-1 text-[11px]"
              data-testid="project-documents-filter-state"
              onChange={(event) => {
                setFilter((current) => ({
                  ...current,
                  state: event.target.value as ProjectDocumentFilter["state"],
                }));
              }}
              value={filter.state}
            >
              <option value="all">{centreCopy.documentsFilterAll}</option>
              <option value="active">{centreCopy.lifecycleActive}</option>
              <option value="withdrawn">{centreCopy.lifecycleWithdrawn}</option>
            </select>
            <input
              aria-label={centreCopy.documentsSearch}
              className="min-w-0 flex-1 rounded border border-slate-200 px-2 py-1 text-[11px]"
              data-testid="project-documents-search"
              onChange={(event) => {
                setFilter((current) => ({
                  ...current,
                  search: event.target.value,
                }));
              }}
              placeholder={centreCopy.documentsSearchPlaceholder}
              value={filter.search}
            />
          </div>

          <p
            className="text-[11px] text-slate-500"
            data-testid="project-documents-counts"
          >
            {centreCopy.openItems(rows.length)} ·{" "}
            {centreCopy.needsAttention(attention)}
          </p>

          {loading ? (
            <p className="text-[11px] text-slate-600">{copy.loading}</p>
          ) : failed ? (
            <p
              className="text-[11px] font-semibold text-red-700"
              data-testid="project-documents-centre-failed"
            >
              {copy.loadFailed}
            </p>
          ) : visible.length === 0 ? (
            <p className="text-[11px] text-slate-600">
              {rows.length === 0 ? copy.empty : centreCopy.documentsEmptyFilter}
            </p>
          ) : (
            <ul
              className="divide-y divide-slate-100"
              data-testid="project-documents-list"
            >
              {visible.map((row) => {
                const rowKey = projectDocumentVersionKey(row);
                const isSelected = rowKey === selectedKey;
                return (
                  <li key={rowKey}>
                    <button
                      aria-pressed={isSelected}
                      className={
                        isSelected
                          ? "flex w-full flex-wrap items-center justify-between gap-2 bg-blue-50 px-2 py-2 text-left"
                          : "flex w-full flex-wrap items-center justify-between gap-2 px-2 py-2 text-left hover:bg-slate-50"
                      }
                      data-testid={`project-document-version-${row.assetId}-${row.versionId}`}
                      onClick={() =>
                        setSelected({
                          assetId: row.assetId,
                          versionId: row.versionId,
                        })
                      }
                      type="button"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-semibold text-slate-900">
                          {row.canonicalMime} ·{" "}
                          {centreCopy.documentsVersionLabel(row.versionNumber)}
                        </span>
                        <span className="block text-[11px] text-slate-500">
                          {row.originKind === "direct_upload"
                            ? centreCopy.sourceDirectUpload
                            : centreCopy.sourceChatImport}
                        </span>
                      </span>
                      <span className="text-[10px] font-semibold text-slate-600">
                        {row.lifecycle === "active"
                          ? centreCopy.lifecycleActive
                          : centreCopy.lifecycleWithdrawn}
                        {" · "}
                        {row.securityStatus === "clean"
                          ? copy.stored
                          : row.securityStatus === "pending"
                            ? copy.securityPending
                            : row.securityStatus === "rejected"
                              ? copy.rejected
                              : copy.securityFailed}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <div
            className="rounded-lg border border-slate-200 bg-slate-50 p-3"
            data-testid="project-documents-selected"
          >
            <h4 className="text-xs font-semibold text-slate-900">
              {centreCopy.documentsSelected}
            </h4>
            {selectedRow ? (
              <dl className="mt-2 space-y-1 text-[11px] text-slate-700">
                <div className="flex gap-2">
                  <dt className="font-semibold">
                    {centreCopy.documentsVersionHistory}
                  </dt>
                  <dd>
                    {centreCopy.documentsVersionLabel(
                      selectedRow.versionNumber
                    )}
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="font-semibold">
                    {centreCopy.documentsOrigin}
                  </dt>
                  <dd>
                    {selectedRow.originKind === "direct_upload"
                      ? centreCopy.sourceDirectUpload
                      : centreCopy.sourceChatImport}
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="font-semibold">
                    {centreCopy.documentsProvenance}
                  </dt>
                  <dd className="break-all font-mono">
                    asset {selectedRow.assetId.slice(0, 8)} · version{" "}
                    {selectedRow.versionId.slice(0, 8)}
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="font-semibold">{copy.title}</dt>
                  <dd>{selectedRow.canonicalMime}</dd>
                </div>
                {selectedRow.storageStatus === "stored" &&
                selectedRow.securityStatus === "clean" &&
                selectedRow.lifecycle === "active" ? (
                  <a
                    className="inline-block rounded-lg bg-[#001736] px-3 py-1.5 text-[11px] font-semibold text-white"
                    data-testid="project-documents-download"
                    href={projectDocumentDownloadUrl({
                      assetId: selectedRow.assetId,
                      projectId,
                      versionId: selectedRow.versionId,
                    })}
                  >
                    {copy.download}
                  </a>
                ) : (
                  <p
                    className="font-semibold text-amber-800"
                    data-testid="project-documents-download-blocked"
                  >
                    {copy.pendingScan}
                  </p>
                )}
              </dl>
            ) : (
              <p className="mt-1 text-[11px] text-slate-600">
                {centreCopy.documentsNoSelection}
              </p>
            )}
          </div>
        </div>
      ) : null}

      {/*
        Phase 13 M9-A R1-05: generated artifacts owned by the M5.1/M6.2 workflows.
        These are references, not project documents: identity/version/status/digest plus
        a navigation link into the owning view. No content, no preview, no download.
      */}
      <section
        className="space-y-2 border-t border-slate-100 pt-3"
        data-testid="project-artifacts"
      >
        <h4 className="text-xs font-semibold text-slate-950">
          {centreCopy.artifactsTitle}
        </h4>
        <p className="text-[11px] leading-5 text-slate-600">
          {centreCopy.artifactsSubtitle}
        </p>
        {artifacts && artifacts.references.length > 0 ? (
          <ul
            className="divide-y divide-slate-100"
            data-testid="project-artifacts-list"
          >
            {artifacts.references.map((reference) => (
              <li
                className="flex flex-wrap items-center justify-between gap-2 py-2"
                data-testid={`project-artifact-${reference.kind}-${reference.referenceId}`}
                key={`${reference.kind}:${reference.referenceId}`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-xs font-semibold text-slate-900">
                    {centreCopy[ARTIFACT_KIND_LABEL_KEYS[reference.kind]]}
                  </span>
                  <span className="block text-[11px] text-slate-500">
                    {centreCopy.artifactVersion} {reference.version ?? "-"}
                    {reference.status ? ` · ${reference.status}` : null}
                    {reference.targetId
                      ? ` · #${reference.targetId.slice(0, 8)}`
                      : null}
                  </span>
                  {reference.digest ? (
                    <span className="block break-all font-mono text-[10px] text-slate-500">
                      {reference.digest.slice(0, 16)}
                    </span>
                  ) : null}
                  {reference.stale ? (
                    <span className="block text-[10px] font-semibold text-amber-800">
                      {centreCopy.artifactStale}
                    </span>
                  ) : null}
                </span>
                {onOpenArtifactOwner ? (
                  <button
                    className="rounded-lg border border-slate-300 px-2.5 py-1 text-[11px] font-semibold text-slate-800 hover:bg-slate-50"
                    data-testid={`project-artifact-open-${reference.kind}-${reference.referenceId}`}
                    onClick={() =>
                      onOpenArtifactOwner(
                        ARTIFACT_OWNER_VIEWS[reference.ownerView]
                      )
                    }
                    type="button"
                  >
                    {centreCopy.artifactOpenOwner}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p
            className="text-[11px] text-slate-600"
            data-testid="project-artifacts-empty"
          >
            {centreCopy.artifactsEmpty}
          </p>
        )}
        {artifacts?.truncated ? (
          <p className="text-[10px] text-slate-500">
            {centreCopy.artifactsTruncated}
          </p>
        ) : null}
        {artifacts
          ? Object.entries(artifacts.kinds)
              .filter(([, state]) => state !== "available")
              .map(([kind, state]) => (
                <p
                  className="text-[10px] leading-4 text-amber-800"
                  data-testid={`project-artifacts-kind-${kind}`}
                  key={kind}
                >
                  {
                    centreCopy[
                      ARTIFACT_KIND_LABEL_KEYS[kind as ProjectArtifactKind]
                    ]
                  }
                  {" · "}
                  {state === "disabled"
                    ? centreCopy.artifactKindDisabled
                    : state === "unsupported"
                      ? centreCopy.artifactKindUnsupported
                      : centreCopy.artifactKindUnavailable}
                </p>
              ))
          : null}
        <p className="text-[10px] leading-4 text-slate-500">
          {centreCopy.artifactsNoContent}
        </p>
      </section>
    </section>
  );
}
