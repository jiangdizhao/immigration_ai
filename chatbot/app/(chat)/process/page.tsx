"use client";

import {
  ArrowRight,
  Bot,
  CheckCircle2,
  MessageSquareText,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import {
  PublicActionLink,
  PublicEditorialHero,
  PublicEyebrow,
  PublicPageFrame,
  PublicSectionHeading,
} from "@/components/public-page-primitives";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { useSiteLocale } from "@/components/site-locale-provider";
import { Button } from "@/components/ui/button";
import { getPublicPageContent, PUBLIC_ROUTES } from "@/lib/public-content";

export default function ProcessPage() {
  const { locale } = useSiteLocale();
  const content = getPublicPageContent(locale);

  return (
    <PublicPageFrame>
      <SiteHeader />
      <main>
        <PublicEditorialHero
          actions={
            <>
              <PublicActionLink
                href={PUBLIC_ROUTES.aiWorkspace}
                variant="purple"
              >
                {content.process.aiCta}
              </PublicActionLink>
              <Button
                asChild
                className="h-11 rounded-full bg-white px-5 text-[#092c52] ring-1 ring-slate-300/80 hover:bg-slate-50"
                variant="outline"
              >
                <Link href={PUBLIC_ROUTES.contact}>
                  {content.process.consultationCta}
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </>
          }
          aside={
            <div className="relative rounded-[2rem] bg-[#111b4d] p-6 text-white shadow-[0_30px_85px_-45px_rgba(61,38,150,0.75)] sm:p-8">
              <div className="absolute -right-10 -top-10 size-40 rounded-full bg-violet-500/25 blur-3xl" />
              <div className="relative">
                <div className="flex items-center justify-between gap-4 border-b border-white/15 pb-5">
                  <PublicEyebrow icon={Bot} tone="light">
                    {content.process.eyebrow}
                  </PublicEyebrow>
                  <span className="rounded-full bg-violet-400/15 px-3 py-1 text-xs text-violet-100 ring-1 ring-violet-300/20">
                    {content.process.consultationCta}
                  </span>
                </div>
                <div className="mt-6 grid gap-3">
                  {content.process.steps.map((step, index) => (
                    <div className="flex items-start gap-3" key={step.id}>
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white/10 font-mono text-xs text-cyan-100 ring-1 ring-white/10">
                        {index + 1}
                      </span>
                      <div className="min-w-0 pt-1">
                        <p className="text-sm font-medium text-white">
                          {step.title}
                        </p>
                        {index < content.process.steps.length - 1 ? (
                          <div className="mt-3 h-3 border-l border-dashed border-white/20" />
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          }
          description={content.process.description}
          eyebrow={content.process.eyebrow}
          icon={Bot}
          title={content.process.title}
          tone="purple"
        />

        <section className="bg-[#f4f6f9] px-5 py-20 sm:py-24 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="grid gap-8 lg:grid-cols-[0.72fr_1.28fr] lg:items-end lg:gap-16">
              <PublicSectionHeading
                eyebrow={content.process.eyebrow}
                title={content.process.title}
                tone="purple"
              />
              <p className="max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
                {content.process.description}
              </p>
            </div>

            <div className="relative mt-12 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              <div
                aria-hidden="true"
                className="absolute left-10 right-10 top-16 hidden border-t border-dashed border-violet-200 xl:block"
              />
              {content.process.steps.map((step, index) => (
                <article
                  className={`relative rounded-[1.75rem] bg-white p-6 shadow-[0_18px_55px_-34px_rgba(15,23,42,0.7)] ring-1 ring-slate-200/70 transition duration-300 hover:-translate-y-1 hover:shadow-[0_24px_70px_-34px_rgba(15,23,42,0.8)] ${index === 3 ? "xl:col-start-2" : ""}`}
                  key={step.id}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex size-12 items-center justify-center rounded-2xl bg-violet-100 text-violet-800 ring-1 ring-violet-200/70">
                      <MessageSquareText className="size-5" />
                    </div>
                    <span className="font-mono text-xs font-semibold tracking-[0.2em] text-slate-300">
                      {step.number}
                    </span>
                  </div>
                  <h2 className="mt-7 text-xl font-semibold leading-snug tracking-[-0.02em] text-slate-950">
                    {step.title}
                  </h2>
                  <p className="mt-3 text-sm leading-7 text-slate-600">
                    {step.description}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-white px-5 pb-20 sm:pb-24 lg:px-8">
          <div className="mx-auto max-w-7xl overflow-hidden rounded-[2.5rem] bg-[#111b4d] shadow-[0_30px_90px_-48px_rgba(17,27,77,0.8)]">
            <div className="grid lg:grid-cols-[0.84fr_1.16fr]">
              <div className="p-8 text-white sm:p-10 lg:p-12">
                <PublicEyebrow icon={Bot} tone="light">
                  {content.process.boundaryEyebrow}
                </PublicEyebrow>
                <h2 className="mt-4 text-3xl font-semibold leading-tight tracking-[-0.04em] sm:text-4xl">
                  {content.process.boundaryTitle}
                </h2>
                <p className="mt-5 text-sm leading-7 text-slate-300 sm:text-base">
                  {content.process.boundaryDescription}
                </p>
                <div className="mt-8 flex items-center gap-3 text-sm text-violet-100">
                  <Bot className="size-5 text-violet-200" />
                  {content.process.aiCta}
                </div>
                <div className="mt-4 flex items-center gap-3 text-sm text-amber-100">
                  <UserRound className="size-5 text-amber-200" />
                  {content.process.consultationCta}
                </div>
              </div>
              <div className="bg-[#fffaf0] p-6 sm:p-8 lg:p-10">
                <div className="grid gap-4 sm:grid-cols-2">
                  {content.process.boundaryPoints.map((item) => (
                    <div
                      className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-amber-200/60"
                      key={item}
                    >
                      <CheckCircle2 className="size-5 text-[#9a6500]" />
                      <p className="mt-4 text-sm leading-7 text-slate-700">
                        {item}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="mt-4 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70 sm:flex sm:items-center sm:justify-between sm:gap-5">
                  <p className="font-semibold leading-6 text-slate-950">
                    {content.process.aiCta}
                  </p>
                  <div className="mt-4 flex flex-col gap-3 sm:mt-0 sm:flex-row">
                    <PublicActionLink
                      href={PUBLIC_ROUTES.aiWorkspace}
                      variant="purple"
                    >
                      {content.process.aiCta}
                    </PublicActionLink>
                    <Button
                      asChild
                      className="h-11 rounded-full"
                      variant="outline"
                    >
                      <Link href={PUBLIC_ROUTES.contact}>
                        {content.process.consultationCta}
                      </Link>
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </PublicPageFrame>
  );
}
