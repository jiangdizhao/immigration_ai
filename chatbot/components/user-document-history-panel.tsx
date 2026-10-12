"use client";

import { Download, FileText, Loader2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { matterDocumentDisplayStatus } from "@/lib/matter-documents/display-status";
import { cn } from "@/lib/utils";
import type { WorkspaceCopy } from "@/lib/workspace-copy";

type UserDocumentRecord = {
  id: string;
  chatId: string;
  conversationTitle: string | null;
  originalFilename: string;
  mimeType: string;
  byteSize: number;
  processingStatus: string;
  createdAt: string;
  updatedAt: string;
};

const PAGE_LIMIT = 50;

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024))
  );
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

/**
 * Account-level historical file index.
 *
 * The same authenticated account can list and download every retained file from
 * any device. Listing a file here never adds it to another conversation's AI
 * working context: evidence stays scoped to the conversation it belongs to.
 */
export function UserDocumentHistoryPanel({
  copy,
  compact = false,
  refreshToken = 0,
  accountAccess = true,
}: {
  copy: WorkspaceCopy;
  compact?: boolean;
  /**
   * Phase 12 Stage 2: a guest account cannot own documents, so the account file
   * index is unavailable. When false the panel says so plainly and never calls
   * the document API (which would answer with a raw authorisation error).
   */
  accountAccess?: boolean;
  /**
   * Phase 12 Stage 2: incremented by the workspace whenever server-side document
   * state changes, so this list re-reads itself after an upload, delete or
   * reprocess without the user pressing refresh.
   */
  refreshToken?: number;
}) {
  const labels = copy.fileHistory;
  const [documents, setDocuments] = useState<UserDocumentRecord[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(
    async (mode: "reset" | "more", next?: string | null) => {
      if (!accountAccess) {
        setDocuments([]);
        setLoading(false);
        return;
      }
      if (mode === "more") {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      setError(null);
      try {
        const params = new URLSearchParams({ limit: String(PAGE_LIMIT) });
        if (mode === "more" && next) {
          params.set("cursor", next);
        }
        const response = await fetch(
          `/api/matter-documents/history?${params.toString()}`,
          { cache: "no-store" }
        );
        const body = await response.json();
        if (!response.ok) {
          throw new Error(
            typeof body?.error === "string" ? body.error : labels.error
          );
        }
        const received = (body.documents ?? []) as UserDocumentRecord[];
        setDocuments((current) => {
          const base = mode === "more" ? current : [];
          const seen = new Set(base.map((document) => document.id));
          return [
            ...base,
            ...received.filter((document) => !seen.has(document.id)),
          ];
        });
        setCursor(typeof body.nextCursor === "string" ? body.nextCursor : null);
        setHasMore(body.hasMore === true);
      } catch (loadError) {
        setError(
          loadError instanceof Error && loadError.message
            ? loadError.message
            : labels.error
        );
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [accountAccess, labels.error]
  );

  const lastRefreshTokenRef = useRef(refreshToken);
  useEffect(() => {
    load("reset").catch(() => undefined);
  }, [load]);

  useEffect(() => {
    if (lastRefreshTokenRef.current === refreshToken) {
      return;
    }
    lastRefreshTokenRef.current = refreshToken;
    load("reset").catch(() => undefined);
  }, [load, refreshToken]);

  const download = async (document: UserDocumentRecord) => {
    setBusyId(document.id);
    setError(null);
    try {
      const response = await fetch(
        `/api/matter-documents/${document.id}/download`
      );
      if (!response.ok) {
        throw new Error(labels.error);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = window.document.createElement("a");
      anchor.href = url;
      anchor.download = document.originalFilename;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (downloadError) {
      setError(
        downloadError instanceof Error && downloadError.message
          ? downloadError.message
          : labels.error
      );
    } finally {
      setBusyId(null);
    }
  };

  /**
   * Phase 12 Stage 2: the account-wide file index knows only the pipeline
   * status, not whether extraction produced usable text, so it never claims a
   * file is "ready for AI". It states what it can actually verify.
   */
  const statusLabel = (document: UserDocumentRecord) => {
    const status = matterDocumentDisplayStatus({
      processingStatus: document.processingStatus,
    });
    if (status === "processing") {
      return labels.processing;
    }
    if (status === "failed") {
      return labels.failed;
    }
    if (status === "not_started") {
      return labels.saved;
    }
    return labels.extractionFinished;
  };

  return (
    <section
      className={cn(
        compact ? "min-w-0" : "rounded-2xl border border-slate-200 bg-white p-3"
      )}
      data-testid="user-document-history"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800">
            <FileText className="size-4" />
            {labels.title}
          </h3>
          {compact ? null : (
            <p className="mt-1 text-xs text-slate-500">{labels.description}</p>
          )}
        </div>
        <Button
          aria-label={labels.title}
          disabled={loading || loadingMore}
          onClick={() => load("reset").catch(() => undefined)}
          size="icon"
          title={labels.title}
          variant="ghost"
        >
          {loading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
        </Button>
      </div>

      {accountAccess ? null : (
        <p
          className="mt-2 text-xs text-slate-500"
          data-testid="account-files-guest-hint"
        >
          {copy.documents.signInForFiles}
        </p>
      )}

      {error ? (
        <p className="mt-2 text-xs text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      {loading && documents.length === 0 ? (
        <p className="mt-2 text-xs text-slate-500">{labels.loading}</p>
      ) : null}

      {!loading && documents.length === 0 && !error ? (
        <p className="mt-2 text-xs text-slate-500">{labels.empty}</p>
      ) : null}

      <ul className={compact ? "mt-2 space-y-1.5" : "mt-3 space-y-2"}>
        {documents.map((document) => (
          <li
            className="flex min-w-0 items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-2 py-1.5"
            key={document.id}
          >
            <div className="min-w-0">
              <p
                className="truncate text-xs font-medium text-slate-800"
                title={document.originalFilename}
              >
                {document.originalFilename}
              </p>
              <p className="mt-0.5 truncate text-[10px] text-slate-500">
                {formatBytes(document.byteSize)} · {statusLabel(document)}
                {document.conversationTitle
                  ? ` · ${labels.conversation}: ${document.conversationTitle}`
                  : ""}
              </p>
            </div>
            <Button
              aria-label={labels.download}
              className="size-7 shrink-0"
              disabled={busyId !== null || !accountAccess}
              onClick={() => download(document).catch(() => undefined)}
              size="icon"
              title={labels.download}
              variant="ghost"
            >
              {busyId === document.id ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Download className="size-4" />
              )}
            </Button>
          </li>
        ))}
      </ul>

      {hasMore ? (
        <Button
          className="mt-3"
          disabled={loading || loadingMore}
          onClick={() => load("more", cursor).catch(() => undefined)}
          size="sm"
          variant="outline"
        >
          {loadingMore ? (
            <Loader2 className="mr-1 size-4 animate-spin" />
          ) : null}
          {labels.loadMore}
        </Button>
      ) : null}
    </section>
  );
}
