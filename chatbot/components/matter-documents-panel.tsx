"use client";

import {
  Download,
  FileText,
  Loader2,
  Paperclip,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { WorkspaceCopy } from "@/lib/workspace-copy";

type DocumentRecord = {
  id: string;
  chatId: string;
  originalFilename: string;
  mimeType: string;
  processingStatus: string;
  securityStatus: string;
};
type RunState = {
  status: string | null;
  unitCount: number;
  truncated: boolean;
  errorCode?: string | null;
};
const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
  md: "text/markdown",
  json: "application/json",
  csv: "text/csv",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};
const ACCEPT = ".pdf,.jpg,.jpeg,.png,.doc,.docx,.txt,.md,.json,.csv,.xls,.xlsx";

export function MatterDocumentsPanel({
  chatId,
  copy,
  disabled = false,
  compact = false,
}: {
  chatId: string | null;
  copy: WorkspaceCopy;
  disabled?: boolean;
  compact?: boolean;
}) {
  const labels = copy.documents;
  const _zh = copy.identity.title === "AI 工作台";
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [runs, setRuns] = useState<Record<string, RunState>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const load = useCallback(async () => {
    if (!chatId) {
      setDocuments([]);
      setRuns({});
      return;
    }
    const response = await fetch(
      `/api/matter-documents?chatId=${encodeURIComponent(chatId)}`,
      { cache: "no-store" }
    );
    const body = await response.json();
    if (!response.ok) {
      throw new Error(body.error ?? labels.uploadError);
    }
    const next = (body.documents ?? []) as DocumentRecord[];
    setDocuments(next);
    const entries = await Promise.all(
      next.map(async (doc) => {
        try {
          const res = await fetch(
            `/api/matter-documents/${doc.id}/processing`,
            { cache: "no-store" }
          );
          const value = await res.json();
          return [
            doc.id,
            {
              status: value.run?.status ?? null,
              unitCount: Number.isInteger(value.unitCount)
                ? value.unitCount
                : 0,
              truncated: Boolean(value.run?.truncated),
              errorCode:
                typeof value.errorCode === "string" ? value.errorCode : null,
            },
          ] as const;
        } catch {
          return [
            doc.id,
            { status: null, unitCount: 0, truncated: false },
          ] as const;
        }
      })
    );
    setRuns(Object.fromEntries(entries));
  }, [chatId, labels.uploadError]);
  useEffect(() => {
    setDocuments([]);
    setRuns({});
    setError(null);
    load().catch((e) =>
      setError(e instanceof Error ? e.message : labels.uploadError)
    );
  }, [load, labels.uploadError]);
  const process = async (
    doc: DocumentRecord,
    mode?: "retryFailed" | "reprocessIncomplete"
  ) => {
    setBusy(doc.id);
    setError(null);
    try {
      const res = await fetch(`/api/matter-documents/${doc.id}/processing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode ? { [mode]: true } : {}),
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error ?? labels.uploadError);
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : labels.uploadError);
    } finally {
      setBusy(null);
    }
  };
  const upload = async (file: File) => {
    if (!chatId) {
      return;
    }
    setBusy("upload");
    setError(null);
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    const mime =
      file.type || MIME_BY_EXTENSION[extension] || "application/octet-stream";
    try {
      const res = await fetch(
        `/api/matter-documents?chatId=${encodeURIComponent(chatId)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": mime,
            "X-Original-Filename": encodeURIComponent(file.name),
          },
          body: file,
        }
      );
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error ?? labels.uploadError);
      }
      const doc = body.document as DocumentRecord;
      await load();
      await process(doc);
    } catch (e) {
      setError(e instanceof Error ? e.message : labels.uploadError);
    } finally {
      setBusy(null);
    }
  };
  const remove = async (doc: DocumentRecord) => {
    setBusy(doc.id);
    setError(null);
    try {
      const res = await fetch(`/api/matter-documents/${doc.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        throw new Error(labels.uploadError);
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : labels.uploadError);
    } finally {
      setBusy(null);
    }
  };
  const download = async (doc: DocumentRecord) => {
    setBusy(doc.id);
    try {
      const res = await fetch(`/api/matter-documents/${doc.id}/download`);
      if (!res.ok) {
        throw new Error(labels.uploadError);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = doc.originalFilename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : labels.uploadError);
    } finally {
      setBusy(null);
    }
  };
  const statusLabel = (doc: DocumentRecord) => {
    const run = runs[doc.id];
    if (
      run?.unitCount &&
      ["complete", "partial", "needs_review"].includes(run.status ?? "")
    ) {
      return labels.availableToAI;
    }
    const status =
      run?.status ??
      (doc.processingStatus === "processing"
        ? "processing"
        : doc.processingStatus);
    if (status === "complete") {
      return labels.ready;
    }
    if (status === "needs_review") {
      return labels.needsReview;
    }
    if (status === "not_started") {
      return labels.notStarted;
    }
    if (status && status in labels) {
      return labels[status as keyof typeof labels];
    }
    return labels.notStarted;
  };
  return (
    <section
      className={
        compact
          ? "flex min-w-0 max-w-[52%] flex-wrap items-center gap-1"
          : "border-b border-slate-100 px-4 py-3 sm:px-5"
      }
      data-testid="matter-documents-panel"
    >
      <div
        className={
          compact
            ? "contents"
            : "flex flex-wrap items-center justify-between gap-2"
        }
      >
        {compact ? null : (
          <h3 className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Paperclip className="size-4" />
            {labels.title}
          </h3>
        )}
        <Button
          aria-label={labels.upload}
          className={compact ? "size-8 shrink-0 rounded-full" : undefined}
          disabled={!chatId || disabled || busy !== null}
          onClick={() => inputRef.current?.click()}
          size={compact ? "icon" : "sm"}
          title={compact ? labels.upload : undefined}
          type="button"
          variant={compact ? "ghost" : "outline"}
        >
          {compact ? (
            <Plus className="size-5" />
          ) : (
            <>
              <Upload className="mr-1 size-4" />
              {labels.upload}
            </>
          )}
        </Button>
        <input
          accept={ACCEPT}
          className="hidden"
          onChange={async (event) => {
            const input = event.currentTarget;
            try {
              const file = input.files?.[0];
              if (file) {
                await upload(file);
              }
            } finally {
              input.value = "";
            }
          }}
          ref={inputRef}
          type="file"
        />
      </div>
      {compact ? null : (
        <p className="mt-1 text-xs text-slate-500">
          {labels.formats} {labels.unverified}
        </p>
      )}
      {error ? (
        <p
          className={
            compact
              ? "basis-full text-xs text-red-700"
              : "mt-2 text-xs text-red-700"
          }
          role="alert"
        >
          {error}
        </p>
      ) : null}
      {documents.length ? (
        <ul
          className={
            compact
              ? "flex min-w-0 max-w-full flex-nowrap items-center gap-1.5 overflow-x-auto"
              : "mt-3 grid gap-2 sm:grid-cols-2"
          }
        >
          {documents.map((doc) => {
            const run = runs[doc.id];
            const status = run?.status;
            return (
              <li
                className={cn(
                  compact
                    ? "flex min-w-0 max-w-full items-center gap-1.5 rounded-full border px-2 py-1"
                    : "min-w-0 rounded-xl border p-2.5",
                  "border-slate-200 bg-white"
                )}
                key={doc.id}
              >
                <div
                  className={
                    compact
                      ? "flex min-w-0 items-center gap-1.5"
                      : "flex min-w-0 items-start gap-2"
                  }
                >
                  <FileText className="size-4 shrink-0 text-slate-500" />
                  <div
                    className={compact ? "min-w-0 max-w-36" : "min-w-0 flex-1"}
                  >
                    <p
                      className={
                        compact
                          ? "truncate text-[11px] font-medium text-slate-800"
                          : "truncate text-xs font-medium text-slate-800"
                      }
                      title={doc.originalFilename}
                    >
                      {doc.originalFilename}
                    </p>
                    <p className="mt-0.5 truncate text-[10px] text-slate-500">
                      {busy === doc.id
                        ? labels.processing
                        : run?.errorCode === "vision_unavailable"
                          ? labels.visionUnavailable
                          : statusLabel(doc)}
                    </p>
                    {run?.truncated ||
                    status === "partial" ||
                    status === "needs_review" ? (
                      <p className="mt-1 truncate text-[10px] text-amber-800">
                        {labels.incomplete}
                      </p>
                    ) : null}
                  </div>
                </div>
                <div
                  className={
                    compact
                      ? "flex shrink-0 items-center gap-0.5"
                      : "mt-2 flex flex-wrap gap-1.5"
                  }
                >
                  <Button
                    aria-label={labels.download}
                    className={compact ? "size-7" : undefined}
                    disabled={busy !== null}
                    onClick={() => download(doc).catch(() => undefined)}
                    size="icon"
                    title={labels.download}
                    variant="ghost"
                  >
                    <Download className="size-4" />
                  </Button>
                  {status === "failed" ? (
                    <Button
                      aria-label={labels.retry}
                      className={compact ? "size-7" : undefined}
                      disabled={busy !== null}
                      onClick={() =>
                        process(doc, "retryFailed").catch(() => undefined)
                      }
                      size="icon"
                      title={labels.retry}
                      variant="ghost"
                    >
                      <RefreshCw className="size-4" />
                    </Button>
                  ) : null}
                  {status === "partial" || status === "needs_review" ? (
                    <Button
                      aria-label={labels.reprocess}
                      className={compact ? "size-7" : undefined}
                      disabled={busy !== null}
                      onClick={() =>
                        process(doc, "reprocessIncomplete").catch(
                          () => undefined
                        )
                      }
                      size="icon"
                      title={labels.reprocess}
                      variant="ghost"
                    >
                      <RefreshCw className="size-4" />
                    </Button>
                  ) : null}
                  <Button
                    aria-label={labels.delete}
                    className={compact ? "size-7" : undefined}
                    disabled={busy !== null}
                    onClick={() => remove(doc).catch(() => undefined)}
                    size="icon"
                    title={labels.delete}
                    variant="ghost"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                  {busy === doc.id ? (
                    <Loader2 className="size-4 animate-spin self-center" />
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : compact ? null : (
        <p className="mt-2 text-xs text-slate-500">{labels.documents}: —</p>
      )}
    </section>
  );
}
