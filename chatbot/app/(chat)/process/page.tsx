"use client";

import { ArrowRight, Bot, CheckCircle2, MessageSquareText } from "lucide-react";
import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { useSiteLocale } from "@/components/site-locale-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getPublicPageContent, PUBLIC_ROUTES } from "@/lib/public-content";

export default function ProcessPage() {
  const { locale } = useSiteLocale();
  const content = getPublicPageContent(locale);

  return (
    <div className="min-h-dvh bg-[#f8f9fa] text-slate-900">
      <SiteHeader />
      <main>
        <section className="relative overflow-hidden bg-[#001736] px-5 py-16 text-white lg:px-8">
          <div
            aria-hidden="true"
            className="absolute inset-0 opacity-28"
            style={{
              backgroundImage:
                "url('/images/sovereign-nexus/ai-orbital-bg.png')",
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(125,211,252,0.25),transparent_34%),linear-gradient(90deg,rgba(0,23,54,0.98),rgba(0,43,91,0.86),rgba(29,0,82,0.68))]" />
          <div className="relative mx-auto max-w-7xl">
            <Badge
              className="rounded-full border-white/15 bg-white/10 text-white hover:bg-white/10"
              variant="outline"
            >
              <Bot className="mr-2 size-3.5 text-cyan-200" />
              {content.process.eyebrow}
            </Badge>
            <h1 className="mt-5 max-w-4xl text-balance text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
              {content.process.title}
            </h1>
            <p className="mt-5 max-w-3xl text-base leading-8 text-slate-200">
              {content.process.description}
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-16 lg:px-8">
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {content.process.steps.map((step) => (
              <Card
                className="rounded-[32px] border-slate-200 bg-white shadow-sm"
                key={step.id}
              >
                <CardContent className="p-6">
                  <div className="mb-5 flex items-center justify-between gap-4">
                    <div className="flex size-14 items-center justify-center rounded-2xl bg-[#001736] text-white">
                      <MessageSquareText className="size-6" />
                    </div>
                    <span className="text-3xl font-semibold text-slate-200">
                      {step.number}
                    </span>
                  </div>
                  <h2 className="text-xl font-semibold text-slate-950">
                    {step.title}
                  </h2>
                  <p className="mt-3 text-sm leading-7 text-slate-600">
                    {step.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 pb-16 lg:px-8">
          <div className="grid overflow-hidden rounded-[44px] bg-white shadow-[0_24px_100px_-44px_rgba(15,23,42,0.45)] lg:grid-cols-[0.9fr_1.1fr]">
            <div className="bg-[#001736] p-8 text-white lg:p-10">
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-cyan-200">
                {content.process.boundaryEyebrow}
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
                {content.process.boundaryTitle}
              </h2>
              <p className="mt-4 text-sm leading-7 text-slate-300">
                {content.process.boundaryDescription}
              </p>
            </div>
            <div className="grid gap-4 p-6 sm:grid-cols-2 lg:p-8">
              {content.process.boundaryPoints.map((item) => (
                <div
                  className="rounded-[28px] border border-slate-200 bg-slate-50 p-5"
                  key={item}
                >
                  <CheckCircle2 className="mb-4 size-5 text-[#002b5b]" />
                  <p className="text-sm leading-7 text-slate-700">{item}</p>
                </div>
              ))}
              <div className="rounded-[28px] border border-slate-200 bg-white p-5 sm:col-span-2">
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                  <p className="font-semibold text-slate-950">
                    {content.process.aiCta}
                  </p>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Button
                      asChild
                      className="rounded-full bg-[#001736] text-white hover:bg-[#002b5b]"
                    >
                      <Link href={PUBLIC_ROUTES.aiWorkspace}>
                        {content.process.aiCta}
                        <ArrowRight className="size-4" />
                      </Link>
                    </Button>
                    <Button asChild className="rounded-full" variant="outline">
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
    </div>
  );
}
