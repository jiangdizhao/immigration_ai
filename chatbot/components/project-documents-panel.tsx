"use client";

import { FileLock2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { PROJECT_DOCUMENT_IMPORT_NOTICE_VERSION } from "@/lib/project-documents/types";

type ProjectDocumentPanelCopy = {
  title: string;
  unavailable: string;
  ownOnly: string;
  scannerGate: string;
  loading: string;
  empty: string;
  loadFailed: string;
  upload: string;
  importing: string;
  sourceChatId: string;
  sourceDocumentId: string;
  consent: string;
  import: string;
  download: string;
  withdraw: string;
  pendingScan: string;
  stored: string;
  clean: string;
  rejected: string;
  failed: string;
  uploading: string;
  storagePending: string;
  storageStored: string;
  cleanupPending: string;
  securityPending: string;
  securityFailed: string;
};

type DocumentRow = {
  assetId: string;
  versionId: string;
  versionNumber: number;
  lifecycle: "active" | "withdrawn" | "deletion_pending" | "deleted";
  originKind: "direct_upload" | "explicit_chat_import";
  canonicalMime: string;
  byteSize: number;
  storageStatus: "pending" | "stored" | "failed" | "cleanup_pending";
  securityStatus: "pending" | "clean" | "rejected" | "failed";
};

export function createProjectDocumentRequestGeneration() {
  let generation = 0;
  return {
    begin() {
      generation += 1;
      return generation;
    },
    isCurrent(candidate: number) {
      return generation === candidate;
    },
    invalidate() {
      generation += 1;
    },
  };
}

export function ProjectDocumentsPanel(props: {
  copy: ProjectDocumentPanelCopy;
  projectId: string;
  projectRevision: number;
  enabled?: boolean;
}) {
  const enabled = props.enabled ?? false;
  const key = `${props.projectId}:${enabled ? "enabled" : "disabled"}`;
  return (
    <ProjectDocumentsPanelInstance key={key} {...props} enabled={enabled} />
  );
}

function ProjectDocumentsPanelInstance({
  copy,
  projectId,
  projectRevision,
  enabled = false,
}: {
  copy: ProjectDocumentPanelCopy;
  projectId: string;
  projectRevision: number;
  enabled?: boolean;
}) {
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [revision, setRevision] = useState(projectRevision);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [sourceChatId, setSourceChatId] = useState("");
  const [sourceDocumentId, setSourceDocumentId] = useState("");
  const [consentAccepted, setConsentAccepted] = useState(false);
  const requestGeneration = useRef(createProjectDocumentRequestGeneration());

  const endpoint = `/api/projects/${encodeURIComponent(projectId)}/documents`;
  const refresh = useCallback(async () => {
    if (!enabled) {
      return;
    }
    const requestId = requestGeneration.current.begin();
    setDocuments([]);
    setLoading(true);
    setError(false);
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      if (!response.ok) {
        throw new Error("request_failed");
      }
      const body = (await response.json()) as { documents?: DocumentRow[] };
      if (requestGeneration.current.isCurrent(requestId)) {
        setDocuments(Array.isArray(body.documents) ? body.documents : []);
      }
    } catch {
      if (requestGeneration.current.isCurrent(requestId)) {
        setDocuments([]);
        setError(true);
      }
    } finally {
      if (requestGeneration.current.isCurrent(requestId)) {
        setLoading(false);
      }
    }
  }, [enabled, endpoint]);

  useEffect(() => {
    setRevision(projectRevision);
    refresh().catch(() => setError(true));
    return () => requestGeneration.current.invalidate();
  }, [projectRevision, refresh]);

  async function uploadDocument(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || !enabled || busy) {
      return;
    }
    setBusy(true);
    setError(false);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": file.type || "application/octet-stream",
          "x-operation-id": crypto.randomUUID(),
          "x-expected-project-revision": String(revision),
          "x-original-filename": encodeURIComponent(file.name),
        },
        body: file,
      });
      if (!response.ok) {
        throw new Error("upload_failed");
      }
      const body = (await response.json()) as {
        document?: { projectRevision?: number };
      };
      if (typeof body.document?.projectRevision === "number") {
        setRevision(body.document.projectRevision);
      }
      setFile(null);
      await refresh();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  async function importDocument(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!enabled || !consentAccepted || busy) {
      return;
    }
    setBusy(true);
    setError(false);
    try {
      const consentResponse = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/document-imports/consent`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            sourceChatId,
            sourceDocumentId,
            accepted: true,
            noticeVersion: PROJECT_DOCUMENT_IMPORT_NOTICE_VERSION,
          }),
        }
      );
      if (!consentResponse.ok) {
        throw new Error("consent_failed");
      }
      const consent = (await consentResponse.json()) as {
        acknowledgement?: string;
      };
      if (!consent.acknowledgement) {
        throw new Error("consent_failed");
      }
      const importResponse = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/document-imports`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            operationId: crypto.randomUUID(),
            expectedProjectRevision: revision,
            sourceChatId,
            sourceDocumentId,
            consentAcknowledgement: consent.acknowledgement,
          }),
        }
      );
      if (!importResponse.ok) {
        throw new Error("import_failed");
      }
      const body = (await importResponse.json()) as {
        document?: { projectRevision?: number };
      };
      if (typeof body.document?.projectRevision === "number") {
        setRevision(body.document.projectRevision);
      }
      setConsentAccepted(false);
      await refresh();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  async function withdrawDocument(assetId: string) {
    if (!enabled || busy) {
      return;
    }
    setBusy(true);
    setError(false);
    try {
      const response = await fetch(
        `${endpoint}/${encodeURIComponent(assetId)}/withdraw`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            operationId: crypto.randomUUID(),
            expectedProjectRevision: revision,
          }),
        }
      );
      if (!response.ok) {
        throw new Error("withdraw_failed");
      }
      const body = (await response.json()) as {
        document?: { projectRevision?: number };
      };
      if (typeof body.document?.projectRevision === "number") {
        setRevision(body.document.projectRevision);
      }
      await refresh();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  function storageLabel(document: DocumentRow) {
    switch (document.storageStatus) {
      case "pending":
        return copy.storagePending;
      case "stored":
        return copy.storageStored;
      case "cleanup_pending":
        return copy.cleanupPending;
      case "failed":
        return copy.failed;
      default:
        return copy.failed;
    }
  }

  function securityLabel(document: DocumentRow) {
    switch (document.securityStatus) {
      case "pending":
        return copy.securityPending;
      case "clean":
        return copy.clean;
      case "rejected":
        return copy.rejected;
      case "failed":
        return copy.securityFailed;
      default:
        return copy.securityFailed;
    }
  }

  return (
    <section
      aria-label={copy.title}
      className="space-y-2 rounded-xl border border-slate-200 bg-white p-3"
      data-testid="project-documents-panel"
    >
      <h4 className="flex items-center gap-2 text-xs font-semibold text-slate-800">
        <FileLock2
          aria-hidden="true"
          className="size-4 shrink-0 text-slate-500"
        />
        {copy.title}
      </h4>
      <p className="text-[11px] leading-4 text-slate-600">{copy.ownOnly}</p>
      {enabled ? (
        <div className="space-y-3">
          <p className="text-[11px] leading-4 text-amber-800">
            {copy.scannerGate}
          </p>
          {loading ? (
            <p className="text-xs text-slate-500">{copy.loading}</p>
          ) : null}
          {error ? (
            <p className="text-xs text-red-700" role="alert">
              {copy.loadFailed}
            </p>
          ) : null}
          {!loading && !error && documents.length === 0 ? (
            <p className="text-xs text-slate-500">{copy.empty}</p>
          ) : null}
          <ul className="space-y-2">
            {documents.map((document) => (
              <li
                className="rounded-lg border border-slate-100 p-2"
                key={document.versionId}
              >
                <p className="break-all font-mono text-[10px] text-slate-500">
                  {document.assetId}
                </p>
                <p className="text-xs text-slate-700">
                  {document.canonicalMime} · {document.byteSize} bytes
                </p>
                <p className="text-[11px] text-slate-600">
                  {storageLabel(document)}
                </p>
                <p className="text-[11px] text-slate-600">
                  {securityLabel(document)}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {document.lifecycle === "active" &&
                  document.storageStatus === "stored" &&
                  document.securityStatus === "clean" ? (
                    <a
                      className="text-xs font-semibold text-blue-800 underline"
                      href={`${endpoint}/${encodeURIComponent(document.assetId)}/download?versionId=${encodeURIComponent(document.versionId)}`}
                    >
                      {copy.download}
                    </a>
                  ) : null}
                  {document.lifecycle === "active" ? (
                    <button
                      className="text-xs font-semibold text-red-700 underline disabled:opacity-50"
                      disabled={busy}
                      onClick={() => {
                        withdrawDocument(document.assetId);
                      }}
                      type="button"
                    >
                      {copy.withdraw}
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
          <form
            className="space-y-2 border-t border-slate-100 pt-3"
            onSubmit={(event) => {
              uploadDocument(event);
            }}
          >
            <label className="block text-xs font-medium text-slate-700">
              {copy.upload}
              <input
                className="mt-1 block w-full text-xs"
                disabled={busy}
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                type="file"
              />
            </label>
            <button
              className="rounded-lg bg-[#001736] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
              disabled={busy || !file}
              type="submit"
            >
              {busy ? copy.uploading : copy.upload}
            </button>
          </form>
          <form
            className="space-y-2 border-t border-slate-100 pt-3"
            onSubmit={(event) => {
              importDocument(event);
            }}
          >
            <p className="text-xs font-medium text-slate-700">
              {copy.importing}
            </p>
            <input
              aria-label={copy.sourceChatId}
              className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
              disabled={busy}
              onChange={(event) => setSourceChatId(event.target.value)}
              placeholder={copy.sourceChatId}
              value={sourceChatId}
            />
            <input
              aria-label={copy.sourceDocumentId}
              className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
              disabled={busy}
              onChange={(event) => setSourceDocumentId(event.target.value)}
              placeholder={copy.sourceDocumentId}
              value={sourceDocumentId}
            />
            <label className="flex items-start gap-2 text-[11px] leading-4 text-slate-600">
              <input
                checked={consentAccepted}
                disabled={busy}
                onChange={(event) => setConsentAccepted(event.target.checked)}
                type="checkbox"
              />
              <span>{copy.consent}</span>
            </label>
            <button
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-800 disabled:opacity-50"
              disabled={
                busy || !consentAccepted || !sourceChatId || !sourceDocumentId
              }
              type="submit"
            >
              {busy ? copy.uploading : copy.import}
            </button>
          </form>
        </div>
      ) : (
        <>
          <p className="text-[11px] leading-4 text-slate-600">
            {copy.unavailable}
          </p>
          <p className="text-[11px] leading-4 text-amber-800">
            {copy.scannerGate}
          </p>
        </>
      )}
    </section>
  );
}
