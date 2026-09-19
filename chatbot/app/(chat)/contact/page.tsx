"use client";

import {
  ArrowRight,
  CheckCircle2,
  MessageSquareMore,
  Scale,
  ShieldCheck,
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

export default function ContactPage() {
  const { locale } = useSiteLocale();
  const content = getPublicPageContent(locale);

  return (
    <PublicPageFrame>
      <SiteHeader />
      <main>
        <PublicEditorialHero
          actions={
            <PublicActionLink href={PUBLIC_ROUTES.aiWorkspace} variant="navy">
              {content.contact.aiCta}
            </PublicActionLink>
          }
          aside={
            <div className="rounded-[2rem] bg-[#fffaf0] p-6 shadow-[0_30px_85px_-45px_rgba(146,91,0,0.7)] ring-1 ring-amber-200/70 sm:p-8">
              <div className="flex items-center justify-between gap-4">
                <PublicEyebrow icon={Scale} tone="amber">
                  {content.contact.lawyerCardTitle}
                </PublicEyebrow>
                <div className="rounded-2xl bg-amber-100 p-3 text-amber-800 ring-1 ring-amber-200">
                  <Scale className="size-5" />
                </div>
              </div>
              <h2 className="mt-7 text-2xl font-semibold leading-tight tracking-[-0.03em] text-slate-950 sm:text-3xl">
                {content.contact.lawyerCardTitle}
              </h2>
              <p className="mt-4 text-sm leading-7 text-slate-600">
                {content.contact.lawyerCardDescription}
              </p>
              <div className="mt-6 rounded-2xl bg-white p-4 text-sm leading-6 text-slate-700 ring-1 ring-amber-200/60">
                {content.contact.lawyerCta}
              </div>
            </div>
          }
          description={content.contact.description}
          eyebrow={content.contact.eyebrow}
          icon={MessageSquareMore}
          title={content.contact.title}
          tone="amber"
        />

        <section className="bg-[#f4f6f9] px-5 py-20 sm:py-24 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="grid gap-6 lg:grid-cols-[0.76fr_1.24fr] lg:items-start lg:gap-8">
              <div className="grid gap-5">
                <article className="rounded-[1.75rem] bg-[#f3efff] p-6 shadow-[0_18px_50px_-38px_rgba(91,55,180,0.75)] ring-1 ring-violet-200/80 sm:p-7">
                  <div className="flex size-12 items-center justify-center rounded-2xl bg-violet-100 text-violet-800 ring-1 ring-violet-200">
                    <MessageSquareMore className="size-5" />
                  </div>
                  <PublicEyebrow className="mt-6" tone="purple">
                    {content.contact.aiCardTitle}
                  </PublicEyebrow>
                  <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
                    {content.contact.aiCardTitle}
                  </h2>
                  <p className="mt-3 text-sm leading-7 text-slate-600">
                    {content.contact.aiCardDescription}
                  </p>
                  <PublicActionLink
                    href={PUBLIC_ROUTES.aiWorkspace}
                    variant="purple"
                  >
                    {content.contact.aiCta}
                  </PublicActionLink>
                </article>

                <article className="rounded-[1.75rem] bg-[#fffaf0] p-6 shadow-[0_18px_50px_-38px_rgba(146,91,0,0.7)] ring-1 ring-amber-200/80 sm:p-7">
                  <div className="flex size-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-800 ring-1 ring-amber-200">
                    <Scale className="size-5" />
                  </div>
                  <PublicEyebrow className="mt-6" tone="amber">
                    {content.contact.lawyerCardTitle}
                  </PublicEyebrow>
                  <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
                    {content.contact.lawyerCardTitle}
                  </h2>
                  <p className="mt-3 text-sm leading-7 text-slate-600">
                    {content.contact.lawyerCardDescription}
                  </p>
                  <Button
                    asChild
                    className="mt-6 h-11 rounded-full bg-[#9a6500] px-5 text-white shadow-lg shadow-amber-900/15 hover:bg-[#7a4f00]"
                  >
                    <Link href={PUBLIC_ROUTES.aiWorkspace}>
                      {content.contact.lawyerCta}
                      <ArrowRight className="size-4" />
                    </Link>
                  </Button>
                </article>
              </div>

              <article className="rounded-[2rem] bg-[#092c52] p-7 text-white shadow-[0_30px_90px_-48px_rgba(9,44,82,0.85)] sm:p-9 lg:p-11">
                <PublicSectionHeading
                  dark
                  eyebrow={content.contact.readinessEyebrow}
                  title={content.contact.readinessTitle}
                  tone="navy"
                />
                <p className="mt-5 max-w-2xl text-sm leading-7 text-slate-300 sm:text-base">
                  {content.contact.readinessDescription}
                </p>

                <div className="mt-8 grid gap-3 sm:grid-cols-2">
                  {content.contact.readiness.map((item) => (
                    <div
                      className="flex items-start gap-3 rounded-2xl bg-white/[0.08] p-4 ring-1 ring-white/10"
                      key={item}
                    >
                      <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-cyan-200" />
                      <p className="text-sm leading-6 text-slate-100">{item}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-8 rounded-3xl bg-white/[0.08] p-5 ring-1 ring-white/10">
                  <div className="flex items-center gap-2 text-cyan-100">
                    <ShieldCheck className="size-4" />
                    <span className="text-sm font-medium text-white">
                      {content.contact.boundaryTitle}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-300">
                    {content.contact.boundaryDescription}
                  </p>
                </div>
              </article>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </PublicPageFrame>
  );
}
