"use client";

import {
  ArrowUpRight,
  BookOpenText,
  CalendarDays,
  ExternalLink,
  FileText,
  Globe2,
  Search,
  ShieldCheck,
  Sparkles,
  Tag,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  formatPolicyDate,
  getPolicyEditorialStatusLabel,
  getPolicySourceStatusLabel,
  getPublishedPolicies,
  type PolicyEntry,
  type PolicySourceStatus,
} from "@/lib/policy-intelligence";
import { getPublicPageContent, PUBLIC_ROUTES } from "@/lib/public-content";
import {
  PublicActionLink,
  PublicEditorialHero,
  PublicEyebrow,
  PublicPageFrame,
  PublicSectionHeading,
} from "./public-page-primitives";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";
import { useSiteLocale } from "./site-locale-provider";
import { Button } from "./ui/button";

const sourceStatusClasses: Record<PolicySourceStatus, string> = {
  in_force: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  announced: "bg-sky-50 text-sky-800 ring-sky-200",
  proposed: "bg-amber-50 text-amber-800 ring-amber-200",
  consultation: "bg-violet-50 text-violet-800 ring-violet-200",
  superseded: "bg-slate-100 text-slate-700 ring-slate-200",
};

function StatusPill({
  entry,
  locale,
}: {
  entry: PolicyEntry;
  locale: "zh-CN" | "en";
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <span
        className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${sourceStatusClasses[entry.sourceStatus]}`}
      >
        {getPolicySourceStatusLabel(entry.sourceStatus, locale)}
      </span>
      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
        {getPolicyEditorialStatusLabel(entry.editorialStatus, locale)}
      </span>
    </div>
  );
}

function LayerLegend({
  content,
}: {
  content: ReturnType<typeof getPublicPageContent>["intelligence"];
}) {
  return (
    <div className="rounded-[2rem] bg-[#092c52] p-6 text-white shadow-[0_30px_85px_-45px_rgba(9,44,82,0.8)] sm:p-8">
      <div className="flex items-center justify-between gap-4 border-b border-white/15 pb-5">
        <div>
          <PublicEyebrow icon={BookOpenText} tone="light">
            {content.eyebrow}
          </PublicEyebrow>
          <p className="mt-3 text-2xl font-semibold tracking-tight">
            {content.title}
          </p>
        </div>
        <div className="rounded-2xl bg-white/10 p-3 text-cyan-200 ring-1 ring-white/10">
          <ShieldCheck className="size-5" />
        </div>
      </div>
      <div className="mt-5 grid gap-3">
        <div className="flex items-start gap-3 rounded-2xl bg-emerald-400/10 p-4 ring-1 ring-emerald-200/15">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-200" />
          <div>
            <p className="text-sm font-semibold text-white">
              {content.officialSource}
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-300">
              {content.sourceStatus}
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3 rounded-2xl bg-violet-400/10 p-4 ring-1 ring-violet-200/15">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-violet-200" />
          <div>
            <p className="text-sm font-semibold text-white">
              {content.analysisTitle}
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-300">
              {content.analysisTitle}
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3 rounded-2xl bg-amber-300/10 p-4 ring-1 ring-amber-100/15">
          <UserRound className="mt-0.5 size-4 shrink-0 text-amber-200" />
          <div>
            <p className="text-sm font-semibold text-white">
              {content.lawyerTitle}
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-300">
              {content.lawyerTitle}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function PolicyCard({
  entry,
  locale,
  content,
}: {
  entry: PolicyEntry;
  locale: "zh-CN" | "en";
  content: ReturnType<typeof getPublicPageContent>["intelligence"];
}) {
  const copy = entry.copy[locale];

  return (
    <article className="group flex min-w-0 flex-col rounded-[1.75rem] bg-white p-6 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.75)] ring-1 ring-slate-200/70 transition duration-300 hover:-translate-y-1 hover:shadow-[0_28px_75px_-40px_rgba(15,23,42,0.85)] sm:p-7">
      <div className="flex items-start justify-between gap-4">
        <StatusPill entry={entry} locale={locale} />
        <BookOpenText className="size-5 shrink-0 text-[#123f70]" />
      </div>
      <h2 className="mt-6 break-words text-2xl font-semibold leading-tight tracking-[-0.035em] text-slate-950">
        {copy.title}
      </h2>
      <p className="mt-4 line-clamp-4 text-sm leading-7 text-slate-600">
        {copy.summary}
      </p>
      <div className="mt-6 grid gap-3 border-t border-slate-100 pt-5 text-sm text-slate-600">
        <div className="flex min-w-0 items-start gap-3">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-700" />
          <span className="min-w-0 break-words">{entry.source.authority}</span>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="size-3.5" />
            {formatPolicyDate(entry.source.sourceDate, locale)}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Tag className="size-3.5" />
            {entry.source.category}
          </span>
        </div>
      </div>
      {copy.affectedGroup ? (
        <p className="mt-5 text-sm leading-6 text-slate-600">
          <span className="font-semibold text-slate-900">
            {copy.affectedGroup}
          </span>
        </p>
      ) : null}
      {copy.practicalRelevance ? (
        <div className="mt-4 rounded-2xl bg-[#f4f6f9] p-4 text-sm leading-6 text-slate-700">
          {copy.practicalRelevance}
        </div>
      ) : null}
      <div className="mt-auto pt-6">
        <Button
          asChild
          className="h-10 rounded-full bg-[#092c52] px-4 text-sm text-white hover:bg-[#123f70]"
        >
          <Link href={`${PUBLIC_ROUTES.intelligence}/${entry.slug}`}>
            {content.viewDetails}
            <ArrowUpRight className="size-4" />
          </Link>
        </Button>
      </div>
    </article>
  );
}

export function PolicyIntelligencePage() {
  const { locale } = useSiteLocale();
  const content = getPublicPageContent(locale).intelligence;
  const policies = getPublishedPolicies();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const categories = useMemo(
    () => [...new Set(policies.map((entry) => entry.source.category))].sort(),
    [policies]
  );
  const filteredPolicies = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return policies.filter((entry) => {
      const copy = entry.copy[locale];
      const searchable = [
        copy.title,
        copy.summary,
        entry.source.authority,
        entry.source.category,
      ]
        .join(" ")
        .toLocaleLowerCase();
      return (
        (!normalizedQuery || searchable.includes(normalizedQuery)) &&
        (!category || entry.source.category === category)
      );
    });
  }, [category, locale, policies, query]);

  return (
    <PublicPageFrame>
      <SiteHeader />
      <main>
        <PublicEditorialHero
          aside={<LayerLegend content={content} />}
          description={content.description}
          eyebrow={content.eyebrow}
          icon={BookOpenText}
          title={content.title}
          tone="navy"
        />

        <section className="bg-[#f4f6f9] px-5 py-20 sm:py-24 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
              <PublicSectionHeading
                description={content.description}
                eyebrow={content.eyebrow}
                title={content.title}
                tone="navy"
              />
              {policies.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-[minmax(15rem,1fr)_auto]">
                  <label className="relative block">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                    <span className="sr-only">{content.searchPlaceholder}</span>
                    <input
                      className="h-11 w-full rounded-full border-0 bg-white pl-10 pr-4 text-sm text-slate-900 shadow-sm ring-1 ring-slate-200 outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-[#123f70]"
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder={content.searchPlaceholder}
                      type="search"
                      value={query}
                    />
                  </label>
                  <label className="sr-only" htmlFor="policy-category">
                    {content.allCategories}
                  </label>
                  <select
                    className="h-11 rounded-full border-0 bg-white px-4 text-sm text-slate-700 shadow-sm ring-1 ring-slate-200 outline-none focus:ring-2 focus:ring-[#123f70]"
                    id="policy-category"
                    onChange={(event) => setCategory(event.target.value)}
                    value={category}
                  >
                    <option value="">{content.allCategories}</option>
                    {categories.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
            </div>

            {filteredPolicies.length > 0 ? (
              <div className="mt-12 grid gap-5 lg:grid-cols-2">
                {filteredPolicies.map((entry) => (
                  <PolicyCard
                    content={content}
                    entry={entry}
                    key={entry.id}
                    locale={locale}
                  />
                ))}
              </div>
            ) : (
              <div className="mt-12 rounded-[2rem] bg-white p-8 text-center shadow-[0_20px_60px_-45px_rgba(15,23,42,0.8)] ring-1 ring-slate-200/70 sm:p-14">
                <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-[#e7eef7] text-[#123f70]">
                  <FileText className="size-6" />
                </div>
                <h2 className="mx-auto mt-6 max-w-2xl break-words text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
                  {policies.length > 0 ? content.noResults : content.emptyTitle}
                </h2>
                <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
                  {policies.length > 0
                    ? content.noResults
                    : content.emptyDescription}
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

export function PolicyIntelligenceDetail({ entry }: { entry: PolicyEntry }) {
  const { locale } = useSiteLocale();
  const content = getPublicPageContent(locale).intelligence;
  const copy = entry.copy[locale];

  return (
    <PublicPageFrame>
      <SiteHeader />
      <main>
        <PublicEditorialHero
          actions={
            <PublicActionLink href={PUBLIC_ROUTES.intelligence} variant="navy">
              {content.backToList}
            </PublicActionLink>
          }
          aside={
            <div className="rounded-[2rem] bg-[#092c52] p-6 text-white shadow-[0_30px_85px_-45px_rgba(9,44,82,0.8)] sm:p-8">
              <PublicEyebrow icon={ShieldCheck} tone="light">
                {content.officialSource}
              </PublicEyebrow>
              <h2 className="mt-4 break-words text-2xl font-semibold tracking-tight">
                {entry.source.officialTitle}
              </h2>
              <p className="mt-4 break-words text-sm leading-7 text-slate-300">
                {entry.source.authority}
              </p>
              <a
                className="mt-6 inline-flex max-w-full items-center gap-2 break-words text-sm font-semibold text-cyan-200 underline decoration-cyan-200/40 underline-offset-4 hover:text-white"
                href={entry.source.officialUrl}
                rel="noreferrer"
                target="_blank"
              >
                <span>{content.officialSource}</span>
                <ExternalLink className="size-4 shrink-0" />
              </a>
            </div>
          }
          description={copy.summary}
          eyebrow={content.eyebrow}
          icon={BookOpenText}
          title={copy.title}
          tone="navy"
        />

        <section className="bg-[#f4f6f9] px-5 py-20 sm:py-24 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="grid gap-5 lg:grid-cols-[0.82fr_1.18fr]">
              <div className="rounded-[1.75rem] bg-white p-6 shadow-sm ring-1 ring-slate-200/70 sm:p-8">
                <div className="flex flex-wrap gap-2">
                  <StatusPill entry={entry} locale={locale} />
                </div>
                <dl className="mt-7 grid gap-5 text-sm">
                  <DetailField
                    label={content.authority}
                    value={entry.source.authority}
                  />
                  <DetailField
                    label={content.sourceDate}
                    value={formatPolicyDate(entry.source.sourceDate, locale)}
                  />
                  {entry.source.effectiveDate ? (
                    <DetailField
                      label={content.effectiveDate}
                      value={formatPolicyDate(
                        entry.source.effectiveDate,
                        locale
                      )}
                    />
                  ) : null}
                  <DetailField
                    label={content.jurisdiction}
                    value={entry.source.jurisdiction}
                  />
                  <DetailField
                    label={content.category}
                    value={entry.source.category}
                  />
                </dl>
              </div>

              <div className="grid gap-5">
                <DetailLayer
                  body={copy.aiAnalysis}
                  empty={content.analysisEmpty}
                  icon={Sparkles}
                  title={content.analysisTitle}
                  tone="purple"
                />
                <DetailLayer
                  body={copy.practicalRelevance}
                  empty={content.impactEmpty}
                  icon={Globe2}
                  title={content.impactTitle}
                  tone="navy"
                />
                <DetailLayer
                  body={entry.lawyerCommentary?.[locale]}
                  empty={content.lawyerEmpty}
                  icon={UserRound}
                  title={content.lawyerTitle}
                  tone="amber"
                />
              </div>
            </div>

            {copy.officialExcerpt ? (
              <div className="mt-5 rounded-[1.75rem] bg-emerald-50 p-6 text-sm leading-7 text-emerald-950 ring-1 ring-emerald-200/70 sm:p-8">
                <div className="flex items-center gap-2 font-semibold">
                  <ShieldCheck className="size-4" />
                  {content.officialSource}
                </div>
                <p className="mt-4 whitespace-pre-wrap">
                  {copy.officialExcerpt}
                </p>
              </div>
            ) : null}
          </div>
        </section>
      </main>
      <SiteFooter />
    </PublicPageFrame>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 border-b border-slate-100 pb-4 last:border-b-0 last:pb-0">
      <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
        {label}
      </dt>
      <dd className="mt-2 break-words font-medium leading-6 text-slate-800">
        {value}
      </dd>
    </div>
  );
}

function DetailLayer({
  body,
  empty,
  icon: Icon,
  title,
  tone,
}: {
  body?: string;
  empty: string;
  icon: typeof Sparkles;
  title: string;
  tone: "navy" | "purple" | "amber";
}) {
  const styles = {
    navy: {
      icon: "bg-[#e7eef7] text-[#123f70]",
      surface: "bg-white ring-slate-200/70",
    },
    purple: {
      icon: "bg-violet-100 text-violet-700",
      surface: "bg-violet-50/60 ring-violet-200/70",
    },
    amber: {
      icon: "bg-amber-100 text-amber-800",
      surface: "bg-amber-50/70 ring-amber-200/70",
    },
  }[tone];

  return (
    <section
      className={`rounded-[1.75rem] p-6 shadow-sm ring-1 sm:p-8 ${styles.surface}`}
    >
      <div className="flex items-center gap-3">
        <div
          className={`flex size-10 items-center justify-center rounded-xl ${styles.icon}`}
        >
          <Icon className="size-5" />
        </div>
        <h2 className="text-xl font-semibold tracking-tight text-slate-950">
          {title}
        </h2>
      </div>
      <p
        className={`mt-5 text-sm leading-7 ${body ? "text-slate-700" : "text-slate-500"}`}
      >
        {body ?? empty}
      </p>
    </section>
  );
}
