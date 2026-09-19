"use client";

import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  CheckCircle2,
  FileText,
  Globe2,
  HeartHandshake,
  Landmark,
  MessageSquareMore,
  Scale,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import {
  getPublicPageContent,
  getPublicServiceCatalog,
  getPublicTeamPlaceholders,
  PUBLIC_ROUTES,
  type PublicServiceIcon,
} from "@/lib/public-content";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";
import { useSiteLocale } from "./site-locale-provider";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

const serviceIcons: Record<PublicServiceIcon, LucideIcon> = {
  study: Globe2,
  skilled: Landmark,
  family: HeartHandshake,
  review: Scale,
  residence: ShieldCheck,
  complex: FileText,
};

export function ImmigrationServiceHome() {
  const { locale } = useSiteLocale();
  const content = getPublicPageContent(locale);
  const services = getPublicServiceCatalog(locale);
  const team = getPublicTeamPlaceholders(locale);

  return (
    <div className="min-h-dvh bg-[#f8f9fa] text-slate-900">
      <SiteHeader />

      <main>
        <section className="relative isolate overflow-hidden bg-[#001736] text-white">
          <div
            aria-hidden="true"
            className="absolute inset-0 -z-20 bg-cover bg-center"
            style={{
              backgroundImage:
                "url('/images/sovereign-nexus/opera-house-hero.png'), url('/images/sovereign-nexus/5.png')",
            }}
          />
          <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(0,23,54,0.97)_0%,rgba(0,23,54,0.88)_44%,rgba(0,43,91,0.58)_76%,rgba(0,23,54,0.22)_100%)]" />
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_78%_26%,rgba(125,211,252,0.28),transparent_32%),radial-gradient(circle_at_86%_80%,rgba(168,85,247,0.22),transparent_34%)]" />

          <div className="mx-auto grid w-full max-w-7xl gap-12 px-5 py-16 lg:grid-cols-[1.02fr_0.98fr] lg:px-8 lg:py-24">
            <div className="max-w-4xl">
              <Badge
                className="mb-5 rounded-full border-white/15 bg-white/10 px-4 py-1.5 text-white hover:bg-white/10"
                variant="outline"
              >
                <Sparkles className="mr-2 size-3.5 text-cyan-200" />
                {content.home.hero.eyebrow}
              </Badge>

              <h1 className="max-w-5xl text-balance text-5xl font-semibold tracking-tight sm:text-6xl lg:text-7xl">
                {content.home.hero.title}
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-8 text-slate-200 sm:text-lg">
                {content.home.hero.description}
              </p>

              <div className="mt-8 flex flex-col gap-4 sm:flex-row">
                <Button
                  asChild
                  className="h-12 rounded-full bg-white px-6 text-[#001736] hover:bg-slate-100"
                >
                  <Link href={PUBLIC_ROUTES.aiWorkspace}>
                    {content.home.hero.aiCta}
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
                <Button
                  asChild
                  className="h-12 rounded-full border-white/20 bg-white/10 px-6 text-white hover:bg-white/15"
                  variant="outline"
                >
                  <Link href={PUBLIC_ROUTES.contact}>
                    {content.home.hero.consultationCta}
                  </Link>
                </Button>
              </div>

              <div className="mt-10 grid gap-3 sm:grid-cols-3">
                {content.home.hero.notes.map((note) => (
                  <div
                    className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-slate-100 backdrop-blur"
                    key={note}
                  >
                    {note}
                  </div>
                ))}
              </div>
            </div>

            <div className="relative hidden lg:block">
              <div className="absolute -left-8 top-12 h-64 w-64 rounded-full bg-cyan-300/20 blur-3xl" />
              <div className="absolute -right-8 bottom-8 h-72 w-72 rounded-full bg-purple-400/20 blur-3xl" />
              <Card className="relative overflow-hidden rounded-[40px] border-white/15 bg-white/10 text-white shadow-[0_40px_120px_-40px_rgba(0,0,0,0.8)] backdrop-blur-2xl">
                <CardContent className="p-6">
                  <div className="rounded-[32px] border border-white/10 bg-[#001736]/80 p-5">
                    <div className="mb-5 flex items-center justify-between gap-4">
                      <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-cyan-200">
                          {content.home.hero.preview.eyebrow}
                        </p>
                        <h2 className="mt-2 text-2xl font-semibold">
                          {content.home.hero.preview.title}
                        </h2>
                      </div>
                      <div className="rounded-2xl bg-cyan-300/15 p-3 text-cyan-100">
                        <MessageSquareMore className="size-6" />
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="max-w-[88%] rounded-3xl bg-white/10 p-4 text-sm leading-7 text-slate-200">
                        {content.home.hero.preview.question}
                      </div>
                      <div className="ml-auto max-w-[90%] rounded-3xl bg-cyan-300/16 p-4 text-sm leading-7 text-cyan-50">
                        {content.home.hero.preview.answer}
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                          <p className="font-medium">
                            {content.home.hero.preview.contextTitle}
                          </p>
                          <p className="mt-2 text-sm leading-6 text-slate-300">
                            {content.home.hero.preview.contextDescription}
                          </p>
                        </div>
                        <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                          <p className="font-medium">
                            {content.home.hero.preview.lawyerTitle}
                          </p>
                          <p className="mt-2 text-sm leading-6 text-slate-300">
                            {content.home.hero.preview.lawyerDescription}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-16 lg:px-8">
          <div className="mb-9 grid gap-6 lg:grid-cols-[0.82fr_1.18fr] lg:items-end">
            <div>
              <p className="mb-3 text-sm font-semibold uppercase tracking-[0.22em] text-[#002b5b]">
                {content.home.services.eyebrow}
              </p>
              <h2 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                {content.home.services.title}
              </h2>
            </div>
            <p className="max-w-3xl text-sm leading-7 text-slate-600 sm:text-base">
              {content.home.services.description}
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {services.map((service) => {
              const Icon = serviceIcons[service.icon];
              return (
                <Card
                  className="group rounded-[32px] border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl"
                  key={service.id}
                >
                  <CardHeader className="pb-3">
                    <div className="mb-4 inline-flex w-fit rounded-2xl bg-[#001736] p-3 text-white shadow-sm transition group-hover:bg-[#002b5b]">
                      <Icon className="size-5" />
                    </div>
                    <CardTitle className="text-xl text-slate-950">
                      {service.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-5 text-sm leading-7 text-slate-600">
                    <p>{service.summary}</p>
                    <Button
                      asChild
                      className="rounded-full bg-slate-100 text-[#001736] hover:bg-slate-200"
                      variant="secondary"
                    >
                      <Link href={PUBLIC_ROUTES.services}>
                        {content.home.services.cardCta}
                        <ArrowRight className="size-4" />
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 pb-16 lg:px-8">
          <div className="grid gap-8 overflow-hidden rounded-[44px] bg-white shadow-[0_24px_100px_-44px_rgba(15,23,42,0.45)] lg:grid-cols-[0.82fr_1.18fr]">
            <div className="bg-[#001736] p-8 text-white lg:p-10">
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-cyan-200">
                {content.home.journey.eyebrow}
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
                {content.home.journey.title}
              </h2>
              <p className="mt-4 text-sm leading-7 text-slate-300">
                {content.home.journey.description}
              </p>
            </div>
            <div className="grid gap-4 p-6 sm:grid-cols-2 lg:p-8">
              {content.home.journey.steps.map((step) => (
                <div
                  className="rounded-[28px] border border-slate-200 bg-slate-50 p-5"
                  key={step.id}
                >
                  <span className="text-sm font-semibold text-[#002b5b]">
                    {step.number}
                  </span>
                  <h3 className="mt-3 font-semibold text-slate-950">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {step.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 pb-16 lg:px-8">
          <div className="mb-8 max-w-3xl">
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.22em] text-[#8a5a00]">
              {content.home.team.eyebrow}
            </p>
            <h2 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
              {content.home.team.title}
            </h2>
            <p className="mt-4 text-sm leading-7 text-slate-600 sm:text-base">
              {content.home.team.description}
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            {team.map((profile) => (
              <Card
                className="rounded-[32px] border-amber-200 bg-amber-50/60 shadow-sm"
                key={profile.id}
              >
                <CardContent className="flex gap-4 p-6">
                  <div className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-800">
                    <UserRound className="size-7" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-800">
                      {profile.status}
                    </p>
                    <h3 className="mt-2 text-xl font-semibold text-slate-950">
                      {profile.name}
                    </h3>
                    <p className="mt-1 text-sm font-medium text-slate-700">
                      {profile.role}
                    </p>
                    <p className="mt-3 text-sm leading-6 text-slate-600">
                      {profile.focus}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 pb-20 lg:px-8">
          <div className="grid gap-6 rounded-[40px] border border-slate-200 bg-white p-7 shadow-sm lg:grid-cols-[0.8fr_1.2fr] lg:p-10">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#002b5b]">
                {content.home.trust.eyebrow}
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
                {content.home.trust.title}
              </h2>
            </div>
            <div className="flex items-start gap-3 rounded-3xl bg-slate-50 p-6">
              <CheckCircle2 className="mt-1 size-5 shrink-0 text-[#002b5b]" />
              <p className="text-sm leading-7 text-slate-700 sm:text-base">
                {content.home.trust.description}
              </p>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
