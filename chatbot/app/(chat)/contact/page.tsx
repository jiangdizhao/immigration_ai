"use client";

import {
  ArrowRight,
  CheckCircle2,
  MessageSquareMore,
  Scale,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { useSiteLocale } from "@/components/site-locale-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getPublicPageContent, PUBLIC_ROUTES } from "@/lib/public-content";

export default function ContactPage() {
  const { locale } = useSiteLocale();
  const content = getPublicPageContent(locale);

  return (
    <div className="min-h-dvh bg-[#f8f9fa] text-slate-900">
      <SiteHeader />
      <main>
        <section className="relative overflow-hidden bg-[#001736] px-5 py-16 text-white lg:px-8">
          <div
            aria-hidden="true"
            className="absolute inset-0 opacity-34"
            style={{
              backgroundImage:
                "url('/images/sovereign-nexus/opera-house-hero.png')",
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,23,54,0.97),rgba(0,43,91,0.86),rgba(0,23,54,0.42))]" />
          <div className="relative mx-auto max-w-7xl">
            <Badge
              className="rounded-full border-white/15 bg-white/10 text-white hover:bg-white/10"
              variant="outline"
            >
              <MessageSquareMore className="mr-2 size-3.5 text-cyan-200" />
              {content.contact.eyebrow}
            </Badge>
            <h1 className="mt-5 max-w-4xl text-balance text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
              {content.contact.title}
            </h1>
            <p className="mt-5 max-w-3xl text-base leading-8 text-slate-200">
              {content.contact.description}
            </p>
          </div>
        </section>

        <section className="mx-auto grid max-w-7xl gap-6 px-5 py-16 lg:grid-cols-[0.92fr_1.08fr] lg:px-8">
          <div className="space-y-5">
            <Card className="rounded-[32px] border-slate-200 bg-white shadow-sm">
              <CardContent className="p-6">
                <div className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-[#001736] text-white">
                  <MessageSquareMore className="size-6" />
                </div>
                <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
                  {content.contact.aiCardTitle}
                </h2>
                <p className="mt-3 text-sm leading-7 text-slate-600">
                  {content.contact.aiCardDescription}
                </p>
                <Button
                  asChild
                  className="mt-5 rounded-full bg-[#001736] text-white hover:bg-[#002b5b]"
                >
                  <Link href={PUBLIC_ROUTES.aiWorkspace}>
                    {content.contact.aiCta}
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>

            <Card className="rounded-[32px] border-amber-200 bg-amber-50/70 shadow-sm">
              <CardContent className="p-6">
                <div className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-800">
                  <Scale className="size-6" />
                </div>
                <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
                  {content.contact.lawyerCardTitle}
                </h2>
                <p className="mt-3 text-sm leading-7 text-slate-600">
                  {content.contact.lawyerCardDescription}
                </p>
                <Button
                  asChild
                  className="mt-5 rounded-full bg-[#8a5a00] text-white hover:bg-[#704900]"
                >
                  <Link href={PUBLIC_ROUTES.aiWorkspace}>
                    {content.contact.lawyerCta}
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </div>

          <Card className="overflow-hidden rounded-[36px] border-0 bg-gradient-to-br from-[#001736] via-[#002b5b] to-[#1d0052] text-white shadow-[0_30px_110px_-42px_rgba(15,23,42,0.75)]">
            <CardContent className="p-8 lg:p-10">
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-cyan-200">
                {content.contact.readinessEyebrow}
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
                {content.contact.readinessTitle}
              </h2>
              <p className="mt-4 text-sm leading-7 text-slate-200">
                {content.contact.readinessDescription}
              </p>

              <div className="mt-7 grid gap-3">
                {content.contact.readiness.map((item) => (
                  <div
                    className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/10 p-4"
                    key={item}
                  >
                    <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-cyan-200" />
                    <p className="text-sm leading-6 text-slate-100">{item}</p>
                  </div>
                ))}
              </div>

              <div className="mt-8 rounded-2xl border border-white/10 bg-white/10 p-5">
                <div className="mb-2 flex items-center gap-2 text-cyan-200">
                  <ShieldCheck className="size-4" />
                  <span className="text-sm font-medium text-white">
                    {content.contact.boundaryTitle}
                  </span>
                </div>
                <p className="text-sm leading-6 text-slate-300">
                  {content.contact.boundaryDescription}
                </p>
              </div>
            </CardContent>
          </Card>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
