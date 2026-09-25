"use client";

import {
  ArrowRight,
  BriefcaseBusiness,
  FileText,
  MessageCircle,
  Scale,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSiteLocale } from "@/components/site-locale-provider";
import {
  getClientPortalCopy,
  getLawyerRequestStatusLabel,
} from "@/lib/client-portal/copy";
import { preservePortalGroupSelection } from "@/lib/client-portal/grouping";
import type {
  ClientPortalView,
  PortalMatterGroup,
  PortalTimestamp,
} from "@/lib/client-portal/types";
import {
  consultationCreateHref,
  consultationStatusLabel,
} from "@/lib/consultations/customer-ui";

function displayDate(value: PortalTimestamp, locale: string) {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString(locale);
}

function aiWorkspaceHref(chatId: string) {
  return `/ai-workspace?chatId=${encodeURIComponent(chatId)}`;
}

function MatterDetails({
  group,
  view,
  locale,
}: {
  group: PortalMatterGroup;
  view: ClientPortalView;
  locale: string;
}) {
  const copy = getClientPortalCopy(locale === "en" ? "en" : "zh-CN");
  const snapshot = group.matterSnapshot;
  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-cyan-800">
              {group.provisional ? copy.provisional : copy.linkedMatter}
            </p>
            <h2 className="mt-2 break-words text-2xl font-semibold tracking-tight text-[#001736]">
              {group.displayTitle}
            </h2>
            {group.legalMatterId ? (
              <p className="mt-2 text-sm text-slate-500">
                {copy.linkedMatter}: {group.legalMatterId}
              </p>
            ) : null}
            <p className="mt-2 text-sm text-slate-500">
              {copy.lastActivity}: {displayDate(group.latestActivityAt, locale)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {view.consultationState === "available" ? (
              <Link
                className="inline-flex items-center gap-2 rounded-full border border-cyan-800 px-4 py-3 text-sm font-semibold text-cyan-950 hover:bg-cyan-50"
                href={consultationCreateHref(group.defaultContinuationChatId)}
              >
                {copy.requestConsultation}
              </Link>
            ) : null}
            <Link
              className="inline-flex items-center gap-2 rounded-full bg-[#001736] px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800"
              href={aiWorkspaceHref(group.defaultContinuationChatId)}
            >
              {copy.continueWithAi}
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
        {group.matterSnapshotUnavailable ? (
          <p className="mt-5 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">
            {copy.matterUnavailable}
          </p>
        ) : null}
        {snapshot ? (
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {snapshot.issueSummary ? (
              <div className="rounded-2xl bg-slate-50 p-4 sm:col-span-2">
                <p className="text-xs font-semibold text-slate-500">
                  {copy.conversationContext}
                </p>
                <p className="mt-1 text-sm leading-6">
                  {snapshot.issueSummary}
                </p>
              </div>
            ) : null}
            {snapshot.issueType ? (
              <p className="rounded-2xl bg-slate-50 p-4 text-sm">
                <span className="font-semibold">{copy.issueType}</span>
                <br />
                {snapshot.issueType}
              </p>
            ) : null}
            {snapshot.visaType ? (
              <p className="rounded-2xl bg-slate-50 p-4 text-sm">
                <span className="font-semibold">{copy.visaType}</span>
                <br />
                {snapshot.visaType}
              </p>
            ) : null}
            {snapshot.interactionProgress ? (
              <p className="rounded-2xl bg-cyan-50 p-4 text-sm sm:col-span-2">
                {copy.confirmedCount}:{" "}
                {snapshot.interactionProgress.collectedRequired} /{" "}
                {snapshot.interactionProgress.totalRequired}
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="flex items-center gap-2 font-semibold text-[#001736]">
            <ShieldCheck className="size-5 text-emerald-700" />
            {copy.confirmed}
          </h3>
          {snapshot?.confirmedFacts.length ? (
            <ul className="mt-4 space-y-3">
              {snapshot.confirmedFacts.map((fact) => (
                <li
                  className="rounded-2xl bg-emerald-50/70 p-3"
                  key={fact.factKey}
                >
                  <p className="text-xs text-emerald-900">{fact.label}</p>
                  <p className="mt-1 break-words text-sm font-medium">
                    {fact.valueDisplay}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-slate-500">{copy.noFacts}</p>
          )}
        </section>
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-[#001736]">{copy.toConfirm}</h3>
          {snapshot?.toConfirm.length ? (
            <ul className="mt-4 space-y-3">
              {snapshot.toConfirm.map((fact) => (
                <li className="rounded-2xl bg-amber-50 p-3" key={fact.factKey}>
                  <p className="text-sm font-medium">{fact.label}</p>
                  <p className="mt-1 text-xs text-amber-900">
                    {fact.whyNeeded ?? fact.status}
                  </p>
                  {fact.valueDisplay ? (
                    <p className="mt-1 text-sm">{fact.valueDisplay}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-slate-500">{copy.noToConfirm}</p>
          )}
        </section>
      </div>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 font-semibold text-[#001736]">
            <FileText className="size-5 text-cyan-800" />
            {copy.documents}
          </h3>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs">
            {view.documentsAvailable
              ? group.documents.length
              : copy.unavailable}
          </span>
        </div>
        {view.documentsAvailable ? (
          group.documents.length ? (
            <ul className="mt-4 divide-y divide-slate-100">
              {group.documents.map((document) => (
                <li
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                  key={document.documentId}
                >
                  <div className="min-w-0">
                    <p className="break-all text-sm font-medium">
                      {document.originalFilename}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {document.mimeType} ·{" "}
                      {Math.ceil(document.byteSize / 1024)} KB ·{" "}
                      {displayDate(document.updatedAt, locale)}
                    </p>
                  </div>
                  <span className="rounded-full bg-amber-50 px-3 py-1 text-xs text-amber-900">
                    {document.securityStatus === "pending"
                      ? copy.securityPending
                      : document.securityStatus === "rejected"
                        ? copy.securityRejected
                        : document.securityStatus === "failed"
                          ? copy.securityFailed
                          : copy.securityRecorded}
                    {" · "}
                    {document.processingStatus === "not_started"
                      ? copy.processingNotStarted
                      : document.processingStatus === "processing"
                        ? copy.processing
                        : document.processingStatus === "complete"
                          ? copy.processingComplete
                          : copy.processingFailed}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-slate-500">{copy.noDocuments}</p>
          )
        ) : (
          <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
            <p className="font-semibold">{copy.documentsUnavailableTitle}</p>
            <p className="mt-1">{copy.documentsUnavailableDescription}</p>
          </div>
        )}
        <Link
          className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-cyan-900 underline"
          href={aiWorkspaceHref(group.defaultContinuationChatId)}
        >
          {copy.continueWithAi}
          <ArrowRight className="size-4" />
        </Link>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 font-semibold text-[#001736]">
            <Scale className="size-5 text-amber-700" />
            {copy.lawyerReview}
          </h3>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs">
            {group.lawyerRequests.length}
          </span>
        </div>
        {group.lawyerRequests.length ? (
          <ul className="mt-4 space-y-3">
            {group.lawyerRequests.map((request) => (
              <li
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-50 p-4"
                key={request.requestId}
              >
                <div>
                  <p className="text-sm font-semibold">
                    {request.unread ||
                    request.status === "needs_more_information"
                      ? copy.updateAvailable
                      : getLawyerRequestStatusLabel(
                          request.status,
                          locale === "en" ? "en" : "zh-CN"
                        )}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {displayDate(request.updatedAt, locale)}
                  </p>
                </div>
                <Link
                  className="text-sm font-semibold text-cyan-900 underline"
                  href={`/lawyer-requests/${encodeURIComponent(request.requestId)}`}
                >
                  {copy.viewRequest}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-slate-500">{copy.noLawyerRequests}</p>
        )}
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="flex items-center gap-2 font-semibold text-[#001736]">
          <MessageCircle className="size-5 text-cyan-800" />
          {copy.conversations}
        </h3>
        <ul className="mt-4 divide-y divide-slate-100">
          {group.conversations.map((conversation) => (
            <li
              className="flex flex-wrap items-center justify-between gap-3 py-3"
              key={conversation.chatId}
            >
              <div className="min-w-0">
                <p className="break-words text-sm font-medium">
                  {conversation.title}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {displayDate(conversation.updatedAt, locale)}
                </p>
              </div>
              <Link
                className="text-sm font-semibold text-cyan-900 underline"
                href={aiWorkspaceHref(conversation.chatId)}
              >
                {copy.openConversation}
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <div className="lg:hidden">
        <MembershipCard locale={locale} view={view} />
      </div>
    </div>
  );
}

function MembershipCard({
  view,
  locale,
}: {
  view: ClientPortalView;
  locale: string;
}) {
  const copy = getClientPortalCopy(locale === "en" ? "en" : "zh-CN");
  const membership = view.membership;
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <UserRound className="size-5 text-violet-800" />
        <h3 className="font-semibold text-[#001736]">{copy.membership}</h3>
      </div>
      <p className="mt-3 font-medium">
        {membership.active
          ? copy.vipActive
          : membership.expired
            ? copy.vipExpired
            : copy.free}
      </p>
      {membership.vipExpiresAt ? (
        <p className="mt-1 text-sm text-slate-500">
          {displayDate(membership.vipExpiresAt, locale)}
        </p>
      ) : null}
      {membership.cancelAtPeriodEnd ? (
        <p className="mt-2 text-sm text-amber-800">{copy.cancelAtPeriodEnd}</p>
      ) : null}
      <p className="mt-2 text-sm text-slate-600">
        {membership.premiumAllowed
          ? copy.premiumAvailable
          : copy.premiumUnavailable}
      </p>
      <Link
        className="mt-4 inline-flex rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50"
        href="/vip"
      >
        {copy.manageMembership}
      </Link>
    </section>
  );
}

export function ClientPortal() {
  const { locale } = useSiteLocale();
  const copy = getClientPortalCopy(locale);
  const [view, setView] = useState<ClientPortalView | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: locale intentionally refetches the cookie-localized server projection.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    fetch("/api/client-portal", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("portal unavailable");
        }
        return (await response.json()) as ClientPortalView;
      })
      .then((data) => {
        if (!cancelled) {
          setView(data);
          setSelectedKey((current) =>
            preservePortalGroupSelection(data.matterGroups, current)
          );
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(true);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [locale]);
  const selected = useMemo(
    () =>
      view?.matterGroups.find((group) => group.groupKey === selectedKey) ??
      view?.matterGroups[0] ??
      null,
    [view, selectedKey]
  );

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-7 sm:px-6 lg:px-8 lg:py-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-800">
            {copy.matters}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#001736]">
            {copy.title}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            {copy.subtitle}
          </p>
        </div>
        {view ? (
          <p className="text-sm text-slate-500">{view.account.email}</p>
        ) : null}
      </div>
      {view ? (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            [copy.matters, view.summary.matterGroupCount],
            [copy.conversations, view.summary.conversationCount],
            [
              copy.documents,
              view.documentsAvailable
                ? view.summary.documentCount
                : copy.unavailable,
            ],
            [copy.lawyerReview, view.summary.lawyerRequestCount],
          ].map(([label, count]) => (
            <div
              className="rounded-2xl border border-slate-200 bg-white p-4"
              key={String(label)}
            >
              <p className="text-xs text-slate-500">{label}</p>
              <p className="mt-1 text-2xl font-semibold text-[#001736]">
                {count}
              </p>
            </div>
          ))}
        </div>
      ) : null}
      {view ? (
        <section className="mb-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold text-[#001736]">
              {copy.consultations}
            </h2>
            {view.consultationState === "available" ? (
              <Link
                className="text-sm font-semibold underline"
                href="/consultations"
              >
                {copy.viewConsultations}
              </Link>
            ) : null}
          </div>
          {view.consultationState === "schema_unavailable" ? (
            <output
              aria-live="polite"
              className="mt-3 block rounded-2xl bg-amber-50 p-4 text-sm text-amber-950"
            >
              {copy.consultationsUnavailable}
            </output>
          ) : view.consultationState === "verification_required" ? (
            <output
              aria-live="polite"
              className="mt-3 block rounded-2xl bg-amber-50 p-4 text-sm text-amber-950"
            >
              {copy.consultationsVerificationRequired}
            </output>
          ) : view.consultations.length ? (
            <ul className="mt-3 space-y-2">
              {view.consultations.map((consultation) => (
                <li
                  className="flex flex-wrap justify-between gap-2 rounded-xl bg-slate-50 p-3 text-sm"
                  key={consultation.consultationId}
                >
                  <span>
                    {consultationStatusLabel(
                      consultation.status,
                      locale === "en" ? "en" : "zh-CN"
                    )}{" "}
                    ·{" "}
                    {consultation.assigned ? copy.assignedYes : copy.assignedNo}
                  </span>
                  <span className="text-slate-600">
                    {displayDate(
                      consultation.scheduledStartAt ?? consultation.updatedAt,
                      locale
                    )}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-slate-600">
              {copy.noConsultations}
            </p>
          )}
        </section>
      ) : null}
      {loading ? (
        <div
          aria-live="polite"
          className="rounded-3xl border border-slate-200 bg-white p-8 text-sm text-slate-600"
        >
          {copy.processing}
        </div>
      ) : error ? (
        <div
          className="rounded-3xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-950"
          role="alert"
        >
          {copy.unavailable}
        </div>
      ) : view && view.matterGroups.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <BriefcaseBusiness className="mx-auto size-8 text-cyan-800" />
          <p className="mt-4 text-slate-700">{copy.noMatters}</p>
          <Link
            className="mt-5 inline-flex rounded-full bg-[#001736] px-5 py-3 text-sm font-semibold text-white"
            href="/ai-workspace"
          >
            {copy.continueWithAi}
          </Link>
        </div>
      ) : view && selected ? (
        <div className="grid items-start gap-5 lg:grid-cols-12">
          <aside className="space-y-4 lg:col-span-3">
            <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="px-2 pb-3 text-sm font-semibold text-slate-700">
                {copy.matters}
              </h2>
              <div className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
                {view.matterGroups.map((group) => (
                  <button
                    aria-pressed={selected.groupKey === group.groupKey}
                    className={
                      (selected.groupKey === group.groupKey
                        ? "border-cyan-700 bg-cyan-50 text-[#001736] "
                        : "border-transparent text-slate-700 hover:bg-slate-50 ") +
                      "min-w-48 rounded-2xl border p-3 text-left lg:min-w-0"
                    }
                    key={group.groupKey}
                    onClick={() => setSelectedKey(group.groupKey)}
                    type="button"
                  >
                    <span className="block truncate text-sm font-semibold">
                      {group.displayTitle}
                    </span>
                    <span className="mt-1 block text-xs text-slate-500">
                      {group.provisional ? copy.provisional : copy.linkedMatter}
                    </span>
                    {group.matterSnapshot?.issueType ||
                    group.matterSnapshot?.visaType ? (
                      <span className="mt-2 block truncate text-xs text-slate-600">
                        {group.matterSnapshot.issueType ??
                          group.matterSnapshot.visaType}
                      </span>
                    ) : null}
                    <span className="mt-2 block text-xs text-slate-500">
                      {displayDate(group.latestActivityAt, locale)}
                    </span>
                    <span className="mt-1 block text-xs text-slate-500">
                      {copy.documents}: {group.documents.length} ·{" "}
                      {copy.lawyerReview}: {group.lawyerRequests.length}
                    </span>
                  </button>
                ))}
              </div>
            </section>
            <div className="hidden lg:block">
              <MembershipCard locale={locale} view={view} />
            </div>
          </aside>
          <section className="lg:col-span-6">
            <MatterDetails group={selected} locale={locale} view={view} />
          </section>
          <aside className="space-y-4 lg:col-span-3">
            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="font-semibold text-[#001736]">
                {copy.lastActivity}
              </h2>
              {view.recentActivity.length ? (
                <ul className="mt-4 space-y-3">
                  {view.recentActivity.slice(0, 20).map((activity) => (
                    <li
                      className="border-l-2 border-cyan-700 pl-3"
                      key={activity.id}
                    >
                      <p className="text-sm">
                        {activity.kind === "lawyer_request"
                          ? copy.lawyerReview
                          : activity.kind === "document"
                            ? copy.documents
                            : copy.conversations}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {displayDate(activity.occurredAt, locale)}
                      </p>
                      <Link
                        className="mt-1 inline-block text-xs font-semibold text-cyan-900 underline"
                        href={
                          activity.requestId
                            ? "/lawyer-requests/" +
                              encodeURIComponent(activity.requestId)
                            : aiWorkspaceHref(activity.chatId)
                        }
                      >
                        {activity.requestId
                          ? copy.viewRequest
                          : copy.openConversation}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-slate-500">{copy.noMatters}</p>
              )}
            </section>
            <section className="rounded-3xl bg-[#001736] p-5 text-white">
              <h2 className="font-semibold">{copy.conversationContext}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-200">
                {copy.subtitle}
              </p>
              <Link
                className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-cyan-200 underline"
                href={aiWorkspaceHref(selected.defaultContinuationChatId)}
              >
                {copy.continueWithAi}
                <ArrowRight className="size-4" />
              </Link>
            </section>
          </aside>
        </div>
      ) : null}
    </main>
  );
}
