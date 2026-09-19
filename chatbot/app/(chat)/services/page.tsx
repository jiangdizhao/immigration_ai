"use client";

import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  FileText,
  Globe2,
  HeartHandshake,
  Landmark,
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getPublicPageContent,
  getPublicServiceCatalog,
  PUBLIC_ROUTES,
  type PublicServiceIcon,
} from "@/lib/public-content";

const serviceIcons: Record<PublicServiceIcon, LucideIcon> = {
  study: Globe2,
  skilled: Landmark,
  family: HeartHandshake,
  review: Scale,
  residence: ShieldCheck,
  complex: FileText,
};

export default function ServicesPage() {
  const { locale } = useSiteLocale();
  const content = getPublicPageContent(locale);
  const services = getPublicServiceCatalog(locale);

  return (
    <div className="min-h-dvh bg-[#f8f9fa] text-slate-900">
      <SiteHeader />
      <main>
        <section className="relative overflow-hidden bg-[#001736] px-5 py-16 text-white lg:px-8">
          <div
            aria-hidden="true"
            className="absolute inset-0 opacity-36"
            style={{
              backgroundImage:
                "url('/images/sovereign-nexus/city-hero-reference.png'), url('/images/sovereign-nexus/opera-house-hero.png')",
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,23,54,0.97),rgba(0,43,91,0.82),rgba(0,23,54,0.50))]" />
          <div className="relative mx-auto max-w-7xl">
            <Badge
              className="rounded-full border-white/15 bg-white/10 text-white hover:bg-white/10"
              variant="outline"
            >
              <Globe2 className="mr-2 size-3.5 text-cyan-200" />
              {content.services.eyebrow}
            </Badge>
            <h1 className="mt-5 max-w-4xl text-balance text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
              {content.services.title}
            </h1>
            <p className="mt-5 max-w-3xl text-base leading-8 text-slate-200">
              {content.services.description}
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-16 lg:px-8">
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {services.map((service) => {
              const Icon = serviceIcons[service.icon];
              return (
                <Card
                  className="rounded-[32px] border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl"
                  key={service.id}
                >
                  <CardHeader>
                    <div className="mb-4 inline-flex w-fit rounded-2xl bg-[#001736] p-3 text-white shadow-sm">
                      <Icon className="size-5" />
                    </div>
                    <CardTitle className="text-xl text-slate-950">
                      {service.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-5 text-sm leading-7 text-slate-600">
                    <p>{service.summary}</p>
                    <div className="space-y-2">
                      {service.bullets.map((item) => (
                        <div className="flex items-start gap-2" key={item}>
                          <ShieldCheck className="mt-1 size-4 shrink-0 text-[#002b5b]" />
                          <span>{item}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 pb-16 lg:px-8">
          <Card className="overflow-hidden rounded-[40px] border-0 bg-gradient-to-br from-[#001736] via-[#002b5b] to-[#1d0052] text-white shadow-[0_30px_110px_-40px_rgba(15,23,42,0.75)]">
            <CardContent className="grid gap-8 p-8 lg:grid-cols-[1.1fr_0.9fr] lg:p-10">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.22em] text-cyan-200">
                  {content.services.eyebrow}
                </p>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
                  {content.services.nextStep}
                </h2>
                <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-200">
                  {content.services.nextStepDescription}
                </p>
              </div>
              <div className="flex flex-col justify-center gap-3 sm:flex-row lg:flex-col">
                <Button
                  asChild
                  className="rounded-full bg-white text-[#001736] hover:bg-slate-100"
                >
                  <Link href={PUBLIC_ROUTES.aiWorkspace}>
                    {content.services.aiCta}
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
                <Button
                  asChild
                  className="rounded-full border-white/20 bg-white/10 text-white hover:bg-white/15"
                  variant="outline"
                >
                  <Link href={PUBLIC_ROUTES.contact}>
                    {content.services.consultationCta}
                    <MessageSquareMore className="size-4" />
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
