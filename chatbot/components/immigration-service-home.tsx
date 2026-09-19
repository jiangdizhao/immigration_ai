"use client";

import {
  ArrowUpRight,
  CheckCircle2,
  FileText,
  MessageSquareMore,
  Sparkles,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import {
  getPublicPageContent,
  getPublicServiceCatalog,
  getPublicTeamPlaceholders,
  PUBLIC_ROUTES,
} from "@/lib/public-content";
import {
  PublicActionLink,
  PublicEyebrow,
  PublicPageFrame,
  PublicSectionHeading,
  PublicServiceCard,
} from "./public-page-primitives";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";
import { useSiteLocale } from "./site-locale-provider";
import { Button } from "./ui/button";

export function ImmigrationServiceHome() {
  const { locale } = useSiteLocale();
  const content = getPublicPageContent(locale);
  const services = getPublicServiceCatalog(locale);
  const team = getPublicTeamPlaceholders(locale);

  return (
    <PublicPageFrame>
      <SiteHeader />

      <main>
        <section className="relative isolate overflow-hidden bg-[#061d3a] text-white">
          <div
            aria-hidden="true"
            className="absolute inset-0 -z-20 bg-cover bg-[center_38%] opacity-70"
            style={{
              backgroundImage:
                "url('/images/sovereign-nexus/opera-house-hero.png')",
            }}
          />
          <div className="absolute inset-0 -z-10 bg-[linear-gradient(108deg,rgba(3,21,46,0.98)_4%,rgba(6,29,58,0.9)_45%,rgba(15,47,88,0.63)_78%,rgba(6,29,58,0.84)_100%)]" />
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_77%_22%,rgba(139,92,246,0.28),transparent_25%),radial-gradient(circle_at_70%_90%,rgba(56,189,248,0.16),transparent_30%)]" />

          <div className="mx-auto grid w-full max-w-7xl gap-12 px-5 py-16 sm:py-20 lg:grid-cols-[minmax(0,0.98fr)_minmax(22rem,0.82fr)] lg:items-center lg:gap-16 lg:px-8 lg:py-24">
            <div className="min-w-0">
              <div className="inline-flex rounded-full bg-white/10 px-3 py-2 ring-1 ring-white/15 backdrop-blur">
                <PublicEyebrow icon={Sparkles} tone="light">
                  {content.home.hero.eyebrow}
                </PublicEyebrow>
              </div>
              <h1 className="mt-6 max-w-3xl text-pretty text-5xl font-semibold leading-[1.08] tracking-[-0.06em] text-white sm:text-6xl lg:text-7xl">
                {content.home.hero.title}
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-8 text-slate-200 sm:text-lg">
                {content.home.hero.description}
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <PublicActionLink
                  href={PUBLIC_ROUTES.aiWorkspace}
                  variant="light"
                >
                  {content.home.hero.aiCta}
                </PublicActionLink>
                <Button
                  asChild
                  className="h-11 rounded-full border-white/20 bg-white/10 px-5 text-white hover:bg-white/15"
                  variant="outline"
                >
                  <Link href={PUBLIC_ROUTES.contact}>
                    {content.home.hero.consultationCta}
                    <ArrowUpRight className="size-4" />
                  </Link>
                </Button>
              </div>

              <div className="mt-10 grid gap-3 sm:grid-cols-3">
                {content.home.hero.notes.map((note) => (
                  <div
                    className="rounded-2xl bg-white/[0.08] px-4 py-3 text-sm leading-6 text-slate-100 ring-1 ring-white/10 backdrop-blur"
                    key={note}
                  >
                    {note}
                  </div>
                ))}
              </div>
            </div>

            <div className="relative min-w-0 lg:pl-4">
              <div className="absolute -left-10 top-8 size-48 rounded-full bg-violet-400/20 blur-3xl" />
              <div className="absolute -right-10 bottom-4 size-56 rounded-full bg-cyan-300/15 blur-3xl" />
              <div className="relative rounded-[2rem] bg-white/[0.09] p-2 shadow-[0_32px_100px_-35px_rgba(0,0,0,0.9)] ring-1 ring-white/15 backdrop-blur-xl sm:p-3">
                <div className="rounded-[1.55rem] bg-[#061d3a]/90 p-5 ring-1 ring-white/10 sm:p-6">
                  <div className="flex items-start justify-between gap-5 border-b border-white/10 pb-5">
                    <div>
                      <PublicEyebrow icon={MessageSquareMore} tone="light">
                        {content.home.hero.preview.eyebrow}
                      </PublicEyebrow>
                      <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                        {content.home.hero.preview.title}
                      </h2>
                    </div>
                    <div className="rounded-2xl bg-violet-400/15 p-3 text-violet-200 ring-1 ring-violet-300/20">
                      <Sparkles className="size-5" />
                    </div>
                  </div>

                  <div className="space-y-3 pt-5">
                    <div className="max-w-[90%] rounded-2xl rounded-tl-md bg-white/[0.08] p-4 text-sm leading-7 text-slate-200">
                      {content.home.hero.preview.question}
                    </div>
                    <div className="ml-auto max-w-[92%] rounded-2xl rounded-tr-md bg-violet-400/15 p-4 text-sm leading-7 text-violet-50 ring-1 ring-violet-300/15">
                      {content.home.hero.preview.answer}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl bg-white/[0.06] p-4 ring-1 ring-white/10">
                        <div className="flex items-center gap-2 text-sm font-medium text-white">
                          <FileText className="size-4 text-cyan-200" />
                          {content.home.hero.preview.contextTitle}
                        </div>
                        <p className="mt-2 text-sm leading-6 text-slate-300">
                          {content.home.hero.preview.contextDescription}
                        </p>
                      </div>
                      <div className="rounded-2xl bg-amber-300/10 p-4 ring-1 ring-amber-200/15">
                        <div className="flex items-center gap-2 text-sm font-medium text-white">
                          <UserRound className="size-4 text-amber-200" />
                          {content.home.hero.preview.lawyerTitle}
                        </div>
                        <p className="mt-2 text-sm leading-6 text-slate-300">
                          {content.home.hero.preview.lawyerDescription}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-[#f4f6f9] px-5 py-20 sm:py-24 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-end lg:gap-16">
              <PublicSectionHeading
                eyebrow={content.home.services.eyebrow}
                title={content.home.services.title}
                tone="navy"
              />
              <p className="max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
                {content.home.services.description}
              </p>
            </div>

            <div className="mt-12 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {services.map((service, index) => (
                <PublicServiceCard
                  cta={content.home.services.cardCta}
                  href={PUBLIC_ROUTES.services}
                  index={index + 1}
                  key={service.id}
                  service={service}
                />
              ))}
            </div>
          </div>
        </section>

        <section className="bg-white px-5 py-20 sm:py-24 lg:px-8">
          <div className="mx-auto max-w-7xl overflow-hidden rounded-[2.5rem] bg-[#092c52] shadow-[0_30px_90px_-48px_rgba(9,44,82,0.8)]">
            <div className="grid lg:grid-cols-[0.72fr_1.28fr]">
              <div className="relative overflow-hidden p-8 text-white sm:p-10 lg:p-12">
                <div className="absolute -right-20 -top-20 size-64 rounded-full bg-violet-500/20 blur-3xl" />
                <div className="relative">
                  <PublicEyebrow tone="light">
                    {content.home.journey.eyebrow}
                  </PublicEyebrow>
                  <h2 className="mt-4 text-3xl font-semibold leading-tight tracking-[-0.04em] sm:text-4xl">
                    {content.home.journey.title}
                  </h2>
                  <p className="mt-5 text-sm leading-7 text-slate-300 sm:text-base">
                    {content.home.journey.description}
                  </p>
                </div>
              </div>
              <div className="grid gap-4 bg-[#edf2f7] p-6 sm:grid-cols-2 sm:p-8">
                {content.home.journey.steps.map((step) => (
                  <div
                    className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70 transition hover:-translate-y-0.5 hover:shadow-md"
                    key={step.id}
                  >
                    <span className="font-mono text-xs font-semibold tracking-[0.2em] text-violet-700">
                      {step.number}
                    </span>
                    <h3 className="mt-4 font-semibold leading-6 text-slate-950">
                      {step.title}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      {step.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="bg-[#f4f6f9] px-5 py-20 sm:py-24 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <PublicSectionHeading
              description={content.home.team.description}
              eyebrow={content.home.team.eyebrow}
              title={content.home.team.title}
              tone="amber"
            />
            <div className="mt-10 grid gap-5 md:grid-cols-2">
              {team.map((profile) => (
                <article
                  className="flex min-w-0 gap-5 rounded-[1.75rem] bg-[#fff8eb] p-6 shadow-[0_18px_50px_-38px_rgba(146,91,0,0.7)] ring-1 ring-amber-200/70 sm:p-7"
                  key={profile.id}
                >
                  <div className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-800 ring-1 ring-amber-200">
                    <UserRound className="size-7" />
                  </div>
                  <div className="min-w-0">
                    <PublicEyebrow tone="amber">{profile.status}</PublicEyebrow>
                    <h3 className="mt-3 text-xl font-semibold tracking-tight text-slate-950">
                      {profile.name}
                    </h3>
                    <p className="mt-1 text-sm font-medium text-slate-700">
                      {profile.role}
                    </p>
                    <p className="mt-3 text-sm leading-6 text-slate-600">
                      {profile.focus}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-[#061d3a] px-5 py-20 text-white sm:py-24 lg:px-8">
          <div className="mx-auto grid max-w-7xl gap-8 rounded-[2.5rem] bg-white/[0.06] p-7 ring-1 ring-white/10 sm:p-10 lg:grid-cols-[0.76fr_1.24fr] lg:items-center lg:p-12">
            <PublicSectionHeading
              dark
              eyebrow={content.home.trust.eyebrow}
              title={content.home.trust.title}
            />
            <div className="flex items-start gap-4 rounded-3xl bg-white/[0.08] p-6 ring-1 ring-white/10">
              <CheckCircle2 className="mt-1 size-5 shrink-0 text-cyan-200" />
              <p className="text-sm leading-7 text-slate-200 sm:text-base">
                {content.home.trust.description}
              </p>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </PublicPageFrame>
  );
}
