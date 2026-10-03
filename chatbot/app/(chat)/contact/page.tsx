"use client";

import {
  ArrowRight,
  CheckCircle2,
  MessageSquareMore,
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
import {
  getPublicPageContent,
  getPublicServiceCatalog,
  PUBLIC_ROUTES,
} from "@/lib/public-content";

export default function ContactPage() {
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
                {content.contact.aiCta}
              </PublicActionLink>
              <Button
                asChild
                className="h-11 rounded-full border-slate-300 bg-white px-5 text-[#092c52] hover:bg-slate-50"
                variant="outline"
              >
                <Link href={PUBLIC_ROUTES.consultationRequest}>
                  {content.contact.lawyerCta}
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </>
          }
          aside={
            <div className="rounded-[2rem] bg-[#092c52] p-6 text-white shadow-[0_30px_85px_-45px_rgba(9,44,82,0.8)] sm:p-8">
              <PublicEyebrow icon={MessageSquareMore} tone="light">
                {content.contact.howItWorksTitle}
              </PublicEyebrow>
              <ol className="mt-6 grid gap-4">
                {content.contact.howItWorks.map((step) => (
                  <li className="flex gap-3" key={step.id}>
                    <span className="font-mono text-xs text-cyan-200">
                      {step.number}
                    </span>
                    <div>
                      <h2 className="text-sm font-semibold text-white">
                        {step.title}
                      </h2>
                      <p className="mt-1 text-sm leading-6 text-slate-300">
                        {step.description}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          }
          description={content.contact.description}
          eyebrow={content.contact.eyebrow}
          icon={MessageSquareMore}
          title={content.contact.title}
          tone="amber"
        />

        <section className="bg-[#edf2f7] px-5 py-12 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <PublicSectionHeading
              description={content.contact.servicesDescription}
              eyebrow={content.contact.eyebrow}
              title={content.contact.servicesTitle}
              tone="navy"
            />
            <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {services.map((service, index) => (
                <li
                  className="flex min-w-0 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-[#092c52]"
                  key={service.id}
                >
                  <span className="font-mono text-xs text-slate-400">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span>{service.title}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="bg-[#f4f6f9] px-5 py-12 lg:px-8">
          <div className="mx-auto max-w-4xl">
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
        </section>
      </main>
      <SiteFooter />
    </PublicPageFrame>
  );
}
