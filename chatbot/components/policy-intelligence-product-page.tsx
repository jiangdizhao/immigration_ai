"use client";

import {
  ArrowLeft,
  ArrowUpRight,
  CalendarDays,
  ExternalLink,
  FileText,
  Search,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { formatPolicyDate } from "@/lib/policy-intelligence";
import {
  impactPolicyOrder,
  latestPolicyOrder,
  type PolicyProductState,
  type ProductNarrative,
  type PublicPolicyDetail,
  type PublicPolicyProduct,
  policyWorkspaceHref,
} from "@/lib/policy-intelligence-product";
import {
  getPolicyPresentationGroup,
  getPolicyPresentationGroupLabel,
  getPolicyPresentationStatusLabel,
  getPolicyProductCopy,
  getPublicImportanceLabel,
  type PolicyPresentationGroup,
} from "@/lib/policy-intelligence-product-copy";
import { getPublicPageContent, PUBLIC_ROUTES } from "@/lib/public-content";
import { PolicyIntelligenceAvailabilityNotice } from "./policy-intelligence-availability-notice";
import { PublicPageFrame } from "./public-page-primitives";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";
import { useSiteLocale } from "./site-locale-provider";

type Locale = "zh-CN" | "en";

const statusClasses = {
  published: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  proposed: "bg-amber-50 text-amber-800 ring-amber-200",
  historical: "bg-slate-100 text-slate-700 ring-slate-200",
} as const;

function dateLabel(date: string | null, locale: Locale, notStated: string) {
  return date ? formatPolicyDate(date, locale) : notStated;
}

function SourceStatus({ policy }: { policy: PublicPolicyProduct }) {
  const { locale } = useSiteLocale();
  const group = getPolicyPresentationGroup(policy.sourceStatus);
  return (
    <span
      className={`inline-flex w-fit rounded px-2.5 py-1 text-xs font-semibold ring-1 ${statusClasses[group ?? "historical"]}`}
    >
      {getPolicyPresentationStatusLabel(policy.sourceStatus, locale)}
    </span>
  );
}

function PolicyRow({ policy }: { policy: PublicPolicyProduct }) {
  const { locale } = useSiteLocale();
  const copy = getPolicyProductCopy(locale);
  const text = policy.copy[locale];
  const impact = policy.analysis.practicalImpacts[0]?.text[locale];
  const affected = policy.analysis.affectedGroups[0]?.text[locale];

  return (
    <article className="grid gap-x-6 gap-y-4 border-b border-slate-200 bg-white px-4 py-5 first:border-t sm:px-6 lg:grid-cols-[minmax(0,1fr)_210px] lg:py-5">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <SourceStatus policy={policy} />
          <span className="text-xs text-slate-500">
            {policy.origin === "automated"
              ? copy.liveOrigin
              : copy.manualOrigin}
          </span>
          <span className="text-xs text-slate-500">
            {policy.source.authority}
          </span>
        </div>
        <h3 className="mt-3 text-lg font-semibold leading-snug tracking-tight text-[#092c52]">
          <Link
            className="hover:text-[#285d91]"
            href={`${PUBLIC_ROUTES.intelligence}/${policy.slug}`}
          >
            {text.title}
          </Link>
        </h3>
        <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
          {text.summary}
        </p>
        {affected || impact ? (
          <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            {affected ? (
              <p className="leading-5 text-slate-600">
                <span className="font-semibold text-slate-800">
                  {copy.affectedGroups}:{" "}
                </span>
                {affected}
              </p>
            ) : null}
            {impact ? (
              <p className="leading-5 text-slate-600">
                <span className="font-semibold text-slate-800">
                  {copy.practicalImpacts}:{" "}
                </span>
                {impact}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="flex min-w-0 flex-col justify-between gap-4 border-t border-slate-100 pt-3 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
        <div className="grid gap-2 text-xs text-slate-600">
          <span className="inline-flex items-start gap-2 break-words">
            <FileText
              aria-hidden="true"
              className="mt-0.5 size-3.5 shrink-0 text-[#315d86]"
            />
            {policy.source.officialTitle}
          </span>
          <span className="inline-flex items-center gap-2">
            <CalendarDays
              aria-hidden="true"
              className="size-3.5 shrink-0 text-[#315d86]"
            />
            {dateLabel(policy.source.sourceDate, locale, copy.notStated)}
          </span>
          <span className="break-words">{policy.source.category[locale]}</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <a
            className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 underline decoration-slate-300 underline-offset-4 hover:text-[#123f70]"
            href={policy.source.officialUrl}
            rel="noreferrer"
            target="_blank"
          >
            {copy.officialSource}
            <ExternalLink aria-hidden="true" className="size-3.5" />
          </a>
          <Link
            className="inline-flex items-center gap-1 text-sm font-semibold text-[#123f70] hover:text-violet-700"
            href={`${PUBLIC_ROUTES.intelligence}/${policy.slug}`}
          >
            {copy.viewDetails}
            <ArrowUpRight aria-hidden="true" className="size-4" />
          </Link>
        </div>
      </div>
    </article>
  );
}

function PolicyGroup({
  title,
  eyebrow,
  policies,
}: {
  title: string;
  eyebrow: string;
  policies: PublicPolicyProduct[];
}) {
  if (!policies.length) {
    return null;
  }
  return (
    <section className="mt-8 first:mt-0">
      <div className="flex items-end justify-between gap-3 border-b-2 border-[#092c52] pb-2">
        <div>
          <p className="font-mono text-[10px] font-bold tracking-[0.14em] text-[#55718d]">
            {eyebrow}
          </p>
          <h2 className="mt-1 text-base font-bold text-[#092c52]">{title}</h2>
        </div>
        <span className="font-mono text-xs text-slate-500">
          {String(policies.length).padStart(2, "0")}
        </span>
      </div>
      <div className="overflow-hidden border-x border-slate-200">
        {policies.map((policy) => (
          <PolicyRow key={policy.id} policy={policy} />
        ))}
      </div>
    </section>
  );
}

export function PolicyIntelligenceProductPage({
  state,
}: {
  state: PolicyProductState;
}) {
  const { locale } = useSiteLocale();
  const pageCopy = getPublicPageContent(locale).intelligence;
  const copy = getPolicyProductCopy(locale);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState<PolicyPresentationGroup | "">("");
  const [sort, setSort] = useState<"latest" | "impact">("latest");
  const categories = useMemo(
    () =>
      [
        ...new Set(state.policies.map((item) => item.source.category[locale])),
      ].sort((a, b) => a.localeCompare(b, locale)),
    [locale, state.policies]
  );
  const policies = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase(locale);
    return state.policies
      .filter(
        (policy) => getPolicyPresentationGroup(policy.sourceStatus) !== null
      )
      .filter((policy) => {
        const searchable = [
          policy.copy["zh-CN"].title,
          policy.copy["zh-CN"].summary,
          policy.copy.en.title,
          policy.copy.en.summary,
          policy.source.authority,
          policy.source.officialTitle,
          policy.source.category["zh-CN"],
          policy.source.category.en,
        ]
          .join(" ")
          .toLocaleLowerCase(locale);
        return (
          (!normalizedQuery || searchable.includes(normalizedQuery)) &&
          (!category || policy.source.category[locale] === category) &&
          (!status ||
            getPolicyPresentationGroup(policy.sourceStatus) === status)
        );
      })
      .sort(sort === "latest" ? latestPolicyOrder : impactPolicyOrder);
  }, [category, locale, query, sort, state.policies, status]);
  const published = policies.filter(
    (item) => getPolicyPresentationGroup(item.sourceStatus) === "published"
  );
  const proposed = policies.filter(
    (item) => getPolicyPresentationGroup(item.sourceStatus) === "proposed"
  );

  return (
    <PublicPageFrame>
      <SiteHeader />
      <main className="intelligence-page min-h-screen bg-[#f3f4f6]">
        <header className="border-b border-white/10 bg-[#092c52] px-5 py-8 text-white sm:py-10 lg:px-8">
          <div className="mx-auto grid max-w-7xl gap-6 md:grid-cols-[minmax(0,1fr)_minmax(16rem,0.55fr)] md:items-end">
            <div>
              <p className="font-mono text-[10px] font-bold tracking-[0.17em] text-cyan-200">
                {pageCopy.eyebrow} · AUSTRALIA
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
                {pageCopy.title}
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
                {pageCopy.description}
              </p>
            </div>
            <p className="border-l border-white/20 pl-4 text-xs leading-5 text-slate-300">
              <span className="mb-1 block font-semibold text-white">
                {copy.aiLabel}
              </span>
              {copy.aiDisclaimer}
            </p>
          </div>
        </header>
        <section className="px-5 py-6 sm:py-8 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <PolicyIntelligenceAvailabilityNotice state={state} />
            {state.policies.length > 0 ? (
              <div className="mt-4 grid gap-2 border border-slate-200 bg-white p-3 sm:grid-cols-[minmax(12rem,1fr)_repeat(3,minmax(9rem,auto))]">
                <label className="relative block">
                  <Search
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
                  />
                  <span className="sr-only">{copy.search}</span>
                  <input
                    className="h-10 w-full rounded border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-[#315d86]"
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={copy.search}
                    type="search"
                    value={query}
                  />
                </label>
                <label className="sr-only" htmlFor="policy-product-category">
                  {copy.allSources}
                </label>
                <select
                  className="h-10 rounded border border-slate-200 bg-white px-3 text-sm text-slate-700"
                  id="policy-product-category"
                  onChange={(event) => setCategory(event.target.value)}
                  value={category}
                >
                  <option value="">{copy.allSources}</option>
                  {categories.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
                <label className="sr-only" htmlFor="policy-product-status">
                  {copy.allStatuses}
                </label>
                <select
                  className="h-10 rounded border border-slate-200 bg-white px-3 text-sm text-slate-700"
                  id="policy-product-status"
                  onChange={(event) =>
                    setStatus(
                      event.target.value as PolicyPresentationGroup | ""
                    )
                  }
                  value={status}
                >
                  <option value="">{copy.allStatuses}</option>
                  {(["published", "proposed"] as const).map((value) => (
                    <option key={value} value={value}>
                      {getPolicyPresentationGroupLabel(value, locale)}
                    </option>
                  ))}
                </select>
                <label className="sr-only" htmlFor="policy-product-sort">
                  {copy.latest}
                </label>
                <select
                  className="h-10 rounded border border-slate-200 bg-white px-3 text-sm text-slate-700"
                  id="policy-product-sort"
                  onChange={(event) =>
                    setSort(event.target.value as "latest" | "impact")
                  }
                  value={sort}
                >
                  <option value="latest">{copy.latest}</option>
                  <option value="impact">{copy.impact}</option>
                </select>
              </div>
            ) : null}
            {policies.length ? (
              <div className="mt-7">
                <PolicyGroup
                  eyebrow="01 · PUBLISHED"
                  policies={published}
                  title={getPolicyPresentationGroupLabel("published", locale)}
                />
                <PolicyGroup
                  eyebrow="02 · PROPOSED"
                  policies={proposed}
                  title={getPolicyPresentationGroupLabel("proposed", locale)}
                />
              </div>
            ) : (
              <div className="mt-6 border border-slate-200 bg-white p-6 text-center">
                <FileText
                  aria-hidden="true"
                  className="mx-auto size-7 text-[#315d86]"
                />
                <h2 className="mt-3 font-semibold text-slate-900">
                  {state.policies.length
                    ? copy.noResults
                    : copy.availability[state.availability]}
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  {state.policies.length
                    ? copy.noResults
                    : copy.availabilityDescription[state.availability]}
                </p>
              </div>
            )}
          </div>
        </section>
      </main>
      <SiteFooter />
    </PublicPageFrame>
  );
}

function NarrativeSection({
  title,
  items,
}: {
  title: string;
  items: readonly ProductNarrative[];
}) {
  const locale = useSiteLocale().locale;
  if (!items.length) {
    return null;
  }
  return (
    <section className="border-b border-slate-200 py-5 last:border-b-0">
      <h2 className="text-sm font-bold text-[#092c52]">{title}</h2>
      <ul className="mt-3 space-y-3">
        {items.map((item) => (
          <li
            className="border-l-2 border-violet-300 pl-3 text-sm leading-6 text-slate-700"
            key={item.id}
          >
            {item.text[locale]}
          </li>
        ))}
      </ul>
    </section>
  );
}

function ImportancePanel({ policy }: { policy: PublicPolicyProduct }) {
  const { locale } = useSiteLocale();
  const copy = getPolicyProductCopy(locale);
  const importance = policy.importance;
  if (!importance) {
    return null;
  }
  const dimensions = [
    [
      copy.serviceRelevance,
      getPublicImportanceLabel(
        "serviceRelevance",
        importance.serviceRelevance,
        locale
      ),
    ],
    [
      copy.immediacy,
      getPublicImportanceLabel("immediacy", importance.immediacy, locale),
    ],
    [
      copy.proceduralImpact,
      getPublicImportanceLabel(
        "proceduralImpact",
        importance.proceduralImpact,
        locale
      ),
    ],
    [
      copy.affectedPopulation,
      getPublicImportanceLabel(
        "affectedPopulation",
        importance.affectedPopulation,
        locale
      ),
    ],
  ] as const;
  return (
    <section className="mt-5 border-t border-slate-200 pt-4">
      <h2 className="text-xs font-bold text-slate-700">{copy.importance}</h2>
      <dl className="mt-3 grid grid-cols-2 gap-3">
        {dimensions.map(([label, value]) => (
          <div key={label}>
            <dt className="text-[10px] text-slate-500">{label}</dt>
            <dd className="mt-1 text-xs font-medium text-slate-800">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function PolicyIntelligenceProductDetail({
  entry,
}: {
  entry: PublicPolicyDetail;
}) {
  const { locale } = useSiteLocale();
  const pageCopy = getPublicPageContent(locale).intelligence;
  const copy = getPolicyProductCopy(locale);
  const text = entry.copy[locale];
  const publishedHistory = entry.history.length > 1 ? entry.history : [];
  return (
    <PublicPageFrame>
      <SiteHeader />
      <main className="min-h-screen bg-[#f3f4f6]">
        <div className="border-b border-slate-200 bg-white px-5 py-4 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <Link
              className="inline-flex items-center gap-2 text-xs font-semibold text-[#315d86] hover:text-[#092c52]"
              href={PUBLIC_ROUTES.intelligence}
            >
              <ArrowLeft aria-hidden="true" className="size-4" />
              {pageCopy.backToList}
            </Link>
            <p className="mt-4 font-mono text-[10px] font-bold tracking-[0.15em] text-slate-500">
              {pageCopy.eyebrow} / AUSTRALIA
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <SourceStatus policy={entry} />
              <span className="text-xs text-slate-500">
                {entry.origin === "automated"
                  ? copy.liveOrigin
                  : copy.manualOrigin}
              </span>
            </div>
            <h1 className="mt-3 max-w-5xl text-2xl font-semibold leading-tight tracking-tight text-[#092c52] sm:text-3xl">
              {text.title}
            </h1>
            <p className="mt-2 max-w-5xl text-sm leading-6 text-slate-600">
              {text.summary}
            </p>
          </div>
        </div>
        <div className="mx-auto grid max-w-6xl gap-6 px-5 py-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:px-8">
          <div className="min-w-0">
            <section className="border border-slate-200 bg-white px-5 py-5 sm:px-7">
              <div className="flex items-center gap-2 border-b border-slate-200 pb-3 text-sm font-bold text-emerald-900">
                <ShieldCheck aria-hidden="true" className="size-4" />
                {copy.officialSource}
              </div>
              <dl className="mt-4 grid gap-x-5 gap-y-4 sm:grid-cols-2">
                <div>
                  <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    {copy.officialSource}
                  </dt>
                  <dd className="mt-1 text-sm font-medium text-slate-900">
                    {entry.source.authority}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    {locale === "zh-CN" ? "官方标题" : "Official title"}
                  </dt>
                  <dd className="mt-1 text-sm text-slate-800">
                    {entry.source.officialTitle}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    {pageCopy.sourceDate}
                  </dt>
                  <dd className="mt-1 text-sm text-slate-800">
                    {dateLabel(entry.source.sourceDate, locale, copy.notStated)}
                  </dd>
                </div>
                {entry.source.effectiveDate ? (
                  <div>
                    <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      {pageCopy.effectiveDate}
                    </dt>
                    <dd className="mt-1 text-sm text-slate-800">
                      {dateLabel(
                        entry.source.effectiveDate,
                        locale,
                        copy.notStated
                      )}
                    </dd>
                  </div>
                ) : null}
                <div>
                  <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    {locale === "zh-CN" ? "类别" : "Category"}
                  </dt>
                  <dd className="mt-1 text-sm text-slate-800">
                    {entry.source.category[locale]}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    {locale === "zh-CN" ? "司法辖区" : "Jurisdiction"}
                  </dt>
                  <dd className="mt-1 text-sm text-slate-800">
                    {entry.source.jurisdiction}
                  </dd>
                </div>
              </dl>
              <a
                className="mt-5 inline-flex items-center gap-2 border-t border-slate-100 pt-4 text-sm font-semibold text-[#315d86] underline decoration-slate-300 underline-offset-4"
                href={entry.source.officialUrl}
                rel="noreferrer"
                target="_blank"
              >
                {locale === "zh-CN" ? "打开官方来源" : "Open official source"}
                <ExternalLink aria-hidden="true" className="size-4" />
              </a>
              {entry.officialExcerpt ? (
                <blockquote className="mt-4 border-l-2 border-emerald-500 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-950">
                  <p>{entry.officialExcerpt.text}</p>
                  <footer className="mt-2 text-xs text-emerald-800">
                    {locale === "zh-CN"
                      ? "官方来源摘录"
                      : "Official source excerpt"}{" "}
                    · {entry.officialExcerpt.language}
                  </footer>
                </blockquote>
              ) : null}
            </section>
            <section className="mt-5 border border-violet-200 bg-[#fbf9ff] px-5 py-5 sm:px-7">
              <div className="flex items-center gap-2 text-sm font-bold text-violet-950">
                <Sparkles aria-hidden="true" className="size-4" />
                {entry.aiGenerated ? copy.aiLabel : copy.manualSummary}
              </div>
              <p className="mt-2 text-xs leading-5 text-violet-900/80">
                {entry.aiGenerated ? copy.aiDisclaimer : copy.manualOrigin}
              </p>
              <section className="border-b border-slate-200 py-5">
                <h2 className="text-sm font-bold text-[#092c52]">
                  {copy.sectionSummary}
                </h2>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                  {text.summary}
                </p>
              </section>
              <NarrativeSection
                items={entry.analysis.keyChanges}
                title={copy.keyChanges}
              />
              <NarrativeSection
                items={entry.analysis.affectedGroups}
                title={copy.affectedGroups}
              />
              <NarrativeSection
                items={entry.analysis.practicalImpacts}
                title={copy.practicalImpacts}
              />
              <NarrativeSection
                items={entry.analysis.recommendedActions}
                title={copy.recommendedActions}
              />
              {entry.analysis.transitionInfo ? (
                <NarrativeSection
                  items={[entry.analysis.transitionInfo]}
                  title={copy.transitionInfo}
                />
              ) : null}
              <NarrativeSection
                items={entry.analysis.uncertainties}
                title={copy.uncertainties}
              />
            </section>
            {publishedHistory.length ? (
              <section className="mt-5 border border-slate-200 bg-white px-5 py-5 sm:px-7">
                <h2 className="text-sm font-bold text-[#092c52]">
                  {copy.history}
                </h2>
                <ol className="mt-4 space-y-3">
                  {publishedHistory.map((revision, index) => (
                    <li
                      className="border-l border-slate-200 pl-4"
                      key={`${revision.revisionNumber}-${revision.publishedAt}`}
                    >
                      <p className="text-sm font-semibold text-slate-900">
                        {index === 0 ? copy.current : copy.previous} ·{" "}
                        {copy.revision} {revision.revisionNumber}
                      </p>
                      <p className="mt-1 text-sm text-slate-700">
                        {revision.title[locale]}
                      </p>
                      {revision.publishedAt ? (
                        <p className="mt-1 text-xs text-slate-500">
                          {new Intl.DateTimeFormat(
                            locale === "zh-CN" ? "zh-CN" : "en-AU",
                            { dateStyle: "medium", timeZone: "UTC" }
                          ).format(new Date(revision.publishedAt))}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ol>
                {entry.diff.length ? (
                  <div className="mt-5 border-t border-slate-100 pt-4">
                    <h3 className="text-xs font-bold text-slate-700">
                      {copy.diff}
                    </h3>
                    <ul className="mt-3 space-y-3">
                      {entry.diff.map((change) => (
                        <li
                          className="bg-slate-50 p-3 text-sm"
                          key={`${change.section}-${change.unitId}`}
                        >
                          <p className="text-xs font-semibold text-slate-500">
                            {copy[change.kind]} · {copy[change.section]}
                          </p>
                          {change.before ? (
                            <p className="mt-2 text-slate-600">
                              − {change.before[locale]}
                            </p>
                          ) : null}
                          {change.after ? (
                            <p className="mt-2 text-slate-800">
                              + {change.after[locale]}
                            </p>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </section>
            ) : null}
            {entry.lawyerCommentary?.[locale] ? (
              <section className="mt-5 border border-amber-200 bg-amber-50/70 px-5 py-5 sm:px-7">
                <h2 className="flex items-center gap-2 text-sm font-bold text-amber-950">
                  <UserRound aria-hidden="true" className="size-4" />
                  {copy.lawyerCommentary}
                </h2>
                <p className="mt-3 text-sm leading-6 text-amber-950">
                  {entry.lawyerCommentary[locale]}
                </p>
              </section>
            ) : null}
          </div>
          <aside className="h-fit border border-slate-200 bg-white p-5">
            <p className="font-mono text-[10px] font-bold tracking-[0.14em] text-slate-500">
              {copy.sourceStatus}
            </p>
            <div className="mt-3">
              <SourceStatus policy={entry} />
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-600">
              {entry.source.category[locale]}
            </p>
            <ImportancePanel policy={entry} />
            <div className="mt-5 border-t border-slate-200 pt-4">
              <p className="text-xs font-semibold text-slate-800">
                {entry.aiGenerated ? copy.aiLabel : copy.manualSummary}
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-600">
                {entry.aiGenerated ? copy.aiDisclaimer : copy.manualOrigin}
              </p>
              <Link
                className="mt-4 inline-flex items-center gap-2 border border-[#092c52] px-3 py-2 text-xs font-semibold text-[#092c52] hover:bg-slate-50"
                href={policyWorkspaceHref(entry.slug)}
              >
                {copy.askAi}
                <ArrowUpRight aria-hidden="true" className="size-4" />
              </Link>
            </div>
          </aside>
        </div>
      </main>
      <SiteFooter />
    </PublicPageFrame>
  );
}
