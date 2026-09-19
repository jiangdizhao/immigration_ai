"use client";

import { ArrowUpRight, Globe2, MessageSquareMore } from "lucide-react";
import Link from "next/link";
import {
  PublicActionLink,
  PublicEditorialHero,
  PublicPageFrame,
  PublicSectionHeading,
  PublicServiceCard,
} from "@/components/public-page-primitives";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { useSiteLocale } from "@/components/site-locale-provider";
import { Button } from "@/components/ui/button";
import {
  getPublicPageContent,
  getPublicServiceCatalog,
  PUBLIC_ROUTES,
} from "@/lib/public-content";

export default function ServicesPage() {
  const { locale } = useSiteLocale();
  const content = getPublicPageContent(locale);
  const services = getPublicServiceCatalog(locale);

  return (
    <PublicPageFrame>
      <SiteHeader />
      <main>
        <PublicEditorialHero
          actions={
            <>
              <PublicActionLink href={PUBLIC_ROUTES.aiWorkspace} variant="navy">
                {content.services.aiCta}
              </PublicActionLink>
              <Button
                asChild
                className="h-11 rounded-full bg-white px-5 text-[#092c52] ring-1 ring-slate-300/80 hover:bg-slate-50"
                variant="outline"
              >
                <Link href={PUBLIC_ROUTES.contact}>
                  {content.services.consultationCta}
                  <ArrowUpRight className="size-4" />
                </Link>
              </Button>
            </>
          }
          aside={
            <div className="rounded-[2rem] bg-[#092c52] p-5 text-white shadow-[0_30px_85px_-45px_rgba(9,44,82,0.8)] sm:p-7">
              <div className="flex items-center justify-between gap-4 border-b border-white/15 pb-5">
                <div>
                  <p className="font-mono text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-cyan-200">
                    {content.services.eyebrow}
                  </p>
                  <p className="mt-2 text-xl font-semibold tracking-tight">
                    {content.services.title}
                  </p>
                </div>
                <div className="rounded-2xl bg-white/10 p-3 text-cyan-200 ring-1 ring-white/10">
                  <Globe2 className="size-5" />
                </div>
              </div>
              <div className="mt-5 grid gap-2">
                {services.map((service, index) => (
                  <div
                    className="flex min-w-0 items-center gap-3 rounded-2xl bg-white/[0.07] px-3 py-3 ring-1 ring-white/5"
                    key={service.id}
                  >
                    <span className="font-mono text-xs text-cyan-200/80">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="min-w-0 text-sm leading-6 text-slate-100">
                      {service.title}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-5 flex items-center gap-2 text-xs leading-5 text-slate-300">
                <MessageSquareMore className="size-4 shrink-0 text-violet-300" />
                {content.services.nextStepDescription}
              </div>
            </div>
          }
          description={content.services.description}
          eyebrow={content.services.eyebrow}
          icon={Globe2}
          title={content.services.title}
          tone="navy"
        />

        <section className="bg-[#f4f6f9] px-5 py-20 sm:py-24 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="grid gap-8 lg:grid-cols-[0.72fr_1.28fr] lg:items-end lg:gap-16">
              <PublicSectionHeading
                eyebrow={content.services.eyebrow}
                title={content.services.title}
                tone="navy"
              />
              <p className="max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
                {content.services.description}
              </p>
            </div>

            <div className="mt-12 grid gap-5 md:grid-cols-2 xl:grid-cols-12">
              {services.map((service, index) => (
                <PublicServiceCard
                  className={index < 2 ? "xl:col-span-6" : "xl:col-span-4"}
                  href={PUBLIC_ROUTES.services}
                  index={index + 1}
                  key={service.id}
                  service={service}
                  showBullets
                />
              ))}
            </div>
          </div>
        </section>

        <section className="bg-white px-5 pb-20 sm:pb-24 lg:px-8">
          <div className="mx-auto max-w-7xl rounded-[2.5rem] bg-gradient-to-br from-[#092c52] via-[#123f70] to-[#32156e] p-7 text-white shadow-[0_30px_95px_-45px_rgba(9,44,82,0.85)] sm:p-10 lg:p-12">
            <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
              <div>
                <p className="font-mono text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-cyan-200">
                  {content.services.eyebrow}
                </p>
                <h2 className="mt-4 max-w-2xl text-3xl font-semibold leading-tight tracking-[-0.04em] sm:text-4xl">
                  {content.services.nextStep}
                </h2>
                <p className="mt-5 max-w-2xl text-sm leading-7 text-slate-200 sm:text-base">
                  {content.services.nextStepDescription}
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row lg:flex-col lg:items-stretch">
                <PublicActionLink
                  href={PUBLIC_ROUTES.aiWorkspace}
                  variant="light"
                >
                  {content.services.aiCta}
                </PublicActionLink>
                <Button
                  asChild
                  className="h-11 rounded-full border-white/20 bg-white/10 text-white hover:bg-white/15"
                  variant="outline"
                >
                  <Link href={PUBLIC_ROUTES.contact}>
                    {content.services.consultationCta}
                    <ArrowUpRight className="size-4" />
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </PublicPageFrame>
  );
}
