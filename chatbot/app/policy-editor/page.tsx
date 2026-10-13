import { redirect } from "next/navigation";
import { Suspense } from "react";
import { auth } from "@/app/(auth)/auth";
import { PolicyEditorWorkspace } from "@/components/policy-editor-workspace";
import { SiteHeader } from "@/components/site-header";
import { requireVerifiedConsultationStaffPage } from "@/lib/consultations/page-access";
import { EDITORIAL_ITEM_DEFAULT_PAGE } from "@/lib/policy-intelligence/editorial-core";
import {
  operatorSubmissionService,
  policyEditorialService,
} from "@/lib/policy-intelligence/editorial-runtime";

export default function PolicyEditorPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-slate-50" />}>
      <PolicyEditorContent />
    </Suspense>
  );
}

async function PolicyEditorContent() {
  await requireVerifiedConsultationStaffPage(["admin", "lawyer"]);
  const session = await auth();
  const userId = session?.user?.id ?? "";
  const canEdit = await policyEditorialService.canEdit(userId);
  if (!canEdit) {
    // Only a verified, explicitly granted lawyer holds publication authority;
    // administrators manage grants and monitoring elsewhere.
    redirect("/lawyer-portal");
  }
  const [workspace, submissionListing] = await Promise.all([
    policyEditorialService.listWorkspacePaginated({
      limit: EDITORIAL_ITEM_DEFAULT_PAGE,
      offset: 0,
    }),
    // R3 P1: the listing service re-verifies publication authority for this
    // user; the page already redirects non-editors, and an unexpected refusal
    // degrades to an empty panel instead of leaking a list.
    operatorSubmissionService.list({ actorUserId: userId }),
  ]);
  const items = workspace.items;
  const submissions =
    submissionListing.status === "ok" ? submissionListing.value : [];

  return (
    <div className="min-h-dvh bg-slate-50 text-slate-950">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-5 py-10 lg:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          Policy Intelligence
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          政策编辑工作台 / Policy editor workspace
        </h1>
        <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
          授权 Policy Editor 律师可以：修订并发布 AI 留存的政策分析（无需 AI
          二次同意）、独立撰写并发布双语政策评论（可无官方来源，但会如实标注作者与来源状态）、
          以及归档/恢复既有条目。所有操作都会写入不可更改的审计记录。
        </p>
        <div className="mt-8">
          <PolicyEditorWorkspace
            initialItems={items}
            initialSubmissions={submissions}
          />
        </div>
      </main>
    </div>
  );
}
