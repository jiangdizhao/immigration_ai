"use client";

import {
  ArrowUpRight,
  BookOpenText,
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
import {
  formatPolicyDate,
  getPolicySourceStatusLabel,
} from "@/lib/policy-intelligence";
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
  getPolicyProductCopy,
  getPublicImportanceLabel,
} from "@/lib/policy-intelligence-product-copy";
import { getPublicPageContent, PUBLIC_ROUTES } from "@/lib/public-content";
import { PolicyIntelligenceAvailabilityNotice } from "./policy-intelligence-availability-notice";
import {
  PublicActionLink,
  PublicEditorialHero,
  PublicEyebrow,
  PublicPageFrame,
} from "./public-page-primitives";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";
import { useSiteLocale } from "./site-locale-provider";

const statusClasses = {
  in_force: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  announced: "bg-sky-50 text-sky-800 ring-sky-200",
  proposed: "bg-amber-50 text-amber-800 ring-amber-200",
  consultation: "bg-violet-50 text-violet-800 ring-violet-200",
  superseded: "bg-slate-100 text-slate-700 ring-slate-200",
} as const;

function dateLabel(
  date: string | null,
  locale: "zh-CN" | "en",
  notStated: string
) {
  return date ? formatPolicyDate(date, locale) : notStated;
}

function PolicyCard({ policy }: { policy: PublicPolicyProduct }) {
  const { locale } = useSiteLocale();
  const copy = getPolicyProductCopy(locale);
  const text = policy.copy[locale];
  return (
    <article className="flex min-w-0 flex-col rounded-[1.75rem] bg-white p-6 shadow-sm ring-1 ring-slate-200/70 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${statusClasses[policy.sourceStatus]}`}
        >
          {getPolicySourceStatusLabel(policy.sourceStatus, locale)}
        </span>
        <span className="text-xs text-slate-500">
          {policy.origin === "automated" ? copy.liveOrigin : copy.manualOrigin}
        </span>
      </div>
      <h2 className="mt-5 break-words text-xl font-semibold leading-tight text-slate-950">
        {text.title}
      </h2>
      <p className="mt-3 line-clamp-4 text-sm leading-6 text-slate-600">
        {text.summary}
      </p>
      <div className="mt-5 grid gap-2 border-t border-slate-100 pt-4 text-sm text-slate-600">
        <span className="break-words">{policy.source.authority}</span>
        <span className="text-xs text-slate-500">
          {policy.source.category[locale]}
        </span>
        <span className="inline-flex items-center gap-2 text-xs text-slate-500">
          <CalendarDays aria-hidden="true" className="size-3.5" />
          {dateLabel(policy.source.sourceDate, locale, copy.notStated)}
        </span>
      </div>
      <Link
        className="mt-auto inline-flex items-center gap-2 pt-6 text-sm font-semibold text-[#123f70] hover:text-violet-700"
        href={`${PUBLIC_ROUTES.intelligence}/${policy.slug}`}
      >
        {copy.viewDetails}
        <ArrowUpRight aria-hidden="true" className="size-4" />
      </Link>
    </article>
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
  const [status, setStatus] = useState("");
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
          (!status || policy.sourceStatus === status)
        );
      })
      .sort(sort === "latest" ? latestPolicyOrder : impactPolicyOrder);
  }, [category, locale, query, sort, state.policies, status]);

  return (
    <PublicPageFrame>
      <SiteHeader />
      <main>
        <PublicEditorialHero
          aside={
            <div className="rounded-[2rem] bg-[#092c52] p-6 text-white">
              <PublicEyebrow icon={ShieldCheck} tone="light">
                {copy.officialSource}
              </PublicEyebrow>
              <p className="mt-3 text-sm leading-7 text-slate-300">
                {copy.aiDisclaimer}
              </p>
            </div>
          }
          description={pageCopy.description}
          eyebrow={pageCopy.eyebrow}
          icon={BookOpenText}
          title={pageCopy.title}
          tone="navy"
        />
        <section className="bg-[#f4f6f9] px-5 py-14 sm:py-20 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <PolicyIntelligenceAvailabilityNotice state={state} />
            {state.policies.length > 0 ? (
              <div className="mt-7 grid gap-3 md:grid-cols-[minmax(15rem,1fr)_repeat(3,minmax(10rem,auto))]">
                <label className="relative block">
                  <Search
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
                  />
                  <span className="sr-only">{copy.search}</span>
                  <input
                    className="h-11 w-full rounded-full border-0 bg-white pl-10 pr-4 text-sm text-slate-900 shadow-sm ring-1 ring-slate-200 outline-none focus:ring-2 focus:ring-[#123f70]"
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
                  className="h-11 rounded-full border-0 bg-white px-4 text-sm text-slate-700 shadow-sm ring-1 ring-slate-200"
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
                  className="h-11 rounded-full border-0 bg-white px-4 text-sm text-slate-700 shadow-sm ring-1 ring-slate-200"
                  id="policy-product-status"
                  onChange={(event) => setStatus(event.target.value)}
                  value={status}
                >
                  <option value="">{copy.allStatuses}</option>
                  {Object.keys(statusClasses).map((value) => (
                    <option key={value} value={value}>
                      {getPolicySourceStatusLabel(
                        value as PublicPolicyProduct["sourceStatus"],
                        locale
                      )}
                    </option>
                  ))}
                </select>
                <label className="sr-only" htmlFor="policy-product-sort">
                  {copy.latest}
                </label>
                <select
                  className="h-11 rounded-full border-0 bg-white px-4 text-sm text-slate-700 shadow-sm ring-1 ring-slate-200"
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
              <div className="mt-8 grid gap-5 lg:grid-cols-2">
                {policies.map((policy) => (
                  <PolicyCard key={policy.id} policy={policy} />
                ))}
              </div>
            ) : (
              <div className="mt-8 rounded-[2rem] bg-white p-8 text-center ring-1 ring-slate-200">
                <FileText
                  aria-hidden="true"
                  className="mx-auto size-8 text-[#123f70]"
                />
                <h2 className="mt-4 text-xl font-semibold text-slate-950">
                  {state.policies.length
                    ? copy.noResults
                    : copy.availability[state.availability]}
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
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
    <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200/70 sm:p-8">
      <h2 className="text-xl font-semibold text-slate-950">{title}</h2>
      <ul className="mt-4 space-y-4">
        {items.map((item) => (
          <li
            className="border-l-2 border-violet-300 pl-4 text-sm leading-7 text-slate-700"
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
    <section className="rounded-3xl bg-slate-50 p-6 ring-1 ring-slate-200">
      <h2 className="font-semibold text-slate-950">{copy.importance}</h2>
      <dl className="mt-4 grid gap-4 sm:grid-cols-2">
        {dimensions.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-slate-500">{label}</dt>
            <dd className="mt-1 font-medium text-slate-800">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 border-t border-slate-200 pt-4 text-xs text-slate-600">
        {copy.legalForce}: {copy.legalForceNames[importance.legalForce]}
      </p>
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
  return (
    <PublicPageFrame>
      <SiteHeader />
      <main>
        <PublicEditorialHero
          actions={
            <PublicActionLink href={PUBLIC_ROUTES.intelligence} variant="navy">
              {pageCopy.backToList}
            </PublicActionLink>
          }
          aside={
            <section className="rounded-[2rem] bg-[#092c52] p-6 text-white sm:p-8">
              <PublicEyebrow icon={ShieldCheck} tone="light">
                {copy.officialSource}
              </PublicEyebrow>
              <h2 className="mt-4 break-words text-2xl font-semibold">
                {entry.source.officialTitle}
              </h2>
              <p className="mt-3 break-words text-sm text-slate-300">
                {entry.source.authority}
              </p>
              <dl className="mt-5 space-y-3 text-sm">
                <div>
                  <dt className="text-slate-400">{pageCopy.sourceDate}</dt>
                  <dd>
                    {dateLabel(entry.source.sourceDate, locale, copy.notStated)}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-400">{pageCopy.effectiveDate}</dt>
                  <dd>
                    {dateLabel(
                      entry.source.effectiveDate,
                      locale,
                      copy.notStated
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-400">{copy.publishedAt}</dt>
                  <dd>
                    {entry.revision.publishedAt
                      ? new Intl.DateTimeFormat(
                          locale === "zh-CN" ? "zh-CN" : "en-AU",
                          { dateStyle: "medium", timeStyle: "short" }
                        ).format(new Date(entry.revision.publishedAt))
                      : copy.notStated}
                  </dd>
                </div>
              </dl>
              <a
                className="mt-6 inline-flex max-w-full items-center gap-2 break-words text-sm font-semibold text-cyan-200 underline"
                href={entry.source.officialUrl}
                rel="noreferrer"
                target="_blank"
              >
                {copy.officialSource}
                <ExternalLink aria-hidden="true" className="size-4 shrink-0" />
              </a>
            </section>
          }
          description={text.summary}
          eyebrow={pageCopy.eyebrow}
          icon={BookOpenText}
          title={text.title}
          tone="navy"
        />
        <section className="bg-[#f4f6f9] px-5 py-12 sm:py-16 lg:px-8">
          <div className="mx-auto grid max-w-7xl gap-5 lg:grid-cols-[minmax(16rem,0.72fr)_minmax(0,1.28fr)]">
            <aside className="space-y-5">
              <div className="rounded-3xl bg-white p-6 ring-1 ring-slate-200">
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${statusClasses[entry.sourceStatus]}`}
                >
                  {getPolicySourceStatusLabel(entry.sourceStatus, locale)}
                </span>
                <p className="mt-4 text-sm text-slate-600">
                  {entry.source.category[locale]}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  {entry.source.jurisdiction}
                </p>
                <p className="mt-4 text-xs text-slate-500">
                  {entry.origin === "automated"
                    ? copy.liveOrigin
                    : copy.manualOrigin}{" "}
                  · {copy.revision} {entry.revision.number ?? "—"}
                </p>
                {entry.revision.generatedAt ? (
                  <p className="mt-1 text-xs text-slate-500">
                    {copy.generatedAt}:{" "}
                    {new Intl.DateTimeFormat(
                      locale === "zh-CN" ? "zh-CN" : "en-AU",
                      { dateStyle: "medium", timeStyle: "short" }
                    ).format(new Date(entry.revision.generatedAt))}
                  </p>
                ) : null}
              </div>
              <ImportancePanel policy={entry} />
              <section className="rounded-3xl border border-amber-200 bg-amber-50/70 p-6">
                <h2 className="flex items-center gap-2 font-semibold text-slate-900">
                  <UserRound
                    aria-hidden="true"
                    className="size-4 text-amber-700"
                  />
                  {copy.lawyerCommentary}
                </h2>
                <p className="mt-3 text-sm leading-6 text-slate-700">
                  {entry.lawyerCommentary?.[locale] || copy.lawyerAbsent}
                </p>
              </section>
            </aside>
            <div className="space-y-5">
              <section className="rounded-3xl bg-violet-50/70 p-6 ring-1 ring-violet-200 sm:p-8">
                <div className="flex items-center gap-2 font-semibold text-violet-950">
                  <Sparkles aria-hidden="true" className="size-4" />
                  {entry.aiGenerated ? copy.aiLabel : copy.manualSummary}
                </div>
                <p className="mt-2 text-xs leading-5 text-violet-900/80">
                  {entry.aiGenerated ? copy.aiDisclaimer : copy.manualOrigin}
                </p>
                <h2 className="mt-5 text-lg font-semibold text-slate-950">
                  {copy.sectionSummary}
                </h2>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-700">
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
              {entry.officialExcerpt ? (
                <section className="rounded-3xl bg-emerald-50 p-6 ring-1 ring-emerald-200">
                  <h2 className="font-semibold text-emerald-950">
                    {copy.officialSource}
                  </h2>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-emerald-900">
                    {entry.officialExcerpt.text}
                  </p>
                </section>
              ) : null}
              <section className="rounded-3xl bg-white p-6 ring-1 ring-slate-200 sm:p-8">
                <h2 className="text-xl font-semibold text-slate-950">
                  {copy.history}
                </h2>
                {entry.history.length <= 1 ? (
                  <p className="mt-3 text-sm text-slate-600">
                    {copy.noHistory}
                  </p>
                ) : (
                  <ol className="mt-5 space-y-4">
                    {entry.history.map((revision, index) => (
                      <li
                        className="flex gap-3 border-l border-slate-200 pl-4"
                        key={`${revision.revisionNumber}-${revision.publishedAt}`}
                      >
                        <span className="mt-1 size-2 shrink-0 rounded-full bg-[#123f70]" />
                        <div>
                          <p className="text-sm font-medium text-slate-900">
                            {index === 0 ? copy.current : copy.previous} ·{" "}
                            {copy.revision} {revision.revisionNumber}
                          </p>
                          <p className="mt-1 break-words text-sm text-slate-700">
                            {revision.title[locale]}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {revision.publishedAt
                              ? new Intl.DateTimeFormat(
                                  locale === "zh-CN" ? "zh-CN" : "en-AU",
                                  { dateStyle: "medium", timeStyle: "short" }
                                ).format(new Date(revision.publishedAt))
                              : copy.notStated}
                            {revision.editorialStatus === "superseded"
                              ? ` · ${copy.previous}`
                              : ""}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
                {entry.diff.length ? (
                  <div className="mt-7 border-t border-slate-100 pt-6">
                    <h3 className="font-semibold text-slate-900">
                      {copy.diff}
                    </h3>
                    <ul className="mt-4 space-y-4">
                      {entry.diff.map((change) => (
                        <li
                          className="rounded-2xl bg-slate-50 p-4"
                          key={`${change.section}-${change.unitId}`}
                        >
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            {copy[change.kind]} · {copy[change.section]}
                          </p>
                          {change.before ? (
                            <p className="mt-2 text-sm leading-6 text-slate-600">
                              − {change.before[locale]}
                            </p>
                          ) : null}
                          {change.after ? (
                            <p className="mt-2 text-sm leading-6 text-slate-800">
                              + {change.after[locale]}
                            </p>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </section>
              <section className="rounded-3xl bg-[#092c52] p-6 text-white sm:p-8">
                <h2 className="text-xl font-semibold">{copy.askAi}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  {copy.continuityNotice}
                </p>
                <Link
                  className="mt-5 inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-[#092c52] hover:bg-cyan-50"
                  href={policyWorkspaceHref(entry.slug)}
                >
                  {copy.askAi}
                  <ArrowUpRight aria-hidden="true" className="size-4" />
                </Link>
              </section>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </PublicPageFrame>
  );
}
