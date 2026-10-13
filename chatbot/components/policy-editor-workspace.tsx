"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  getPolicySourceStatusLabel,
  POLICY_SOURCE_STATUSES,
} from "@/lib/policy-intelligence";
import {
  addEditorialFormReference,
  contentFromEditorialForm,
  type EditorialFormIssue,
  type EditorialFormSeed,
  type EditorialFormState,
  type EditorialHumanContent,
  emptyEditorialForm,
  formFromEditorialSeed,
  formFromHumanContent,
  removeEditorialFormReference,
  updateEditorialFormReference,
} from "@/lib/policy-intelligence/editorial-form";
import { useSiteLocale } from "./site-locale-provider";

/**
 * Phase 12 Stage 3 — Policy Intelligence editorial workspace.
 *
 * There are exactly three publication pathways, all backed by the same durable
 * store and audit trail:
 *  1. automatic publication (inspect only);
 *  2. lawyer force publish / override of an AI revision (publication authority
 *     requires a verified, explicitly granted lawyer account);
 *  3. fully manual lawyer authoring with no LLM involvement.
 *
 * The workspace never auto-translates, never truncates user input and never
 * drops stored references; problems are shown to the editor instead.
 */

type RevisionView = {
  id: string;
  revisionNumber: number;
  /**
   * Phase 12 Stage 3 D-072: `source_first` is a published official-source
   * notice with no AI analysis; it is displayed but never edited as analysis.
   */
  contentKind:
    | "ai_analysis"
    | "lawyer_override"
    | "lawyer_authored"
    | "source_first";
  editorialStatus: string;
  contentVersion: string;
  overrideReason: string | null;
  baseRevisionId: string | null;
  generatedAt: string | Date | null;
  publishedAt: string | Date | null;
  aiDecision: {
    gateEligible: boolean | null;
    gateReasons: string[];
    note: string | null;
  } | null;
  humanContent: EditorialHumanContent | null;
};

type ItemView = {
  id: string;
  slug: string;
  origin: "automated" | "manual";
  editorialStatus: string;
  sourceStatus: string;
  publicationMode: "automatic" | "human_protected";
  protectionSetAt: string | Date | null;
  updatedAt: string | Date | null;
  activePublishedRevision: RevisionView | null;
  heldAiRevision: RevisionView | null;
  draftRevisions: RevisionView[];
  latestRevisionNumber: number;
};

type ItemDetail = ItemView & {
  revisions: RevisionView[];
  audit: {
    id: string;
    action: string;
    actorUserId: string;
    overrideReason: string | null;
    detail: Record<string, unknown>;
    createdAt: string | Date | null;
  }[];
  overrideSeed: EditorialFormSeed | null;
  overrideSeedStatus: "ready" | "analysis_unavailable" | "no_base_revision";
};

type SubmissionView = {
  id: string;
  submittedUrl: string;
  note: string | null;
  status: string;
  errorCode: string | null;
  createdAt: string | Date | null;
};

type WorkspacePage = {
  limit: number;
  offset: number;
  hasMore: boolean;
  nextOffset: number | null;
};

type DraftSnapshotView = {
  id: string;
  revisionId: string;
  saveNumber: number;
  contentVersion: string;
  contentDigest: string;
  contentBytes: number;
  savedByUserId: string;
  savedAt: string | Date | null;
  humanContent: EditorialHumanContent | null;
  contentValid: boolean;
};

const DEFAULT_ATTRIBUTION = "授权律师团队 / Authorized lawyer team";
const WORKSPACE_PAGE_SIZE = 25;

type FormState = EditorialFormState;

const statusCopy: Record<string, string> = {
  draft: "草稿 Draft",
  review_required: "待审核 Held",
  published: "已发布 Published",
  archived: "已归档 Archived",
  superseded: "已被取代 Superseded",
};

function statusCopyFor(status: string): string {
  return statusCopy[status] ?? status;
}

function formatMoment(value: string | Date | null | undefined): string {
  if (!value) {
    return "—";
  }
  return value instanceof Date ? value.toISOString() : value;
}

/** Stable per-authoring-session key (never rendered, so hydration is safe). */
function newEditSessionKey(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }
  return `edit-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

export function PolicyEditorWorkspace({
  initialItems,
  initialSubmissions,
}: {
  initialItems: ItemView[];
  initialSubmissions: SubmissionView[];
}) {
  const router = useRouter();
  const { locale } = useSiteLocale();
  const [items, setItems] = useState<ItemView[]>(initialItems);
  const [page, setPage] = useState<WorkspacePage | null>(null);
  const [submissions, setSubmissions] =
    useState<SubmissionView[]>(initialSubmissions);
  const [detail, setDetail] = useState<ItemDetail | null>(null);
  const [form, setForm] = useState<FormState>(emptyEditorialForm());
  const [formIssues, setFormIssues] = useState<EditorialFormIssue[]>([]);
  const [mode, setMode] = useState<"create" | "override" | "draft" | null>(
    null
  );
  const [activeDraft, setActiveDraft] = useState<{
    itemId: string;
    revisionId: string;
    contentVersion: string;
  } | null>(null);
  const [notice, setNotice] = useState<{
    kind: "ok" | "error";
    text: string;
  } | null>(null);
  const [pending, setPending] = useState(false);
  const [url, setUrl] = useState("");
  const [urlNote, setUrlNote] = useState("");
  /** Inline confirmation for releasing automatic-publication protection. */
  const [confirmRelease, setConfirmRelease] = useState<string | null>(null);
  const [releaseReason, setReleaseReason] = useState("");
  /** Lossless saved-version history of the draft currently being edited. */
  const [draftHistory, setDraftHistory] = useState<DraftSnapshotView[] | null>(
    null
  );

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  /**
   * Stable idempotency key for the current authoring session. A retry after a
   * network error therefore replays the same create/publish instead of creating
   * a second manual entry.
   */
  const [createKey, setCreateKey] = useState<string>(() => newEditSessionKey());

  /**
   * Serializes the current form. Every problem is reported (nothing is
   * truncated, auto-translated or silently dropped) so the editor can fix it
   * before anything is written.
   */
  function serializeForm():
    | { status: "ok"; content: EditorialHumanContent }
    | { status: "error" } {
    const result = contentFromEditorialForm(form);
    if (result.status === "error") {
      setFormIssues(result.issues);
      setNotice({
        kind: "error",
        text: `表单校验未通过（${result.issues.length} 项）/ Form validation failed (${result.issues.length} issue(s))`,
      });
      return { status: "error" };
    }
    setFormIssues([]);
    return result;
  }

  async function callApi(
    path: string,
    body: unknown,
    method: "POST" | "PATCH" = "POST"
  ): Promise<{ ok: boolean; data: Record<string, unknown> | null }> {
    const response = await fetch(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const data = (await response.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (!response.ok) {
      const code = typeof data?.error === "string" ? data.error : "failed";
      setNotice({ kind: "error", text: `操作失败 / Failed: ${code}` });
    }
    return { ok: response.ok, data };
  }

  async function refreshWorkspace(offset = 0, append = false) {
    const response = await fetch(
      `/api/policy-editor/workspace?limit=${WORKSPACE_PAGE_SIZE}&offset=${offset}`,
      { cache: "no-store" }
    );
    if (response.ok) {
      const data = (await response.json()) as {
        items?: ItemView[];
        page?: WorkspacePage;
      };
      if (Array.isArray(data.items)) {
        setItems((current) => {
          if (!append) {
            return data.items ?? [];
          }
          const merged = [...current];
          for (const item of data.items ?? []) {
            if (!merged.some((entry) => entry.id === item.id)) {
              merged.push(item);
            }
          }
          return merged;
        });
      }
      if (data.page) {
        setPage(data.page);
      }
    }
    const submissionsResponse = await fetch(
      "/api/policy-editor/operator-submissions",
      { cache: "no-store" }
    );
    if (submissionsResponse.ok) {
      const data = (await submissionsResponse.json()) as {
        submissions?: SubmissionView[];
      };
      if (Array.isArray(data.submissions)) {
        setSubmissions(data.submissions);
      }
    }
    router.refresh();
  }

  async function loadDetail(itemId: string): Promise<ItemDetail | null> {
    const response = await fetch(`/api/policy-editor/items/${itemId}`, {
      cache: "no-store",
    });
    if (!response.ok) {
      setNotice({ kind: "error", text: "无法加载条目 / Unable to load item" });
      return null;
    }
    const data = (await response.json()) as { item: ItemDetail };
    setDetail(data.item);
    return data.item;
  }

  function startCreate() {
    setNotice(null);
    setDetail(null);
    setActiveDraft(null);
    setForm(emptyEditorialForm());
    setFormIssues([]);
    setCreateKey(newEditSessionKey());
    setMode("create");
  }

  async function startOverride(itemId: string) {
    setNotice(null);
    const loaded = await loadDetail(itemId);
    if (!loaded?.heldAiRevision) {
      setNotice({
        kind: "error",
        text: "没有可覆盖的 AI 修订 / No held AI revision to override",
      });
      return;
    }
    setFormIssues([]);
    setForm(formFromEditorialSeed(loaded.overrideSeed, DEFAULT_ATTRIBUTION));
    setActiveDraft(null);
    setMode("override");
    if (loaded.overrideSeedStatus === "analysis_unavailable") {
      // The stored AI analysis could not be read. Human correction must still
      // be possible, so the editor opens with official-source facts only and
      // says so explicitly instead of failing.
      setNotice({
        kind: "error",
        text: "无法读取已存储的 AI 分析，已打开空白草稿（官方来源信息已预填）；请自行填写内容后发布 / Stored AI analysis is unavailable; a blank draft with official-source facts has been opened. Author the content and publish.",
      });
    }
  }

  async function startDraft(itemId: string) {
    setNotice(null);
    const loaded = await loadDetail(itemId);
    if (!loaded) {
      return;
    }
    const draft = loaded.draftRevisions[0];
    if (draft?.humanContent) {
      setForm(formFromHumanContent(draft.humanContent));
      setActiveDraft({
        itemId: loaded.id,
        revisionId: draft.id,
        contentVersion: draft.contentVersion,
      });
      setMode("draft");
      await loadDraftHistory({ itemId: loaded.id, revisionId: draft.id });
      return;
    }
    // No draft yet: create the next revision draft from the published content.
    setPending(true);
    try {
      const created = await callApi("/api/policy-editor/drafts/revision", {
        itemId: loaded.id,
      });
      if (created.ok) {
        const refreshed = await loadDetail(itemId);
        const nextDraft = refreshed?.draftRevisions[0];
        if (refreshed && nextDraft?.humanContent) {
          setForm(formFromHumanContent(nextDraft.humanContent));
          setActiveDraft({
            itemId: refreshed.id,
            revisionId: nextDraft.id,
            contentVersion: nextDraft.contentVersion,
          });
          setMode("draft");
          await refreshWorkspace();
          await loadDraftHistory({
            itemId: refreshed.id,
            revisionId: nextDraft.id,
          });
        }
      }
    } finally {
      setPending(false);
    }
  }

  async function loadDraftHistory(input: {
    itemId: string;
    revisionId: string;
  }): Promise<void> {
    const response = await fetch(
      `/api/policy-editor/drafts/history?itemId=${input.itemId}&revisionId=${input.revisionId}`,
      { cache: "no-store" }
    );
    if (!response.ok) {
      setDraftHistory(null);
      return;
    }
    const data = (await response.json()) as { snapshots?: DraftSnapshotView[] };
    setDraftHistory(Array.isArray(data.snapshots) ? data.snapshots : null);
  }

  function closeEditor() {
    setMode(null);
    setActiveDraft(null);
    setNotice(null);
    setDraftHistory(null);
  }

  async function submitCreate() {
    const serialized = serializeForm();
    if (serialized.status === "error") {
      return;
    }
    setPending(true);
    setNotice(null);
    try {
      const result = await callApi("/api/policy-editor/drafts", {
        content: serialized.content,
        slug: form.slug.trim() || null,
        idempotencyKey: `create-${createKey}`,
      });
      if (result.ok && typeof result.data?.itemId === "string") {
        setNotice({
          kind: "ok",
          text: "草稿已创建 / Draft created",
        });
        await refreshWorkspace();
        await startDraft(result.data.itemId);
      }
    } finally {
      setPending(false);
    }
  }

  async function submitSaveDraft() {
    if (!activeDraft) {
      return;
    }
    const serialized = serializeForm();
    if (serialized.status === "error") {
      return;
    }
    setPending(true);
    setNotice(null);
    try {
      const result = await callApi(
        "/api/policy-editor/drafts",
        {
          itemId: activeDraft.itemId,
          revisionId: activeDraft.revisionId,
          expectedContentVersion: activeDraft.contentVersion,
          content: serialized.content,
        },
        "PATCH"
      );
      if (result.ok && typeof result.data?.contentVersion === "string") {
        setActiveDraft({
          ...activeDraft,
          contentVersion: result.data.contentVersion,
        });
        setNotice({ kind: "ok", text: "草稿已保存 / Draft saved" });
        await loadDraftHistory({
          itemId: activeDraft.itemId,
          revisionId: activeDraft.revisionId,
        });
      } else if (result.data?.error === "stale_draft_conflict") {
        setNotice({
          kind: "error",
          text: "草稿已被他人更新，请重新加载 / Draft changed elsewhere; reload",
        });
      }
    } finally {
      setPending(false);
    }
  }

  async function submitPublishDraft() {
    if (!activeDraft) {
      return;
    }
    const serialized = serializeForm();
    if (serialized.status === "error") {
      return;
    }
    setPending(true);
    setNotice(null);
    try {
      const saved = await callApi(
        "/api/policy-editor/drafts",
        {
          itemId: activeDraft.itemId,
          revisionId: activeDraft.revisionId,
          expectedContentVersion: activeDraft.contentVersion,
          content: serialized.content,
        },
        "PATCH"
      );
      if (!saved.ok || typeof saved.data?.contentVersion !== "string") {
        return;
      }
      const version = saved.data.contentVersion;
      setActiveDraft({ ...activeDraft, contentVersion: version });
      const published = await callApi("/api/policy-editor/drafts/publish", {
        itemId: activeDraft.itemId,
        revisionId: activeDraft.revisionId,
        expectedContentVersion: version,
        idempotencyKey: `publish-${activeDraft.revisionId}`,
      });
      if (published.ok) {
        setNotice({ kind: "ok", text: "已发布 / Published" });
        await refreshWorkspace();
        await loadDetail(activeDraft.itemId);
        closeEditor();
      }
    } finally {
      setPending(false);
    }
  }

  async function submitOverride() {
    if (!detail?.heldAiRevision) {
      return;
    }
    const serialized = serializeForm();
    if (serialized.status === "error") {
      return;
    }
    if (form.overrideReason.trim().length < 3) {
      setNotice({
        kind: "error",
        text: "必须填写覆盖原因 / An override reason is required",
      });
      return;
    }
    setPending(true);
    setNotice(null);
    try {
      const result = await callApi("/api/policy-editor/override", {
        itemId: detail.id,
        baseRevisionId: detail.heldAiRevision.id,
        expectedBaseRevisionNumber: detail.heldAiRevision.revisionNumber,
        expectedPublishedRevisionId: detail.activePublishedRevision?.id ?? null,
        overrideReason: form.overrideReason.trim(),
        content: serialized.content,
        idempotencyKey: `override-${detail.heldAiRevision.id}-${createKey}`,
      });
      if (result.ok) {
        setNotice({
          kind: "ok",
          text: "律师发布已完成 / Lawyer publication published",
        });
        await refreshWorkspace();
        await loadDetail(detail.id);
        closeEditor();
      }
    } finally {
      setPending(false);
    }
  }

  async function archiveItem(itemId: string) {
    setPending(true);
    setNotice(null);
    try {
      const result = await callApi("/api/policy-editor/archive", { itemId });
      if (result.ok) {
        setNotice({ kind: "ok", text: "已归档 / Archived" });
        await refreshWorkspace();
      }
    } finally {
      setPending(false);
    }
  }

  async function restoreItem(itemId: string) {
    setPending(true);
    setNotice(null);
    try {
      const result = await callApi("/api/policy-editor/restore", { itemId });
      if (result.ok) {
        setNotice({ kind: "ok", text: "已恢复 / Restored" });
        await refreshWorkspace();
      }
    } finally {
      setPending(false);
    }
  }

  /**
   * Explicitly returns an editor-protected item to normal automatic
   * publication. The next eligible automated revision may then publish without
   * human approval, which is why this is a deliberate, confirmed, audited
   * action (inline confirmation, no browser prompt).
   */
  async function releaseProtection(itemId: string, reason: string) {
    setPending(true);
    setNotice(null);
    try {
      const result = await callApi("/api/policy-editor/protection", {
        itemId,
        reason: reason.trim() || null,
      });
      if (result.ok) {
        setNotice({
          kind: "ok",
          text:
            result.data?.changed === false
              ? "该条目本就未受保护 / Item was not protected"
              : "已解除保护，恢复自动发布 / Protection released; automatic publication restored",
        });
        setConfirmRelease(null);
        setReleaseReason("");
        await refreshWorkspace();
        if (detail?.id === itemId) {
          await loadDetail(itemId);
        }
      }
    } finally {
      setPending(false);
    }
  }

  async function loadMore() {
    if (!page?.hasMore || page.nextOffset === null) {
      return;
    }
    setPending(true);
    try {
      await refreshWorkspace(page.nextOffset, true);
    } finally {
      setPending(false);
    }
  }

  /**
   * Inline, deliberate release control used by both the item table and the
   * detail panel: releasing protection allows future official updates to
   * publish automatically again, so it needs an explicit confirmation step.
   */
  function renderProtectionReleaseControl(itemId: string) {
    if (confirmRelease !== itemId) {
      return (
        <button
          className="mt-1 block text-xs font-semibold text-amber-800 underline"
          disabled={pending}
          onClick={() => {
            setConfirmRelease(itemId);
            setReleaseReason("");
          }}
          type="button"
        >
          恢复自动发布 / Resume automatic
        </button>
      );
    }
    return (
      <span className="mt-1 block">
        <span className="block text-xs text-slate-600">
          解除后获取到的新官方更新将自动发布。确认解除？
          <br />
          New official updates will publish automatically. Release protection?
        </span>
        <input
          className="mt-1 w-full border border-slate-300 bg-white px-2 py-1 text-xs"
          onChange={(event) => setReleaseReason(event.target.value)}
          placeholder="原因（可选）/ Reason (optional)"
          value={releaseReason}
        />
        <span className="mt-1 flex gap-3">
          <button
            className="text-xs font-semibold text-amber-800 underline"
            disabled={pending}
            onClick={() =>
              releaseProtection(itemId, releaseReason).catch(() => undefined)
            }
            type="button"
          >
            确认解除 / Confirm release
          </button>
          <button
            className="text-xs font-semibold text-slate-500 underline"
            disabled={pending}
            onClick={() => {
              setConfirmRelease(null);
              setReleaseReason("");
            }}
            type="button"
          >
            取消 / Cancel
          </button>
        </span>
      </span>
    );
  }

  async function submitOfficialUrl() {
    setPending(true);
    setNotice(null);
    try {
      const result = await callApi("/api/policy-editor/operator-submissions", {
        url: url.trim(),
        note: urlNote.trim() || null,
      });
      if (result.ok) {
        setUrl("");
        setUrlNote("");
        setNotice({
          kind: "ok",
          text: "已提交官方链接，将在下次同步运行时处理 / Submitted for the next sync run",
        });
        await refreshWorkspace();
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <button
          className="border border-[#092c52] bg-[#092c52] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
          disabled={pending}
          onClick={() => startCreate()}
          type="button"
        >
          + 新建政策 / New policy
        </button>
        {notice ? (
          <p
            className={
              notice.kind === "ok"
                ? "text-xs font-medium text-emerald-700"
                : "text-xs font-medium text-red-700"
            }
          >
            {notice.text}
          </p>
        ) : null}
      </div>

      <section className="border border-slate-200 bg-white">
        <header className="border-b border-slate-200 px-5 py-3">
          <h2 className="text-sm font-bold text-[#092c52]">
            政策条目 / Policy items
          </h2>
          <p className="mt-1 text-xs text-slate-600">
            自动发布、律师修订与律师撰写三类条目共用同一份公共展示。
          </p>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-5 py-2">Slug / 类型</th>
                <th className="px-3 py-2">状态</th>
                <th className="px-3 py-2">当前发布版本</th>
                <th className="px-3 py-2">待处理</th>
                <th className="px-5 py-2">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td className="px-5 py-4 text-sm text-slate-500" colSpan={5}>
                    暂无条目 / No policy items yet.
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr className="border-b border-slate-100" key={item.id}>
                    <td className="px-5 py-3">
                      <p className="font-medium text-slate-900">{item.slug}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {item.origin === "automated"
                          ? "自动抓取 Automated"
                          : "律师撰写 Manual"}
                      </p>
                    </td>
                    <td className="px-3 py-3 text-slate-700">
                      {statusCopyFor(item.editorialStatus)}
                      {item.publicationMode === "human_protected" ? (
                        <span className="mt-0.5 block text-xs font-semibold text-amber-700">
                          人工保护 Editor-protected
                        </span>
                      ) : null}
                      <span className="mt-0.5 block text-xs text-slate-500">
                        {item.heldAiRevision
                          ? "存在待审核 AI 修订"
                          : item.draftRevisions.length
                            ? "存在草稿"
                            : "—"}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-slate-700">
                      {item.activePublishedRevision
                        ? `r${item.activePublishedRevision.revisionNumber} · ${
                            item.activePublishedRevision.contentKind ===
                            "ai_analysis"
                              ? "AI 分析"
                              : item.activePublishedRevision.contentKind ===
                                  "lawyer_override"
                                ? "律师修订"
                                : "律师撰写"
                          }`
                        : "—"}
                    </td>
                    <td className="px-3 py-3">
                      {item.heldAiRevision ? (
                        <button
                          className="text-xs font-semibold text-violet-800 underline"
                          disabled={pending}
                          onClick={() =>
                            startOverride(item.id).catch(() => undefined)
                          }
                          type="button"
                        >
                          修订并发布 / Revise &amp; publish
                        </button>
                      ) : null}
                      {item.origin === "manual" ? (
                        <button
                          className="mt-1 block text-xs font-semibold text-[#092c52] underline"
                          disabled={pending}
                          onClick={() =>
                            startDraft(item.id).catch(() => undefined)
                          }
                          type="button"
                        >
                          {item.draftRevisions.length
                            ? "编辑草稿 / Edit draft"
                            : "新建修订 / New revision"}
                        </button>
                      ) : null}
                    </td>
                    <td className="px-5 py-3">
                      <button
                        className="text-xs font-semibold text-slate-700 underline"
                        disabled={pending}
                        onClick={() =>
                          loadDetail(item.id).catch(() => undefined)
                        }
                        type="button"
                      >
                        历史与审计 / History
                      </button>
                      {item.editorialStatus === "archived" ? (
                        <button
                          className="mt-1 block text-xs font-semibold text-emerald-700 underline"
                          disabled={pending}
                          onClick={() =>
                            restoreItem(item.id).catch(() => undefined)
                          }
                          type="button"
                        >
                          恢复 / Restore
                        </button>
                      ) : (
                        <button
                          className="mt-1 block text-xs font-semibold text-red-700 underline"
                          disabled={pending}
                          onClick={() =>
                            archiveItem(item.id).catch(() => undefined)
                          }
                          type="button"
                        >
                          归档 / Archive
                        </button>
                      )}
                      {item.publicationMode === "human_protected" &&
                      item.editorialStatus !== "archived"
                        ? renderProtectionReleaseControl(item.id)
                        : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-3">
          <p className="text-xs text-slate-500">
            已显示 {items.length} 条
            {page?.hasMore ? "（还有更多）" : "（已全部显示）"} / Showing{" "}
            {items.length} item(s)
            {page?.hasMore ? " (more available)" : " (all loaded)"}
          </p>
          {page?.hasMore ? (
            <button
              className="border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-50"
              disabled={pending}
              onClick={() => loadMore().catch(() => undefined)}
              type="button"
            >
              加载更多 / Load more
            </button>
          ) : null}
        </div>
      </section>

      {mode ? (
        <section className="border border-violet-200 bg-[#fbf9ff]">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-violet-200 px-5 py-3">
            <h2 className="text-sm font-bold text-violet-950">
              {mode === "create"
                ? "新建律师政策 / New lawyer-authored policy"
                : mode === "override"
                  ? "律师修订并发布（覆盖 AI 判定）/ Lawyer revision & publication"
                  : "编辑草稿 / Edit draft"}
            </h2>
            <button
              className="text-xs font-semibold text-slate-600 underline"
              onClick={closeEditor}
              type="button"
            >
              关闭 / Close
            </button>
          </header>
          <div className="grid gap-4 px-5 py-4 sm:grid-cols-2">
            <label className="grid gap-1 text-xs font-semibold text-slate-700">
              中文标题 Title (zh)
              <input
                className="border border-slate-300 bg-white px-3 py-2 text-sm font-normal"
                onChange={(event) => update("titleZh", event.target.value)}
                value={form.titleZh}
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-700">
              English title
              <input
                className="border border-slate-300 bg-white px-3 py-2 text-sm font-normal"
                onChange={(event) => update("titleEn", event.target.value)}
                value={form.titleEn}
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-700">
              中文概述 Overview (zh)
              <textarea
                className="min-h-20 border border-slate-300 bg-white px-3 py-2 text-sm font-normal"
                onChange={(event) => update("overviewZh", event.target.value)}
                value={form.overviewZh}
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-700">
              English overview
              <textarea
                className="min-h-20 border border-slate-300 bg-white px-3 py-2 text-sm font-normal"
                onChange={(event) => update("overviewEn", event.target.value)}
                value={form.overviewEn}
              />
            </label>
            {(
              [
                ["changes", "主要变化 Key changes"],
                ["affectedGroups", "受影响人群 Affected groups"],
                ["implications", "实际影响 Implications"],
                ["actions", "建议措施 Recommended actions（可选）"],
              ] as const
            ).map(([key, label]) => (
              <label
                className="grid gap-1 text-xs font-semibold text-slate-700"
                key={key}
              >
                {label}
                <textarea
                  className="min-h-24 border border-slate-300 bg-white px-3 py-2 text-sm font-normal"
                  onChange={(event) => update(key, event.target.value)}
                  placeholder="每行一条，必须同时填写两种语言：中文 | English（最多 8 条）"
                  value={form[key]}
                />
              </label>
            ))}
            <label className="grid gap-1 text-xs font-semibold text-slate-700">
              正文 Body (zh，可选)
              <textarea
                className="min-h-24 border border-slate-300 bg-white px-3 py-2 text-sm font-normal"
                onChange={(event) => update("bodyZh", event.target.value)}
                value={form.bodyZh}
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-700">
              Body (en, optional)
              <textarea
                className="min-h-24 border border-slate-300 bg-white px-3 py-2 text-sm font-normal"
                onChange={(event) => update("bodyEn", event.target.value)}
                value={form.bodyEn}
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-700">
              律师评论 Commentary (zh，可选)
              <textarea
                className="min-h-20 border border-slate-300 bg-white px-3 py-2 text-sm font-normal"
                onChange={(event) => update("commentaryZh", event.target.value)}
                value={form.commentaryZh}
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-700">
              Commentary (en, optional)
              <textarea
                className="min-h-20 border border-slate-300 bg-white px-3 py-2 text-sm font-normal"
                onChange={(event) => update("commentaryEn", event.target.value)}
                value={form.commentaryEn}
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-700">
              署名 Attribution
              <input
                className="border border-slate-300 bg-white px-3 py-2 text-sm font-normal"
                onChange={(event) => update("attribution", event.target.value)}
                value={form.attribution}
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-700">
              法律/来源状态 Source status
              <select
                className="border border-slate-300 bg-white px-3 py-2 text-sm font-normal"
                onChange={(event) => update("sourceStatus", event.target.value)}
                value={form.sourceStatus}
              >
                {POLICY_SOURCE_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {getPolicySourceStatusLabel(status, locale)}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid gap-1 text-xs font-semibold text-slate-700">
              <span>日期 Dates（均可留空；平台不会推断日期）</span>
              <div className="grid gap-2 text-xs font-normal sm:grid-cols-3">
                <label className="grid gap-1">
                  来源标注日期 Stated source date
                  <input
                    className="border border-slate-300 bg-white px-3 py-2 text-sm"
                    onChange={(event) =>
                      update("officialSourceDate", event.target.value)
                    }
                    placeholder="YYYY-MM-DD"
                    value={form.officialSourceDate}
                  />
                </label>
                <label className="grid gap-1">
                  生效/实施日期 Commencement（未确立则留空）
                  <input
                    className="border border-slate-300 bg-white px-3 py-2 text-sm"
                    onChange={(event) =>
                      update("commencementDate", event.target.value)
                    }
                    placeholder="YYYY-MM-DD"
                    value={form.commencementDate}
                  />
                </label>
                <label className="grid gap-1">
                  法律复核基准日 Reviewed as of
                  <input
                    className="border border-slate-300 bg-white px-3 py-2 text-sm"
                    onChange={(event) =>
                      update("reviewedAsOfDate", event.target.value)
                    }
                    placeholder="YYYY-MM-DD"
                    value={form.reviewedAsOfDate}
                  />
                </label>
              </div>
            </div>
            <div className="grid gap-2 text-xs font-semibold text-slate-700 sm:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  官方来源引用 Official source references（可选，最多 8 条）
                </span>
                <button
                  className="border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 disabled:opacity-50"
                  disabled={pending || form.references.length >= 8}
                  onClick={() =>
                    setForm((current) => addEditorialFormReference(current))
                  }
                  type="button"
                >
                  + 添加引用 / Add reference
                </button>
              </div>
              {form.references.length === 0 ? (
                <p className="text-xs font-normal text-slate-500">
                  尚未添加引用；可在没有官方来源时发布并明确标注。
                  <br />
                  No reference added. Uncited lawyer commentary can be published
                  with explicit attribution.
                </p>
              ) : null}
              {form.references.map((reference, index) => (
                <fieldset
                  className="grid gap-2 border border-slate-200 bg-white p-3 sm:grid-cols-2"
                  key={`reference-${index.toString()}`}
                >
                  <legend className="px-1 text-xs font-semibold text-slate-600">
                    引用 {index + 1} / Reference {index + 1}
                  </legend>
                  <label className="grid gap-1">
                    机构 Authority
                    <input
                      className="border border-slate-300 bg-white px-3 py-2 text-sm font-normal"
                      onChange={(event) =>
                        setForm((current) =>
                          updateEditorialFormReference(current, index, {
                            authority: event.target.value,
                          })
                        )
                      }
                      value={reference.authority}
                    />
                  </label>
                  <label className="grid gap-1">
                    标题 Title
                    <input
                      className="border border-slate-300 bg-white px-3 py-2 text-sm font-normal"
                      onChange={(event) =>
                        setForm((current) =>
                          updateEditorialFormReference(current, index, {
                            title: event.target.value,
                          })
                        )
                      }
                      value={reference.title}
                    />
                  </label>
                  <label className="grid gap-1">
                    HTTPS 链接 URL
                    <input
                      className="border border-slate-300 bg-white px-3 py-2 text-sm font-normal"
                      onChange={(event) =>
                        setForm((current) =>
                          updateEditorialFormReference(current, index, {
                            url: event.target.value,
                          })
                        )
                      }
                      placeholder="https://…"
                      value={reference.url}
                    />
                  </label>
                  <label className="grid gap-1">
                    来源日期 Date（YYYY-MM-DD）
                    <input
                      className="border border-slate-300 bg-white px-3 py-2 text-sm font-normal"
                      onChange={(event) =>
                        setForm((current) =>
                          updateEditorialFormReference(current, index, {
                            date: event.target.value,
                          })
                        )
                      }
                      placeholder="YYYY-MM-DD"
                      value={reference.date}
                    />
                  </label>
                  <label className="grid gap-1 sm:col-span-2">
                    引用标注 Citation（可选，例如 F2026L00001 / 条款号）
                    <input
                      className="border border-slate-300 bg-white px-3 py-2 text-sm font-normal"
                      onChange={(event) =>
                        setForm((current) =>
                          updateEditorialFormReference(current, index, {
                            citation: event.target.value,
                          })
                        )
                      }
                      value={reference.citation}
                    />
                  </label>
                  <button
                    className="justify-self-start text-xs font-semibold text-red-700 underline"
                    disabled={pending}
                    onClick={() =>
                      setForm((current) =>
                        removeEditorialFormReference(current, index)
                      )
                    }
                    type="button"
                  >
                    删除此引用 / Remove
                  </button>
                </fieldset>
              ))}
            </div>
            {mode === "create" ? (
              <label className="grid gap-1 text-xs font-semibold text-slate-700">
                Slug（可选，留空自动生成）
                <input
                  className="border border-slate-300 bg-white px-3 py-2 text-sm font-normal"
                  onChange={(event) => update("slug", event.target.value)}
                  placeholder="lawyer-commentary-2026-10"
                  value={form.slug}
                />
              </label>
            ) : null}
            {mode === "override" ? (
              <label className="grid gap-1 text-xs font-semibold text-slate-700 sm:col-span-2">
                覆盖原因 Override reason（必填，将记录在审计中）
                <input
                  className="border border-slate-300 bg-white px-3 py-2 text-sm font-normal"
                  onChange={(event) =>
                    update("overrideReason", event.target.value)
                  }
                  placeholder="例如：AI 相关性判断有误；官方来源实际属于政策范围"
                  value={form.overrideReason}
                />
              </label>
            ) : null}
            <div className="flex flex-wrap gap-3 sm:col-span-2">
              {mode === "create" ? (
                <button
                  className="border border-[#092c52] bg-[#092c52] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
                  disabled={pending}
                  onClick={() => submitCreate().catch(() => undefined)}
                  type="button"
                >
                  保存草稿 / Save draft
                </button>
              ) : null}
              {mode === "draft" ? (
                <>
                  <button
                    className="border border-slate-400 bg-white px-4 py-2 text-xs font-semibold text-slate-800 disabled:opacity-50"
                    disabled={pending}
                    onClick={() => submitSaveDraft().catch(() => undefined)}
                    type="button"
                  >
                    保存草稿 / Save draft
                  </button>
                  <button
                    className="border border-[#092c52] bg-[#092c52] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
                    disabled={pending}
                    onClick={() => submitPublishDraft().catch(() => undefined)}
                    type="button"
                  >
                    发布 / Publish
                  </button>
                </>
              ) : null}
              {mode === "override" ? (
                <button
                  className="border border-violet-800 bg-violet-800 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
                  disabled={pending || form.overrideReason.trim().length < 3}
                  onClick={() => submitOverride().catch(() => undefined)}
                  type="button"
                >
                  强制发布覆盖版本 / Force publish
                </button>
              ) : null}
            </div>
            {mode === "draft" && activeDraft ? (
              <div className="border border-slate-200 bg-white px-3 py-2 sm:col-span-2">
                <p className="text-xs font-semibold text-slate-700">
                  已保存版本（有界恢复历史，最近版本内容完整可载入）/
                  Saved versions (bounded recovery history — recent versions
                  load exactly; older versions beyond the retention limit are
                  removed automatically)
                </p>
                {draftHistory === null ? (
                  <p className="mt-1 text-xs text-slate-500">
                    暂无历史（保存一次后显示）/ No saved versions yet.
                  </p>
                ) : (
                  <ul className="mt-1 space-y-1">
                    {draftHistory.map((snapshot, index) => {
                      const content = snapshot.humanContent;
                      return (
                        <li
                          className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600"
                          key={snapshot.id}
                        >
                          <span>
                            #{snapshot.saveNumber} ·{" "}
                            {formatMoment(snapshot.savedAt)} ·{" "}
                            {(snapshot.contentBytes / 1024).toFixed(1)} KB
                            {index === draftHistory.length - 1
                              ? " · 最新 / latest"
                              : ""}
                            {content ? "" : " · 内容不可读 / unreadable"}
                          </span>
                          {content ? (
                            <button
                              className="font-semibold text-[#092c52] underline"
                              disabled={pending}
                              onClick={() => {
                                setForm(formFromHumanContent(content));
                                setNotice({
                                  kind: "ok",
                                  text: `已载入保存版本 #${snapshot.saveNumber}；保存将生成新的历史版本 / Loaded saved version #${snapshot.saveNumber}; saving records a new version`,
                                });
                              }}
                              type="button"
                            >
                              载入此版本 / Load
                            </button>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ) : null}
            {formIssues.length > 0 ? (
              <div className="border border-red-300 bg-red-50 px-3 py-2 sm:col-span-2">
                <p className="text-xs font-semibold text-red-800">
                  请修正以下问题后再保存或发布 / Fix these issues before saving
                  or publishing
                </p>
                <ul className="mt-1 list-disc pl-5 text-xs text-red-700">
                  {formIssues.map((issue) => (
                    <li key={`${issue.field}:${issue.message}`}>
                      {issue.message}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className="border border-slate-200 bg-white">
        <header className="border-b border-slate-200 px-5 py-3">
          <h2 className="text-sm font-bold text-[#092c52]">
            官方链接提交 / Official URL submission
          </h2>
          <p className="mt-1 text-xs text-slate-600">
            仅接受澳大利亚政府官方 HTTPS 链接（.gov.au）。提交后会在下一次
            operator-submitted-official-url
            同步运行时抓取、分析并按既定规则发布或留存。
          </p>
        </header>
        <div className="grid gap-3 px-5 py-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_auto]">
          <input
            className="border border-slate-300 px-3 py-2 text-sm"
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://www.aph.gov.au/…"
            value={url}
          />
          <input
            className="border border-slate-300 px-3 py-2 text-sm"
            onChange={(event) => setUrlNote(event.target.value)}
            placeholder="备注（可选）"
            value={urlNote}
          />
          <button
            className="border border-[#092c52] bg-[#092c52] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
            disabled={pending || url.trim().length === 0}
            onClick={() => submitOfficialUrl().catch(() => undefined)}
            type="button"
          >
            提交 / Submit
          </button>
        </div>
        <ul className="border-t border-slate-100 px-5 py-3 text-xs text-slate-600">
          {submissions.length === 0 ? (
            <li>暂无提交 / No submissions yet.</li>
          ) : (
            submissions.slice(0, 10).map((submission) => (
              <li
                className="border-b border-slate-100 py-1.5 last:border-b-0"
                key={submission.id}
              >
                <span className="font-medium text-slate-800">
                  {submission.status}
                </span>
                {submission.errorCode ? ` · ${submission.errorCode}` : ""}
                {" · "}
                <span className="break-all">{submission.submittedUrl}</span>
              </li>
            ))
          )}
        </ul>
      </section>

      {detail ? (
        <section className="border border-slate-200 bg-white">
          <header className="border-b border-slate-200 px-5 py-3">
            <h2 className="text-sm font-bold text-[#092c52]">
              版本历史与审计 / Revisions &amp; audit — {detail.slug}
            </h2>
            <p className="mt-1 text-xs text-slate-600">
              {detail.publicationMode === "human_protected"
                ? "该条目处于人工发布保护状态：自动同步不会替换律师已发布的版本，新版本仅作为待审核版本保留。"
                : "该条目处于自动发布状态：符合发布门槛的新来源版本会自动发布。"}
              <br />
              {detail.publicationMode === "human_protected"
                ? "Editor-protected: automatic sync never replaces the lawyer-approved revision; newer versions are held for review."
                : "Automatic publication: eligible newer source revisions publish automatically."}
            </p>{" "}
            {detail.publicationMode === "human_protected" ? (
              <div className="mt-1">
                {renderProtectionReleaseControl(detail.id)}
              </div>
            ) : null}
          </header>
          <div className="grid gap-5 px-5 py-4 lg:grid-cols-2">
            <ol className="space-y-2 text-sm">
              {detail.revisions.map((revision) => (
                <li
                  className="border-l border-slate-200 pl-3"
                  key={revision.id}
                >
                  <p className="font-medium text-slate-900">
                    r{revision.revisionNumber} ·{" "}
                    {revision.contentKind === "ai_analysis"
                      ? "AI 分析"
                      : revision.contentKind === "lawyer_override"
                        ? "律师修订"
                        : "律师撰写"}{" "}
                    · {statusCopyFor(revision.editorialStatus)}
                  </p>
                  <p className="text-xs text-slate-500">
                    {revision.publishedAt
                      ? `发布 ${formatMoment(revision.publishedAt)}`
                      : `生成 ${formatMoment(revision.generatedAt)}`}
                  </p>
                  {revision.overrideReason ? (
                    <p className="mt-1 text-xs text-slate-600">
                      覆盖原因：{revision.overrideReason}
                    </p>
                  ) : null}
                  {revision.aiDecision?.gateReasons?.length ? (
                    <p className="mt-1 text-xs text-slate-500">
                      AI 发布门原因：
                      {revision.aiDecision.gateReasons.join(", ")}
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
            <ol className="space-y-2 text-xs text-slate-600">
              {detail.audit.map((event) => (
                <li className="border-b border-slate-100 pb-1.5" key={event.id}>
                  <span className="font-semibold text-slate-800">
                    {event.action}
                  </span>
                  {" · "}
                  {formatMoment(event.createdAt)}
                  {event.overrideReason ? ` · ${event.overrideReason}` : ""}
                </li>
              ))}
            </ol>
          </div>
        </section>
      ) : null}
    </div>
  );
}
